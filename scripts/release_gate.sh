#!/usr/bin/env bash
# ============================================================================
# scripts/release_gate.sh - run this before every deploy. Do not deploy on red.
#
# Runs, in order, stopping at the first failure:
#   1. backend test suite                (pytest)
#   2. frontend type-check + lint        (tsc, next lint, e2e tsc)
#   3. frontend unit tests               (seo, currency, feature flags, ...)
#   4. production env file check         (only if .env.production exists)
#   5. browser smoke tests, 6 flows      (Playwright - apps/web/e2e/README.md)
#
# Usage:
#   bash scripts/release_gate.sh
#   SKIP_E2E=1 bash scripts/release_gate.sh     # everything but the browser flows
#   E2E_CHANNEL=chrome bash scripts/release_gate.sh
#
# Environment: E2E_PYTHON (default python3) is used for the backend tests too.
# Why it exists: ANALYSIS_1 F-58 - the first audit found that "483 green" tests,
# tsc, lint and `next build` all passed while the admin could not create a
# product and customers could not place an order.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${E2E_PYTHON:-python3}"
step=0

run() {
    step=$((step + 1))
    echo ""
    echo "━━ [$step] $1"
    shift
    if ! "$@"; then
        echo ""
        echo "❌ Release gate FAILED at step $step. Do not deploy."
        exit 1
    fi
}

run "backend tests" bash -c "cd '$ROOT/backend' && '$PYTHON' -m pytest -q -p no:cacheprovider"

run "web type-check"  bash -c "cd '$ROOT/apps/web' && npx tsc --noEmit"
run "web lint"        bash -c "cd '$ROOT/apps/web' && npx next lint"
run "e2e type-check"  bash -c "cd '$ROOT/apps/web' && npm run --silent type-check:e2e"

for t in test:seo test:currency test:feature-flags test:trial-banner test:media-uploader test:ttl-cache test:cart-store; do
    run "web unit tests ($t)" bash -c "cd '$ROOT/apps/web' && npm run --silent $t"
done

if [[ -f "$ROOT/.env.production" ]]; then
    run "production env file" bash -c "cd '$ROOT' && bash scripts/validate_prod_env.sh"
else
    echo ""
    echo "━━ (skipped) no .env.production here - run scripts/validate_prod_env.sh on the server"
fi

if [[ "${SKIP_E2E:-0}" == "1" ]]; then
    echo ""
    echo "⚠️  SKIP_E2E=1 - browser smoke tests NOT run. This is not a release gate."
else
    run "browser smoke tests (flows 1-6 + regressions)" bash -c "cd '$ROOT/apps/web' && npm run --silent test:e2e"
fi

echo ""
echo "✅ Release gate passed."
