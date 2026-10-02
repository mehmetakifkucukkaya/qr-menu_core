"""Packaging / routing facts a production deploy depends on — ANALYSIS_1 F-03, F-04.

Each of these passed unnoticed because the test database is built straight from
the models and the dev server serves everything from one origin.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest
from django.core.management import call_command

BACKEND = Path(__file__).resolve().parents[1]
APPS = BACKEND / "apps"


def _migration_dirs():
    return sorted(
        d for d in APPS.glob("*/migrations") if any(d.glob("0*.py"))
    )


@pytest.mark.parametrize("migrations_dir", _migration_dirs(), ids=lambda p: p.parent.name)
def test_every_app_with_migrations_ships_an_init_py(migrations_dir):
    """Without `__init__.py` Django ignores the folder: `migrate` silently skips
    the app's tables in a clean checkout (payment had none), while pytest still
    passes because it builds the test DB with run_syncdb."""
    init = migrations_dir / "__init__.py"
    assert init.exists(), f"{init.relative_to(BACKEND)} is missing"


@pytest.mark.skipif(shutil.which("git") is None, reason="git not available")
def test_migration_package_markers_are_tracked_by_git():
    """An `__init__.py` that exists only in your working tree is not deployed."""
    inside = subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        cwd=BACKEND, capture_output=True, text=True,
    )
    if inside.returncode != 0:
        pytest.skip("not a git checkout")
    untracked = []
    for d in _migration_dirs():
        rel = (d / "__init__.py").relative_to(BACKEND)
        tracked = subprocess.run(
            ["git", "ls-files", "--error-unmatch", str(rel)],
            cwd=BACKEND, capture_output=True, text=True,
        )
        if tracked.returncode != 0:
            untracked.append(str(rel))
    assert not untracked, f"not tracked by git: {untracked}"


@pytest.mark.django_db  # makemigrations reads the migration history table
def test_models_and_migrations_are_in_sync():
    """`makemigrations --check` must find nothing to write.

    Note this does NOT catch a missing `migrations/__init__.py`: Django treats
    such an app as "unmigrated" and `makemigrations` ignores unmigrated apps
    unless named explicitly. The two tests above are the guard for that."""
    try:
        call_command("makemigrations", check=True, dry_run=True, verbosity=0)
    except SystemExit as exc:  # --check exits 1 when changes are detected
        pytest.fail(f"models changed without a migration (exit {exc.code})")


@pytest.mark.django_db
def test_django_admin_lives_under_django_admin(client):
    """The Next.js operator panel owns /admin/* in production (Caddy sends only
    /django-admin/* to Django). Before, Django claimed /admin/ and the panel was
    unreachable behind the reverse proxy."""
    assert client.get("/django-admin/login/").status_code == 200
    assert client.get("/admin/login/").status_code == 404
