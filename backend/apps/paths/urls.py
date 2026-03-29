from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    LearningPathItemViewSet,
    LearningPathViewSet,
    VideoDownloadView,
    VideoOnlineStreamView,
    VideoServeView,
    VideoTokenView,
)

# Router auto-generates:
#   GET/POST        /paths/
#   GET/PUT/DELETE  /paths/{id}/
router = DefaultRouter()
router.register(r'paths', LearningPathViewSet, basename='learningpath')

# Items are nested under a specific path.
# We handle this manually — the {path_pk} is forwarded to the ViewSet via kwargs.
item_list   = LearningPathItemViewSet.as_view({'get': 'list',   'post': 'create'})
item_detail = LearningPathItemViewSet.as_view({'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy'})

urlpatterns = [
    path('', include(router.urls)),
    path('paths/<int:path_pk>/items/',          item_list,   name='item-list'),
    path('paths/<int:path_pk>/items/<int:pk>/', item_detail, name='item-detail'),

    # Video endpoints
    # POST            /api/videos/token/{item_id}/         — get short-lived stream token
    # POST/GET/DELETE /api/videos/download/{item_id}/      — trigger, status, remove
    # GET             /api/videos/serve/{item_id}/         — stream local (downloaded) file
    # GET             /api/videos/online-stream/{item_id}/ — proxy YouTube stream in real-time
    path('videos/token/<int:item_id>/',         VideoTokenView.as_view(),        name='video-token'),
    path('videos/download/<int:item_id>/',      VideoDownloadView.as_view(),     name='video-download'),
    path('videos/serve/<int:item_id>/',         VideoServeView.as_view(),        name='video-serve'),
    path('videos/online-stream/<int:item_id>/', VideoOnlineStreamView.as_view(), name='video-online-stream'),
]
