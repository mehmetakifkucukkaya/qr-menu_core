"""The one shape every "this is not in your plan" answer takes.

Five different views guard five different features (``orders_enabled``,
``ai_translate_enabled``, ``ai_pdf_import_enabled``, ``payments_enabled``,
``customer_accounts_enabled``). Before this module each of them wrote its own
response by hand, and they did not even agree on the shape: the payment guard
put the code at the top level under ``detail`` while the others nested it
under ``error``. A client that wanted to say "your plan does not include
this" therefore had to guess which shape it was looking at — and the payment
answer fell through to a generic "api.error".

One envelope, one place to change it, and every client can rely on:

.. code-block:: json

    {
      "error": {
        "code": "billing.feature_disabled",
        "message": "'Sipariş + mutfak' özelliği planınızda kapalı.",
        "feature": "orders_enabled",
        "feature_label": "Sipariş + mutfak"
      },
      "meta": {"request_id": "..."}
    }

``code`` is the contract (machines branch on it), ``message`` is the Turkish
sentence the operator reads, ``feature`` names the flag so the client can
label it, and ``feature_label`` is that label in Turkish — the server sends
it so the client never has to keep a second copy of the flag names (and
never drifts from it).
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from .constants import FEATURE_LABELS


def feature_disabled_response(exc, request: Request | None = None) -> Response:
    """The 403 a feature guard answers with.

    ``exc`` is the :class:`apps.billing.errors.FeatureDisabled` that
    ``require_feature`` raised. The ``request`` is optional: the meta block
    only carries the request id, and the service-layer callers (no request)
    still get the same error body.
    """
    feature = exc.extra.get("feature")
    return Response(
        {
            "error": {
                "code": exc.code,
                "message": exc.message,
                "feature": feature,
                "feature_label": FEATURE_LABELS.get(feature, feature),
            },
            "meta": {
                "request_id": request.META.get("HTTP_X_REQUEST_ID", "")
                if request is not None
                else ""
            },
        },
        status=status.HTTP_403_FORBIDDEN,
    )
