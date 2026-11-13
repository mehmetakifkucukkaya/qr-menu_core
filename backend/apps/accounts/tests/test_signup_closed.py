"""Public self-service signup is closed for the pilot (SPEC_PILOT_READINESS §3.5):
the agency opens customers. ``SIGNUP_ENABLED`` reopens it."""

from __future__ import annotations

import os

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.organizations.models import Organization

pytestmark = pytest.mark.django_db

BODY = {
    "email": "new-owner@mycafe.example",
    "password": "S3cur3-Pass!",
    "full_name": "Cafe Owner",
    "business_name": "My Cafe",
    "slug": "my-cafe",
    "default_locale": "tr",
    "supported_locales": ["tr", "en"],
    "currency": "TRY",
}


def test_signup_is_closed_when_the_flag_is_off(settings):
    settings.SIGNUP_ENABLED = False
    response = APIClient().post(reverse("auth-signup"), BODY, format="json")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "signup.disabled"
    assert not User.objects.filter(email=BODY["email"]).exists()
    assert not Organization.objects.filter(slug="my-cafe").exists()


def test_slug_check_is_closed_with_it(settings):
    settings.SIGNUP_ENABLED = False
    response = APIClient().get(reverse("auth-check-slug"), {"slug": "my-cafe"})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "signup.disabled"


def test_signup_works_when_the_flag_is_on(settings):
    settings.SIGNUP_ENABLED = True
    response = APIClient().post(reverse("auth-signup"), BODY, format="json")
    assert response.status_code == 201, response.content


@pytest.mark.skipif(
    "SIGNUP_ENABLED" in os.environ, reason="the environment overrides the shipped default"
)
def test_the_shipped_default_is_closed():
    """A fresh deployment must never expose signup."""
    from config.settings import base

    assert base.SIGNUP_ENABLED is False
