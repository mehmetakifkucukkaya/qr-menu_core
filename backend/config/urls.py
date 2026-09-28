"""Root URL configuration for qr-menu_core backend."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    # Health check (no auth, application/json).
    path("health", include("apps.health.urls")),
    # API v1 — auth, current user, organization/branches/theme/menu admin.
    path("api/v1/auth/", include("apps.accounts.auth_urls")),
    path("api/v1/", include("apps.accounts.urls")),
    path("api/v1/admin/organizations/", include("apps.organizations.urls")),
    path("api/v1/admin/branches/", include("apps.branches.urls")),
    path("api/v1/admin/theme/", include("apps.theme.urls")),
    path("api/v1/admin/", include("apps.menu.urls")),
    # Sprint 4C — admin dashboard summary (counts + recent events).
    path("api/v1/admin/", include("apps.audit.urls")),
    # Sprint 5A — QR code admin CRUD + PNG download.
    path("api/v1/admin/", include("apps.qr.urls")),
    # Sprint 5A — multipart media upload.
    path("api/v1/admin/media/", include("apps.media.urls")),
    # Sprint 5A — admin analytics overview.
    path("api/v1/admin/analytics/", include("apps.analytics.urls_admin")),
    # Sprint 7A — AI PDF menu import (D-021).
    path("api/v1/admin/pdf-import/", include("apps.pdf_import.urls")),
    # Sprint 8A — Order flow (D-022). Admin lists/details/state-machine +
    # kitchen display. See apps/orders/urls_admin.py for prefix layout.
    path("api/v1/admin/orders/", include("apps.orders.urls_orders")),
    path("api/v1/admin/kitchen/", include("apps.orders.urls_kitchen")),
    # Sprint 9A — AI translate + describe (D-021 reuse). Two prefixes,
    # one app — see apps/translate/urls.py for the two URLConf objects.
    # Import both lists and stitch them in: ``include((module, ns))``
    # forces us to a single ``urlpatterns`` per module, but we want a
    # second prefix — so we mount each prefix separately via an inline
    # ``path("", include(...))``.
    path(
        "api/v1/admin/translate/",
        include(("apps.translate.urls", "translate"), namespace="translate"),
    ),
    path(
        "api/v1/admin/describe/",
        include(
            ("apps.translate.urls_describe", "describe"),
            namespace="describe",
        ),
    ),
    # Sprint 3 — public unauthenticated read endpoints (throttled).
    path("api/v1/public/", include("apps.menu.urls_public")),
    # Sprint 5A — public events endpoint (throttled, IP/UA hash).
    path("api/v1/public/", include("apps.analytics.urls_public")),
    # Sprint 8A — public order placement + status polling (D-022).
    path("api/v1/public/", include("apps.orders.urls_public")),
    # Sprint 10A — Customer accounts + magic-link auth + loyalty ledger (D-025).
    # Public + customer surface under /api/v1/account/, admin under
    # /api/v1/account/admin/. Two separate URLConfs so ``config/urls``
    # can mount each prefix cleanly.
    path("api/v1/account/", include("apps.account.urls")),
    path("api/v1/account/admin/", include("apps.account.urls_admin")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
