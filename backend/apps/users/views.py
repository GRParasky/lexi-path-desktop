from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import RegisterSerializer, UserSerializer

User = get_user_model()


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class AutoLoginView(APIView):
    """
    Desktop-only endpoint. No password required.

    Gets or creates the single local desktop user and returns a JWT token
    pair. The frontend calls this on startup so the user never sees a
    login screen. Safe because ALLOWED_HOSTS restricts access to localhost.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        user, _ = User.objects.get_or_create(
            username='desktop',
            defaults={'email': 'desktop@local', 'is_active': True},
        )
        refresh = RefreshToken.for_user(user)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        })
