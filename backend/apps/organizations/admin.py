"""Organization admin - the agency's "Müşteriler" screen (SPEC_PILOT_READINESS 4.3).

The list answers the agency's daily questions at a glance: who are the
customers, on which plan, is the trial running out, who is suspended, who
actually uses it (orders, products, last order). The detail page carries the
team, the branches, the plan and the usage; the plan itself is edited on its
own page (billing), where every change is audited.
"""

from __future__ import annotations

import math
from datetime import timedelta

from django import forms
from django.contrib import admin
from django.db.models import Count, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html

from apps.accounts.models import Membership, MembershipRole
from apps.billing.constants import FEATURE_LABELS, PLAN_CHOICES, PLAN_TIER_LIMITS
from apps.billing.models import TenantUsageCounter
from apps.billing.services import default_plan
from apps.branches.models import Branch
from apps.menu.models import MenuItem
from apps.onboarding.provisioning import CURRENCIES, MODULES
from apps.orders.models import Order

from .models import Organization

LOCALE_CHOICES = [("tr", "Türkçe"), ("en", "English")]
MODULE_LABELS = {
    "orders": "Sipariş + mutfak",
    "loyalty": "Sadakat",
    "ai_pdf": "PDF içe aktarma",
    "ai_translate": "Çeviri",
    "analytics": "Gelişmiş analitik",
}
PLAN_NAMES = dict(PLAN_CHOICES)


def _local(moment) -> str:
    return timezone.localtime(moment).strftime("%d.%m.%Y %H:%M") if moment else "—"


# ------------------------------------------------------------------ form


class OrganizationAdminForm(forms.ModelForm):
    """Languages and currency are chosen, not typed as JSON."""

    default_locale = forms.ChoiceField(label="Varsayılan dil", choices=LOCALE_CHOICES)
    supported_locales = forms.MultipleChoiceField(
        label="Desteklenen diller", choices=LOCALE_CHOICES, widget=forms.CheckboxSelectMultiple
    )
    currency = forms.ChoiceField(label="Para birimi", choices=[(c, c) for c in CURRENCIES])

    class Meta:
        model = Organization
        fields = "__all__"
        labels = {
            "name": "İşletme adı",
            "slug": "Adres adı (slug)",
            "legal_name": "Ticari unvan",
            "description": "Açıklama",
            "is_active": "Aktif (kapalıysa müşteri askıdadır)",
            "logo": "Logo",
            "cover_image": "Kapak görseli",
            "phone": "Telefon",
            "whatsapp_phone": "WhatsApp telefonu",
            "email": "E-posta",
            "website": "Web sitesi",
            "instagram_url": "Instagram bağlantısı",
            "address": "Adres",
            "google_maps_url": "Google Haritalar bağlantısı",
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # A customer created with another language/currency must still open.
        known = dict(LOCALE_CHOICES)
        current = [self.instance.default_locale, *(self.instance.supported_locales or [])]
        extra = [(c, c) for c in dict.fromkeys(current) if c and c not in known]
        for name in ("default_locale", "supported_locales"):
            self.fields[name].choices = LOCALE_CHOICES + extra
        if self.instance.currency and self.instance.currency not in CURRENCIES:
            self.fields["currency"].choices += [(self.instance.currency, self.instance.currency)]

    def clean(self):
        cleaned = super().clean()
        default, supported = cleaned.get("default_locale"), cleaned.get("supported_locales")
        if default and supported and default not in supported:
            self.add_error("supported_locales", "Varsayılan dil, desteklenen diller arasında olmalı.")
        return cleaned


# ------------------------------------------------------------------ filters


class PlanFilter(admin.SimpleListFilter):
    title = "Paket"
    parameter_name = "plan"

    def lookups(self, request, model_admin):
        return [*PLAN_CHOICES, ("none", "Plan satırı yok")]

    def queryset(self, request, queryset):
        if self.value() == "none":
            return queryset.filter(plan_settings__isnull=True)
        if self.value():
            return queryset.filter(plan_settings__active_plan=self.value())
        return queryset


class StatusFilter(admin.SimpleListFilter):
    title = "Durum"
    parameter_name = "durum"

    def lookups(self, request, model_admin):
        return [("aktif", "Aktif"), ("askida", "Askıda")]

    def queryset(self, request, queryset):
        if self.value() in ("aktif", "askida"):
            return queryset.filter(is_active=self.value() == "aktif")
        return queryset


class TrialFilter(admin.SimpleListFilter):
    title = "Deneme"
    parameter_name = "deneme"

    def lookups(self, request, model_admin):
        return [
            ("running", "Deneme sürüyor"),
            ("soon", "Deneme ≤ 7 gün"),
            ("ended", "Deneme bitti"),
        ]

    def queryset(self, request, queryset):
        now = timezone.now()
        if self.value() == "running":
            return queryset.filter(plan_settings__trial_ends_at__gt=now)
        if self.value() == "soon":
            return queryset.filter(
                plan_settings__trial_ends_at__gt=now,
                plan_settings__trial_ends_at__lte=now + timedelta(days=7),
            )
        if self.value() == "ended":
            return queryset.filter(plan_settings__trial_ends_at__lte=now)
        return queryset


class ModuleFilter(admin.SimpleListFilter):
    title = "Modül açık"
    parameter_name = "modul"

    def lookups(self, request, model_admin):
        return [(key, MODULE_LABELS[key]) for key in MODULES]

    def queryset(self, request, queryset):
        if self.value() in MODULES:
            return queryset.filter(
                **{f"plan_settings__{flag}": True for flag in MODULES[self.value()]}
            )
        return queryset


# ------------------------------------------------------------------ inlines


class MembershipInline(admin.TabularInline):
    model = Membership
    extra = 0
    fields = ("user", "role", "is_active", "created_at")
    readonly_fields = ("created_at",)
    autocomplete_fields = ("user",)
    can_delete = False  # take access away with "is_active", the history stays
    verbose_name = "Üyelik"
    verbose_name_plural = "Ekip ve üyelikler"


class BranchInline(admin.TabularInline):
    model = Branch
    extra = 0
    fields = ("name", "slug", "is_active", "phone")
    show_change_link = True
    verbose_name = "Şube"
    verbose_name_plural = "Şubeler"


# ------------------------------------------------------------------ the admin


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    form = OrganizationAdminForm
    list_display = (
        "name", "slug", "plan_label", "trial_label", "owner_email", "status",
        "orders_30d", "item_total", "last_order",
    )
    list_filter = (PlanFilter, StatusFilter, TrialFilter, ModuleFilter)
    search_fields = ("name", "slug", "legal_name", "email", "phone", "memberships__user__email")
    ordering = ("name",)
    list_per_page = 50
    inlines = [MembershipInline, BranchInline]
    readonly_fields = ("plan_summary", "usage_summary", "created_at", "updated_at")
    fieldsets = (
        ("Özet", {"fields": ("plan_summary", "usage_summary")}),
        (None, {"fields": ("name", "slug", "legal_name", "description", "is_active")}),
        ("Görseller", {"fields": ("logo", "cover_image")}),
        (
            "İletişim",
            {
                "fields": (
                    "phone", "whatsapp_phone", "email", "website",
                    "instagram_url", "address", "google_maps_url",
                )
            },
        ),
        ("Yerelleştirme", {"fields": ("default_locale", "supported_locales", "currency")}),
        ("Önemli tarihler", {"fields": ("created_at", "updated_at")}),
    )

    def get_readonly_fields(self, request, obj=None):
        # The slug is in every printed QR code: it does not change here.
        extra = ("slug",) if obj else ()
        return (*super().get_readonly_fields(request, obj), *extra)

    def get_queryset(self, request):
        since = timezone.now() - timedelta(days=30)
        orders = Order.objects.filter(organization=OuterRef("pk"))
        owner = Membership.objects.filter(
            organization=OuterRef("pk"), role=MembershipRole.OWNER
        ).order_by("created_at", "id")

        def count_of(queryset, group_by):
            return Coalesce(
                Subquery(
                    queryset.order_by().values(group_by).annotate(n=Count("pk")).values("n")
                ),
                0,
            )

        return (
            super()
            .get_queryset(request)
            .select_related("plan_settings")
            .annotate(
                owner_mail=Subquery(owner.values("user__email")[:1]),
                orders_30d=count_of(orders.filter(placed_at__gte=since), "organization"),
                item_total=count_of(
                    MenuItem.objects.filter(menu__organization=OuterRef("pk")),
                    "menu__organization",
                ),
                last_order_at=Subquery(orders.order_by("-placed_at").values("placed_at")[:1]),
            )
        )

    # ---- list columns

    @admin.display(description="Paket", ordering="plan_settings__active_plan")
    def plan_label(self, obj):
        plan = getattr(obj, "plan_settings", None)
        if plan is None:
            return f"{PLAN_NAMES[default_plan()]} (plan satırı yok)"
        return plan.get_active_plan_display()

    @admin.display(description="Deneme", ordering="plan_settings__trial_ends_at")
    def trial_label(self, obj):
        plan = getattr(obj, "plan_settings", None)
        if plan is None or not plan.trial_ends_at:
            return "—"
        remaining = plan.trial_ends_at - timezone.now()
        if remaining <= timedelta(0):
            return "Bitti"
        return f"{math.ceil(remaining.total_seconds() / 86400)} gün kaldı"

    @admin.display(description="Sahip", ordering="owner_mail")
    def owner_email(self, obj):
        return obj.owner_mail or "—"

    @admin.display(description="Durum", ordering="is_active")
    def status(self, obj):
        return "Aktif" if obj.is_active else "Askıda"

    @admin.display(description="Sipariş (30 gün)", ordering="orders_30d")
    def orders_30d(self, obj):
        return obj.orders_30d

    @admin.display(description="Ürün", ordering="item_total")
    def item_total(self, obj):
        return obj.item_total

    @admin.display(description="Son sipariş", ordering="last_order_at")
    def last_order(self, obj):
        return _local(obj.last_order_at)

    # ---- detail page (read-only blocks)

    @admin.display(description="Paket ve modüller")
    def plan_summary(self, obj):
        if not obj.pk:
            return "—"
        plan = getattr(obj, "plan_settings", None)
        if plan is None:
            return format_html(
                "{} (plan satırı yok — varsayılan paket uygulanır) · <a href=\"{}?organization={}\">Plan ayarı ekle</a>",
                PLAN_NAMES[default_plan()],
                reverse("admin:billing_plansettings_add"),
                obj.pk,
            )
        open_now = [
            FEATURE_LABELS[flag] for flag, on in plan.effective_features().items() if on
        ]
        trial = (
            f"deneme bitişi {_local(plan.trial_ends_at)}" if plan.trial_ends_at else "deneme yok"
        )
        return format_html(
            "<strong>{}</strong> · {} · açık: {}<br><a href=\"{}\">Paketi ve modülleri düzenle</a>",
            plan.get_active_plan_display(),
            trial,
            ", ".join(open_now) or "hiçbiri",
            reverse("admin:billing_plansettings_change", args=[plan.pk]),
        )

    @admin.display(description="Kullanım özeti")
    def usage_summary(self, obj):
        if not obj.pk:
            return "—"
        now = timezone.now()
        counter = TenantUsageCounter.objects.filter(
            organization=obj, period_year=now.year, period_month=now.month
        ).first()
        plan = getattr(obj, "plan_settings", None)
        limits = PLAN_TIER_LIMITS[plan.active_plan if plan else default_plan()]

        def of(used, cap):
            return f"{used} / {cap if cap is not None else '∞'}"

        return format_html(
            "Bu ay: {} görüntülenme, {} tarama · Ürün: {} · Son 30 gün sipariş: {} · Son sipariş: {}",
            of(counter.views if counter else 0, limits["monthly_views"]),
            of(counter.scans if counter else 0, limits["monthly_scans"]),
            obj.item_total,
            obj.orders_30d,
            _local(obj.last_order_at),
        )
