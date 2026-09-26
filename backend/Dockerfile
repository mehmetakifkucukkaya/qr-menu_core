# syntax=docker/dockerfile:1.4
# ---------- Base runtime ----------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production

WORKDIR /app

# System deps: build-essential only needed if a wheel is unavailable; libpq for psycopg.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first — better layer cache for code changes.
# requirements-dev.txt includes test tooling (pytest, pytest-django, pytest-cov)
# so `docker compose exec backend pytest` works without a separate test image.
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

# Default command — overridden in docker-compose for migrate-then-serve.
CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
