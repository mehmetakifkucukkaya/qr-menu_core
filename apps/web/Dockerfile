# syntax=docker/dockerfile:1.4
# ============================================================================
# Multi-stage Dockerfile for the Next.js public menu frontend.
# Sprint 3B-2 (D-007 — node:20-bookworm-slim, standalone output).
#
# Build stages:
#   1. deps    — npm ci with cache mount (fast re-builds)
#   2. builder — produces the .next/standalone bundle
#   3. runner  — minimal runtime image, non-root user, runs `node server.js`
#
# The standalone output (next.config.mjs → `output: "standalone"`) drops
# node_modules down to ~250 MB instead of the full ~400 MB; that's what
# the runner stage copies in.
# ============================================================================

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# BuildKit cache mount keeps the npm cache between builds (huge speedup
# when only application code changes — npm ci is the slowest step otherwise).
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund


FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISCH=1 \
    NODE_ENV=production
# Reuse node_modules from the deps stage.
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build


FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISCH=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as a dedicated non-root user (uid 1001) — Next.js convention.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

# Static assets + standalone server bundle.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Standalone Next.js exports server.js at the repo root.
CMD ["node", "server.js"]