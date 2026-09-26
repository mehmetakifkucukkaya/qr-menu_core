"""Django admin registration for QRCode (read-only).

Sprint 5A keeps the Django admin as a passive viewer — admins use the
SPA at /admin/qr-codes. We still register the model so ``manage.py
shell`` and the relational admin pages work.
"""

from __future__ import annotations

from django.contrib import admin

from .models import QRCode


@admin.register(QRCode)
class QRCodeAdmin(admin.ModelAdmin):
    list_display = ("id", "label", "organization", "menu", "branch", "scan_count", "is_active", "updated_at")
    list_filter = ("organization", "is_active")
    search_fields = ("label", "target_url", "table_number")
    readonly_fields = ("target_url", "scan_count", "created_at", "updated_at")
