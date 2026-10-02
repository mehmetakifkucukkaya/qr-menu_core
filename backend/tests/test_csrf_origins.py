"""Browser writes from the web app's origin must pass Django's CSRF origin check.

Local layout: web on :3000, API on :8000. Before CSRF_TRUSTED_ORIGINS was derived
from CORS_ALLOWED_ORIGINS in base.py, every admin POST/PATCH/DELETE sent from the
panel's origin was rejected with 403 "Origin checking failed" (only curl, which
sends no Origin header, worked - which is how this went unnoticed).
"""

from __future__ import annotations

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

WEB_ORIGIN = "http://localhost:3000"


def test_trusted_origins_follow_the_cors_allow_list():
    from django.conf import settings

    assert settings.CSRF_TRUSTED_ORIGINS == list(settings.CORS_ALLOWED_ORIGINS)
    assert WEB_ORIGIN in settings.CSRF_TRUSTED_ORIGINS


def _logged_in_strict_client(user):
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(user)
    token = client.get("/api/v1/auth/csrf").json()["csrfToken"]
    return client, token


def test_write_from_the_web_origin_with_a_valid_token_is_accepted(org_a, django_user_model):
    owner = django_user_model.objects.get(email="owner-a@example.com")
    client, token = _logged_in_strict_client(owner)

    res = client.post(
        "/api/v1/admin/menus/",
        data={"organization_id": org_a.id, "name": "Origin test"},
        format="json",
        HTTP_ORIGIN=WEB_ORIGIN,
        HTTP_X_CSRFTOKEN=token,
    )

    assert res.status_code == 201, res.content


def test_write_from_an_untrusted_origin_is_still_rejected(org_a, django_user_model):
    owner = django_user_model.objects.get(email="owner-a@example.com")
    client, token = _logged_in_strict_client(owner)

    res = client.post(
        "/api/v1/admin/menus/",
        data={"organization_id": org_a.id, "name": "Evil"},
        format="json",
        HTTP_ORIGIN="https://evil.example",
        HTTP_X_CSRFTOKEN=token,
    )

    assert res.status_code == 403
