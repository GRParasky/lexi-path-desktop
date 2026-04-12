from rest_framework import serializers
from .models import Notebook, NotebookPage


class NotebookPageSerializer(serializers.ModelSerializer):
    # Read-only convenience fields pulled from the related item — the frontend
    # needs these to render the page entry in the sidebar without a second request.
    item_title = serializers.CharField(source='learning_path_item.title', read_only=True)
    item_thumbnail = serializers.CharField(source='learning_path_item.thumbnail_url', read_only=True)
    item_video_id = serializers.CharField(source='learning_path_item.video_id', read_only=True)

    class Meta:
        model = NotebookPage
        fields = (
            'id', 'notebook', 'learning_path_item',
            'item_title', 'item_thumbnail', 'item_video_id',
            'content', 'created_at', 'updated_at',
        )
        read_only_fields = (
            'id', 'notebook', 'created_at', 'updated_at',
            'item_title', 'item_thumbnail', 'item_video_id',
        )


class NotebookSerializer(serializers.ModelSerializer):
    pages_count = serializers.SerializerMethodField()

    class Meta:
        model = Notebook
        fields = ('id', 'title', 'pages_count', 'created_at', 'updated_at')
        read_only_fields = ('created_at', 'updated_at')

    def get_pages_count(self, obj) -> int:
        return obj.pages.count()
