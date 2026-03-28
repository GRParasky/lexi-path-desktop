from django.urls import path
from .views import MarkCompleteView, PathProgressView

urlpatterns = [
    path('items/<int:item_id>/complete/', MarkCompleteView.as_view(), name='item-complete'),
    path('paths/<int:path_id>/',          PathProgressView.as_view(), name='path-progress'),
]
