"""Reusable validators (hex colors, etc.)."""

from __future__ import annotations

import re

from django.core.exceptions import ValidationError

_HEX_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$")


def validate_hex_color(value: str) -> None:
    """Validator for ``#RRGGBB`` or ``#RGB`` color strings.

    Used by ThemeConfig fields (primary_color, secondary_color, etc.).
    """
    if not isinstance(value, str) or not _HEX_COLOR_RE.match(value):
        raise ValidationError(
            "%(value)s geçerli bir hex renk değil (#RRGGBB bekleniyor)",
            params={"value": value},
        )
