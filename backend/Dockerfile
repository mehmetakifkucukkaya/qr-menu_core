# syntax=docker/dockerfile:1.4
# ============================================================================
# Multi-stage Dockerfile for the Django backend.
#
# D-007 (Sprint 0) — python:3.12-slim pin.
# D-018 (Sprint 6A) — production target with migrate + collectstatic + gunicorn
# baked into CMD. Local docker-compose overrides the command to mount the
# source tree and run the dev server; production uses the prod target as-is.
#
# Build stages:
#   1. base    — Python 3.12-slim, system deps (libpq), pip-installed requirements
#   2. dev     — extends base; defaults to ``config.settings.local`` (used
#                when building the local docker-compose stack)
#   3. prod    — extends base; defaults to ``config.settings.production`` and
#                runs migrate + collectstatic + gunicorn on start
#
# Default target = prod (safer for any deploy that doesn't say --target).
# ============================================================================

# ---------------------------------------------------------------------------
# 1. base — shared runtime image.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps: libpq5 for psycopg runtime; build-essential only needed at
# build time so we keep it in ``builder`` instead — psycopg 3 ships wheels
# for the slim image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first — better layer cache for code changes.
COPY requirements.txt /app/requirements.txt
COPY requirements-dev.txt /app/requirements-dev.txt
RUN pip install --upgrade pip \
    && pip install -r /app/requirements-dev.txt

# Copy the rest of the backend code.
COPY . /app/

# Staticfiles + media folders (mounted as volumes in docker-compose).
RUN mkdir -p /app/staticfiles /app/media

EXPOSE 8000

# Healthcheck: curl /health (DB-ok means the API is truly up, not just the port).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1


# ---------------------------------------------------------------------------
# 2. dev — local docker-compose target.
# ---------------------------------------------------------------------------
FROM base AS dev

ENV DJANGO_SETTINGS_MODULE=config.settings.local

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]


# ---------------------------------------------------------------------------
# 3. prod — production target (DEFAULT).
# ---------------------------------------------------------------------------
# The CMD below runs migrations + collectstatic before starting gunicorn so
# that a single ``docker compose up -d`` brings the API to a serving state.
# The ``collectstatic`` step is required because Caddy reverse_proxies
# ``/static/*`` to the backend container and that path must exist.
FROM base AS prod

ENV DJANGO_SETTINGS_MODULE=config.settings.production

CMD ["sh", "-c", \
     "python manage.py migrate --noinput && \
      python manage.py collectstatic --noinput && \
      gunicorn config.wsgi:application \
        --bind 0.0.0.0:8000 \
        --workers 3 \
        --timeout 60 \
        --access-logfile - \
        --error-logfile -"]
