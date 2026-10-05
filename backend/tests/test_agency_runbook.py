"""The agency runbook (docs/AGENCY_RUNBOOK.md) must not drift from the product:
every command and option it tells people to type exists, and every button or
action it quotes is really on the screen."""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from django.contrib import admin
from django.core.management import get_commands, load_command_class

from apps.organizations.models import Organization

REPO = Path(__file__).resolve().parents[2]
RUNBOOK = REPO / "docs" / "AGENCY_RUNBOOK.md"
DEPLOYMENT = REPO / "docs" / "DEPLOYMENT.md"


@pytest.fixture(scope="module")
def text() -> str:
    return RUNBOOK.read_text(encoding="utf-8")


def _code_blocks(text: str) -> list[str]:
    return re.findall(r"```[a-z]*\n(.*?)```", text, flags=re.S)


def test_the_runbook_exists_and_deployment_points_to_it(text):
    assert "docs/DEPLOYMENT.md" in text
    assert "AGENCY_RUNBOOK.md" in DEPLOYMENT.read_text(encoding="utf-8")


def test_every_manage_py_command_it_names_exists(text):
    named = set(re.findall(r"manage\.py ([a-z_]+)", text))
    assert {"createsuperuser", "create_tenant", "expire_trials"} <= named
    assert named <= set(get_commands()), named - set(get_commands())


def test_every_create_tenant_option_it_shows_exists(text):
    parser = load_command_class("apps.onboarding", "create_tenant").create_parser(
        "manage.py", "create_tenant"
    )
    known = set(parser._option_string_actions)
    shown = set()
    for block in _code_blocks(text):
        joined = block.replace("\\\n", " ")
        for line in joined.splitlines():
            if "create_tenant" in line:
                shown |= set(re.findall(r"(?<!\w)(--[a-z-]+)", line.split("create_tenant", 1)[1]))
    assert shown, "the runbook should show a create_tenant example"
    assert shown <= known, shown - known
    # The options table lists every option.
    table = set(re.findall(r"`(--[a-z-]+)`", text))
    assert {opt for opt in known if opt.startswith("--") and opt != "--help"} - {
        "--version", "--verbosity", "--settings", "--pythonpath", "--traceback",
        "--no-color", "--force-color", "--skip-checks",
    } <= table


@pytest.mark.parametrize(
    "label",
    [
        "Yeni müşteri aç",
        "Seçili müşterileri askıya al",
        "Seçili müşterileri yeniden etkinleştir",
        "Denemeyi 7 gün uzat",
        "Denemeyi 14 gün uzat",
        "Denemeyi 30 gün uzat",
        "Sahibin şifresini sıfırla",
        "Paketi ve modülleri düzenle",
    ],
)
def test_every_quoted_button_exists_in_the_product_and_in_the_runbook(text, label):
    assert label in text
    source = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (REPO / "backend" / "apps" / "organizations").rglob("*")
        if path.suffix in {".py", ".html"} and "tests" not in path.parts
    )
    assert label in source


def test_the_actions_it_names_are_offered_on_the_list(rf, admin_user, text):
    request = rf.get("/")
    request.user = admin_user
    offered = {
        description
        for _func, _name, description in admin.site._registry[Organization]
        .get_actions(request)
        .values()
    }
    for expected in ("Seçili müşterileri askıya al", "Denemeyi 7 gün uzat"):
        assert expected in offered and expected in text


def test_the_caddy_examples_name_the_real_route(text):
    caddyfile = (REPO / "Caddyfile").read_text(encoding="utf-8")
    assert "handle /django-admin/*" in caddyfile
    assert text.count("handle /django-admin/*") >= 2
    assert "reverse_proxy backend:8000" in caddyfile
