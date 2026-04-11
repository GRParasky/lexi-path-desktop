from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('paths', '0003_learningpathitem_download_error'),
    ]

    operations = [
        migrations.CreateModel(
            name='Notebook',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notebooks',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['title'],
            },
        ),
        migrations.CreateModel(
            name='NotebookPage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('content', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('notebook', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='pages',
                    to='notebooks.notebook',
                )),
                ('learning_path_item', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notebook_page',
                    to='paths.learningpathitem',
                )),
            ],
            options={
                'ordering': ['created_at'],
            },
        ),
    ]
