"""Order serializers — Sprint 8A (D-022).

Three layers:

* :class:`OrderItemSerializer` — read-only snapshot line serializer.
* :class:`OrderSerializer` — full read serializer with nested items
  (used by the admin detail view).
* :class:`PublicOrderCreateSerializer` — write serializer for the
  public POST endpoint. Validates shape and delegates business rules
  to ``services.create_order`` (price/availability checks).

We intentionally keep admin read serializers simple. The admin
list/detail/endpoints construct their payloads manually in
``apps.orders.views`` so they can include derived fields like
``item_count`` or ``time_since_placed`` without a separate serializer
class per shape.
"""

from __future__ import annotations

from rest_framework import serializers

from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ("id", "menu_item", "name", "price", "quantity", "notes")
        read_only_fields = fields


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)

    class Meta:
        model = Order
        fields = (
            "id",
            "order_number",
            "organization",
            "branch",
            "branch_name",
            "table_number",
            "customer_name",
            "customer_phone",
            "notes",
            "status",
            "total_amount",
            "currency",
            "placed_at",
            "confirmed_at",
            "preparing_at",
            "ready_at",
            "delivered_at",
            "cancelled_at",
            "items",
        )
        read_only_fields = fields


class PublicOrderLineSerializer(serializers.Serializer):
    """Single line for the public POST endpoint.

    The client only writes ``menu_item_id`` + ``quantity`` + optional
    ``notes``. Price is always derived server-side; ``menu_item_id`` is
    kept as a plain integer to skip extra queryset scoping on a public
    endpoint that is unauthenticated.
    """

    menu_item_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=99)
    notes = serializers.CharField(
        max_length=200, required=False, allow_blank=True, default=""
    )


class PublicOrderCreateSerializer(serializers.Serializer):
    """Body validator for ``POST /api/v1/public/orders``.

    Auth/org resolution happens in the view (which needs the raw slugs),
    so the serializer doesn't enforce organization membership.

    Sprint 10A (D-025): optional ``loyalty_points_to_redeem`` field.
    The view applies server-side validation (balance + min threshold
    + loyalty enabled) before letting the order through.
    """

    organization_slug = serializers.SlugField(max_length=60)
    branch_slug = serializers.SlugField(
        max_length=120, required=False, allow_blank=True, default=""
    )
    table_number = serializers.CharField(
        max_length=20, required=False, allow_blank=True, default=""
    )
    customer_name = serializers.CharField(max_length=80)
    customer_phone = serializers.CharField(max_length=20)
    notes = serializers.CharField(
        max_length=500, required=False, allow_blank=True, default=""
    )
    items = PublicOrderLineSerializer(many=True, allow_empty=False)
    loyalty_points_to_redeem = serializers.IntegerField(
        required=False, default=0, min_value=0, max_value=10_000_000,
    )

    def validate_customer_name(self, value: str) -> str:
        v = (value or "").strip()
        if not v:
            raise serializers.ValidationError("İsim boş bırakılamaz.")
        return v

    def validate_customer_phone(self, value: str) -> str:
        v = (value or "").strip()
        if not v:
            raise serializers.ValidationError("Telefon boş bırakılamaz.")
        # Turkish mobile/landline leniency — strip spaces/dashes/parentheses.
        digits = sum(ch.isdigit() for ch in v)
        if digits < 7:
            raise serializers.ValidationError("Telefon numarası çok kısa.")
        return v
