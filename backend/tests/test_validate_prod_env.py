"""scripts/validate_prod_env.sh must stop a deploy that would ship the demo
super-user, the demo login hint or DEBUG (SPEC_PILOT_READINESS §3.5)."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "validate_prod_env.sh"

pytestmark = pytest.mark.skipif(not SCRIPT.exists(), reason="scripts/ is not next to backend/")

BASELINE = {
    "DJANGO_SECRET_KEY": "k" * 60,
    "DJANGO_ALLOWED_HOSTS": "menu.example.com",
    "DATABASE_URL": "postgres://u:p@postgres:5432/db",
    "POSTGRES_DB": "db",
    "POSTGRES_USER": "u",
    "POSTGRES_PASSWORD": "p" * 30,
    "ANALYTICS_SALT": "s" * 40,
    "CORS_ALLOWED_ORIGINS": "https://menu.example.com",
    "NEXT_PUBLIC_API_BASE_URL": "https://menu.example.com",
    "INTERNAL_API_BASE_URL": "http://backend:8000",
    "DOMAIN": "menu.example.com",
    "PUBLIC_BASE_URL": "https://menu.example.com",
    "PAYMENT_FERNET_KEY": "f" * 44,
    "INTERNAL_API_TOKEN": "t" * 40,
}


def _run(tmp_path: Path, **extra: str) -> subprocess.CompletedProcess:
    values = {**BASELINE, **extra}
    (tmp_path / ".env.production").write_text(
        "".join(f"{key}={value}\n" for key, value in values.items())
    )
    return subprocess.run(
        ["bash", str(SCRIPT)], cwd=tmp_path, capture_output=True, text=True, timeout=30
    )


def test_a_clean_production_env_passes(tmp_path):
    result = _run(tmp_path)
    assert result.returncode == 0, result.stdout + result.stderr


def test_the_published_demo_password_is_refused(tmp_path):
    result = _run(tmp_path, DEMO_ADMIN_PASSWORD="change-me-demo-only")
    assert result.returncode == 2
    assert "DEMO_ADMIN_PASSWORD" in result.stdout


def test_the_template_placeholder_password_is_refused_too(tmp_path):
    result = _run(tmp_path, DEMO_ADMIN_PASSWORD="__CHANGE_ME_AFTER_FIRST_LOGIN__")
    assert result.returncode == 2
    assert "DEMO_ADMIN_PASSWORD" in result.stdout


def test_a_private_demo_password_alone_is_not_an_error(tmp_path):
    assert _run(tmp_path, DEMO_ADMIN_PASSWORD="a-private-staging-password").returncode == 0


def test_the_demo_login_hint_is_refused(tmp_path):
    result = _run(tmp_path, NEXT_PUBLIC_ADMIN_DEMO_HINT="1")
    assert result.returncode == 2
    assert "NEXT_PUBLIC_ADMIN_DEMO_HINT" in result.stdout


@pytest.mark.parametrize("value", ["1", "true", "True", "yes", "on"])
def test_debug_is_refused(tmp_path, value):
    result = _run(tmp_path, DJANGO_DEBUG=value)
    assert result.returncode == 2
    assert "DJANGO_DEBUG" in result.stdout


def test_debug_off_is_fine(tmp_path):
    assert _run(tmp_path, DJANGO_DEBUG="0").returncode == 0
