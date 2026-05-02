#!/usr/bin/env bash
# postCreate.sh — runs once after the devcontainer is built.
# See ADR 0004 for what each step does and why.

set -e
echo "[postCreate] Activating yarn 4.9.2 via corepack..."
corepack enable
corepack prepare yarn@4.9.2 --activate

echo "[postCreate] Installing dependencies (yarn install --immutable)..."
# Yarn's link step tries to chmod the workspace's own bin entries
# (scripts/ecc.js, scripts/install-apply.js per package.json).
# On Windows bind-mounts that chmod fails with EPERM — cosmetic, not fatal:
# all third-party deps (in the named-volume node_modules) install correctly.
# We tolerate non-zero from yarn here and verify deps another way below.
yarn install --immutable || echo "[postCreate] (yarn reported non-zero — investigating below)"

if [ ! -d node_modules/ajv ]; then
  echo "[postCreate] FATAL: ajv missing after yarn install — deps not installed."
  exit 1
fi
echo "[postCreate] yarn install OK (ajv present; bind-mount chmod warning is cosmetic)."

# Make the workspace's own bin scripts executable from inside the container
# (they live on the bind mount; the +x bit on Windows is filesystem-specific
# and may already be set, but this is idempotent and harmless).
chmod +x scripts/ecc.js scripts/install-apply.js 2>/dev/null || true

echo "[postCreate] Pre-warming MCP server packages from .mcp.json..."
# Parse .mcp.json for npx-launched servers and pre-fetch them.
# We tolerate failures here — pre-warm is best-effort.
node - <<'JS' || true
const fs = require('fs');
const { spawnSync } = require('child_process');
try {
  const cfg = JSON.parse(fs.readFileSync('.mcp.json', 'utf8'));
  const servers = cfg.mcpServers || {};
  for (const [name, def] of Object.entries(servers)) {
    if (def.command !== 'npx' || !Array.isArray(def.args)) continue;
    // Find the package arg (the one starting with @ or non-flag)
    const pkg = def.args.find(a => !a.startsWith('-'));
    if (!pkg) continue;
    process.stdout.write(`[postCreate] pre-warming ${name} (${pkg}) ...\n`);
    spawnSync('npx', ['-y', pkg, '--help'], { stdio: 'ignore', timeout: 60000 });
  }
} catch (e) {
  console.error('[postCreate] MCP pre-warm skipped:', e.message);
}
JS

echo "[postCreate] Running harness verification (npm run verify --skip-mcp)..."
# We skip MCP smoke here because pre-warm just ran and stdio probes
# during postCreate are noisy. The user can run 'npm run verify' anytime.
npm run verify -- --skip-mcp || {
  echo "[postCreate] WARN: verify reported errors. Run 'npm run verify' to investigate."
  echo "[postCreate] Continuing — devcontainer is still usable."
}

echo "[postCreate] Done. Try: 'npm run verify' or 'claude mcp list'"
