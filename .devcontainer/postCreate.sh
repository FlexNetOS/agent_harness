#!/usr/bin/env bash
# postCreate.sh — runs once after the devcontainer is built.
# Delegates to scripts/setup.js for the cross-platform orchestration so
# host (initializeCommand) and container (postCreateCommand) share logic.
# See ADR 0004 and docs/CONTAINER-PERSISTENCE.md.

set -e

echo "[postCreate] Activating yarn 4.9.2 via corepack..."
corepack enable
corepack prepare yarn@4.9.2 --activate

echo "[postCreate] Running scripts/setup.js (env, install, MCP pre-warm, shared volume, verify)..."
# setup.js is idempotent and tolerant of cosmetic Windows bind-mount EPERM
# during yarn install. It exits non-zero only on hard failures (deps missing,
# verify fails). We do NOT pass set -e through it; if it fails we still want
# the container to be usable.
node scripts/setup.js || {
  echo "[postCreate] WARN: scripts/setup.js exited non-zero. Run 'node scripts/setup.js' manually."
}

# Make the workspace's own bin scripts executable (idempotent on Windows).
chmod +x scripts/ecc.js scripts/install-apply.js 2>/dev/null || true

echo "[postCreate] Done. Try: 'npm run verify' or 'claude mcp list'"
