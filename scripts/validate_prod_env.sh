#!/usr/bin/env bash
# ============================================================================
# scripts/validate_prod_env.sh
#
# Validate .env.production before the first deploy (or any secret rotation).
# Catches missing variables and weak secrets early — better than discovering
# them in a 3 a.m. incident.
#
# Usage:
#   bash scripts/validate_prod_env.sh
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more required variables missing
#   2 — DJANGO_SECRET_KEY too short
#   3 — file not found
#
# Idempotent — safe to run as a pre-deploy hook or in CI.
# ============================================================================
set -euo pipefail

ENV_FILE=".env.production"

# --- 1. File exists ---------------------------------------------------------
if [[ ! -f "$ENV_FILE" ]]; then
    echo "❌ $ENV_FILE not found."
    echo "   Run: cp .env.production.example .env.production"
    exit 3
fi

# --- 2. Required variables present ------------------------------------------
required_vars=(
    "DJANGO_SECRET_KEY"
    "DJANGO_ALLOWED_HOSTS"
    "DATABASE_URL"
    "POSTGRES_DB"
    "POSTGRES_USER"
    "POSTGRES_PASSWORD"
    "ANALYTICS_SALT"
    "CORS_ALLOWED_ORIGINS"
    "NEXT_PUBLIC_API_BASE_URL"
    "INTERNAL_API_BASE_URL"
    "DOMAIN"
)

missing=0
echo "🔍 Checking required variables in $ENV_FILE …"
for var in "${required_vars[@]}"; do
    if grep -qE "^${var}=" "$ENV_FILE"; then
        value=$(grep -E "^${var}=" "$ENV_FILE" | head -1 | cut -d= -f2-)
        if [[ -z "$value" || "$value" == "__"* ]]; then
            echo "  ❌ $var (placeholder value — replace)"
            missing=$((missing + 1))
        else
            echo "  ✅ $var"
        fi
    else
        echo "  ❌ $var (missing)"
        missing=$((missing + 1))
    fi
done

if [[ $missing -gt 0 ]]; then
    echo ""
    echo "❌ $missing required variable(s) missing or placeholders."
    exit 1
fi

# --- 3. Secret strength -----------------------------------------------------
# DJANGO_SECRET_KEY must be 50+ characters.
secret_len=$(grep -E "^DJANGO_SECRET_KEY=" "$ENV_FILE" | cut -d= -f2- | tr -d '\n' | wc -c | tr -d ' ')
if [[ $secret_len -lt 50 ]]; then
    echo ""
    echo "❌ DJANGO_SECRET_KEY must be at least 50 characters (got $secret_len)."
    echo "   Regenerate with:"
    echo "     python -c \"import secrets; print(secrets.token_urlsafe(50))\""
    exit 2
fi

# POSTGRES_PASSWORD must be 24+ characters.
pg_len=$(grep -E "^POSTGRES_PASSWORD=" "$ENV_FILE" | cut -d= -f2- | tr -d '\n' | wc -c | tr -d ' ')
if [[ $pg_len -lt 24 ]]; then
    echo ""
    echo "❌ POSTGRES_PASSWORD must be at least 24 characters (got $pg_len)."
    echo "   Regenerate with:"
    echo "     python -c \"import secrets; print(secrets.token_urlsafe(24))\""
    exit 2
fi

# ANALYTICS_SALT must be 32+ characters.
salt_len=$(grep -E "^ANALYTICS_SALT=" "$ENV_FILE" | cut -d= -f2- | tr -d '\n' | wc -c | tr -d ' ')
if [[ $salt_len -lt 32 ]]; then
    echo ""
    echo "❌ ANALYTICS_SALT must be at least 32 characters (got $salt_len)."
    exit 2
fi

# --- 4. CORS / HTTPS sanity -------------------------------------------------
# CORS_ALLOWED_ORIGINS must use https:// in production. Allow http://localhost
# for the rare local-smoke scenario.
cors_line=$(grep -E "^CORS_ALLOWED_ORIGINS=" "$ENV_FILE" | cut -d= -f2-)
# Warn if a non-localhost http:// origin sneaks in (cookies won't be sent).
if echo "$cors_line" | grep -qE "http://" \
   && ! echo "$cors_line" | grep -qE "http://localhost"; then
    echo ""
    echo "⚠️  CORS_ALLOWED_ORIGINS contains http:// (non-localhost) — cookies won't be sent."
fi

# --- 5. NEXT_PUBLIC_API_BASE_URL scheme -------------------------------------
next_url=$(grep -E "^NEXT_PUBLIC_API_BASE_URL=" "$ENV_FILE" | cut -d= -f2-)
if [[ "$next_url" == http://* && "$next_url" != *"localhost"* ]]; then
    echo ""
    echo "⚠️  NEXT_PUBLIC_API_BASE_URL is http:// — should be https:// in production."
fi

# --- 6. Success -------------------------------------------------------------
echo ""
echo "✅ All required variables present and strong."
echo "   Safe to run: docker compose -f docker-compose.production.yml up -d --build"
