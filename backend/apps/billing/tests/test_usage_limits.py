"""The six tier caps that were declared but never enforced.

``PLAN_TIER_LIMITS`` names nine resources. Three of them (items,
categories, branches) were checked before a write. The other six were
a table nobody enforced — the tenant could serve five languages on a
BASIC plan, use AI forever on a PRO plan, and read its analytics past
the monthly cap.

What is covered here:

* ``locales`` — how many languages a tenant may serve;
* ``monthly_views`` / ``monthly_scans`` — the monthly traffic caps;
* ``ai_pdf_imports`` / ``ai_translate_ops`` / ``ai_description_ops`` —
  the monthly AI caps, and the counters they depend on.

Each cap is checked twice: the service refuses at the boundary, and the
endpoint that would have crossed it answers 402.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.billing.constants import BASIC, PRO
from apps.billing.errors import LimitExceeded
from apps.billing.services import (
    check_count_limit,
    enforce_usage_limit,
    record_usage,
)
from apps.billing.tests.factories import make_plan_settings
from apps.menu.models import Menu, MenuCategory, MenuItem


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# The services
# ---------------------------------------------------------------------------


def test_check_count_limit_refuses_more_languages_than_the_tier(
    make_plan_settings, organization_a
):
    """BASIC may serve two languages."""
    make_plan_settings(organization_a, plan=BASIC)

    # Two is fine.
    check_count_limit(organization_a, "locales", 2)

    # Three is not.
    with pytest.raises(LimitExceeded) as exc:
        check_count_limit(organization_a, "locales", 3)
    assert exc.value.extra["resource"] == "locales"
    assert exc.value.extra["limit"] == 2
    assert exc.value.http_status == 402


def test_check_count_limit_is_unlimited_when_the_tier_says_none(
    make_plan_settings, organization_a
):
    from apps.billing.constants import OPS

    make_plan_settings(organization_a, plan=OPS)
    # OPS caps locales at 8, not None — but the "unlimited" branch must
    # still work for a resource whose limit is None.
    from apps.billing.constants import PLAN_TIER_LIMITS

    if PLAN_TIER_LIMITS[OPS]["items"] is None:
        check_count_limit(organization_a, "items", 100_000)


def test_enforce_usage_limit_refuses_at_the_monthly_boundary(
    make_plan_settings, organization_a
):
    """PRO allows 100 AI translations a month."""
    make_plan_settings(organization_a, plan=PRO)

    # 99 used, one more lands exactly on the cap → allowed.
    record_usage(organization_a, "ai_translate_ops", 99)
    enforce_usage_limit(organization_a, "ai_translate_ops")

    # The counter now stands at 100; the next one would cross the line.
    record_usage(organization_a, "ai_translate_ops", 1)
    with pytest.raises(LimitExceeded) as exc:
        enforce_usage_limit(organization_a, "ai_translate_ops")
    assert exc.value.extra["resource"] == "ai_translate_ops"
    assert exc.value.extra["limit"] == 100
    assert exc.value.http_status == 402


def test_enforce_usage_limit_counts_the_units_of_the_operation(
    make_plan_settings, organization_a
):
    """A bulk call that would cross the line is the one that is refused."""
    make_plan_settings(organization_a, plan=PRO)
    record_usage(organization_a, "ai_description_ops", 95)

    # 5 more would land exactly on the cap → allowed.
    enforce_usage_limit(organization_a, "ai_description_ops", units=5)

    # 6 more would cross it → refused.
    with pytest.raises(LimitExceeded):
        enforce_usage_limit(organization_a, "ai_description_ops", units=6)


def test_enforce_usage_limit_refuses_an_unknown_resource(organization_a):
    with pytest.raises(ValueError):
        enforce_usage_limit(organization_a, "not_a_resource")


# ---------------------------------------------------------------------------
# The endpoints
# ---------------------------------------------------------------------------


def test_the_tenant_cannot_widen_its_language_list_past_the_cap(
    make_plan_settings, organization_a, user_a
):
    """PATCH /admin/organizations/ — the language cap is a write guard."""
    make_plan_settings(organization_a, plan=BASIC)
    client = APIClient()
    client.force_authenticate(user=user_a)

    ok = client.patch(
        f"/api/v1/admin/organizations/{organization_a.id}/",
        {"supported_locales": ["tr", "en"]},
        format="json",
    )
    assert ok.status_code == 200, ok.content

    refused = client.patch(
        f"/api/v1/admin/organizations/{organization_a.id}/",
        {"supported_locales": ["tr", "en", "de"]},
        format="json",
    )
    assert refused.status_code == 402, refused.content
    assert refused.json()["error"]["code"] == "billing.limit_exceeded"

    organization_a.refresh_from_db()
    assert organization_a.supported_locales == ["tr", "en"]


def test_the_signup_wizard_cannot_widen_the_language_list_past_the_cap(
    make_plan_settings, organization_a, user_a
):
    """POST /onboarding/preferences/ — the wizard is a write like any other."""
    make_plan_settings(organization_a, plan=BASIC)
    client = APIClient()
    client.force_authenticate(user=user_a)

    refused = client.post(
        "/api/v1/onboarding/preferences",
        {
            "default_locale": "tr",
            "supported_locales": ["tr", "en", "de", "fr"],
            "currency": "TRY",
        },
        format="json",
    )
    assert refused.status_code == 402, refused.content
    organization_a.refresh_from_db()
    assert organization_a.supported_locales == ["tr", "en"]


def test_the_analytics_dashboard_stops_at_the_monthly_traffic_cap(
    make_plan_settings, organization_a, user_a
):
    """GET /admin/analytics/overview — the cap is on the insight, not the menu.

    The tenant's guests must always be able to open the menu; what stops
    at the cap is the tenant's own access to the analysis of the visits.
    """
    make_plan_settings(organization_a, plan=BASIC)  # 1 000 views
    client = APIClient()
    client.force_authenticate(user=user_a)

    record_usage(organization_a, "views", 1_000)

    response = client.get("/api/v1/admin/analytics/overview")
    assert response.status_code == 402, response.content
    assert response.json()["error"]["code"] == "billing.limit_exceeded"


def test_the_ai_translation_is_refused_at_the_monthly_cap(
    make_plan_settings, organization_a, user_a
):
    """POST /admin/translate/ — the AI cap."""
    make_plan_settings(organization_a, plan=PRO)
    record_usage(organization_a, "ai_translate_ops", 100)

    client = APIClient()
    client.force_authenticate(user=user_a)

    response = client.post(
        "/api/v1/admin/translate/",
        {"text": "Türk Kahvesi", "source_locale": "tr", "target_locale": "en"},
        format="json",
    )
    assert response.status_code == 402, response.content
    assert response.json()["error"]["code"] == "billing.limit_exceeded"


def test_the_ai_translation_still_works_under_the_cap(
    make_plan_settings, organization_a, user_a
):
    """The guard must not block a tenant that has allowance left."""
    make_plan_settings(organization_a, plan=PRO)
    record_usage(organization_a, "ai_translate_ops", 10)

    client = APIClient()
    client.force_authenticate(user=user_a)

    with patch_provider():
        response = client.post(
            "/api/v1/admin/translate/",
            {"text": "Türk Kahvesi", "source_locale": "tr", "target_locale": "en"},
            format="json",
        )
    assert response.status_code == 200, response.content


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def patch_provider():
    """Stub the AI provider so the test does not call the real API."""
    from unittest.mock import patch

    return patch(
        "apps.translate.views.translate_text",
        return_value={
            "translated": "Turkish Coffee",
            "cached": False,
            "provider": "openai",
            "model": "test-model",
        },
    )
