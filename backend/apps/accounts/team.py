"""Team management — who has access to a business (SPEC_PILOT_READINESS §3.3).

Pure service functions; ``team_views`` is the thin HTTP layer on top. The owner
can add manager / staff / kitchen accounts, change their role, deactivate and
re-activate them and issue a new temporary password. Owners themselves are
managed by the agency only.
"""

from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction

from apps.audit.services import record_event

from .models import Membership, MembershipRole, User, UserRole
from .services import generate_temporary_password

ASSIGNABLE_ROLES = (MembershipRole.MANAGER, MembershipRole.STAFF, MembershipRole.KITCHEN)
_LOCKED_ROLES = (MembershipRole.OWNER, MembershipRole.AGENCY_ADMIN)


class TeamError(Exception):
    """A refusal with a machine-readable code and a Turkish message."""

    def __init__(self, code: str, message: str, http_status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status


def serialize_member(member: Membership) -> dict:
    user = member.user
    return {
        "id": member.id,
        "user_id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": member.role,
        "is_active": member.is_active,
        "must_change_password": user.must_change_password,
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "created_at": member.created_at.isoformat(),
    }


def list_members(org) -> list[Membership]:
    return list(
        Membership.objects.filter(organization=org)
        .select_related("user")
        .order_by("created_at", "id")
    )


def _get_member(org, membership_id: int) -> Membership:
    try:
        return Membership.objects.select_related("user").get(pk=membership_id, organization=org)
    except Membership.DoesNotExist:
        raise TeamError("team.not_found", "Ekip üyesi bulunamadı.", 404) from None


def _guard_target(actor, member: Membership) -> None:
    if member.user_id == actor.id:
        raise TeamError(
            "team.cannot_modify_self",
            "Kendi hesabınızı buradan değiştiremezsiniz.",
        )
    if member.role in _LOCKED_ROLES:
        raise TeamError(
            "team.owner_locked",
            "Sahip hesapları yalnızca ajans tarafından değiştirilir.",
        )


def _audit(org, member: Membership, action: str, payload: dict) -> None:
    record_event(
        organization=org,
        action=action,
        target_type="membership",
        target_id=member.id,
        target_repr=f"{member.user.email} ({member.role})",
        payload=payload,
    )


@transaction.atomic
def add_member(*, org, email: str, full_name: str, role: str) -> tuple[Membership, str]:
    """Create the account + membership. Returns ``(membership, temporary_password)``."""
    email = (email or "").strip().lower()
    try:
        validate_email(email)
    except DjangoValidationError:
        raise TeamError("team.invalid_email", "Geçerli bir e-posta girin.") from None
    if role not in ASSIGNABLE_ROLES:
        raise TeamError("team.invalid_role", "Rol yönetici, personel veya mutfak olmalı.")
    if User.objects.filter(email__iexact=email).exists():
        raise TeamError(
            "team.email_in_use", "Bu e-posta başka bir hesapta kullanılıyor.", 409
        )

    password = generate_temporary_password()
    user = User.objects.create_user(
        email=email,
        password=password,
        full_name=(full_name or "").strip()[:120],
        role=UserRole.MANAGER if role == MembershipRole.MANAGER else UserRole.STAFF,
        must_change_password=True,
    )
    member = Membership.objects.create(user=user, organization=org, role=role)
    _audit(org, member, "created", {"role": role, "email": email})
    return member, password


@transaction.atomic
def update_member(
    *, org, actor, membership_id: int, role: str | None = None, is_active: object = None
) -> Membership:
    member = _get_member(org, membership_id)
    _guard_target(actor, member)
    if role is None and is_active is None:
        raise TeamError("team.nothing_to_update", "Değiştirilecek bir alan gönderilmedi.")

    changes: dict[str, dict] = {}
    if role is not None:
        if role not in ASSIGNABLE_ROLES:
            raise TeamError("team.invalid_role", "Rol yönetici, personel veya mutfak olmalı.")
        if role != member.role:
            changes["role"] = {"from": member.role, "to": role}
            member.role = role
    if is_active is not None:
        if not isinstance(is_active, bool):
            raise TeamError("team.invalid_value", "is_active true veya false olmalı.")
        if is_active != member.is_active:
            changes["is_active"] = {"from": member.is_active, "to": is_active}
            member.is_active = is_active

    if changes:
        member.save()
        if "is_active" in changes:
            action = "reactivated" if member.is_active else "deactivated"
        else:
            action = "updated"
        _audit(org, member, action, changes)
    return member


@transaction.atomic
def reset_member_password(*, org, actor, membership_id: int) -> tuple[Membership, str]:
    """New temporary password; the member's open sessions end (Django's session
    auth hash changes with the password)."""
    member = _get_member(org, membership_id)
    _guard_target(actor, member)
    password = generate_temporary_password()
    user = member.user
    user.set_password(password)
    user.must_change_password = True
    user.save(update_fields=["password", "must_change_password"])
    _audit(org, member, "updated", {"change": "password_reset"})
    return member, password
