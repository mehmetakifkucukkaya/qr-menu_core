"""Django admin registration for AI translate / describe models — Sprint 9A.

Read-only views so platform staff can inspect cache + description
history. Operators manage these through the SPA at ``/admin/ai``
(Sprint 9B).
"""

from __future__ import annotations

from django.contrib import admin

from .models import AIProductDescription, TranslationMemory


@admin.register(TranslationMemory)
class TranslationMemoryAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "organization",
        "source_locale",
        "target_locale",
        "ai_provider",
        "ai_model",
        "confidence",
        "created_at",
    )
    list_filter = ("organization", "source_locale", "target_locale", "ai_provider")
    search_fields = ("source_text", "translated_text", "source_text_hash")
    readonly_fields = ("source_text_hash", "created_at")


@admin.register(AIProductDescription)
class AIProductDescriptionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "menu_item",
        "organization",
        "locale",
        "ai_provider",
        "ai_model",
        "is_edited",
        "confidence",
        "updated_at",
    )
    list_filter = ("organization", "locale", "is_edited", "ai_provider")
    search_fields = ("menu_item__name", "generated_text")
    readonly_fields = ("created_at", "updated_at")
