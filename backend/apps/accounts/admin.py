"""Admin registration for accounts app."""

from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from apps.core.admin_base import TurkishLabelsMixin

from .models import Membership, User


class MembershipForm(forms.ModelForm):
    """Turkish labels for the membership forms (also used by the team table on
    the customer page, apps/organizations/admin.py)."""

    class Meta:
        model = Membership
        fields = "__all__"
        labels = {
            "user": "Kullanıcı",
            "organization": "İşletme",
            "role": "Rol",
            "is_active": "Aktif",
        }


@admin.register(User)
class UserAdmin(TurkishLabelsMixin, DjangoUserAdmin):
    """Email-based user admin (Django's UserAdmin adapted for email USERNAME_FIELD)."""

    labels = {
        "email": "E-posta",
        "is_active": "Aktif",
        "is_staff": "Ajans paneline girer",
        "is_superuser": "Süper kullanıcı",
    }
    ordering = ("email",)
    list_display = ("email", "full_name", "role", "is_active", "is_staff", "is_superuser")
    list_filter = ("role", "is_active", "is_staff", "is_superuser")
    search_fields = ("email", "full_name")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profil", {"fields": ("full_name", "role", "must_change_password")}),
        (
            "Yetkiler",
            {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
        ("Önemli tarihler", {"fields": ("last_login", "date_joined", "created_at", "updated_at")}),
    )
    readonly_fields = ("last_login", "date_joined", "created_at", "updated_at")
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "password1", "password2", "role"),
            },
        ),
    )


@admin.register(Membership)
class MembershipAdmin(TurkishLabelsMixin, admin.ModelAdmin):
    form = MembershipForm
    labels = {
        "user": "Kullanıcı",
        "organization": "İşletme",
        "role": "Rol",
        "is_active": "Aktif",
        "created_at": "Oluşturulma",
    }
    list_display = ("user", "organization", "role", "is_active", "created_at")
    list_filter = ("role", "is_active")
    search_fields = ("user__email", "organization__name", "organization__slug")
    autocomplete_fields = ("user", "organization")
