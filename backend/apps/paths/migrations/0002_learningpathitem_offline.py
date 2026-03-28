from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('paths', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='learningpathitem',
            name='local_file_path',
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name='learningpathitem',
            name='download_status',
            field=models.CharField(
                choices=[
                    ('none', 'Not downloaded'),
                    ('downloading', 'Downloading'),
                    ('done', 'Downloaded'),
                    ('error', 'Error'),
                ],
                default='none',
                max_length=20,
            ),
        ),
    ]
