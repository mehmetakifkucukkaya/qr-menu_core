"""Authentication endpoints (login / logout / me / csrf / signup).

Uses DRF SessionAuthentication with cookie-based sessions. POST endpoints
are CSRF-protected by Django's CSRF middleware (enforced by SessionAuth in
DRF when not exempt). Clients must first GET /api/v1/auth/csrf/ to obtain
the csrftoken cookie, then echo it in the ``X-CSRFToken`` header.
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.billing.constants import BASIC
from apps.organizations.reserved import is_reserved
from rest_framework.views import APIView

from .serializers import LoginSerializer, UserSerializer
from .services import get_active_membership, resolve_membership_state, session_age_for


def _error(code: str, message: str, http_status: int) -> Response:
    return Response({"error": {"code": code, "message": message}}, status=http_status)


def _signup_closed() -> Response | None:
    """The 404 for the signup endpoints while SIGNUP_ENABLED is off."""
    if getattr(settings, "SIGNUP_ENABLED", False):
        return None
    return _error(
        "signup.disabled",
        "Kayıt şu an kapalı. Ajansınızla iletişime geçin.",
        status.HTTP_404_NOT_FOUND,
    )


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

        # A member of a suspended business, or an account that belongs to no
        # business at all, gets a clear answer instead of a half-working panel.
        # Platform admins (the agency) are not tied to one business.
        if not user.is_platform_admin:
            state, _ = resolve_membership_state(user)
            if state == "suspended":
                return _error(
                    "tenant.suspended",
                    "Hesabınız askıya alındı, ajansınızla iletişime geçin.",
                    status.HTTP_403_FORBIDDEN,
                )
            if state == "no_membership":
                return _error(
                    "auth.no_membership",
                    "Bu hesap bir işletmeye bağlı değil. Ajansınızla iletişime geçin.",
                    status.HTTP_403_FORBIDDEN,
                )

        login(request, user)
        membership = get_active_membership(user)
        request.session.set_expiry(session_age_for(membership.role if membership else None))
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


class PasswordChangeView(APIView):
    """POST /api/v1/auth/password/change — any signed-in user, any role.

    Body ``{"current_password": "...", "new_password": "..."}``. Used by the
    voluntary "Şifre değiştir" page and by the forced change after a temporary
    password. The current session stays signed in; other sessions are dropped
    by Django's session auth hash.
    """

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_change"

    def post(self, request: Request) -> Response:
        data = request.data if hasattr(request.data, "get") else {}
        current = data.get("current_password") or ""
        new = data.get("new_password") or ""
        user = request.user

        if not user.check_password(current):
            return _error(
                "auth.invalid_current_password",
                "Mevcut şifre hatalı.",
                status.HTTP_400_BAD_REQUEST,
            )
        if new == current:
            return _error(
                "auth.password_unchanged",
                "Yeni şifre mevcut şifreyle aynı olamaz.",
                status.HTTP_400_BAD_REQUEST,
            )
        try:
            validate_password(new, user)
        except DjangoValidationError as exc:
            return _error(
                "auth.password_invalid", " ".join(exc.messages), status.HTTP_400_BAD_REQUEST
            )

        user.set_password(new)
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])
        update_session_auth_hash(request, user)
        return Response(
            {"data": {"ok": True}, "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")}}
        )


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
        closed = _signup_closed()
        if closed is not None:
            return closed

        from .serializers import SlugAvailabilitySerializer

        slug = (request.query_params.get("slug") or "").strip().lower()
        if not slug:
            return Response(
                {
                    "data": {"slug": "", "available": False, "reason": "empty"},
                    "meta": {},
                }
            )

        if is_reserved(slug):
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
        closed = _signup_closed()
        if closed is not None:
            return closed

        from apps.onboarding.provisioning import ProvisioningError, provision_tenant
        from apps.onboarding.services import TRIAL_DAYS

        from .serializers import SignupResponseSerializer, SignupSerializer

        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # User + Organization + Membership(OWNER) + PlanSettings(BASIC, flipped
        # into the 14-day OPS trial) + the ``tenant_created`` audit event: one
        # service shared with the agency's create_tenant. The wizard makes the
        # menu and the first QR code later, so no starter content here.
        try:
            result = provision_tenant(
                name=data["business_name"],
                slug=data["slug"],
                owner_email=data["email"],
                owner_name=data.get("full_name", "") or "",
                owner_password=data["password"],
                plan=BASIC,
                trial_days=TRIAL_DAYS,
                default_locale=data["default_locale"],
                supported_locales=data["supported_locales"],
                currency=data["currency"],
                starter_content=False,
                open_payments=True,
                source="self_serve_wizard",
            )
        except ProvisioningError as exc:
            # Lost a race against another signup between the serializer's checks
            # and the insert: answer like a field error.
            from rest_framework.exceptions import ValidationError

            field_names = {"name": "business_name", "owner_email": "email"}
            raise ValidationError(
                {field_names.get(k, k): [v] for k, v in exc.errors.items()}
            ) from exc
        user, organization, membership = result.owner, result.organization, result.membership

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
