"""ThemeConfig model — per-organization color/font/layout overrides."""

from __future__ import annotations

from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.validators import validate_hex_color
from apps.organizations.models import Organization


class ThemeConfig(TimeStampedModel):
    """OneToOne visual config per Organization.

    Hex colors are validated at the field level via ``validate_hex_color``.
    """

    LAYOUT_CHOICES = [
        ("classic", "Classic"),
        ("modern", "Modern"),
        ("compact", "Compact"),
    ]

    FONT_CHOICES = [
        ("system", "System Default"),
        ("inter", "Inter"),
        ("roboto", "Roboto"),
        ("playfair", "Playfair Display"),
    ]

    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name="theme_config",
    )

    primary_color = models.CharField(
        max_length=7,
        default="#1F2937",
        validators=[validate_hex_color],
        help_text="Hex renk, #RRGGBB",
    )
    secondary_color = models.CharField(
        max_length=7,
        default="#F59E0B",
        validators=[validate_hex_color],
    )
    accent_color = models.CharField(
        max_length=7,
        default="#10B981",
        validators=[validate_hex_color],
    )
    background_color = models.CharField(
        max_length=7,
        default="#FFFFFF",
        validators=[validate_hex_color],
    )
    text_color = models.CharField(
        max_length=7,
        default="#111827",
        validators=[validate_hex_color],
    )

    font_family = models.CharField(max_length=32, choices=FONT_CHOICES, default="system")
    layout_variant = models.CharField(max_length=16, choices=LAYOUT_CHOICES, default="modern")

    class Meta:
        verbose_name = "Tema Ayarları"
        verbose_name_plural = "Tema Ayarları"

    def __str__(self) -> str:  # pragma: no cover
        return f"Theme<{self.organization.name}>"
