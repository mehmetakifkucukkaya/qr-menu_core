"""Local development settings — debug on, console email, permissive."""

from .base import *  # noqa: F401,F403

DEBUG = True

# In local dev, accept any host inside the docker network / host machine.
ALLOWED_HOSTS = ["*"]

# Console email backend (default) — emails print to stdout.
# Already set in base via env var default, but be explicit:
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Show full tracebacks for easier local debugging.
INTERNAL_IPS = ["127.0.0.1", "localhost"]
