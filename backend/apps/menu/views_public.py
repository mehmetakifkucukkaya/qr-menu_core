"""Public, unauthenticated read-only endpoints.

This is the data contract the Next.js frontend consumes at Sprint 3.
The shape is produced by ``apps.menu.services.get_full_menu_payload`` and
just re-emitted here behind:

* ``AllowAny`` permission
* ``AnonRateThrottle`` (60 req/min per IP — Sprint 5 analytics upgrade path)
* the canonical ``{data, meta}`` envelope

Active/passive filtering (inactive business / menu / category / item) is
the responsibility of the service layer, NOT this view, so the contract
is shared with admin tooling (Sprint 4 will reuse the same payload for
previewing a menu before publishing).
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.menu.services import get_full_menu_payload


class PublicMenuError(Exception):
    """Internal control-flow error used to return a structured JSON error.

    Carries an HTTP status, a stable error code (machine readable), and a
    human message (Turkish, the product default locale).
    """

    def __init__(self, http_status: int, code: str, message: str):
        self.http_status = http_status
        self.code = code
        self.message = message
        super().__init__(message)


class PublicMenuView(APIView):
    """``GET /api/v1/public/menus/{business_slug}?branch=<slug>&locale=<tr|en>``.

    Returns the full menu payload for a single business (Organization).
    Optional query params:

    * ``branch``  — restrict the menu to a specific Branch (must belong to
      the organization and be active). When omitted, the org-wide active
      menu wins.
    * ``locale``  — preferred locale code (default ``tr``). Falls back to
      menu ``default_locale`` and finally to the source model field via
      ``apps.menu.services.translation``.

    Response status codes:

    * ``200`` — payload present (may have empty categories if nothing is
      published, but a payload is always returned).
    * ``404`` — business not found OR no active menu OR requested branch
      not found. The error envelope disambiguates via the ``code`` field.
    * ``429`` — throttle exceeded (AnonRateThrottle, configured globally
      in ``REST_FRAMEWORK`` settings).
    """

    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def get(self, request: Request, business_slug: str) -> Response:
        from apps.branches.models import Branch
        from apps.organizations.models import Organization

        branch_slug = request.query_params.get("branch")
        locale = request.query_params.get("locale", "tr")

        org = Organization.objects.filter(
            slug=business_slug, is_active=True
        ).first()
        if org is None:
            return Response(
                {
                    "error": {
                        "code": "business.not_found",
                        "message": "İşletme bulunamadı veya pasif.",
                    },
                    "meta": {
                        "request_id": request.META.get("HTTP_X_REQUEST_ID", "")
                    },
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        branch = None
        if branch_slug:
            branch = Branch.objects.filter(
                organization=org, slug=branch_slug, is_active=True
            ).first()
            if branch is None:
                return Response(
                    {
                        "error": {
                            "code": "branch.not_found",
                            "message": "Şube bulunamadı veya pasif.",
                        },
                        "meta": {
                            "request_id": request.META.get(
                                "HTTP_X_REQUEST_ID", ""
                            )
                        },
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

        payload = get_full_menu_payload(org, locale=locale, branch=branch)
        if not payload or payload.get("menu") is None:
            return Response(
                {
                    "error": {
                        "code": "menu.not_found",
                        "message": "Aktif menü bulunamadı.",
                    },
                    "meta": {
                        "request_id": request.META.get("HTTP_X_REQUEST_ID", "")
                    },
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "data": payload,
                "meta": {
                    "request_id": request.META.get("HTTP_X_REQUEST_ID", "")
                },
            }
        )
