"""
Base Django settings for qr-menu_core.

Loaded by local/test/production variants. Reads runtime config from env vars
(see `.env.example`). DATABASE_URL is parsed via dj-database-url.
"""

from __future__ import annotations

import os
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

# Load .env from repo root if present (works for local dev / Docker).
# In production, env vars come from the platform.
# Path anatomy: this file lives at <repo>/backend/config/settings/base.py
#   parents[0] → <repo>/backend/config/settings
#   parents[1] → <repo>/backend/config
#   parents[2] → <repo>/backend           ← this is the backend root we want
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_REPO_ROOT = _BACKEND_DIR.parent
load_dotenv(_REPO_ROOT / ".env", override=False)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = _BACKEND_DIR
REPO_ROOT = _REPO_ROOT


def _env_bool(name: str, default: bool = False) -> bool:
    val = os.environ.get(name)
    if val is None:
        return default
    return val.strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name: str, default: list[str] | None = None, sep: str = ",") -> list[str]:
    raw = os.environ.get(name)
    if not raw:
        return list(default or [])
    return [item.strip() for item in raw.split(sep) if item.strip()]


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "insecure-dev-key-do-not-use-in-prod")
DEBUG = _env_bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = _env_list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"

# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "corsheaders",
]

LOCAL_APPS = [
    "apps.core",
    "apps.accounts",
    "apps.organizations",
    "apps.branches",
    "apps.theme",
    "apps.menu",
    "apps.audit",
    "apps.health",
    # Sprint 5A — QR code CRUD + PNG download, media upload, analytics.
    "apps.qr",
    "apps.media",
    "apps.analytics",
    # Sprint 7A — AI PDF menu import (D-021).
    "apps.pdf_import",
    # Sprint 8A — Customer order flow (sipariş + mutfak ekranı; D-022).
    "apps.orders",
    # Sprint 9A — AI translate + product description (D-021 reuse).
    "apps.translate",
    # Sprint 10A — Customer accounts + magic link auth + loyalty ledger (D-025).
    "apps.account",
    # Sprint 11A — Online payment (Stripe primary + iyzico adapter) (D-026).
    "apps.payment",
    # Sprint B1 — Plan + Feature Flags + Limits (D-026).
    "apps.billing",
    # Sprint C3 — Self-serve onboarding wizard (D-030).
    "apps.onboarding",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    # Sprint 4C — populate thread-local actor + IP for audit signal handlers.
    "apps.audit.middleware.AuditContextMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# ---------------------------------------------------------------------------
# Templates (Django admin needs this)
# ---------------------------------------------------------------------------
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgres://qr_menu:qr_menu@postgres:5432/qr_menu",
)

DATABASES = {
    "default": dj_database_url.config(
        default=DATABASE_URL,
        conn_max_age=60,
        conn_health_checks=True,
    ),
}

# ---------------------------------------------------------------------------
# Password validation
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "tr"
TIME_ZONE = "Europe/Istanbul"
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static / Media files
# ---------------------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# ---------------------------------------------------------------------------
# Sprint E1 — Media storage backend (D-033)
# ---------------------------------------------------------------------------
# Pluggable storage backend for ``MediaAsset`` (Sprint E1).
#   * "local" (default) — writes to MEDIA_ROOT, served by Django dev server
#     or nginx in prod.
#   * "s3" — AWS S3 / Cloudflare R2 via django-storages[boto3]. Requires
#     AWS_S3_BUCKET_NAME + AWS credentials + optional
#     AWS_S3_ENDPOINT_URL (R2) + MEDIA_PUBLIC_BASE_URL (CDN).
MEDIA_STORAGE_BACKEND = os.environ.get("MEDIA_STORAGE_BACKEND", "local")
AWS_S3_BUCKET_NAME = os.environ.get("AWS_S3_BUCKET_NAME", "")
AWS_S3_REGION = os.environ.get("AWS_S3_REGION", "")
AWS_S3_ENDPOINT_URL = os.environ.get("AWS_S3_ENDPOINT_URL", "")
MEDIA_PUBLIC_BASE_URL = os.environ.get("MEDIA_PUBLIC_BASE_URL", "")
# AWS credentials — leave blank if using IAM role (ECS / EC2 instance profile).
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "")

# ---------------------------------------------------------------------------
# Sprint 5A — public base URL + analytics salt
# ---------------------------------------------------------------------------
# PUBLIC_BASE_URL is the absolute origin the frontend uses to load menus.
# Default points at the Next.js dev server. Production sets a real
# https://menu.example.com value via env.
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://localhost:3000")

# Salt for analytics IP / User-Agent hashes (D-016 / D-017). Production
# overrides this with a 32+ char random string; the inline default is a
# clear marker that production needs to set it.
ANALYTICS_SALT = os.environ.get(
    "ANALYTICS_SALT", "qr-menu-default-salt-change-me"
)

# ---------------------------------------------------------------------------
# Sprint 7A — AI PDF menu import (D-021)
# ---------------------------------------------------------------------------
# OpenAI is the primary provider (GPT-4o vision + structured JSON output).
# Anthropic (Claude 3.5 Sonnet) is the fallback — see apps/pdf_import/services.
# Either can be left empty in development: the upload endpoint will surface
# a 502 with code `ai.parse_failed` if no provider is configured.
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_DEFAULT_MODEL = os.environ.get("OPENAI_DEFAULT_MODEL", "gpt-4o")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_DEFAULT_MODEL = os.environ.get(
    "ANTHROPIC_DEFAULT_MODEL", "claude-3-5-sonnet-20241022"
)

# PDF upload guardrails (OP-16). 10 MB / 20 pages is enough for typical
# single-language restaurant menus; the upload endpoint returns 400 if the
# file exceeds either cap.
PDF_IMPORT_MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
PDF_IMPORT_MAX_PAGES = 20

# ---------------------------------------------------------------------------
# Sprint 9A — AI translate + product description (D-021 reuse)
# ---------------------------------------------------------------------------
# Hard cap on the source text length accepted by ``POST /api/v1/admin/
# translate/``. 2000 chars covers typical menu names + descriptions
# (the longest realistic Turkish menu item description is <500 chars).
# Bulk endpoints cap item counts via ``AI_DESCRIPTION_BULK_MAX_ITEMS``
# so a single request can't fan out to hundreds of AI calls.
AI_TRANSLATION_MAX_CHARS = int(
    os.environ.get("AI_TRANSLATION_MAX_CHARS", "2000")
)
AI_DESCRIPTION_BULK_MAX_ITEMS = int(
    os.environ.get("AI_DESCRIPTION_BULK_MAX_ITEMS", "50")
)

# ---------------------------------------------------------------------------
# Sprint 10A — Customer accounts + magic-link auth + loyalty ledger (D-025)
# ---------------------------------------------------------------------------
# Magic-link TTL (minutes). The token is single-use; expiry is the only
# window during which it can be consumed.
MAGIC_LINK_TTL_MINUTES = int(
    os.environ.get("MAGIC_LINK_TTL_MINUTES", "15")
)

# Magic-link rate-limit: 5 requests per hour per IP. The throttle key
# is ``AnonRateThrottle`` keyed on REMOTE_ADDR, so the ``5/hour`` value
# flows through the standard DRF bucket — see ``DEFAULT_THROTTLE_RATES``
# below.
MAGIC_LINK_RATE_LIMIT_PER_HOUR = int(
    os.environ.get("MAGIC_LINK_RATE_LIMIT_PER_HOUR", "5")
)

# Default loyalty state for new tenants. We default OFF so a freshly
# provisioned tenant doesn't suddenly start awarding puan to its
# already-completed historical orders (the earn path is gated by the
# admin manually toggling this on).
LOYALTY_DEFAULT_ENABLED = _env_bool("LOYALTY_DEFAULT_ENABLED", default=False)

# Default sender for outbound transactional email (magic links, future
# notifications). Production overrides this via env.
DEFAULT_FROM_EMAIL = os.environ.get(
    "DEFAULT_FROM_EMAIL", "noreply@qrmenu.local"
)

# SMTP transport (ANALYSIS_1 F-04). Only EMAIL_BACKEND used to be configurable,
# so production could never reach a mail server and magic-link mails vanished.
# Port 587 + STARTTLS is the default; for implicit TLS (port 465) set
# EMAIL_USE_TLS=0 and EMAIL_USE_SSL=1. EMAIL_TIMEOUT stops a dead mail server
# from pinning a gunicorn worker (Django's default is to wait forever).
EMAIL_HOST = os.environ.get("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = _env_bool("EMAIL_USE_TLS", default=True)
EMAIL_USE_SSL = _env_bool("EMAIL_USE_SSL", default=False)
EMAIL_TIMEOUT = int(os.environ.get("EMAIL_TIMEOUT", "10"))

# End-customer session cookie. Distinct from ``SESSION_COOKIE_NAME`` so
# the platform admin session and the customer session can coexist on
# the same browser without one invalidating the other (V1 keeps admin
# auth entirely server-side; the cookie value is the customer.pk).
AUTH_COOKIE_NAME = os.environ.get(
    "AUTH_COOKIE_NAME", "_auth_customer_id"
)
AUTH_COOKIE_SECURE = _env_bool("AUTH_COOKIE_SECURE", default=False)

# ---------------------------------------------------------------------------
# Sprint 11A — Online payment (D-026: Stripe primary, iyzico adapter)
# ---------------------------------------------------------------------------
# Stripe credentials. In dev (test mode), the publishable + secret keys are
# the ``sk_test_*`` / ``pk_test_*`` pair from the Stripe Dashboard. In
# production these become ``sk_live_*`` / ``pk_live_*`` and the webhook
# secret is configured in the Dashboard > Developers > Webhooks section.
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_PUBLIC_KEY = os.environ.get("STRIPE_PUBLIC_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# Fernet key used to encrypt at-rest ``api_key`` / ``webhook_secret``
# columns on ``apps.payment.PaymentSettings``. Generate with:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# If empty, the payment app logs a one-shot warning and generates an
# ephemeral key — fine for ``pytest`` runs and the V1 demo, never for prod.
PAYMENT_FERNET_KEY = os.environ.get("PAYMENT_FERNET_KEY", "")

# Default provider name and test-mode flag used by ``apps.payment.providers
# .registry.get_provider_for_org`` when no ``PaymentSettings`` row exists
# yet for the tenant. Test mode is the V1 demo default so a fresh
# tenant's first payment attempt goes through ``sk_test_*`` instead of
# failing with a 401.
PAYMENT_DEFAULT_PROVIDER = os.environ.get(
    "PAYMENT_DEFAULT_PROVIDER", "stripe"
)
PAYMENT_DEFAULT_TEST_MODE = _env_bool(
    "PAYMENT_DEFAULT_TEST_MODE", default=True
)

# Public hostname advertised to Stripe for ``success_url`` / ``cancel_url``
# when the PaymentIntent is created. Production overrides this via env.
PAYMENT_WEBHOOK_BASE_URL = os.environ.get(
    "PAYMENT_WEBHOOK_BASE_URL", "http://localhost:8000"
)

# ---------------------------------------------------------------------------
# Sprint B1 — Billing (D-026)
# ---------------------------------------------------------------------------
# Default plan for fresh tenants (no row yet). V1 demo posture: OPS
# so Modern Cafe runs full feature set. Production / V2 SaaS flips to
# ``basic`` and the seed / signup wizard upgrades as needed.
BILLING_DEFAULT_PLAN = os.environ.get("BILLING_DEFAULT_PLAN", "ops")
# Grace percent applied to tier limits before ``enforce_limit`` fails.
# V1 hard-fails at the boundary (``BILLING_LIMIT_GRACE_PCT=0``); V2
# SaaS uses a positive value (e.g. 10) to send a warning email at
# 90 % before 402-ing on 100 %.
BILLING_LIMIT_GRACE_PCT = int(os.environ.get("BILLING_LIMIT_GRACE_PCT", "0"))

# ---------------------------------------------------------------------------
# Server-to-server trust (ANALYSIS_1 F-05)
# ---------------------------------------------------------------------------
# Shared secret the Next.js server sends as ``X-Internal-Token`` on its
# server-side calls so they are not rate limited as one anonymous visitor.
# Empty (default) disables the exemption. Set the same random value in the
# backend and frontend environments (never NEXT_PUBLIC_*):
#   python -c "import secrets; print(secrets.token_urlsafe(32))"
INTERNAL_API_TOKEN = os.environ.get("INTERNAL_API_TOKEN", "")

# ---------------------------------------------------------------------------
# DRF
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
    # Sprint 3 — throttle anonymous traffic on the public menu endpoint.
    # Per-IP rate (DRF keys AnonRateThrottle by REMOTE_ADDR). 60/min is a
    # reasonable V1 default; Sprint 5A adds a stricter 30/min bucket on
    # /api/v1/public/events (PublicEventsThrottle.scope = "public_events").
    "DEFAULT_THROTTLE_CLASSES": [
        # AnonRateThrottle + exemption for the trusted Next.js SSR caller
        # (X-Internal-Token == INTERNAL_API_TOKEN). See apps/core/throttling.py.
        "apps.core.throttling.InternalExemptAnonRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/min",
        "public_events": "30/min",
        # Sprint 8A — D-022. Public order placement is heavier than menu
        # reads (write + audit + transaction), so 20/min per IP is the V1
        # ceiling. Same bucket for the status poll endpoint would be too
        # tight for the 15s confirmation polling — status uses the
        # default AnonRateThrottle ("anon" scope, 60/min) for now.
        "public_orders": "20/min",
        # Sprint 10A — D-025. Magic-link request throttle: 5/hour per
        # IP. The request endpoint always returns 200 (enumeration safe)
        # so the throttle is the only signal that the user hit the
        # rate cap.
        "magic_link_request": "5/hour",
        # Sprint B3 — Public settings endpoint (feature flags + plan
        # tier). Same 60/min/IP bucket as the public menu read endpoint
        # since they're usually fetched together.
        "public_settings": "60/min",
        # Sprint C1 — Self-serve signup endpoint. Stricter bucket to
        # slow account-creation spam (10/hour/IP). The wizard's
        # check-slug endpoint uses the default 60/min/IP.
        "signup": "10/hour",
    },
    # SessionAuth enforces CSRF on unsafe methods (POST/PUT/PATCH/DELETE).
    # This is the default but made explicit so future contributors don't relax it.
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

# ---------------------------------------------------------------------------
# CORS (for Next.js dev server hitting the API)
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = _env_list(
    "CORS_ALLOWED_ORIGINS",
    default=["http://localhost:3000", "http://127.0.0.1:3000"],
)
CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------------------------
# Sessions / Cookies
# ---------------------------------------------------------------------------
SESSION_COOKIE_NAME = "qr_sessionid"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
# Secure flag is opt-in via env (must be True behind HTTPS in production).
SESSION_COOKIE_SECURE = _env_bool("SESSION_COOKIE_SECURE", default=False)

CSRF_COOKIE_NAME = "qr_csrftoken"
CSRF_COOKIE_HTTPONLY = False  # JS must read it to echo it in X-CSRFToken header
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = _env_bool("CSRF_COOKIE_SECURE", default=False)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {
            "format": "[{asctime}] {levelname} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "simple",
        },
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "apps": {"handlers": ["console"], "level": "DEBUG", "propagate": False},
    },
}
