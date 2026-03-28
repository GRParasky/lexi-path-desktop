import uuid
from django.conf import settings
from django.db import models


class LearningPath(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_public = models.BooleanField(default=False)
    # share_token: a UUID used in the public share URL — never shown in sequence
    share_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='learning_paths',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class LearningPathItem(models.Model):
    DOWNLOAD_NONE = 'none'
    DOWNLOAD_DOWNLOADING = 'downloading'
    DOWNLOAD_DONE = 'done'
    DOWNLOAD_ERROR = 'error'

    DOWNLOAD_STATUS_CHOICES = [
        (DOWNLOAD_NONE, 'Not downloaded'),
        (DOWNLOAD_DOWNLOADING, 'Downloading'),
        (DOWNLOAD_DONE, 'Downloaded'),
        (DOWNLOAD_ERROR, 'Error'),
    ]

    learning_path = models.ForeignKey(
        LearningPath,
        on_delete=models.CASCADE,
        related_name='items',
    )
    title = models.CharField(max_length=255)
    youtube_url = models.URLField()
    video_id = models.CharField(max_length=20)      # e.g. "dQw4w9WgXcQ"
    thumbnail_url = models.URLField(blank=True)
    position = models.PositiveIntegerField(default=0)  # 0-based ordering
    created_at = models.DateTimeField(auto_now_add=True)

    # Offline video fields
    # local_file_path stores the absolute path to the downloaded file on disk.
    # Empty string means no local file exists.
    local_file_path = models.CharField(max_length=500, blank=True)
    download_status = models.CharField(
        max_length=20,
        choices=DOWNLOAD_STATUS_CHOICES,
        default=DOWNLOAD_NONE,
    )

    class Meta:
        ordering = ['position']
        # Two items in the same path cannot share the same position
        unique_together = [('learning_path', 'position')]

    def __str__(self):
        return f'{self.learning_path.title} — {self.position}: {self.title}'
