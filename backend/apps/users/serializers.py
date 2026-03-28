from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    # write_only=True: this field appears in input but NEVER in output (response JSON)
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ('id', 'email', 'username', 'password')

    def create(self, validated_data):
        # MUST use create_user(), not User(**data).save()
        # create_user() hashes the password; .save() would store it in plain text
        return User.objects.create_user(
            email=validated_data['email'],
            username=validated_data['username'],
            password=validated_data['password'],
        )


class UserSerializer(serializers.ModelSerializer):
    """Read-only representation of the current user (used in /me endpoint)."""

    class Meta:
        model = User
        fields = ('id', 'email', 'username')
        read_only_fields = fields
