#!/usr/bin/env node
/**
 * MCP server pre-warm utility.
 *
 * Reads an .mcp.json file, finds npx-launched servers, runs each one with
 * `--help` so npm caches the package locally and the first real spawn is fast.
 *
 * Used by:
 *   - scripts/setup.js (cloud session boot)
 *   - .devcontainer/postCreate.sh (devcontainer first-run, via require())
 *
 * The function never throws — pre-warm is best-effort. It returns a status
 * array the caller can log or surface.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Pre-warm MCP servers listed in an .mcp.json config.
 *
 * @param {string} configPath  Path to .mcp.json (relative or absolute).
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=60000]   Per-server spawn timeout.
 * @param {string} [opts.logPrefix='[mcp-prewarm]']  stderr log prefix.
 * @param {function} [opts.log]             Logger; defaults to console.error.
 * @returns {Array<{name:string, package:string, status:'ok'|'timeout'|'error'|'skipped', detail?:string}>}
 */
function prewarmMcpServers(configPath, opts = {}) {
  const timeoutMs = Number.isInteger(opts.timeoutMs) && opts.timeoutMs > 0
    ? opts.timeoutMs
    : DEFAULT_TIMEOUT_MS;
  const logPrefix = typeof opts.logPrefix === 'string' && opts.logPrefix
    ? opts.logPrefix
    : '[mcp-prewarm]';
  const log = typeof opts.log === 'function'
    ? opts.log
    : (msg) => process.stderr.write(`${msg}\n`);

  const results = [];

  const resolved = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(process.cwd(), configPath);

  if (!fs.existsSync(resolved)) {
    log(`${logPrefix} config not found at ${resolved}; skipping`);
    return results;
  }

  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (err) {
    log(`${logPrefix} could not parse ${resolved}: ${err.message}`);
    return results;
  }

  const servers = (cfg && typeof cfg === 'object' && cfg.mcpServers) || {};
  for (const [name, def] of Object.entries(servers)) {
    if (!def || typeof def !== 'object') continue;
    if (def.command !== 'npx' || !Array.isArray(def.args)) {
      results.push({ name, package: '', status: 'skipped', detail: 'not an npx server' });
      continue;
    }

    const pkg = def.args.find(a => typeof a === 'string' && !a.startsWith('-'));
    if (!pkg) {
      results.push({ name, package: '', status: 'skipped', detail: 'no package arg' });
      continue;
    }

    log(`${logPrefix} pre-warming ${name} (${pkg})`);
    const spawnRes = spawnSync('npx', ['-y', pkg, '--help'], {
      stdio: 'ignore',
      timeout: timeoutMs,
      shell: process.platform === 'win32'
    });

    if (spawnRes.error) {
      results.push({ name, package: pkg, status: 'error', detail: spawnRes.error.message });
      log(`${logPrefix} ${name} error: ${spawnRes.error.message}`);
      continue;
    }
    if (spawnRes.signal) {
      results.push({ name, package: pkg, status: 'timeout', detail: `signal ${spawnRes.signal}` });
      log(`${logPrefix} ${name} timeout (signal ${spawnRes.signal})`);
      continue;
    }
    results.push({ name, package: pkg, status: 'ok' });
  }

  return results;
}

module.exports = { prewarmMcpServers, DEFAULT_TIMEOUT_MS };
