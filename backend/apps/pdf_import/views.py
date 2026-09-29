"""Admin API endpoints for the AI PDF import flow — Sprint 7A (D-021).

Mounted under ``/api/v1/admin/pdf-import/``:

* ``POST   /upload``        — multipart upload, returns parsed draft
* ``GET    /drafts/``        — recent drafts for the operator's organisation
* ``GET    /drafts/{pk}/``   — full draft + items
* ``PATCH  /items/{pk}/``    — inline edit a single item (sets ``is_edited``)
* ``POST   /drafts/{pk}/confirm/`` — bulk save to Menu/Category/Item
* ``DELETE /drafts/{pk}/discard/`` — mark the draft discarded

All endpoints require ``IsOrganizationMember``. The first membership is
used as the tenant boundary (mirrors the pattern in ``apps.media.views``).
"""

from __future__ import annotations

import uuid
from pathlib import Path

from django.conf import settings
from django.db.models import Count
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Membership
from apps.accounts.permissions import IsOrganizationMember
from apps.audit.services import record_event

from .models import MenuImportDraft, MenuImportItem
from .schemas import EDITABLE_FIELDS
from .services import AIProviderError, confirm_draft, parse_menu_pdf


# ---------------------------------------------------------------------------
# Tenant resolution
# ---------------------------------------------------------------------------
def _resolve_organization(user):
    """First active membership — same rule as media upload."""
    membership = Membership.objects.filter(
        user=user, organization__is_active=True
    ).first()
    return membership.organization if membership else None


def _error(code: str, message: str, http_status: int) -> Response:
    return Response(
        {"error": {"code": code, "message": message}},
        status=http_status,
    )


# ---------------------------------------------------------------------------
# POST /upload
# ---------------------------------------------------------------------------
class PdfUploadView(APIView):
    """Accept a multipart PDF upload, parse it with the AI, return the draft."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: Request) -> Response:
        organization = _resolve_organization(request.user)
        if organization is None:
            return _error(
                "pdf.no_organization",
                "Yükleme için bir işletmeye üye olmalısınız.",
                status.HTTP_403_FORBIDDEN,
            )

        # Sprint B1 — D-026 feature flag guard. ``ai_pdf_import_enabled``
        # must be True on the tenant's PlanSettings (BASIC returns 403 +
        # audit). PRO / ORDERS / OPS default the flag on.
        from apps.billing.services import require_feature

        try:
            require_feature(organization, "ai_pdf_import_enabled")
        except Exception as exc:  # FeatureDisabled from billing
            return Response(
                {
                    "error": {
                        "code": getattr(exc, "code", "billing.feature_disabled"),
                        "message": getattr(exc, "message", str(exc)),
                        "feature": getattr(exc, "extra", {}).get("feature"),
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        uploaded = request.FILES.get("file")
        if uploaded is None:
            return _error(
                "pdf.required",
                "Form alanında 'file' zorunludur.",
                status.HTTP_400_BAD_REQUEST,
            )

        if uploaded.content_type != "application/pdf":
            return _error(
                "pdf.invalid_mime",
                "İzin verilen tip: application/pdf.",
                status.HTTP_400_BAD_REQUEST,
            )

        max_size = settings.PDF_IMPORT_MAX_SIZE_BYTES
        if uploaded.size is None or uploaded.size > max_size:
            return _error(
                "pdf.too_large",
                f"PDF boyutu {max_size // (1024 * 1024)} MB sınırını aşıyor.",
                status.HTTP_400_BAD_REQUEST,
            )

        # ----- Persist the PDF to MEDIA_ROOT/pdf_imports/{org_id}/{uuid}.pdf
        upload_dir = (
            Path(settings.MEDIA_ROOT) / "pdf_imports" / str(organization.id)
        )
        upload_dir.mkdir(parents=True, exist_ok=True)

        original_name = uploaded.name or "menu.pdf"
        safe_name = original_name.replace("/", "_").replace("\\", "_")[:200]
        dest_path = upload_dir / f"{uuid.uuid4().hex}-{safe_name}"
        bytes_written = 0
        with open(dest_path, "wb") as out:
            for chunk in uploaded.chunks():
                out.write(chunk)
                bytes_written += len(chunk)
                if bytes_written > max_size:
                    # Mid-stream safety: a malicious client could lie about
                    # Content-Length, so we re-check while writing.
                    out.close()
                    dest_path.unlink(missing_ok=True)
                    return _error(
                        "pdf.too_large",
                        f"PDF boyutu {max_size // (1024 * 1024)} MB sınırını aşıyor.",
                        status.HTTP_400_BAD_REQUEST,
                    )

        # ----- Create the draft in 'parsing' state
        draft = MenuImportDraft.objects.create(
            organization=organization,
            created_by=request.user,
            status="parsing",
            raw_pdf_filename=original_name,
            raw_pdf_size_bytes=bytes_written,
            raw_pdf_path=str(dest_path),
        )

        record_event(
            organization=draft.organization,
            action="ai_import_uploaded",
            target_type="menu_import_draft",
            target_id=draft.id,
            target_repr=original_name[:200],
            payload={
                "filename": original_name,
                "size_bytes": bytes_written,
            },
        )

        # ----- Call the AI
        try:
            provider, model_name, parsed = parse_menu_pdf(str(dest_path))
        except AIProviderError as exc:
            draft.status = "failed"
            draft.error = {"code": "ai.parse_failed", "message": str(exc)}
            draft.save(update_fields=["status", "error", "updated_at"])
            return _error(
                "ai.parse_failed",
                str(exc),
                status.HTTP_502_BAD_GATEWAY,
            )

        # ----- Persist items
        items_created = 0
        confidence_sum = 0.0
        confidence_count = 0
        rows: list[MenuImportItem] = []
        for category in parsed.get("categories", []):
            cat_name = (category.get("name") or "").strip() or "Genel"
            for item_idx, raw_item in enumerate(category.get("items", [])):
                confidence_raw = raw_item.get("confidence", 1.0)
                try:
                    confidence = float(confidence_raw)
                except (TypeError, ValueError):
                    confidence = 1.0
                confidence = max(0.0, min(1.0, confidence))

                rows.append(
                    MenuImportItem(
                        draft=draft,
                        sort_order=item_idx,
                        category_name=cat_name,
                        name=(raw_item.get("name") or "").strip()[:120]
                        or "(isimsiz)",
                        description=raw_item.get("description") or "",
                        price=raw_item.get("price"),
                        currency=(raw_item.get("currency") or "TRY")[:3],
                        allergens=list(raw_item.get("allergens") or []),
                        dietary_tags=list(raw_item.get("dietary_tags") or []),
                        raw_text=raw_item.get("raw_text") or "",
                        confidence=confidence,
                    )
                )
                items_created += 1
                confidence_sum += confidence
                confidence_count += 1

        if rows:
            MenuImportItem.objects.bulk_create(rows)

        avg_confidence = (
            round(confidence_sum / confidence_count, 2)
            if confidence_count
            else None
        )

        draft.ai_provider = provider
        draft.ai_model = model_name
        draft.parsed_data = parsed
        draft.status = "parsed"
        draft.confidence_avg = avg_confidence
        draft.save(
            update_fields=[
                "ai_provider",
                "ai_model",
                "parsed_data",
                "status",
                "confidence_avg",
                "updated_at",
            ]
        )

        return Response(
            {
                "data": {
                    "draft_id": draft.id,
                    "status": draft.status,
                    "ai_provider": provider,
                    "ai_model": model_name,
                    "item_count": items_created,
                    "confidence_avg": avg_confidence,
                }
            },
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# GET /drafts
# ---------------------------------------------------------------------------
class PdfImportDraftsView(APIView):
    """Recent drafts for the current operator."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request) -> Response:
        organization = _resolve_organization(request.user)
        if organization is None:
            return _error(
                "pdf.no_organization",
                "İşletme üyeliği bulunamadı.",
                status.HTTP_403_FORBIDDEN,
            )

        drafts = (
            MenuImportDraft.objects.filter(organization=organization)
            .annotate(item_count=Count("items"))
            .order_by("-created_at")[:20]
        )
        data = [
            {
                "id": d.id,
                "status": d.status,
                "ai_provider": d.ai_provider,
                "ai_model": d.ai_model,
                "raw_pdf_filename": d.raw_pdf_filename,
                "confidence_avg": (
                    float(d.confidence_avg) if d.confidence_avg is not None else None
                ),
                "item_count": d.item_count,
                "menu_id": d.menu_id,
                "created_at": d.created_at.isoformat(),
                "updated_at": d.updated_at.isoformat(),
            }
            for d in drafts
        ]
        return Response({"data": data})


# ---------------------------------------------------------------------------
# GET /drafts/{pk}
# ---------------------------------------------------------------------------
class PdfImportDraftDetailView(APIView):
    """Full draft (metadata + items)."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request, pk: int) -> Response:
        organization = _resolve_organization(request.user)
        draft = (
            MenuImportDraft.objects.filter(
                organization=organization, pk=pk
            )
            .first()
        )
        if draft is None:
            return _error(
                "draft.not_found",
                "İstenen import draft bulunamadı.",
                status.HTTP_404_NOT_FOUND,
            )

        items = [
            {
                "id": item.id,
                "sort_order": item.sort_order,
                "category_name": item.category_name,
                "name": item.name,
                "description": item.description,
                "price": str(item.price) if item.price is not None else None,
                "currency": item.currency,
                "allergens": item.allergens,
                "dietary_tags": item.dietary_tags,
                "raw_text": item.raw_text,
                "confidence": float(item.confidence),
                "is_edited": item.is_edited,
            }
            for item in draft.items.all()
        ]

        return Response(
            {
                "data": {
                    "id": draft.id,
                    "status": draft.status,
                    "ai_provider": draft.ai_provider,
                    "ai_model": draft.ai_model,
                    "raw_pdf_filename": draft.raw_pdf_filename,
                    "raw_pdf_size_bytes": draft.raw_pdf_size_bytes,
                    "confidence_avg": (
                        float(draft.confidence_avg)
                        if draft.confidence_avg is not None
                        else None
                    ),
                    "menu_id": draft.menu_id,
                    "error": draft.error,
                    "items": items,
                    "created_at": draft.created_at.isoformat(),
                    "updated_at": draft.updated_at.isoformat(),
                }
            }
        )


# ---------------------------------------------------------------------------
# PATCH /items/{pk}
# ---------------------------------------------------------------------------
class PdfImportItemUpdateView(APIView):
    """Inline-edit a parsed item. Sets ``is_edited`` on every save."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def patch(self, request: Request, pk: int) -> Response:
        organization = _resolve_organization(request.user)
        item = (
            MenuImportItem.objects.filter(
                draft__organization=organization, pk=pk
            )
            .select_related("draft")
            .first()
        )
        if item is None:
            return _error(
                "item.not_found",
                "İstenen import item bulunamadı.",
                status.HTTP_404_NOT_FOUND,
            )

        if item.draft.status != "parsed":
            return _error(
                "item.not_editable",
                "Sadece 'parsed' durumundaki draft'ların item'ları düzenlenebilir.",
                status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(request.data, dict):
            return _error(
                "item.invalid_payload",
                "JSON gövdesi bekleniyor.",
                status.HTTP_400_BAD_REQUEST,
            )

        changed = False
        for field, value in request.data.items():
            if field not in EDITABLE_FIELDS:
                return _error(
                    "item.unknown_field",
                    f"Bu alan düzenlenemez: {field!r}.",
                    status.HTTP_400_BAD_REQUEST,
                )
            setattr(item, field, value)
            changed = True

        if not changed:
            return _error(
                "item.no_changes",
                "Gövdede değişiklik yok.",
                status.HTTP_400_BAD_REQUEST,
            )

        item.is_edited = True
        item.save()
        return Response(
            {
                "data": {
                    "id": item.id,
                    "is_edited": item.is_edited,
                    "name": item.name,
                    "category_name": item.category_name,
                    "price": str(item.price) if item.price is not None else None,
                }
            }
        )


# ---------------------------------------------------------------------------
# POST /drafts/{pk}/confirm
# ---------------------------------------------------------------------------
class PdfImportConfirmView(APIView):
    """Bulk save a parsed draft into the canonical menu models."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request, pk: int) -> Response:
        organization = _resolve_organization(request.user)
        draft = (
            MenuImportDraft.objects.filter(
                organization=organization, pk=pk
            )
            .first()
        )
        if draft is None:
            return _error(
                "draft.not_found",
                "İstenen import draft bulunamadı.",
                status.HTTP_404_NOT_FOUND,
            )

        if draft.status != "parsed":
            return _error(
                "draft.not_confirmable",
                f"Bu draft onaylanamaz (durum={draft.status!r}).",
                status.HTTP_400_BAD_REQUEST,
            )

        payload = request.data or {}
        menu_name = (payload.get("menu_name") or "").strip()
        if not menu_name:
            return _error(
                "menu_name.required",
                "menu_name alanı zorunludur.",
                status.HTTP_400_BAD_REQUEST,
            )

        default_locale = (payload.get("default_locale") or "tr").strip()[:5]
        if default_locale not in {"tr", "en"}:
            default_locale = "tr"

        is_active = bool(payload.get("is_active", True))

        result = confirm_draft(
            draft,
            request.user,
            menu_name=menu_name,
            default_locale=default_locale,
            is_active=is_active,
        )
        return Response({"data": result})


# ---------------------------------------------------------------------------
# DELETE /drafts/{pk}/discard
# ---------------------------------------------------------------------------
class PdfImportDiscardView(APIView):
    """Mark a draft as discarded. Reversible only via re-upload."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def delete(self, request: Request, pk: int) -> Response:
        organization = _resolve_organization(request.user)
        draft = (
            MenuImportDraft.objects.filter(
                organization=organization, pk=pk
            )
            .first()
        )
        if draft is None:
            return _error(
                "draft.not_found",
                "İstenen import draft bulunamadı.",
                status.HTTP_404_NOT_FOUND,
            )

        discardable = {"pending", "parsing", "parsed", "failed"}
        if draft.status not in discardable:
            return _error(
                "draft.not_discardable",
                f"Bu draft silinemez (durum={draft.status!r}).",
                status.HTTP_400_BAD_REQUEST,
            )

        previous_status = draft.status
        draft.status = "discarded"
        draft.save(update_fields=["status", "updated_at"])

        record_event(
            organization=draft.organization,
            action="ai_import_discarded",
            target_type="menu_import_draft",
            target_id=draft.id,
            target_repr=draft.raw_pdf_filename[:200],
            payload={"status_before": previous_status},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)