"""Secondary URLConf — re-exports ``describe_urlpatterns`` under the
canonical ``urlpatterns`` name so ``config/urls`` can mount it via
``include((module, namespace))`` under ``/api/v1/admin/describe/``.

This is a thin wrapper module — the actual path definitions live in
``apps.translate.urls``. Kept as a separate file (rather than
inline-``include`` magic in ``config/urls``) so reverse lookups and
test URL reversal work without surprises.
"""

from apps.translate.urls import describe_urlpatterns

urlpatterns = describe_urlpatterns
