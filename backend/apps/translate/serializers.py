"""DRF serializers for the AI translate / describe endpoints — Sprint 9A.

These are deliberately minimal — they validate shape only. Business
rules (cache lookup, AI orchestration, audit emission) live in
``apps.translate.services``.

Error handling:

* Bad shape / missing required fields → 400 via DRF's built-in
  ValidationError. The view's ``_error`` helper maps the response.
* The ``_locale`` validators reuse ``apps.menu.LOCALE_CHOICES`` so
  adding a new locale to the menu app is enough — we don't duplicate
  the choice list.
"""

from __future__ import annotations

from rest_framework import serializers

from apps.menu.models import LOCALE_CHOICES


_LOCALE_CODES = {code for code, _ in LOCALE_CHOICES}


class TranslateTextSerializer(serializers.Serializer):
    """Body for ``POST /api/v1/admin/translate/`` — single string."""

    text = serializers.CharField(max_length=2000)
    source_locale = serializers.ChoiceField(choices=LOCALE_CHOICES)
    target_locale = serializers.ChoiceField(choices=LOCALE_CHOICES)

    def validate(self, attrs):
        if attrs["source_locale"] == attrs["target_locale"]:
            raise serializers.ValidationError(
                {"target_locale": "Kaynak ve hedef dil aynı olamaz."}
            )
        return attrs


class TranslateObjectSerializer(serializers.Serializer):
    """Body for ``POST /api/v1/admin/translate/{item|category}/{id}/``.

    ``source_locale`` is optional — the admin UI usually has it pinned
    to the menu's ``default_locale`` (typically ``tr``). When omitted
    we default to ``tr`` in the view.
    """

    source_locale = serializers.ChoiceField(
        choices=LOCALE_CHOICES, required=False, default="tr"
    )
    target_locales = serializers.ListField(
        child=serializers.ChoiceField(choices=LOCALE_CHOICES),
        min_length=1,
        max_length=4,
    )


class DescribeItemSerializer(serializers.Serializer):
    """Body for ``POST /api/v1/admin/describe/menu-item/{id}/``."""

    locale = serializers.ChoiceField(choices=LOCALE_CHOICES)
    force = serializers.BooleanField(required=False, default=False)


class DescribeBulkSerializer(serializers.Serializer):
    """Body for ``POST /api/v1/admin/describe/bulk/``.

    ``item_ids`` is optional — when empty/missing we generate for
    every active item in the operator's org that doesn't already have
    a description in ``locale``.
    """

    locale = serializers.ChoiceField(choices=LOCALE_CHOICES)
    item_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        default=list,
    )
