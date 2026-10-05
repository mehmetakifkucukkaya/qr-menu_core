"""Account services — membership resolution shared by views, the role gate
and the team API.

``get_active_membership`` is the single answer to "which organization does
this user operate as, and in which role?". It replaces a dozen copies of the
same ``Membership.objects.filter(...).first()`` query that lived in the
individual view modules.
"""

from __future__ import annotations

import secrets
from typing import Literal

from .models import Membership

MembershipState = Literal["ok", "no_membership", "suspended"]

# How long a sign-in stays valid without activity (sessions slide: every
# request pushes the expiry forward, see SESSION_SAVE_EVERY_REQUEST). Floor
# devices — the kitchen tablet, the till — should not ask for a password
# every other week.
SESSION_AGE_DEFAULT = 14 * 24 * 3600
SESSION_AGE_FLOOR = 30 * 24 * 3600
_FLOOR_ROLES = frozenset({"kitchen", "staff"})


def session_age_for(role: str | None) -> int:
    """Session length in seconds for a membership role (``None`` = no membership)."""
    return SESSION_AGE_FLOOR if role in _FLOOR_ROLES else SESSION_AGE_DEFAULT


def get_active_membership(user) -> Membership | None:
    """The user's first active membership in an active organization.

    ``None`` for anonymous users and for users without such a membership.
    Ordered by creation so the answer is stable when a user belongs to more
    than one organization.
    """
    if not (user and getattr(user, "is_authenticated", False)):
        return None
    return (
        Membership.objects.filter(
            user=user, is_active=True, organization__is_active=True
        )
        .select_related("organization")
        .order_by("created_at", "id")
        .first()
    )


def resolve_membership_state(user) -> tuple[MembershipState, Membership | None]:
    """Classify a signed-in user for the role gate.

    * ``("ok", membership)`` — can operate as ``membership.role``.
    * ``("suspended", None)`` — has active memberships, but every one of
      them belongs to a suspended (``is_active=False``) organization.
    * ``("no_membership", None)`` — no active membership at all.
    """
    membership = get_active_membership(user)
    if membership is not None:
        return "ok", membership
    has_active_membership = Membership.objects.filter(
        user=user, is_active=True
    ).exists()
    return ("suspended" if has_active_membership else "no_membership"), None


# A temporary password is read off a screen and typed on a tablet: no 0/O,
# 1/l/I lookalikes.
TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
TEMP_PASSWORD_LENGTH = 10


def generate_temporary_password(length: int = TEMP_PASSWORD_LENGTH) -> str:
    return "".join(secrets.choice(TEMP_PASSWORD_ALPHABET) for _ in range(length))
