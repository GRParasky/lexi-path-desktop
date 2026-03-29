from pathlib import Path

from rest_framework import serializers

from .models import LearningPath, LearningPathItem
from .utils import build_thumbnail_url, extract_youtube_video_id


class LearningPathItemSerializer(serializers.ModelSerializer):
    # Derived field: True only when the file actually exists on disk.
    # The frontend uses this to decide whether to show the offline player
    # or the YouTube embed — download_status alone isn't enough because
    # the file could have been deleted manually by the user.
    has_local_file = serializers.SerializerMethodField()

    class Meta:
        model = LearningPathItem
        fields = (
            'id', 'title', 'youtube_url', 'video_id',
            'thumbnail_url', 'position', 'created_at',
            'download_status', 'has_local_file',
        )
        read_only_fields = ('video_id', 'thumbnail_url', 'created_at', 'download_status', 'has_local_file')

    def get_has_local_file(self, obj) -> bool:
        return bool(obj.local_file_path and Path(obj.local_file_path).exists())

    def validate_youtube_url(self, value):
        """
        Field-level validation hook. DRF calls validate_<fieldname>()
        automatically during .is_valid(). Raise ValidationError to reject.
        """
        video_id = extract_youtube_video_id(value)
        if not video_id:
            raise serializers.ValidationError(
                'Not a valid YouTube URL. Supported: watch, youtu.be, embed, shorts.'
            )
        return value

    def create(self, validated_data):
        # Extract and inject video_id + thumbnail before hitting the DB
        video_id = extract_youtube_video_id(validated_data['youtube_url'])
        validated_data['video_id'] = video_id
        validated_data['thumbnail_url'] = build_thumbnail_url(video_id)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        new_url = validated_data.get('youtube_url')
        if new_url and new_url != instance.youtube_url:
            # Re-derive video identity fields from the new URL
            video_id = extract_youtube_video_id(new_url)
            validated_data['video_id'] = video_id
            validated_data['thumbnail_url'] = build_thumbnail_url(video_id)
            # The previously downloaded file (if any) belongs to the old video —
            # clear the reference so the frontend shows the correct state.
            # The file itself is left on disk; it becomes orphaned but harmless.
            instance.download_status = LearningPathItem.DOWNLOAD_NONE
            instance.local_file_path = ''
            # Clear the cached online stream URL so the next theater open
            # extracts a fresh URL for the new video.
            from django.core.cache import cache
            cache.delete(f'yt_online_url:{instance.pk}')
        return super().update(instance, validated_data)


class LearningPathSerializer(serializers.ModelSerializer):
    # Nested read: items are embedded in the path response
    items = LearningPathItemSerializer(many=True, read_only=True)
    # Expose the owner's email as a read-only field (not the FK integer)
    created_by = serializers.EmailField(source='created_by.email', read_only=True)

    class Meta:
        model = LearningPath
        fields = (
            'id', 'title', 'description', 'is_public',
            'share_token', 'created_by', 'items',
            'created_at', 'updated_at',
        )
        read_only_fields = ('share_token', 'created_by', 'created_at', 'updated_at')
