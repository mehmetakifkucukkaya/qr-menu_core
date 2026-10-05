"""``manage.py create_tenant`` - the agency opens a customer in one command.

    python manage.py create_tenant --name "Pilot Kafe" --slug pilot-kafe \\
        --owner-email owner@pilot.test --plan pro --modules orders --json

Everything is :func:`apps.onboarding.provisioning.provision_tenant` (the Django
admin's "Yeni müşteri aç" screen calls the same service). The result card holds
the one-time temporary password: hand it to the owner, it is not stored.
"""

from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError

from apps.billing.constants import BASIC, PLAN_TIER_ORDER
from apps.onboarding.provisioning import (
    CURRENCIES,
    MODULES,
    ProvisioningError,
    provision_tenant,
    tenant_card,
)


class Command(BaseCommand):
    help = (
        "Open a customer: business, owner account (temporary password), plan, "
        "modules, starter menu and first QR code."
    )

    def add_arguments(self, parser):
        parser.add_argument("--name", required=True, help="Business name, e.g. 'Pilot Kafe'.")
        parser.add_argument("--slug", required=True, help="URL name: /m/<slug>.")
        parser.add_argument("--owner-email", required=True)
        parser.add_argument("--owner-name", default="")
        parser.add_argument("--plan", choices=PLAN_TIER_ORDER, default=BASIC)
        parser.add_argument(
            "--modules",
            default="",
            help=f"Comma separated, on top of the plan: {','.join(MODULES)}.",
        )
        parser.add_argument(
            "--trial-days",
            type=int,
            default=0,
            help="Full-feature trial (basic plan, no modules); the customer drops to basic after.",
        )
        parser.add_argument("--locale", choices=("tr", "en"), default="tr")
        parser.add_argument("--currency", choices=CURRENCIES, default="TRY")
        parser.add_argument("--json", action="store_true", help="Print the result card as JSON.")

    def handle(self, *args, **options):
        modules = [m.strip() for m in options["modules"].split(",") if m.strip()]
        try:
            result = provision_tenant(
                name=options["name"],
                slug=options["slug"],
                owner_email=options["owner_email"],
                owner_name=options["owner_name"],
                plan=options["plan"],
                modules=modules,
                trial_days=options["trial_days"],
                default_locale=options["locale"],
                currency=options["currency"],
            )
        except ProvisioningError as exc:
            raise CommandError(
                "\n".join(f"  {field}: {message}" for field, message in exc.errors.items())
            ) from exc

        card = tenant_card(result)
        if options["json"]:
            self.stdout.write(json.dumps(card, ensure_ascii=False))
        else:
            self.stdout.write(render_card(card))


def render_card(card: dict) -> str:
    org = card["organization"]
    trial = card["trial_ends_at"] or "-"
    modules = ", ".join(card["modules"]) or "-"
    return "\n".join(
        [
            f"Müşteri açıldı: {org['name']} ({org['slug']})",
            "",
            f"  Yönetim girişi  : {card['login_url']}",
            f"  E-posta         : {card['owner_email']}",
            f"  Geçici şifre    : {card['temporary_password']}   (bir kez gösterilir; ilk girişte değiştirilir)",
            f"  Menü bağlantısı : {card['menu_url']}",
            f"  Paket           : {card['plan']}   Modüller: {modules}   Deneme bitişi: {trial}",
        ]
    )
