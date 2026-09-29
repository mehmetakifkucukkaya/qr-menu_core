"""Shared fixtures for the accounts test suite — Sprint C1 (D-030 follow-up).

Resets the DRF throttle cache between tests so the signup endpoint's
``signup: 10/hour`` throttle doesn't block subsequent test cases
(billing conftest pattern reuse).
"""

from __future__ import annotations

import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    """Reset DRF throttle cache between tests."""
    cache.clear()
    yield
    cache.clear()
