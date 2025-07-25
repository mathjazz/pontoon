from notifications.signals import notify

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.datastructures import MultiValueDictKeyError
from django.views.decorators.http import require_POST

from pontoon.actionlog.models import ActionLog
from pontoon.actionlog.utils import log_action
from pontoon.base import utils
from pontoon.base.models import (
    TranslatedResource,
    Translation,
)
from pontoon.checks.libraries import run_checks
from pontoon.checks.utils import are_blocking_checks
from pontoon.messaging.notifications import send_badge_notification
from pontoon.translations import forms


def _add_badge_data(response_data, user, badge_name, badge_level):
    response_data["badge_update"] = {
        "name": badge_name,
        "level": badge_level,
    }
    send_badge_notification(
        user,
        badge_name,
        badge_level,
    )


@require_POST
@utils.require_AJAX
@login_required(redirect_field_name="", login_url="/403")
@transaction.atomic
def create_translation(request):
    """
    Create a new translation.
    """
    form = forms.CreateTranslationForm(request.POST)

    if not form.is_valid():
        problems = []
        for field, errors in form.errors.items():
            problems.append(
                'Error validating field `{}`: "{}"'.format(field, " ".join(errors))
            )
        return JsonResponse(
            {"status": False, "message": "\n".join(problems)}, status=400
        )

    entity = form.cleaned_data["entity"]
    string = form.cleaned_data["translation"]
    locale = form.cleaned_data["locale"]
    original = form.cleaned_data["original"]
    ignore_warnings = form.cleaned_data["ignore_warnings"]
    approve = form.cleaned_data["approve"]
    force_suggestions = form.cleaned_data["force_suggestions"]
    paths = form.cleaned_data["paths"]
    machinery_sources = form.cleaned_data["machinery_sources"]

    project = entity.resource.project

    # Read-only translations cannot saved
    if utils.readonly_exists(project, locale):
        return JsonResponse(
            {
                "status": False,
                "message": "Forbidden: This string is in read-only mode.",
            },
            status=403,
        )

    translations = Translation.objects.filter(entity=entity, locale=locale)

    same_translations = translations.filter(string=string)

    # If same translation exists in the DB, don't save it again.
    if same_translations:
        return JsonResponse({"status": False, "same": True})

    # Look for failed checks.
    # Checks are disabled for the tutorial.
    use_checks = project.slug != "tutorial"
    user = request.user

    failed_checks = None
    if use_checks:
        failed_checks = run_checks(
            entity,
            locale.code,
            original,
            string,
            user.profile.quality_checks,
        )
        if are_blocking_checks(failed_checks, ignore_warnings):
            return JsonResponse({"status": False, "failedChecks": failed_checks})

    now = timezone.now()
    can_translate = user.can_translate(project=project, locale=locale) and (
        not force_suggestions or approve
    )

    translation = Translation(
        entity=entity,
        locale=locale,
        string=string,
        user=user,
        date=now,
        approved=can_translate,
        machinery_sources=machinery_sources,
    )

    if can_translate:
        translation.approved_user = user
        translation.approved_date = now

    translation.save(failed_checks=failed_checks)

    log_action(ActionLog.ActionType.TRANSLATION_CREATED, user, translation=translation)

    if translations:
        translation = entity.reset_active_translation(locale=locale)

    # When user makes their first contribution to the team, notify team managers
    first_contribution = (
        not project.system_project
        and user != project.contact
        and user.has_one_contribution(locale)
    )
    if first_contribution:
        description = render_to_string(
            "messaging/notifications/new_contributor.html",
            {
                "entity": entity,
                "locale": locale,
                "project": project,
                "user": user,
            },
        )

        for manager in locale.managers_group.user_set.filter(
            profile__new_contributor_notifications=True
        ):
            notify.send(
                sender=manager,
                recipient=manager,
                verb="has reviewed suggestions",  # Triggers render of description only
                description=description,
                category="new_contributor",
            )

    response_data = {
        "status": True,
        "translation": translation.serialize(),
        "stats": TranslatedResource.objects.query_stats(project, paths, locale),
    }

    # Send Translation Champion Badge notification information
    translation_count = user.badges_translation_count
    if translation_count in settings.BADGES_TRANSLATION_THRESHOLDS:
        badge_name = "Translation Champion"
        badge_level = (
            settings.BADGES_TRANSLATION_THRESHOLDS.index(translation_count) + 1
        )
        _add_badge_data(response_data, user, badge_name, badge_level)

    return JsonResponse(response_data)


@utils.require_AJAX
@login_required(redirect_field_name="", login_url="/403")
@transaction.atomic
def delete_translation(request):
    """Delete given translation."""
    try:
        translation_id = request.POST["translation"]
    except MultiValueDictKeyError as e:
        return JsonResponse(
            {"status": False, "message": f"Bad Request: {e}"},
            status=400,
        )

    translation = get_object_or_404(Translation, pk=translation_id)
    entity = translation.entity
    project = entity.resource.project
    locale = translation.locale

    # Read-only translations cannot be deleted
    if utils.readonly_exists(project, locale):
        return JsonResponse(
            {
                "status": False,
                "message": "Forbidden: This string is in read-only mode.",
            },
            status=403,
        )

    # Only privileged users or authors can delete translations
    if not translation.rejected or not (
        request.user.can_translate(locale, project) or request.user == translation.user
    ):
        return JsonResponse(
            {
                "status": False,
                "message": "Forbidden: You can't delete this translation.",
            },
            status=403,
        )

    translation.delete()

    log_action(
        ActionLog.ActionType.TRANSLATION_DELETED,
        request.user,
        entity=entity,
        locale=locale,
    )

    return JsonResponse({"status": True})


@utils.require_AJAX
@login_required(redirect_field_name="", login_url="/403")
@transaction.atomic
def approve_translation(request):
    """Approve given translation."""
    try:
        t = request.POST["translation"]
        ignore_warnings = request.POST.get("ignore_warnings", "false") == "true"
        paths = request.POST.getlist("paths[]")
    except MultiValueDictKeyError as e:
        return JsonResponse(
            {"status": False, "message": f"Bad Request: {e}"},
            status=400,
        )

    translation = get_object_or_404(Translation, pk=t)
    entity = translation.entity
    project = entity.resource.project
    locale = translation.locale
    user = request.user

    # Read-only translations cannot be approved
    if utils.readonly_exists(project, locale):
        return JsonResponse(
            {
                "status": False,
                "message": "Forbidden: This string is in read-only mode.",
            },
            status=403,
        )

    if translation.approved:
        return JsonResponse(
            {
                "status": False,
                "message": "Forbidden: This translation is already approved.",
            },
            status=403,
        )

    # Only privileged users can approve translations
    if not user.can_translate(locale, project):
        return JsonResponse(
            {
                "status": False,
                "message": "Forbidden: You don't have permission to approve this translation.",
            },
            status=403,
        )

    # Check for errors.
    # Checks are disabled for the tutorial.
    use_checks = project.slug != "tutorial"

    if use_checks:
        failed_checks = run_checks(
            entity,
            locale.code,
            entity.string,
            translation.string,
            user.profile.quality_checks,
        )

        if are_blocking_checks(failed_checks, ignore_warnings):
            return JsonResponse(
                {"string": translation.string, "failedChecks": failed_checks}
            )

    translation.approve(user)

    log_action(ActionLog.ActionType.TRANSLATION_APPROVED, user, translation=translation)

    active_translation = translation.entity.reset_active_translation(locale=locale)

    response_data = {
        "translation": active_translation.serialize(),
        "stats": TranslatedResource.objects.query_stats(project, paths, locale),
    }

    # Send Review Master Badge notification information
    review_count = user.badges_review_count
    if review_count in settings.BADGES_REVIEW_THRESHOLDS:
        badge_name = "Review Master"
        badge_level = settings.BADGES_REVIEW_THRESHOLDS.index(review_count) + 1
        _add_badge_data(response_data, user, badge_name, badge_level)

    return JsonResponse(response_data)


@utils.require_AJAX
@login_required(redirect_field_name="", login_url="/403")
@transaction.atomic
def unapprove_translation(request):
    """Unapprove given translation."""
    try:
        t = request.POST["translation"]
        paths = request.POST.getlist("paths[]")
    except MultiValueDictKeyError as e:
        return JsonResponse(
            {"status": False, "message": f"Bad Request: {e}"},
            status=400,
        )

    translation = get_object_or_404(Translation, pk=t)
    project = translation.entity.resource.project
    locale = translation.locale

    # Read-only translations cannot be un-approved
    if utils.readonly_exists(project, locale):
        return JsonResponse(
            {
                "status": False,
                "message": "Forbidden: This string is in read-only mode.",
            },
            status=403,
        )

    # Only privileged users or authors can un-approve translations
    if not translation.approved or not (
        request.user.can_translate(locale, project) or request.user == translation.user
    ):
        return JsonResponse(
            {
                "status": False,
                "message": "Forbidden: You can't unapprove this translation.",
            },
            status=403,
        )

    translation.unapprove(request.user)

    log_action(
        ActionLog.ActionType.TRANSLATION_UNAPPROVED,
        request.user,
        translation=translation,
    )

    active_translation = translation.entity.reset_active_translation(locale=locale)

    return JsonResponse(
        {
            "translation": active_translation.serialize(),
            "stats": TranslatedResource.objects.query_stats(project, paths, locale),
        }
    )


@utils.require_AJAX
@login_required(redirect_field_name="", login_url="/403")
@transaction.atomic
def reject_translation(request):
    """Reject given translation."""
    try:
        t = request.POST["translation"]
        paths = request.POST.getlist("paths[]")
    except MultiValueDictKeyError as e:
        return JsonResponse(
            {"status": False, "message": f"Bad Request: {e}"},
            status=400,
        )

    translation = get_object_or_404(Translation, pk=t)
    project = translation.entity.resource.project
    locale = translation.locale

    # Read-only translations cannot be rejected
    if utils.readonly_exists(project, locale):
        return JsonResponse(
            {
                "status": False,
                "message": "Forbidden: This string is in read-only mode.",
            },
            status=403,
        )

    # Non-privileged users can only reject own unapproved translations
    if not request.user.can_translate(locale, project):
        if translation.user == request.user:
            if translation.approved is True:
                return JsonResponse(
                    {
                        "status": False,
                        "message": "Forbidden: You can't reject approved translations.",
                    },
                    status=403,
                )
        else:
            return JsonResponse(
                {
                    "status": False,
                    "message": "Forbidden: You can't reject translations from other users.",
                },
                status=403,
            )

    translation.reject(request.user)

    log_action(
        ActionLog.ActionType.TRANSLATION_REJECTED, request.user, translation=translation
    )

    active_translation = translation.entity.reset_active_translation(locale=locale)

    response_data = {
        "translation": active_translation.serialize(),
        "stats": TranslatedResource.objects.query_stats(project, paths, locale),
    }

    # Send Review Master Badge notification information
    review_count = request.user.badges_review_count
    if review_count in settings.BADGES_REVIEW_THRESHOLDS:
        badge_name = "Review Master"
        badge_level = settings.BADGES_REVIEW_THRESHOLDS.index(review_count) + 1
        _add_badge_data(response_data, request.user, badge_name, badge_level)

    return JsonResponse(response_data)


@utils.require_AJAX
@login_required(redirect_field_name="", login_url="/403")
@transaction.atomic
def unreject_translation(request):
    """Unreject given translation."""
    try:
        t = request.POST["translation"]
        paths = request.POST.getlist("paths[]")
    except MultiValueDictKeyError as e:
        return JsonResponse(
            {"status": False, "message": f"Bad Request: {e}"},
            status=400,
        )

    translation = get_object_or_404(Translation, pk=t)
    project = translation.entity.resource.project
    locale = translation.locale

    # Read-only translations cannot be un-rejected
    if utils.readonly_exists(project, locale):
        return JsonResponse(
            {
                "status": False,
                "message": "Forbidden: This string is in read-only mode.",
            },
            status=403,
        )

    # Only privileged users or authors can un-reject translations
    if not translation.rejected or not (
        request.user.can_translate(locale, project) or request.user == translation.user
    ):
        return JsonResponse(
            {
                "status": False,
                "message": "Forbidden: You can't unreject this translation.",
            },
            status=403,
        )

    translation.unreject(request.user)

    log_action(
        ActionLog.ActionType.TRANSLATION_UNREJECTED,
        request.user,
        translation=translation,
    )

    active_translation = translation.entity.reset_active_translation(locale=locale)

    return JsonResponse(
        {
            "translation": active_translation.serialize(),
            "stats": TranslatedResource.objects.query_stats(project, paths, locale),
        }
    )
