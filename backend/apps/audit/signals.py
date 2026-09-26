"""Audit signals — record admin operations on core domain models.

This module owns the bridge between ``post_save`` / ``post_delete`` on
``Menu``, ``MenuCategory``, ``MenuItem``, ``Branch``, ``ThemeConfig`` and
``Organization`` and the append-only ``AuditEvent`` log.

Design notes (D-016):

- We translate specific field changes into semantic actions
  (``price_changed``, ``deactivated``, ``reordered``) instead of dumping
  every save as a generic ``updated``. The recent-activity view in the
  admin dashboard reads these as labels, so the signal layer is where
  the human-friendly meaning gets recorded.
- We read the previous row from the DB inside the signal handler
  (``Model._base_manager``) — this avoids paying for ``update_fields``
  contracts that vary between DRF and admin saves.
- Reorder is detected as a ``sort_order`` change on a category.
- ``payload`` snapshots only the fields we care about, not the full
  row, to keep the table compact (7-day retention — see D-016).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .services import record_event


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _decimal_str(value: Any) -> str:
    """Normalize Decimal/str/none into a stable string for payload."""
    if value is None:
        return ""
    if isinstance(value, Decimal):
        return format(value, "f")
    return str(value)


def _item_repr(item) -> str:
    return f"{item.name} ({item.menu.name})"


def _category_repr(category) -> str:
    return f"{category.name} ({category.menu.name})"


def _menu_repr(menu) -> str:
    return f"{menu.name} ({menu.organization.name})"


def _branch_repr(branch) -> str:
    return f"{branch.name} ({branch.organization.name})"


def _theme_repr(theme) -> str:
    return f"Theme<{theme.organization.name}>"


def _org_repr(org) -> str:
    return f"{org.name} ({org.slug})"


# ---------------------------------------------------------------------------
# Menu
# ---------------------------------------------------------------------------
@receiver(post_save, sender="menu.Menu")
def audit_menu_save(sender, instance, created, **kwargs):
    if created:
        record_event(
            organization=instance.organization,
            action="created",
            target_type="menu",
            target_id=instance.pk,
            target_repr=_menu_repr(instance),
            payload={"name": instance.name, "slug": instance.slug},
        )
        return

    previous = (
        sender._base_manager.filter(pk=instance.pk)
        .values("is_active", "name", "slug")
        .first()
    )
    fields_changed: list[str] = []
    if previous is None:
        # Row vanished between save() and now — treat as updated.
        action = "updated"
    else:
        action = "updated"
        if previous["is_active"] != instance.is_active:
            fields_changed.append("is_active")
            action = "published" if instance.is_active else "unpublished"

    record_event(
        organization=instance.organization,
        action=action,
        target_type="menu",
        target_id=instance.pk,
        target_repr=_menu_repr(instance),
        payload={"fields": fields_changed} if fields_changed else {},
    )


@receiver(post_delete, sender="menu.Menu")
def audit_menu_delete(sender, instance, **kwargs):
    record_event(
        organization=instance.organization,
        action="deleted",
        target_type="menu",
        target_id=instance.pk,
        target_repr=_menu_repr(instance),
        payload={"name": instance.name, "slug": instance.slug},
    )


# ---------------------------------------------------------------------------
# MenuCategory
# ---------------------------------------------------------------------------
@receiver(post_save, sender="menu.MenuCategory")
def audit_category_save(sender, instance, created, **kwargs):
    if created:
        record_event(
            organization=instance.menu.organization,
            action="created",
            target_type="category",
            target_id=instance.pk,
            target_repr=_category_repr(instance),
            payload={"name": instance.name, "menu_id": instance.menu_id},
        )
        return

    previous = (
        sender._base_manager.filter(pk=instance.pk)
        .values("sort_order", "name", "is_active")
        .first()
    )
    fields_changed: list[str] = []
    action = "updated"
    payload: dict[str, Any] = {}
    if previous is None:
        record_event(
            organization=instance.menu.organization,
            action=action,
            target_type="category",
            target_id=instance.pk,
            target_repr=_category_repr(instance),
        )
        return

    if previous["sort_order"] != instance.sort_order:
        fields_changed.append("sort_order")
        action = "reordered"
        payload = {"old": previous["sort_order"], "new": instance.sort_order}
    if previous["name"] != instance.name:
        fields_changed.append("name")
    if previous["is_active"] != instance.is_active:
        fields_changed.append("is_active")

    record_event(
        organization=instance.menu.organization,
        action=action,
        target_type="category",
        target_id=instance.pk,
        target_repr=_category_repr(instance),
        payload={**payload, "fields": fields_changed} if fields_changed else payload,
    )


@receiver(post_delete, sender="menu.MenuCategory")
def audit_category_delete(sender, instance, **kwargs):
    record_event(
        organization=instance.menu.organization,
        action="deleted",
        target_type="category",
        target_id=instance.pk,
        target_repr=_category_repr(instance),
        payload={"name": instance.name, "menu_id": instance.menu_id},
    )


# ---------------------------------------------------------------------------
# MenuItem — the most-detailed handler (price + is_active semantics)
# ---------------------------------------------------------------------------
@receiver(post_save, sender="menu.MenuItem")
def audit_item_save(sender, instance, created, **kwargs):
    organization = instance.menu.organization

    if created:
        record_event(
            organization=organization,
            action="created",
            target_type="item",
            target_id=instance.pk,
            target_repr=_item_repr(instance),
            payload={
                "name": instance.name,
                "price": _decimal_str(instance.price),
                "category_id": instance.category_id,
            },
        )
        return

    previous = (
        sender._base_manager.filter(pk=instance.pk)
        .values("price", "is_active", "is_available", "name", "category_id")
        .first()
    )
    if previous is None:
        record_event(
            organization=organization,
            action="updated",
            target_type="item",
            target_id=instance.pk,
            target_repr=_item_repr(instance),
        )
        return

    old_price = previous["price"]
    new_price = instance.price
    old_active = previous["is_active"]
    new_active = instance.is_active

    # Pick the most specific semantic action. We intentionally emit a
    # single event per save — multi-action saves are vanishingly rare in
    # the UI (only bulk PATCH could combine, and the 4B API splits them).
    if old_price != new_price:
        record_event(
            organization=organization,
            action="price_changed",
            target_type="item",
            target_id=instance.pk,
            target_repr=_item_repr(instance),
            payload={
                "old": _decimal_str(old_price),
                "new": _decimal_str(new_price),
            },
        )
        return

    if old_active != new_active:
        record_event(
            organization=organization,
            action="reactivated" if new_active else "deactivated",
            target_type="item",
            target_id=instance.pk,
            target_repr=_item_repr(instance),
            payload={"is_active": new_active},
        )
        return

    fields_changed: list[str] = []
    if previous["is_available"] != instance.is_available:
        fields_changed.append("is_available")
    if previous["name"] != instance.name:
        fields_changed.append("name")
    if previous["category_id"] != instance.category_id:
        fields_changed.append("category_id")

    record_event(
        organization=organization,
        action="updated",
        target_type="item",
        target_id=instance.pk,
        target_repr=_item_repr(instance),
        payload={"fields": fields_changed} if fields_changed else {},
    )


@receiver(post_delete, sender="menu.MenuItem")
def audit_item_delete(sender, instance, **kwargs):
    record_event(
        organization=instance.menu.organization,
        action="deleted",
        target_type="item",
        target_id=instance.pk,
        target_repr=_item_repr(instance),
        payload={
            "name": instance.name,
            "category_id": instance.category_id,
            "menu_id": instance.menu_id,
        },
    )


# ---------------------------------------------------------------------------
# Branch
# ---------------------------------------------------------------------------
@receiver(post_save, sender="branches.Branch")
def audit_branch_save(sender, instance, created, **kwargs):
    if created:
        record_event(
            organization=instance.organization,
            action="created",
            target_type="branch",
            target_id=instance.pk,
            target_repr=_branch_repr(instance),
            payload={"name": instance.name, "slug": instance.slug},
        )
        return

    previous = (
        sender._base_manager.filter(pk=instance.pk)
        .values("name", "is_active", "address")
        .first()
    )
    fields_changed: list[str] = []
    if previous is not None:
        if previous["name"] != instance.name:
            fields_changed.append("name")
        if previous["is_active"] != instance.is_active:
            fields_changed.append("is_active")
        if previous["address"] != instance.address:
            fields_changed.append("address")

    record_event(
        organization=instance.organization,
        action="updated",
        target_type="branch",
        target_id=instance.pk,
        target_repr=_branch_repr(instance),
        payload={"fields": fields_changed} if fields_changed else {},
    )


@receiver(post_delete, sender="branches.Branch")
def audit_branch_delete(sender, instance, **kwargs):
    record_event(
        organization=instance.organization,
        action="deleted",
        target_type="branch",
        target_id=instance.pk,
        target_repr=_branch_repr(instance),
        payload={"name": instance.name, "slug": instance.slug},
    )


# ---------------------------------------------------------------------------
# ThemeConfig
# ---------------------------------------------------------------------------
@receiver(post_save, sender="theme.ThemeConfig")
def audit_theme_save(sender, instance, created, **kwargs):
    if created:
        record_event(
            organization=instance.organization,
            action="created",
            target_type="theme",
            target_id=instance.pk,
            target_repr=_theme_repr(instance),
            payload={"layout_variant": instance.layout_variant},
        )
        return

    record_event(
        organization=instance.organization,
        action="updated",
        target_type="theme",
        target_id=instance.pk,
        target_repr=_theme_repr(instance),
    )


@receiver(post_delete, sender="theme.ThemeConfig")
def audit_theme_delete(sender, instance, **kwargs):
    record_event(
        organization=instance.organization,
        action="deleted",
        target_type="theme",
        target_id=instance.pk,
        target_repr=_theme_repr(instance),
    )


# ---------------------------------------------------------------------------
# Organization
# ---------------------------------------------------------------------------
@receiver(post_save, sender="organizations.Organization")
def audit_org_save(sender, instance, created, **kwargs):
    if created:
        record_event(
            organization=instance,
            action="created",
            target_type="organization",
            target_id=instance.pk,
            target_repr=_org_repr(instance),
            payload={"name": instance.name, "slug": instance.slug},
        )
        return

    record_event(
        organization=instance,
        action="updated",
        target_type="organization",
        target_id=instance.pk,
        target_repr=_org_repr(instance),
    )


@receiver(post_delete, sender="organizations.Organization")
def audit_org_delete(sender, instance, **kwargs):
    # Note: the FK to organization cascades, so the event log for this
    # org is wiped at the same time. We still record a delete event so
    # the lifecycle is captured for any downstream that runs before
    # the cascade (e.g. Celery tasks in a later sprint).
    record_event(
        organization=instance,
        action="deleted",
        target_type="organization",
        target_id=instance.pk,
        target_repr=_org_repr(instance),
    )
