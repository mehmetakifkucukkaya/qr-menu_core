"""Public URL patterns for the orders app — Sprint 8A.

Mounted by ``config/urls`` under ``/api/v1/public/``::

    POST /api/v1/public/orders
    GET  /api/v1/public/orders/{order_number}/status
"""

from django.urls import path

from .views import PublicOrderCreateView, PublicOrderStatusView

urlpatterns = [
    path(
        "orders",
        PublicOrderCreateView.as_view(),
        name="public-order-create",
    ),
    path(
        "orders/<str:order_number>/status",
        PublicOrderStatusView.as_view(),
        name="public-order-status",
    ),
]
