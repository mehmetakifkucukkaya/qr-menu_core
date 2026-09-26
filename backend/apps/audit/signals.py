"""Audit signals — record admin operations on core domain models.

This module owns the bridge between ``pre_save`` / ``post_save`` /
``post_delete`` on ``Menu``, ``MenuCategory``, ``MenuItem``,
``Branch``, ``ThemeConfig`` and ``Organization`` and the append-only
``AuditEvent`` log.

Implementation note (D-016):

  ``post_save`` runs *after* the SQL UPDATE has been applied, so by
  the time the signal fires the DB row already reflects the new
  values. We can't trust a "previous = base_manager.get(pk=...)"
  re-read because it'll see the new state.

  We solve this with a ``pre_save`` hook that snapshots the current
  DB row into a thread-local cache keyed by ``(model_label, pk)``.
  ``post_save`` then reads the snapshot to compute field diffs.
  The cache is cleared in ``post_save`` and ``post_delete``.

Design notes (D-016):

- We translate specific field changes into semantic actions
  (``price_changed``, ``deactivated``, ``reordered``) instead of
  dumping every save as a generic ``updated``. The recent-activity
  view in the admin dashboard reads these as labels, so the signal
  layer is where the human-friendly meaning gets recorded.
- ``payload`` snapshots only the fields we care about, not the full
  row, to keep the table compact (7-day retention — see D-016).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .services import record_event

# Thread-local snapshot cache populated by ``pre_save`` and consumed
# by ``post_save``. Cleared in both, plus in the test conftest's
# reset fixture.
from .context import _local

_SNAPSHOT_ATTR = "_audit_snapshot"


def _set_snapshot(model_label: str, pk: int, snapshot: dict[str, Any] | None) -> None:
    store = getattr(_local, _SNAPSHOT_ATTR, None)
    if store is None:
        store = {}
        setattr(_local, _SNAPSHOT_ATTR, store)
    if snapshot is None:
        store.pop((model_label, pk), None)
    else:
        store[(model_label, pk)] = snapshot


def _get_snapshot(model_label: str, pk) -> dict[str, Any] | None:
    """Pop the snapshot captured by ``pre_save``. Returns None if absent."""
    store = getattr(_local, _SNAPSHOT_ATTR, None)
    if store is None:
        return None
    return store.pop((model_label, pk), None)


def _take_db_snapshot(sender, pk) -> dict[str, Any] | None:
    """Snapshot the current DB row. Used by ``pre_save`` (before the write)."""
    if pk is None:
        return None
    return sender._base_manager.filter(pk=pk).values().first()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _decimal_str(value: Any) -> str:
    """Normalize Decimal/str/None into a stable string for payload."""
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
_MENU_FIELDS = ("is_active", "name", "slug")


@receiver(pre_save, sender="menu.Menu")
def audit_menu_pre_save(sender, instance, **kwargs):
    if instance.pk is None:
        _set_snapshot(sender._meta.label, -1, None)
        return
    _set_snapshot(sender._meta.label, instance.pk, _take_db_snapshot(sender, instance.pk))


@receiver(post_save, sender="menu.Menu")
def audit_menu_save(sender, instance, created, **kwargs):
    label = sender._meta.label
    if created:
        record_event(
            organization=instance.organization,
            action="created",
            target_type="menu",
            target_id=instance.pk,
            target_repr=_menu_repr(instance),
            payload={"name": instance.name, "slug": instance.slug},
        )
        _set_snapshot(label, instance.pk, None)
        return

    snapshot = _get_snapshot(label, instance.pk)
    fields_changed: list[str] = []
    action = "updated"
    if snapshot is not None:
        if snapshot.get("is_active") != instance.is_active:
            fields_changed.append("is_active")
            action = "published" if instance.is_active else "unpublished"
        if snapshot.get("name") != instance.name:
            fields_changed.append("name")
        if snapshot.get("slug") != instance.slug:
            fields_changed.append("slug")

    record_event(
        organization=instance.organization,
        action=action,
        target_type="menu",
        target_id=instance.pk,
        target_repr=_menu_repr(instance),
        payload={"fields": fields_changed} if fields_changed else {},
    )
    _set_snapshot(label, instance.pk, None)


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
    _set_snapshot(sender._meta.label, instance.pk, None)


# ---------------------------------------------------------------------------
# MenuCategory
# ---------------------------------------------------------------------------
@receiver(pre_save, sender="menu.MenuCategory")
def audit_category_pre_save(sender, instance, **kwargs):
    label = sender._meta.label
    if instance.pk is None:
        _set_snapshot(label, -1, None)
        return
    _set_snapshot(label, instance.pk, _take_db_snapshot(sender, instance.pk))


@receiver(post_save, sender="menu.MenuCategory")
def audit_category_save(sender, instance, created, **kwargs):
    label = sender._meta.label
    if created:
        record_event(
            organization=instance.menu.organization,
            action="created",
            target_type="category",
            target_id=instance.pk,
            target_repr=_category_repr(instance),
            payload={"name": instance.name, "menu_id": instance.menu_id},
        )
        _set_snapshot(label, instance.pk, None)
        return

    snapshot = _get_snapshot(label, instance.pk)
    fields_changed: list[str] = []
    action = "updated"
    payload: dict[str, Any] = {}
    if snapshot is not None:
        if snapshot.get("sort_order") != instance.sort_order:
            fields_changed.append("sort_order")
            action = "reordered"
            payload = {"old": snapshot.get("sort_order"), "new": instance.sort_order}
        if snapshot.get("name") != instance.name:
            fields_changed.append("name")
        if snapshot.get("is_active") != instance.is_active:
            fields_changed.append("is_active")

    final_payload = {**payload, "fields": fields_changed} if fields_changed else payload
    record_event(
        organization=instance.menu.organization,
        action=action,
        target_type="category",
        target_id=instance.pk,
        target_repr=_category_repr(instance),
        payload=final_payload,
    )
    _set_snapshot(label, instance.pk, None)


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
    _set_snapshot(sender._meta.label, instance.pk, None)


# ---------------------------------------------------------------------------
# MenuItem — the most-detailed handler (price + is_active semantics)
# ---------------------------------------------------------------------------
_ITEM_FIELDS_FOR_DIFF = ("price", "is_active", "is_available", "name", "category_id")


@receiver(pre_save, sender="menu.MenuItem")
def audit_item_pre_save(sender, instance, **kwargs):
    label = sender._meta.label
    if instance.pk is None:
        _set_snapshot(label, -1, None)
        return
    _set_snapshot(label, instance.pk, _take_db_snapshot(sender, instance.pk))


@receiver(post_save, sender="menu.MenuItem")
def audit_item_save(sender, instance, created, **kwargs):
    label = sender._meta.label
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
        _set_snapshot(label, instance.pk, None)
        return

    snapshot = _get_snapshot(label, instance.pk)
    if snapshot is None:
        record_event(
            organization=organization,
            action="updated",
            target_type="item",
            target_id=instance.pk,
            target_repr=_item_repr(instance),
        )
        _set_snapshot(label, instance.pk, None)
        return

    old_price = snapshot.get("price")
    new_price = instance.price
    old_active = snapshot.get("is_active")
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
        _set_snapshot(label, instance.pk, None)
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
        _set_snapshot(label, instance.pk, None)
        return

    fields_changed: list[str] = []
    if snapshot.get("is_available") != instance.is_available:
        fields_changed.append("is_available")
    if snapshot.get("name") != instance.name:
        fields_changed.append("name")
    if snapshot.get("category_id") != instance.category_id:
        fields_changed.append("category_id")

    record_event(
        organization=organization,
        action="updated",
        target_type="item",
        target_id=instance.pk,
        target_repr=_item_repr(instance),
        payload={"fields": fields_changed} if fields_changed else {},
    )
    _set_snapshot(label, instance.pk, None)


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
    _set_snapshot(sender._meta.label, instance.pk, None)


# ---------------------------------------------------------------------------
# Branch
# ---------------------------------------------------------------------------
@receiver(pre_save, sender="branches.Branch")
def audit_branch_pre_save(sender, instance, **kwargs):
    label = sender._meta.label
    if instance.pk is None:
        _set_snapshot(label, -1, None)
        return
    _set_snapshot(label, instance.pk, _take_db_snapshot(sender, instance.pk))


@receiver(post_save, sender="branches.Branch")
def audit_branch_save(sender, instance, created, **kwargs):
    label = sender._meta.label
    if created:
        record_event(
            organization=instance.organization,
            action="created",
            target_type="branch",
            target_id=instance.pk,
            target_repr=_branch_repr(instance),
            payload={"name": instance.name, "slug": instance.slug},
        )
        _set_snapshot(label, instance.pk, None)
        return

    snapshot = _get_snapshot(label, instance.pk)
    fields_changed: list[str] = []
    if snapshot is not None:
        if snapshot.get("name") != instance.name:
            fields_changed.append("name")
        if snapshot.get("is_active") != instance.is_active:
            fields_changed.append("is_active")
        if snapshot.get("address") != instance.address:
            fields_changed.append("address")

    record_event(
        organization=instance.organization,
        action="updated",
        target_type="branch",
        target_id=instance.pk,
        target_repr=_branch_repr(instance),
        payload={"fields": fields_changed} if fields_changed else {},
    )
    _set_snapshot(label, instance.pk, None)


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
    _set_snapshot(sender._meta.label, instance.pk, None)


# ---------------------------------------------------------------------------
# ThemeConfig
# ---------------------------------------------------------------------------
@receiver(pre_save, sender="theme.ThemeConfig")
def audit_theme_pre_save(sender, instance, **kwargs):
    label = sender._meta.label
    if instance.pk is None:
        _set_snapshot(label, -1, None)
        return
    _set_snapshot(label, instance.pk, _take_db_snapshot(sender, instance.pk))


@receiver(post_save, sender="theme.ThemeConfig")
def audit_theme_save(sender, instance, created, **kwargs):
    label = sender._meta.label
    if created:
        record_event(
            organization=instance.organization,
            action="created",
            target_type="theme",
            target_id=instance.pk,
            target_repr=_theme_repr(instance),
            payload={"layout_variant": instance.layout_variant},
        )
        _set_snapshot(label, instance.pk, None)
        return

    record_event(
        organization=instance.organization,
        action="updated",
        target_type="theme",
        target_id=instance.pk,
        target_repr=_theme_repr(instance),
    )
    _set_snapshot(label, instance.pk, None)


@receiver(post_delete, sender="theme.ThemeConfig")
def audit_theme_delete(sender, instance, **kwargs):
    record_event(
        organization=instance.organization,
        action="deleted",
        target_type="theme",
        target_id=instance.pk,
        target_repr=_theme_repr(instance),
    )
    _set_snapshot(sender._meta.label, instance.pk, None)


# ---------------------------------------------------------------------------
# Organization
# ---------------------------------------------------------------------------
@receiver(pre_save, sender="organizations.Organization")
def audit_org_pre_save(sender, instance, **kwargs):
    label = sender._meta.label
    if instance.pk is None:
        _set_snapshot(label, -1, None)
        return
    _set_snapshot(label, instance.pk, _take_db_snapshot(sender, instance.pk))


@receiver(post_save, sender="organizations.Organization")
def audit_org_save(sender, instance, created, **kwargs):
    label = sender._meta.label
    if created:
        record_event(
            organization=instance,
            action="created",
            target_type="organization",
            target_id=instance.pk,
            target_repr=_org_repr(instance),
            payload={"name": instance.name, "slug": instance.slug},
        )
        _set_snapshot(label, instance.pk, None)
        return

    record_event(
        organization=instance,
        action="updated",
        target_type="organization",
        target_id=instance.pk,
        target_repr=_org_repr(instance),
    )
    _set_snapshot(label, instance.pk, None)


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
    _set_snapshot(sender._meta.label, instance.pk, None)
