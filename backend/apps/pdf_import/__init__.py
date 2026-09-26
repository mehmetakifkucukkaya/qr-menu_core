"""PDF menu import app — Sprint 7A (D-021).

Operators upload a PDF of their existing menu; an AI provider (OpenAI
GPT-4o by default, Anthropic Claude 3.5 Sonnet as fallback) parses it
into structured ``MenuImportItem`` rows. After admin review + inline
edit, a single ``POST /confirm`` bulk-saves the result to the existing
``Menu`` / ``MenuCategory`` / ``MenuItem`` models.

The two-model pattern (``MenuImportDraft`` + ``MenuImportItem``) keeps the
import workflow atomic: review/edit happens against immutable draft rows,
the actual menu tree is only touched after explicit confirmation.

See also ``docs/SPRINT_7_PLAN.md`` and DECISIONS D-021.
"""