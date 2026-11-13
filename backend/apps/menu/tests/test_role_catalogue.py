"""Catalogue permissions per role (SPEC_PILOT_READINESS §3.1-3.2).

Floor staff may only flip "tükendi / mevcut"; deleting is owner-only; a menu
that still has active QR codes cannot be deleted (the cascade would erase the
records of printed QR codes).
"""

from __future__ import annotations

import pytest

from apps.accounts.models import Membership, MembershipRole
from apps.menu.models import Menu, MenuItem
from apps.qr.models import QRCode

pytestmark = pytest.mark.django_db


def _sign_in(api_client, django_user_model, org, role, email):
    user = django_user_model.objects.create_user(email=email, password="x", role="staff")
    Membership.objects.create(user=user, organization=org, role=role)
    api_client.force_login(user)
    return user


def _sign_in_owner(api_client, org):
    api_client.force_login(org.memberships.get(role=MembershipRole.OWNER).user)


def _gate_denied(response) -> bool:
    return (
        response.status_code == 403
        and response.json().get("error", {}).get("code") == "auth.role_forbidden"
    )


def _availability_url(item) -> str:
    return f"/api/v1/admin/menu-items/{item.id}/availability"


# ---------------------------------------------------------------- availability


def test_staff_can_mark_an_item_unavailable_and_available_again(
    api_client, django_user_model, org_a, item
):
    _sign_in(api_client, django_user_model, org_a, MembershipRole.STAFF, "staff@a.example")

    response = api_client.post(_availability_url(item), {"is_available": False}, format="json")
    assert response.status_code == 200, response.content
    assert response.json()["data"] == {"id": item.id, "is_available": False}
    item.refresh_from_db()
    assert item.is_available is False

    response = api_client.post(_availability_url(item), {"is_available": True}, format="json")
    assert response.status_code == 200
    item.refresh_from_db()
    assert item.is_available is True


def test_availability_rejects_a_non_boolean_value(api_client, django_user_model, org_a, item):
    _sign_in(api_client, django_user_model, org_a, MembershipRole.STAFF, "staff@a.example")
    response = api_client.post(_availability_url(item), {"is_available": "yes"}, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "menu.invalid_availability"
    item.refresh_from_db()
    assert item.is_available is True


def test_availability_is_scoped_to_the_callers_organization(
    api_client, django_user_model, org_a, org_b, item
):
    _sign_in(api_client, django_user_model, org_b, MembershipRole.STAFF, "staff@b.example")
    response = api_client.post(_availability_url(item), {"is_available": False}, format="json")
    assert response.status_code == 404
    item.refresh_from_db()
    assert item.is_available is True


def test_staff_cannot_edit_the_price(api_client, django_user_model, org_a, item):
    _sign_in(api_client, django_user_model, org_a, MembershipRole.STAFF, "staff@a.example")
    response = api_client.patch(
        f"/api/v1/admin/menu-items/{item.id}/", {"price": "1.00"}, format="json"
    )
    assert _gate_denied(response)
    item.refresh_from_db()
    assert str(item.price) == "12.50"


def test_kitchen_cannot_touch_the_catalogue_at_all(api_client, django_user_model, org_a, item):
    _sign_in(api_client, django_user_model, org_a, MembershipRole.KITCHEN, "kitchen@a.example")
    assert _gate_denied(api_client.get("/api/v1/admin/menu-items/"))
    assert _gate_denied(api_client.post(_availability_url(item), {"is_available": False}, format="json"))


# ---------------------------------------------------------------------- delete


def test_manager_cannot_delete_an_item(api_client, django_user_model, org_a, item):
    _sign_in(api_client, django_user_model, org_a, MembershipRole.MANAGER, "mgr@a.example")
    response = api_client.delete(f"/api/v1/admin/menu-items/{item.id}/")
    assert _gate_denied(response)
    assert MenuItem.objects.filter(pk=item.pk).exists()


def test_owner_can_delete_an_item(api_client, org_a, item):
    _sign_in_owner(api_client, org_a)
    response = api_client.delete(f"/api/v1/admin/menu-items/{item.id}/")
    assert response.status_code == 204
    assert not MenuItem.objects.filter(pk=item.pk).exists()


def test_a_menu_with_active_qr_codes_cannot_be_deleted(api_client, org_a, menu):
    QRCode.objects.create(organization=org_a, menu=menu, label="Kasa önü", is_active=True)
    _sign_in_owner(api_client, org_a)

    response = api_client.delete(f"/api/v1/admin/menus/{menu.id}/")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "menu.has_active_qr"
    assert Menu.objects.filter(pk=menu.pk).exists()
    assert QRCode.objects.filter(menu=menu).count() == 1


def test_a_menu_with_only_inactive_qr_codes_can_be_deleted(api_client, org_a, menu):
    QRCode.objects.create(organization=org_a, menu=menu, label="Eski", is_active=False)
    _sign_in_owner(api_client, org_a)

    response = api_client.delete(f"/api/v1/admin/menus/{menu.id}/")

    assert response.status_code == 204
    assert not Menu.objects.filter(pk=menu.pk).exists()
