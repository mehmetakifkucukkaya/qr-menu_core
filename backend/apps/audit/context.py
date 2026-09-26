"""Thread-local audit context.

Holds the actor (request user) and client IP address for the lifetime
of a single HTTP request. ``AuditContextMiddleware`` sets these on the
way in and clears them on the way out; ``record_event`` reads them so
the post-save/post-delete signal handlers don't need to plumb them
through.

Why thread-local?
  Django's request/response cycle is synchronous and runs on a single
  worker thread per request, so a thread-local gives us a clean way to
  attach per-request metadata without polluting signal call signatures.

In async views (ASGI) this would not be safe — but the admin API is
DRF-synchronous today, and if/when we go async we'll switch to
``contextvars``. Captured here as a single helper module so the swap is
mechanical (D-016).
"""

from __future__ import annotations

import threading

_local = threading.local()


def set_current_actor(user) -> None:
    """Set the current request's actor (user or None for anonymous)."""
    _local.actor = user


def get_current_actor():
    """Return the current request's actor, or None outside a request."""
    return getattr(_local, "actor", None)


def set_current_ip(ip: str | None) -> None:
    """Set the current request's client IP address."""
    _local.ip = ip


def get_current_ip() -> str | None:
    """Return the current request's client IP, or None."""
    return getattr(_local, "ip", None)


def clear() -> None:
    """Reset both slots. Called by middleware in a ``finally`` block."""
    _local.actor = None
    _local.ip = None
