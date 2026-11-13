"""Shared admin base classes for the agency panel."""

from __future__ import annotations

from django import forms
from django.contrib import admin
from django.contrib.admin import FieldListFilter
from django.db import models


def deleting_a_customer(request) -> bool:
    """True on the customer's own delete page.

    Rows the panel protects on their own (the plan, uploaded media, view events)
    must still go away WITH their customer. Django's delete page asks the admin
    of every row that would be deleted along for permission, so the protection is
    lifted for that one page and nowhere else.
    """
    match = getattr(request, "resolver_match", None)
    return bool(match and match.url_name == "organizations_organization_delete")


class ReadOnlyModelAdmin(admin.ModelAdmin):
    """Evidence, not a workbench: rows can be listed, searched and opened, never
    added or changed, and deleted only together with their customer (never on
    their own, never in bulk)."""

    show_full_result_count = False

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return deleting_a_customer(request)


def labelled_form(model, labels: dict[str, str]):
    """A ModelForm whose only job is to name the fields in Turkish (read-only
    pages take their labels from ``Meta.labels``)."""
    meta = type("Meta", (), {"model": model, "fields": "__all__", "labels": labels})
    return type(f"{model.__name__}LabelledForm", (forms.ModelForm,), {"Meta": meta})


def _default_filter(field):
    """The filter class Django would pick for ``field``."""
    for test, filter_class in FieldListFilter._field_list_filters:
        if test(field):
            return filter_class
    raise LookupError(field.name)  # pragma: no cover


def _titled(filter_class, title, translations=None):
    """``filter_class`` under a Turkish title (and Turkish option names)."""

    class Titled(filter_class):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.title = title

        def choices(self, changelist):
            by_label = (
                {str(label): key for key, label in self.field.flatchoices} if translations else {}
            )
            for item in super().choices(changelist):
                key = by_label.get(str(item["display"]))
                yield {**item, "display": translations[key]} if key in (translations or {}) else item

    Titled.__name__ = filter_class.__name__
    return Titled


class TurkishLabelsMixin:
    """Turkish column headers and filter titles for model fields that have no
    Turkish ``verbose_name`` (giving them one would mean a migration per field).

        labels = {"created_at": "Oluşturulma", "is_active": "Aktif"}
        value_labels = {"kind": {"image": "Görsel"}}   # Turkish names for a filter's choices

    Only fields named in ``labels`` are touched, so an admin can adopt it one
    field at a time. ``created`` / ``updated`` are ready-made read-only
    columns for the two timestamps every model carries.
    """

    labels: dict[str, str] = {}
    value_labels: dict[str, dict[str, str]] = {}

    def get_list_display(self, request):
        return [self._column(name) for name in super().get_list_display(request)]

    def get_list_filter(self, request):
        return [self._filter(entry) for entry in super().get_list_filter(request)]

    def _column(self, name):
        if not isinstance(name, str) or name not in self.labels:
            return name
        field = self.model._meta.get_field(name)

        def column(obj):
            if field.choices:
                return getattr(obj, f"get_{name}_display")()
            return getattr(obj, name)

        column.__name__ = f"{name}_tr"
        column.short_description = self.labels[name]
        column.admin_order_field = name
        column.boolean = isinstance(field, models.BooleanField)
        return column

    def _filter(self, entry):
        if isinstance(entry, str):
            name, base = entry, None
        elif isinstance(entry, (list, tuple)) and len(entry) == 2 and isinstance(entry[0], str):
            name, base = entry
        else:  # a SimpleListFilter class
            return entry
        if name not in self.labels:
            return entry
        field = self.model._meta.get_field(name)
        translations = self.value_labels.get(name)
        return (name, _titled(base or _default_filter(field), self.labels[name], translations))

    @admin.display(description="Oluşturulma", ordering="created_at")
    def created(self, obj):
        return obj.created_at

    @admin.display(description="Güncellenme", ordering="updated_at")
    def updated(self, obj):
        return obj.updated_at
