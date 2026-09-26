"""QR code utilities — Sprint 5A.

Two helper functions:

* ``build_target_url`` — composes the public URL pattern documented in
  ``SPRINT_5_PLAN.md``::

      {PUBLIC_BASE_URL}/m/{business_slug}?branch={branch_slug}&qr={qr_id}

  Kept as a single source of truth so the ``QRCode.target_url`` column
  always matches what the frontend will open, and so analytics events can
  reconstruct the same shape if they ever need to.

* ``generate_qr_png`` — encodes a PNG payload for a given URL using the
  ``qrcode[pil]`` library. The output is plain black-on-white, version
  auto-selected (the encoder downgrades the version when the data fits,
  otherwise it bumps up).

The helpers are imported by ``models.py`` (save-time URL build) and
``views.py`` (PNG download).
"""

from __future__ import annotations

from io import BytesIO

import qrcode
from django.conf import settings


# ----- Public URL builder ---------------------------------------------------

def get_public_base_url() -> str:
    """Read the configured public base URL.

    Defaults to ``http://localhost:3000`` (Next.js dev server). Production
    sets ``PUBLIC_BASE_URL`` in the deployment environment.
    """
    return getattr(settings, "PUBLIC_BASE_URL", "http://localhost:3000").rstrip("/")


def build_target_url(
    business_slug: str,
    branch_slug: str | None = None,
    qr_id: int | None = None,
    base_url: str | None = None,
) -> str:
    """Compose the public URL encoded into the QR code.

    Format: ``{base}/m/{business_slug}?branch=...&qr=...`` — query params
    are omitted when not applicable.
    """
    base = (base_url or get_public_base_url()).rstrip("/")
    url = f"{base}/m/{business_slug}"
    params: list[str] = []
    if branch_slug:
        params.append(f"branch={branch_slug}")
    if qr_id is not None:
        params.append(f"qr={qr_id}")
    if params:
        url += "?" + "&".join(params)
    return url


# ----- PNG generation ------------------------------------------------------

def generate_qr_png(url: str) -> bytes:
    """Render a QR code for the given URL and return PNG bytes.

    We rely on ``qrcode[pil]`` (already pinned in requirements.txt). The
    encoder picks the smallest version that fits the data; for our
    target URLs (typically < 100 chars) that's version 2-3.
    """
    qr = qrcode.QRCode(
        version=1,
        # ``error_correction`` defaults to ERROR_CORRECT_M (~15% recovery)
        # which is plenty for printed restaurant QR codes.
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


# ----- Filename sanitization (shared with media app) ------------------------

def sanitize_filename(name: str) -> str:
    """Strip path separators and control chars from a filename.

    Keeps the extension intact; replaces everything else with underscores.
    Used by the media upload endpoint to prevent path-traversal in the
    ``MEDIA_ROOT/uploads/{org_id}/{name}`` pattern.
    """
    import re

    name = (name or "upload").strip().replace("\\", "/").split("/")[-1]
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return name or "upload"
