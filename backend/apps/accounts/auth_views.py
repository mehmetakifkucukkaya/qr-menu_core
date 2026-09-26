"""Authentication endpoints (login / logout / me / csrf).

Uses DRF SessionAuthentication with cookie-based sessions. POST endpoints
are CSRF-protected by Django's CSRF middleware (enforced by SessionAuth in
DRF when not exempt). Clients must first GET /api/v1/auth/csrf/ to obtain
the csrftoken cookie, then echo it in the ``X-CSRFToken`` header.
"""

from __future__ import annotations

from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import LoginSerializer, UserSerializer


class CSRFView(APIView):
    """GET → returns the CSRF token and sets the cookie via ``ensure_csrf_cookie``.

    Clients call this once before any POST (login, etc.) so they can echo
    the token in the ``X-CSRFToken`` header.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        token = get_token(request)
        return Response({"csrfToken": token})


class LoginView(APIView):
    """POST /api/v1/auth/login — email + password → 200 + session cookie."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]

        user = authenticate(request, username=email, password=password)
        if user is None or not user.is_active:
            return Response(
                {
                    "error": {
                        "code": "auth.invalid_credentials",
                        "message": "Email veya şifre hatalı.",
                    }
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        login(request, user)
        # Force session save so the cookie is set on the response.
        request.session.save()
        return Response(
            {
                "data": UserSerializer(user).data,
                "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")},
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    """POST /api/v1/auth/logout → 204 + session cleared."""

    def post(self, request: Request) -> Response:
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """GET /api/v1/me — current user JSON (auth required)."""

    def get(self, request: Request) -> Response:
        serializer = UserSerializer(request.user)
        return Response(
            {
                "data": serializer.data,
                "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")},
            }
        )
