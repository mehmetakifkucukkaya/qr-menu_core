"""Description service tests — Sprint 9A.

Covers ``apps.translate.services.describe_product`` and
``describe_bulk``:

* Empty item (no existing description) → AI generates.
* Already-edited record → skipped unless ``force=True``.
* Allergen + price included in the prompt context.
* Anthropic fallback path.
* Bulk: skips items that already have a fresh description.
* Bulk: respects ``item_ids`` filter.
"""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from rest_framework.exceptions import ValidationError

from apps.translate import services
from apps.translate.models import AIProductDescription

from .conftest import (
    _build_fake_anthropic,
    _build_fake_openai,
    _stub_settings,
    patch_get_anthropic,
    patch_get_openai,
    patch_settings,
)
from .factories import (
    make_allergen,
    make_category,
    make_item,
    make_menu,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _seed_item(org, *, name="Türk Kahvesi", with_allergens=True):
    menu = make_menu(org, name=f"Menu-{org.slug}")
    category = make_category(menu, name="Sıcak İçecekler")
    item = make_item(
        category=category,
        menu=menu,
        name=name,
        price=Decimal("45.00"),
        description="",
    )
    if with_allergens:
        item.allergens.add(make_allergen(code="caffeine", name_tr="Kafein"))
        item.dietary_tags.add(
            __import__(
                "apps.translate.tests.factories",
                fromlist=["make_dietary_tag"],
            ).make_dietary_tag(code="popular", name_tr="Popüler")
        )
    return item


# ---------------------------------------------------------------------------
# Generate for empty item
# ---------------------------------------------------------------------------
def test_describe_generates_for_empty_item(org_a, sample_description_response):
    item = _seed_item(org_a)
    fake_openai = _build_fake_openai(sample_description_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        result = services.describe_product(
            menu_item=item,
            locale="tr",
            organization=org_a,
        )

    assert result["regenerated"] is True
    assert result["is_edited"] is False
    assert result["provider"] == "openai"

    row = AIProductDescription.objects.get(menu_item=item, locale="tr")
    assert row.generated_text.startswith("Geleneksel")
    assert row.is_edited is False
    assert row.organization_id == org_a.id


# ---------------------------------------------------------------------------
# Edited record → no regen
# ---------------------------------------------------------------------------
def test_describe_skips_edited_record_when_force_false(
    org_a, sample_description_response
):
    item = _seed_item(org_a)
    AIProductDescription.objects.create(
        organization=org_a,
        menu_item=item,
        locale="tr",
        generated_text="Elle düzenlenmiş açıklama",
        ai_provider="openai",
        ai_model="gpt-4o",
        is_edited=True,
    )

    # Even with a working AI behind us, the edit guard prevents regen.
    fake_openai = _build_fake_openai(sample_description_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        result = services.describe_product(
            menu_item=item,
            locale="tr",
            organization=org_a,
        )

    assert result["regenerated"] is False
    assert result["is_edited"] is True
    assert result["description"] == "Elle düzenlenmiş açıklama"
    # No new AI call should have been made.
    assert (
        fake_openai.OpenAI.return_value.chat.completions.create.call_count
        == 0
    )


# ---------------------------------------------------------------------------
# force=True → regen even when edited
# ---------------------------------------------------------------------------
def test_describe_force_regenerates_even_if_edited(
    org_a, sample_description_response
):
    item = _seed_item(org_a)
    AIProductDescription.objects.create(
        organization=org_a,
        menu_item=item,
        locale="tr",
        generated_text="Elle düzenlenmiş açıklama",
        ai_provider="openai",
        ai_model="gpt-4o",
        is_edited=True,
    )
    fake_openai = _build_fake_openai(sample_description_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        result = services.describe_product(
            menu_item=item,
            locale="tr",
            organization=org_a,
            force=True,
        )

    assert result["regenerated"] is True
    assert result["is_edited"] is False
    row = AIProductDescription.objects.get(menu_item=item, locale="tr")
    assert row.is_edited is False  # the AI overwrote the edit marker
    assert row.generated_text.startswith("Geleneksel")


# ---------------------------------------------------------------------------
# Allergen prompt context
# ---------------------------------------------------------------------------
def test_describe_includes_allergens_in_prompt(
    org_a, sample_description_response
):
    item = _seed_item(org_a, with_allergens=True)
    fake_openai = _build_fake_openai(sample_description_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        services.describe_product(
            menu_item=item,
            locale="tr",
            organization=org_a,
        )

    # Inspect the prompt the AI saw — the allergen code should be
    # mentioned in the user message body.
    call_args = fake_openai.OpenAI.return_value.chat.completions.create.call_args
    user_message = call_args.kwargs["messages"][1]["content"]
    assert "caffeine" in user_message
    assert "Türk Kahvesi" in user_message


# ---------------------------------------------------------------------------
# Price context
# ---------------------------------------------------------------------------
def test_describe_includes_price_in_context(
    org_a, sample_description_response
):
    item = _seed_item(org_a)
    item.price = Decimal("125.00")
    item.save()

    fake_openai = _build_fake_openai(sample_description_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        services.describe_product(
            menu_item=item,
            locale="tr",
            organization=org_a,
        )

    call_args = fake_openai.OpenAI.return_value.chat.completions.create.call_args
    user_message = call_args.kwargs["messages"][1]["content"]
    assert "125.00" in user_message
    assert "TRY" in user_message


# ---------------------------------------------------------------------------
# Anthropic fallback for descriptions
# ---------------------------------------------------------------------------
def test_describe_anthropic_fallback(org_a, sample_description_response):
    item = _seed_item(org_a)
    broken_openai = MagicMock(name="openai")
    broken_openai.OpenAI.return_value.chat.completions.create.side_effect = (
        RuntimeError("rate limit")
    )
    fake_anthropic = _build_fake_anthropic(sample_description_response)

    with (
        patch_settings(_stub_settings(anthropic_key="sk-ant")),
        patch_get_openai(broken_openai),
        patch_get_anthropic(fake_anthropic),
    ):
        result = services.describe_product(
            menu_item=item,
            locale="tr",
            organization=org_a,
        )

    assert result["provider"] == "anthropic"
    assert result["model"] == "claude-3-5-sonnet-20241022"
    assert result["regenerated"] is True


# ---------------------------------------------------------------------------
# Bulk: skips items that already have a fresh description
# ---------------------------------------------------------------------------
def test_describe_bulk_only_fills_empty_descriptions(
    org_a, sample_description_response
):
    items = [_seed_item(org_a, name=f"Item {i}") for i in range(3)]

    # Item #1 already has a fresh (non-edited) description.
    AIProductDescription.objects.create(
        organization=org_a,
        menu_item=items[1],
        locale="tr",
        generated_text="Mevcut açıklama",
        ai_provider="openai",
        ai_model="gpt-4o",
        is_edited=False,
    )

    fake_openai = _build_fake_openai(sample_description_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        result = services.describe_bulk(
            menu_items=items,
            locale="tr",
            organization=org_a,
        )

    assert result["total_generated"] == 2
    assert result["total_skipped"] == 1

    skipped = [r for r in result["results"] if r["skipped"]]
    assert len(skipped) == 1
    assert skipped[0]["item_id"] == items[1].id
    assert skipped[0]["description"] == "Mevcut açıklama"


# ---------------------------------------------------------------------------
# Bulk: respects item_ids filter
# ---------------------------------------------------------------------------
def test_describe_bulk_respects_item_ids_filter(
    org_a, sample_description_response
):
    """Bulk reports the filter even when the caller pre-filtered the list."""
    items = [_seed_item(org_a, name=f"Item {i}") for i in range(3)]

    fake_openai = _build_fake_openai(sample_description_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        result = services.describe_bulk(
            menu_items=items[:1],  # View pre-filters; bulk reports it.
            locale="tr",
            organization=org_a,
            item_ids=[items[0].id],
        )

    # Only one item requested, so only one generation result.
    assert result["filter"]["total_requested"] == 1
    assert result["filter"]["item_ids"] == [items[0].id]
    assert len(result["results"]) == 1
    assert result["results"][0]["item_id"] == items[0].id
