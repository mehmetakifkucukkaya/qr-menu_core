"""Analytics models — Sprint 5A.

``MenuViewEvent`` is the only model the public page uses today. It's the
"client side telemetry bus" — any meaningful interaction on the public
menu page calls ``POST /api/v1/public/events`` and we record one row.
The admin overview endpoint aggregates these into the dashboard cards.

Storage decisions:

* **Indexed columns** are ``(organization, -created_at)`` and
  ``(organization, event_type, -created_at)``. Both queries are the
  hot path — overview filtering and per-event-type counts.
* **Hashed IP/UA only** (D-016, D-017). We compute ``sha256(salt + value)``
  in ``apps.analytics.hashing.hash_value`` and truncate to 64 chars.
  Plain IP and User-Agent strings never touch the DB.
* **``path`` length capped at 500** — keeps the row width predictable and
  prevents a single event from blowing up the table (e.g. a hostile
  client sending enormous ``Referer`` URLs which we also cap via
  URLField max_length=2048 by default; we still truncate ``path``).
* **JSONField-free.** Keeping the row flat makes ``COUNT(*)`` and
  ``GROUP BY event_type`` trivial — no JSONB extraction needed.
"""

from __future__ import annotations

from django.db import models

from apps.branches.models import Branch
from apps.core.models import TimeStampedModel
from apps.menu.models import Menu
from apps.organizations.models import Organization


# Late import to avoid circular dependency between qr and analytics.
# (QRCode references MenuViewEvent; QRCode is referenced here via FK.)
def _get_qr_code_model():  # pragma: no cover - simple FK resolution
    from apps.qr.models import QRCode

    return QRCode


class MenuViewEvent(TimeStampedModel):
    """A single public-menu interaction event."""

    # ---- event type -----------------------------------------------------
    EVENT_CHOICES = [
        ("menu_view", "Menu view"),
        ("language_change", "Language change"),
        ("whatsapp_click", "WhatsApp click"),
        ("phone_click", "Phone click"),
        ("qr_open", "QR scan"),
    ]

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="view_events",
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.SET_NULL,
        related_name="view_events",
        null=True,
        blank=True,
    )
    menu = models.ForeignKey(
        Menu,
        on_delete=models.SET_NULL,
        related_name="view_events",
        null=True,
        blank=True,
    )
    # QRCode lives in apps.qr — referenced lazily so the FK avoids
    # requiring both apps' migrations to exist before either loads.
    qr_code = models.ForeignKey(
        "qr.QRCode",
        on_delete=models.SET_NULL,
        related_name="view_events",
        null=True,
        blank=True,
    )

    event_type = models.CharField(max_length=30, choices=EVENT_CHOICES)
    locale = models.CharField(
        max_length=5,
        default="tr",
        help_text="ISO code (tr/en). Unknown values pass through; validation lives in the API.",
    )
    path = models.CharField(max_length=500, blank=True, default="")
    user_agent_hash = models.CharField(max_length=64)
    ip_hash = models.CharField(max_length=64)
    referrer = models.URLField(max_length=2048, null=True, blank=True)

    # created_at is inherited from TimeStampedModel (auto_now_add).

    class Meta:
        verbose_name = "Menü Görüntülenme Olayı"
        verbose_name_plural = "Menü Görüntülenme Olayları"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["organization", "-created_at"]),
            models.Index(fields=["organization", "event_type", "-created_at"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"<MenuViewEvent {self.event_type} org={self.organization_id} @ {self.created_at:%Y-%m-%d %H:%M}>"
