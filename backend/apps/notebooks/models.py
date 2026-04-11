from django.conf import settings
from django.db import models


class Notebook(models.Model):
    title = models.CharField(max_length=200)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notebooks',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return self.title


class NotebookPage(models.Model):
    notebook = models.ForeignKey(
        Notebook,
        on_delete=models.CASCADE,
        related_name='pages',
    )
    # OneToOneField enforces: one page per LearningPathItem, globally.
    # A LearningPathItem can have at most one NotebookPage regardless of notebook.
    learning_path_item = models.OneToOneField(
        'paths.LearningPathItem',
        on_delete=models.CASCADE,
        related_name='notebook_page',
    )
    # TipTap JSON document. Empty dict means the page exists but has no content yet.
    content = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.notebook.title} — {self.learning_path_item.title}'
