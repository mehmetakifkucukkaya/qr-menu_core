"""Reorder service — bulk update of `sort_order` for categories and items.

Reorder is performed in a single transaction so partial updates don't leave
the menu in an inconsistent state. Both functions validate that the supplied
ids belong to the target menu/category — callers cannot reorder objects from
another tenant by mistake.
"""

from __future__ import annotations

from django.db import transaction

from apps.menu.models import MenuCategory, MenuItem


def _validate_ids_belong(model, ids: list[int], filter_kwargs: dict) -> list:
    """Return the actual ids that exist AND belong to the target parent.

    Raises ValueError if any id is missing or out of scope.
    """
    found = list(
        model.objects.filter(pk__in=ids, **filter_kwargs).values_list("pk", flat=True)
    )
    if sorted(found) != sorted(ids):
        missing = set(ids) - set(found)
        raise ValueError(
            f"{model.__name__} id'leri bulunamadı veya scope dışı: {sorted(missing)}"
        )
    return found


@transaction.atomic
def reorder_categories(menu, ordered_ids: list[int]) -> int:
    """Set sort_order for each category in the given order.

    - `menu` is a Menu instance.
    - `ordered_ids` is the desired top-down order.
    - All ids must belong to this menu (raises ValueError otherwise).

    Returns the number of categories updated.
    """
    if not isinstance(ordered_ids, list) or not all(
        isinstance(i, int) for i in ordered_ids
    ):
        raise ValueError("ordered_ids bir int listesi olmalıdır.")
    _validate_ids_belong(MenuCategory, ordered_ids, {"menu_id": menu.pk})
    for index, category_id in enumerate(ordered_ids):
        MenuCategory.objects.filter(pk=category_id, menu_id=menu.pk).update(
            sort_order=index
        )
    return len(ordered_ids)


@transaction.atomic
def reorder_items(category, ordered_ids: list[int]) -> int:
    """Set sort_order for each item in the given order, scoped to `category`.

    - `category` is a MenuCategory instance.
    - All ids must belong to this category (raises ValueError otherwise).
    """
    if not isinstance(ordered_ids, list) or not all(
        isinstance(i, int) for i in ordered_ids
    ):
        raise ValueError("ordered_ids bir int listesi olmalıdır.")
    _validate_ids_belong(MenuItem, ordered_ids, {"category_id": category.pk})
    for index, item_id in enumerate(ordered_ids):
        MenuItem.objects.filter(pk=item_id, category_id=category.pk).update(
            sort_order=index
        )
    return len(ordered_ids)