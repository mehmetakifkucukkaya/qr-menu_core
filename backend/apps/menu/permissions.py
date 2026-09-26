"""Permissions for the menu app.

Re-uses `IsOrganizationMember` from `apps.accounts.permissions` for the
object-level check. Adds a small helper that resolves the Organization
from any Menu/MenuCategory/MenuItem, because the permission class looks
for `.organization` and these models expose it via `.menu.organization`.

The helper `_resolve_organization` in `apps.accounts.permissions` already
returns the first object exposing `.organization`. To keep that helper
clean, we monkey-patch the resolution through a thin wrapper: menu/category/
item are accessible via the chain menu.organization, so for the perm check
we set the chain attribute via `obj.organization` lookup in our own has_*
check below — see `IsMenuOrganizationMember`.
"""

from __future__ import annotations

from typing import Any

from rest_framework import permissions
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.accounts.permissions import _resolve_organization


class IsMenuOrganizationMember(permissions.BasePermission):
    """Object-level permission for Menu/MenuCategory/MenuItem.

    These models don't carry an `.organization` directly — they carry
    `.menu` which has it. We extend the resolution by checking `.menu`
    as a fallback so `IsOrganizationMember` style logic keeps working
    even when the wrapper `_resolve_organization` doesn't know about menu.
    """

    message = "Bu menü kaynağına erişim yetkiniz yok (organization isolation)."

    def has_permission(self, request: Request, view: APIView) -> bool:
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request: Request, view: APIView, obj: Any) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if getattr(user, "is_platform_admin", False):
            return True

        organization = _resolve_organization(obj)
        if organization is None and hasattr(obj, "menu"):
            organization = getattr(obj.menu, "organization", None)
        if organization is None:
            return False
        return organization.is_member(user)