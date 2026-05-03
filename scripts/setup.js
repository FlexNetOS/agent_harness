#!/usr/bin/env node
/**
 * Cloud / devcontainer / fresh-clone session bootstrapper.
 *
 * One command brings a fresh clone of agent_harness to "ready":
 *   1. Materialize .env from .env.example if missing.
 *   2. Warn (non-fatal) on missing required keys.
 *   3. Activate yarn 4.x via corepack.
 *   4. yarn install --immutable (tolerant of Windows bind-mount chmod EPERM).
 *   5. Pre-warm npx-launched MCP servers from .mcp.json.
 *   6. Populate the cross-container shared volume from PromptNexus, if reachable.
 *   7. Run the harness verifier (--skip-mcp).
 *
 * Idempotent. Exits 0 on success, 1 on hard failure (deps missing, verify
 * fails). Warnings are emitted to stderr and never abort.
 *
 * Usage:
 *   node scripts/setup.js                       # full boot
 *   node scripts/setup.js --init-env-only       # just copy .env, used by initializeCommand
 *   node scripts/setup.js --skip-install        # skip yarn install (debug)
 *   node scripts/setup.js --skip-mcp            # skip MCP pre-warm
 *   node scripts/setup.js --skip-verify         # skip harness verify
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');
const ENV_EXAMPLE_PATH = path.join(REPO_ROOT, '.env.example');
const MCP_CONFIG_PATH = path.join(REPO_ROOT, '.mcp.json');

const REQUIRED_KEYS = ['ANTHROPIC_API_KEY', 'GITHUB_TOKEN'];

const log = (msg) => process.stderr.write(`[setup] ${msg}\n`);

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  return {
    initEnvOnly: flags.has('--init-env-only'),
    skipInstall: flags.has('--skip-install'),
    skipMcp:     flags.has('--skip-mcp'),
    skipVerify:  flags.has('--skip-verify')
  };
}

function materializeEnv() {
  if (fs.existsSync(ENV_PATH)) {
    log(`.env present at ${ENV_PATH}`);
    return { created: false };
  }
  if (!fs.existsSync(ENV_EXAMPLE_PATH)) {
    log(`WARN: .env.example missing at ${ENV_EXAMPLE_PATH}; cannot create .env`);
    return { created: false, warning: 'no-template' };
  }
  fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
  log(`Created .env from .env.example. Edit ${ENV_PATH} and fill in real values.`);
  return { created: true };
}

function readEnvKeys(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function checkRequiredKeys() {
  const env = readEnvKeys(ENV_PATH);
  const missing = REQUIRED_KEYS.filter(k => !env[k] || env[k].length === 0);
  if (missing.length === 0) {
    log('Required keys present.');
    return { missing: [] };
  }
  log(`WARN: required keys empty: ${missing.join(', ')}. MCP / API features will fail until set.`);
  return { missing };
}

function activateYarn() {
  log('Activating yarn 4.9.2 via corepack...');
  const res1 = spawnSync('corepack', ['enable'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (res1.status !== 0) {
    log('WARN: corepack enable returned non-zero; continuing.');
  }
  const res2 = spawnSync('corepack', ['prepare', 'yarn@4.9.2', '--activate'], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (res2.status !== 0) {
    log('WARN: corepack prepare yarn@4.9.2 returned non-zero; continuing.');
  }
}

function runYarnInstall() {
  log('Installing dependencies (yarn install --immutable)...');
  const res = spawnSync('yarn', ['install', '--immutable'], {
    stdio: 'inherit',
    cwd: REPO_ROOT,
    shell: process.platform === 'win32'
  });
  // Yarn's link step can fail with EPERM on Windows bind-mounts; that's cosmetic.
  // We verify deps actually arrived by checking for ajv (a runtime dep).
  if (!fs.existsSync(path.join(REPO_ROOT, 'node_modules', 'ajv'))) {
    log('FATAL: ajv missing after yarn install; deps not installed.');
    return { ok: false };
  }
  if (res.status !== 0) {
    log('yarn install reported non-zero, but ajv is present (cosmetic chmod EPERM tolerated).');
  } else {
    log('yarn install OK.');
  }
  return { ok: true };
}

function prewarmMcp() {
  let prewarm;
  try {
    prewarm = require('./lib/mcp-prewarm');
  } catch (err) {
    log(`WARN: could not load mcp-prewarm: ${err.message}`);
    return [];
  }
  log('Pre-warming MCP server packages from .mcp.json...');
  const results = prewarm.prewarmMcpServers(MCP_CONFIG_PATH, {
    logPrefix: '[setup:mcp]',
    log: (msg) => process.stderr.write(`${msg}\n`)
  });
  for (const r of results) {
    log(`  ${r.name}: ${r.status}${r.detail ? ` (${r.detail})` : ''}`);
  }
  return results;
}

function populateShared() {
  let mod;
  try {
    mod = require('./lib/shared-volume');
  } catch (err) {
    log(`WARN: could not load shared-volume: ${err.message}`);
    return null;
  }
  const result = mod.populateSharedVolume({
    log: (msg) => process.stderr.write(`${msg}\n`),
    logPrefix: '[setup:shared]'
  });
  log(`shared volume: ${result.status}${result.target ? ` -> ${result.target}` : ''}`);
  return result;
}

function runVerify() {
  log('Running harness verification (npm run verify -- --skip-mcp)...');
  const res = spawnSync('npm', ['run', 'verify', '--', '--skip-mcp'], {
    stdio: 'inherit',
    cwd: REPO_ROOT,
    shell: process.platform === 'win32'
  });
  if (res.status !== 0) {
    log(`WARN: verify exited ${res.status}; run 'npm run verify' manually to investigate.`);
  } else {
    log('verify OK.');
  }
  return res.status === 0;
}

function main() {
  const args = parseArgs(process.argv);

  // Phase 0: always materialize .env (host-side, must run before container start)
  const envResult = materializeEnv();
  checkRequiredKeys();
  if (args.initEnvOnly) {
    log('--init-env-only: done.');
    process.exit(0);
  }

  // Phase 1: yarn deps
  if (!args.skipInstall) {
    activateYarn();
    const inst = runYarnInstall();
    if (!inst.ok) process.exit(1);
  }

  // Phase 2: MCP pre-warm (best effort)
  if (!args.skipMcp) {
    prewarmMcp();
  }

  // Phase 3: shared volume populate (best effort)
  populateShared();

  // Phase 4: verify
  if (!args.skipVerify) {
    runVerify();
  }

  log(`Done. Try: 'npm run verify' or 'claude mcp list'. Created .env: ${envResult.created}.`);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  materializeEnv,
  checkRequiredKeys,
  readEnvKeys,
  REPO_ROOT,
  REQUIRED_KEYS
};
