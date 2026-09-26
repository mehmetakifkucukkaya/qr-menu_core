"""Test settings — in-memory SQLite, fast password hashing, CSRF off for tests."""

from .base import *  # noqa: F401,F403

DEBUG = False

# Fast password hasher so tests run quickly.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

# In-memory SQLite for unit tests. Each test gets a fresh DB via the
# TransactionTestCase / pytest-django `db` fixture.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    },
}

# Speed: disable migrations for tests, build schema directly.
# Keep migrations on for the health/auth tests; Sprint 2+ can opt-in to
# --keepdb / no-migrations if needed.
# (Commenting out so test DB matches prod schema.)
# MIGRATION_MODULES = {"app": None}

# DRF defaults: tests typically don't enforce CSRF unless explicitly enabled.
# pytest-django + DRF APIClient skip CSRF by default — this matches base.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
}

# Quieter logging in tests.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "null": {"class": "logging.NullHandler"},
    },
    "root": {"handlers": ["null"], "level": "WARNING"},
}

# Don't try to send emails in tests.
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
