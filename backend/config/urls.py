"""Root URL configuration for qr-menu_core backend."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    # Health check (no auth, application/json).
    path("health", include("apps.health.urls")),
    # API v1 — auth, current user, organization/branches/theme admin.
    path("api/v1/auth/", include("apps.accounts.auth_urls")),
    path("api/v1/", include("apps.accounts.urls")),
    path("api/v1/admin/organizations/", include("apps.organizations.urls")),
    path("api/v1/admin/branches/", include("apps.branches.urls")),
    path("api/v1/admin/theme/", include("apps.theme.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
