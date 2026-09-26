"""Shared fixtures for audit tests.

Re-uses ``api_client`` / ``org_a`` / ``org_b`` from the root conftest
and ensures the thread-local audit context is cleared between tests so
actor / IP / snapshot cache from one test don't leak into another.
"""

from __future__ import annotations

import pytest

from apps.audit.context import _local, clear


@pytest.fixture(autouse=True)
def _reset_audit_context():
    """Clear the thread-local audit context between tests."""
    clear()
    # Drop the pre_save snapshot cache too.
    if hasattr(_local, "_audit_snapshot"):
        delattr(_local, "_audit_snapshot")
    yield
    clear()
    if hasattr(_local, "_audit_snapshot"):
        delattr(_local, "_audit_snapshot")
