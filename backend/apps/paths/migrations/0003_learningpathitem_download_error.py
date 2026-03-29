from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('paths', '0002_learningpathitem_offline'),
    ]

    operations = [
        migrations.AddField(
            model_name='learningpathitem',
            name='download_error',
            field=models.CharField(blank=True, max_length=30),
        ),
    ]
