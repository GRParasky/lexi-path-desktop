from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model. Identical to Django's built-in User for now,
    but allows us to add fields later (avatar, bio, etc.) without migrations.
    """
    email = models.EmailField(unique=True)

    # We use email as the login identifier, not username
    USERNAME_FIELD = 'email'
    # username is still required by AbstractUser; keep it in REQUIRED_FIELDS
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return self.email
