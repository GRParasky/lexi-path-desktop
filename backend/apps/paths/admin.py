from django.contrib import admin
from .models import LearningPath, LearningPathItem


class LearningPathItemInline(admin.TabularInline):
    model = LearningPathItem
    extra = 0
    fields = ('position', 'title', 'youtube_url', 'video_id')


@admin.register(LearningPath)
class LearningPathAdmin(admin.ModelAdmin):
    list_display = ('title', 'created_by', 'is_public', 'created_at')
    list_filter = ('is_public',)
    inlines = [LearningPathItemInline]


@admin.register(LearningPathItem)
class LearningPathItemAdmin(admin.ModelAdmin):
    list_display = ('title', 'learning_path', 'position', 'video_id')
