"""Django admin registration for PDF import models — Sprint 7A.

Read-only views so platform staff can inspect import history. Operators
manage drafts through the SPA at ``/admin/pdf-import`` (Sprint 7B).
"""

from __future__ import annotations

from django.contrib import admin

from .models import MenuImportDraft, MenuImportItem


@admin.register(MenuImportDraft)
class MenuImportDraftAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "raw_pdf_filename",
        "organization",
        "status",
        "ai_provider",
        "ai_model",
        "confidence_avg",
        "menu",
        "created_at",
    )
    list_filter = ("organization", "status", "ai_provider")
    search_fields = ("raw_pdf_filename",)
    readonly_fields = (
        "ai_provider",
        "ai_model",
        "raw_pdf_size_bytes",
        "raw_pdf_path",
        "parsed_data",
        "error",
        "confidence_avg",
        "created_at",
        "updated_at",
    )


@admin.register(MenuImportItem)
class MenuImportItemAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "draft",
        "category_name",
        "name",
        "price",
        "currency",
        "confidence",
        "is_edited",
    )
    list_filter = ("draft__organization", "draft__status", "is_edited")
    search_fields = ("name", "category_name", "raw_text")
    readonly_fields = ("created_at", "updated_at")