"""Admin registration for accounts app."""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import Membership, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """Email-based user admin (Django's UserAdmin adapted for email USERNAME_FIELD)."""

    ordering = ("email",)
    list_display = ("email", "full_name", "role", "is_active", "is_staff", "is_superuser")
    list_filter = ("role", "is_active", "is_staff", "is_superuser")
    search_fields = ("email", "full_name")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profil", {"fields": ("full_name", "role")}),
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
    list_display = ("user", "organization", "role", "created_at")
    list_filter = ("role",)
    search_fields = ("user__email", "organization__name", "organization__slug")
    autocomplete_fields = ("user", "organization")
