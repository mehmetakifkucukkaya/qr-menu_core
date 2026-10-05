"""The agency panel's membership forms speak Turkish (SPEC_PILOT_READINESS 4.3):
the page of a single membership and the team table on the customer page."""

from __future__ import annotations

import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db


@pytest.fixture
def agency(client, admin_user):
    client.force_login(admin_user)
    return client


def test_the_membership_page_has_turkish_labels(agency):
    html = agency.get(reverse("admin:accounts_membership_add")).content.decode()
    for label in ("Kullanıcı", "İşletme", "Rol", "Aktif"):
        assert label in html, label
    assert "Is active" not in html


def test_the_team_table_on_the_customer_page_has_turkish_headers(agency, org_a):
    html = agency.get(
        reverse("admin:organizations_organization_change", args=[org_a.pk])
    ).content.decode()
    assert "Ekip ve üyelikler" in html
    assert "Kullanıcı" in html and "Rol" in html
    assert "Is active" not in html
