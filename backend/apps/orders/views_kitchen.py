"""The kitchen board - ``GET /api/v1/admin/kitchen/board`` (SPEC_PILOT_READINESS 5.1).

One call returns the three columns the kitchen works from, so the tablet needs
neither several requests nor any filtering of its own:

* ``new``        - ``pending``
* ``preparing``  - ``confirmed`` + ``preparing``
* ``ready``      - ``ready``

Delivered and cancelled orders are not on the board (they live in the Siparişler
page). Cards are oldest first; the customer's phone number is deliberately not
part of the payload (it is on the owner's order page).
"""

from __future__ import annotations

from django.db.models import Count
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsOrganizationMember

from .models import Order, OrderStatus
from .views import _resolve_organization, _wrap

#: The most cards one call returns; ``counts`` and ``truncated`` tell the truth beyond it.
MAX_CARDS = 100

COLUMN_OF_STATUS = {
    OrderStatus.PENDING: "new",
    OrderStatus.CONFIRMED: "preparing",
    OrderStatus.PREPARING: "preparing",
    OrderStatus.READY: "ready",
}
COLUMNS = ("new", "preparing", "ready")


class KitchenBoardView(APIView):
    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request) -> Response:
        organization = _resolve_organization(request.user)
        now = timezone.now()
        columns: dict[str, list] = {name: [] for name in COLUMNS}
        counts = {name: 0 for name in COLUMNS}
        truncated = False

        if organization is not None:
            open_orders = Order.objects.filter(
                organization=organization, status__in=list(COLUMN_OF_STATUS)
            )
            for row in open_orders.values("status").annotate(n=Count("id")):
                counts[COLUMN_OF_STATUS[row["status"]]] += row["n"]
            truncated = sum(counts.values()) > MAX_CARDS

            today = timezone.localdate(now)
            for order in open_orders.prefetch_related("items").order_by("placed_at", "id")[:MAX_CARDS]:
                columns[COLUMN_OF_STATUS[order.status]].append(
                    {
                        "id": order.id,
                        "order_number": order.order_number,
                        "daily_seq": order.daily_seq,
                        "status": order.status,
                        "table_number": order.table_number,
                        "customer_name": order.customer_name,
                        "order_notes": order.notes,
                        "placed_at": order.placed_at.isoformat(),
                        "age_seconds": max(0, int((now - order.placed_at).total_seconds())),
                        # Still open from an earlier local day: the tablet says "dünden".
                        "is_stale": timezone.localtime(order.placed_at).date() < today,
                        "items": [
                            {
                                "id": item.id,
                                "name": item.name,
                                "quantity": item.quantity,
                                "notes": item.notes,
                                "allergens": item.allergens,
                            }
                            for item in order.items.all()
                        ],
                    }
                )

        return _wrap(
            {
                "columns": columns,
                "counts": counts,
                "truncated": truncated,
                "server_time": now.isoformat(),
            },
            request,
        )
