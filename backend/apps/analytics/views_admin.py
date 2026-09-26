"""Admin analytics overview endpoint — Sprint 5A.

GET /api/v1/admin/analytics/overview?days=30

Returns the dashboard payload::

    {
      "data": {
        "today_views": int,
        "week_views": int,
        "month_views": int,
        "event_counts": { menu_view: int, language_change: int, ... },
        "language_distribution": { tr: float, en: float },
        "top_qr_codes": [{ id, label, scan_count }],
        "daily_views": [{ date: "YYYY-MM-DD", count: int }]
      }
    }

Design notes:

* **DB-side aggregation** — ``aggregate()`` and ``values().annotate()``
  push everything to Postgres (or SQLite in tests). Sprint 5 doesn't
  need materialized views; total row count per tenant is well below
  Postgres' "lots of GROUP BY" comfort zone.
* **Day-windowed counts** (``week_views``, ``month_views``) use a
  ``created_at__gte`` filter — no per-day bucketing involved.
* **Daily views** is the only place that does per-day bucketing; we use
  Django's ``TruncDate`` for cross-DB portability (Postgres + SQLite).
* **Language distribution** is a ratio (0..1) per locale so the
  frontend can render percentages without re-computing.
* **top_qr_codes** pulls from the existing ``QRCode.scan_count`` —
  analytics events increment the counter via the public endpoint
  pipeline. For Sprint 5A we ship the counter as a field on QRCode so
  the list endpoint already shows it; D-017's V2 plan is to derive it
  from ``MenuViewEvent`` aggregates instead.
"""

from __future__ import annotations

from datetime import timedelta

from django.db.models import Count, F, FloatField
from django.db.models.functions import Cast, TruncDate
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Membership
from apps.accounts.permissions import IsOrganizationMember

from apps.qr.models import QRCode

from .models import MenuViewEvent


DEFAULT_WINDOW_DAYS = 30
MAX_WINDOW_DAYS = 90
TOP_QR_LIMIT = 5
TODAY_EVENT_TYPES = [choice for choice, _ in MenuViewEvent.EVENT_CHOICES]


def _resolve_organization(user):
    membership = Membership.objects.filter(
        user=user, organization__is_active=True
    ).first()
    return membership.organization if membership else None


class AnalyticsOverviewView(APIView):
    """GET /api/v1/admin/analytics/overview — dashboard payload."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request) -> Response:
        organization = _resolve_organization(request.user)
        if organization is None:
            return Response(
                {
                    "data": {
                        "today_views": 0,
                        "week_views": 0,
                        "month_views": 0,
                        "event_counts": {t: 0 for t in TODAY_EVENT_TYPES},
                        "language_distribution": {},
                        "top_qr_codes": [],
                        "daily_views": [],
                    },
                    "meta": {
                        "request_id": request.META.get("HTTP_X_REQUEST_ID", "")
                    },
                },
                status=status.HTTP_200_OK,
            )

        # ---- Window --------------------------------------------------------
        try:
            days = int(request.query_params.get("days", DEFAULT_WINDOW_DAYS))
        except (TypeError, ValueError):
            days = DEFAULT_WINDOW_DAYS
        days = max(1, min(days, MAX_WINDOW_DAYS))
        now = timezone.now()
        start_window = now - timedelta(days=days)

        base_qs = MenuViewEvent.objects.filter(organization=organization)

        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=7)
        month_start = today_start - timedelta(days=30)

        # ---- Counts -------------------------------------------------------
        today_views = base_qs.filter(created_at__gte=today_start).count()
        week_views = base_qs.filter(created_at__gte=week_start).count()
        month_views = base_qs.filter(created_at__gte=month_start).count()

        event_counts = {
            t: base_qs.filter(event_type=t).count()
            for t in TODAY_EVENT_TYPES
        }

        # ---- Language distribution (ratio within the chosen window) ------
        # Aggregate per-locale counts, then normalize to ratios.
        per_locale = (
            base_qs.filter(created_at__gte=start_window)
            .values("locale")
            .annotate(c=Count("id"))
        )
        locale_total = sum(row["c"] for row in per_locale) or 0
        if locale_total > 0:
            language_distribution = {
                row["locale"]: round(row["c"] / locale_total, 4)
                for row in per_locale
            }
        else:
            language_distribution = {}

        # ---- Top QR codes (QRCode.scan_count within tenant, desc) -------
        top_qr_codes = list(
            QRCode.objects.filter(organization=organization)
            .order_by("-scan_count", "-created_at")
            .values("id", "label", "scan_count")[:TOP_QR_LIMIT]
        )

        # ---- Daily views (per-day totals for the chosen window) ---------
        # TruncDate works on both Postgres and SQLite (test) so we don't
        # need to switch on connection.vendor.
        daily_rows = (
            base_qs.filter(created_at__gte=start_window)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(count=Count("id"))
            .order_by("day")
        )
        daily_views = [
            {"date": row["day"].isoformat(), "count": row["count"]}
            for row in daily_rows
            if row["day"] is not None
        ]

        payload = {
            "today_views": today_views,
            "week_views": week_views,
            "month_views": month_views,
            "event_counts": event_counts,
            "language_distribution": language_distribution,
            "top_qr_codes": top_qr_codes,
            "daily_views": daily_views,
        }
        return Response(
            {
                "data": payload,
                "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")},
            },
            status=status.HTTP_200_OK,
        )
