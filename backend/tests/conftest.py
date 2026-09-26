"""Backwards-compatible shim.

Project-wide fixtures (api_client, admin_user, org_a, org_b) now live in
``backend/conftest.py`` so they're visible from in-app tests too. This file
is kept empty so existing imports of ``tests.conftest`` don't break.
"""

# Intentionally empty. See top-level conftest.py.