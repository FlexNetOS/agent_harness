'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'orchestrate-codex-worker.sh');
const RM_RETRY_OPTIONS = { recursive: true, force: true, maxRetries: 30, retryDelay: 100 };
const CLEANUP_RETRY_ATTEMPTS = 30;
const CLEANUP_RETRY_DELAY_MS = 100;

function resolveBash() {
  if (process.env.ECC_TEST_BASH) return process.env.ECC_TEST_BASH;

  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe'
    ];
    const gitBash = candidates.find(candidate => fs.existsSync(candidate));
    if (gitBash) return gitBash;
  }

  return 'bash';
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeTempRoot(tempRoot) {
  let lastError;

  for (let attempt = 0; attempt < CLEANUP_RETRY_ATTEMPTS; attempt++) {
    try {
      fs.rmSync(tempRoot, RM_RETRY_OPTIONS);
      return;
    } catch (error) {
      lastError = error;
      sleepSync(CLEANUP_RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

console.log('=== Testing orchestrate-codex-worker.sh ===\n');

let passed = 0;
let failed = 0;
const BASH = resolveBash();

function test(desc, fn) {
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${desc}: ${error.message}`);
    failed++;
  }
}

test('fails fast for an unreadable task file and records failure artifacts', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-orch-worker-'));
  const handoffFile = path.join(tempRoot, '.orchestration', 'docs', 'handoff.md');
  const statusFile = path.join(tempRoot, '.orchestration', 'docs', 'status.md');
  const missingTaskFile = path.join(tempRoot, '.orchestration', 'docs', 'task.md');

  try {
    spawnSync('git', ['init'], { cwd: tempRoot, stdio: 'ignore' });

    const result = spawnSync(BASH, [SCRIPT, missingTaskFile, handoffFile, statusFile], {
      cwd: tempRoot,
      encoding: 'utf8'
    });

    assert.notStrictEqual(result.status, 0, 'Script should fail when task file is unreadable');
    assert.ok(fs.existsSync(statusFile), 'Script should still write a status file');
    assert.ok(fs.existsSync(handoffFile), 'Script should still write a handoff file');

    const statusContent = fs.readFileSync(statusFile, 'utf8');
    const handoffContent = fs.readFileSync(handoffFile, 'utf8');

    assert.ok(statusContent.includes('- State: failed'), 'Status file should record the failure state');
    assert.ok(
      statusContent.includes('task file is missing or unreadable'),
      'Status file should explain the task-file failure'
    );
    assert.ok(
      handoffContent.includes('Task file is missing or unreadable'),
      'Handoff file should explain the task-file failure'
    );
  } finally {
    removeTempRoot(tempRoot);
  }
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
