"""core app admin - no domain models to register (TimeStampedModel is abstract).

The only thing done here: take Django's own "Groups" out of the agency's
sidebar. Access is by role (``User.role`` / ``Membership.role``) and every
agency account is a superuser, so permission groups would only confuse.
"""

from django.contrib import admin
from django.contrib.auth.models import Group

if admin.site.is_registered(Group):
    admin.site.unregister(Group)
