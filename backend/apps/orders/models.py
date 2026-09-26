"""Order models — Sprint 8A (D-022).

Two tables:

* ``Order`` — a customer-to-kitchen order. Tenant-scoped via
  ``organization``. ``order_number`` is a human-readable identifier
  (``MC-20260115-001``) shown to staff, displayed on the kitchen
  ticket and required by the public status-polling URL.

* ``OrderItem`` — a snapshot of the (menu item, quantity, price) tuple
  at the moment the order was placed. ``menu_item`` is nullable so an
  item removed from the menu later doesn't break the order view;
  ``name`` + ``price`` are kept denormalized for exactly that reason.

Order level timestamps (``confirmed_at``, ``preparing_at`` …) are the
state-transition footprints. They are written by the transition helper
in ``apps.orders.services`` — never directly through the API — so the
state machine stays consistent with the audit log.

Decimal precision mirrors OP-6 (Sprint 2) and the rest of the catalog:
``DecimalField(10, 2)`` with negative values rejected at the field
level via the comparable menu item validator.
"""

from __future__ import annotations

from django.core.validators import MinValueValidator
from django.db import models
from decimal import Decimal

from apps.core.models import TimeStampedModel


# ---------------------------------------------------------------------------
# Status choices — keep in sync with STATUS_TRANSITIONS in apps.orders.services
# ---------------------------------------------------------------------------
class OrderStatus(models.TextChoices):
    PENDING = "pending", "Beklemede (müşteri gönderdi)"
    CONFIRMED = "confirmed", "Onaylandı (admin kabul etti)"
    PREPARING = "preparing", "Hazırlanıyor (mutfak)"
    READY = "ready", "Hazır (müşteriye bildirildi)"
    DELIVERED = "delivered", "Teslim Edildi"
    CANCELLED = "cancelled", "İptal Edildi"


class Order(TimeStampedModel):
    """A customer order belonging to one Organization.

    Denormalized branching: ``branch`` and ``menu`` are nullable so
    deleting a branch later doesn't lose orders. The ``metadata`` JSON
    column is reserved for future use (e.g. table session, source =
    QR code, special instructions that aren't per-item).
    """

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        related_name="orders",
        help_text="Tenant scope. PROTECT prevents accidental org deletes.",
    )
    branch = models.ForeignKey(
        "branches.Branch",
        on_delete=models.SET_NULL,
        related_name="orders",
        null=True,
        blank=True,
    )
    menu = models.ForeignKey(
        "menu.Menu",
        on_delete=models.SET_NULL,
        related_name="orders",
        null=True,
        blank=True,
    )

    order_number = models.CharField(
        max_length=30,
        unique=True,
        db_index=True,
        help_text="Human-readable id (e.g. 'MC-20260115-001'). "
        "Generated in services.generate_order_number().",
    )
    table_number = models.CharField(max_length=20, blank=True, default="")
    customer_name = models.CharField(max_length=80)
    customer_phone = models.CharField(max_length=20)
    notes = models.TextField(blank=True, default="")

    status = models.CharField(
        max_length=20,
        choices=OrderStatus.choices,
        default=OrderStatus.PENDING,
        db_index=True,
    )

    total_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text="Server-computed sum of OrderItem.price * quantity (OP-6).",
    )
    currency = models.CharField(max_length=3, default="TRY")

    # Lifecycle timestamps — only set by services.transition_status().
    placed_at = models.DateTimeField(auto_now_add=True, db_index=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    preparing_at = models.DateTimeField(null=True, blank=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Sipariş"
        verbose_name_plural = "Siparişler"
        ordering = ("-placed_at",)
        indexes = [
            # Hot path: dashboard recent orders for an org.
            models.Index(fields=["organization", "-placed_at"]),
            # Kitchen filter: status within an org.
            models.Index(fields=["organization", "status"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.order_number} ({self.status})"


class OrderItem(models.Model):
    """Snapshot line item for an Order.

    The ``menu_item`` FK is nullable on purpose: when an operator
    removes a menu item, the historic order must still render the line
    correctly. ``name`` + ``price`` carry the snapshot.
    """

    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name="items",
    )
    menu_item = models.ForeignKey(
        "menu.MenuItem",
        on_delete=models.SET_NULL,
        related_name="order_items",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=120)
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text="Snapshot of MenuItem.price at order time (OP-6).",
    )
    quantity = models.PositiveIntegerField()
    notes = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        verbose_name = "Sipariş Kalemi"
        verbose_name_plural = "Sipariş Kalemleri"
        ordering = ("id",)

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.quantity}x {self.name}"
