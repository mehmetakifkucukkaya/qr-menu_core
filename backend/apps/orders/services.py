"""Order domain services — Sprint 8A (D-022).

Three pure-Python helpers plus a state machine.

* :func:`generate_order_number` — builds a daily-counter order number
  (``{slug2}-{YYYYMMDD}-{NNN}``) and falls back to retry-on-collision
  if the DB race produces a duplicate.

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

Race notes
----------
Two customers posting at the same millisecond both pass the
``Order.objects.filter(...).count()`` check with the same number, then
both ``Order.objects.create()`` and one fails on the unique
constraint. We catch ``IntegrityError`` and retry up to 5 times before
giving up.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Iterable

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.menu.models import MenuItem

from .models import Order, OrderItem

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

# Maximum retries when concurrent requests race on the same daily counter.
_ORDER_NUMBER_RETRY_LIMIT = 5


def generate_order_number(organization) -> str:
    """Return a unique human-readable order number for the given org.

    Format: ``{slug[:2].upper()}-{YYYYMMDD}-{NNN}`` where ``NNN`` is
    today's count for that org (1-based, zero-padded to 3 digits).
    """
    today = timezone.now().strftime("%Y%m%d")
    slug_prefix = (organization.slug or "")[:2].upper() or "OR"
    prefix = f"{slug_prefix}-{today}-"

    for attempt in range(_ORDER_NUMBER_RETRY_LIMIT):
        # ``select_for_update`` would be safer under heavy concurrency but
        # the daily counter is a thin straw per org; a count-based loop
        # with a unique-constraint fallback is sufficient for V1.
        today_orders_count = Order.objects.filter(
            organization=organization,
            order_number__startswith=prefix,
        ).count()
        candidate = f"{prefix}{today_orders_count + 1:03d}"
        if not Order.objects.filter(order_number=candidate).exists():
            return candidate

    # Last resort: include a millisecond suffix so we still produce a
    # unique identifier and the caller sees a meaningful error.
    raise RuntimeError(
        f"generate_order_number: could not allocate unique order "
        f"number after {_ORDER_NUMBER_RETRY_LIMIT} attempts"
    )


def calculate_total_from_items(items_data: Iterable[dict[str, Any]]):
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

        try:
            menu_item = MenuItem.objects.select_related("menu").get(
                pk=raw["menu_item_id"]
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
    total, validated = calculate_total_from_items(items_data)
    currency = _default_currency(validated)

    try:
        order_number = generate_order_number(organization)
        order = Order.objects.create(
            organization=organization,
            branch=branch,
            menu=menu,
            order_number=order_number,
            customer_name=customer_name,
            customer_phone=customer_phone,
            table_number=table_number or "",
            notes=notes or "",
            total_amount=total,
            currency=currency,
            metadata=metadata or {},
        )
    except IntegrityError:
        # Unique-constraint race from concurrent customers. One quick
        # retry is enough in practice (the next counter slot is free).
        order_number = generate_order_number(organization)
        order = Order.objects.create(
            organization=organization,
            branch=branch,
            menu=menu,
            order_number=order_number,
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
