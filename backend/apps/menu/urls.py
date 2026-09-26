"""URL patterns for menu admin endpoints.

    GET/POST       /api/v1/admin/menus/
    GET/PATCH/DEL  /api/v1/admin/menus/{id}/
    GET/POST       /api/v1/admin/menus/{id}/categories/    (nested list)
    GET/POST/PATCH /api/v1/admin/categories/
    GET/PATCH/DEL  /api/v1/admin/categories/{id}/
    POST           /api/v1/admin/categories/reorder
    GET/POST       /api/v1/admin/menu-items/
    GET/PATCH/DEL  /api/v1/admin/menu-items/{id}/
    POST           /api/v1/admin/menu-items/reorder
    GET            /api/v1/admin/allergens/
    GET            /api/v1/admin/dietary-tags/
"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AllergenViewSet,
    CategoriesReorderView,
    DietaryTagViewSet,
    ItemsReorderView,
    MenuCategoryViewSet,
    MenuItemViewSet,
    MenuViewSet,
)

router = DefaultRouter()
router.register(r"menus", MenuViewSet, basename="menu")
router.register(r"categories", MenuCategoryViewSet, basename="menu-category")
router.register(r"menu-items", MenuItemViewSet, basename="menu-item")
router.register(r"allergens", AllergenViewSet, basename="allergen")
router.register(r"dietary-tags", DietaryTagViewSet, basename="dietary-tag")

urlpatterns = router.urls + [
    path("categories/reorder", CategoriesReorderView.as_view(), name="categories-reorder"),
    path("menu-items/reorder", ItemsReorderView.as_view(), name="menu-items-reorder"),
]