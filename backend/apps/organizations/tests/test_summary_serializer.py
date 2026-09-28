"""Sprint A — OrganizationSummarySerializer coverage.

The public menu payload (Sprint 3 + Sprint 8B) was rendering broken
``/organizations/logos/x.jpg`` paths and never carried contact /
location fields. Faz 1.1 + Faz 2.1 extend the serializer — these
tests pin the new contract.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.django_db


def test_organization_summary_includes_cover_and_address(org_a):
    """Faz 2.1 — cover_image + description + address + maps + website + email + phone."""
    org_a.description = "Kadıköy'ün en sevilen filtresi"
    org_a.address = "Caferağa Mah. No 12, Kadıköy"
    org_a.google_maps_url = "https://maps.google.com/?q=modern-cafe"
    org_a.website = "https://modern-cafe.example.com"
    org_a.email = "hello@modern-cafe.example.com"
    org_a.phone = "+90 532 000 0000"
    org_a.save()

    from apps.organizations.serializers import OrganizationSummarySerializer

    data = OrganizationSummarySerializer(org_a).data

    assert data["description"] == "Kadıköy'ün en sevilen filtresi"
    assert data["address"] == "Caferağa Mah. No 12, Kadıköy"
    assert data["google_maps_url"] == "https://maps.google.com/?q=modern-cafe"
    assert data["website"] == "https://modern-cafe.example.com"
    assert data["email"] == "hello@modern-cafe.example.com"
    assert data["phone"] == "+90 532 000 0000"
    # cover_image is resolved to None when not set — placeholder takes over in UI.
    assert data["cover_image"] is None
    # Backwards-compat fields still present.
    assert data["currency"] == "TRY"
    assert data["default_locale"] == "tr"


def test_organization_summary_logo_passed_through_when_absolute_url(org_a):
    """Admin uploads via /api/v1/admin/media/upload return absolute URLs;
    the public payload must round-trip them unchanged."""
    org_a.logo = "https://demo.example.com/uploads/orgs/modern-cafe-logo.png"
    org_a.save()

    from apps.organizations.serializers import OrganizationSummarySerializer

    data = OrganizationSummarySerializer(org_a).data
    assert data["logo"] == "https://demo.example.com/uploads/orgs/modern-cafe-logo.png"


def test_organization_summary_logo_resolves_fieldfile(org_a):
    """Faz 1.1 — when an admin uploads via the Django admin form (FieldFile),
    the public serializer must resolve to MEDIA_URL + filename so the
    frontend never receives a broken relative path."""
    # Direct file save via SimpleUploadedFile isn't necessary — the model's
    # ImageField returns a FieldFile when assigned a string path. We
    # simulate the legacy form-upload shape by assigning the storage
    # path that the ImageField would have after the form processed it.
    from django.core.files.uploadedfile import SimpleUploadedFile

    org_a.logo = SimpleUploadedFile(
        "modern-cafe-logo.png",
        b"\x89PNG\r\n\x1a\n" + b"\x00" * 16,
        content_type="image/png",
    )
    org_a.save()

    from apps.organizations.serializers import OrganizationSummarySerializer

    data = OrganizationSummarySerializer(org_a).data
    logo = data["logo"]
    # Resolution must be an absolute or MEDIA-rooted URL, never a bare path.
    assert logo is not None
    assert logo.startswith(("http://", "https://", "/"))
    # And critically: NOT the raw "organizations/logos/..." storage path.
    assert not logo.startswith("organizations/logos/")


def test_organization_summary_empty_optional_fields_remain_none(org_a):
    """Empty defaults are surfaced as None / empty string so the frontend
    can branch on presence without string-length checks."""
    from apps.organizations.serializers import OrganizationSummarySerializer

    data = OrganizationSummarySerializer(org_a).data
    assert data["logo"] is None
    assert data["cover_image"] is None
    assert data["description"] == ""  # model default
    assert data["address"] == ""
    assert data["google_maps_url"] == ""
    assert data["website"] == ""
    assert data["email"] == ""
    assert data["phone"] == ""