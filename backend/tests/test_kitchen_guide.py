"""The kitchen guide (docs/KITCHEN_GUIDE.md) must not drift from the product:
every button it quotes is on the screen, every number it gives is the real one,
the cancel reasons are the ones the server accepts, and the setup command exists."""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from django.core.management import get_commands

from apps.orders.models import CancelReason

REPO = Path(__file__).resolve().parents[2]
GUIDE = REPO / "docs" / "KITCHEN_GUIDE.md"
RUNBOOK = REPO / "docs" / "AGENCY_RUNBOOK.md"
DEPLOYMENT = REPO / "docs" / "DEPLOYMENT.md"
WEB_SRC = REPO / "apps" / "web" / "src"

needs_web = pytest.mark.skipif(
    not WEB_SRC.is_dir(), reason="apps/web is not next to backend (backend-only build context)"
)


@pytest.fixture(scope="module")
def text() -> str:
    return GUIDE.read_text(encoding="utf-8")


def _frontend_source() -> str:
    """Every non-test TypeScript source of the web app, as one string."""
    return "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted(WEB_SRC.rglob("*"))
        if path.suffix in {".ts", ".tsx"} and ".test." not in path.name
    )


def _constant(relative: str, pattern: str) -> int:
    source = (WEB_SRC / relative).read_text(encoding="utf-8")
    match = re.search(pattern, source)
    assert match, f"{pattern!r} not found in {relative}"
    return int(match.group(1).replace("_", ""))


def test_the_guide_exists_and_the_other_documents_point_to_it(text):
    assert text.startswith("# Mutfak Ekranı Kılavuzu")
    assert "KITCHEN_GUIDE.md" in RUNBOOK.read_text(encoding="utf-8")
    assert "KITCHEN_GUIDE.md" in DEPLOYMENT.read_text(encoding="utf-8")


def test_the_setup_command_exists_and_deployment_names_it_too(text):
    assert "seed_allergens_tags" in get_commands()
    assert "manage.py seed_allergens_tags" in text
    assert "manage.py seed_allergens_tags" in DEPLOYMENT.read_text(encoding="utf-8")


@needs_web
@pytest.mark.parametrize(
    "label",
    [
        "Servisi başlat",
        "Servisi bitir",
        "Sessiz",
        "Tam ekran",
        "Hazırlamaya başla",
        "Hazır",
        "Teslim edildi",
        "İptal",
        "Hazırlanıyor",
        "Yeniden giriş yap",
        "Çıkış yap",
        "Üye ekle",
        "Mutfak",
        "YENİ",
        "Dünden",
        "Uzadı",
        "Geç kaldı",
        "Bağlantı yok",
        "Canlı",
    ],
)
def test_every_quoted_label_is_on_the_screen(text, label):
    assert label in text, f"the guide no longer mentions {label!r}"
    assert label in _frontend_source(), f"{label!r} is not in the web app any more"


@needs_web
def test_the_cancel_reasons_are_the_ones_the_server_accepts(text):
    source = (WEB_SRC / "lib" / "kitchen-board.ts").read_text(encoding="utf-8")
    for code, label in CancelReason.choices:
        assert label in text, label
        assert f'value: "{code}", label: "{label}"' in source, label


@needs_web
def test_the_numbers_it_gives_are_the_real_ones(text):
    warn = _constant("lib/kitchen-board.ts", r"WARN_AFTER_SECONDS = (\d+) \* 60")
    late = _constant("lib/kitchen-board.ts", r"LATE_AFTER_SECONDS = (\d+) \* 60")
    refresh = _constant("lib/board-poller.ts", r"intervalMs \?\? ([\d_]+)") // 1000
    bell = _constant("lib/kitchen-alert.ts", r"intervalMs \?\? ([\d_]+)") // 1000

    assert f"{warn} dakikadan sonra sarı" in text
    assert f"{late} dakikadan sonra kırmızı" in text
    assert f"{refresh} saniyede bir kendiliğinden yenilenir" in text
    assert f"{bell} saniyede bir çalar" in text


@needs_web
def test_the_page_it_sends_people_to_exists(text):
    assert "/admin/kitchen" in text
    assert (WEB_SRC / "app" / "(admin)" / "admin" / "kitchen" / "page.tsx").is_file()
    roles = (WEB_SRC / "lib" / "roles.ts").read_text(encoding="utf-8")
    assert re.search(r'role === "kitchen"\) return "/admin/kitchen"', roles)
