"""Admin kitchen URL patterns — Sprint 8A (D-022).

Mounted by ``config/urls`` under ``/api/v1/admin/kitchen/``::

    GET /api/v1/admin/kitchen/tickets      (the older flat feed)
    GET /api/v1/admin/kitchen/board        (the three columns the tablet works from)

Kept in its own file so the V1 demo URL ("go straight to the kitchen
display") is stable and the kitchen namespace can grow independently
from the orders CRUD namespace.
"""

from django.urls import path

from .views import KitchenTicketsView
from .views_kitchen import KitchenBoardView

urlpatterns = [
    path(
        "tickets",
        KitchenTicketsView.as_view(),
        name="kitchen-tickets",
    ),
    path(
        "board",
        KitchenBoardView.as_view(),
        name="kitchen-board",
    ),
]
