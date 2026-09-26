"""Seed demo data — admin user + Modern Cafe organization.

Sprint 1 scope: admin user + Modern Cafe organization skeleton.
Sprint 6 expands this with categories, items, translations, QR codes, demo images.

Idempotent: re-running won't duplicate rows. Uses ``get_or_create`` for
the admin user and the demo organization.
"""

from __future__ import annotations

import os

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Seed demo data: admin user + Modern Cafe organization (idempotent)."

    def handle(self, *args, **options):
        from apps.accounts.models import Membership, MembershipRole, User, UserRole
        from apps.organizations.models import Organization

        admin_email = os.environ.get("DEMO_ADMIN_EMAIL", "admin@modern-cafe.local")
        admin_password = os.environ.get("DEMO_ADMIN_PASSWORD", "change-me-demo-only")
        org_slug = os.environ.get("DEMO_BUSINESS_SLUG", "modern-cafe")

        with transaction.atomic():
            user, user_created = User.objects.get_or_create(
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

            organization, org_created = Organization.objects.get_or_create(
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

        self.stdout.write(self.style.SUCCESS("Demo seed OK"))
        self.stdout.write(f"  admin user   : {admin_email}  (id={user.pk})")
        self.stdout.write(f"  organization : {organization.name}  (slug={organization.slug}, id={organization.pk})")
        self.stdout.write("")
        self.stdout.write(
            "Login at: POST /api/v1/auth/login  body: "
            + '{"email":"' + admin_email + '","password":"***"}'
        )
        self.stdout.write(
            f"  (password from env DEMO_ADMIN_PASSWORD; default '{admin_password}' in local)"
        )
        self.stdout.write(
            f"  Settings module: {settings.SETTINGS_MODULE}"
            if hasattr(settings, "SETTINGS_MODULE")
            else ""
        )
