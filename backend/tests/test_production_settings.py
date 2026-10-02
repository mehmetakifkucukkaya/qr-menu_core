"""Sprint 6A — production settings safety-rail tests (D-018).

These tests pin the **shape** of ``config.settings.production`` without
actually importing it — the production module runs safety checks at
import time (missing ``DJANGO_SECRET_KEY``, empty ``ALLOWED_HOSTS``, etc.)
that would crash pytest before any test could run. We verify the same
constraints with a smaller harness.

Why not just import production.py directly?

``config.settings.production`` raises RuntimeError when required env vars
are missing or weak. That's the right behaviour for a deploy (fail fast,
not silently serve with a placeholder secret). For tests we want the
settings module to be importable in a clean environment — which is the
``config.settings.test`` module's job. So instead we round-trip the
safety rails by reading the module source and asserting the constraints
are present.

If you refactor ``production.py`` and accidentally drop a guard, this
test will fail and tell you what you lost.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

# Settings module source (read once, parsed many times).
_PRODUCTION_FILE = (
    Path(__file__).resolve().parent.parent / "config" / "settings" / "production.py"
)


def _read_source() -> str:
    return _PRODUCTION_FILE.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# 1. Structural safety rails (read from source)
# ---------------------------------------------------------------------------
class TestProductionSafetyRails:
    """The production settings must refuse to start with bad config."""

    def test_requires_django_secret_key(self):
        src = _read_source()
        assert 'DJANGO_SECRET_KEY' in src
        assert "insecure-dev-key-do-not-use-in-prod" in src
        assert "RuntimeError" in src

    def test_requires_allowed_hosts(self):
        src = _read_source()
        assert "DJANGO_ALLOWED_HOSTS" in src
        # The guard pattern: raise if empty.
        assert re.search(
            r"if\s+not\s+ALLOWED_HOSTS\s*:\s*\n\s*raise\s+RuntimeError",
            src,
        ), "production.py must raise RuntimeError when DJANGO_ALLOWED_HOSTS is empty"

    def test_requires_cors_origins(self):
        src = _read_source()
        assert "CORS_ALLOWED_ORIGINS" in src
        assert re.search(
            r"if\s+not\s+CORS_ALLOWED_ORIGINS\s*:\s*\n\s*raise\s+RuntimeError",
            src,
        ), "production.py must raise RuntimeError when CORS_ALLOWED_ORIGINS is empty"

    def test_debug_defaults_to_false(self):
        src = _read_source()
        # The default must be "0" — DEBUG off in production.
        assert re.search(
            r"DEBUG\s*=\s*os\.environ\.get\(\s*[\"']DJANGO_DEBUG[\"']\s*,\s*[\"']0[\"']\s*\)\s*==\s*[\"']1[\"']",
            src,
        ), "DEBUG must default to False (env DJANGO_DEBUG=0) in production.py"

    def test_secure_ssl_redirect_enabled(self):
        src = _read_source()
        assert "SECURE_SSL_REDIRECT = True" in src

    def test_hsts_one_year(self):
        src = _read_source()
        assert "SECURE_HSTS_SECONDS = 31_536_000" in src or "SECURE_HSTS_SECONDS = 31536000" in src
        assert "SECURE_HSTS_INCLUDE_SUBDOMAINS = True" in src
        assert "SECURE_HSTS_PRELOAD = True" in src

    def test_secure_cookies(self):
        src = _read_source()
        assert "SESSION_COOKIE_SECURE = True" in src
        assert "CSRF_COOKIE_SECURE = True" in src
        assert 'SESSION_COOKIE_SAMESITE = "Lax"' in src
        assert 'CSRF_COOKIE_SAMESITE = "Lax"' in src

    def test_customer_session_cookie_is_secure(self):
        """The end-customer cookie (apps.account) must be HTTPS-only in prod (F-07)."""
        assert "AUTH_COOKIE_SECURE = True" in _read_source()

    def test_proxy_ssl_header(self):
        src = _read_source()
        assert "SECURE_PROXY_SSL_HEADER" in src
        assert "HTTP_X_FORWARDED_PROTO" in src

    def test_sentry_optional(self):
        src = _read_source()
        # Sentry must be opt-in via env var, not unconditional.
        assert "SENTRY_DSN" in src
        assert re.search(
            r"if\s+SENTRY_DSN\s*:",
            src,
        ), "Sentry must only initialise when SENTRY_DSN is non-empty"

    def test_json_logging(self):
        src = _read_source()
        assert "JSONFormatter" in src or "json_logging" in src
        assert "formatters" in src
        assert "handlers" in src


# ---------------------------------------------------------------------------
# 2. End-to-end import with all env vars set
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "missing_var",
    [
        "DJANGO_SECRET_KEY",
        "DJANGO_ALLOWED_HOSTS",
        "CORS_ALLOWED_ORIGINS",
        "PUBLIC_BASE_URL",
        "PAYMENT_FERNET_KEY",
    ],
)
def test_production_settings_raise_when_env_missing(missing_var, monkeypatch):
    """Running the production settings in a subprocess must raise
    RuntimeError when a required env var is missing or weak. This is the
    actual production failure mode — Caddy would never even start because
    the backend container's ``CMD`` chains migrate+collectstatic+gunicorn
    and ``migrate`` would fail at import.
    """
    # Build a complete env, then blank out the one we're testing.
    # Note: this test file lives at backend/tests/test_*.py, so
    # parents[1] is the backend root (where ``manage.py`` and ``config/``
    # live together).
    backend_dir = Path(__file__).resolve().parents[1]
    env = {
        "DJANGO_SETTINGS_MODULE": "config.settings.production",
        "PYTHONPATH": str(backend_dir),
        "DJANGO_SECRET_KEY": "x" * 60,  # 60 chars, strong
        "DJANGO_ALLOWED_HOSTS": "menu.example.com",
        "CORS_ALLOWED_ORIGINS": "https://menu.example.com",
        "DATABASE_URL": "postgres://qr_menu:test@postgres:5432/qr_menu",
        "ANALYTICS_SALT": "x" * 40,
        "PUBLIC_BASE_URL": "https://menu.example.com",
        "PAYMENT_FERNET_KEY": "k" * 43 + "=",
        # Avoid the .env file leaking in.
        "HOME": os.environ.get("HOME", ""),
        "PATH": os.environ.get("PATH", ""),
    }
    # Force the "missing" condition for the variable under test.
    if missing_var == "DJANGO_SECRET_KEY":
        env["DJANGO_SECRET_KEY"] = "insecure-dev-key-do-not-use-in-prod"
    else:
        env[missing_var] = ""

    backend_dir = Path(__file__).resolve().parents[1]
    code = (
        "import os, sys; "
        "import django; "
        "django.setup()"
    )
    proc = subprocess.run(
        [sys.executable, "-c", code],
        cwd=str(backend_dir),
        env=env,
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert proc.returncode != 0, (
        f"production.py should fail to import when {missing_var} is invalid. "
        f"stdout: {proc.stdout!r} stderr: {proc.stderr!r}"
    )
    # The error message should mention the offending variable.
    assert missing_var in proc.stderr or missing_var in proc.stdout


def test_production_settings_import_with_valid_env():
    """The flip side: with all required vars set, production settings
    import cleanly and the values land where expected.
    """
    backend_dir = Path(__file__).resolve().parents[1]
    env = {
        "DJANGO_SETTINGS_MODULE": "config.settings.production",
        "PYTHONPATH": str(backend_dir),
        "DJANGO_DEBUG": "0",
        "DJANGO_SECRET_KEY": "x" * 60,
        "DJANGO_ALLOWED_HOSTS": "menu.example.com,api.menu.example.com",
        "CORS_ALLOWED_ORIGINS": "https://menu.example.com",
        "DATABASE_URL": "postgres://qr_menu:test@postgres:5432/qr_menu",
        "ANALYTICS_SALT": "y" * 40,
        "PUBLIC_BASE_URL": "https://menu.example.com/",
        "PAYMENT_FERNET_KEY": "k" * 43 + "=",
        "EMAIL_HOST": "smtp.example.com",
        "EMAIL_PORT": "2525",
        "EMAIL_HOST_USER": "mailer",
        "EMAIL_HOST_PASSWORD": "s3cret",
        "HOME": os.environ.get("HOME", ""),
        "PATH": os.environ.get("PATH", ""),
    }
    code = (
        "import os, sys; "
        "import django; "
        "django.setup(); "
        "from django.conf import settings; "
        "assert settings.DEBUG is False, 'DEBUG must be False in production'; "
        "assert settings.ALLOWED_HOSTS[:2] == ['menu.example.com', 'api.menu.example.com']; "
        "assert settings.CORS_ALLOWED_ORIGINS == ['https://menu.example.com']; "
        "assert settings.CSRF_TRUSTED_ORIGINS == settings.CORS_ALLOWED_ORIGINS; "
        "assert settings.SECURE_SSL_REDIRECT is True; "
        "assert settings.SECURE_HSTS_SECONDS == 31_536_000; "
        "assert settings.SESSION_COOKIE_SECURE is True; "
        "assert settings.CSRF_COOKIE_SECURE is True; "
        "assert settings.SECURE_PROXY_SSL_HEADER == ('HTTP_X_FORWARDED_PROTO', 'https'); "
        # F-03: internal callers (SSR as 'backend', healthcheck as 'localhost') are accepted
        "assert 'backend' in settings.ALLOWED_HOSTS and 'localhost' in settings.ALLOWED_HOSTS; "
        "assert settings.SECURE_REDIRECT_EXEMPT == [r'^api/', r'^health$']; "
        # F-05: one trusted proxy hop; F-07: customer cookie is HTTPS-only
        "assert settings.REST_FRAMEWORK['NUM_PROXIES'] == 1; "
        "assert settings.AUTH_COOKIE_SECURE is True; "
        # F-04: QR base URL and SMTP come from the environment
        "assert settings.PUBLIC_BASE_URL == 'https://menu.example.com'; "
        "assert (settings.EMAIL_HOST, settings.EMAIL_PORT) == ('smtp.example.com', 2525); "
        "assert (settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD) == ('mailer', 's3cret'); "
        "assert settings.EMAIL_USE_TLS is True and settings.EMAIL_TIMEOUT == 10; "
        "print('OK')"
    )
    proc = subprocess.run(
        [sys.executable, "-c", code],
        cwd=str(backend_dir),
        env=env,
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert proc.returncode == 0, (
        f"production.py should import cleanly with valid env. "
        f"stderr: {proc.stderr!r}"
    )
    assert "OK" in proc.stdout


@pytest.mark.parametrize(
    "bad_url",
    ["http://localhost:3000", "http://127.0.0.1:3000", "https://localhost"],
)
def test_production_refuses_a_localhost_public_base_url(bad_url):
    """QR codes are printed from PUBLIC_BASE_URL; a localhost value is a typo that
    only shows up after the stickers are on the tables (ANALYSIS_1 F-04)."""
    backend_dir = Path(__file__).resolve().parents[1]
    env = {
        "DJANGO_SETTINGS_MODULE": "config.settings.production",
        "PYTHONPATH": str(backend_dir),
        "DJANGO_SECRET_KEY": "x" * 60,
        "DJANGO_ALLOWED_HOSTS": "menu.example.com",
        "CORS_ALLOWED_ORIGINS": "https://menu.example.com",
        "DATABASE_URL": "postgres://qr_menu:test@postgres:5432/qr_menu",
        "ANALYTICS_SALT": "x" * 40,
        "PUBLIC_BASE_URL": bad_url,
        "PAYMENT_FERNET_KEY": "k" * 43 + "=",
        "HOME": os.environ.get("HOME", ""),
        "PATH": os.environ.get("PATH", ""),
    }
    proc = subprocess.run(
        [sys.executable, "-c", "import django; django.setup()"],
        cwd=str(backend_dir), env=env, capture_output=True, text=True, timeout=20,
    )
    assert proc.returncode != 0
    assert "PUBLIC_BASE_URL" in proc.stderr
