"""Onboarding services — Sprint C3 (D-030 follow-up).

Three composable steps for the signup wizard:

* :func:`complete_onboarding` — materialize the wizard's first
  category + items into a real menu (atomic, tenant-scoped).
* :func:`import_demo_template` — copy Modern Cafe's published
  categories + items into the new tenant (idempotent).
* :func:`generate_first_qr` — bootstrap the first QR code for the
  tenant (default branch, no table label).

Plus a trial helper used by ``OnboardingCompleteView`` and the
``TrialBanner`` frontend component:

* :func:`start_trial` — set ``PlanSettings.trial_ends_at = now + 14d``
  and flip ``active_plan`` to OPS for the duration.
* :func:`is_in_trial` — ``True`` iff ``trial_ends_at`` is in the future.

Tenant isolation (D-022) is the caller's responsibility — every
function takes an ``Organization`` and never a raw user input.
"""

from __future__ import annotations

from typing import Optional

from django.db import transaction
from django.utils import timezone

from apps.billing.models import PlanSettings
from apps.branches.models import Branch
from apps.menu.models import MenuCategory, MenuItem, Menu
from apps.organizations.models import Organization
from apps.qr.models import QRCode


# Trial duration — V1 default 14 days. V2 SaaS feature: configurable per
# promo code / sales override.
TRIAL_DAYS = 14


# ---------------------------------------------------------------------------
# Trial lifecycle
# ---------------------------------------------------------------------------


def start_trial(organization: Organization, days: int = TRIAL_DAYS) -> PlanSettings:
    """Flip the tenant to OPS for ``days`` days (:data:`TRIAL_DAYS` by default).

    Idempotent — calling twice on the same tenant refreshes the
    trial window (the public signup path and the agency's
    ``provision_tenant`` call it exactly once; extending a running trial is
    ``apps.billing.services.extend_trial``).
    """
    from apps.billing.services import begin_trial, get_plan_settings

    ps = get_plan_settings(organization)
    begin_trial(ps, days)
    ps.save()
    return ps


def is_in_trial(ps: PlanSettings) -> bool:
    """True iff the tenant is currently in the OPS trial window."""
    if not ps.trial_ends_at:
        return False
    return ps.trial_ends_at > timezone.now()


def expire_trial_if_due(organization: Organization) -> bool:
    """Downgrade an OPS-trial tenant whose window closed. Returns True if a
    downgrade happened.

    The logic lives in :func:`apps.billing.services.expire_trial` (it also runs
    lazily inside ``get_plan_settings`` and from ``manage.py expire_trials``);
    this wrapper keeps the onboarding API and reports whether *it* did the
    downgrade, so it reads the row with ``expire=False``.
    """
    from apps.billing.services import expire_trial, get_plan_settings

    return expire_trial(get_plan_settings(organization, expire=False))


# ---------------------------------------------------------------------------
# Step 2 — languages and currency
# ---------------------------------------------------------------------------


@transaction.atomic
def apply_preferences(
    organization: Organization,
    *,
    default_locale: str,
    supported_locales: list[str],
    currency: str,
) -> Organization:
    """Persist the wizard's step-2 choices on the tenant.

    The tenant's menus carry their own ``default_locale`` /
    ``supported_locales`` (a menu can serve a subset of the tenant's
    languages), so the existing menus are brought along — otherwise a
    tenant that set its language after the menu was created would keep
    serving the old one.

    The prices are *not* converted: the wizard's step-4 prices are
    entered in the chosen currency, and the currency is applied when the
    items are created (``complete_onboarding``).
    """
    organization.default_locale = default_locale
    organization.supported_locales = list(supported_locales)
    organization.currency = currency
    organization.save(
        update_fields=["default_locale", "supported_locales", "currency"]
    )

    Menu.objects.filter(organization=organization).update(
        default_locale=default_locale,
        supported_locales=list(supported_locales),
    )

    return organization


# ---------------------------------------------------------------------------
# Wizard materialization
# ---------------------------------------------------------------------------


@transaction.atomic
def complete_onboarding(
    organization: Organization,
    *,
    category_name: str,
    category_icon: str = "🍽️",
    items: list[dict],
    skip_items: bool = False,
) -> tuple[MenuCategory, list[MenuItem]]:
    """Create the first category (and items) for a brand-new tenant.

    ``items`` is a list of dicts with keys ``name``, ``price``
    (Decimal), ``description`` (optional). Empty list + ``skip_items=True``
    is allowed (the wizard's "İlk kategori ve ürünleri sonra ekleyeceğim"
    branch).

    **Idempotent.** The wizard fires this POST from the browser and a lost
    response, a double mount or an impatient retry can send it twice. The
    first call created a category row every time, so the second call left
    the tenant with two categories of the same name. Now the category is
    matched on ``(menu, slug)`` — the pair the model already declares
    unique — and the items on ``(menu, category, name)``: a repeated call
    updates the existing rows instead of adding new ones, and returns the
    same rows the first call created.

    The ``(menu, slug)`` lookup has to be re-checked by hand because
    ``MenuCategory`` has no unique constraint on the slug alone and two
    tenants can legitimately use the same category name.
    """
    # Find or create the tenant's default menu.
    menu, _ = Menu.objects.get_or_create(
        organization=organization,
        slug="ana-menu",
        defaults={
            "name": "Ana Menü",
            "default_locale": organization.default_locale,
            "supported_locales": organization.supported_locales,
            "is_active": True,
        },
    )

    # Auto-slug from category name (MenuCategory has its own slug field).
    from django.utils.text import slugify

    cat_slug = slugify(category_name, allow_unicode=True) or "kategori"

    category, created = MenuCategory.objects.get_or_create(
        menu=menu,
        slug=cat_slug,
        defaults={
            "name": category_name,
            "description": f"{category_icon} {category_name}",  # icon as emoji prefix
            "sort_order": 0,
            "is_active": True,
        },
    )
    if not created:
        # A repeated call: keep the operator's latest wording, don't add a
        # second row.
        category.name = category_name
        category.description = f"{category_icon} {category_name}"
        category.is_active = True
        category.save(update_fields=["name", "description", "is_active"])

    result_items: list[MenuItem] = []
    if not skip_items:
        for idx, item in enumerate(items):
            # ``MenuItem`` has no slug column — the wizard's product name is
            # the natural key inside a category. Matching on it keeps a
            # repeated call from adding the same dish twice.
            menu_item = (
                MenuItem.objects.filter(
                    menu=menu,
                    category=category,
                    name=item["name"],
                )
                .order_by("sort_order", "id")
                .first()
            )
            if menu_item is None:
                menu_item = MenuItem.objects.create(
                    menu=menu,
                    category=category,
                    name=item["name"],
                    price=item["price"],
                    description=item.get("description", ""),
                    currency=organization.currency,
                    sort_order=idx,
                    is_active=True,
                    is_available=True,
                )
            else:
                # The price may have been corrected between two attempts.
                menu_item.price = item["price"]
                menu_item.description = item.get("description", "")
                menu_item.currency = organization.currency
                menu_item.sort_order = idx
                menu_item.save(
                    update_fields=[
                        "price",
                        "description",
                        "currency",
                        "sort_order",
                    ]
                )
            result_items.append(menu_item)

    return category, result_items


# ---------------------------------------------------------------------------
# Demo seed (Modern Cafe template)
# ---------------------------------------------------------------------------


DEMO_TEMPLATE_SLUG = "modern-cafe"


@transaction.atomic
def import_demo_template(organization: Organization) -> tuple[int, int]:
    """Copy Modern Cafe's categories + items into the new tenant.

    Idempotent — if the tenant already has any category, we skip
    the import (returns ``(0, 0)``) to avoid duplicate noise. This is
    the wizard's "Demo menüden başla" path.

    Returns ``(categories_copied, items_copied)``.
    """
    if MenuCategory.objects.filter(menu__organization=organization).exists():
        return 0, 0

    try:
        src = Organization.objects.get(slug=DEMO_TEMPLATE_SLUG, is_active=True)
    except Organization.DoesNotExist as exc:
        raise ValueError(
            f"Demo template '{DEMO_TEMPLATE_SLUG}' not found or inactive. "
            "Run seed_demo first."
        ) from exc

    src_menu = Menu.objects.filter(organization=src, is_active=True).first()
    if not src_menu:
        return 0, 0

    # Create a fresh menu in the new tenant.
    new_menu = Menu.objects.create(
        organization=organization,
        name="Demo Menü",
        default_locale=organization.default_locale,
        supported_locales=organization.supported_locales,
        is_active=True,
    )

    cat_count = 0
    item_count = 0
    for src_cat in MenuCategory.objects.filter(menu=src_menu).order_by("sort_order"):
        new_cat = MenuCategory.objects.create(
            menu=new_menu,
            name=src_cat.name,
            slug=src_cat.slug,
            description=src_cat.description,
            sort_order=src_cat.sort_order,
            is_active=True,
        )
        cat_count += 1
        for src_item in MenuItem.objects.filter(category=src_cat).order_by("sort_order"):
            MenuItem.objects.create(
                menu=new_menu,
                category=new_cat,
                name=src_item.name,
                price=src_item.price,
                description=src_item.description,
                currency=src_item.currency,
                sort_order=src_item.sort_order,
                is_active=True,
                is_available=True,
            )
            item_count += 1

    return cat_count, item_count


# ---------------------------------------------------------------------------
# First QR
# ---------------------------------------------------------------------------


def generate_first_qr(organization: Organization) -> Optional[QRCode]:
    """Bootstrap the first QR code for the tenant (default branch).

    Idempotent — if the tenant already has a QR we return the first one
    rather than creating duplicates. The wizard's Step 5 "İlk QR'ı indir"
    button calls this.
    """
    existing = (
        QRCode.objects.filter(organization=organization)
        .order_by("created_at")
        .first()
    )
    if existing:
        return existing

    branch = Branch.objects.filter(organization=organization, is_active=True).first()
    if not branch:
        # V1 — if no branch exists, create a default one so the QR has a target.
        branch = Branch.objects.create(
            organization=organization,
            name="Ana Şube",
            slug="main",
            is_active=True,
        )

    # QRCode also requires a Menu FK — find the tenant's first active menu
    # (created by complete_onboarding) or skip if none exists (caller must
    # complete onboarding first).
    menu = Menu.objects.filter(organization=organization, is_active=True).first()
    if not menu:
        # No menu yet — can't create QR. The wizard's flow guarantees
        # onboarding/complete runs before qr-first, so this branch is a
        # safety net for direct API calls.
        return None

    return QRCode.objects.create(
        organization=organization,
        branch=branch,
        menu=menu,
        label="Ana QR",
        target_url=f"/m/{organization.slug}",
        scan_count=0,
        is_active=True,
    )
