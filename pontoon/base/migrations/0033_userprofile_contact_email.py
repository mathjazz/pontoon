# Generated by Django 3.2.14 on 2022-08-10 12:13

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("base", "0032_user_profile_visibility"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="contact_email",
            field=models.EmailField(
                blank=True,
                max_length=254,
                null=True,
                verbose_name="Contact email address",
            ),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="contact_email_verified",
            field=models.BooleanField(default=False),
        ),
    ]
