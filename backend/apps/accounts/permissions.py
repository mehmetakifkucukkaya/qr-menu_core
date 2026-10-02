"""Permission classes for org-isolated API views.

These enforce tenant isolation: a user can only see/mutate objects that
belong to organizations they have an active Membership in. Global platform
admins (User.is_platform_admin) bypass isolation.
"""

from __future__ import annotations

from typing import Any

from rest_framework import permissions
from rest_framework.request import Request
from rest_framework.views import APIView


class IsOrganizationMember(permissions.BasePermission):
    """Object-level permission: request user must be a member of obj.organization.

    For list/create endpoints, the viewset filters the queryset using
    ``Organization.objects.for_user(user)``. For detail/update/delete
    endpoints, ``has_object_permission`` checks the membership.

    Global platform admins (User.is_platform_admin) bypass isolation.
    """

    message = "Bu kaynağa erişim yetkiniz yok (organization isolation)."

    def has_permission(self, request: Request, view: APIView) -> bool:
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request: Request, view: APIView, obj: Any) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if getattr(user, "is_platform_admin", False):
            return True

        organization = _resolve_organization(obj)
        if organization is None:
            # If the object doesn't belong to an org (rare), deny by default.
            return False
        return organization.is_member(user)


class IsPlatformAdmin(permissions.BasePermission):
    """Platform operators only (``User.is_platform_admin``: role=admin or superuser).

    Use for tenant-lifecycle and commercial actions a tenant must never perform
    on itself: creating organizations through the CRUD API, changing its own
    plan or feature overrides (there is no subscription billing in V1, so a
    tenant-writable plan is a free upgrade to the unlimited OPS tier).
    """

    message = "Bu işlem yalnızca platform yöneticileri içindir."

    def has_permission(self, request: Request, view: APIView) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "is_platform_admin", False)
        )


def _resolve_organization(obj: Any):
    """Find the organization for any object that exposes one of these attrs."""
    if hasattr(obj, "organization"):
        return obj.organization
    if hasattr(obj, "organization_id") and hasattr(obj, "organization"):
        return obj.organization
    # ThemeConfig is OneToOne to Organization; expose .organization via FK
    return getattr(obj, "organization", None)
