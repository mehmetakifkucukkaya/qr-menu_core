"""Menu domain models.

Sprint 2 introduces the full menu hierarchy:

    Menu (organization-scoped, optional branch)
      └── MenuCategory (parent optional for sub-categories)
            ├── MenuCategoryTranslation (per-locale name/description)
            └── MenuItem
                  ├── MenuItemTranslation
                  ├── M2M → Allergen   (through MenuItemAllergen)
                  └── M2M → DietaryTag (through MenuItemDietaryTag)

Cross-cutting reference data:
    Allergen, DietaryTag — global (not tenant-scoped), seeded via management command.

The model layer is intentionally admin-friendly: `slug` is auto-generated from
`name` when not provided (D-012); image fields point to local MEDIA_ROOT for
Sprint 2 (D-011 — S3/R2 will come in Sprint 5).
"""

from __future__ import annotations

from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.utils.text import slugify

from apps.branches.models import Branch
from apps.core.models import TimeStampedModel
from apps.organizations.models import Organization

# ---------------------------------------------------------------------------
# Locale choices
# ---------------------------------------------------------------------------
LOCALE_CHOICES = [
    ("tr", "Türkçe"),
    ("en", "English"),
]


def _slugify_tr(value: str) -> str:
    """Slugify with a tiny Turkish-character normalization table.

    django.utils.text.slugify already strips most diacritics. We add a small
    mapping for Turkish-specific characters that Pillow-style transliteration
    sometimes leaves intact. Keeps slug behavior predictable (D-012).
    """
    if not value:
        return ""
    mapping = {
        "ç": "c",
        "Ç": "c",
        "ğ": "g",
        "Ğ": "g",
        "ı": "i",
        "İ": "i",
        "ö": "o",
        "Ö": "o",
        "ş": "s",
        "Ş": "s",
        "ü": "u",
        "Ü": "u",
    }
    for src, dst in mapping.items():
        value = value.replace(src, dst)
    return slugify(value)


# ---------------------------------------------------------------------------
# Menu
# ---------------------------------------------------------------------------
class MenuQuerySet(models.QuerySet):
    """Tenant-scoped menu queries."""

    def active(self):
        return self.filter(is_active=True)

    def published(self):
        return self.filter(is_active=True).filter(
            # A menu is "published" when it is active. published_at is set
            # the first time it goes active — used by public endpoint.
            models.Q(published_at__isnull=False) | models.Q(is_active=True)
        )

    def for_user(self, user):
        if getattr(user, "is_platform_admin", False):
            return self.all()
        return self.filter(organization__memberships__user=user).distinct()


class Menu(TimeStampedModel):
    """A menu belongs to one Organization and optionally one Branch.

    `slug` is unique within an organization (unique_together). If not
    provided on save(), it is auto-generated from `name` using a small
    Turkish-character normalization (D-012).
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="menus",
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.SET_NULL,
        related_name="menus",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=60, unique=False, db_index=True)
    description = models.TextField(blank=True, default="")

    default_locale = models.CharField(
        max_length=5,
        choices=LOCALE_CHOICES,
        default="tr",
    )
    supported_locales = models.JSONField(default=list)

    is_active = models.BooleanField(default=True)
    published_at = models.DateTimeField(null=True, blank=True)

    objects = MenuQuerySet.as_manager()

    class Meta:
        verbose_name = "Menü"
        verbose_name_plural = "Menüler"
        ordering = ("organization", "name")
        unique_together = (("organization", "slug"),)
        indexes = [
            models.Index(fields=["organization", "is_active"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.organization.name} / {self.name}"

    def save(self, *args, **kwargs):
        # Auto-slug when not provided (D-012).
        if not self.slug and self.name:
            base = _slugify_tr(self.name)[:60] or "menu"
            slug = base
            i = 2
            qs = Menu.objects.filter(
                organization_id=self.organization_id, slug=slug
            )
            if self.pk:
                qs = qs.exclude(pk=self.pk)
            while qs.exists():
                suffix = f"-{i}"
                slug = base[: 60 - len(suffix)] + suffix
                qs = Menu.objects.filter(
                    organization_id=self.organization_id, slug=slug
                )
                if self.pk:
                    qs = qs.exclude(pk=self.pk)
                i += 1
            self.slug = slug
        # First time going active → stamp published_at.
        if self.is_active and self.published_at is None:
            from django.utils import timezone

            self.published_at = timezone.now()
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------------
# MenuCategory
# ---------------------------------------------------------------------------
class MenuCategoryQuerySet(models.QuerySet):
    def active(self):
        return self.filter(is_active=True)

    def top_level(self):
        return self.filter(parent__isnull=True)

    def for_user(self, user):
        if getattr(user, "is_platform_admin", False):
            return self.all()
        return self.filter(menu__organization__memberships__user=user).distinct()


class MenuCategory(TimeStampedModel):
    """Category under a menu. Parent FK for optional sub-categories."""

    menu = models.ForeignKey(
        Menu,
        on_delete=models.CASCADE,
        related_name="categories",
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        related_name="children",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=80)
    slug = models.SlugField(max_length=80, unique=False, db_index=True)
    description = models.TextField(blank=True, default="")
    image = models.ImageField(upload_to="categories/", blank=True, null=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    objects = MenuCategoryQuerySet.as_manager()

    class Meta:
        verbose_name = "Kategori"
        verbose_name_plural = "Kategoriler"
        ordering = ("menu", "sort_order", "name")
        unique_together = (("menu", "slug"),)
        indexes = [
            models.Index(fields=["menu", "is_active", "sort_order"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.menu.name} / {self.name}"

    def save(self, *args, **kwargs):
        if not self.slug and self.name:
            base = _slugify_tr(self.name)[:80] or "category"
            slug = base
            i = 2
            qs = MenuCategory.objects.filter(menu_id=self.menu_id, slug=slug)
            if self.pk:
                qs = qs.exclude(pk=self.pk)
            while qs.exists():
                suffix = f"-{i}"
                slug = base[: 80 - len(suffix)] + suffix
                qs = MenuCategory.objects.filter(menu_id=self.menu_id, slug=slug)
                if self.pk:
                    qs = qs.exclude(pk=self.pk)
                i += 1
            self.slug = slug
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------------
# MenuCategoryTranslation
# ---------------------------------------------------------------------------
class MenuCategoryTranslation(models.Model):
    category = models.ForeignKey(
        MenuCategory,
        on_delete=models.CASCADE,
        related_name="translations",
    )
    locale = models.CharField(max_length=5, choices=LOCALE_CHOICES)
    name = models.CharField(max_length=80)
    description = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Kategori Çevirisi"
        verbose_name_plural = "Kategori Çevirileri"
        unique_together = (("category", "locale"),)
        indexes = [
            models.Index(fields=["category", "locale"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.category_id} / {self.locale} → {self.name}"


# ---------------------------------------------------------------------------
# MenuItem
# ---------------------------------------------------------------------------
class MenuItemQuerySet(models.QuerySet):
    def active(self):
        return self.filter(is_active=True, is_available=True)

    def for_user(self, user):
        if getattr(user, "is_platform_admin", False):
            return self.all()
        return self.filter(menu__organization__memberships__user=user).distinct()


class MenuItem(TimeStampedModel):
    """A single menu entry under a MenuCategory.

    `price` and `compare_at_price` are DecimalField(10, 2) per OP-6.
    Negative values are rejected via validator.
    """

    menu = models.ForeignKey(
        Menu,
        on_delete=models.CASCADE,
        related_name="items",
    )
    category = models.ForeignKey(
        MenuCategory,
        on_delete=models.CASCADE,
        related_name="items",
    )
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default="")
    image = models.ImageField(upload_to="items/", blank=True, null=True)

    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text="TRY/EUR/USD cinsinden fiyat. Negatif olamaz (OP-6).",
    )
    compare_at_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    currency = models.CharField(max_length=3, default="TRY")

    is_active = models.BooleanField(default=True)
    is_available = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    is_popular = models.BooleanField(default=False)
    is_new = models.BooleanField(default=False)

    spice_level = models.PositiveSmallIntegerField(
        default=0,
        choices=[
            (0, "Yok"),
            (1, "Hafif"),
            (2, "Orta"),
            (3, "Acılı"),
        ],
    )
    sort_order = models.PositiveIntegerField(default=0)

    allergens = models.ManyToManyField(
        "Allergen",
        through="MenuItemAllergen",
        related_name="menu_items",
        blank=True,
    )
    dietary_tags = models.ManyToManyField(
        "DietaryTag",
        through="MenuItemDietaryTag",
        related_name="menu_items",
        blank=True,
    )

    # Sprint D1 — Mevzuat uyum alanları (D-031 follow-up). Nullable + blank
    # for backward-compatible migration. Türk Gıda Kodeksi uyumu için
    # calories, portion_size, ingredients zorunlu bilgi; legal_notes
    # alerjen uyarıları; contains_alcohol / is_halal opsiyonel işaretleme.
    calories = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="kcal cinsinden enerji. Örn: 350. Türk Gıda Kodeksi uyumu.",
    )
    portion_size = models.CharField(
        max_length=60,
        blank=True,
        default="",
        help_text="Porsiyon miktarı. Örn: '250g', '1 porsiyon', '350ml'.",
    )
    ingredients = models.TextField(
        blank=True,
        default="",
        help_text="Virgülle ayrılmış içerik listesi. Örn: 'domates, peynir, un'.",
    )
    legal_notes = models.TextField(
        blank=True,
        default="",
        help_text="Alerjen uyarıları + yasal notlar. Örn: 'Buğday, süt, yumurta içerir.'",
    )
    contains_alcohol = models.BooleanField(
        default=False,
        help_text="Alkol var mı? (Vergi/yasal etiket zorunluluğu)",
    )
    is_halal = models.BooleanField(
        null=True,
        blank=True,
        help_text="Helal sertifikası. None=belirtilmemiş, True/False.",
    )

    objects = MenuItemQuerySet.as_manager()

    class Meta:
        verbose_name = "Ürün"
        verbose_name_plural = "Ürünler"
        ordering = ("category", "sort_order", "name")
        indexes = [
            models.Index(fields=["menu", "category", "is_active"]),
            models.Index(fields=["category", "sort_order"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.name} ({self.price} {self.currency})"


# ---------------------------------------------------------------------------
# MenuItemTranslation
# ---------------------------------------------------------------------------
class MenuItemTranslation(models.Model):
    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.CASCADE,
        related_name="translations",
    )
    locale = models.CharField(max_length=5, choices=LOCALE_CHOICES)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Ürün Çevirisi"
        verbose_name_plural = "Ürün Çevirileri"
        unique_together = (("menu_item", "locale"),)
        indexes = [
            models.Index(fields=["menu_item", "locale"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.menu_item_id} / {self.locale} → {self.name}"


# ---------------------------------------------------------------------------
# Allergen / DietaryTag (global reference data)
# ---------------------------------------------------------------------------
class Allergen(TimeStampedModel):
    """Allergen reference data — global, not tenant-scoped."""

    code = models.SlugField(max_length=30, unique=True)
    name = models.JSONField(default=dict)  # {"tr": "Gluten", "en": "Gluten"}
    icon = models.CharField(max_length=40, blank=True, default="")
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Alerjen"
        verbose_name_plural = "Alerjenler"
        ordering = ("code",)

    def __str__(self) -> str:  # pragma: no cover
        return self.code


class DietaryTag(TimeStampedModel):
    """Dietary tag reference data — global, not tenant-scoped."""

    code = models.SlugField(max_length=30, unique=True)
    name = models.JSONField(default=dict)  # {"tr": "Vegan", "en": "Vegan"}
    icon = models.CharField(max_length=40, blank=True, default="")
    # Hex validator same pattern as ThemeConfig.
    color = models.CharField(max_length=7, default="#10B981")
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Diyet Etiketi"
        verbose_name_plural = "Diyet Etiketleri"
        ordering = ("code",)

    def __str__(self) -> str:  # pragma: no cover
        return self.code


# ---------------------------------------------------------------------------
# M2M through tables
# ---------------------------------------------------------------------------
class MenuItemAllergen(models.Model):
    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.CASCADE,
        related_name="item_allergens",
    )
    allergen = models.ForeignKey(
        Allergen,
        on_delete=models.CASCADE,
        related_name="item_links",
    )

    class Meta:
        verbose_name = "Ürün → Alerjen"
        verbose_name_plural = "Ürün → Alerjen"
        unique_together = (("menu_item", "allergen"),)


class MenuItemDietaryTag(models.Model):
    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.CASCADE,
        related_name="item_dietary_tags",
    )
    dietary_tag = models.ForeignKey(
        DietaryTag,
        on_delete=models.CASCADE,
        related_name="item_links",
    )

    class Meta:
        verbose_name = "Ürün → Diyet Etiketi"
        verbose_name_plural = "Ürün → Diyet Etiketleri"
        unique_together = (("menu_item", "dietary_tag"),)