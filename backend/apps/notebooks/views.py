from rest_framework import viewsets, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from .models import Notebook, NotebookPage
from .serializers import NotebookSerializer, NotebookPageSerializer


class NotebookViewSet(viewsets.ModelViewSet):
    serializer_class = NotebookSerializer
    permission_classes = [permissions.IsAuthenticated]
    # PUT is excluded — renaming via PATCH is sufficient and avoids requiring
    # all fields to be sent on every update.
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        return Notebook.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class NotebookPageViewSet(viewsets.ModelViewSet):
    serializer_class = NotebookPageSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def _get_notebook(self):
        return get_object_or_404(
            Notebook,
            pk=self.kwargs['notebook_pk'],
            user=self.request.user,
        )

    def get_queryset(self):
        return (
            NotebookPage.objects
            .filter(
                notebook__user=self.request.user,
                notebook_id=self.kwargs['notebook_pk'],
            )
            .select_related('learning_path_item')
        )

    def perform_create(self, serializer):
        notebook = self._get_notebook()
        serializer.save(notebook=notebook)


class PageByItemView(APIView):
    """
    GET /api/notebooks/pages/by-item/{item_id}/

    Returns the NotebookPage for a given LearningPathItem, or 404 if none exists.
    Used by the frontend to check whether a card already has a page before opening
    the editor — avoids a full notebook list fetch just for one card.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, item_id):
        page = get_object_or_404(
            NotebookPage.objects.select_related('learning_path_item'),
            learning_path_item_id=item_id,
            notebook__user=request.user,
        )
        return Response(NotebookPageSerializer(page).data)
