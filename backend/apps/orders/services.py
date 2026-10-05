"""Order domain services — Sprint 8A (D-022).

Three pure-Python helpers plus a state machine.

* :func:`generate_order_number` — builds a daily-counter order number
  (``{slug2}-{YYYYMMDD}-{NNN}``) from the locked ``OrderCounter`` row.

* :func:`calculate_total_from_items` — server-side total calculation.
  Client-supplied prices are **never** trusted; we look up the
  current ``MenuItem.price`` for each requested id and reject items
  that are unavailable, inactive, or have invalid quantities.

* :func:`create_order` — atomic order construction. Wraps Order +
  OrderItem creation in ``transaction.atomic`` so a failure mid-write
  rolls back the order header.

* :func:`transition_status` — validates the source/target pair against
  ``STATUS_TRANSITIONS``, stamps the appropriate timestamp, persists
  the change, and emits an audit event.

Decimal precision follows OP-6 (Sprint 2) — see ``Order.total_amount``
field validators.

Numbering
---------
``order_number`` suffixes and ``Order.daily_seq`` come from ``OrderCounter``
rows advanced under a row lock (:func:`next_counter`), so concurrent customers
never share a number and no retry loop is needed.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Iterable

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from apps.menu.models import MenuItem

from .models import Order, OrderCounter, OrderItem, OrderStatus

logger = logging.getLogger(__name__)


# Status transition graph (D-022 + SPRINT_8_PLAN.md).
# Each value is the set of statuses reachable from the current one.
STATUS_TRANSITIONS: dict[str, set[str]] = {
    OrderStatus.PENDING: {OrderStatus.CONFIRMED, OrderStatus.CANCELLED},
    OrderStatus.CONFIRMED: {OrderStatus.PREPARING, OrderStatus.CANCELLED},
    OrderStatus.PREPARING: {OrderStatus.READY, OrderStatus.CANCELLED},
    OrderStatus.READY: {OrderStatus.DELIVERED},
    OrderStatus.DELIVERED: set(),  # terminal
    OrderStatus.CANCELLED: set(),  # terminal
}

def _highest_suffix(prefix: str) -> int:
    """Highest ``NNN`` already handed out under ``prefix`` (orders that predate the counter)."""
    highest = 0
    for number in Order.objects.filter(order_number__startswith=prefix).values_list(
        "order_number", flat=True
    ):
        suffix = number[len(prefix):]
        if suffix.isdigit():
            highest = max(highest, int(suffix))
    return highest


def next_counter(scope: str, key: str, day, *, start_at: int = 0) -> int:
    """Next value of the (scope, key, day) counter: ``start_at + 1`` the first time.

    The row is locked (``select_for_update``) while it is advanced, so two
    orders in the same instant can never share a number. When two requests both
    see "no row yet" the loser of the insert falls back to the winner's row.
    ``start_at`` only matters when the row is created (a day that already has
    orders from before the counter existed).
    """
    with transaction.atomic():
        counter = (
            OrderCounter.objects.select_for_update()
            .filter(scope=scope, key=key, day=day)
            .first()
        )
        if counter is None:
            try:
                with transaction.atomic():
                    counter = OrderCounter.objects.create(
                        scope=scope, key=key, day=day, last_value=start_at
                    )
            except IntegrityError:
                counter = OrderCounter.objects.select_for_update().get(
                    scope=scope, key=key, day=day
                )
        OrderCounter.objects.filter(pk=counter.pk).update(last_value=F("last_value") + 1)
        counter.refresh_from_db(fields=["last_value"])
        return counter.last_value


def generate_order_number(organization, day=None) -> str:
    """Return a unique human-readable order number for the given org.

    Format: ``{slug[:2].upper()}-{YYYYMMDD}-{NNN}``, ``NNN`` being the next
    value of the daily counter for that prefix. Two businesses whose slugs
    start with the same two letters share the counter (that is what keeps the
    number globally unique); the day is the local day (Europe/Istanbul).
    """
    day = day or timezone.localdate()
    slug_prefix = (organization.slug or "")[:2].upper() or "OR"
    prefix = f"{slug_prefix}-{day:%Y%m%d}-"
    number = next_counter(
        OrderCounter.SCOPE_PREFIX, slug_prefix, day, start_at=_highest_suffix(prefix)
    )
    return f"{prefix}{number:03d}"


def calculate_total_from_items(items_data: Iterable[dict[str, Any]], organization):
    """Validate line items + return ``(total, validated_lines)``.

    Each item dict must contain ``menu_item_id`` and ``quantity``.
    ``price`` and ``notes`` are optional and *ignored* — they come from
    the DB snapshot, not the client.

    Raises ``django.core.exceptions.ValidationError`` (with a Turkish
    message) for any of:

    * unknown ``menu_item_id``
    * menu item flagged ``is_active=False`` (operator took it off the menu)
    * menu item flagged ``is_available=False`` (out of stock today)
    * non-positive quantity
    """
    total = Decimal("0")
    validated: list[dict[str, Any]] = []

    for raw in items_data:
        if not isinstance(raw, dict):
            raise ValidationError("Her kalem bir obje olmalı.")
        if "menu_item_id" not in raw or "quantity" not in raw:
            raise ValidationError(
                "Her kalem için menu_item_id ve quantity zorunludur."
            )

        try:
            quantity = int(raw["quantity"])
        except (TypeError, ValueError):
            raise ValidationError("Geçersiz miktar.") from None
        if quantity < 1:
            raise ValidationError("Geçersiz miktar (en az 1 olmalı).")

        # Only the business's own items: a bare ``pk`` lookup let a customer of
        # business A order (and price) an item of business B (ANALYSIS_1 F-10).
        try:
            menu_item = MenuItem.objects.select_related("menu").get(
                pk=raw["menu_item_id"], menu__organization=organization
            )
        except MenuItem.DoesNotExist as exc:
            raise ValidationError(
                f"Ürün bulunamadı (id={raw['menu_item_id']})."
            ) from exc

        if not menu_item.is_active:
            raise ValidationError(f"{menu_item.name} menüde aktif değil.")
        if not menu_item.is_available:
            raise ValidationError(f"{menu_item.name} şu an mevcut değil.")

        line_total = menu_item.price * quantity
        total += line_total
        validated.append(
            {
                "menu_item": menu_item,
                "quantity": quantity,
                "notes": (raw.get("notes") or "")[:200],
                "price": menu_item.price,
                "name": menu_item.name,
                "currency": menu_item.currency,
            }
        )

    if not validated:
        raise ValidationError("Sipariş için en az bir kalem gerekli.")

    return total, validated


def _default_currency(validated: list[dict[str, Any]]) -> str:
    for line in validated:
        if line.get("currency"):
            return line["currency"]
    return "TRY"


@transaction.atomic
def create_order(
    *,
    organization,
    items_data: Iterable[dict[str, Any]],
    customer_name: str,
    customer_phone: str,
    branch=None,
    menu=None,
    table_number: str = "",
    notes: str = "",
    metadata: dict | None = None,
) -> Order:
    """Persist an Order + OrderItems atomically.

    All kwargs are keyword-only. Customer fields are trimmed upstream
    (views) before being passed in.
    """
    total, validated = calculate_total_from_items(items_data, organization)
    currency = _default_currency(validated)

    # Both numbers come from locked counter rows inside this transaction: a
    # failure further down takes them back (no gaps) and no two orders race.
    day = timezone.localdate()
    order = Order.objects.create(
        organization=organization,
        branch=branch,
        menu=menu,
        order_number=generate_order_number(organization, day),
        daily_seq=next_counter(OrderCounter.SCOPE_ORG, str(organization.id), day),
        customer_name=customer_name,
        customer_phone=customer_phone,
        table_number=table_number or "",
        notes=notes or "",
        total_amount=total,
        currency=currency,
        metadata=metadata or {},
    )

    OrderItem.objects.bulk_create(
        [
            OrderItem(
                order=order,
                menu_item=line["menu_item"],
                name=line["name"],
                price=line["price"],
                quantity=line["quantity"],
                notes=line["notes"],
            )
            for line in validated
        ]
    )
    return order


def transition_status(order: Order, new_status: str, actor=None) -> Order:
    """Validate the transition + stamp timestamp + emit audit event.

    Raises ``ValidationError`` for illegal transitions. The audit call
    happens *after* the save so the event row's ``target_id`` matches
    the persisted row (and the rollback on a partial save would not
    leak an "audited" but unstamped transition).
    """
    # Local import keeps services import-order independent from apps.audit.
    from apps.audit.services import record_event

    current = order.status
    allowed = STATUS_TRANSITIONS.get(current, set())
    if new_status not in allowed:
        allowed_list = sorted(allowed) if allowed else ["(terminal)"]
        raise ValidationError(
            f"Geçersiz durum geçişi: {current} -> {new_status}. "
            f"İzin verilen: {', '.join(allowed_list)}."
        )

    if new_status not in {choice for choice, _ in OrderStatus.choices}:
        # Programmer error — guard against typos in the call site.
        raise ValidationError(f"Bilinmeyen durum: {new_status}")

    order.status = new_status
    now = timezone.now()
    if new_status == OrderStatus.CONFIRMED:
        order.confirmed_at = now
    elif new_status == OrderStatus.PREPARING:
        order.preparing_at = now
    elif new_status == OrderStatus.READY:
        order.ready_at = now
    elif new_status == OrderStatus.DELIVERED:
        order.delivered_at = now
    elif new_status == OrderStatus.CANCELLED:
        order.cancelled_at = now

    order.save(update_fields=["status", "updated_at",
                              "confirmed_at", "preparing_at",
                              "ready_at", "delivered_at", "cancelled_at"])

    # Sprint 10A — loyalty award trigger (D-025). When an order
    # transitions to "delivered" and the customer is linked, we
    # append an EARN row to the loyalty ledger. Idempotent via
    # the (order, type='earn') unique constraint; safe to call
    # repeatedly if the state machine ever retries.
    if (
        new_status == OrderStatus.DELIVERED
        and order.customer_id is not None
    ):
        from apps.account.services import award_points_for_order
        try:
            award_points_for_order(order)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning(
                "award_points_for_order failed for %s: %s",
                order.order_number,
                exc,
            )

    action = f"order_{new_status}"
    record_event(
        organization=order.organization,
        action=action,
        target_type="order",
        target_id=order.id,
        target_repr=f"{order.order_number} ({order.customer_name})",
        payload={"from": current, "to": new_status},
    )
    return order
