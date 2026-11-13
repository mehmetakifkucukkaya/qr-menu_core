"""Mounted by ``config/urls`` under ``/api/v1/admin/team/``::

    GET   /api/v1/admin/team/                          list members
    POST  /api/v1/admin/team/                          add a member
    PATCH /api/v1/admin/team/{id}/                     change role / activate
    POST  /api/v1/admin/team/{id}/reset-password/      new temporary password
"""

from django.urls import path

from .team_views import TeamListCreateView, TeamMemberView, TeamResetPasswordView

urlpatterns = [
    path("", TeamListCreateView.as_view(), name="team-list"),
    path("<int:pk>/", TeamMemberView.as_view(), name="team-member"),
    path(
        "<int:pk>/reset-password/",
        TeamResetPasswordView.as_view(),
        name="team-reset-password",
    ),
]
