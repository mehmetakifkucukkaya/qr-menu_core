"""Seed demo data — admin user + Modern Cafe organization + minimal menu.

Sprint 1 scope: admin user + Modern Cafe organization skeleton.
Sprint 2 expands: adds 1 minimal Menu + 2 placeholder categories
(`kahveler`, `soguk-icecekler`). Items / translations / images land in
Sprint 6 alongside the demo assets.

Idempotent: re-running won't duplicate rows. Uses ``get_or_create`` for
the admin user, demo organization, demo menu, and demo categories.
"""

from __future__ import annotations

import os

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = (
        "Seed demo data: admin user + Modern Cafe organization + "
        "1 minimal menu + 2 placeholder categories (idempotent)."
    )

    def handle(self, *args, **options):
        from apps.accounts.models import Membership, MembershipRole, User, UserRole
        from apps.menu.models import Menu, MenuCategory
        from apps.organizations.models import Organization

        admin_email = os.environ.get("DEMO_ADMIN_EMAIL", "admin@modern-cafe.local")
        admin_password = os.environ.get("DEMO_ADMIN_PASSWORD", "change-me-demo-only")
        org_slug = os.environ.get("DEMO_BUSINESS_SLUG", "modern-cafe")
        menu_slug = "modern-cafe-menu"

        with transaction.atomic():
            user, _ = User.objects.get_or_create(
                email=admin_email,
                defaults={
                    "full_name": "Modern Cafe Admin",
                    "role": UserRole.ADMIN,
                    "is_staff": True,
                    "is_superuser": True,
                },
            )
            # Always (re)set password so reseeds after an env change pick up.
            user.set_password(admin_password)
            user.is_staff = True
            user.is_superuser = True
            user.role = UserRole.ADMIN
            user.is_active = True
            user.save()

            organization, _ = Organization.objects.get_or_create(
                slug=org_slug,
                defaults={
                    "name": "Modern Cafe",
                    "legal_name": "Modern Cafe Ltd. Şti.",
                    "description": "Modern Cafe — kahve, tatlı ve brunch.",
                    "default_locale": "tr",
                    "supported_locales": ["tr", "en"],
                    "currency": "TRY",
                    "phone": "+90 555 000 0000",
                    "whatsapp_phone": "+90 555 000 0000",
                    "email": "info@modern-cafe.local",
                    "address": "İstanbul, Türkiye",
                    "is_active": True,
                },
            )

            Membership.objects.get_or_create(
                user=user,
                organization=organization,
                defaults={"role": MembershipRole.OWNER},
            )

            # --- Sprint 2: minimal menu + 2 placeholder categories ---
            menu, menu_created = Menu.objects.get_or_create(
                organization=organization,
                slug=menu_slug,
                defaults={
                    "name": "Modern Cafe Menü",
                    "description": "Kahve, soğuk içecekler, tatlı ve brunch.",
                    "default_locale": "tr",
                    "supported_locales": ["tr", "en"],
                    "is_active": True,
                },
            )

            cat_definitions = [
                ("kahveler", "Kahveler", "Espresso bazlı ve filtre kahve çeşitleri.", 0),
                (
                    "soguk-icecekler",
                    "Soğuk İçecekler",
                    "Iced latte, soğuk kahve, limonata ve smoothieler.",
                    1,
                ),
            ]
            created_cats = 0
            for cat_slug, cat_name, cat_desc, sort_order in cat_definitions:
                _, created = MenuCategory.objects.get_or_create(
                    menu=menu,
                    slug=cat_slug,
                    defaults={
                        "name": cat_name,
                        "description": cat_desc,
                        "sort_order": sort_order,
                        "is_active": True,
                    },
                )
                if created:
                    created_cats += 1

        self.stdout.write(self.style.SUCCESS("Demo seed OK"))
        self.stdout.write(f"  admin user   : {admin_email}  (id={user.pk})")
        self.stdout.write(
            f"  organization : {organization.name}  (slug={organization.slug}, id={organization.pk})"
        )
        self.stdout.write(
            f"  menu         : {menu.name}  (slug={menu.slug}, id={menu.pk}, "
            f"created={menu_created})"
        )
        self.stdout.write(
            f"  categories   : {MenuCategory.objects.filter(menu=menu).count()} "
            f"({created_cats} created this run)"
        )
        self.stdout.write("")
        self.stdout.write(
            "Login at: POST /api/v1/auth/login  body: "
            + '{"email":"' + admin_email + '","password":"***"}'
        )
        self.stdout.write(
            f"  (password from env DEMO_ADMIN_PASSWORD; default '{admin_password}' in local)"
        )
        if hasattr(settings, "SETTINGS_MODULE"):
            self.stdout.write(f"  Settings module: {settings.SETTINGS_MODULE}")