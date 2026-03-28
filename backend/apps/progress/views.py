from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.paths.models import LearningPath, LearningPathItem
from .models import UserProgress


class MarkCompleteView(APIView):
    """
    POST   /api/progress/items/{item_id}/complete/  → mark complete
    DELETE /api/progress/items/{item_id}/complete/  → unmark (toggle off)
    """
    permission_classes = [IsAuthenticated]

    def _get_item(self, item_id, user):
        """
        Fetch item and verify the requesting user owns its parent path.
        Raises a 404-style error if not found or not authorised.
        """
        try:
            return LearningPathItem.objects.get(
                pk=item_id,
                learning_path__created_by=user,
            )
        except LearningPathItem.DoesNotExist:
            return None

    def post(self, request, item_id):
        item = self._get_item(item_id, request.user)
        if item is None:
            return Response(
                {'detail': 'Item not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # get_or_create returns (instance, created_bool)
        # If already complete, created=False and we just return 200 silently
        _progress, created = UserProgress.objects.get_or_create(
            user=request.user,
            item=item,
        )
        status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response({'completed': True}, status=status_code)

    def delete(self, request, item_id):
        item = self._get_item(item_id, request.user)
        if item is None:
            return Response(
                {'detail': 'Item not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        deleted, _ = UserProgress.objects.filter(
            user=request.user, item=item
        ).delete()
        if deleted:
            return Response({'completed': False}, status=status.HTTP_200_OK)
        return Response(
            {'detail': 'Item was not marked as complete.'},
            status=status.HTTP_404_NOT_FOUND,
        )


class PathProgressView(APIView):
    """
    GET /api/progress/paths/{path_id}/
    Returns completed item IDs and overall progress percentage.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, path_id):
        try:
            path = LearningPath.objects.get(pk=path_id, created_by=request.user)
        except LearningPath.DoesNotExist:
            return Response(
                {'detail': 'Path not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        total = path.items.count()
        if total == 0:
            return Response({'completed_items': [], 'total': 0, 'percentage': 0})

        completed_ids = list(
            UserProgress.objects.filter(
                user=request.user,
                item__learning_path=path,
            ).values_list('item_id', flat=True)
        )

        percentage = round(len(completed_ids) / total * 100)
        return Response({
            'completed_items': completed_ids,
            'total': total,
            'percentage': percentage,
        })
