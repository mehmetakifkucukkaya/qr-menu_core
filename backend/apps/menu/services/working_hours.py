"""Working-hours schema validation (OP-8).

The `Branch.working_hours_json` field stores a dict of the shape:

    {
        "mon": [{"open": "08:00", "close": "22:00"}],
        "tue": [{"open": "08:00", "close": "22:00"}],
        ...
    }

Each day is a list of intervals (a single day can have multiple shifts).
Day keys must be 3-letter lowercase weekday codes; open/close strings must
be ``HH:MM`` in 24-hour format.

This module is reused from `apps.branches` admin in Sprint 2 (admin field
polish). It is deliberately tolerant: missing days are fine (closed), and
validation can be applied at the admin boundary, not at the DB layer
(JSONField has no schema constraint).
"""

from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError

VALID_DAYS = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}


def _is_hhmm(value: str) -> bool:
    """True if value matches ``HH:MM`` (24h)."""
    if not isinstance(value, str) or len(value) != 5 or value[2] != ":":
        return False
    hh, mm = value[:2], value[3:]
    if not (hh.isdigit() and mm.isdigit()):
        return False
    h, m = int(hh), int(mm)
    return 0 <= h <= 23 and 0 <= m <= 59


def validate_working_hours_schema(payload: Any) -> bool:
    """Return True if payload conforms to the OP-8 schema; raise ValidationError otherwise.

    Accepts:
    - ``None`` or empty dict → trivially valid (no hours defined).
    - A dict keyed by weekday with list-of-intervals values.
    """
    if payload is None:
        return True
    if not isinstance(payload, dict):
        raise ValidationError("working_hours_json bir dict olmalıdır.")

    for day, intervals in payload.items():
        if day not in VALID_DAYS:
            raise ValidationError(
                f"Geçersiz gün anahtarı: {day!r}. "
                f"Beklenen: {sorted(VALID_DAYS)}"
            )
        if not isinstance(intervals, list):
            raise ValidationError(f"{day} bir liste olmalı (intervals).")
        for interval in intervals:
            if not isinstance(interval, dict):
                raise ValidationError(f"{day} içindeki interval dict olmalı.")
            if "open" not in interval or "close" not in interval:
                raise ValidationError(
                    f"{day} interval 'open' ve 'close' anahtarlarını içermeli."
                )
            if not _is_hhmm(interval["open"]) or not _is_hhmm(interval["close"]):
                raise ValidationError(
                    f"{day} interval saatleri HH:MM (24h) formatında olmalı."
                )
    return True


def normalize_working_hours(payload: dict | None) -> dict:
    """Return a copy of payload with all 7 days present (empty list if absent)."""
    if payload is None:
        payload = {}
    if not isinstance(payload, dict):
        raise ValidationError("working_hours_json bir dict olmalıdır.")
    result: dict = {}
    for day in sorted(VALID_DAYS):
        result[day] = list(payload.get(day, []))
    return result