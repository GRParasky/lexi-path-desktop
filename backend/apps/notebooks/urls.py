from django.urls import path, include
from rest_framework.routers import SimpleRouter

from .views import NotebookViewSet, NotebookPageViewSet, PageByItemView

# /api/notebooks/          → list, create
# /api/notebooks/{pk}/     → retrieve, update, destroy
_notebook_router = SimpleRouter()
_notebook_router.register(r'notebooks', NotebookViewSet, basename='notebook')

# /api/notebooks/{notebook_pk}/pages/          → list, create
# /api/notebooks/{notebook_pk}/pages/{pk}/     → retrieve, update, destroy
_pages_router = SimpleRouter()
_pages_router.register(r'pages', NotebookPageViewSet, basename='notebook-page')

urlpatterns = [
    # Static segment comes first to prevent Django from trying to match
    # "pages" as an integer notebook_pk in the nested route below.
    path('notebooks/pages/by-item/<int:item_id>/', PageByItemView.as_view(), name='notebook-page-by-item'),
    path('', include(_notebook_router.urls)),
    path('notebooks/<int:notebook_pk>/', include(_pages_router.urls)),
]
