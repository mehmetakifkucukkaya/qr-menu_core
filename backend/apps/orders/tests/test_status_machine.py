"""Moving an order through the kitchen (SPEC_PILOT_READINESS 5.2).

Two tablets can tap the same card, a cook can double-tap, a customer's order can
be cancelled for a reason the customer sees. The row is locked while it moves,
the same target twice is a success (not an error), an impossible move is a 409
with a Turkish sentence, and "Hazırlamaya başla" takes a new order through
confirmed -> preparing in one step.
"""

from __future__ import annotations

import pytest
from django.core.exceptions import ValidationError

from apps.accounts.models import Membership, MembershipRole, User
from apps.audit.models import AuditEvent
from apps.orders import services
from apps.orders.models import Order

pytestmark = pytest.mark.django_db


def _login(api_client, email):
    api_client.force_login(User.objects.get(email=email))


def _post(api_client, order, **body):
    return api_client.post(f"/api/v1/admin/orders/{order.pk}/status", body, format="json")


def _events(order):
    return list(
        AuditEvent.objects.filter(target_type="order", target_id=order.id).order_by("id")
    )


# ------------------------------------------------------------------ the combined first step


def test_starting_a_new_order_goes_through_confirmed_in_one_step(order_a):
    services.transition_status(order_a, "preparing")

    order_a.refresh_from_db()
    assert order_a.status == "preparing"
    assert order_a.confirmed_at is not None and order_a.preparing_at is not None
    assert order_a.confirmed_at <= order_a.preparing_at
    events = _events(order_a)
    assert [e.action for e in events] == ["order_confirmed", "order_preparing"]
    assert [e.payload for e in events] == [
        {"from": "pending", "to": "confirmed"},
        {"from": "confirmed", "to": "preparing"},
    ]


def test_the_api_takes_a_new_order_to_preparing_in_one_call(api_client, org_a, order_a):
    _login(api_client, "owner-a@example.com")
    response = _post(api_client, order_a, status="preparing")
    assert response.status_code == 200, response.content
    data = response.json()["data"]
    assert data["status"] == "preparing"
    assert data["confirmed_at"] and data["preparing_at"]


# ------------------------------------------------------------------ idempotency and the lock


def test_asking_for_the_status_an_order_already_has_is_a_quiet_success(order_a):
    services.transition_status(order_a, "preparing")
    services.transition_status(order_a, "preparing")
    services.transition_status(order_a, "ready")
    services.transition_status(order_a, "ready")
    assert len(_events(order_a)) == 3  # confirmed, preparing, ready - nothing for the repeats


def test_the_api_answers_200_both_times_when_two_tablets_tap_the_same_button(api_client, org_a, order_a):
    _login(api_client, "owner-a@example.com")
    first = _post(api_client, order_a, status="preparing")
    second = _post(api_client, order_a, status="preparing")
    assert (first.status_code, second.status_code) == (200, 200)
    assert second.json()["data"]["status"] == "preparing"


def test_a_stale_copy_of_the_order_is_refreshed_under_the_lock(order_a):
    """Tablet B still holds the order as "pending" after tablet A moved it on."""
    tablet_b = Order.objects.get(pk=order_a.pk)
    services.transition_status(order_a, "preparing")  # tablet A

    services.transition_status(tablet_b, "preparing")  # B asks for the same: fine
    assert tablet_b.status == "preparing"

    stale = Order.objects.get(pk=order_a.pk)
    stale.status = "pending"  # even a wrong in-memory status is replaced by the real one
    with pytest.raises(services.OrderTransitionError):
        services.transition_status(stale, "confirmed")  # the order is past that


# ------------------------------------------------------------------ impossible moves


@pytest.mark.parametrize(
    "start, target",
    [("pending", "ready"), ("pending", "delivered"), ("confirmed", "ready"), ("ready", "preparing"),
     ("delivered", "preparing"), ("cancelled", "confirmed"), ("ready", "cancelled")],
)
def test_an_impossible_move_is_a_409_with_a_turkish_sentence(api_client, org_a, order_a, start, target):
    Order.objects.filter(pk=order_a.pk).update(status=start)
    _login(api_client, "owner-a@example.com")

    response = _post(api_client, order_a, status=target, cancel_reason="other")

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "order.invalid_transition"
    assert error["message"].startswith("Geçersiz durum geçişi")
    assert "[" not in error["message"] and "'" not in error["message"]  # no Python list text
    assert Order.objects.get(pk=order_a.pk).status == start


def test_the_service_still_raises_a_validation_error_for_an_impossible_move(order_a):
    with pytest.raises(ValidationError) as caught:
        services.transition_status(order_a, "delivered")
    assert "Geçersiz" in str(caught.value)


def test_missing_and_unknown_statuses_are_400(api_client, org_a, order_a):
    _login(api_client, "owner-a@example.com")
    missing = _post(api_client, order_a)
    unknown = _post(api_client, order_a, status="banana")
    assert (missing.status_code, missing.json()["error"]["code"]) == (400, "order.status_required")
    assert (unknown.status_code, unknown.json()["error"]["code"]) == (400, "order.invalid_status")


# ------------------------------------------------------------------ cancelling


def test_a_cancellation_needs_a_reason(api_client, org_a, order_a):
    _login(api_client, "owner-a@example.com")

    none = _post(api_client, order_a, status="cancelled")
    bad = _post(api_client, order_a, status="cancelled", cancel_reason="because")

    assert (none.status_code, none.json()["error"]["code"]) == (400, "order.cancel_reason_required")
    assert (bad.status_code, bad.json()["error"]["code"]) == (400, "order.invalid_cancel_reason")
    assert Order.objects.get(pk=order_a.pk).status == "pending"


@pytest.mark.parametrize("start", ["pending", "confirmed", "preparing"])
def test_an_open_order_can_be_cancelled_with_a_reason_that_is_recorded(api_client, org_a, order_a, start):
    Order.objects.filter(pk=order_a.pk).update(status=start)
    _login(api_client, "owner-a@example.com")

    response = _post(api_client, order_a, status="cancelled", cancel_reason="out_of_stock")

    assert response.status_code == 200, response.content
    data = response.json()["data"]
    assert (data["status"], data["cancel_reason"]) == ("cancelled", "out_of_stock")
    assert data["cancel_reason_label"] == "Ürün tükendi"
    order = Order.objects.get(pk=order_a.pk)
    assert order.cancel_reason == "out_of_stock" and order.cancelled_at is not None
    assert _events(order)[-1].payload == {"from": start, "to": "cancelled", "cancel_reason": "out_of_stock"}


def test_the_customer_is_told_why_the_order_was_cancelled(api_client, org_a, order_a):
    services.transition_status(order_a, "cancelled", cancel_reason="kitchen_busy")

    cancelled = api_client.get(f"/api/v1/public/orders/{order_a.order_number}/status").json()["data"]

    assert cancelled["status"] == "cancelled"
    assert cancelled["cancel_reason"] == "kitchen_busy"
    assert cancelled["cancel_reason_label"] == "Mutfak yoğun"


def test_an_order_that_is_not_cancelled_has_no_reason(api_client, order_a):
    data = api_client.get(f"/api/v1/public/orders/{order_a.order_number}/status").json()["data"]
    assert data["cancel_reason"] is None and data["cancel_reason_label"] is None


# ------------------------------------------------------------------ who may do it


def test_a_kitchen_account_moves_orders_for_its_own_business_only(api_client, org_a, org_b, order_a):
    cook = User.objects.create_user(email="mutfak@a.example", password="x", role="staff")
    Membership.objects.create(user=cook, organization=org_a, role=MembershipRole.KITCHEN)
    api_client.force_login(cook)

    assert _post(api_client, order_a, status="preparing").status_code == 200
    assert _post(api_client, order_a, status="ready").status_code == 200

    other = User.objects.create_user(email="mutfak@b.example", password="x", role="staff")
    Membership.objects.create(user=other, organization=org_b, role=MembershipRole.KITCHEN)
    api_client.force_login(other)
    assert _post(api_client, order_a, status="delivered").status_code == 404  # not their business
