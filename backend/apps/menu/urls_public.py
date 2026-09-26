"""Public menu URL patterns (Sprint 3).

Mounted by ``config.urls`` under ``/api/v1/public/``:

    GET /api/v1/public/menus/{business_slug}?branch=&locale=

The view (``PublicMenuView``) is unauthenticated, throttled to 60 req/min
per IP, and returns the full menu payload via ``get_full_menu_payload``.
"""

from django.urls import path

from .views_public import PublicMenuView

urlpatterns = [
    path(
        "menus/<slug:business_slug>",
        PublicMenuView.as_view(),
        name="public-menu",
    ),
]
