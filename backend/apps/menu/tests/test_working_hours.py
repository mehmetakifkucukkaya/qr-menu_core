"""Working-hours schema validator tests (OP-8)."""

from __future__ import annotations

import pytest
from django.core.exceptions import ValidationError

from apps.menu.services.working_hours import (
    normalize_working_hours,
    validate_working_hours_schema,
)


pytestmark = pytest.mark.django_db


def test_valid_schema_passes():
    """A well-formed payload validates without error."""
    payload = {
        "mon": [{"open": "08:00", "close": "22:00"}],
        "tue": [{"open": "08:00", "close": "22:00"}],
        "sun": [],
    }
    assert validate_working_hours_schema(payload) is True


def test_empty_payload_is_valid():
    """Empty / None payload is valid (no hours defined)."""
    assert validate_working_hours_schema(None) is True
    assert validate_working_hours_schema({}) is True


def test_invalid_day_rejected():
    """Unknown day key → ValidationError."""
    with pytest.raises(ValidationError):
        validate_working_hours_schema({"funday": [{"open": "08:00", "close": "22:00"}]})


def test_invalid_time_format_rejected():
    """HH:MM with hours > 23 or non-digit → ValidationError."""
    with pytest.raises(ValidationError):
        validate_working_hours_schema(
            {"mon": [{"open": "25:00", "close": "22:00"}]}
        )
    with pytest.raises(ValidationError):
        validate_working_hours_schema(
            {"mon": [{"open": "08:00", "close": "8pm"}]}
        )


def test_interval_must_contain_open_and_close():
    """An interval dict missing 'open' or 'close' → ValidationError."""
    with pytest.raises(ValidationError):
        validate_working_hours_schema(
            {"mon": [{"open": "08:00"}]}  # missing close
        )


def test_normalize_fills_missing_days():
    """`normalize_working_hours` returns all 7 days even if input is partial."""
    out = normalize_working_hours(
        {"mon": [{"open": "08:00", "close": "22:00"}]}
    )
    assert set(out.keys()) == {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}
    assert out["mon"] == [{"open": "08:00", "close": "22:00"}]
    assert out["tue"] == []


def test_branch_admin_form_rejects_bad_working_hours(org_a):
    """BranchAdminForm rejects malformed working_hours_json."""
    from apps.branches.admin import BranchAdminForm
    from apps.branches.models import Branch

    form = BranchAdminForm(
        data={
            "organization": org_a.id,
            "name": "Branch X",
            "slug": "branch-x",
            "working_hours_json": '{"funday":[{"open":"08:00","close":"22:00"}]}',
        }
    )
    assert form.is_valid() is False
    assert "working_hours_json" in form.errors