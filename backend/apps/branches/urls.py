"""URL patterns for branch admin endpoints."""

from rest_framework.routers import DefaultRouter

from .views import BranchViewSet

router = DefaultRouter()
router.register(r"", BranchViewSet, basename="branch")

urlpatterns = router.urls
