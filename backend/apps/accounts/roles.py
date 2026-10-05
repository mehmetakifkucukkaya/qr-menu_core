"""Role policy for the tenant admin API (one table, one gate).

Every request under a *guarded* prefix (the admin, onboarding and payment-admin
APIs) is checked against :data:`RULES` by
:class:`apps.accounts.middleware.RoleGateMiddleware`. The table is the single
source of truth for "which membership role may call what":

* the first rule whose pattern matches the path **and** whose method class
  matches the HTTP method decides;
* a guarded path that no rule matches falls back to ``owner`` + ``manager``
  (:data:`DEFAULT_ROLES`) — a brand-new endpoint is closed to staff and
  kitchen until somebody classifies it here;
* platform admins (``User.is_platform_admin``) bypass the gate entirely;
* ``tests/test_role_gate.py`` walks the URLconf and fails when a guarded route
  is only covered by the fallback, so "forgot to classify it" is a red build.

The matrix mirrors SPEC_PILOT_READINESS §3.1.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Final

OWNER: Final = "owner"
MANAGER: Final = "manager"
STAFF: Final = "staff"
KITCHEN: Final = "kitchen"

ONLY_OWNER: Final = frozenset({OWNER})
OWNER_MANAGER: Final = frozenset({OWNER, MANAGER})
OWNER_MANAGER_STAFF: Final = frozenset({OWNER, MANAGER, STAFF})
EVERYONE: Final = frozenset({OWNER, MANAGER, STAFF, KITCHEN})
NOBODY: Final = frozenset()  # platform admins only (they bypass the gate)

DEFAULT_ROLES: Final = OWNER_MANAGER

# Request path prefixes the gate looks at. Everything else (the public menu,
# auth, /me, the customer account API, webhooks, Django admin) is untouched.
GUARDED_PREFIXES: Final = (
    "/api/v1/admin/",
    "/api/v1/account/admin/",
    "/api/v1/payment/admin/",
    "/api/v1/onboarding/",
    "/api/v1/qr-codes/",
)

READ: Final = frozenset({"GET", "HEAD", "OPTIONS"})
WRITE: Final = frozenset({"POST", "PUT", "PATCH"})
DELETE: Final = frozenset({"DELETE"})
ANY: Final = READ | WRITE | DELETE


def membership_role_for_policy(role: str) -> str:
    """``agency_admin`` memberships (agency staff inside a tenant) act as owner."""
    return OWNER if role == "agency_admin" else role


@dataclass(frozen=True)
class Rule:
    pattern: re.Pattern[str]
    methods: frozenset[str]
    roles: frozenset[str]

    def matches(self, method: str, path: str) -> bool:
        return method.upper() in self.methods and self.pattern.search(path) is not None


def _rule(pattern: str, methods: frozenset[str], roles: frozenset[str]) -> Rule:
    return Rule(re.compile(pattern), methods, roles)


# Order matters: specific rules first.
RULES: Final[tuple[Rule, ...]] = (
    # --- Team: the owner manages who has access ---------------------------
    _rule(r"^/api/v1/admin/team/", ANY, ONLY_OWNER),
    # --- Business profile: everyone reads (sidebar brand), owner writes ---
    _rule(r"^/api/v1/admin/organizations/", READ, EVERYONE),
    _rule(r"^/api/v1/admin/organizations/", frozenset({"PUT", "PATCH"}), ONLY_OWNER),
    _rule(r"^/api/v1/admin/organizations/", frozenset({"POST", "DELETE"}), NOBODY),
    # --- Branches ---------------------------------------------------------
    _rule(r"^/api/v1/admin/branches/", READ, OWNER_MANAGER_STAFF),
    _rule(r"^/api/v1/admin/branches/", WRITE | DELETE, ONLY_OWNER),
    # --- Theme ------------------------------------------------------------
    _rule(r"^/api/v1/admin/theme/", READ, OWNER_MANAGER_STAFF),
    _rule(r"^/api/v1/admin/theme/", WRITE | DELETE, OWNER_MANAGER),
    # --- Menu catalogue ---------------------------------------------------
    _rule(r"^/api/v1/admin/menu-items/\d+/availability$", frozenset({"POST"}), OWNER_MANAGER_STAFF),
    _rule(
        r"^/api/v1/admin/(menus|categories|menu-items|allergens|dietary-tags)(/|$)",
        READ,
        OWNER_MANAGER_STAFF,
    ),
    _rule(
        r"^/api/v1/admin/(menus|categories|menu-items|allergens|dietary-tags)(/|$)",
        WRITE,
        OWNER_MANAGER,
    ),
    _rule(
        r"^/api/v1/admin/(menus|categories|menu-items|allergens|dietary-tags)(/|$)",
        DELETE,
        ONLY_OWNER,
    ),
    # --- Dashboard summary ------------------------------------------------
    _rule(r"^/api/v1/admin/summary$", ANY, OWNER_MANAGER),
    # --- DRF API-root views (router index pages) ---------------------------
    _rule(r"^/api/v1/admin/[^/]*$", ANY, OWNER_MANAGER),
    # --- QR codes ---------------------------------------------------------
    _rule(r"^/api/v1/admin/qr-codes(/|$)", READ, OWNER_MANAGER_STAFF),
    _rule(r"^/api/v1/admin/qr-codes(/|$)", WRITE, OWNER_MANAGER),
    _rule(r"^/api/v1/admin/qr-codes(/|$)", DELETE, ONLY_OWNER),
    # --- Media library, analytics, AI tools -------------------------------
    _rule(r"^/api/v1/admin/media/", ANY, OWNER_MANAGER),
    _rule(r"^/api/v1/admin/analytics/", ANY, OWNER_MANAGER),
    _rule(r"^/api/v1/admin/pdf-import/", ANY, OWNER_MANAGER),
    _rule(r"^/api/v1/admin/(translate|describe)/", ANY, OWNER_MANAGER),
    # --- Orders and the kitchen -------------------------------------------
    _rule(r"^/api/v1/admin/orders/\d+/status$", frozenset({"POST"}), EVERYONE),
    _rule(r"^/api/v1/admin/orders(/|$)", READ, OWNER_MANAGER_STAFF),
    _rule(r"^/api/v1/admin/orders(/|$)", WRITE | DELETE, OWNER_MANAGER),
    _rule(r"^/api/v1/admin/kitchen/", READ, EVERYONE),
    _rule(r"^/api/v1/admin/kitchen/", WRITE | DELETE, OWNER_MANAGER),
    # --- Plan page (owner only; platform admins edit plans) ---------------
    _rule(r"^/api/v1/admin/billing/", ANY, ONLY_OWNER),
    # --- Customers and loyalty --------------------------------------------
    _rule(r"^/api/v1/account/admin/", ANY, OWNER_MANAGER),
    # --- Online payment settings (money) ----------------------------------
    _rule(r"^/api/v1/payment/admin/", ANY, ONLY_OWNER),
    # --- Onboarding helpers ------------------------------------------------
    _rule(r"^/api/v1/onboarding/trial-status$", READ, EVERYONE),
    _rule(r"^/api/v1/(onboarding|qr-codes)/", ANY, OWNER_MANAGER),
)


def is_guarded(path: str) -> bool:
    return path.startswith(GUARDED_PREFIXES)


def match_rule(method: str, path: str) -> Rule | None:
    """The first rule that decides ``method path``; ``None`` = fallback."""
    for rule in RULES:
        if rule.matches(method, path):
            return rule
    return None


def allowed_roles(method: str, path: str) -> frozenset[str]:
    rule = match_rule(method, path)
    return rule.roles if rule is not None else DEFAULT_ROLES
