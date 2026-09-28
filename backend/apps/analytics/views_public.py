"""Public events endpoint — Sprint 5A.

POST /api/v1/public/events
    Body: {
      "event_type": "menu_view" | "language_change" | ...,
      "locale": "tr",
      "path": "/m/modern-cafe",
      "organization_slug": "modern-cafe",
      "menu_id": 12,          # optional
      "branch_id": 3,         # optional
      "qr_id": 17             # optional
    }

Response: 204 No Content.

Design notes:

* **Anonymous.** No auth required — public visitors fire these events.
  Tenant is identified via ``organization_slug`` from the payload.
* **Throttled.** DRF ``AnonRateThrottle`` at 30/min per IP (Sprint 5A
  choice; overall anon throttle is 60/min on the global DRF config).
* **Silent on unknown org.** A hostile POST with an unknown slug gets
  204 too — we don't echo "not found" on a public endpoint (avoids
  enumerating business slugs).
* **Hashed identity.** IP and User-Agent are stored only as salted
  SHA-256 (D-016 / D-017). Plain values never reach the DB.
* **Truncate ``path``** to 500 chars so a hostile client can't blow up
  row width.

Sprint A (Faz 1.3) — ``qr_open`` side-effects:

* ``QRCode.scan_count`` is atomically incremented via ``F("scan_count") +
  1`` so concurrent requests don't lose updates under the row lock.
* Cross-tenant guard — if the ``qr_id`` belongs to a different
  organization than the one in the URL slug, the event is silently
  dropped (same posture as a bad slug). Prevents a malicious actor
  from inflating another tenant's QR counters by replaying their IDs.
"""

from __future__ import annotations

from django.db import transaction
from django.db.models import F
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.organizations.models import Organization
from apps.qr.models import QRCode

from .hashing import client_ip, hash_value, user_agent
from .models import MenuViewEvent


PATH_MAX = 500


class PublicEventsThrottle(AnonRateThrottle):
    """30/min throttle for public events. Per-IP key."""

    scope = "public_events"


class PublicEventsView(APIView):
    """POST /api/v1/public/events — record a single menu-view event."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [PublicEventsThrottle]

    def post(self, request: Request) -> Response:
        payload = request.data or {}
        event_type = payload.get("event_type")
        valid_types = {choice for choice, _ in MenuViewEvent.EVENT_CHOICES}
        if event_type not in valid_types:
            # 400 here is fine — the client asked for something we don't
            # know about. Drop unknown events silently for forward-compat
            # would be a choice, but we want loud failures in dev.
            return Response(
                {
                    "error": {
                        "code": "events.invalid_type",
                        "message": f"event_type şunlardan biri olmalı: {sorted(valid_types)}.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        org_slug = payload.get("organization_slug") or ""
        organization = (
            Organization.objects.filter(slug=org_slug, is_active=True).first()
            if org_slug
            else None
        )
        if organization is None:
            # Silent ignore — don't leak business-slug enumeration.
            return Response(status=status.HTTP_204_NO_CONTENT)

        path = (payload.get("path") or "/")[:PATH_MAX]
        locale = (payload.get("locale") or organization.default_locale or "tr")[:5]

        # Sprint A — cross-tenant guard + atomic counter for qr_open events.
        # Done before MenuViewEvent.create() so a hostile payload that pairs
        # the real org slug with a foreign QR id never increments that QR's
        # counter (and never records an event that an honest client didn't
        # cause). When the guard rejects the qr_id we null it out so the
        # MenuViewEvent row doesn't carry an FK to a foreign tenant's QR
        # either (defence in depth — admin analytics filters by qr_code_id).
        qr_id = payload.get("qr_id") or None
        if event_type == "qr_open" and qr_id is not None:
            if not self._increment_qr_counter(organization, qr_id):
                # Cross-tenant or non-existent qr → drop the qr_id silently.
                qr_id = None

        # Build the event row. We do this in a single create() so the
        # DB row is consistent even if an attacker floods the endpoint.
        with transaction.atomic():
            MenuViewEvent.objects.create(
                organization=organization,
                branch_id=payload.get("branch_id") or None,
                menu_id=payload.get("menu_id") or None,
                qr_code_id=qr_id,
                event_type=event_type,
                locale=locale,
                path=path,
                user_agent_hash=hash_value(user_agent(request)),
                ip_hash=hash_value(client_ip(request)),
                referrer=request.META.get("HTTP_REFERER") or None,
            )

        # 204 — no envelope, no body.
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _increment_qr_counter(organization: Organization, qr_id) -> bool:
        """Atomically bump ``QRCode.scan_count`` for a tenant-matching QR.

        Sprint A (Faz 1.3):

        * Cross-tenant guard — silently ignore ``qr_id`` that belongs to a
          different organization. Same posture as an unknown business
          slug: 204 + no side effect, so the public endpoint can't be
          used as a counter-amplification probe against another tenant.
        * Atomic increment via ``F("scan_count") + 1`` so concurrent
          requests don't lose updates (we don't want to load + save, which
          is racy under SQLite + Postgres alike).

        Returns True when the counter was bumped, False when the qr_id
        was rejected (unknown or cross-tenant). The caller uses False to
        decide whether to null out ``qr_code_id`` on the MenuViewEvent.
        """
        # QR codes live under an organization directly; the optional
        # branch is just a sub-scope, not a tenant boundary. We resolve
        # the QR without .select_related() to keep the query minimal —
        # the cross-tenant check only needs the FK.
        try:
            qr = QRCode.objects.only("id", "organization_id").get(pk=qr_id)
        except (QRCode.DoesNotExist, ValueError, TypeError):
            return False
        if qr.organization_id != organization.id:
            return False  # cross-tenant — silent ignore
        # F() expression → DB-side increment under a single UPDATE row lock.
        QRCode.objects.filter(pk=qr.pk).update(scan_count=F("scan_count") + 1)
        return True