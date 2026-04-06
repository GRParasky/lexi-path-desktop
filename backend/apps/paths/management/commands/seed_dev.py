"""
Management command: seed_dev

Wipes all learning paths for the desktop user and recreates a fixed set of
paths and videos. Useful for testing UI changes, bugfixes, and new features
against a known, reproducible environment.

Usage:
    python manage.py seed_dev
    python manage.py seed_dev --reset    # same, but also clears download status

The desktop user (username='desktop') is created if it does not yet exist,
mirroring what AutoLoginView does on first app launch.
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from apps.paths.models import LearningPath, LearningPathItem

User = get_user_model()

# ---------------------------------------------------------------------------
# Seed data — mirrors the paths registered by the developer
# ---------------------------------------------------------------------------

PATHS = [
    {
        'title': 'German A1 (Basics)',
        'description': 'Learning Path for beginners in German language',
        'is_public': False,
        'items': [
            {
                'title': 'The Alphabet | das Alphabet',
                'youtube_url': 'https://youtu.be/HCytWm3RC9g?t=24',
                'video_id': 'HCytWm3RC9g',
                'thumbnail_url': 'https://img.youtube.com/vi/HCytWm3RC9g/hqdefault.jpg',
            },
            {
                'title': 'Numbers | Zahlen | 0-20',
                'youtube_url': 'https://youtu.be/d54ioeKA-jc',
                'video_id': 'd54ioeKA-jc',
                'thumbnail_url': 'https://img.youtube.com/vi/d54ioeKA-jc/hqdefault.jpg',
            },
            {
                'title': 'Numbers | Zahlen | 21-100',
                'youtube_url': 'https://youtu.be/d54ioeKA-jc',
                'video_id': 'd54ioeKA-jc',
                'thumbnail_url': 'https://img.youtube.com/vi/d54ioeKA-jc/hqdefault.jpg',
            },
            {
                'title': 'Common Phrases',
                'youtube_url': 'https://youtu.be/S8ukFF6SdGk',
                'video_id': 'S8ukFF6SdGk',
                'thumbnail_url': 'https://img.youtube.com/vi/S8ukFF6SdGk/hqdefault.jpg',
            },
            {
                'title': 'Greetings | Begrüßungen',
                'youtube_url': 'https://youtu.be/RuGmc662HDg',
                'video_id': 'RuGmc662HDg',
                'thumbnail_url': 'https://img.youtube.com/vi/RuGmc662HDg/hqdefault.jpg',
            },
            {
                'title': 'Introducing yourself in German | sich vorstellen',
                'youtube_url': 'https://youtu.be/RElBVZ1Wke0',
                'video_id': 'RElBVZ1Wke0',
                'thumbnail_url': 'https://img.youtube.com/vi/RElBVZ1Wke0/hqdefault.jpg',
            },
        ],
    },
    {
        'title': 'Spanish Reinforcement',
        'description': 'Spanish reinforcement classes for miscellaneous subjects',
        'is_public': False,
        'items': [
            {
                'title': 'Tech Gadgets in Spanish | #1',
                'youtube_url': 'https://www.youtube.com/watch?v=oMpUkNVrOBw',
                'video_id': 'oMpUkNVrOBw',
                'thumbnail_url': 'https://img.youtube.com/vi/oMpUkNVrOBw/hqdefault.jpg',
            },
            {
                'title': 'Tech Gadgets in Spanish | #2',
                'youtube_url': 'https://youtu.be/EWzPqJkGEwI',
                'video_id': 'EWzPqJkGEwI',
                'thumbnail_url': 'https://img.youtube.com/vi/EWzPqJkGEwI/hqdefault.jpg',
            },
            {
                'title': 'Verbs for Technology',
                'youtube_url': 'http://youtube.com/watch?v=tg7CiptBMOM',
                'video_id': 'tg7CiptBMOM',
                'thumbnail_url': 'https://img.youtube.com/vi/tg7CiptBMOM/hqdefault.jpg',
            },
        ],
    },
    {
        'title': 'Alemão Básico',
        'description': '',
        'is_public': False,
        'items': [
            {
                'title': 'Alfabeto Alemão',
                'youtube_url': 'https://youtu.be/Vc6UUeHKe0Y',
                'video_id': 'Vc6UUeHKe0Y',
                'thumbnail_url': 'https://img.youtube.com/vi/Vc6UUeHKe0Y/hqdefault.jpg',
            },
        ],
    },
]


class Command(BaseCommand):
    help = 'Wipe and reseed learning paths for the desktop user (dev/testing only)'

    def handle(self, *args, **options):
        # Get or create the desktop auto-login user
        user, created = User.objects.get_or_create(
            username='desktop',
            defaults={'email': 'desktop@local'},
        )
        if created:
            self.stdout.write('  Created desktop user')

        # Wipe all existing paths (and their items via CASCADE)
        deleted_count, _ = LearningPath.objects.filter(created_by=user).delete()
        if deleted_count:
            self.stdout.write(f'  Removed {deleted_count} existing path(s)')

        # Recreate from seed data
        for path_data in PATHS:
            items_data = path_data.pop('items')
            path = LearningPath.objects.create(created_by=user, **path_data)

            LearningPathItem.objects.bulk_create([
                LearningPathItem(
                    learning_path=path,
                    position=i,
                    **item,
                )
                for i, item in enumerate(items_data)
            ])

            self.stdout.write(
                f'  Created "{path.title}" ({len(items_data)} video(s))'
            )

        self.stdout.write(self.style.SUCCESS(
            f'\nDev seed complete — {len(PATHS)} paths loaded for user "{user.username}"'
        ))
