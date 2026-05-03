/**
 * Tests for scripts/setup.js
 *
 * Tests the env-materialization and required-key detection paths via the
 * exported helpers. Full orchestration (yarn install, MCP pre-warm, verify)
 * is exercised end-to-end by the postCreate path and is not duplicated here.
 *
 * Run with: node tests/scripts/setup.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'setup.js');
const setup = require('../../scripts/setup');

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

function mktemp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); }
  catch { /* ignore */ }
}

console.log('\n=== Testing scripts/setup.js ===\n');

test('exports REQUIRED_KEYS containing ANTHROPIC_API_KEY and GITHUB_TOKEN', () => {
  assert.ok(setup.REQUIRED_KEYS.includes('ANTHROPIC_API_KEY'));
  assert.ok(setup.REQUIRED_KEYS.includes('GITHUB_TOKEN'));
});

test('readEnvKeys parses key=value lines and ignores comments', () => {
  const dir = mktemp('setup-env-');
  try {
    const f = path.join(dir, '.env');
    fs.writeFileSync(f, [
      '# comment line',
      '',
      'KEY1=value1',
      'QUOTED="quoted value"',
      'SINGLE=\'single quoted\'',
      'EMPTY=',
      '   # spaced comment'
    ].join('\n'));
    const env = setup.readEnvKeys(f);
    assert.strictEqual(env.KEY1, 'value1');
    assert.strictEqual(env.QUOTED, 'quoted value');
    assert.strictEqual(env.SINGLE, 'single quoted');
    assert.strictEqual(env.EMPTY, '');
  } finally { cleanup(dir); }
});

test('readEnvKeys returns {} when file missing', () => {
  assert.deepStrictEqual(setup.readEnvKeys('/no/such/file/anywhere.env'), {});
});

// --init-env-only end-to-end via spawn — it copies .env in REPO_ROOT, which
// is the only place setup.js looks. We verify the script runs without error
// and that .env exists afterward (which is the case in this repo already, so
// the test is read-only and idempotent).
test('--init-env-only exits 0 and leaves .env in place', () => {
  const result = spawnSync('node', [SCRIPT, '--init-env-only'], {
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  assert.strictEqual(result.status, 0, `stdout=${result.stdout}\nstderr=${result.stderr}`);
  assert.ok(fs.existsSync(path.join(setup.REPO_ROOT, '.env')) ||
    !fs.existsSync(path.join(setup.REPO_ROOT, '.env.example')),
    'expected .env to exist when .env.example is present');
});

test('--init-env-only stderr contains [setup] prefix', () => {
  const result = spawnSync('node', [SCRIPT, '--init-env-only'], {
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  assert.ok(result.stderr.includes('[setup]'),
    `expected [setup] log prefix; got stderr=${result.stderr}`);
});

console.log(`\nResults: Passed: ${passed}, Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
