"""Production settings — strict hosts, secure cookies, hardened."""

import os

from .base import *  # noqa: F401,F403

DEBUG = False

# Honor a stricter ALLOWED_HOSTS in production; fall back to a sane default.
ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",")
    if h.strip()
] or ["api.qr-menu.example.com"]

# Cookies must be Secure (HTTPS only) in production.
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Proxy headers (when behind Caddy / Nginx): trust one hop.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# Email: use the configured SMTP backend in prod.
EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend"
)
