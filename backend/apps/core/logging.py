"""JSON log formatter — 12-factor, one JSON object per log line.

Why this exists instead of the ``json-logging`` package
------------------------------------------------------
The production settings used to configure ``json_logging.JSONFormatter``
from the third-party ``json-logging`` package. Two things were wrong with
it, and neither showed up until CI ran:

1. The pin was ``json-logging==1.4.1`` — a version that was never
   published on PyPI. Every fresh install of the backend requirements
   failed, including the production image build, because the Dockerfile
   installs ``requirements-dev.txt``.
2. ``JSONFormatter`` does not exist in any published version of that
   package. It is called ``JSONLogFormatter``. The import therefore always
   raised ``ImportError``, and the ``except ImportError`` branch in
   ``config/settings/production.py`` silently took over — so production
   was never actually logging JSON, and nothing said so.

The fallback was not harmless either: it formatted the message with
``"message":"%(message)s"``, which produces invalid JSON the moment the
message contains a quote or a newline.

This module is deliberately dependency-free. A log formatter is not worth
a package that can break an image build, and the shape we want is small
and fixed: a dozen fields, no configuration surface.

The output shape is one JSON object per line:

    {"ts":"2026-11-11T21:10:50.994Z","level":"INFO","logger":"apps.billing",
     "msg":"quota checked","module":"services","line":42}

``json.dumps`` does the escaping, so a message containing quotes, newlines
or a unicode character still produces a single valid JSON line.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any


class JsonLogFormatter(logging.Formatter):
    """Format a log record as a single JSON object.

    Deliberately not configurable: a log formatter that every deployer can
    reshape differently is a log pipeline nobody can rely on. The field
    set is fixed, and the fields are the ones a shipper (Loki, Datadog,
    CloudWatch, Better Stack) actually indexes on.
    """

    def format(self, record: logging.LogRecord) -> str:
        # UTC, with the "Z" designator rather than "+00:00" — that is what
        # every log shipper's timestamp parser expects.
        ts = (
            datetime.fromtimestamp(record.created, tz=timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
        )
        payload: dict[str, Any] = {
            "ts": ts,
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }

        # Only when the record actually carries them — a plain info log
        # should not grow empty fields.
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack"] = self.formatStack(record.stack_info)

        return json.dumps(payload, ensure_ascii=False, default=str)
