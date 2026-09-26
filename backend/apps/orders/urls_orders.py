"""Admin orders URL patterns — Sprint 8A (D-022).

Mounted by ``config/urls`` under ``/api/v1/admin/orders/``::

    GET    /api/v1/admin/orders/                 — list + filter
    GET    /api/v1/admin/orders/{id}             — full detail
    POST   /api/v1/admin/orders/{id}/status      — state-machine update

The kitchen endpoints live in ``apps.orders.urls_kitchen`` and are
mounted under ``/api/v1/admin/kitchen/``.
"""

from django.urls import path

from .views import (
    AdminOrderDetailView,
    AdminOrderStatusView,
    AdminOrdersView,
)

urlpatterns = [
    path(
        "",
        AdminOrdersView.as_view(),
        name="admin-orders-list",
    ),
    path(
        "<int:pk>",
        AdminOrderDetailView.as_view(),
        name="admin-order-detail",
    ),
    path(
        "<int:pk>/status",
        AdminOrderStatusView.as_view(),
        name="admin-order-status",
    ),
]
