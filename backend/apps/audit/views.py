"""Admin summary endpoint — Sprint 4C.

GET /api/v1/admin/summary — returns the active tenant's high-level
counts plus the 10 most-recent audit events. The endpoint powers the
admin dashboard's stat cards and the recent-activity list.

Tenant isolation is enforced two ways:

  1. The endpoint sits behind ``IsOrganizationMember`` (see
     ``apps/accounts/permissions``). This checks the request user has
     *some* active membership. Without an org, there's nothing to
     summarize — we return an empty payload instead of 403 so the
     dashboard can still render its first-run empty state.

  2. Counts and the audit query are filtered by the resolved
     ``organization``, not by the request user. Other orgs in the same
     instance are never reachable from this endpoint.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsOrganizationMember
from apps.accounts.models import Membership
from apps.branches.models import Branch
from apps.menu.models import Menu, MenuCategory, MenuItem

from .models import AuditEvent


# Cap on the recent-events payload — matches the dashboard's hard-coded
# list length. Keeping this constant on the server makes it trivial to
# raise later without churning the client.
SUMMARY_RECENT_EVENTS_LIMIT = 10


def _resolve_organization(user):
    """Return the user's first (and usually only) organization.

    Platform admins with no membership fall back to ``None`` so the
    view can render an empty payload instead of 500'ing.
    """
    membership = Membership.objects.filter(user=user, organization__is_active=True).first()
    return membership.organization if membership else None


def _serialize_event(event: AuditEvent) -> dict:
    return {
        "id": event.id,
        "actor": event.actor.email if event.actor else "system",
        "action": event.action,
        "target_type": event.target_type,
        "target_id": event.target_id,
        "target_repr": event.target_repr,
        "payload": event.payload or {},
        "created_at": event.created_at.isoformat(),
    }


class AdminSummaryView(APIView):
    """GET /api/v1/admin/summary — admin dashboard payload."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request) -> Response:
        organization = _resolve_organization(request.user)

        if organization is None:
            # No active membership — render a benign empty summary so
            # the dashboard's first-run state isn't blocked by 403.
            payload = {
                "menu_count": 0,
                "category_count": 0,
                "item_count": 0,
                "active_item_count": 0,
                "branch_count": 0,
                "recent_events": [],
                "organization": None,
            }
        else:
            # Counts — only published/active rows make the dashboard
            # card meaningful. is_active is the "soft delete" flag in
            # this codebase.
            menu_count = Menu.objects.filter(
                organization=organization, is_active=True
            ).count()
            category_count = MenuCategory.objects.filter(
                menu__organization=organization, is_active=True
            ).count()
            item_count = MenuItem.objects.filter(
                menu__organization=organization, is_active=True
            ).count()
            active_item_count = MenuItem.objects.filter(
                menu__organization=organization,
                is_active=True,
                is_available=True,
            ).count()
            branch_count = Branch.objects.filter(
                organization=organization, is_active=True
            ).count()

            recent_events = list(
                AuditEvent.objects.filter(organization=organization)
                .select_related("actor")
                .order_by("-created_at")[:SUMMARY_RECENT_EVENTS_LIMIT]
            )

            payload = {
                "menu_count": menu_count,
                "category_count": category_count,
                "item_count": item_count,
                "active_item_count": active_item_count,
                "branch_count": branch_count,
                "recent_events": [_serialize_event(e) for e in recent_events],
                "organization": {
                    "id": organization.id,
                    "name": organization.name,
                    "slug": organization.slug,
                    "currency": organization.currency,
                },
            }

        return Response(
            {
                "data": payload,
                "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")},
            },
            status=status.HTTP_200_OK,
        )
