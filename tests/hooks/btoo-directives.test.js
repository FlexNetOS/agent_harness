/**
 * Tests for scripts/hooks/btoo-directives.js
 *
 * Validates the UserPromptSubmit injector both in-process (run() export) and
 * through the run-with-flags.js wrapper for end-to-end profile gating.
 *
 * Run with: node tests/hooks/btoo-directives.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = require('../../scripts/hooks/btoo-directives');
const RUN_WITH_FLAGS = path.join(__dirname, '..', '..', 'scripts', 'hooks', 'run-with-flags.js');

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

function runViaWrapper(extraEnv = {}, stdin = '{}') {
  const env = { ...process.env, ...extraEnv };
  // Strip vars unless the test sets them explicitly so a parent shell does
  // not bleed configuration into the child.
  if (!('ECC_HOOK_PROFILE' in extraEnv)) delete env.ECC_HOOK_PROFILE;
  if (!('ECC_DISABLED_HOOKS' in extraEnv)) delete env.ECC_DISABLED_HOOKS;

  const result = spawnSync('node', [
    RUN_WITH_FLAGS,
    'user-prompt-submit:btoo-directives',
    'scripts/hooks/btoo-directives.js',
    'standard,strict'
  ], {
    encoding: 'utf8',
    input: stdin,
    timeout: 10000,
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  return {
    code: result.status || 0,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

console.log('\n=== Testing scripts/hooks/btoo-directives.js ===\n');

console.log('Direct run():');

test('run() returns object with stdout and exitCode 0', () => {
  const out = HOOK.run('{}', { hookId: 'user-prompt-submit:btoo-directives' });
  assert.strictEqual(typeof out.stdout, 'string');
  assert.strictEqual(out.exitCode, 0);
});

test('run() output is valid JSON with hookSpecificOutput envelope', () => {
  const out = HOOK.run('{}', {});
  const parsed = JSON.parse(out.stdout);
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.strictEqual(typeof parsed.hookSpecificOutput.additionalContext, 'string');
});

test('additionalContext mentions Karpathy guidelines', () => {
  const out = HOOK.run('{}', {});
  const ctx = JSON.parse(out.stdout).hookSpecificOutput.additionalContext;
  assert.ok(/Karpathy guidelines/i.test(ctx), 'expected Karpathy guidelines block');
  assert.ok(/Surgical changes/i.test(ctx));
  assert.ok(/Goal-driven execution/i.test(ctx));
});

test('additionalContext mentions Boil the ocean and key phrases', () => {
  const out = HOOK.run('{}', {});
  const ctx = JSON.parse(out.stdout).hookSpecificOutput.additionalContext;
  assert.ok(/Boil the ocean/i.test(ctx));
  assert.ok(/holy shit/i.test(ctx));
  assert.ok(/Search before building/.test(ctx));
  assert.ok(/Test before shipping/.test(ctx));
});

test('additionalContext reports Stop-gate inactive when shared volume missing', () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'btoo-shvol-'));
  try {
    const ctx = HOOK.buildDirective({ sharedDir: tmpdir });
    assert.ok(/Stop-gate: inactive/.test(ctx));
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test('additionalContext reports Stop-gate active when marker present', () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'btoo-shvol-'));
  try {
    fs.mkdirSync(path.join(tmpdir, 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(tmpdir, 'hooks', 'btoo-stop-gate.js'), '// stub');
    const ctx = HOOK.buildDirective({ sharedDir: tmpdir });
    assert.ok(/Stop-gate: active/.test(ctx));
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

console.log('\nThrough run-with-flags.js:');

test('default profile (standard) injects directive JSON', () => {
  const result = runViaWrapper();
  assert.strictEqual(result.code, 0, `stderr=${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.ok(/Boil the ocean/i.test(parsed.hookSpecificOutput.additionalContext));
});

test('ECC_HOOK_PROFILE=minimal disables injection (raw passthrough)', () => {
  const result = runViaWrapper({ ECC_HOOK_PROFILE: 'minimal' });
  assert.strictEqual(result.code, 0);
  // Wrapper short-circuits and writes raw stdin back to stdout.
  assert.strictEqual(result.stdout, '{}');
});

test('ECC_DISABLED_HOOKS=user-prompt-submit:btoo-directives disables injection', () => {
  const result = runViaWrapper({
    ECC_DISABLED_HOOKS: 'user-prompt-submit:btoo-directives'
  });
  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.stdout, '{}');
});

test('ECC_HOOK_PROFILE=strict still injects', () => {
  const result = runViaWrapper({ ECC_HOOK_PROFILE: 'strict' });
  assert.strictEqual(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
});

console.log(`\nResults: Passed: ${passed}, Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
