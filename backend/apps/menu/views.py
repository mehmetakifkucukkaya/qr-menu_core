"""Menu API views (admin-only, tenant-isolated).

Standard CRUD for Menu / MenuCategory / MenuItem + dedicated reorder
endpoints. Reference data (Allergen, DietaryTag) is read-only because
those rows are seeded via management command.
"""

from __future__ import annotations

from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsOrganizationMember

from .models import (
    Allergen,
    DietaryTag,
    Menu,
    MenuCategory,
    MenuItem,
)
from .permissions import IsMenuOrganizationMember
from .serializers import (
    AllergenSerializer,
    DietaryTagSerializer,
    MenuCategorySerializer,
    MenuItemSerializer,
    MenuSerializer,
)
from .services import reorder_categories, reorder_items


def _wrap(data, request: Request) -> Response:
    """Wrap payload in standard {data, meta} envelope."""
    return Response(
        {
            "data": data,
            "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")},
        }
    )


def _wrap_response(response: Response, request: Request) -> Response:
    """Wrap an existing DRF Response (which already has .data) in our envelope.

    Used to add our `{data, meta}` envelope to standard ModelViewSet responses.
    We preserve the status code and headers from the original response.
    """
    return Response(
        {
            "data": response.data,
            "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")},
        },
        status=response.status_code,
        headers={k: v for k, v in response.headers.items() if k.lower() not in {"content-type", "content-length"}},
    )


# ---------------------------------------------------------------------------
# Reference data (read-only)
# ---------------------------------------------------------------------------
class AllergenViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AllergenSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Allergen.objects.filter(is_active=True).order_by("code")


class DietaryTagViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = DietaryTagSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return DietaryTag.objects.filter(is_active=True).order_by("code")


# ---------------------------------------------------------------------------
# Menu CRUD
# ---------------------------------------------------------------------------
class MenuViewSet(viewsets.ModelViewSet):
    """CRUD for menus the current user can access."""

    serializer_class = MenuSerializer
    permission_classes = [IsAuthenticated, IsMenuOrganizationMember]

    def get_queryset(self):
        return (
            Menu.objects.for_user(self.request.user)
            .select_related("organization", "branch")
            .order_by("organization__name", "name")
        )

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return _wrap(response.data, request)

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return _wrap(response.data, request)

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return _wrap_response(response, request)

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return _wrap_response(response, request)

    def partial_update(self, request, *args, **kwargs):
        # UpdateModelMixin.partial_update calls self.update() under the hood,
        # which already wraps the response. Just delegate.
        return self.update(request, *args, partial=True, **kwargs)

    def destroy(self, request, *args, **kwargs):
        response = super().destroy(request, *args, **kwargs)
        return Response(status=response.status_code)


# ---------------------------------------------------------------------------
# MenuCategory CRUD
# ---------------------------------------------------------------------------
class MenuCategoryViewSet(viewsets.ModelViewSet):
    """CRUD for categories. Supports nested list under a menu."""

    serializer_class = MenuCategorySerializer
    permission_classes = [IsAuthenticated, IsMenuOrganizationMember]

    def get_queryset(self):
        qs = MenuCategory.objects.for_user(self.request.user).select_related(
            "menu", "parent"
        )
        menu_id = self.request.query_params.get("menu")
        if menu_id:
            qs = qs.filter(menu_id=menu_id)
        return qs.order_by("menu_id", "sort_order", "name")

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.get_queryset())
        if page is not None:
            data = self.get_serializer(page, many=True).data
            return _wrap(
                {
                    "count": self.paginator.page.paginator.count,
                    "next": self.paginator.get_next_link(),
                    "previous": self.paginator.get_previous_link(),
                    "results": data,
                },
                request,
            )
        data = self.get_serializer(self.get_queryset(), many=True).data
        return _wrap({"count": len(data), "next": None, "previous": None, "results": data}, request)

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return _wrap(response.data, request)

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return _wrap_response(response, request)

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return _wrap_response(response, request)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, partial=True, **kwargs)

    def destroy(self, request, *args, **kwargs):
        response = super().destroy(request, *args, **kwargs)
        return Response(status=response.status_code)


# ---------------------------------------------------------------------------
# MenuItem CRUD
# ---------------------------------------------------------------------------
class MenuItemViewSet(viewsets.ModelViewSet):
    """CRUD for menu items."""

    serializer_class = MenuItemSerializer
    permission_classes = [IsAuthenticated, IsMenuOrganizationMember]

    def get_queryset(self):
        qs = MenuItem.objects.for_user(self.request.user).select_related(
            "menu", "category"
        )
        menu_id = self.request.query_params.get("menu")
        category_id = self.request.query_params.get("category")
        if menu_id:
            qs = qs.filter(menu_id=menu_id)
        if category_id:
            qs = qs.filter(category_id=category_id)
        return qs.order_by("category_id", "sort_order", "name")

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.get_queryset())
        if page is not None:
            data = self.get_serializer(page, many=True).data
            return _wrap(
                {
                    "count": self.paginator.page.paginator.count,
                    "next": self.paginator.get_next_link(),
                    "previous": self.paginator.get_previous_link(),
                    "results": data,
                },
                request,
            )
        data = self.get_serializer(self.get_queryset(), many=True).data
        return _wrap({"count": len(data), "next": None, "previous": None, "results": data}, request)

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return _wrap(response.data, request)

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return _wrap_response(response, request)

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return _wrap_response(response, request)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, partial=True, **kwargs)

    def destroy(self, request, *args, **kwargs):
        response = super().destroy(request, *args, **kwargs)
        return Response(status=response.status_code)

# ---------------------------------------------------------------------------
# Reorder endpoints
# ---------------------------------------------------------------------------
class CategoriesReorderView(APIView):
    """POST /api/v1/admin/categories/reorder
    Body: {"menu_id": int, "ordered_ids": [int, ...]}
    """

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request) -> Response:
        menu_id = request.data.get("menu_id")
        ordered_ids = request.data.get("ordered_ids")
        if not menu_id or not isinstance(ordered_ids, list):
            return Response(
                {
                    "error": {
                        "code": "validation.invalid_payload",
                        "message": "menu_id ve ordered_ids zorunludur.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            menu = Menu.objects.for_user(request.user).get(pk=menu_id)
        except Menu.DoesNotExist:
            return Response(
                {
                    "error": {
                        "code": "not_found",
                        "message": "Menü bulunamadı veya erişim yok.",
                    }
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            count = reorder_categories(menu, ordered_ids)
        except ValueError as exc:
            return Response(
                {
                    "error": {
                        "code": "validation.reorder_failed",
                        "message": str(exc),
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {
                "data": {"updated": count, "menu_id": menu.id},
                "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")},
            }
        )


class ItemsReorderView(APIView):
    """POST /api/v1/admin/menu-items/reorder
    Body: {"category_id": int, "ordered_ids": [int, ...]}
    """

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request) -> Response:
        category_id = request.data.get("category_id")
        ordered_ids = request.data.get("ordered_ids")
        if not category_id or not isinstance(ordered_ids, list):
            return Response(
                {
                    "error": {
                        "code": "validation.invalid_payload",
                        "message": "category_id ve ordered_ids zorunludur.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            category = MenuCategory.objects.for_user(request.user).get(pk=category_id)
        except MenuCategory.DoesNotExist:
            return Response(
                {
                    "error": {
                        "code": "not_found",
                        "message": "Kategori bulunamadı veya erişim yok.",
                    }
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            count = reorder_items(category, ordered_ids)
        except ValueError as exc:
            return Response(
                {
                    "error": {
                        "code": "validation.reorder_failed",
                        "message": str(exc),
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {
                "data": {"updated": count, "category_id": category.id},
                "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")},
            }
        )
