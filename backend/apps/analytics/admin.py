"""Menu-view events in the agency panel - read-only."""

from django.contrib import admin

from apps.core.admin_base import ReadOnlyModelAdmin, TurkishLabelsMixin, labelled_form

from .models import MenuViewEvent

EVENT_LABELS = {
    "menu_view": "Menü görüntülendi",
    "language_change": "Dil değiştirildi",
    "whatsapp_click": "WhatsApp tıklaması",
    "phone_click": "Telefon tıklaması",
    "qr_open": "QR tarandı",
}


@admin.register(MenuViewEvent)
class MenuViewEventAdmin(TurkishLabelsMixin, ReadOnlyModelAdmin):
    form = labelled_form(
        MenuViewEvent,
        {
            "organization": "İşletme",
            "branch": "Şube",
            "menu": "Menü",
            "qr_code": "QR kod",
            "event_type": "Olay",
            "locale": "Dil",
            "path": "Yol",
            "user_agent_hash": "Tarayıcı (özet)",
            "ip_hash": "IP (özet)",
            "referrer": "Gelinen sayfa",
            "created_at": "Zaman",
        },
    )
    list_display = ("created_at", "organization", "event_label", "locale", "path", "menu")
    labels = {
        "created_at": "Zaman",
        "organization": "İşletme",
        "event_type": "Olay",
        "locale": "Dil",
        "path": "Yol",
        "menu": "Menü",
    }
    value_labels = {"event_type": EVENT_LABELS}
    list_filter = ("event_type", "locale", "created_at")
    search_fields = ("organization__name", "organization__slug", "path")
    date_hierarchy = "created_at"
    list_select_related = ("organization", "menu")

    @admin.display(description="Olay", ordering="event_type")
    def event_label(self, obj):
        return EVENT_LABELS.get(obj.event_type, obj.event_type)
