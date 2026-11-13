"""``manage.py expire_trials`` — end every OPS trial whose window has closed.

Reading a tenant's plan already ends its trial lazily; this sweeps the tenants
nobody has read lately. Run it once a day from cron, e.g.::

    docker compose exec backend python manage.py expire_trials
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.billing.constants import OPS
from apps.billing.models import PlanSettings
from apps.billing.services import expire_trial


class Command(BaseCommand):
    help = "Downgrade OPS trials whose window has closed to BASIC (run daily)."

    def handle(self, *args, **options):
        due = PlanSettings.objects.filter(
            active_plan=OPS, trial_ends_at__lte=timezone.now()
        ).select_related("organization")
        downgraded = sum(1 for plan in due if expire_trial(plan))
        self.stdout.write(f"expire_trials: {downgraded} trial(s) downgraded")
