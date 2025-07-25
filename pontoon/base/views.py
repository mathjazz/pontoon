import json
import logging
import re

from collections import defaultdict
from datetime import datetime
from urllib.parse import urlparse

from notifications.signals import notify

from django.conf import settings
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.core.paginator import EmptyPage, Paginator
from django.db import transaction
from django.db.models import F, Prefetch, Q
from django.http import (
    Http404,
    HttpResponse,
    HttpResponseForbidden,
    HttpResponseRedirect,
    JsonResponse,
    StreamingHttpResponse,
)
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
from django.utils.datastructures import MultiValueDictKeyError
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import condition, require_POST
from django.views.generic.edit import FormView

from pontoon.actionlog.models import ActionLog
from pontoon.actionlog.utils import log_action
from pontoon.base import forms, utils
from pontoon.base.models import (
    Comment,
    Entity,
    Locale,
    Project,
    ProjectLocale,
    Resource,
    TranslatedResource,
    Translation,
    TranslationMemoryEntry,
)
from pontoon.base.templatetags.helpers import provider_login_url
from pontoon.checks.libraries import run_checks
from pontoon.checks.utils import are_blocking_checks


log = logging.getLogger(__name__)


# TRANSLATE VIEWs


def translate_locale_agnostic(request, slug, part):
    """Locale Agnostic Translate view."""
    user = request.user
    query = urlparse(request.get_full_path()).query
    query = "?%s" % query if query else ""

    if slug.lower() == "all-projects":
        project_locales = Locale.objects.available()
    else:
        project = get_object_or_404(
            Project.objects.visible_for(request.user).available(), slug=slug
        )
        project_locales = project.locales

    if user.is_authenticated:
        locale = user.profile.custom_homepage

        if locale and project_locales.filter(code=locale).exists():
            path = reverse(
                "pontoon.translate",
                kwargs=dict(project=slug, locale=locale, resource=part),
            )
            return redirect(f"{path}{query}")

    locale = utils.get_project_locale_from_request(request, project_locales)
    path = (
        reverse(
            "pontoon.translate", kwargs=dict(project=slug, locale=locale, resource=part)
        )
        if locale
        else reverse("pontoon.projects.project", kwargs=dict(slug=slug))
    )
    return redirect(f"{path}{query}")


@utils.require_AJAX
def locale_projects(request, locale):
    """Get active projects for locale."""
    locale = get_object_or_404(Locale, code=locale)

    return JsonResponse(locale.available_projects_list(request.user), safe=False)


@utils.require_AJAX
def locale_stats(request, locale):
    """Get locale stats used in All Resources part."""
    locale = get_object_or_404(Locale, code=locale)
    stats = TranslatedResource.objects.filter(locale=locale).string_stats(request.user)
    stats["title"] = "all-resources"
    return JsonResponse([stats], safe=False)


@utils.require_AJAX
def locale_project_parts(request, locale, slug):
    """Get locale-project pages/paths with stats."""

    try:
        locale = Locale.objects.get(code=locale)
        project = Project.objects.visible_for(request.user).get(slug=slug)
        tr = TranslatedResource.objects.filter(
            locale=locale, resource__project=project
        ).distinct()
        details = list(
            tr.annotate(
                title=F("resource__path"),
                total=F("total_strings"),
                pretranslated=F("pretranslated_strings"),
                errors=F("strings_with_errors"),
                warnings=F("strings_with_warnings"),
                unreviewed=F("unreviewed_strings"),
                approved=F("approved_strings"),
            )
            .order_by("title")
            .values(
                "title",
                "total",
                "pretranslated",
                "errors",
                "warnings",
                "unreviewed",
                "approved",
            )
        )
        all_res_stats = tr.string_stats(request.user, count_system_projects=True)
        all_res_stats["title"] = "all-resources"
        details.append(all_res_stats)
        return JsonResponse(details, safe=False)
    except (Locale.DoesNotExist, Project.DoesNotExist) as e:
        return JsonResponse(
            {"status": False, "message": f"Not Found: {e}"},
            status=404,
        )
    except ProjectLocale.DoesNotExist:
        return JsonResponse(
            {"status": False, "message": "Locale not enabled for selected project."},
            status=400,
        )


@utils.require_AJAX
def authors_and_time_range(request, locale, slug, part):
    locale = get_object_or_404(Locale, code=locale)
    project = get_object_or_404(
        Project.objects.visible_for(request.user).available(), slug=slug
    )
    paths = [part] if part != "all-resources" else None

    translations = Translation.for_locale_project_paths(locale, project, paths)

    return JsonResponse(
        {
            "authors": translations.authors(),
            "counts_per_minute": translations.counts_per_minute(),
        },
        safe=False,
    )


def _get_entities_list(locale, preferred_source_locale, project, form):
    """Return a specific list of entities, as defined by the `entity_ids` field of the form.

    This is used for batch editing.
    """
    entities = (
        Entity.objects.filter(pk__in=form.cleaned_data["entity_ids"])
        .distinct()
        .order_by("order")
    )

    return JsonResponse(
        {
            "entities": Entity.map_entities(locale, preferred_source_locale, entities),
            "stats": TranslatedResource.objects.query_stats(
                project, form.cleaned_data["paths"], locale
            ),
        },
        safe=False,
    )


def _get_paginated_entities(locale, preferred_source_locale, project, form, entities):
    """Return a paginated list of entities.

    This is used by the regular mode of the Translate page.
    """
    paginator = Paginator(entities, form.cleaned_data["limit"])
    page = form.cleaned_data["page"]

    try:
        entities_page = paginator.page(page)
    except EmptyPage:
        return JsonResponse({"has_next": False, "stats": {}})

    entities_to_map = entities_page.object_list
    requested_entity = form.cleaned_data["entity"] if page == 1 else None

    return JsonResponse(
        {
            "entities": Entity.map_entities(
                locale,
                preferred_source_locale,
                entities_to_map,
                requested_entity=requested_entity,
            ),
            "has_next": entities_page.has_next(),
            "stats": TranslatedResource.objects.query_stats(
                project, form.cleaned_data["paths"], locale
            ),
        },
        safe=False,
    )


@csrf_exempt
@require_POST
@utils.require_AJAX
def entities(request):
    """Get entities for the specified project, locale and paths."""
    form = forms.GetEntitiesForm(request.POST)
    if not form.is_valid():
        return JsonResponse(
            {
                "status": False,
                "message": "{error}".format(
                    error=form.errors.as_json(escape_html=True)
                ),
            },
            status=400,
        )

    locale = get_object_or_404(Locale, code=form.cleaned_data["locale"])

    preferred_source_locale = ""
    if request.user.is_authenticated:
        preferred_source_locale = request.user.profile.preferred_source_locale

    project_slug = form.cleaned_data["project"]
    if project_slug == "all-projects":
        project = Project(slug=project_slug)
    else:
        project = get_object_or_404(Project, slug=project_slug)

    # Only return entities with provided IDs (batch editing)
    if form.cleaned_data["entity_ids"]:
        return _get_entities_list(locale, preferred_source_locale, project, form)

    # `Entity.for_project_locale` only requires a subset of the fields the form contains. We thus
    # make a new dict with only the keys we want to pass to that function.
    restrict_to_keys = (
        "paths",
        "status",
        "search",
        "extra",
        "search_identifiers",
        "search_exclude_source_strings",
        "search_rejected_translations",
        "search_match_case",
        "search_match_whole_word",
        "time",
        "author",
        "review_time",
        "reviewer",
        "exclude_self_reviewed",
        "tag",
    )
    form_data = {
        k: form.cleaned_data[k] for k in restrict_to_keys if k in form.cleaned_data
    }

    try:
        entities = Entity.for_project_locale(request.user, project, locale, **form_data)
    except ValueError as error:
        return JsonResponse({"status": False, "message": f"{error}"}, status=500)

    # Only return a list of entity PKs (batch editing: select all)
    if form.cleaned_data["pk_only"]:
        return JsonResponse({"entity_pks": list(entities.values_list("pk", flat=True))})

    # Out-of-context view: paginate entities
    return _get_paginated_entities(
        locale, preferred_source_locale, project, form, entities
    )


def _serialize_translation_values(translation, preferred_values):
    serialized = {
        "locale": {
            "pk": translation["locale__pk"],
            "code": translation["locale__code"],
            "name": translation["locale__name"],
            "direction": translation["locale__direction"],
            "script": translation["locale__script"],
        },
        "translation": translation["string"],
    }

    if translation["locale__code"] in preferred_values:
        serialized["is_preferred"] = True

    return serialized


@utils.require_AJAX
def get_translations_from_other_locales(request):
    """Get entity translations for all but specified locale."""
    try:
        entity = int(request.GET["entity"])
        locale = request.GET["locale"]
    except (MultiValueDictKeyError, ValueError) as e:
        return JsonResponse(
            {"status": False, "message": f"Bad Request: {e}"},
            status=400,
        )

    entity = get_object_or_404(Entity, pk=entity)
    locale = get_object_or_404(Locale, code=locale)

    translations = (
        Translation.objects.filter(entity=entity, approved=True)
        .exclude(locale=locale)
        .order_by("locale__name")
    ).values(
        "locale__pk",
        "locale__code",
        "locale__name",
        "locale__direction",
        "locale__script",
        "string",
    )

    preferred_locales = []
    if request.user.is_authenticated:
        preferred_locales = request.user.profile.preferred_locales.values_list(
            "code", flat=True
        )

    payload = [
        _serialize_translation_values(translation, preferred_locales)
        for translation in translations
    ]

    return JsonResponse(payload, safe=False)


@utils.require_AJAX
def get_sibling_entities(request):
    """Get entities preceding and succeeding the current entity"""
    try:
        entity = int(request.GET["entity"])
        locale = request.GET["locale"]
    except (MultiValueDictKeyError, ValueError) as e:
        return JsonResponse(
            {"status": False, "message": f"Bad Request: {e}"},
            status=400,
        )

    entity = get_object_or_404(Entity, pk=entity)
    locale = get_object_or_404(Locale, code=locale)
    preferred_source_locale = ""
    if request.user.is_authenticated:
        preferred_source_locale = request.user.profile.preferred_source_locale

    entities = Entity.objects.filter(resource=entity.resource, obsolete=False).order_by(
        "order"
    )
    succeeding_entities = entities.filter(order__gt=entity.order)[:2]
    preceding_entities = entities.filter(order__lt=entity.order).order_by("-order")[:2]

    return JsonResponse(
        {
            "succeeding": Entity.map_entities(
                locale,
                preferred_source_locale,
                succeeding_entities,
                is_sibling=True,
            ),
            "preceding": Entity.map_entities(
                locale,
                preferred_source_locale,
                preceding_entities,
                is_sibling=True,
            ),
        },
        safe=False,
    )


@utils.require_AJAX
def get_translation_history(request):
    """Get history of translations of given entity to given locale."""
    try:
        entity = int(request.GET["entity"])
        locale = request.GET["locale"]
    except (MultiValueDictKeyError, ValueError) as e:
        return JsonResponse(
            {"status": False, "message": f"Bad Request: {e}"},
            status=400,
        )

    entity = get_object_or_404(Entity, pk=entity)
    locale = get_object_or_404(Locale, code=locale)
    project_contact = entity.resource.project.contact

    translations = (
        Translation.objects.filter(entity=entity, locale=locale)
        .prefetch_related(
            Prefetch(
                "comments",
                queryset=Comment.objects.prefetch_related("author").order_by(
                    "timestamp"
                ),
            ),
            "user",
            "approved_user",
            "rejected_user",
            "errors",
            "warnings",
        )
        .order_by("-active", "rejected", "-date")
    )

    payload = []

    for t in translations:
        u = t.user or User(username="Imported", first_name="Imported", email="imported")
        translation_dict = t.serialize()
        translation_dict.update(
            {
                "user": u.name_or_email,
                "uid": u.id,
                "username": u.username,
                "user_gravatar_url_small": u.gravatar_url(88),
                "user_banner": u.banner(locale, project_contact),
                "date": t.date,
                "approved_user": User.display_name_or_blank(t.approved_user),
                "approved_date": t.approved_date,
                "rejected_user": User.display_name_or_blank(t.rejected_user),
                "rejected_date": t.rejected_date,
                "comments": [c.serialize(project_contact) for c in t.comments.all()],
                "machinery_sources": t.machinery_sources_values,
            }
        )
        payload.append(translation_dict)

    return JsonResponse(payload, safe=False)


@utils.require_AJAX
def get_team_comments(request):
    """Get team comments for given locale."""
    try:
        entity = int(request.GET["entity"])
        locale = request.GET["locale"]
    except (MultiValueDictKeyError, ValueError) as e:
        return JsonResponse(
            {"status": False, "message": f"Bad Request: {e}"},
            status=400,
        )

    entity = get_object_or_404(Entity, pk=entity)
    locale = get_object_or_404(Locale, code=locale)
    project_contact = entity.resource.project.contact

    comments = (
        Comment.objects.filter(entity=entity)
        .filter(Q(locale=locale) | Q(pinned=True))
        .order_by("timestamp")
    )

    payload = [c.serialize(project_contact) for c in comments]

    return JsonResponse(payload, safe=False)


def _send_add_comment_notifications(user, comment, entity, locale, translation):
    # On translation comment, notify:
    #   - project-locale translators or locale translators
    #   - locale managers
    #   - authors of other translation comments in the thread
    #   - translation author
    #   - translation reviewers
    if translation:
        recipients = set(translation.comments.values_list("author__pk", flat=True))

        if translation.user:
            recipients.add(translation.user.pk)
        if translation.approved_user:
            recipients.add(translation.approved_user.pk)
        if translation.unapproved_user:
            recipients.add(translation.unapproved_user.pk)
        if translation.rejected_user:
            recipients.add(translation.rejected_user.pk)
        if translation.unrejected_user:
            recipients.add(translation.unrejected_user.pk)

    # On team comment, notify:
    #   - project-locale translators or locale translators
    #   - locale managers
    #   - authors of other team comments in the thread
    #   - authors of translation comments
    #   - translation authors
    #   - translation reviewers
    else:
        recipients = set()
        translations = Translation.objects.filter(entity=entity, locale=locale)

        recipients = recipients.union(
            Comment.objects.filter(entity=entity, locale=locale).values_list(
                "author__pk", flat=True
            )
        )

        recipients = recipients.union(
            Comment.objects.filter(translation__in=translations).values_list(
                "author__pk", flat=True
            )
        )

        recipients = recipients.union(translations.values_list("user__pk", flat=True))
        recipients = recipients.union(
            translations.values_list("approved_user__pk", flat=True)
        )
        recipients = recipients.union(
            translations.values_list("unapproved_user__pk", flat=True)
        )
        recipients = recipients.union(
            translations.values_list("rejected_user__pk", flat=True)
        )
        recipients = recipients.union(
            translations.values_list("unrejected_user__pk", flat=True)
        )

    # In both cases, notify locale managers and translators
    project_locale = ProjectLocale.objects.get(
        project=entity.resource.project,
        locale=locale,
    )
    translators = []
    # Some projects (e.g. system projects) don't have translators group
    if project_locale.translators_group:
        # Only notify translators of the project if defined
        translators = project_locale.translators_group.user_set.values_list(
            "pk", flat=True
        )
    if not translators:
        translators = locale.translators_group.user_set.values_list("pk", flat=True)

    recipients = recipients.union(translators)
    recipients = recipients.union(
        locale.managers_group.user_set.values_list("pk", flat=True)
    )

    # Notify users, mentioned in a comment
    usernames = re.findall(r"<a href=\"\/contributors/([\w.@+-]+)/\">.+</a>", comment)
    recipients = recipients.union(
        User.objects.filter(username__in=usernames).values_list("pk", flat=True)
    )

    for recipient in User.objects.filter(
        pk__in=recipients,
        profile__comment_notifications=True,
    ).exclude(pk=user.pk):
        notify.send(
            user,
            recipient=recipient,
            verb="has added a comment in",
            action_object=locale,
            target=entity,
            description=comment,
            category="comment",
        )


def _send_pin_comment_notifications(user, comment):
    # When pinning a comment, notify:
    #   - authors of existing translations across all locales
    #   - reviewers of existing translations across all locales
    recipient_data = defaultdict(list)
    entity = comment.entity
    translations = Translation.objects.filter(entity=entity)

    for t in translations:
        for u in (
            t.user,
            t.approved_user,
            t.unapproved_user,
            t.rejected_user,
            t.unrejected_user,
        ):
            if u:
                recipient_data[u.pk].append(t.locale.pk)

    for recipient in User.objects.filter(pk__in=recipient_data.keys()).exclude(
        pk=user.pk
    ):
        # Send separate notification for each locale (which results in links to corresponding translate views)
        for locale in Locale.objects.filter(pk__in=recipient_data[recipient.pk]):
            notify.send(
                user,
                recipient=recipient,
                verb="has pinned a comment in",
                action_object=locale,
                target=entity,
                description=comment.content,
                category="comment",
            )


@require_POST
@utils.require_AJAX
@login_required(redirect_field_name="", login_url="/403")
@transaction.atomic
def add_comment(request):
    """Add a comment."""
    form = forms.AddCommentForm(request.POST)
    if not form.is_valid():
        return JsonResponse(
            {
                "status": False,
                "message": "{error}".format(
                    error=form.errors.as_json(escape_html=True)
                ),
            },
            status=400,
        )

    user = request.user
    comment = form.cleaned_data["comment"]
    translationId = form.cleaned_data["translation"]
    entity = get_object_or_404(Entity, pk=form.cleaned_data["entity"])
    locale = get_object_or_404(Locale, code=form.cleaned_data["locale"])

    if translationId:
        translation = get_object_or_404(Translation, pk=translationId)
    else:
        translation = None

    # Translation comment
    if translation:
        c = Comment(author=user, translation=translation, content=comment)
        log_action(ActionLog.ActionType.COMMENT_ADDED, user, translation=translation)

    # Team comment
    else:
        c = Comment(author=user, entity=entity, locale=locale, content=comment)
        log_action(
            ActionLog.ActionType.COMMENT_ADDED, user, entity=entity, locale=locale
        )

    c.save()

    _send_add_comment_notifications(user, comment, entity, locale, translation)

    return JsonResponse({"status": True})


@login_required(redirect_field_name="", login_url="/403")
@require_POST
@transaction.atomic
def pin_comment(request):
    """Update a comment as pinned"""
    if not request.user.has_perm("base.can_manage_project"):
        return JsonResponse(
            {"status": False, "message": "Forbidden: You can't pin comments."},
            status=403,
        )

    comment_id = request.POST.get("comment_id", None)
    if not comment_id:
        return JsonResponse({"status": False, "message": "Bad Request"}, status=400)

    comment = get_object_or_404(Comment, id=comment_id)

    comment.pinned = True
    comment.save()

    _send_pin_comment_notifications(request.user, comment)

    return JsonResponse({"status": True})


@login_required(redirect_field_name="", login_url="/403")
@require_POST
@transaction.atomic
def unpin_comment(request):
    """Update a comment as unpinned"""
    if not request.user.has_perm("base.can_manage_project"):
        return JsonResponse(
            {"status": False, "message": "Forbidden: You can't unpin comments."},
            status=403,
        )

    comment_id = request.POST.get("comment_id", None)
    if not comment_id:
        return JsonResponse({"status": False, "message": "Bad Request"}, status=400)

    comment = get_object_or_404(Comment, id=comment_id)

    comment.pinned = False
    comment.save()

    return JsonResponse({"status": True})


@utils.require_AJAX
@login_required(redirect_field_name="", login_url="/403")
def get_users(request):
    """Get all users."""
    users = (
        User.objects
        # Exclude system users
        .exclude(profile__system_user=True)
        # Exclude deleted users
        .exclude(email__regex=r"^deleted-user-(\w+)@example.com$")
        # Prefetch profile for retrieving username
        .prefetch_related("profile")
    )
    payload = []

    for u in users:
        payload.append(
            {
                "gravatar": u.gravatar_url(44),
                "name": u.name_or_email,
                "url": u.profile_url,
                "username": u.profile.username,
            }
        )

    return JsonResponse(payload, safe=False)


@utils.require_AJAX
def perform_checks(request):
    """Perform quality checks and return a list of any failed ones."""
    try:
        entity = request.POST["entity"]
        locale_code = request.POST["locale_code"]
        original = request.POST["original"]
        string = request.POST["string"]
        ignore_warnings = request.POST.get("ignore_warnings", "false") == "true"
    except MultiValueDictKeyError as e:
        return JsonResponse(
            {"status": False, "message": f"Bad Request: {e}"},
            status=400,
        )

    try:
        entity = Entity.objects.get(pk=entity)
    except Entity.DoesNotExist as e:
        return JsonResponse(
            {"status": False, "message": f"Bad Request: {e}"},
            status=400,
        )

    failed_checks = run_checks(
        entity,
        locale_code,
        original,
        string,
        request.user.profile.quality_checks,
    )

    if are_blocking_checks(failed_checks, ignore_warnings):
        return JsonResponse({"failedChecks": failed_checks})
    else:
        return JsonResponse({"status": True})


@transaction.atomic
def download_translations(request):
    """Download translated resource from its backing repository."""

    from pontoon.sync.utils import translations_target_url

    try:
        slug = request.GET["slug"]
        code = request.GET["code"]
        res_path = request.GET["part"]
    except MultiValueDictKeyError:
        raise Http404

    project = get_object_or_404(Project.objects.visible_for(request.user), slug=slug)
    locale = get_object_or_404(Locale, code=code)

    # FIXME This is a temporary hack, to be replaced by 04/2025 with proper downloads.
    url = translations_target_url(project, locale, res_path)
    if url and url.startswith("https://"):
        return HttpResponseRedirect(url)
    else:
        raise Http404


@login_required(redirect_field_name="", login_url="/403")
@require_POST
@transaction.atomic
def upload(request):
    """Upload translated resource."""
    try:
        slug = request.POST["slug"]
        code = request.POST["code"]
        res_path = request.POST["part"]
    except MultiValueDictKeyError:
        raise Http404

    locale = get_object_or_404(Locale, code=code)
    project = get_object_or_404(Project.objects.visible_for(request.user), slug=slug)
    if not request.user.can_translate(
        project=project, locale=locale
    ) or utils.readonly_exists(project, locale):
        return HttpResponseForbidden("You don't have permission to upload files.")
    get_object_or_404(Resource, project=project, path=res_path)

    form = forms.UploadFileForm(request.POST, request.FILES)
    if form.is_valid():
        from pontoon.sync.utils import import_uploaded_file

        upload = request.FILES["uploadfile"]
        try:
            badge_name, badge_level = import_uploaded_file(
                project, locale, res_path, upload, request.user
            )
            messages.success(request, "Translations updated from uploaded file.")
            if badge_name:
                message = json.dumps(
                    {
                        "name": badge_name,
                        "level": badge_level,
                    }
                )
                messages.info(request, message, extra_tags="badge")
        except Exception as error:
            messages.error(request, str(error))
    else:
        for errors in form.errors.values():
            for error in errors:
                messages.error(request, error)

    response = HttpResponse(content="", status=303)
    response["Location"] = reverse(
        "pontoon.translate",
        kwargs={"locale": code, "project": slug, "resource": res_path},
    )
    return response


@condition(etag_func=None)
def download_translation_memory(request, locale, slug):
    locale = get_object_or_404(Locale, code=locale)

    if slug.lower() == "all-projects":
        project_filter = Q()
    else:
        project = get_object_or_404(
            Project.objects.visible_for(request.user).available(), slug=slug
        )
        project_filter = Q(project=project)

    tm_entries = (
        TranslationMemoryEntry.objects.filter(project_filter)
        .filter(locale=locale, translation__isnull=False)
        .exclude(Q(source="") | Q(target=""))
        .exclude(translation__approved=False, translation__fuzzy=False)
    )
    filename = f"{locale.code}.{slug}.tmx"

    response = StreamingHttpResponse(
        utils.build_translation_memory_file(
            datetime.now(),
            locale.code,
            tm_entries.values_list(
                "entity__resource__path",
                "entity__key",
                "source",
                "target",
                "project__slug",
            ).order_by("project__slug", "source"),
        ),
        content_type="text/xml",
    )
    response["Content-Disposition"] = 'attachment; filename="{filename}"'.format(
        filename=filename
    )
    return response


@utils.require_AJAX
def user_data(request):
    user = request.user

    if not user.is_authenticated:
        if settings.AUTHENTICATION_METHOD == "django":
            login_url = reverse("standalone_login")
        else:
            login_url = provider_login_url(request)

        return JsonResponse({"is_authenticated": False, "login_url": login_url})

    if settings.AUTHENTICATION_METHOD == "django":
        logout_url = reverse("standalone_logout")
    else:
        logout_url = reverse("account_logout")

    return JsonResponse(
        {
            "is_authenticated": True,
            "is_admin": user.is_superuser,
            "is_pm": user.has_perm("base.can_manage_project"),
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "name_or_email": user.name_or_email,
            "username": user.username,
            "date_joined": user.date_joined,
            "contributor_for_locales": list(
                user.translation_set.values_list("locale__code", flat=True).distinct()
            ),
            "can_manage_locales": list(
                user.can_manage_locales.values_list("code", flat=True)
            ),
            "can_translate_locales": list(
                user.can_translate_locales.values_list("code", flat=True)
            ),
            "manager_for_locales": [loc.code for loc in user.manager_for_locales],
            "translator_for_locales": [loc.code for loc in user.translator_for_locales],
            "pm_for_projects": list(user.contact_for.values_list("slug", flat=True)),
            "translator_for_projects": user.translated_projects,
            "settings": {
                "quality_checks": user.profile.quality_checks,
                "force_suggestions": user.profile.force_suggestions,
            },
            "tour_status": user.profile.tour_status,
            "has_dismissed_addon_promotion": user.profile.has_dismissed_addon_promotion,
            "logout_url": logout_url,
            "gravatar_url_small": user.gravatar_url(88),
            "gravatar_url_big": user.gravatar_url(176),
            "notifications": user.serialized_notifications,
            "theme": user.profile.theme,
        }
    )


class AjaxFormView(FormView):
    """A form view that when the form is submitted, it will return a json
    response containing either an ``errors`` object with a bad response status
    if the form fails, or a ``result`` object supplied by the form's save
    method
    """

    @method_decorator(utils.require_AJAX)
    def get(self, *args, **kwargs):
        return super().get(*args, **kwargs)

    @method_decorator(utils.require_AJAX)
    def post(self, *args, **kwargs):
        return super().post(*args, **kwargs)

    def form_invalid(self, form):
        return JsonResponse(dict(errors=form.errors), status=400)

    def form_valid(self, form):
        return JsonResponse(dict(data=form.save()))


class AjaxFormPostView(AjaxFormView):
    """An Ajax form view that only allows POST requests"""

    def get(self, *args, **kwargs):
        raise Http404
