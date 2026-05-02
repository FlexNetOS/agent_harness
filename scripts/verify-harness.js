#!/usr/bin/env node
/**
 * Verify the harness end-to-end.
 *
 * Orchestrates existing CI validators and adds three live checks:
 *   1. Plugin manifest sanity (.claude-plugin/plugin.json)
 *   2. Hook profile sweep (hooks/hooks.json — parsed directly)
 *   3. MCP server smoke (.mcp.json — npx --help per stdio server, HEAD per http)
 *
 * Exit codes:
 *   0  no reds (overall green or yellow)
 *   1  one or more reds
 *
 * Flags:
 *   --skip-mcp           skip MCP smoke (fast iteration)
 *   --skip-tests         skip tests/run-all.js (fast iteration)
 *   --json               emit machine-readable summary as the last line
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ARGS = new Set(process.argv.slice(2));

const COLORS = process.stdout.isTTY ? {
  red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', reset: '\x1b[0m',
} : { red: '', yellow: '', green: '', dim: '', reset: '' };

const results = []; // { name, level: 'OK'|'WARN'|'ERROR', detail?: string }

function record(name, level, detail) {
  results.push({ name, level, detail });
  const tag = level === 'OK' ? `${COLORS.green}[OK]   ${COLORS.reset}` :
              level === 'WARN' ? `${COLORS.yellow}[WARN] ${COLORS.reset}` :
              `${COLORS.red}[ERROR]${COLORS.reset}`;
  const line = `${tag} ${name}${detail ? ` — ${COLORS.dim}${detail}${COLORS.reset}` : ''}`;
  console.log(line);
}

// --- 0. Dependencies sanity ---------------------------------------------

function checkDeps() {
  const nm = path.join(ROOT, 'node_modules');
  if (!fs.existsSync(nm)) {
    record('node_modules', 'WARN', "node_modules missing — run 'yarn install' (validators requiring ajv will fail)");
    return false;
  }
  // Sample-check one critical dep
  if (!fs.existsSync(path.join(nm, 'ajv'))) {
    record('node_modules', 'WARN', 'ajv not installed — re-run yarn install');
    return false;
  }
  record('node_modules', 'OK', 'dependencies installed');
  return true;
}

// --- 1. Existing validators ----------------------------------------------

const VALIDATORS = [
  ['validate-agents',            'scripts/ci/validate-agents.js'],
  ['validate-commands',          'scripts/ci/validate-commands.js'],
  ['validate-rules',             'scripts/ci/validate-rules.js'],
  ['validate-skills',            'scripts/ci/validate-skills.js'],
  ['validate-hooks',             'scripts/ci/validate-hooks.js'],
  ['validate-install-manifests', 'scripts/ci/validate-install-manifests.js'],
  ['validate-no-personal-paths', 'scripts/ci/validate-no-personal-paths.js'],
  ['check-unicode-safety',       'scripts/ci/check-unicode-safety.js'],
];

function extractFailureLine(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  // Prefer ERROR: lines, then `Error:` lines, then the first non-empty line
  const errLine = lines.find(l => /^ERROR:/i.test(l)) ||
                  lines.find(l => /^[A-Za-z]*Error:/.test(l.trim())) ||
                  lines.find(l => l.trim().length > 0);
  return errLine ? errLine.trim().slice(0, 200) : null;
}

function runValidators(depsOk) {
  for (const [name, rel] of VALIDATORS) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      record(name, 'ERROR', `script missing at ${rel}`);
      continue;
    }
    const r = spawnSync(process.execPath, [abs], { cwd: ROOT, encoding: 'utf8' });
    if (r.status === 0) {
      record(name, 'OK');
    } else {
      const detail = extractFailureLine(r.stderr) || extractFailureLine(r.stdout) || `exit ${r.status}`;
      const isDepError = /Cannot find module/i.test(detail);
      if (isDepError && !depsOk) {
        record(name, 'WARN', `skipped — needs deps installed`);
      } else {
        record(name, 'ERROR', detail);
      }
    }
  }
}

// --- 2. Plugin manifest sanity -------------------------------------------

function checkPluginManifest() {
  const file = path.join(ROOT, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(file)) {
    record('plugin-manifest', 'ERROR', '.claude-plugin/plugin.json missing');
    return;
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    record('plugin-manifest', 'ERROR', `parse failed: ${e.message}`);
    return;
  }

  const issues = [];

  for (const dirField of ['skills', 'commands']) {
    const dirs = Array.isArray(manifest[dirField]) ? manifest[dirField] : [];
    for (const dir of dirs) {
      const abs = path.resolve(ROOT, dir);
      if (!fs.existsSync(abs)) issues.push(`${dirField} path missing: ${dir}`);
    }
  }

  if (manifest.mcpServers && Object.keys(manifest.mcpServers).length > 0) {
    issues.push('mcpServers is non-empty in plugin.json — convention is to defer to .mcp.json');
  }

  if (issues.length === 0) record('plugin-manifest', 'OK');
  else if (issues.every(i => i.startsWith('mcpServers'))) record('plugin-manifest', 'WARN', issues.join('; '));
  else record('plugin-manifest', 'ERROR', issues.join('; '));
}

// --- 3. Hook profile sweep -----------------------------------------------

const VALID_PROFILES = ['minimal', 'standard', 'strict'];

function extractHookEntries(hooksJson) {
  const out = [];
  const hooks = (hooksJson && hooksJson.hooks) || {};
  for (const trigger of Object.keys(hooks)) {
    const entries = Array.isArray(hooks[trigger]) ? hooks[trigger] : [];
    for (const entry of entries) {
      const subHooks = Array.isArray(entry.hooks) ? entry.hooks : [];
      for (const h of subHooks) {
        // Pull the run-with-flags.js positional args from the command string.
        // Pattern: ".../run-with-flags.js <hookId> <scriptPath> [profilesCsv]"
        const cmd = h.command || '';
        const m = cmd.match(/run-with-flags\.js\s+(\S+)\s+(\S+)(?:\s+([^\s"]+))?/);
        const profilesCsv = m && m[3] ? m[3] : null;
        const id = entry.id || (m && m[1]) || '<unnamed>';
        const scriptRel = m ? m[2] : null;
        out.push({ trigger, id, profilesCsv, scriptRel });
      }
    }
  }
  return out;
}

function checkHookProfiles() {
  const file = path.join(ROOT, 'hooks', 'hooks.json');
  if (!fs.existsSync(file)) {
    record('hook-profiles', 'ERROR', 'hooks/hooks.json missing');
    return;
  }
  let hooksJson;
  try {
    hooksJson = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    record('hook-profiles', 'ERROR', `parse failed: ${e.message}`);
    return;
  }
  const entries = extractHookEntries(hooksJson);

  if (entries.length === 0) {
    record('hook-profiles', 'ERROR', 'no hooks parsed from hooks.json');
    return;
  }

  // Verify each hook script exists on disk
  const missingScripts = [];
  for (const e of entries) {
    if (!e.scriptRel) continue; // hook not routed via run-with-flags (e.g., inline pre-bash dispatcher)
    const abs = path.join(ROOT, e.scriptRel);
    if (!fs.existsSync(abs)) missingScripts.push(`${e.id} -> ${e.scriptRel}`);
  }
  if (missingScripts.length) {
    record('hook-profiles:scripts-exist', 'ERROR', `missing: ${missingScripts.slice(0, 3).join(', ')}${missingScripts.length > 3 ? ` (+${missingScripts.length - 3} more)` : ''}`);
  } else {
    record('hook-profiles:scripts-exist', 'OK', `${entries.length} hooks reference existing scripts`);
  }

  // Compute per-profile enabled hooks (matches lib/hook-flags.js semantics)
  const enabledByProfile = Object.fromEntries(VALID_PROFILES.map(p => [p, []]));
  for (const e of entries) {
    const profilesCsv = e.profilesCsv || 'standard,strict'; // matches parseProfiles fallback
    const allowed = profilesCsv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    for (const p of VALID_PROFILES) {
      if (allowed.includes(p)) enabledByProfile[p].push(e.id);
    }
  }

  // standard and strict must be non-empty; empty minimal is intentional (opt-out by default)
  const counts = VALID_PROFILES.map(p => `${p}=${enabledByProfile[p].length}`).join(' ');
  if (enabledByProfile.standard.length === 0 || enabledByProfile.strict.length === 0) {
    record('hook-profiles:non-empty', 'ERROR', `standard/strict cannot be empty: ${counts}`);
  } else {
    record('hook-profiles:non-empty', 'OK', counts);
  }

  // Inclusion order: minimal ⊆ standard ⊆ strict (each next profile activates ≥ prior)
  const minimalSet  = new Set(enabledByProfile.minimal);
  const standardSet = new Set(enabledByProfile.standard);
  const strictSet   = new Set(enabledByProfile.strict);
  const minNotInStd = [...minimalSet].filter(id => !standardSet.has(id));
  const stdNotInStrict = [...standardSet].filter(id => !strictSet.has(id));
  if (minNotInStd.length || stdNotInStrict.length) {
    record('hook-profiles:inclusion', 'WARN',
      `inclusion violated: ${minNotInStd.length} minimal-only, ${stdNotInStrict.length} standard-only`);
  } else {
    record('hook-profiles:inclusion', 'OK', 'minimal ⊆ standard ⊆ strict');
  }
}

// --- 4. MCP server smoke -------------------------------------------------

function smokeStdioServer(name, command, args, timeoutMs = 5000) {
  return new Promise(resolve => {
    const res = spawnSync(command, [...args, '--help'], { encoding: 'utf8', timeout: timeoutMs });
    if (res.error) return resolve({ ok: false, detail: res.error.message });
    if (res.status === 0 || /usage|options|--help/i.test(`${res.stdout}${res.stderr}`)) {
      return resolve({ ok: true });
    }
    resolve({ ok: false, detail: `exit ${res.status}` });
  });
}

function smokeHttpServer(url, timeoutMs = 5000) {
  return new Promise(resolve => {
    const req = https.request(url, { method: 'HEAD', timeout: timeoutMs }, res => {
      resolve({ ok: res.statusCode < 500, detail: `HTTP ${res.statusCode}` });
    });
    req.on('error', e => resolve({ ok: false, detail: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, detail: 'timeout' }); });
    req.end();
  });
}

const MCP_ENV_REQS = {
  github: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
  exa: ['EXA_API_KEY'],
  context7: [], // optional CONTEXT7_API_KEY
  memory: [],
  playwright: [],
  'sequential-thinking': [],
};

async function checkMcpServers() {
  if (ARGS.has('--skip-mcp')) {
    record('mcp-smoke', 'WARN', 'skipped (--skip-mcp)');
    return;
  }
  const file = path.join(ROOT, '.mcp.json');
  if (!fs.existsSync(file)) {
    record('mcp-smoke', 'ERROR', '.mcp.json missing');
    return;
  }
  let mcp;
  try {
    mcp = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    record('mcp-smoke', 'ERROR', `parse failed: ${e.message}`);
    return;
  }

  const servers = mcp.mcpServers || {};
  const names = Object.keys(servers);
  if (names.length === 0) {
    record('mcp-smoke', 'WARN', 'no MCP servers configured');
    return;
  }

  for (const name of names) {
    const def = servers[name];
    const requiredEnv = MCP_ENV_REQS[name] || [];
    const missingEnv = requiredEnv.filter(v => !process.env[v]);
    let result;
    if (def.type === 'http' && def.url) {
      result = await smokeHttpServer(def.url);
    } else if (def.command) {
      result = await smokeStdioServer(name, def.command, def.args || []);
    } else {
      record(`mcp:${name}`, 'ERROR', 'no command or url');
      continue;
    }
    if (!result.ok) {
      record(`mcp:${name}`, 'ERROR', result.detail || 'smoke failed');
    } else if (missingEnv.length) {
      record(`mcp:${name}`, 'WARN', `env vars unset: ${missingEnv.join(', ')}`);
    } else {
      record(`mcp:${name}`, 'OK', result.detail || 'reachable');
    }
  }
}

// --- 5. Tests ------------------------------------------------------------

function runTests() {
  if (ARGS.has('--skip-tests')) {
    record('tests', 'WARN', 'skipped (--skip-tests)');
    return;
  }
  const runner = path.join(ROOT, 'tests', 'run-all.js');
  if (!fs.existsSync(runner)) {
    record('tests', 'ERROR', 'tests/run-all.js missing');
    return;
  }
  const r = spawnSync(process.execPath, [runner], { cwd: ROOT, encoding: 'utf8' });
  if (r.status === 0) {
    record('tests', 'OK');
  } else {
    const detail = (r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ') || `exit ${r.status}`;
    record('tests', 'ERROR', detail);
  }
}

// --- main ----------------------------------------------------------------

(async () => {
  console.log(`${COLORS.dim}verify-harness — ${ROOT}${COLORS.reset}\n`);

  const depsOk = checkDeps();
  runValidators(depsOk);
  checkPluginManifest();
  checkHookProfiles();
  await checkMcpServers();
  runTests();

  const counts = results.reduce((a, r) => (a[r.level]++, a), { OK: 0, WARN: 0, ERROR: 0 });
  const overall = counts.ERROR > 0 ? 'RED' : counts.WARN > 0 ? 'YELLOW' : 'GREEN';
  const overallColor = overall === 'GREEN' ? COLORS.green : overall === 'YELLOW' ? COLORS.yellow : COLORS.red;

  console.log(`\n${overallColor}OVERALL: ${overall}${COLORS.reset} (${counts.OK} OK, ${counts.WARN} WARN, ${counts.ERROR} ERROR)`);

  if (ARGS.has('--json')) {
    console.log(JSON.stringify({ overall, counts, results }));
  }

  process.exit(counts.ERROR > 0 ? 1 : 0);
})().catch(err => {
  console.error(`verify-harness fatal: ${err.message}`);
  process.exit(1);
});
