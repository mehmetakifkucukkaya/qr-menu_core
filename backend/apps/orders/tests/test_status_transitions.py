"""Status transition state-machine tests \u2014 Sprint 8A (D-022).

Drives ``transition_status`` and asserts:

* Forward-only edges from the FSM.
* Terminal states (``delivered`` / ``cancelled``) refuse any move.
* Audit events fire on every successful transition.
* Timestamps are stamped at the right points and stay null otherwise.
"""

from __future__ import annotations

import pytest
from django.core.exceptions import ValidationError

from apps.audit.models import AuditEvent
from apps.orders import services
from apps.orders.models import OrderStatus

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Happy path \u2014 every legal edge
# ---------------------------------------------------------------------------
def test_status_transition_pending_to_confirmed(order_a):
    services.transition_status(order_a, OrderStatus.CONFIRMED.value)
    order_a.refresh_from_db()
    assert order_a.status == "confirmed"
    assert order_a.confirmed_at is not None
    assert order_a.preparing_at is None
    assert order_a.cancelled_at is None


def test_status_transition_confirmed_to_preparing(order_a):
    services.transition_status(order_a, "confirmed")
    services.transition_status(order_a, "preparing")
    order_a.refresh_from_db()
    assert order_a.status == "preparing"
    assert order_a.confirmed_at is not None
    assert order_a.preparing_at is not None


def test_status_transition_preparing_to_ready(order_a):
    for s in ("confirmed", "preparing", "ready"):
        services.transition_status(order_a, s)
    order_a.refresh_from_db()
    assert order_a.status == "ready"
    assert order_a.ready_at is not None


def test_status_transition_ready_to_delivered(order_a):
    for s in ("confirmed", "preparing", "ready", "delivered"):
        services.transition_status(order_a, s)
    order_a.refresh_from_db()
    assert order_a.status == "delivered"
    assert order_a.delivered_at is not None


def test_status_transition_records_audit_event(order_a):
    services.transition_status(order_a, "confirmed")
    events = list(
        AuditEvent.objects.filter(
            target_type="order", target_id=order_a.id
        )
    )
    assert len(events) == 1
    e = events[0]
    assert e.action == "order_confirmed"
    assert e.payload == {"from": "pending", "to": "confirmed"}
    assert e.organization_id == order_a.organization_id


# ---------------------------------------------------------------------------
# Error path \u2014 illegal edges
# ---------------------------------------------------------------------------
def test_status_invalid_transition_rejected(order_a):
    with pytest.raises(ValidationError) as exc:
        services.transition_status(order_a, "delivered")  # pending -> delivered
    assert "Ge\u00e7ersiz" in str(exc.value)


def test_status_pending_skip_steps_rejected(order_a):
    # pending -> preparing is not in the FSM (would skip confirmed).
    with pytest.raises(ValidationError):
        services.transition_status(order_a, "preparing")


def test_status_terminal_delivered_cannot_change(order_a):
    for s in ("confirmed", "preparing", "ready", "delivered"):
        services.transition_status(order_a, s)
    for illegal in ("pending", "confirmed", "preparing", "ready", "cancelled"):
        with pytest.raises(ValidationError):
            services.transition_status(order_a, illegal)


def test_status_terminal_cancelled_cannot_change(order_a):
    services.transition_status(order_a, "cancelled")
    for illegal in ("pending", "confirmed", "preparing", "ready", "delivered"):
        with pytest.raises(ValidationError):
            services.transition_status(order_a, illegal)


def test_status_transition_ready_cannot_be_cancelled(order_a):
    """Once an order is ``ready`` the only legal move is ``delivered``."""
    for s in ("confirmed", "preparing", "ready"):
        services.transition_status(order_a, s)
    with pytest.raises(ValidationError):
        services.transition_status(order_a, "cancelled")


# ---------------------------------------------------------------------------
# Timestamp integrity
# ---------------------------------------------------------------------------
def test_status_transition_pending_only_has_placed_at(order_a):
    """No lifecycle timestamps should be set until an admin acts."""
    order_a.refresh_from_db()
    assert order_a.placed_at is not None
    assert order_a.confirmed_at is None
    assert order_a.preparing_at is None
    assert order_a.ready_at is None
    assert order_a.delivered_at is None
    assert order_a.cancelled_at is None


def test_status_cancelled_stamps_cancelled_at_only(order_a):
    services.transition_status(order_a, "cancelled")
    order_a.refresh_from_db()
    assert order_a.cancelled_at is not None
    assert order_a.confirmed_at is None
    assert order_a.preparing_at is None


def test_status_unknown_value_rejected(order_a):
    with pytest.raises(ValidationError):
        services.transition_status(order_a, "not_a_state")
