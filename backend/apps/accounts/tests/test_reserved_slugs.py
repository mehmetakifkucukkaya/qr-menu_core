"""One list of slugs no business may claim (SPEC_PILOT_READINESS 4.1).

Self-serve signup, the slug availability check and the agency's
``provision_tenant`` all read it from ``apps.organizations.reserved``. Before,
two copies of the list disagreed (the serializer did not know "docs" or "auth").
"""

from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.organizations.reserved import RESERVED_SLUGS, is_reserved

pytestmark = pytest.mark.django_db

# Routes, hosts and fixtures of the platform itself (spec 4.1, plus "www").
SPEC_LIST = {
    "modern-cafe", "demo", "m", "account", "login", "health", "docs", "auth", "api",
    "admin", "signup", "django-admin", "media", "static", "_next", "www",
}


def _signup_body(slug: str) -> dict:
    return {
        "email": f"owner-{abs(hash(slug))}@reserved.example",
        "password": "S3cur3-Pass!",
        "full_name": "Cafe Owner",
        "business_name": "Reserved Cafe",
        "slug": slug,
        "default_locale": "tr",
        "supported_locales": ["tr"],
        "currency": "TRY",
    }


def test_the_list_is_the_one_in_the_spec():
    assert set(RESERVED_SLUGS) == SPEC_LIST


def test_is_reserved_ignores_case_and_padding():
    assert is_reserved("Admin")
    assert is_reserved(" login ")
    assert not is_reserved("pilot-kafe")
    assert not is_reserved("")


@pytest.mark.parametrize("slug", sorted(SPEC_LIST))
def test_check_slug_reports_every_reserved_slug(slug):
    response = APIClient().get(reverse("auth-check-slug"), {"slug": slug})
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["available"] is False
    assert data["reason"] == "reserved"


@pytest.mark.parametrize("slug", sorted(SPEC_LIST))
def test_signup_refuses_every_reserved_slug(slug):
    response = APIClient().post(reverse("auth-signup"), _signup_body(slug), format="json")
    assert response.status_code == 400, slug
    assert "slug" in response.json()


def test_an_ordinary_slug_still_signs_up():
    response = APIClient().post(reverse("auth-signup"), _signup_body("pilot-kafe"), format="json")
    assert response.status_code == 201, response.content
