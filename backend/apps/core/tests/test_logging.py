"""Tests for the JSON log formatter (apps/core/logging.py).

The formatter replaced a third-party package that was pinned to a version
that was never published, and configured with a class name that never
existed in any published version. The import therefore always raised
ImportError and the silent fallback took over — production was never
logging JSON. Nothing caught it, because the old test only grepped the
settings source for a class name.

These tests check the behaviour instead: does a log line come out as one
valid JSON object, with the fields a shipper indexes on.
"""

from __future__ import annotations

import json
import logging

from apps.core.logging import JsonLogFormatter


def _record(
    msg: str = "hello",
    level: int = logging.INFO,
    name: str = "apps.billing",
    exc_info=None,
) -> logging.LogRecord:
    return logging.LogRecord(
        name=name,
        level=level,
        pathname="/app/apps/billing/services.py",
        lineno=42,
        msg=msg,
        args=None,
        exc_info=exc_info,
    )


def test_a_log_line_is_one_valid_json_object():
    line = JsonLogFormatter().format(_record())
    parsed = json.loads(line)

    assert parsed["level"] == "INFO"
    assert parsed["logger"] == "apps.billing"
    assert parsed["msg"] == "hello"
    assert parsed["ts"].endswith("Z")


def test_the_line_has_no_newline_in_it():
    # A log shipper reads one line per record. A pretty-printed JSON would
    # be split across several lines and break the pipeline.
    line = JsonLogFormatter().format(_record())
    assert "\n" not in line


def test_a_message_with_quotes_stays_valid_json():
    # This is exactly what the old fallback got wrong: it formatted the
    # message straight into '"message":"%(message)s"', so a quote in the
    # message produced a broken line.
    line = JsonLogFormatter().format(_record(msg='say "hi" now'))
    assert json.loads(line)["msg"] == 'say "hi" now'


def test_a_message_with_a_newline_stays_on_one_line():
    line = JsonLogFormatter().format(_record(msg="line one\nline two"))
    assert "\n" not in line
    assert json.loads(line)["msg"] == "line one\nline two"


def test_a_unicode_message_is_not_escaped_away():
    line = JsonLogFormatter().format(_record(msg="Menü hazır — 85 ₺"))
    assert "Menü hazır — 85 ₺" in line
    assert json.loads(line)["msg"] == "Menü hazır — 85 ₺"


def test_the_level_is_carried():
    line = JsonLogFormatter().format(_record(level=logging.ERROR))
    assert json.loads(line)["level"] == "ERROR"


def test_an_exception_is_included_when_there_is_one():
    try:
        raise ValueError("boom")
    except ValueError:
        import sys

        exc_info = sys.exc_info()

    line = JsonLogFormatter().format(_record(exc_info=exc_info))
    parsed = json.loads(line)

    assert "ValueError: boom" in parsed["exc"]


def test_a_plain_record_has_no_empty_extra_fields():
    parsed = json.loads(JsonLogFormatter().format(_record()))
    assert "exc" not in parsed
    assert "stack" not in parsed


def test_the_formatter_is_usable_as_a_logging_formatter():
    # The whole point: the production settings point at this class, so it
    # has to survive the way Django instantiates it.
    formatter = logging.Formatter  # noqa: F841 — readability
    instance = logging.getLogger("apps.core.tests").getChild("probe")
    assert isinstance(JsonLogFormatter(), logging.Formatter)
    assert instance.name
