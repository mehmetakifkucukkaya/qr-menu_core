"""HTTP layer of the team API (owner only; the role gate enforces it, the
view re-checks because these endpoints hand out access)."""

from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from . import team
from .models import MembershipRole
from .services import get_active_membership


def _ok(request: Request, data, http_status: int = status.HTTP_200_OK) -> Response:
    return Response(
        {"data": data, "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")}},
        status=http_status,
    )


def _fail(exc: team.TeamError) -> Response:
    return Response(
        {"error": {"code": exc.code, "message": exc.message}}, status=exc.http_status
    )


def _organization_for(request: Request):
    membership = get_active_membership(request.user)
    if membership is None:
        raise team.TeamError(
            "team.no_organization", "Bir işletmeye bağlı değilsiniz.", status.HTTP_403_FORBIDDEN
        )
    owner_roles = (MembershipRole.OWNER, MembershipRole.AGENCY_ADMIN)
    if membership.role not in owner_roles and not request.user.is_platform_admin:
        raise team.TeamError(
            "auth.role_forbidden", "Bu işlem için yetkiniz yok.", status.HTTP_403_FORBIDDEN
        )
    return membership.organization


class TeamListCreateView(APIView):
    """GET /api/v1/admin/team/ · POST /api/v1/admin/team/"""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        try:
            org = _organization_for(request)
        except team.TeamError as exc:
            return _fail(exc)
        return _ok(request, [team.serialize_member(m) for m in team.list_members(org)])

    def post(self, request: Request) -> Response:
        data = request.data if hasattr(request.data, "get") else {}
        try:
            org = _organization_for(request)
            member, password = team.add_member(
                org=org,
                email=data.get("email"),
                full_name=data.get("full_name"),
                role=data.get("role"),
            )
        except team.TeamError as exc:
            return _fail(exc)
        return _ok(
            request,
            {"member": team.serialize_member(member), "temporary_password": password},
            status.HTTP_201_CREATED,
        )


class TeamMemberView(APIView):
    """PATCH /api/v1/admin/team/{membership_id}/ — role and/or is_active."""

    permission_classes = [IsAuthenticated]

    def patch(self, request: Request, pk: int) -> Response:
        data = request.data if hasattr(request.data, "get") else {}
        try:
            org = _organization_for(request)
            member = team.update_member(
                org=org,
                actor=request.user,
                membership_id=pk,
                role=data.get("role"),
                is_active=data.get("is_active"),
            )
        except team.TeamError as exc:
            return _fail(exc)
        return _ok(request, team.serialize_member(member))


class TeamResetPasswordView(APIView):
    """POST /api/v1/admin/team/{membership_id}/reset-password/"""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request, pk: int) -> Response:
        try:
            org = _organization_for(request)
            member, password = team.reset_member_password(
                org=org, actor=request.user, membership_id=pk
            )
        except team.TeamError as exc:
            return _fail(exc)
        return _ok(
            request, {"member": team.serialize_member(member), "temporary_password": password}
        )
