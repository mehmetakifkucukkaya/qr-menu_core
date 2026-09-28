"""Admin API endpoints for AI translate + description — Sprint 9A.

Mounted under ``/api/v1/admin/translate/`` and ``/api/v1/admin/
describe/``. Five endpoints total::

    POST  /api/v1/admin/translate/                          — single text
    POST  /api/v1/admin/translate/menu-item/<pk>/           — item bulk
    POST  /api/v1/admin/translate/menu-category/<pk>/       — category bulk
    POST  /api/v1/admin/describe/menu-item/<pk>/            — single item
    POST  /api/v1/admin/describe/bulk/                       — N items

All endpoints require ``IsAuthenticated + IsOrganizationMember``.
The first membership is used as the tenant boundary (mirrors the
``apps/pdf_import/views._resolve_organization`` pattern from
Sprint 7A).

Cross-tenant safety: every lookup filters on the resolved
organization so user A can never reach user B's item/category
via the path parameter. A miss returns 404 (never 403) so we don't
leak existence.
"""

from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Membership
from apps.accounts.permissions import IsOrganizationMember
from apps.audit.services import record_event
from apps.menu.models import LOCALE_CHOICES, MenuCategory, MenuItem

from .models import AIProductDescription, TranslationMemory
from .serializers import (
    DescribeBulkSerializer,
    DescribeItemSerializer,
    TranslateObjectSerializer,
    TranslateTextSerializer,
)
from .services import (
    AIProviderError,
    describe_bulk,
    describe_product,
    translate_text,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tenant resolution + envelope
# ---------------------------------------------------------------------------
def _resolve_organization(user):
    """First active membership — same rule as pdf_import / media."""
    membership = Membership.objects.filter(
        user=user, organization__is_active=True
    ).first()
    return membership.organization if membership else None


def _error(code: str, message: str, http_status: int) -> Response:
    return Response(
        {"error": {"code": code, "message": message}},
        status=http_status,
    )


def _wrap(data, request: Request) -> Response:
    return Response(
        {
            "data": data,
            "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")},
        }
    )


def _scoped_item(organization, pk: int) -> MenuItem | None:
    """Tenant-scoped MenuItem lookup.

    Joins through ``menu.organization`` so a miss returns ``None``
    both for "doesn't exist" and "wrong tenant" — same 404 path,
    no existence leak.
    """
    return (
        MenuItem.objects.filter(menu__organization=organization, pk=pk)
        .select_related("category", "menu")
        .first()
    )


def _scoped_category(organization, pk: int) -> MenuCategory | None:
    return (
        MenuCategory.objects.filter(menu__organization=organization, pk=pk)
        .select_related("menu")
        .first()
    )


# ---------------------------------------------------------------------------
# POST /api/v1/admin/translate/
# ---------------------------------------------------------------------------
class TranslateTextView(APIView):
    """Single-string translate endpoint.

    Body: ``{text, source_locale, target_locale}``
    Response: ``{translated, cached, provider, model, confidence,
                 source_locale, target_locale}``
    """

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request) -> Response:
        organization = _resolve_organization(request.user)
        if organization is None:
            return _error(
                "translate.no_organization",
                "Çeviri için bir işletmeye üye olmalısınız.",
                status.HTTP_403_FORBIDDEN,
            )

        serializer = TranslateTextSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": {"code": "translate.invalid_payload",
                           "message": "Geçersiz istek gövdesi.",
                           "details": serializer.errors}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            outcome = translate_text(
                text=serializer.validated_data["text"],
                source_locale=serializer.validated_data["source_locale"],
                target_locale=serializer.validated_data["target_locale"],
                organization=organization,
            )
        except DRFValidationError as exc:
            return Response(
                {"error": {"code": "translate.invalid_payload",
                           "message": "Geçersiz istek gövdesi.",
                           "details": exc.detail}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except AIProviderError as exc:
            return _error(
                "ai.provider_unavailable",
                str(exc),
                status.HTTP_502_BAD_GATEWAY,
            )

        return _wrap(outcome, request)


# ---------------------------------------------------------------------------
# POST /api/v1/admin/translate/menu-item/<pk>/
# ---------------------------------------------------------------------------
class TranslateMenuItemView(APIView):
    """Translate a menu item's name + description into N target locales."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request, pk: int) -> Response:
        organization = _resolve_organization(request.user)
        if organization is None:
            return _error(
                "translate.no_organization",
                "Çeviri için bir işletmeye üye olmalısınız.",
                status.HTTP_403_FORBIDDEN,
            )

        item = _scoped_item(organization, pk)
        if item is None:
            return _error(
                "translate.item_not_found",
                "İstenen ürün bulunamadı.",
                status.HTTP_404_NOT_FOUND,
            )

        serializer = TranslateObjectSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": {"code": "translate.invalid_payload",
                           "message": "Geçersiz istek gövdesi.",
                           "details": serializer.errors}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source_locale = serializer.validated_data["source_locale"]
        target_locales = serializer.validated_data["target_locales"]
        if source_locale in target_locales:
            return _error(
                "translate.same_locale_in_list",
                "Hedef diller kaynak dili içeremez.",
                status.HTTP_400_BAD_REQUEST,
            )

        translations: list[dict] = []
        providers_used: set[str] = set()

        for locale in target_locales:
            # Translate name and description separately so the cache key
            # is per-string (a re-translation of only the description
            # doesn't have to re-pay for the name).
            try:
                name_result = translate_text(
                    text=item.name,
                    source_locale=source_locale,
                    target_locale=locale,
                    organization=organization,
                )
                desc_result = translate_text(
                    text=item.description or item.name,
                    source_locale=source_locale,
                    target_locale=locale,
                    organization=organization,
                )
            except DRFValidationError as exc:
                return Response(
                    {"error": {"code": "translate.invalid_payload",
                               "message": "Geçersiz çeviri isteği.",
                               "details": exc.detail}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            except AIProviderError as exc:
                return _error(
                    "ai.provider_unavailable",
                    str(exc),
                    status.HTTP_502_BAD_GATEWAY,
                )

            translations.append(
                {
                    "locale": locale,
                    "translated_name": name_result["translated"],
                    "translated_description": desc_result["translated"],
                    "cached": (
                        name_result["cached"] and desc_result["cached"]
                    ),
                    "provider": name_result["provider"],
                    "model": name_result["model"],
                }
            )
            providers_used.add(name_result["provider"])

        # Single audit event per call (one per target_locale would
        # explode the audit feed — the per-locale breakdown lives in
        # the ``translations`` payload).
        record_event(
            organization=organization,
            action="ai_translation_generated",
            target_type="menu_item",
            target_id=item.id,
            target_repr=item.name[:200],
            payload={
                "source_locale": source_locale,
                "target_locales": target_locales,
                "providers_used": sorted(providers_used),
                "kind": "menu_item",
            },
        )

        return _wrap(
            {
                "item_id": item.id,
                "translations": translations,
                "ai_provider": (
                    "openai" if "openai" in providers_used else "anthropic"
                ),
            },
            request,
        )


# ---------------------------------------------------------------------------
# POST /api/v1/admin/translate/menu-category/<pk>/
# ---------------------------------------------------------------------------
class TranslateMenuCategoryView(APIView):
    """Translate a category's name + description."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request, pk: int) -> Response:
        organization = _resolve_organization(request.user)
        if organization is None:
            return _error(
                "translate.no_organization",
                "Çeviri için bir işletmeye üye olmalısınız.",
                status.HTTP_403_FORBIDDEN,
            )

        category = _scoped_category(organization, pk)
        if category is None:
            return _error(
                "translate.category_not_found",
                "İstenen kategori bulunamadı.",
                status.HTTP_404_NOT_FOUND,
            )

        serializer = TranslateObjectSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": {"code": "translate.invalid_payload",
                           "message": "Geçersiz istek gövdesi.",
                           "details": serializer.errors}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source_locale = serializer.validated_data["source_locale"]
        target_locales = serializer.validated_data["target_locales"]
        if source_locale in target_locales:
            return _error(
                "translate.same_locale_in_list",
                "Hedef diller kaynak dili içeremez.",
                status.HTTP_400_BAD_REQUEST,
            )

        translations: list[dict] = []
        providers_used: set[str] = set()

        for locale in target_locales:
            try:
                name_result = translate_text(
                    text=category.name,
                    source_locale=source_locale,
                    target_locale=locale,
                    organization=organization,
                )
                desc_source = category.description or category.name
                desc_result = translate_text(
                    text=desc_source,
                    source_locale=source_locale,
                    target_locale=locale,
                    organization=organization,
                )
            except DRFValidationError as exc:
                return Response(
                    {"error": {"code": "translate.invalid_payload",
                               "message": "Geçersiz çeviri isteği.",
                               "details": exc.detail}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            except AIProviderError as exc:
                return _error(
                    "ai.provider_unavailable",
                    str(exc),
                    status.HTTP_502_BAD_GATEWAY,
                )

            translations.append(
                {
                    "locale": locale,
                    "translated_name": name_result["translated"],
                    "translated_description": desc_result["translated"],
                    "cached": (
                        name_result["cached"] and desc_result["cached"]
                    ),
                    "provider": name_result["provider"],
                    "model": name_result["model"],
                }
            )
            providers_used.add(name_result["provider"])

        record_event(
            organization=organization,
            action="ai_translation_generated",
            target_type="menu_category",
            target_id=category.id,
            target_repr=category.name[:200],
            payload={
                "source_locale": source_locale,
                "target_locales": target_locales,
                "providers_used": sorted(providers_used),
                "kind": "menu_category",
            },
        )

        return _wrap(
            {
                "category_id": category.id,
                "translations": translations,
                "ai_provider": (
                    "openai" if "openai" in providers_used else "anthropic"
                ),
            },
            request,
        )


# ---------------------------------------------------------------------------
# POST /api/v1/admin/describe/menu-item/<pk>/
# ---------------------------------------------------------------------------
class DescribeMenuItemView(APIView):
    """Generate / return the AI description for a single item + locale."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request, pk: int) -> Response:
        organization = _resolve_organization(request.user)
        if organization is None:
            return _error(
                "describe.no_organization",
                "Açıklama üretimi için bir işletmeye üye olmalısınız.",
                status.HTTP_403_FORBIDDEN,
            )

        item = _scoped_item(organization, pk)
        if item is None:
            return _error(
                "describe.item_not_found",
                "İstenen ürün bulunamadı.",
                status.HTTP_404_NOT_FOUND,
            )

        serializer = DescribeItemSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": {"code": "describe.invalid_payload",
                           "message": "Geçersiz istek gövdesi.",
                           "details": serializer.errors}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        locale = serializer.validated_data["locale"]
        force = serializer.validated_data["force"]

        try:
            outcome = describe_product(
                menu_item=item,
                locale=locale,
                organization=organization,
                force=force,
            )
        except DRFValidationError as exc:
            return Response(
                {"error": {"code": "describe.invalid_payload",
                           "message": "Geçersiz açıklama isteği.",
                           "details": exc.detail}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except AIProviderError as exc:
            return _error(
                "ai.provider_unavailable",
                str(exc),
                status.HTTP_502_BAD_GATEWAY,
            )

        # Audit emission: one event per call, regardless of whether the
        # AI was hit or the cached (edited) text was returned.
        record_event(
            organization=organization,
            action="ai_description_generated",
            target_type="menu_item",
            target_id=item.id,
            target_repr=item.name[:200],
            payload={
                "locale": locale,
                "ai_provider": outcome["provider"],
                "ai_model": outcome["model"],
                "regenerated": outcome["regenerated"],
                "is_edited": outcome["is_edited"],
                "force": force,
                "description_id": outcome.get("description_id"),
            },
        )

        return _wrap(
            {
                "item_id": item.id,
                "locale": locale,
                "description": outcome["description"],
                "regenerated": outcome["regenerated"],
                "is_edited": outcome["is_edited"],
                "provider": outcome["provider"],
                "model": outcome["model"],
                "confidence": outcome["confidence"],
            },
            request,
        )


# ---------------------------------------------------------------------------
# POST /api/v1/admin/describe/bulk/
# ---------------------------------------------------------------------------
class DescribeBulkView(APIView):
    """Bulk-generate descriptions for many items in one locale."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request) -> Response:
        organization = _resolve_organization(request.user)
        if organization is None:
            return _error(
                "describe.no_organization",
                "Toplu açıklama üretimi için bir işletmeye üye olmalısınız.",
                status.HTTP_403_FORBIDDEN,
            )

        serializer = DescribeBulkSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": {"code": "describe.invalid_payload",
                           "message": "Geçersiz istek gövdesi.",
                           "details": serializer.errors}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        locale = serializer.validated_data["locale"]
        item_ids = serializer.validated_data.get("item_ids") or []

        # Tenant-scoped queryset — never trust client-side ids blindly.
        qs = MenuItem.objects.filter(menu__organization=organization)
        if item_ids:
            qs = qs.filter(pk__in=item_ids)
        menu_items = list(qs.select_related("category", "menu"))

        try:
            outcome = describe_bulk(
                menu_items=menu_items,
                locale=locale,
                organization=organization,
                item_ids=item_ids,
            )
        except DRFValidationError as exc:
            return Response(
                {"error": {"code": "describe.invalid_payload",
                           "message": "Geçersiz toplu istek.",
                           "details": exc.detail}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except AIProviderError as exc:
            return _error(
                "ai.provider_unavailable",
                str(exc),
                status.HTTP_502_BAD_GATEWAY,
            )

        # One audit event per successful generation. The bulk view is
        # the single funnel so we control the count exactly — the
        # service layer is now silent on audit (the single-item view
        # also emits via this same code path).
        for row in outcome["results"]:
            if not row.get("generated"):
                continue
            record_event(
                organization=organization,
                action="ai_description_generated",
                target_type="menu_item",
                target_id=row["item_id"],
                target_repr=f"item#{row['item_id']} ({locale})",
                payload={
                    "locale": locale,
                    "ai_provider": row["provider"],
                    "ai_model": row["model"],
                    "kind": "bulk",
                    "description_chars": (
                        len(row["description"])
                        if row.get("description") else 0
                    ),
                },
            )

        return _wrap(outcome, request)


# ---------------------------------------------------------------------------
# Cache stats — used by Sprint 9B admin UI; tiny convenience endpoint.
# ---------------------------------------------------------------------------
class TranslateStatsView(APIView):
    """Lightweight cache + AI activity stats for the dashboard banner."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request) -> Response:
        organization = _resolve_organization(request.user)
        if organization is None:
            return _error(
                "translate.no_organization",
                "İşletme üyeliği bulunamadı.",
                status.HTTP_403_FORBIDDEN,
            )

        from django.db.models import Count

        memory_total = TranslationMemory.objects.filter(
            organization=organization
        ).count()
        per_target = (
            TranslationMemory.objects.filter(organization=organization)
            .values("target_locale")
            .annotate(count=Count("id"))
        )
        per_provider = (
            TranslationMemory.objects.filter(organization=organization)
            .values("ai_provider")
            .annotate(count=Count("id"))
        )
        descriptions_total = AIProductDescription.objects.filter(
            organization=organization
        ).count()
        edited_descriptions = AIProductDescription.objects.filter(
            organization=organization, is_edited=True
        ).count()

        return _wrap(
            {
                "translation_memory": {
                    "total": memory_total,
                    "per_target_locale": {
                        row["target_locale"]: row["count"]
                        for row in per_target
                    },
                    "per_provider": {
                        row["ai_provider"]: row["count"]
                        for row in per_provider
                    },
                },
                "descriptions": {
                    "total": descriptions_total,
                    "edited": edited_descriptions,
                },
                "supported_locales": [code for code, _ in LOCALE_CHOICES],
            },
            request,
        )
