"""Accounts models.

Custom User replaces Django's default username-based user with an
email-based one. Membership links a user to one or more organizations
with a per-org role.
"""

from __future__ import annotations

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserRole(models.TextChoices):
    """Global user role.

    - ADMIN: platform superuser (cross-org). Maps to ``is_staff=True``
      so they can use Django admin too.
    - AGENCY_ADMIN: agency staff who can act across multiple orgs.
    - OWNER / MANAGER / STAFF: default per-user role when they belong
      to a single org via Membership (Membership.role is authoritative
      for org-scoped permissions).
    """

    ADMIN = "admin", "Admin"
    AGENCY_ADMIN = "agency_admin", "Agency Admin"
    OWNER = "owner", "Owner"
    MANAGER = "manager", "Manager"
    STAFF = "staff", "Staff"


class MembershipRole(models.TextChoices):
    """Per-organization role for a user.

    A user can have a different role in each organization they belong to.
    """

    OWNER = "owner", "Owner"
    MANAGER = "manager", "Manager"
    STAFF = "staff", "Staff"
    AGENCY_ADMIN = "agency_admin", "Agency Admin"


class UserManager(BaseUserManager):
    """Email-based user manager."""

    use_in_migrations = True

    def _create_user(self, email: str, password: str | None, **extra_fields):
        """Internal helper — accepts is_staff / is_superuser / role via extra_fields."""
        if not email:
            raise ValueError("Email zorunludur.")
        email = self.normalize_email(email)
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        extra_fields.setdefault("is_active", True)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", UserRole.ADMIN)
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Custom email-based user.

    AUTH_USER_MODEL = "accounts.User" (see config.settings.base).
    """

    email = models.EmailField("Email", unique=True, db_index=True)
    full_name = models.CharField("Ad Soyad", max_length=120, blank=True, default="")
    role = models.CharField(
        "Rol",
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.OWNER,
    )

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)

    date_joined = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        verbose_name = "Kullanıcı"
        verbose_name_plural = "Kullanıcılar"
        ordering = ("email",)

    def __str__(self) -> str:  # pragma: no cover
        return self.email

    # Convenience helpers used by DRF / admin.
    @property
    def is_platform_admin(self) -> bool:
        return self.role == UserRole.ADMIN or self.is_superuser

    @property
    def is_agency_admin(self) -> bool:
        return self.role in {UserRole.AGENCY_ADMIN, UserRole.ADMIN} or self.is_superuser


class Membership(models.Model):
    """User ↔ Organization link with a per-org role."""

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(
        max_length=20,
        choices=MembershipRole.choices,
        default=MembershipRole.OWNER,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Üyelik"
        verbose_name_plural = "Üyelikler"
        unique_together = (("user", "organization"),)
        indexes = [
            models.Index(fields=["organization", "role"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.user_id} → org:{self.organization_id} ({self.role})"
