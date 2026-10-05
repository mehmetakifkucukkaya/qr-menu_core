"""What the agency does to a customer: suspend or reactivate it, reissue the
owner's password. Used by the Django admin actions; each step is audited (the
actor is whoever is signed in)."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Membership, MembershipRole
from apps.accounts.services import generate_temporary_password
from apps.audit.services import record_event

from .models import Organization


def set_active(organization: Organization, active: bool) -> bool:
    """Suspend (``False``) or reactivate (``True``) a customer.

    A suspended customer's team can no longer sign in or use the panel, and its
    public menu goes offline (the QR codes answer 404). Returns ``False`` when
    the customer was already in that state. Written with ``update()`` so the
    organization's own change signal does not add an empty "updated" event next
    to the meaningful one recorded here.
    """
    if organization.is_active == active:
        return False
    Organization.objects.filter(pk=organization.pk).update(
        is_active=active, updated_at=timezone.now()
    )
    organization.is_active = active
    record_event(
        organization=organization,
        action="reactivated" if active else "deactivated",
        target_type="organization",
        target_id=organization.id,
        target_repr=f"{organization.name} ({organization.slug})",
        payload={"source": "agency"},
    )
    return True


@transaction.atomic
def reset_owner_password(organization: Organization):
    """New temporary password for the customer's owner. Returns ``(user, password)``.

    The owner must replace it at the next sign-in; their open sessions end
    (Django's session hash follows the password). ``ValueError`` when the
    customer has no active owner.
    """
    membership = (
        Membership.objects.select_related("user")
        .filter(organization=organization, role=MembershipRole.OWNER, is_active=True)
        .order_by("created_at", "id")
        .first()
    )
    if membership is None:
        raise ValueError("Bu müşterinin aktif bir sahibi yok.")
    password = generate_temporary_password()
    user = membership.user
    user.set_password(password)
    user.must_change_password = True
    user.save(update_fields=["password", "must_change_password"])
    record_event(
        organization=organization,
        action="updated",
        target_type="membership",
        target_id=membership.id,
        target_repr=f"{user.email} ({membership.role})",
        payload={"change": "password_reset", "source": "agency"},
    )
    return user, password
