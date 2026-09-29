"""Authentication endpoints (login / logout / me / csrf / signup).

Uses DRF SessionAuthentication with cookie-based sessions. POST endpoints
are CSRF-protected by Django's CSRF middleware (enforced by SessionAuth in
DRF when not exempt). Clients must first GET /api/v1/auth/csrf/ to obtain
the csrftoken cookie, then echo it in the ``X-CSRFToken`` header.
"""

from __future__ import annotations

from django.contrib.auth import authenticate, login, logout
from django.db import transaction
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.models import Membership, MembershipRole, User
from apps.billing.constants import BASIC, default_features
from apps.billing.models import PlanSettings
from apps.organizations.models import Organization
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


# ---------------------------------------------------------------------------
# Sprint C1 — Self-serve signup + slug availability
# ---------------------------------------------------------------------------


class SlugAvailabilityView(APIView):
    """``GET /api/v1/auth/check-slug/?slug=<value>``.

    Returns ``{slug, available, reason?}``. Used by the wizard's
    real-time slug availability check (300ms debounce). AllowAny —
    enumeration is safe (we don't reveal whether an email is taken,
    just whether a slug string is free).
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        from .serializers import SlugAvailabilitySerializer

        slug = (request.query_params.get("slug") or "").strip().lower()
        if not slug:
            return Response(
                {
                    "data": {"slug": "", "available": False, "reason": "empty"},
                    "meta": {},
                }
            )

        reserved = {"admin", "api", "www", "static", "media", "signup", "docs", "auth"}
        if slug in reserved:
            payload = {"slug": slug, "available": False, "reason": "reserved"}
        elif not SlugAvailabilityView._SLUG_RE.match(slug):
            payload = {"slug": slug, "available": False, "reason": "invalid"}
        else:
            from apps.organizations.models import Organization

            taken = Organization.objects.filter(slug=slug).exists()
            payload = {"slug": slug, "available": not taken, "reason": "taken" if taken else ""}

        return Response({"data": payload, "meta": {}})


# Static regex reuse from serializer (kept inline to avoid the import dance
# at module load — the serializer's regex is the source of truth, this
# is just a fast pre-check).
SlugAvailabilityView._SLUG_RE = __import__("re").compile(
    r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$"
)


class SignupView(APIView):
    """``POST /api/v1/auth/signup/`` — Sprint C1 self-serve onboarding step 1.

    Body::

        {
          "email":             "owner@mycafe.example",
          "password":          "...",
          "full_name":         "Cafe Owner",
          "business_name":     "My Cafe",
          "slug":              "my-cafe",
          "default_locale":    "tr",
          "supported_locales": ["tr", "en"],
          "currency":          "TRY"
        }

    Atomic transaction creates: ``User`` + ``Organization`` +
    ``Membership(OWNER)`` + ``PlanSettings(BASIC)``. After commit we
    auto-login so the wizard's subsequent calls (POST
    ``/onboarding/complete/``) carry a valid session cookie.

    AllowAny + CSRF exempt — there is no session yet at signup time.
    Throttle: ``signup`` scope (10/hour/IP) via ``ScopedRateThrottle``
    to slow account-creation spam.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "signup"

    @transaction.atomic
    def post(self, request: Request) -> Response:
        from .serializers import SignupResponseSerializer, SignupSerializer

        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # 1. Create User.
        user = User.objects.create_user(
            email=data["email"],
            password=data["password"],
            full_name=data.get("full_name", "") or "",
            role="owner",
        )

        # 2. Create Organization.
        organization = Organization.objects.create(
            name=data["business_name"],
            slug=data["slug"],
            default_locale=data["default_locale"],
            supported_locales=data["supported_locales"],
            currency=data["currency"],
            is_active=True,
        )

        # 3. Membership(OWNER).
        membership = Membership.objects.create(
            user=user,
            organization=organization,
            role=MembershipRole.OWNER,
        )

        # 4. PlanSettings(BASIC) — auto-assign per Sprint B1 default.
        # Trial upgrade (Sprint C3) flips active_plan to 'ops' for 14 days.
        PlanSettings.objects.create(
            organization=organization,
            active_plan=BASIC,
            billing_notes="Self-serve signup — BASIC default.",
            **default_features(BASIC),
        )

        # 5. Audit — tenant_created (lazy migrate in Sprint C1 final commit).
        try:
            from apps.audit.services import record_event

            record_event(
                organization=organization,
                action="tenant_created",
                target_type="organization",
                target_id=organization.id,
                target_repr=f"Organization<{organization.slug}>",
                payload={
                    "owner_email": user.email,
                    "plan": BASIC,
                    "signup_source": "self_serve_wizard",
                },
            )
        except Exception:  # noqa: BLE001 — audit is best-effort
            pass

        # 6. Auto-login so the wizard's next call (onboarding/complete/)
        # carries the session cookie. We must NOT rollback here on
        # login failure (rare; e.g. user.is_active flipped) — the
        # tenant still exists, the operator can fix it manually.
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        request.session.save()

        payload = {
            "user": user,
            "organization_id": organization.id,
            "organization_slug": organization.slug,
            "organization_name": organization.name,
            "plan": BASIC,
            "membership_role": membership.role,
        }
        return Response(
            {
                "data": SignupResponseSerializer(payload).data,
                "meta": {},
            },
            status=status.HTTP_201_CREATED,
        )
