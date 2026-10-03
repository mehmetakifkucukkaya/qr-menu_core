"""Image URL PATCH tests — Sprint 5B backend glue.

The frontend uploads media via /api/v1/admin/media/upload (multipart) and
gets back an absolute URL. It then PATCHes that URL onto the item / category
/ organization via JSON. DRF's default ModelSerializer.ImageField rejects
URL strings (it expects a file-like value), so the serializer overrides
these fields with CharField. These tests guard the override.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.django_db


SAMPLE_URL = "http://localhost:3000/media/uploads/1/abc-test.jpg"


def _login(client, email, password="x"):
    return client.post(
        "/api/v1/auth/login",
        data={"email": email, "password": password},
        format="json",
    )


def test_item_image_patch_accepts_absolute_url(api_client, org_a, menu, category):
    """PATCH a menu item with `image` as an absolute URL (post media upload)."""
    _login(api_client, "owner-a@example.com")
    create = api_client.post(
        "/api/v1/admin/menu-items/",
        data={
            "menu_id": menu.id,
            "category_id": category.id,
            "name": "V60",
            "price": "12.50",
            "currency": "TRY",
        },
        format="json",
    )
    assert create.status_code == 201, create.json()
    item_id = create.json()["data"]["id"]

    patch = api_client.patch(
        f"/api/v1/admin/menu-items/{item_id}/",
        data={"image": SAMPLE_URL},
        format="json",
    )
    assert patch.status_code == 200, patch.json()
    assert patch.json()["data"]["image"] == SAMPLE_URL


def test_category_image_patch_accepts_absolute_url(api_client, org_a, menu):
    """PATCH a category with `image` as an absolute URL."""
    _login(api_client, "owner-a@example.com")
    create = api_client.post(
        "/api/v1/admin/categories/",
        data={
            "menu_id": menu.id,
            "name": "Hot Drinks",
        },
        format="json",
    )
    assert create.status_code == 201, create.json()
    cat_id = create.json()["data"]["id"]

    patch = api_client.patch(
        f"/api/v1/admin/categories/{cat_id}/",
        data={"image": SAMPLE_URL},
        format="json",
    )
    assert patch.status_code == 200, patch.json()
    assert patch.json()["data"]["image"] == SAMPLE_URL


def test_organization_logo_patch_accepts_absolute_url(api_client, admin_user, org_a):
    """PATCH the organization with `logo` + `cover_image` URLs.

    Uses ``admin_user`` (platform admin) — bypassing the object-level
    ``IsOrganizationMember`` short-circuit for non-admin org members is a
    pre-existing concern unrelated to the image URL serializer override.
    """
    _login(api_client, "admin@example.com", password="test-pass-123")
    patch = api_client.patch(
        f"/api/v1/admin/organizations/{org_a.id}/",
        data={"logo": SAMPLE_URL, "cover_image": SAMPLE_URL},
        format="json",
    )
    body = patch.json()
    assert patch.status_code == 200, body
    data = body.get("data", body)
    assert data["logo"] == SAMPLE_URL
    assert data["cover_image"] == SAMPLE_URL


def test_public_menu_returns_absolute_image_url(api_client, org_a, menu, category):
    """Public menu serializer must return absolute URLs verbatim,
    not prepend /media/."""
    _login(api_client, "owner-a@example.com")
    create = api_client.post(
        "/api/v1/admin/menu-items/",
        data={
            "menu_id": menu.id,
            "category_id": category.id,
            "name": "Latte",
            "price": "55.00",
            "currency": "TRY",
            "image": SAMPLE_URL,
        },
        format="json",
    )
    assert create.status_code == 201, create.json()
    api_client.post("/api/v1/auth/logout", format="json")

    public = api_client.get(f"/api/v1/public/menus/{org_a.slug}?locale=tr")
    assert public.status_code == 200, public.json()
    payload = public.json()["data"]
    found = False
    for cat in payload["categories"]:
        if cat["image"]:
            assert cat["image"] == SAMPLE_URL
            found = True
        for item in cat["items"]:
            if item["image"] == SAMPLE_URL:
                found = True
    assert found, "Expected the absolute URL to surface in the public payload"


def test_public_menu_returns_root_relative_image_url_unchanged(
    api_client, org_a, menu, category
):
    """The MediaAsset upload hands back ``/media/tenants/...`` for local
    storage. The public menu must serve it as is: ``field.url`` turned it into
    ``/media/media/tenants/...``, a 404 for every item and category photo."""
    path = "/media/tenants/modern-cafe/image/0a1b2c3d.png"
    _login(api_client, "owner-a@example.com")
    item = api_client.post(
        "/api/v1/admin/menu-items/",
        data={
            "menu_id": menu.id,
            "category_id": category.id,
            "name": "Fotoğraflı",
            "price": "55.00",
            "currency": "TRY",
            "image": path,
        },
        format="json",
    )
    assert item.status_code == 201, item.json()
    patched = api_client.patch(
        f"/api/v1/admin/categories/{category.id}/",
        data={"image": path},
        format="json",
    )
    assert patched.status_code == 200, patched.json()
    api_client.post("/api/v1/auth/logout", format="json")

    public = api_client.get(f"/api/v1/public/menus/{org_a.slug}?locale=tr")
    assert public.status_code == 200, public.json()
    categories = public.json()["data"]["categories"]
    shown = next(c for c in categories if c["id"] == category.id)
    assert shown["image"] == path
    assert [i["image"] for i in shown["items"] if i["name"] == "Fotoğraflı"] == [path]
    assert "/media/media/" not in public.content.decode()


def test_public_menu_has_no_image_when_none_was_added(api_client, org_a, menu, category):
    """Photos are optional: no photo means ``image`` is empty, not a broken URL."""
    _login(api_client, "owner-a@example.com")
    created = api_client.post(
        "/api/v1/admin/menu-items/",
        data={
            "menu_id": menu.id,
            "category_id": category.id,
            "name": "Fotoğrafsız",
            "price": "30.00",
            "currency": "TRY",
        },
        format="json",
    )
    assert created.status_code == 201, created.json()
    api_client.post("/api/v1/auth/logout", format="json")

    public = api_client.get(f"/api/v1/public/menus/{org_a.slug}?locale=tr")
    assert public.status_code == 200, public.json()
    items = [
        i
        for c in public.json()["data"]["categories"]
        for i in c["items"]
        if i["name"] == "Fotoğrafsız"
    ]
    assert len(items) == 1
    assert not items[0]["image"]

