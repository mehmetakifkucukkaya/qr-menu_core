"""Frontend <-> backend URL contract test (ANALYSIS_1 F-02).

Why this exists
---------------
The backend mixes two URL styles: DRF routers (``menus/``, ``qr-codes/``,
``billing/plan/``) *with* a trailing slash and plain ``path()`` routes
(``orders``, ``account/me``, ``admin/summary``) *without* one. Django's
``APPEND_SLASH`` only ever *adds* a slash, it never removes one, so a call
to ``/api/v1/public/orders/`` against the slash-less ``public/orders``
route is a plain 404. Nineteen frontend call sites had drifted that way
(customer ordering, customer accounts, dashboard summary, kitchen display,
order detail) and nothing noticed because every backend test uses the
backend's own URL form and the frontend swallows the errors.

What it checks
--------------
Every ``/api/v1/...`` string / template literal found in the Next.js
sources must resolve through Django's URL resolver **exactly as written**
(no slash normalisation). Template placeholders are substituted with ``1``
(a path parameter) or removed (a query-string suffix such as
``${qs ? `?${qs}` : ""}``).

Known limits (by design, this is a cheap static check, not a browser test):
the HTTP *method* is not compared and URLs assembled by string
concatenation across several expressions are only seen up to the first
non-literal piece. The Playwright smoke suite covers the rest.

The test is skipped when ``apps/web`` is not next to ``backend`` (for
example inside a backend-only Docker build context).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from django.urls import Resolver404, resolve

_WEB_SRC = Path(__file__).resolve().parents[2] / "apps" / "web" / "src"

# Identifiers whose value is already a query string (``?a=b``) or "".
_QUERY_NAMES = {"qs", "query", "querystring", "search", "searchparams", "params"}

# Characters that end a URL literal (closing quote, whitespace, call syntax).
_TERMINATORS = set("\"'` \t\r\n)<>,;")

# A literal can only *start* right after an opening quote or after the
# closing brace of a ``${base}`` placeholder; this skips prose in comments
# like ``GET /api/v1/me``.
_LITERAL_PREFIX_CHARS = set("\"'`}")


def _matching_brace(text: str, open_idx: int) -> int:
    """Index of the ``}`` that closes the ``{`` at *open_idx* (brace depth only)."""
    depth = 0
    for k in range(open_idx, len(text)):
        if text[k] == "{":
            depth += 1
        elif text[k] == "}":
            depth -= 1
            if depth == 0:
                return k
    return len(text) - 1


def _is_query_expr(expr: str) -> bool:
    """True when a ``${...}`` placeholder stands for an optional ``?query`` suffix."""
    expr = expr.strip()
    if re.search(r"`\?\$\{", expr):  # cond ? `?${qs}` : ""
        return True
    return expr.lower() in _QUERY_NAMES


def scan_literal(text: str, start: int) -> tuple[str, str]:
    """Read one ``/api/v1/...`` literal beginning at *start*.

    Returns ``(as_written, resolvable)``: the first shows placeholders as
    ``{expr}`` for error messages, the second is what we hand to the
    resolver.
    """
    shown: list[str] = []
    path: list[str] = []
    i, n = start, len(text)
    while i < n:
        ch = text[i]
        if ch == "$" and text[i + 1 : i + 2] == "{":
            end = _matching_brace(text, i + 1)
            expr = text[i + 2 : end]
            shown.append("{" + " ".join(expr.split()) + "}")
            path.append("" if _is_query_expr(expr) else "1")
            i = end + 1
            continue
        if ch == "?" or ch in _TERMINATORS:
            break
        shown.append(ch)
        path.append(ch)
        i += 1
    return "".join(shown), re.sub(r"/{2,}", "/", "".join(path))


def find_api_literals(text: str) -> list[tuple[int, str, str]]:
    """All ``(line, as_written, resolvable)`` API literals in one source file."""
    lines = text.splitlines()
    found: list[tuple[int, str, str]] = []
    for match in re.finditer(r"/api/v1/", text):
        if match.start() == 0 or text[match.start() - 1] not in _LITERAL_PREFIX_CHARS:
            continue
        line_no = text.count("\n", 0, match.start()) + 1
        if lines[line_no - 1].lstrip().startswith(("*", "//", "/*")):
            continue
        shown, path = scan_literal(text, match.start())
        if path in ("/api/v1/", "/api/v1"):  # bare prefix constant
            continue
        found.append((line_no, shown, path))
    return found


def _collect_calls() -> list[tuple[str, str, str]]:
    if not _WEB_SRC.is_dir():
        return []
    calls: list[tuple[str, str, str]] = []
    for file in sorted(_WEB_SRC.rglob("*")):
        if file.suffix not in {".ts", ".tsx"} or ".test." in file.name:
            continue
        text = file.read_text(encoding="utf-8", errors="ignore")
        rel = file.relative_to(_WEB_SRC.parent)
        for line_no, shown, path in find_api_literals(text):
            calls.append((f"{rel}:{line_no}", shown, path))
    return calls


_CALLS = _collect_calls()


@pytest.mark.skipif(not _WEB_SRC.is_dir(), reason="apps/web is not available")
def test_scanner_still_finds_the_frontend_calls():
    """Guard against the check silently going blind after a refactor."""
    assert len(_CALLS) >= 60, (
        f"only {len(_CALLS)} API literals found in apps/web/src; the frontend "
        "probably stopped using plain '/api/v1/...' literals, so this contract "
        "test no longer protects anything"
    )


@pytest.mark.skipif(not _WEB_SRC.is_dir(), reason="apps/web is not available")
@pytest.mark.parametrize(
    ("where", "shown", "path"),
    _CALLS,
    ids=[f"{where} {shown}" for where, shown, _ in _CALLS],
)
def test_frontend_api_literal_resolves_exactly_as_written(where, shown, path):
    try:
        resolve(path)
    except Resolver404:
        toggled = path[:-1] if path.endswith("/") else path + "/"
        try:
            resolve(toggled)
            hint = (
                "the backend route exists only "
                f"{'without' if path.endswith('/') else 'with'} the trailing slash; "
                f"call {toggled!r} instead"
            )
        except Resolver404:
            hint = "no backend route matches (typo or removed endpoint?)"
        pytest.fail(f"{where}: {shown!r} does not resolve ({path!r}): {hint}")


# --- extractor unit tests (run even without apps/web) ------------------------


def test_scan_literal_handles_placeholders_and_query_suffixes():
    src = (
        'a("/api/v1/admin/orders/${id}/status/", x);\n'
        "b(`/api/v1/admin/orders/${query ? `?${query}` : \"\"}`);\n"
        "c(`${base}/api/v1/account/auth/verify/?token=${t}`);\n"
        "// see `/api/v1/me` in the docs\n"
        " * GET /api/v1/ignored/in/jsdoc\n"
    )
    got = {(line, path) for line, _shown, path in find_api_literals(src)}
    assert got == {
        (1, "/api/v1/admin/orders/1/status/"),
        (2, "/api/v1/admin/orders/"),
        (3, "/api/v1/account/auth/verify/"),
    }


def test_resolver_distinguishes_slash_styles():
    # DRF router route: trailing slash required.
    resolve("/api/v1/admin/menus/")
    # Plain path() route: trailing slash forbidden.
    resolve("/api/v1/public/orders")
    with pytest.raises(Resolver404):
        resolve("/api/v1/public/orders/")
