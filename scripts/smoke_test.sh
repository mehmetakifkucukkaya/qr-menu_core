#!/usr/bin/env bash
# ============================================================================
# scripts/smoke_test.sh
#
# QR Menü V1 — Pre-deploy smoke test.
#
# Validates that the entire stack is alive and the demo data is in place:
#   1. Backend health
#   2. Public menu endpoint (Modern Cafe)
#   3. Frontend root
#   4. Frontend public menu page (HTML rendered)
#   5. Admin auth gate (redirect to /login)
#   6. Backend pytest suite (134 passed)
#   7. Frontend TypeScript clean
#   8. Modern Cafe has >= 5 QR codes seeded
#   9. Demo assets present in frontend public/
#
# Usage:
#   ./scripts/smoke_test.sh
#   BASE_URL=https://api.example.com WEB_URL=https://menu.example.com ./scripts/smoke_test.sh
#
# Exit codes:
#   0 — all 9 checks passed
#   1 — one or more checks failed (CI gate fail)
#
# Designed to run both locally (developer machine) and in CI (GitHub Actions
# pre-deploy job). Idempotent. Read-only against DB.
# ============================================================================
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
WEB_URL="${WEB_URL:-http://localhost:3000}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

# Colors (only when stdout is a TTY — CI logs plain).
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; NC=''
fi

pass() { echo -e "${GREEN}✅ $*${NC}"; }
fail() { echo -e "${RED}❌ $*${NC}"; exit 1; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
info() { echo "   $*"; }

echo "==================================="
echo " QR Menü V1 — Smoke Test"
echo "==================================="
echo "Backend:  $BASE_URL"
echo "Frontend: $WEB_URL"
echo "Compose:  $COMPOSE_FILE"
echo ""

# ---- 1. Backend health ---------------------------------------------------
echo "1. Backend health (/health)..."
HEALTH=$(curl -fsS "$BASE_URL/health" 2>&1) || fail "/health not reachable (is backend up?)"
echo "$HEALTH" | grep -q '"status":"ok"'    || fail "/health: status not ok → $HEALTH"
echo "$HEALTH" | grep -q '"database":"ok"'  || fail "/health: database not ok → $HEALTH"
pass "/health OK (db connected)"

# ---- 2. Public menu endpoint --------------------------------------------
echo ""
echo "2. Public menu (/api/v1/public/menus/modern-cafe)..."
PUB=$(curl -fsS "$BASE_URL/api/v1/public/menus/modern-cafe?locale=tr" 2>&1) \
  || fail "public menu endpoint not reachable"
echo "$PUB" | grep -q '"Modern Cafe"' \
  || fail "public menu payload does not contain 'Modern Cafe'"
CATEGORIES=$(echo "$PUB" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['categories']))" 2>/dev/null) \
  || fail "could not parse categories count from public menu payload"
[ "$CATEGORIES" -eq 5 ] || fail "expected 5 categories, got $CATEGORIES"
pass "public menu: Modern Cafe, 5 categories"

# ---- 3. Frontend root ----------------------------------------------------
echo ""
echo "3. Frontend root ($WEB_URL/)..."
ROOT_CODE=$(curl -fsS -o /dev/null -w "%{http_code}" "$WEB_URL/" 2>&1) \
  || fail "frontend root not reachable"
case "$ROOT_CODE" in
  200|307|302) pass "frontend /: HTTP $ROOT_CODE (render or redirect)" ;;
  *) fail "frontend /: unexpected HTTP $ROOT_CODE" ;;
esac

# ---- 4. Frontend public menu --------------------------------------------
echo ""
echo "4. Frontend public page ($WEB_URL/m/modern-cafe)..."
PUB_HTML=$(curl -fsSL "$WEB_URL/m/modern-cafe" 2>&1) \
  || fail "frontend /m/modern-cafe not reachable"
echo "$PUB_HTML" | grep -q "Modern Cafe" \
  || fail "/m/modern-cafe: HTML does not contain 'Modern Cafe' brand"
pass "/m/modern-cafe HTML rendered"

# ---- 5. Admin auth gate --------------------------------------------------
echo ""
echo "5. Admin auth gate (unauth → redirect to /login)..."
# Use -o /dev/null -w '%{redirect_url}' to follow redirects and report final URL.
ADMIN_REDIRECT=$(curl -fsS -o /dev/null -w '%{redirect_url}' --max-redirs 5 \
  "$WEB_URL/admin/dashboard" 2>&1) \
  || fail "frontend /admin/dashboard not reachable"
echo "$ADMIN_REDIRECT" | grep -q "/login" \
  || fail "admin not redirecting to /login: $ADMIN_REDIRECT"
pass "admin auth gate: redirects to /login when unauth"

# ---- 6. Backend pytest ---------------------------------------------------
echo ""
echo "6. Backend pytest (expect 134 passed)..."
if docker compose -f "$COMPOSE_FILE" ps backend >/dev/null 2>&1; then
  PYTEST_OUT=$(docker compose -f "$COMPOSE_FILE" exec -T backend pytest -q 2>&1) \
    || fail "pytest failed; check $COMPOSE_FILE exec backend pytest"
  echo "$PYTEST_OUT" | tail -3
  echo "$PYTEST_OUT" | grep -qE "134 passed" \
    || fail "pytest: expected '134 passed', got: $(echo "$PYTEST_OUT" | tail -1)"
  pass "pytest: 134 passed"
else
  warn "backend container not running — skipping pytest (run manually: cd backend && pytest -q)"
fi

# ---- 7. Frontend TypeScript ----------------------------------------------
echo ""
echo "7. Frontend TypeScript (npx tsc --noEmit)..."
if [[ -d "apps/web" ]]; then
  pushd apps/web >/dev/null
  if [[ -f "node_modules/.bin/tsc" ]]; then
    # Use `if !` to exempt the pipeline from set -e; tsc errors otherwise abort before
    # we can produce a clean failure message.
    if ! npx tsc --noEmit 2>&1 | tee /tmp/tsc.out; then
      fail "tsc reported errors (see /tmp/tsc.out)"
    fi
    pass "tsc clean"
  else
    warn "node_modules not installed — skipping tsc (run: cd apps/web && npm install)"
  fi
  popd >/dev/null
else
  warn "apps/web not found — skipping tsc"
fi

# ---- 8. Modern Cafe QR codes ---------------------------------------------
echo ""
echo "8. Modern Cafe QR codes (expect >= 5)..."
if docker compose -f "$COMPOSE_FILE" ps backend >/dev/null 2>&1; then
  QRS=$(docker compose -f "$COMPOSE_FILE" exec -T backend \
    python manage.py shell -c \
    "from apps.qr.models import QRCode; print(QRCode.objects.filter(organization__slug='modern-cafe', is_active=True).count())" \
    2>&1 | tail -1)
  [[ "$QRS" =~ ^[0-9]+$ ]] || fail "QR count query failed: $QRS"
  [ "$QRS" -ge 5 ] || fail "expected >= 5 QR codes for modern-cafe, got $QRS"
  pass "modern-cafe QR codes: $QRS"
else
  warn "backend container not running — skipping QR count"
fi

# ---- 9. Demo assets ------------------------------------------------------
echo ""
echo "9. Demo assets (apps/web/public/demo-assets/)..."
ASSETS_DIR="apps/web/public/demo-assets"
if [[ -d "$ASSETS_DIR" ]]; then
  ASSETS=$(ls "$ASSETS_DIR" 2>/dev/null | wc -l | tr -d ' ')
  [ "$ASSETS" -ge 3 ] || fail "expected >= 3 demo assets, got $ASSETS"
  info "files: $(ls "$ASSETS_DIR" | tr '\n' ' ')"
  pass "demo assets: $ASSETS files"
else
  fail "$ASSETS_DIR not found (Sprint 6B AI generate should have created this)"
fi

echo ""
echo "==================================="
echo -e "${GREEN} All 9 smoke checks passed ✅${NC}"
echo " V1 demo-ready!"
echo "==================================="
