"""AI translation + product description services — Sprint 9A.

Mounted under ``/api/v1/admin/translate/`` and
``/api/v1/admin/describe/``. See ``services`` for the AI provider
abstraction (D-021 reuse: OpenAI primary, Anthropic fallback, lazy
SDK import) and ``models`` for ``TranslationMemory`` (cache) +
``AIProductDescription`` (regen guard).
"""
