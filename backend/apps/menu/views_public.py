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

Sprint 9C adds an ``X-Translation-Gaps`` response header when one or more
items in the published menu are missing translations for a locale the
menu declares as supported. The header is omitted when everything is
fully translated (so it doubles as a "clean" signal for crawlers and
operator tooling).
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.throttling import InternalExemptAnonRateThrottle
from apps.menu.services import get_active_menu, get_full_menu_payload


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
    * ``429`` — throttle exceeded (per client IP; the trusted Next.js SSR
      caller sending ``X-Internal-Token`` is exempt, see
      ``apps.core.throttling``).
    """

    permission_classes = [AllowAny]
    throttle_classes = [InternalExemptAnonRateThrottle]

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

        # Sprint 9C — translation consistency check.
        # Reuse the same resolution logic as get_full_menu_payload to
        # locate the published Menu model, then count (item, locale)
        # pairs that are declared as supported but have no
        # MenuItemTranslation row. The header is omitted when everything
        # is translated (crawler-friendly "clean" signal).
        menu = get_active_menu(org, branch=branch)
        gap_count = _count_translation_gaps(menu)
        response = Response(
            {
                "data": payload,
                "meta": {
                    "request_id": request.META.get("HTTP_X_REQUEST_ID", "")
                },
            }
        )
        if gap_count > 0:
            response["X-Translation-Gaps"] = str(gap_count)
        return response


def _count_translation_gaps(menu) -> int:
    """Return the number of (item, locale) pairs missing a translation.

    A gap is defined as: a **non-default** supported locale that has no
    ``MenuItemTranslation`` row for the given item. The default locale's
    text always lives on the model field itself (see
    ``apps.menu.services.translation.resolve_item_translation``), so it
    is intentionally excluded from the count — adding an explicit
    translation row for the default locale is redundant and would
    produce misleading gap numbers for operators (cf. the
    ``TranslationGapPanel`` admin UI in Sprint 9B which filters out the
    default locale from its target list for the same reason).

    Items are prefetched with their translations to keep this O(items)
    queries (no N+1). For a typical menu of ~25 items × 2-3 locales the
    cost is well under 50 ms.
    """
    if menu is None:
        return 0
    supported_locales = set(menu.supported_locales or [menu.default_locale])
    target_locales = supported_locales - {menu.default_locale}
    if not target_locales:
        return 0
    items = menu.items.prefetch_related("translations").all()
    gap_count = 0
    for item in items:
        translated_locales = {t.locale for t in item.translations.all()}
        gap_count += len(target_locales - translated_locales)
    return gap_count
