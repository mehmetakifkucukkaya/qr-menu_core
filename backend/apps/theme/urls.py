"""URL patterns for theme admin endpoints."""

from rest_framework.routers import DefaultRouter

from .views import ThemeConfigViewSet

router = DefaultRouter()
router.register(r"", ThemeConfigViewSet, basename="theme-config")

urlpatterns = router.urls
