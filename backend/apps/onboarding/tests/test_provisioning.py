"""``provision_tenant`` - the one way a customer is opened (SPEC_PILOT_READINESS 4.1).

The agency's command and Django-admin view, and the (closed) self-serve signup,
all go through it: owner account, business, membership, plan, optional trial,
starter content and the ``tenant_created`` audit event, in one transaction.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Membership, MembershipRole, User
from apps.audit.models import AuditEvent
from apps.billing.constants import FEATURE_FIELDS
from apps.billing.models import PlanSettings
from apps.branches.models import Branch
from apps.menu.models import Menu, MenuItem
from apps.onboarding import provisioning
from apps.onboarding.provisioning import ProvisioningError, provision_tenant
from apps.organizations.models import Organization
from apps.qr.models import QRCode
from apps.theme.models import ThemeConfig

pytestmark = pytest.mark.django_db


def _open(**overrides):
    values = dict(name="Pilot Kafe", slug="pilot-kafe", owner_email="Owner@Pilot.test")
    values.update(overrides)
    return provision_tenant(**values)


def _counts():
    return (User.objects.count(), Organization.objects.count(), PlanSettings.objects.count())


# ------------------------------------------------------------------ the happy path


def test_an_agency_customer_is_complete():
    result = _open(owner_name="Pilot Sahibi", plan="pro", modules=["orders"])

    org, owner = result.organization, result.owner
    assert (org.name, org.slug, org.is_active) == ("Pilot Kafe", "pilot-kafe", True)
    assert (org.default_locale, org.supported_locales, org.currency) == ("tr", ["tr"], "TRY")

    # The owner signs in with a temporary password and must replace it.
    assert owner.email == "owner@pilot.test"
    assert owner.full_name == "Pilot Sahibi"
    assert owner.role == "owner" and owner.must_change_password is True
    assert len(result.temporary_password) == 10
    assert owner.check_password(result.temporary_password)
    member = Membership.objects.get(user=owner, organization=org)
    assert member.role == MembershipRole.OWNER and member.is_active

    # Starter content: theme, one branch, an empty menu and its first QR code.
    assert ThemeConfig.objects.filter(organization=org).exists()
    branch = Branch.objects.get(organization=org)
    assert (branch.name, branch.slug, branch.is_active) == ("Merkez", "merkez", True)
    menu = Menu.objects.get(organization=org)
    assert (menu.name, menu.slug, menu.is_active) == ("Ana Menü", "ana-menu", True)
    assert not MenuItem.objects.filter(menu=menu).exists()
    qr = QRCode.objects.get(organization=org)
    assert result.qr == qr
    assert (qr.branch, qr.menu, qr.label) == (branch, menu, "Ana QR")
    assert "/m/pilot-kafe" in qr.target_url


def test_the_plan_decides_the_features_and_modules_add_to_them():
    result = _open(plan="pro", modules=["orders"])
    ps = result.plan_settings
    assert ps.active_plan == "pro"
    assert ps.cart_enabled and ps.orders_enabled          # the module
    assert ps.ai_pdf_import_enabled and ps.ai_translate_enabled  # PRO's own
    assert not ps.loyalty_enabled and not ps.customer_accounts_enabled
    assert ps.trial_ends_at is None


def test_every_module_maps_to_its_flags():
    result = _open(
        plan="basic",
        modules=["orders", "loyalty", "ai_pdf", "ai_translate", "analytics"],
    )
    ps = PlanSettings.objects.get(organization=result.organization)
    on = {f for f in FEATURE_FIELDS if getattr(ps, f)}
    assert on == {
        "cart_enabled", "orders_enabled", "loyalty_enabled", "customer_accounts_enabled",
        "ai_pdf_import_enabled", "ai_translate_enabled", "advanced_analytics_enabled",
    }
    assert set(provisioning.MODULES) == {"orders", "loyalty", "ai_pdf", "ai_translate", "analytics"}


def test_online_payment_is_never_opened_by_provisioning():
    result = _open(plan="ops", modules=["orders"])
    assert result.plan_settings.active_plan == "ops"
    assert result.plan_settings.loyalty_enabled is True
    assert result.plan_settings.payments_enabled is False


def test_a_trial_puts_a_basic_customer_on_ops_for_a_while():
    result = _open(plan="basic", trial_days=14)
    ps = PlanSettings.objects.get(organization=result.organization)
    assert ps.active_plan == "ops"
    assert abs(ps.trial_ends_at - (timezone.now() + timedelta(days=14))) < timedelta(seconds=5)
    assert ps.payments_enabled is False


def test_the_event_names_who_opened_what():
    result = _open(plan="pro", modules=["orders"], trial_days=0)
    event = AuditEvent.objects.get(organization=result.organization, action="tenant_created")
    assert event.target_type == "organization" and event.target_id == result.organization.id
    assert event.payload["owner_email"] == "owner@pilot.test"
    assert event.payload["plan"] == "pro"
    assert event.payload["modules"] == ["orders"]
    assert event.payload["signup_source"] == "agency"
    assert result.temporary_password not in str(event.payload)


# ------------------------------------------------------------------ the self-serve shape


def test_a_chosen_password_is_kept_and_no_starter_content_is_made():
    result = _open(
        owner_password="S3cur3-Pass!", starter_content=False, open_payments=True,
        trial_days=14, source="self_serve_wizard",
    )
    assert result.temporary_password is None
    assert result.owner.must_change_password is False
    assert result.owner.check_password("S3cur3-Pass!")
    org = result.organization
    assert not ThemeConfig.objects.filter(organization=org).exists()
    assert not Branch.objects.filter(organization=org).exists()
    assert not Menu.objects.filter(organization=org).exists()
    assert result.qr is None
    # The signup trial keeps its old shape: every OPS feature, payments included.
    assert result.plan_settings.active_plan == "ops"
    assert result.plan_settings.payments_enabled is True


# ------------------------------------------------------------------ refusals


@pytest.mark.parametrize(
    "overrides, field",
    [
        ({"name": "  "}, "name"),
        ({"name": "x" * 161}, "name"),
        ({"slug": "Has Space"}, "slug"),
        ({"slug": "-lead"}, "slug"),
        ({"slug": "login"}, "slug"),
        ({"slug": "django-admin"}, "slug"),
        ({"owner_email": "not-an-email"}, "owner_email"),
        ({"plan": "gold"}, "plan"),
        ({"modules": ["orders", "payments"]}, "modules"),
        ({"trial_days": -1}, "trial_days"),
        ({"trial_days": 91}, "trial_days"),
        ({"plan": "pro", "trial_days": 7}, "trial_days"),
        ({"modules": ["orders"], "trial_days": 7}, "trial_days"),
        ({"currency": "XXX"}, "currency"),
        ({"default_locale": "en", "supported_locales": ["tr"]}, "supported_locales"),
    ],
)
def test_bad_input_is_refused_and_nothing_is_created(overrides, field):
    before = _counts()
    with pytest.raises(ProvisioningError) as caught:
        _open(**overrides)
    assert field in caught.value.errors
    assert _counts() == before


def test_a_taken_slug_and_a_taken_email_are_refused():
    _open()
    before = _counts()
    with pytest.raises(ProvisioningError) as caught:
        _open(owner_email="OWNER@pilot.test")
    assert set(caught.value.errors) == {"slug", "owner_email"}
    assert _counts() == before


def test_all_problems_are_reported_together():
    with pytest.raises(ProvisioningError) as caught:
        _open(name="", slug="admin", owner_email="x", plan="gold")
    assert set(caught.value.errors) == {"name", "slug", "owner_email", "plan"}


def test_a_failure_halfway_rolls_everything_back(monkeypatch):
    def boom(organization):
        raise RuntimeError("QR service down")

    monkeypatch.setattr(provisioning.services, "generate_first_qr", boom)
    before = _counts()
    with pytest.raises(RuntimeError):
        _open()
    assert _counts() == before
    assert not Branch.objects.exists() and not Menu.objects.exists()
    assert not AuditEvent.objects.filter(action="tenant_created").exists()


# ------------------------------------------------------------------ the signup flow built on it


def _signup(client):
    return client.post(
        "/api/v1/auth/signup",
        {
            "email": "new-owner@mycafe.example",
            "password": "S3cur3-Pass!",
            "full_name": "Cafe Owner",
            "business_name": "My Cafe",
            "slug": "my-cafe",
            "default_locale": "tr",
            "supported_locales": ["tr", "en"],
            "currency": "TRY",
        },
        format="json",
    )


def test_self_serve_signup_goes_through_the_service():
    client = APIClient()
    assert _signup(client).status_code == 201
    org = Organization.objects.get(slug="my-cafe")
    owner = User.objects.get(email="new-owner@mycafe.example")
    assert owner.must_change_password is False and owner.check_password("S3cur3-Pass!")
    event = AuditEvent.objects.get(organization=org, action="tenant_created")
    assert event.payload["signup_source"] == "self_serve_wizard"
    # The wizard makes the menu and the QR code later, step by step.
    assert not Menu.objects.filter(organization=org).exists()
    assert not Branch.objects.filter(organization=org).exists()


def test_an_agency_customer_gets_the_same_first_qr_back():
    result = _open()
    client = APIClient()
    client.force_login(result.owner)

    response = client.post("/api/v1/qr-codes/first", {}, format="json")

    assert response.status_code == 201, response.content
    assert response.json()["data"]["id"] == result.qr.id
    assert QRCode.objects.filter(organization=result.organization).count() == 1
