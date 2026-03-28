from django.conf import settings
from django.db import models


class UserProgress(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='progress',
    )
    item = models.ForeignKey(
        'paths.LearningPathItem',
        on_delete=models.CASCADE,
        related_name='completions',
    )
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # A user can only mark the same item as complete once
        unique_together = [('user', 'item')]

    def __str__(self):
        return f'{self.user.email} completed "{self.item.title}"'
