/**
 * Tests for the devcontainer-environment validator inside session-start.js.
 *
 * Run with: node tests/hooks/session-start-devcontainer.test.js
 *
 * The validator is gated by ECC_DEVCONTAINER_VALIDATION=true. When the gate is
 * off (as in harness-on-harness work) it MUST be a no-op. When the gate is on
 * AND the environment is misconfigured, it MUST emit a banner inside
 * additionalContext and still exit 0.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const SCRIPT_PATH = path.join(__dirname, '..', '..', 'scripts', 'hooks', 'session-start.js');

function runScript(scriptPath, env = {}) {
  return new Promise((resolve, reject) => {
    // Replace the entire env so caller-supplied vars are not contaminated by
    // the parent process's container envs (this test file is itself often run
    // inside the devcontainer).
    const proc = spawn('node', [scriptPath], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => (stdout += d));
    proc.stderr.on('data', d => (stderr += d));
    proc.stdin.end();
    proc.on('close', code => resolve({ code, stdout, stderr }));
    proc.on('error', reject);
  });
}

function getAdditionalContext(stdout) {
  assert.ok(stdout.trim(), 'Expected hook to emit stdout payload');
  const payload = JSON.parse(stdout);
  assert.strictEqual(payload.hookSpecificOutput?.hookEventName, 'SessionStart');
  return String(payload.hookSpecificOutput?.additionalContext || '');
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

async function runTests() {
  console.log('\n=== session-start.js devcontainer validator ===\n');

  const isoHome = path.join(os.tmpdir(), `ecc-devc-validator-${Date.now()}`);
  fs.mkdirSync(path.join(isoHome, '.claude', 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(isoHome, '.claude', 'skills', 'learned'), { recursive: true });

  let passed = 0;
  let failed = 0;

  if (
    await asyncTest('no-op when ECC_DEVCONTAINER_VALIDATION is unset', async () => {
      const result = await runScript(SCRIPT_PATH, { HOME: isoHome, USERPROFILE: isoHome });
      assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
      const ctx = getAdditionalContext(result.stdout);
      assert.ok(
        !ctx.includes('Devcontainer environment check'),
        'Banner should NOT appear when validation flag is off'
      );
    })
  ) passed++; else failed++;

  if (
    await asyncTest('no-op when ECC_DEVCONTAINER_VALIDATION=false', async () => {
      const result = await runScript(SCRIPT_PATH, {
        HOME: isoHome,
        USERPROFILE: isoHome,
        ECC_DEVCONTAINER_VALIDATION: 'false'
      });
      assert.strictEqual(result.code, 0);
      const ctx = getAdditionalContext(result.stdout);
      assert.ok(!ctx.includes('Devcontainer environment check'));
    })
  ) passed++; else failed++;

  if (
    await asyncTest('emits banner when validation enabled and env is misconfigured', async () => {
      // Force a guaranteed failure: HARNESS_TARGET_NAME unset, no XDG match, etc.
      const result = await runScript(SCRIPT_PATH, {
        HOME: isoHome,
        USERPROFILE: isoHome,
        ECC_DEVCONTAINER_VALIDATION: 'true',
        // Deliberately NOT setting HARNESS_TARGET_NAME, XDG_CONFIG_HOME, etc.
      });
      assert.strictEqual(result.code, 0, 'Hook must always exit 0 even with failures');
      const ctx = getAdditionalContext(result.stdout);
      assert.ok(
        ctx.includes('Devcontainer environment check'),
        'Banner heading should appear when validation enabled and env broken'
      );
      assert.ok(
        ctx.includes('HARNESS_TARGET_NAME') || ctx.includes('XDG_CONFIG_HOME'),
        'Banner should list at least one specific failure'
      );
    })
  ) passed++; else failed++;

  if (
    await asyncTest('logs validator activity to stderr', async () => {
      const result = await runScript(SCRIPT_PATH, {
        HOME: isoHome,
        USERPROFILE: isoHome,
        ECC_DEVCONTAINER_VALIDATION: 'true'
      });
      assert.ok(
        /\[SessionStart\] Devcontainer (environment validated|validation reported)/.test(result.stderr),
        `Stderr should mention devcontainer validation. Got: ${result.stderr.slice(0, 400)}`
      );
    })
  ) passed++; else failed++;

  fs.rmSync(isoHome, { recursive: true, force: true });

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
