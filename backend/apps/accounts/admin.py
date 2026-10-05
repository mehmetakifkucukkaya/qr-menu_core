"""Admin registration for accounts app."""

from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

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
class UserAdmin(DjangoUserAdmin):
    """Email-based user admin (Django's UserAdmin adapted for email USERNAME_FIELD)."""

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
class MembershipAdmin(admin.ModelAdmin):
    form = MembershipForm
    list_display = ("user", "organization", "role", "is_active", "created_at")
    list_filter = ("role", "is_active")
    search_fields = ("user__email", "organization__name", "organization__slug")
    autocomplete_fields = ("user", "organization")
