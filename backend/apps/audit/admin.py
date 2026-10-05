"""Audit trail in the agency panel - read-only.

Every agency action (opening, suspending, extending, plan changes) and every
business' own edits land here through ``apps.audit.services.record_event``.
The stored keys stay English (``deactivated``, ``plan_settings``); the panel
shows them in Turkish.
"""

from django.contrib import admin

from apps.core.admin_base import ReadOnlyModelAdmin, TurkishLabelsMixin, labelled_form

from .models import AuditEvent

ACTION_LABELS = {
    "created": "Oluşturuldu",
    "updated": "Güncellendi",
    "deleted": "Silindi",
    "price_changed": "Fiyat değişti",
    "published": "Yayınlandı",
    "unpublished": "Yayından kaldırıldı",
    "deactivated": "Askıya alındı / pasifleştirildi",
    "reactivated": "Yeniden etkinleştirildi",
    "reordered": "Sıra değişti",
    "ai_import_uploaded": "PDF menü yüklendi (yapay zekâ)",
    "ai_import_confirmed": "PDF menü taslağı onaylandı",
    "ai_import_discarded": "PDF menü taslağı atıldı",
    "order_placed": "Sipariş verildi",
    "order_confirmed": "Sipariş onaylandı",
    "order_preparing": "Sipariş hazırlanıyor",
    "order_ready": "Sipariş hazır",
    "order_delivered": "Sipariş teslim edildi",
    "order_cancelled": "Sipariş iptal edildi",
    "ai_translation_generated": "Yapay zekâ çevirisi üretildi",
    "ai_description_generated": "Yapay zekâ açıklaması üretildi",
    "customer_registered": "Müşteri hesabı açıldı",
    "customer_login": "Müşteri giriş yaptı",
    "loyalty_earned": "Puan kazanıldı",
    "loyalty_redeemed": "Puan kullanıldı",
    "loyalty_adjusted": "Puan elle düzeltildi",
    "order_paid": "Ödeme alındı",
    "order_refunded": "Ödeme iade edildi",
    "payment_provider_test": "Ödeme sağlayıcı testi",
    "payment_webhook_received": "Ödeme bildirimi alındı",
    "payment_reconciled": "Ödeme mutabakatı yapıldı",
    "plan_changed": "Paket değişti",
    "plan_upgraded_preview": "Paket yükseltme önizlendi",
    "limit_exceeded_attempt": "Paket sınırı aşılmaya çalışıldı",
    "feature_disabled_access": "Kapalı özelliğe erişim denendi",
    "tenant_created": "Müşteri açıldı",
}

TARGET_LABELS = {
    "menu": "Menü",
    "category": "Kategori",
    "item": "Ürün",
    "branch": "Şube",
    "theme": "Tema",
    "organization": "İşletme",
    "menu_import_draft": "PDF menü taslağı",
    "order": "Sipariş",
    "translation_memory": "Çeviri belleği",
    "ai_product_description": "Yapay zekâ açıklaması",
    "customer": "Müşteri hesabı",
    "loyalty_settings": "Sadakat ayarı",
    "loyalty_transaction": "Sadakat işlemi",
    "payment": "Ödeme",
    "plan_settings": "Plan ayarı",
    "membership": "Üyelik",
}


@admin.register(AuditEvent)
class AuditEventAdmin(TurkishLabelsMixin, ReadOnlyModelAdmin):
    form = labelled_form(
        AuditEvent,
        {
            "actor": "Kullanıcı",
            "target_id": "Hedef no",
            "target_repr": "Ayrıntı",
            "payload": "Değişiklik ayrıntıları (JSON)",
            "ip_address": "IP adresi",
            "created_at": "Zaman",
        },
    )
    list_display = ("created_at", "business", "actor", "action_label", "target_label", "target_repr")
    fields = (
        "created_at", "business", "actor", "action_label", "target_label", "target_id",
        "target_repr", "payload", "ip_address",
    )
    labels = {
        "created_at": "Zaman",
        "actor": "Kullanıcı",
        "action": "Eylem",
        "target_type": "Hedef türü",
        "target_repr": "Ayrıntı",
    }
    value_labels = {"action": ACTION_LABELS, "target_type": TARGET_LABELS}
    list_filter = ("action", "target_type", "created_at")
    search_fields = ("organization_label", "target_repr", "actor__email")
    date_hierarchy = "created_at"
    list_select_related = ("actor",)
    ordering = ("-created_at",)

    @admin.display(description="İşletme", ordering="organization_label")
    def business(self, obj):
        # The label outlives the business (organization becomes empty on delete).
        return obj.organization_label or "—"

    @admin.display(description="Eylem", ordering="action")
    def action_label(self, obj):
        return ACTION_LABELS.get(obj.action, obj.action)

    @admin.display(description="Hedef türü", ordering="target_type")
    def target_label(self, obj):
        return TARGET_LABELS.get(obj.target_type, obj.target_type)
