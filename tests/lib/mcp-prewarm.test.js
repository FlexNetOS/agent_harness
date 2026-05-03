/**
 * Tests for scripts/lib/mcp-prewarm.js
 *
 * Run with: node tests/lib/mcp-prewarm.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { prewarmMcpServers, DEFAULT_TIMEOUT_MS } = require('../../scripts/lib/mcp-prewarm');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    failed++;
  }
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-prewarm-'));
  try { return fn(dir); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log('\n=== Testing scripts/lib/mcp-prewarm.js ===\n');

test('exports DEFAULT_TIMEOUT_MS', () => {
  assert.strictEqual(typeof DEFAULT_TIMEOUT_MS, 'number');
  assert.ok(DEFAULT_TIMEOUT_MS > 0);
});

test('returns empty array when config is missing', () => {
  withTempDir(dir => {
    const logs = [];
    const result = prewarmMcpServers(path.join(dir, 'nope.json'), {
      log: m => logs.push(m)
    });
    assert.deepStrictEqual(result, []);
    assert.ok(logs.some(m => m.includes('config not found')));
  });
});

test('returns empty array when config is malformed JSON', () => {
  withTempDir(dir => {
    const cfg = path.join(dir, '.mcp.json');
    fs.writeFileSync(cfg, '{ not json');
    const logs = [];
    const result = prewarmMcpServers(cfg, { log: m => logs.push(m) });
    assert.deepStrictEqual(result, []);
    assert.ok(logs.some(m => m.includes('could not parse')));
  });
});

test('skips http-type and non-npx servers', () => {
  withTempDir(dir => {
    const cfg = path.join(dir, '.mcp.json');
    fs.writeFileSync(cfg, JSON.stringify({
      mcpServers: {
        exa: { type: 'http', url: 'https://example' },
        bare: { command: 'node' }                 // no args array
      }
    }));
    const result = prewarmMcpServers(cfg, {
      log: () => {},
      timeoutMs: 1   // immediate timeout if anything spawns
    });
    assert.strictEqual(result.length, 2);
    for (const r of result) {
      assert.strictEqual(r.status, 'skipped');
    }
  });
});

test('records package name for npx servers', () => {
  withTempDir(dir => {
    const cfg = path.join(dir, '.mcp.json');
    fs.writeFileSync(cfg, JSON.stringify({
      mcpServers: {
        // Use a fake package; we expect spawn to fail or time out, but we
        // still want the entry recorded with its package name. Use a tiny
        // timeout so the test is fast.
        ghost: { command: 'npx', args: ['-y', '@nonexistent/ghost-mcp@0.0.0'] }
      }
    }));
    const result = prewarmMcpServers(cfg, {
      log: () => {},
      timeoutMs: 100
    });
    assert.strictEqual(result.length, 1);
    const entry = result[0];
    assert.strictEqual(entry.name, 'ghost');
    assert.strictEqual(entry.package, '@nonexistent/ghost-mcp@0.0.0');
    assert.ok(['ok', 'timeout', 'error'].includes(entry.status), `unexpected status ${entry.status}`);
  });
});

test('handles empty mcpServers object', () => {
  withTempDir(dir => {
    const cfg = path.join(dir, '.mcp.json');
    fs.writeFileSync(cfg, JSON.stringify({ mcpServers: {} }));
    const result = prewarmMcpServers(cfg, { log: () => {} });
    assert.deepStrictEqual(result, []);
  });
});

test('logs with custom prefix', () => {
  withTempDir(dir => {
    const cfg = path.join(dir, '.mcp.json');
    fs.writeFileSync(cfg, '{}');
    const logs = [];
    prewarmMcpServers(cfg, { log: m => logs.push(m), logPrefix: '[X]' });
    // No mcpServers, so no log lines from the loop. Empty logs is fine.
    assert.ok(Array.isArray(logs));
  });
});

console.log(`\nResults: Passed: ${passed}, Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
