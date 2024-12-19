# Generated by Django 3.2.4 on 2021-08-19 13:46

from django.db import migrations
from django.db.models import F, Func, TextField, Value


def add_entity_context(apps, schema_editor):
    Entity = apps.get_model("base", "Entity")

    split_key_po = Func(
        F("key"),
        Value("\x04"),
        Value(1),
        function="split_part",
        output_field=TextField(),
    )
    split_key_xliff = Func(
        F("key"),
        Value("\x04"),
        Value(2),
        function="split_part",
        output_field=TextField(),
    )

    Entity.objects.filter(resource__format="lang").update(context="")
    Entity.objects.filter(resource__format="po").update(context=split_key_po)
    Entity.objects.filter(resource__format="xliff").update(context=split_key_xliff)
    Entity.objects.exclude(resource__format__in=["lang", "po", "xliff"]).update(
        context=F("key")
    )


def remove_entity_context(apps, schema_editor):
    Entity = apps.get_model("base", "Entity")
    entities = Entity.objects.all().prefetch_related("resource")
    entities.update(context="")


class Migration(migrations.Migration):
    dependencies = [
        ("base", "0017_entity_context"),
    ]

    operations = [
        migrations.RunPython(
            code=add_entity_context,
            reverse_code=remove_entity_context,
        ),
    ]
