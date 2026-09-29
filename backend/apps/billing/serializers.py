"""Billing serializers — Sprint B1 (D-026).

Five serializers split by endpoint responsibility:

* :class:`PlanSettingsSerializer` — read + write for
  ``/admin/billing/plan/``. The 8 boolean feature flags are
  individually writable.
* :class:`UsageSnapshotSerializer` — read-only for
  ``/admin/billing/usage/``.
* :class:`LimitMatrixSerializer` + ``LimitTierSerializer` — read-only
  for ``/admin/billing/limits/``.
* :class:`UpgradePreviewRequestSerializer` — body validation for
  ``/admin/billing/limits/preview-upgrade/``.

The response shapes are intentionally simple (flat dicts, not wrapped
in ``{data, meta}``) because the admin UI consumes these via the
``/api/v1/admin/billing/*`` prefix — same envelope-free choice
``PaymentSettlementAdminView`` uses (Sprint 11A).
"""

from __future__ import annotations

from rest_framework import serializers

from .constants import FEATURE_FIELDS, PLAN_CHOICES
from .models import PlanSettings


class PlanSettingsSerializer(serializers.ModelSerializer):
    """PlanSettings read + update.

    The 8 boolean feature flags are optional on write — omitting one
    keeps the existing value. ``active_plan`` and ``billing_notes``
    are also optional on PATCH.
    """

    features = serializers.SerializerMethodField()

    class Meta:
        model = PlanSettings
        fields = [
            "id",
            "organization",
            "active_plan",
            "features",
            "billing_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "organization", "created_at", "updated_at"]

    def get_features(self, obj: PlanSettings) -> dict[str, bool]:
        return obj.effective_features()

    def validate_active_plan(self, value: str) -> str:
        valid = {choice[0] for choice in PLAN_CHOICES}
        if value not in valid:
            raise serializers.ValidationError(
                f"Geçersiz plan '{value}'. Geçerli: {sorted(valid)}."
            )
        return value


class PlanSettingsUpdateSerializer(serializers.Serializer):
    """Body for PUT /admin/billing/plan/.

    All fields optional — PATCH semantics. ``features`` keys must be in
    :data:`FEATURE_FIELDS` (validated at the service layer; we only
    ensure the dict is well-formed here).
    """

    active_plan = serializers.CharField(required=False, allow_blank=False)
    features = serializers.DictField(
        child=serializers.BooleanField(),
        required=False,
    )
    billing_notes = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    def validate_active_plan(self, value: str) -> str:
        valid = {choice[0] for choice in PLAN_CHOICES}
        if value not in valid:
            raise serializers.ValidationError(
                f"Geçersiz plan '{value}'. Geçerli: {sorted(valid)}."
            )
        return value

    def validate_features(self, value: dict) -> dict:
        # We don't reject unknown keys here — the service layer raises a
        # clearer ValueError. Keeping the serializer permissive lets the
        # admin UI render a generic error toast instead of a 400.
        return value


class UsageMetricSerializer(serializers.Serializer):
    used = serializers.IntegerField()
    limit = serializers.IntegerField(allow_null=True)
    pct = serializers.FloatField(allow_null=True)


class UsageSnapshotSerializer(serializers.Serializer):
    period_year = serializers.IntegerField()
    period_month = serializers.IntegerField()
    metrics = serializers.DictField(child=UsageMetricSerializer())


class LimitTierSerializer(serializers.Serializer):
    id = serializers.CharField()
    label = serializers.CharField()
    limits = serializers.DictField(child=serializers.IntegerField(allow_null=True))
    features = serializers.DictField(child=serializers.BooleanField())
    is_current = serializers.BooleanField()


class LimitMatrixSerializer(serializers.Serializer):
    current_plan = serializers.CharField()
    tiers = LimitTierSerializer(many=True)


class UpgradePreviewRequestSerializer(serializers.Serializer):
    target_plan = serializers.CharField()

    def validate_target_plan(self, value: str) -> str:
        valid = {choice[0] for choice in PLAN_CHOICES}
        if value not in valid:
            raise serializers.ValidationError(
                f"Geçersiz plan '{value}'. Geçerli: {sorted(valid)}."
            )
        return value