"""Audit service helpers.

Single funnel for creating AuditEvent rows. Signal handlers and
explicit callers (e.g. the publish endpoint) both go through
``record_event`` so the actor / IP / payload defaults stay consistent.

The function is intentionally a thin wrapper — it does NOT swallow
exceptions. If audit logging fails for some reason, we want the
caller (and ultimately the request) to know, rather than silently
lose the trail.
"""

from __future__ import annotations

from typing import Any, Mapping

from .context import get_current_actor, get_current_ip
from .models import AuditEvent


def record_event(
    *,
    organization,
    action: str,
    target_type: str,
    target_id: int,
    target_repr: str,
    payload: Mapping[str, Any] | None = None,
) -> AuditEvent:
    """Persist an audit event for the current request context.

    Returns the created ``AuditEvent``. Actor and IP are pulled from the
    thread-local context (set by ``AuditContextMiddleware``); pass them
    explicitly to ``AuditEvent.objects.create`` if you need to record
    an event outside an HTTP request.
    """
    actor = get_current_actor()
    # ``request.user.is_authenticated`` is True for real users; the
    # middleware only sets the actor when that's the case, so we don't
    # need a separate guard here.
    return AuditEvent.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        organization=organization,
        action=action,
        target_type=target_type,
        target_id=target_id,
        target_repr=target_repr[:200],  # schema ceiling
        payload=dict(payload or {}),
        ip_address=get_current_ip(),
    )
