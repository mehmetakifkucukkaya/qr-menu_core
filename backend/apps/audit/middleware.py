"""Audit middleware — populates the thread-local audit context.

Runs *after* ``AuthenticationMiddleware`` so ``request.user`` is the
authenticated ``accounts.User`` (or ``AnonymousUser``) and *before* the
view runs so any signal handler invoked by the view can read the
actor + IP via ``apps.audit.context.get_current_*``.

We always clear the context in a ``finally`` so background threads
spawned during a request don't inherit stale actor/IP info.

IP resolution:
  - Prefer the first entry in ``X-Forwarded-For`` (when behind a proxy).
  - Fall back to ``REMOTE_ADDR`` (the actual TCP peer).
  - ``None`` when neither is parseable (test client, internal calls).
"""

from __future__ import annotations

from typing import Callable

from django.http import HttpRequest, HttpResponse

from .context import clear, set_current_actor, set_current_ip


def _client_ip(request: HttpRequest) -> str | None:
    """Resolve the originating client IP, honoring X-Forwarded-For."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    remote = request.META.get("REMOTE_ADDR", "").strip()
    return remote or None


class AuditContextMiddleware:
    """Attach the current request's actor + IP to thread-local storage.

    Inserted in ``MIDDLEWARE`` *after* ``AuthenticationMiddleware`` so
    ``request.user`` is populated. The position is registered by
    ``config/settings/base.py``.
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        user = getattr(request, "user", None)
        set_current_actor(user if getattr(user, "is_authenticated", False) else None)
        set_current_ip(_client_ip(request))
        try:
            response = self.get_response(request)
        finally:
            clear()
        return response
