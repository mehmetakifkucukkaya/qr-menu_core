from django.apps import AppConfig


class AuditConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.audit"
    verbose_name = "Audit"

    def ready(self) -> None:  # pragma: no cover - import side effects
        # Connect signal handlers to model lifecycle events. Imported
        # here (not at module top-level) so the AppRegistry is fully
        # populated and ``apps.menu.models`` etc. resolve.
        from . import signals  # noqa: F401
