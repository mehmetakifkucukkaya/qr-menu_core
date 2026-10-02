"""Production settings — strict hosts, secure cookies, hardened.

D-018 (Sprint 6A). Loaded via ``DJANGO_SETTINGS_MODULE=config.settings.production``.
Inherits everything from :mod:`base` and only overrides what must change in
production. Key principles:

- All runtime configuration is environment-driven (no hard-coded secrets or
  domains). Defaults are conservative; missing required vars surface as
  ``ImproperlyConfigured`` style startup errors instead of silently working
  in a degraded mode.
- HTTPS is enforced everywhere: ``SECURE_SSL_REDIRECT``, HSTS preload,
  ``SESSION_COOKIE_SECURE`` + ``CSRF_COOKIE_SECURE``. The proxy header
  (``X-Forwarded-Proto``) tells Django the request already arrived over TLS,
  so the redirect doesn't loop.
- Logging is JSON to stdout (12-factor) so any log shipper can consume it.
  ``json-logging`` is in :mod:`requirements-dev` because we also want it
  available in local so log lines match between dev and prod.
- Sentry is **opt-in** — only initialised when ``SENTRY_DSN`` is set. This
  lets the same image run with or without monitoring during the demo
  without changing the settings module.
"""

from __future__ import annotations

import os

# Re-export everything from base so settings that should not change between
# local/test/production (INSTALLED_APPS, REST_FRAMEWORK, MIDDLEWARE, ...) flow
# through unchanged.
from .base import *  # noqa: F401,F403


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
# DEBUG defaults to False. The env override exists for emergency local
# debugging against a production-like config (never in real production).
DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"

# Reject the request if ``DJANGO_SECRET_KEY`` is left at the placeholder
# base.py ships with. This is the single most important safety rail — a
# known secret key would let attackers forge sessions.
_secret = os.environ.get("DJANGO_SECRET_KEY", "")
if not _secret or _secret == "insecure-dev-key-do-not-use-in-prod":
    raise RuntimeError(
        "DJANGO_SECRET_KEY must be set to a strong random value in production. "
        "Generate one with: python -c 'import secrets; print(secrets.token_urlsafe(50))'"
    )
SECRET_KEY = _secret

# Allowed hosts — comma-separated env. Empty list would block every request
# (Django returns 400), so fail fast at startup instead.
ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",")
    if h.strip()
]
if not ALLOWED_HOSTS:
    raise RuntimeError(
        "DJANGO_ALLOWED_HOSTS must list at least one domain (e.g. menu.example.com)."
    )

# Hosts that only exist on the private docker network: the Next.js server calls
# the API as ``backend:8000`` and the container healthcheck as ``localhost``.
# Without them Django answers those requests with 400 DisallowedHost
# (ANALYSIS_1 F-03c/d). They are unreachable from the internet - Caddy only
# forwards requests whose Host header is the public DOMAIN.
_INTERNAL_HOSTS = [
    h.strip()
    for h in os.environ.get("DJANGO_INTERNAL_HOSTS", "backend,localhost,127.0.0.1").split(",")
    if h.strip()
]
ALLOWED_HOSTS = list(dict.fromkeys(ALLOWED_HOSTS + _INTERNAL_HOSTS))


# ---------------------------------------------------------------------------
# CORS / CSRF
# ---------------------------------------------------------------------------
# Frontend origin(s) that may hit the API with credentials. Production only
# — local/test rely on the base.py defaults.
CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
    if o.strip()
]
CSRF_TRUSTED_ORIGINS = list(CORS_ALLOWED_ORIGINS)
if not CORS_ALLOWED_ORIGINS:
    raise RuntimeError(
        "CORS_ALLOWED_ORIGINS must be set in production (comma-separated https origins)."
    )


# ---------------------------------------------------------------------------
# TLS / security headers
# ---------------------------------------------------------------------------
# Trust one hop of X-Forwarded-Proto so SECURE_SSL_REDIRECT and cookie
# "secure" checks see https when Caddy is in front. Caddy sets this header
# on every request.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# DRF keys per-client throttles on REMOTE_ADDR, or on X-Forwarded-For when
# present. With NUM_PROXIES unset it uses the WHOLE header value, so a client
# can rotate the header and never hit a limit (ANALYSIS_1 F-05). Caddy is the
# single trusted hop and appends the real client address, so DRF must use
# exactly that last entry. Override with TRUSTED_PROXY_COUNT if the topology
# changes (0 = ignore X-Forwarded-For entirely).
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405
    "NUM_PROXIES": int(os.environ.get("TRUSTED_PROXY_COUNT", "1")),
}

# Internal callers (Next.js server -> backend:8000, the container healthcheck)
# speak plain HTTP over the docker network and set no X-Forwarded-Proto, so the
# blanket redirect below answered them with 301 -> https://backend:8000, which
# nothing can follow. Public traffic always arrives through Caddy, which does
# its own http -> https redirect at the edge (ANALYSIS_1 F-03c/d).
SECURE_REDIRECT_EXEMPT = [r"^api/", r"^health$"]

# Redirect http → https unconditionally. Local-only debug runs use
# ``DJANGO_DEBUG=1`` and proxy header preservation; in real prod this is on.
SECURE_SSL_REDIRECT = True

# HSTS preload list compatibility (1 year, includeSubDomains, preload).
SECURE_HSTS_SECONDS = 31_536_000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Additional hardening headers.
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# Cookies — secure + SameSite=Lax. The frontend lives on a sibling subdomain
# (api vs menu) so "Lax" is fine for top-level navigation POSTs while still
# blocking cross-site form submissions.
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
# End-customer session cookie (apps.account): never over plain HTTP. base.py
# defaults this to False for local dev, which must not leak into production.
AUTH_COOKIE_SECURE = True


# ---------------------------------------------------------------------------
# Static / media
# ---------------------------------------------------------------------------
# Already set in base.py; re-state for clarity (so a reader of this file
# sees the production path without jumping to base).
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_ROOT = BASE_DIR / "media"

# In production we serve /static and /media through Caddy (see Caddyfile
# reverse_proxy directives). Django still needs the folders to exist so
# ``collectstatic`` + image uploads land somewhere persistent.


# ---------------------------------------------------------------------------
# Required business settings (ANALYSIS_1 F-04)
# ---------------------------------------------------------------------------
# PUBLIC_BASE_URL is baked into every printed QR code. base.py defaults it to
# http://localhost:3000, so forgetting it produced QR codes that pointed at the
# printer's own computer. Fail at startup instead.
_public_base_url = os.environ.get("PUBLIC_BASE_URL", "").strip()
if not _public_base_url or "localhost" in _public_base_url or "127.0.0.1" in _public_base_url:
    raise RuntimeError(
        "PUBLIC_BASE_URL must be set to the public origin customers scan "
        "(e.g. https://menu.example.com), not localhost."
    )
PUBLIC_BASE_URL = _public_base_url.rstrip("/")

# Fernet key for the payment credentials stored in the database. Unset, the
# payment app invents a random key per *process*: with 3 gunicorn workers each
# one encrypts with a different key and cannot decrypt what the others wrote,
# and every restart loses them all. Generate once and keep it:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
if not os.environ.get("PAYMENT_FERNET_KEY", "").strip():
    raise RuntimeError(
        "PAYMENT_FERNET_KEY must be set in production (a stable Fernet key shared by all workers)."
    )


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
# Re-parse DATABASE_URL so ``conn_max_age`` is higher than the local default
# (60s) — gunicorn keeps workers warm and we want to avoid the handshake on
# every request. ``600`` matches the 12-factor PostgreSQL tuning guide.
import dj_database_url  # noqa: E402

DATABASES = {
    "default": dj_database_url.parse(
        os.environ.get("DATABASE_URL", ""),
        conn_max_age=600,
        conn_health_checks=True,
    ),
}


# ---------------------------------------------------------------------------
# Analytics salt
# ---------------------------------------------------------------------------
# Override the base default so production uses a unique, env-driven salt.
# The empty-fallback below keeps the module importable for ``manage.py
# check`` style sanity commands, but anything that actually serves a request
# will see a different salt than dev (good — analytics events stay isolated).
ANALYTICS_SALT = os.environ.get("ANALYTICS_SALT") or os.environ.get(
    "DJANGO_SECRET_KEY", ""
)


# ---------------------------------------------------------------------------
# Logging — JSON to stdout
# ---------------------------------------------------------------------------
# Falls back to the base.py simple formatter if json-logging isn't installed
# (it should be — it's in requirements-dev.txt — but we don't want import
# time failures to break startup if a slimmer prod image omits it).
try:
    from json_logging import JSONFormatter  # type: ignore

    _JSON_AVAILABLE = True
except ImportError:  # pragma: no cover — json-logging is in requirements
    _JSON_AVAILABLE = False

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": (
            {"()": "json_logging.JSONFormatter"} if _JSON_AVAILABLE else
            {
                "format": '{"time":"%(asctime)s","level":"%(levelname)s",'
                          '"logger":"%(name)s","message":"%(message)s"}',
            }
        ),
        "simple": {
            "format": "[{asctime}] {levelname} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json" if not DEBUG else "simple",
        },
    },
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "apps": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "django.request": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
    },
    "root": {"handlers": ["console"], "level": "INFO"},
}


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------
# Default to SMTP; explicit so a local console backend doesn't leak into prod.
EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend"
)


# ---------------------------------------------------------------------------
# Optional Sentry (D-019 follow-up is monitoring scope; this is the wiring)
# ---------------------------------------------------------------------------
# Sentry SDK is only initialised when SENTRY_DSN is set. This keeps the
# image reusable for demo deployments without Sentry accounts.
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
        integrations=[DjangoIntegration()],
        # 10% traces — enough signal to spot regressions without burning the
        # free-tier quota in week one.
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        # GDPR/KVKK default: do not send cookies / IPs / user data with
        # events. The platform can opt back in per-env if needed.
        send_default_pii=False,
    )
