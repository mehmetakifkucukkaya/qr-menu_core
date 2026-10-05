"""Role gate: one middleware enforces :mod:`apps.accounts.roles` on the
tenant admin API, before any view runs.

It only acts on authenticated, non-platform-admin users hitting a guarded
prefix. Anonymous requests fall through so each view keeps answering its own
401/403 exactly as before.
"""

from __future__ import annotations

from typing import Callable

from django.http import HttpRequest, HttpResponse, JsonResponse

from . import roles
from .services import resolve_membership_state


def _deny(code: str, message: str) -> JsonResponse:
    return JsonResponse({"error": {"code": code, "message": message}}, status=403)


class RoleGateMiddleware:
    """Insert after ``AuthenticationMiddleware`` (it reads ``request.user``)."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if roles.is_guarded(request.path):
            denied = self._check(request)
            if denied is not None:
                return denied
        return self.get_response(request)

    @staticmethod
    def _check(request: HttpRequest) -> HttpResponse | None:
        user = getattr(request, "user", None)
        if not (user and user.is_authenticated):
            return None
        if getattr(user, "is_platform_admin", False):
            return None

        state, membership = resolve_membership_state(user)
        if state == "no_membership":
            return _deny("auth.no_membership", "Bir işletmeye üye değilsiniz.")
        if state == "suspended":
            return _deny(
                "tenant.suspended",
                "Hesabınız askıya alındı, ajansınızla iletişime geçin.",
            )

        role = roles.membership_role_for_policy(membership.role)
        if role not in roles.allowed_roles(request.method, request.path):
            return _deny("auth.role_forbidden", "Bu işlem için yetkiniz yok.")
        return None
