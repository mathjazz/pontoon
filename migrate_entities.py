#!/bin/env python
import os
from collections import defaultdict

import dotenv

dotenv.read_dotenv()

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pontoon.settings')

import django
django.setup()

from pontoon.base.models import Locale, Entity, EntityFilters


entities = {
    pk: defaultdict(dict) for pk in Entity.objects.values_list('pk', flat=True)
}

locale_codes = ['pl', 'en-GB', 'de', 'sl']
status_filters = ('missing', 'fuzzy', 'translated', 'suggested')
extra_filters = ('has-suggestions', 'unchanged')

for locale in Locale.objects.filter(code__in=locale_codes):
    for status in status_filters:
        print "Calculating {} {}".format(locale, status),Entity.for_project_locale(None,locale, statuses=status).count()
        for pk in Entity.for_project_locale(None,locale, statuses=status).values_list('pk', flat=True):
            entities[pk][locale.code]['status'] = status

    for extra in extra_filters:
        print "Calculating {} {}".format(locale, extra)
        for pk in Entity.for_project_locale(None,locale, extra=extra).values_list('pk', flat=True):
            entities[pk][locale.code][extra] = True

        for pk in entities:
            entities[pk][locale.code].setdefault(extra, False)

for entity_pk, locales in entities.items():
    if not locales:
        continue

    update_kwargs = {
    }
    for code, filters in locales.items():
        for filter_name, val in filters.items():
            update_kwargs['{}_{}'.format(code.lower().replace('-', '_'),  filter_name.replace('-', '_'))] = val

    print "Update", entity_pk
    EntityFilters.objects.filter(entity_id=entity_pk).update(**update_kwargs)