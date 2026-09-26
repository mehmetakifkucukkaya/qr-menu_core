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
    # Sprint 3 — public unauthenticated read endpoints (throttled).
    path("api/v1/public/", include("apps.menu.urls_public")),
    # Sprint 5A — public events endpoint (throttled, IP/UA hash).
    path("api/v1/public/", include("apps.analytics.urls_public")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
