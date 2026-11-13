"""Role gate (SPEC_PILOT_READINESS §3.1-3.2): the policy table, the middleware
that enforces it, and a completeness check over the URLconf."""

from __future__ import annotations

import re

import pytest
from django.contrib.admindocs.views import simplify_regex
from django.urls import URLPattern, URLResolver, get_resolver

from apps.accounts import roles
from apps.accounts.models import Membership, MembershipRole

pytestmark = pytest.mark.django_db

OWNER, MANAGER, STAFF, KITCHEN = "owner", "manager", "staff", "kitchen"
ROLES = (OWNER, MANAGER, STAFF, KITCHEN)
EVERYONE = {OWNER, MANAGER, STAFF, KITCHEN}

# One row per endpoint class: (method, path, roles that may call it).
# This is the approved matrix, written out independently of roles.RULES so a
# wrong edit of the table cannot silently re-define the expectation.
MATRIX = [
    ("GET", "/api/v1/admin/team/", {OWNER}),
    ("POST", "/api/v1/admin/team/", {OWNER}),
    ("PATCH", "/api/v1/admin/team/5/", {OWNER}),
    ("POST", "/api/v1/admin/team/5/reset-password/", {OWNER}),
    ("GET", "/api/v1/admin/organizations/", EVERYONE),
    ("GET", "/api/v1/admin/organizations/3/", EVERYONE),
    ("PATCH", "/api/v1/admin/organizations/3/", {OWNER}),
    ("DELETE", "/api/v1/admin/organizations/3/", set()),
    ("POST", "/api/v1/admin/organizations/", set()),
    ("GET", "/api/v1/admin/branches/", {OWNER, MANAGER, STAFF}),
    ("POST", "/api/v1/admin/branches/", {OWNER}),
    ("GET", "/api/v1/admin/theme/", {OWNER, MANAGER, STAFF}),
    ("PATCH", "/api/v1/admin/theme/2/", {OWNER, MANAGER}),
    ("GET", "/api/v1/admin/menus/", {OWNER, MANAGER, STAFF}),
    ("POST", "/api/v1/admin/menus/", {OWNER, MANAGER}),
    ("PATCH", "/api/v1/admin/menus/1/", {OWNER, MANAGER}),
    ("DELETE", "/api/v1/admin/menus/1/", {OWNER}),
    ("GET", "/api/v1/admin/categories/", {OWNER, MANAGER, STAFF}),
    ("POST", "/api/v1/admin/categories/reorder", {OWNER, MANAGER}),
    ("DELETE", "/api/v1/admin/categories/1/", {OWNER}),
    ("GET", "/api/v1/admin/menu-items/", {OWNER, MANAGER, STAFF}),
    ("PATCH", "/api/v1/admin/menu-items/1/", {OWNER, MANAGER}),
    ("DELETE", "/api/v1/admin/menu-items/1/", {OWNER}),
    ("POST", "/api/v1/admin/menu-items/1/availability", {OWNER, MANAGER, STAFF}),
    ("GET", "/api/v1/admin/summary", {OWNER, MANAGER}),
    ("GET", "/api/v1/admin/qr-codes/", {OWNER, MANAGER, STAFF}),
    ("GET", "/api/v1/admin/qr-codes/1/download", {OWNER, MANAGER, STAFF}),
    ("POST", "/api/v1/admin/qr-codes/", {OWNER, MANAGER}),
    ("DELETE", "/api/v1/admin/qr-codes/1/", {OWNER}),
    ("POST", "/api/v1/admin/media/upload/", {OWNER, MANAGER}),
    ("GET", "/api/v1/admin/analytics/overview", {OWNER, MANAGER}),
    ("POST", "/api/v1/admin/pdf-import/upload/", {OWNER, MANAGER}),
    ("POST", "/api/v1/admin/translate/", {OWNER, MANAGER}),
    ("GET", "/api/v1/admin/orders/", {OWNER, MANAGER, STAFF}),
    ("GET", "/api/v1/admin/orders/9", {OWNER, MANAGER, STAFF}),
    ("POST", "/api/v1/admin/orders/9/status", EVERYONE),
    ("GET", "/api/v1/admin/kitchen/tickets", EVERYONE),
    ("GET", "/api/v1/admin/kitchen/board", EVERYONE),
    ("GET", "/api/v1/admin/billing/plan/", {OWNER}),
    ("PUT", "/api/v1/admin/billing/plan/", {OWNER}),
    ("GET", "/api/v1/account/admin/customers", {OWNER, MANAGER}),
    ("POST", "/api/v1/account/admin/customers/4/loyalty-adjust", {OWNER, MANAGER}),
    ("GET", "/api/v1/payment/admin/payment/settings/", {OWNER}),
    ("GET", "/api/v1/onboarding/trial-status", EVERYONE),
    ("POST", "/api/v1/onboarding/complete", {OWNER, MANAGER}),
]


@pytest.mark.parametrize(
    ("method", "path", "allowed"),
    MATRIX,
    ids=[f"{method} {path}" for method, path, _ in MATRIX],
)
def test_policy_table_matches_the_approved_matrix(method, path, allowed):
    for role in ROLES:
        assert (role in roles.allowed_roles(method, path)) == (role in allowed), (
            role,
            method,
            path,
        )


def test_unclassified_guarded_path_falls_back_to_owner_and_manager():
    assert roles.match_rule("GET", "/api/v1/admin/brand-new-thing/") is None
    assert roles.allowed_roles("GET", "/api/v1/admin/brand-new-thing/") == {OWNER, MANAGER}


def test_agency_admin_membership_acts_as_owner():
    assert roles.membership_role_for_policy("agency_admin") == OWNER
    assert roles.membership_role_for_policy("staff") == STAFF


# ---------------------------------------------------------------------------
# Completeness: every guarded route must be classified explicitly
# ---------------------------------------------------------------------------


def _walk(patterns, prefix=""):
    for pattern in patterns:
        piece = str(pattern.pattern)
        if isinstance(pattern, URLResolver):
            yield from _walk(pattern.url_patterns, prefix + piece)
        elif isinstance(pattern, URLPattern):
            yield prefix + piece


def _guarded_sample_paths() -> list[str]:
    paths = set()
    for route in _walk(get_resolver().url_patterns):
        path = simplify_regex(route)
        if "<format>" in path:  # DRF ".json"-style suffix variants
            continue
        path = re.sub(r"<(?:\w+:)?\w+>", "1", path)  # fill path parameters
        if roles.is_guarded(path):
            paths.add(path)
    return sorted(paths)


def test_url_walker_finds_the_admin_api():
    assert len(_guarded_sample_paths()) > 40


def test_every_guarded_route_is_classified_in_the_rule_table():
    unclassified = [
        f"{method} {path}"
        for path in _guarded_sample_paths()
        for method in ("GET", "POST", "PATCH", "DELETE")
        if roles.match_rule(method, path) is None
    ]
    assert not unclassified, (
        "These guarded routes are only covered by the owner+manager fallback. "
        "Classify them in apps/accounts/roles.py RULES:\n  " + "\n  ".join(unclassified)
    )


# ---------------------------------------------------------------------------
# The middleware over HTTP (real session login, no force_authenticate)
# ---------------------------------------------------------------------------


def _member(django_user_model, org, role, email):
    user = django_user_model.objects.create_user(email=email, password="x", role="staff")
    Membership.objects.create(user=user, organization=org, role=role)
    return user


@pytest.fixture
def members(django_user_model, org_a):
    """One signed-in-able user per tenant role, all in org A."""
    users = {OWNER: org_a.memberships.get(role=MembershipRole.OWNER).user}
    for role in (MANAGER, STAFF, KITCHEN):
        users[role] = _member(django_user_model, org_a, role, f"{role}@a.example")
    return users


def _gate_denied(response) -> bool:
    return (
        response.status_code == 403
        and response.json().get("error", {}).get("code") == "auth.role_forbidden"
    )


HTTP_SAMPLES = [
    ("GET", "/api/v1/admin/menus/"),
    ("DELETE", "/api/v1/admin/menus/999/"),
    ("PATCH", "/api/v1/admin/organizations/999/"),
    ("GET", "/api/v1/admin/kitchen/tickets"),
    ("POST", "/api/v1/admin/orders/999/status"),
    ("GET", "/api/v1/admin/team/"),
    ("GET", "/api/v1/admin/billing/plan/"),
]


@pytest.mark.parametrize("role", ROLES)
@pytest.mark.parametrize(("method", "path"), HTTP_SAMPLES)
def test_gate_enforces_the_table_over_http(api_client, members, role, method, path):
    api_client.force_login(members[role])
    response = api_client.generic(method, path, data="", content_type="application/json")
    should_pass = role in roles.allowed_roles(method, path)
    assert _gate_denied(response) is (not should_pass), (role, method, path, response.status_code)


def test_denial_body_is_a_machine_readable_error(api_client, members):
    api_client.force_login(members[KITCHEN])
    response = api_client.get("/api/v1/admin/menus/")
    assert response.status_code == 403
    assert response.json() == {
        "error": {"code": "auth.role_forbidden", "message": "Bu işlem için yetkiniz yok."}
    }


def test_platform_admin_bypasses_the_gate(api_client, admin_user):
    api_client.force_login(admin_user)
    response = api_client.get("/api/v1/admin/team/")
    assert not _gate_denied(response)


def test_anonymous_requests_fall_through_to_the_views_own_answer(api_client):
    response = api_client.get("/api/v1/admin/menus/")
    assert response.status_code in (401, 403)
    assert not _gate_denied(response)


def test_paths_outside_the_guarded_prefixes_are_untouched(api_client, members):
    api_client.force_login(members[KITCHEN])
    assert api_client.get("/api/v1/me").status_code == 200
    assert api_client.get("/health").status_code == 200


def test_user_without_membership_is_refused(api_client, django_user_model):
    user = django_user_model.objects.create_user(email="lonely@example.com", password="x")
    api_client.force_login(user)
    response = api_client.get("/api/v1/admin/menus/")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "auth.no_membership"


def test_deactivated_membership_loses_access_immediately(api_client, members):
    api_client.force_login(members[STAFF])
    assert api_client.get("/api/v1/admin/menus/").status_code == 200
    Membership.objects.filter(user=members[STAFF]).update(is_active=False)
    response = api_client.get("/api/v1/admin/menus/")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "auth.no_membership"


def test_suspended_organization_blocks_its_members(api_client, members, org_a):
    api_client.force_login(members[OWNER])
    org_a.is_active = False
    org_a.save(update_fields=["is_active"])
    response = api_client.get("/api/v1/admin/menus/")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "tenant.suspended"


def test_agency_admin_membership_passes_owner_only_endpoints(api_client, django_user_model, org_a):
    user = _member(django_user_model, org_a, MembershipRole.AGENCY_ADMIN, "agency@a.example")
    api_client.force_login(user)
    assert not _gate_denied(api_client.get("/api/v1/admin/team/"))


def test_second_active_membership_is_used_when_the_first_is_deactivated(
    api_client, django_user_model, org_a, org_b
):
    user = django_user_model.objects.create_user(email="multi@example.com", password="x")
    Membership.objects.create(user=user, organization=org_a, role=MembershipRole.OWNER, is_active=False)
    Membership.objects.create(user=user, organization=org_b, role=MembershipRole.STAFF)
    api_client.force_login(user)
    # Active role is STAFF (org B): menus readable, owner-only team closed.
    assert not _gate_denied(api_client.get("/api/v1/admin/menus/"))
    assert _gate_denied(api_client.get("/api/v1/admin/team/"))
