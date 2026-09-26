"""Serializers for the menu domain.

These mirror the patterns from `apps.branches.serializers` and
`apps.theme.serializers`: read-only nested representations + write-only
FK primary-key fields whose queryset is scoped to the request user.

Two layered "translate-on-read" serializers (CategoryReadSerializer,
ItemReadSerializer) wrap the base ones so admin GET endpoints return
localized text via the translation fallback service.
"""

from __future__ import annotations

from rest_framework import serializers

from apps.branches.models import Branch
from apps.branches.serializers import BranchSummarySerializer
from apps.organizations.models import Organization

from .models import (
    Allergen,
    DietaryTag,
    Menu,
    MenuCategory,
    MenuCategoryTranslation,
    MenuItem,
    MenuItemAllergen,
    MenuItemDietaryTag,
    MenuItemTranslation,
)


# ---------------------------------------------------------------------------
# Translation serializers
# ---------------------------------------------------------------------------
class MenuCategoryTranslationSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuCategoryTranslation
        fields = ("id", "locale", "name", "description")
        read_only_fields = ("id",)


class MenuItemTranslationSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuItemTranslation
        fields = ("id", "locale", "name", "description")
        read_only_fields = ("id",)


# ---------------------------------------------------------------------------
# Reference data serializers (Allergen, DietaryTag)
# ---------------------------------------------------------------------------
class AllergenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Allergen
        fields = ("id", "code", "name", "icon", "description", "is_active")
        read_only_fields = ("id",)


class DietaryTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = DietaryTag
        fields = ("id", "code", "name", "icon", "color", "is_active")
        read_only_fields = ("id",)


# ---------------------------------------------------------------------------
# Menu
# ---------------------------------------------------------------------------
class MenuSerializer(serializers.ModelSerializer):
    organization = serializers.SerializerMethodField()
    organization_id = serializers.PrimaryKeyRelatedField(
        source="organization",
        write_only=True,
        queryset=Organization.objects.none(),
    )
    branch = BranchSummarySerializer(read_only=True)
    branch_id = serializers.PrimaryKeyRelatedField(
        source="branch",
        queryset=Branch.objects.none(),
        required=False,
        allow_null=True,
    )
    # Override slug to make it truly optional (auto-generated in Menu.save()).
    slug = serializers.SlugField(max_length=60, required=False, allow_blank=True, default="")

    class Meta:
        model = Menu
        fields = (
            "id",
            "organization",
            "organization_id",
            "branch",
            "branch_id",
            "name",
            "slug",
            "description",
            "default_locale",
            "supported_locales",
            "is_active",
            "published_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "published_at",
            "created_at",
            "updated_at",
            "organization",
            "branch",
        )

    def get_organization(self, obj):
        return {
            "id": obj.organization_id,
            "name": obj.organization.name,
            "slug": obj.organization.slug,
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return
        user = request.user
        if getattr(user, "is_platform_admin", False):
            org_qs = Organization.objects.all()
            branch_qs = Branch.objects.all()
        else:
            org_qs = Organization.objects.filter(memberships__user=user).distinct()
            branch_qs = Branch.objects.filter(
                organization__memberships__user=user
            ).distinct()
        self.fields["organization_id"].queryset = org_qs
        self.fields["branch_id"].queryset = branch_qs


# ---------------------------------------------------------------------------
# MenuCategory
# ---------------------------------------------------------------------------
class MenuCategorySerializer(serializers.ModelSerializer):
    menu_id = serializers.PrimaryKeyRelatedField(
        source="menu",
        queryset=Menu.objects.none(),
    )
    parent_id = serializers.PrimaryKeyRelatedField(
        source="parent",
        queryset=MenuCategory.objects.none(),
        required=False,
        allow_null=True,
    )
    translations = MenuCategoryTranslationSerializer(many=True, required=False)
    # Override slug to make it truly optional (auto-generated in MenuCategory.save()).
    slug = serializers.SlugField(max_length=80, required=False, allow_blank=True, default="")

    class Meta:
        model = MenuCategory
        fields = (
            "id",
            "menu_id",
            "parent_id",
            "name",
            "slug",
            "description",
            "image",
            "sort_order",
            "is_active",
            "translations",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "slug", "created_at", "updated_at")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return
        user = request.user
        if getattr(user, "is_platform_admin", False):
            menu_qs = Menu.objects.all()
            cat_qs = MenuCategory.objects.all()
        else:
            menu_qs = Menu.objects.filter(
                organization__memberships__user=user
            ).distinct()
            cat_qs = MenuCategory.objects.filter(
                menu__organization__memberships__user=user
            ).distinct()
        self.fields["menu_id"].queryset = menu_qs
        self.fields["parent_id"].queryset = cat_qs

    def create(self, validated_data):
        translations = validated_data.pop("translations", [])
        category = MenuCategory.objects.create(**validated_data)
        for tr in translations:
            MenuCategoryTranslation.objects.create(category=category, **tr)
        return category

    def update(self, instance, validated_data):
        translations = validated_data.pop("translations", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if translations is not None:
            # Replace-style: delete existing for the same locales, create new.
            locales = [t.get("locale") for t in translations if t.get("locale")]
            instance.translations.filter(locale__in=locales).delete()
            for tr in translations:
                MenuCategoryTranslation.objects.create(category=instance, **tr)
        return instance


# ---------------------------------------------------------------------------
# MenuItem
# ---------------------------------------------------------------------------
class MenuItemSerializer(serializers.ModelSerializer):
    menu_id = serializers.PrimaryKeyRelatedField(
        source="menu",
        queryset=Menu.objects.none(),
    )
    category_id = serializers.PrimaryKeyRelatedField(
        source="category",
        queryset=MenuCategory.objects.none(),
    )
    allergen_ids = serializers.PrimaryKeyRelatedField(
        source="allergens",
        queryset=Allergen.objects.filter(is_active=True),
        many=True,
        required=False,
    )
    dietary_tag_ids = serializers.PrimaryKeyRelatedField(
        source="dietary_tags",
        queryset=DietaryTag.objects.filter(is_active=True),
        many=True,
        required=False,
    )
    translations = MenuItemTranslationSerializer(many=True, required=False)

    class Meta:
        model = MenuItem
        fields = (
            "id",
            "menu_id",
            "category_id",
            "name",
            "description",
            "image",
            "price",
            "compare_at_price",
            "currency",
            "is_active",
            "is_available",
            "is_featured",
            "is_popular",
            "is_new",
            "spice_level",
            "sort_order",
            "allergen_ids",
            "dietary_tag_ids",
            "translations",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return
        user = request.user
        if getattr(user, "is_platform_admin", False):
            menu_qs = Menu.objects.all()
            cat_qs = MenuCategory.objects.all()
        else:
            menu_qs = Menu.objects.filter(
                organization__memberships__user=user
            ).distinct()
            cat_qs = MenuCategory.objects.filter(
                menu__organization__memberships__user=user
            ).distinct()
        self.fields["menu_id"].queryset = menu_qs
        self.fields["category_id"].queryset = cat_qs

    def validate(self, attrs):
        # Price is non-negative (MinValueValidator on field handles it, but
        # we also check compare_at_price if present and cross-check menu/category).
        menu = attrs.get("menu") or getattr(self.instance, "menu", None)
        category = attrs.get("category") or getattr(self.instance, "category", None)
        if menu is not None and category is not None and category.menu_id != menu.id:
            raise serializers.ValidationError(
                {
                    "category_id": "Seçilen kategori, verilen menüye ait değil.",
                }
            )
        if (
            attrs.get("compare_at_price") is not None
            and attrs.get("price") is not None
            and attrs["compare_at_price"] < attrs["price"]
        ):
            raise serializers.ValidationError(
                {
                    "compare_at_price": (
                        "Karşılaştırma fiyatı, asıl fiyattan düşük olamaz."
                    ),
                }
            )
        return attrs

    def create(self, validated_data):
        translations = validated_data.pop("translations", [])
        allergens = validated_data.pop("allergens", None)
        dietary_tags = validated_data.pop("dietary_tags", None)
        item = MenuItem.objects.create(**validated_data)
        if allergens is not None:
            # Use through-model for explicit links; otherwise M2M .set works too.
            for a in allergens:
                MenuItemAllergen.objects.get_or_create(
                    menu_item=item, allergen=a
                )
        if dietary_tags is not None:
            for t in dietary_tags:
                MenuItemDietaryTag.objects.get_or_create(
                    menu_item=item, dietary_tag=t
                )
        for tr in translations:
            MenuItemTranslation.objects.create(menu_item=item, **tr)
        return item

    def update(self, instance, validated_data):
        translations = validated_data.pop("translations", None)
        allergens = validated_data.pop("allergens", None)
        dietary_tags = validated_data.pop("dietary_tags", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if allergens is not None:
            instance.allergens.clear()
            for a in allergens:
                instance.allergens.add(a)
        if dietary_tags is not None:
            instance.dietary_tags.clear()
            for t in dietary_tags:
                instance.dietary_tags.add(t)
        if translations is not None:
            locales = [t.get("locale") for t in translations if t.get("locale")]
            instance.translations.filter(locale__in=locales).delete()
            for tr in translations:
                MenuItemTranslation.objects.create(menu_item=instance, **tr)
        return instance


# ---------------------------------------------------------------------------
# Branch summary (lightweight, reused here)
# ---------------------------------------------------------------------------
class BranchSummarySerializerCompat(serializers.ModelSerializer):
    """Compact branch representation nested in Menu responses."""

    class Meta:
        model = Branch
        fields = ("id", "name", "slug")
        read_only_fields = fields