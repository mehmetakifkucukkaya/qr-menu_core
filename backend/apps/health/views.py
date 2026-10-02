"""Health endpoint — no auth, returns DB status + version + timestamp."""

from __future__ import annotations

from datetime import datetime, timezone

from django import __version__ as django_version
from django.db import connections
from django.db.utils import OperationalError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

# Version baked from pyproject.toml at deploy time via env; default for local.
APP_VERSION = "1.0.0"


class HealthView(APIView):
    """GET /health — application/json.

    Returns 200 when healthy and 503 when the database check fails:
        {
          "status": "ok" | "degraded",
          "database": "ok" | "error",
          "version": "1.0.0",
          "timestamp": "2026-09-26T13:00:00+00:00"
        }
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        db_ok = True
        try:
            with connections["default"].cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except OperationalError:
            db_ok = False
        except Exception:
            # Connection-level errors (DNS, refused) also mark DB as down.
            db_ok = False

        body = {
            "status": "ok" if db_ok else "degraded",
            "database": "ok" if db_ok else "error",
            "version": APP_VERSION,
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        }
        # 503 when the database is unreachable so `curl -f` (the Docker
        # healthcheck), load balancers and uptime monitors actually notice;
        # the JSON body still says which dependency failed.
        return Response(body, status=200 if db_ok else 503)
