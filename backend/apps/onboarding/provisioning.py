"""Open a customer: :func:`provision_tenant` (SPEC_PILOT_READINESS 4.1).

One atomic service for every way a business comes into being - the agency's
``manage.py create_tenant``, the Django admin's "Yeni müşteri aç" view and the
self-serve signup (``/api/v1/auth/signup``, closed during the pilot). It
validates everything first, then creates in a single transaction:

* the owner account (a temporary password the owner must replace, or the
  password the signup form chose),
* the ``Organization`` and ``Membership(OWNER)``,
* the ``PlanSettings`` row: the plan's features plus the modules the agency
  switched on, and a trial only when ``trial_days`` is given,
* for agency customers the starter content: theme, the branch "Merkez", an
  empty "Ana Menü" and its first QR code (the signup wizard makes those later,
  step by step, so it passes ``starter_content=False``),
* the ``tenant_created`` audit event (actor = whoever is signed in).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Optional, Sequence

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction

from apps.accounts.models import Membership, MembershipRole, User, UserRole
from apps.accounts.services import generate_temporary_password
from apps.audit.services import record_event
from apps.billing.constants import BASIC, PLAN_TIER_ORDER, default_features, is_valid_plan
from apps.billing.models import PlanSettings
from apps.billing.services import begin_trial
from apps.branches.models import Branch
from apps.menu.models import Menu
from apps.organizations.models import Organization
from apps.organizations.reserved import is_reserved
from apps.qr.models import QRCode
from apps.theme.models import ThemeConfig

from . import services

SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")
CURRENCIES = ("TRY", "EUR", "USD", "GBP")
MAX_TRIAL_DAYS = 90

# Module (what the agency sells) -> plan flags it switches on. Online payment
# is deliberately not a module: provisioning never opens it.
MODULES: dict[str, tuple[str, ...]] = {
    "orders": ("cart_enabled", "orders_enabled"),  # also opens the kitchen screen
    "loyalty": ("loyalty_enabled", "customer_accounts_enabled"),
    "ai_pdf": ("ai_pdf_import_enabled",),
    "ai_translate": ("ai_translate_enabled",),
    "analytics": ("advanced_analytics_enabled",),
}


class ProvisioningError(Exception):
    """Input was refused; nothing was created. ``errors`` maps argument name -> Turkish message."""

    def __init__(self, errors: dict[str, str]):
        super().__init__("; ".join(errors.values()))
        self.errors = errors


@dataclass(frozen=True)
class ProvisionedTenant:
    organization: Organization
    owner: User
    membership: Membership
    plan_settings: PlanSettings
    qr: Optional[QRCode]
    modules: tuple[str, ...]
    #: Shown to the agency once; ``None`` when the owner chose a password.
    temporary_password: Optional[str]


def _validate(
    *, name, slug, owner_email, plan, modules, trial_days, default_locale,
    supported_locales, currency,
) -> dict:
    errors: dict[str, str] = {}

    name = (name or "").strip()
    if not name:
        errors["name"] = "İşletme adı zorunlu."
    elif len(name) > 160:
        errors["name"] = "İşletme adı en fazla 160 karakter olabilir."

    slug = (slug or "").strip().lower()
    if not SLUG_RE.match(slug):
        errors["slug"] = "Slug küçük harf, rakam ve tireden oluşmalı (en fazla 40 karakter)."
    elif is_reserved(slug):
        errors["slug"] = "Bu slug sistem için ayrılmış. Farklı bir slug deneyin."
    elif Organization.objects.filter(slug=slug).exists():
        errors["slug"] = "Bu slug zaten kullanımda. Farklı bir slug deneyin."

    email = (owner_email or "").strip().lower()
    try:
        validate_email(email)
    except DjangoValidationError:
        errors["owner_email"] = "Geçerli bir e-posta girin."
    else:
        if User.objects.filter(email__iexact=email).exists():
            errors["owner_email"] = "Bu e-posta başka bir hesapta kullanılıyor."

    if not is_valid_plan(plan):
        errors["plan"] = f"Bilinmeyen paket '{plan}'. Geçerli: {', '.join(PLAN_TIER_ORDER)}."

    wanted = []
    for module in modules or ():
        module = str(module).strip().lower()
        if module and module not in wanted:
            wanted.append(module)
    unknown = [m for m in wanted if m not in MODULES]
    if unknown:
        errors["modules"] = (
            f"Bilinmeyen modül: {', '.join(unknown)}. Geçerli: {', '.join(MODULES)}."
        )
    chosen = tuple(m for m in MODULES if m in wanted)  # canonical order

    if not isinstance(trial_days, int) or isinstance(trial_days, bool) \
            or not 0 <= trial_days <= MAX_TRIAL_DAYS:
        errors["trial_days"] = f"Deneme günü 0 ile {MAX_TRIAL_DAYS} arasında olmalı."
    elif trial_days and (plan != BASIC or chosen):
        # A trial ends by dropping the tenant to BASIC; on any other plan (or
        # with modules switched on) that would silently take things away.
        errors["trial_days"] = (
            "Deneme süresi yalnızca basic paketle ve modül seçmeden verilir "
            "(bitince müşteri basic'e düşer)."
        )

    locales = [str(v).strip().lower() for v in (supported_locales or [default_locale])]
    default_locale = (default_locale or "").strip().lower()
    if not default_locale or len(default_locale) > 8:
        errors["default_locale"] = "Dil kodu zorunlu (en fazla 8 karakter)."
    elif default_locale not in locales:
        errors["supported_locales"] = "Varsayılan dil, desteklenen diller arasında olmalı."

    if currency not in CURRENCIES:
        errors["currency"] = f"Para birimi şunlardan biri olmalı: {', '.join(CURRENCIES)}."

    if errors:
        raise ProvisioningError(errors)
    return dict(
        name=name, slug=slug, email=email, modules=chosen, locales=locales,
        default_locale=default_locale,
    )


def provision_tenant(
    *,
    name: str,
    slug: str,
    owner_email: str,
    owner_name: str = "",
    owner_password: Optional[str] = None,
    plan: str = BASIC,
    modules: Iterable[str] = (),
    trial_days: int = 0,
    default_locale: str = "tr",
    supported_locales: Optional[Sequence[str]] = None,
    currency: str = "TRY",
    starter_content: bool = True,
    open_payments: bool = False,
    source: str = "agency",
) -> ProvisionedTenant:
    """Create a customer, or raise :class:`ProvisioningError` and create nothing.

    ``owner_password=None`` generates a temporary password (returned once in
    ``temporary_password``) and forces the owner to replace it at first sign-in.
    ``open_payments`` keeps the plan's own ``payments_enabled`` (only the legacy
    self-serve trial wants that); ``source`` is recorded in the audit event.
    """
    clean = _validate(
        name=name, slug=slug, owner_email=owner_email, plan=plan, modules=modules,
        trial_days=trial_days, default_locale=default_locale,
        supported_locales=supported_locales, currency=currency,
    )
    generated = owner_password is None
    password = generate_temporary_password() if generated else owner_password

    with transaction.atomic():
        owner = User.objects.create_user(
            email=clean["email"],
            password=password,
            full_name=(owner_name or "").strip()[:120],
            role=UserRole.OWNER,
            must_change_password=generated,
        )
        organization = Organization.objects.create(
            name=clean["name"],
            slug=clean["slug"],
            default_locale=clean["default_locale"],
            supported_locales=clean["locales"],
            currency=currency,
            is_active=True,
        )
        membership = Membership.objects.create(
            user=owner, organization=organization, role=MembershipRole.OWNER
        )

        features = default_features(plan)
        for module in clean["modules"]:
            for flag in MODULES[module]:
                features[flag] = True
        plan_settings = PlanSettings(
            organization=organization,
            active_plan=plan,
            billing_notes=(
                "Self-serve signup — BASIC default."
                if source == "self_serve_wizard"
                else "Ajans tarafından açıldı."
            ),
            **features,
        )
        if trial_days:
            begin_trial(plan_settings, trial_days)
        if not open_payments:
            plan_settings.payments_enabled = False
        plan_settings.save()

        qr = None
        if starter_content:
            ThemeConfig.objects.create(organization=organization)
            Branch.objects.create(
                organization=organization, name="Merkez", slug="merkez", is_active=True
            )
            Menu.objects.create(
                organization=organization,
                name="Ana Menü",
                slug="ana-menu",
                default_locale=clean["default_locale"],
                supported_locales=clean["locales"],
                is_active=True,
            )
            qr = services.generate_first_qr(organization)

        record_event(
            organization=organization,
            action="tenant_created",
            target_type="organization",
            target_id=organization.id,
            target_repr=f"Organization<{organization.slug}>",
            payload={
                "owner_email": owner.email,
                "plan": plan,
                "modules": list(clean["modules"]),
                "trial_days": trial_days,
                "signup_source": source,
            },
        )

    return ProvisionedTenant(
        organization=organization,
        owner=owner,
        membership=membership,
        plan_settings=plan_settings,
        qr=qr,
        modules=clean["modules"],
        temporary_password=password if generated else None,
    )


def tenant_card(result: ProvisionedTenant) -> dict:
    """What the agency hands to the customer: where to sign in, with what, and
    the public menu link. The temporary password is shown once and never stored."""
    base = settings.PUBLIC_BASE_URL.rstrip("/")
    organization, plan_settings = result.organization, result.plan_settings
    return {
        "organization": {
            "id": organization.id,
            "name": organization.name,
            "slug": organization.slug,
        },
        "login_url": f"{base}/login",
        "owner_email": result.owner.email,
        "temporary_password": result.temporary_password,
        "menu_url": f"{base}/m/{organization.slug}",
        "plan": plan_settings.active_plan,
        "modules": list(result.modules),
        "trial_ends_at": (
            plan_settings.trial_ends_at.isoformat() if plan_settings.trial_ends_at else None
        ),
        "qr_id": result.qr.id if result.qr else None,
    }
