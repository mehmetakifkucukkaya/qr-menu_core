"""URL patterns for the AI translate / describe app — Sprint 9A.

Mounted by ``config/urls`` under two prefixes. We expose two URLConf
objects (one per prefix) since each ``include`` needs its own
``urlpatterns``::

    /api/v1/admin/translate/
        POST  /                          — single text
        POST  /menu-item/<pk>/           — item bulk
        POST  /menu-category/<pk>/       — category bulk
        GET   /stats/                    — cache + activity stats

    /api/v1/admin/describe/
        POST  /menu-item/<pk>/           — single item description
        POST  /bulk/                     — bulk descriptions

Both URLConfs live in this single module — see the bottom of the
file. ``config/urls`` imports ``urlpatterns`` (translate) and
``describe_urlpatterns`` (describe) directly to avoid the trickier
``include((module, namespace))`` form.
"""

from django.urls import path

from . import views


# ---------------------------------------------------------------------------
# /api/v1/admin/translate/
# ---------------------------------------------------------------------------
urlpatterns = [
    path(
        "",
        views.TranslateTextView.as_view(),
        name="admin-translate-text",
    ),
    path(
        "menu-item/<int:pk>/",
        views.TranslateMenuItemView.as_view(),
        name="admin-translate-menu-item",
    ),
    path(
        "menu-category/<int:pk>/",
        views.TranslateMenuCategoryView.as_view(),
        name="admin-translate-menu-category",
    ),
    path(
        "stats/",
        views.TranslateStatsView.as_view(),
        name="admin-translate-stats",
    ),
]


# ---------------------------------------------------------------------------
# /api/v1/admin/describe/
# ---------------------------------------------------------------------------
describe_urlpatterns = [
    path(
        "menu-item/<int:pk>/",
        views.DescribeMenuItemView.as_view(),
        name="admin-describe-menu-item",
    ),
    path(
        "bulk/",
        views.DescribeBulkView.as_view(),
        name="admin-describe-bulk",
    ),
]
