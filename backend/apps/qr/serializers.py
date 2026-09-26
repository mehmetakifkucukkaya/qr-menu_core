"""Serializers for QR codes — Sprint 5A.

Mirrors the menu app's serializer pattern:

* Nested ``organization`` (id + slug + name) for read; ``organization_id``
  primary-key for write.
* Nested ``menu`` / ``branch`` summaries for read; their ``*_id`` FKs
  for write, with querysets scoped to the request user's accessible set.
* ``target_url`` is read-only — it's recomputed on save from the FK chain.
* ``scan_count`` is read-only — incremented by the analytics pipeline,
  not via admin writes.
"""

from __future__ import annotations

from rest_framework import serializers

from apps.branches.models import Branch
from apps.branches.serializers import BranchSummarySerializer
from apps.menu.models import Menu
from apps.organizations.models import Organization

from .models import QRCode


class MenuSummaryForQrSerializer(serializers.ModelSerializer):
    """Small read-only nested menu summary."""

    class Meta:
        model = Menu
        fields = ("id", "name", "slug")


class QRCodeSerializer(serializers.ModelSerializer):
    organization = serializers.SerializerMethodField()
    organization_id = serializers.PrimaryKeyRelatedField(
        source="organization",
        write_only=True,
        queryset=Organization.objects.none(),
    )
    branch = BranchSummarySerializer(read_only=True, allow_null=True)
    branch_id = serializers.PrimaryKeyRelatedField(
        source="branch",
        queryset=Branch.objects.none(),
        required=False,
        allow_null=True,
    )
    menu = MenuSummaryForQrSerializer(read_only=True)
    menu_id = serializers.PrimaryKeyRelatedField(
        source="menu",
        queryset=Menu.objects.none(),
        write_only=True,
    )

    class Meta:
        model = QRCode
        fields = (
            "id",
            "organization",
            "organization_id",
            "branch",
            "branch_id",
            "menu",
            "menu_id",
            "label",
            "target_url",
            "table_number",
            "scan_count",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "target_url",
            "scan_count",
            "organization",
            "branch",
            "menu",
            "created_at",
            "updated_at",
        )

    def get_organization(self, obj):
        return {
            "id": obj.organization_id,
            "name": obj.organization.name,
            "slug": obj.organization.slug,
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return
        user = request.user
        if getattr(user, "is_platform_admin", False):
            org_qs = Organization.objects.all()
            branch_qs = Branch.objects.all()
            menu_qs = Menu.objects.all()
        else:
            org_qs = Organization.objects.filter(memberships__user=user).distinct()
            branch_qs = Branch.objects.filter(
                organization__memberships__user=user
            ).distinct()
            menu_qs = Menu.objects.for_user(user)
        self.fields["organization_id"].queryset = org_qs
        self.fields["branch_id"].queryset = branch_qs
        self.fields["menu_id"].queryset = menu_qs

    def validate(self, attrs):
        """Enforce FK consistency: menu/branch must belong to organization."""
        org = attrs.get("organization") or getattr(self.instance, "organization", None)
        if org is None:
            raise serializers.ValidationError(
                {"organization_id": "organization zorunludur."}
            )
        menu = attrs.get("menu") or getattr(self.instance, "menu", None)
        branch = attrs.get("branch") if "branch" in attrs else getattr(self.instance, "branch", None)
        if menu is not None and menu.organization_id != org.id:
            raise serializers.ValidationError(
                {"menu_id": "Seçilen menü bu işletmeye ait değil."}
            )
        if branch is not None and branch.organization_id != org.id:
            raise serializers.ValidationError(
                {"branch_id": "Seçilen şube bu işletmeye ait değil."}
            )
        return attrs
