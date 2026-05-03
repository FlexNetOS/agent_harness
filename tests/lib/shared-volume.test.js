/**
 * Tests for scripts/lib/shared-volume.js
 *
 * Run with: node tests/lib/shared-volume.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  populateSharedVolume,
  isSharedVolumePopulated,
  defaultSourceCandidates,
  MARKER_REL
} = require('../../scripts/lib/shared-volume');

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

function buildSyntheticPromptNexus(root) {
  fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'hooks', 'btoo-stop-gate.js'),
    '// synthetic stop gate\nmodule.exports = {};\n');
  fs.writeFileSync(path.join(root, 'hooks', 'prompt-listener.js'),
    '// synthetic listener\nmodule.exports = {};\n');
  fs.mkdirSync(path.join(root, 'evals'), { recursive: true });
  fs.writeFileSync(path.join(root, 'evals', 'verdict.schema.json'),
    JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#' }));
  fs.mkdirSync(path.join(root, 'commands'), { recursive: true });
  fs.writeFileSync(path.join(root, 'commands', 'btoo-check.md'),
    '# btoo-check\nsynthetic command\n');
}

function cleanup(...dirs) {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); }
    catch { /* ignore */ }
  }
}

console.log('\n=== Testing scripts/lib/shared-volume.js ===\n');

test('MARKER_REL is the stop-gate path', () => {
  assert.strictEqual(MARKER_REL, path.join('hooks', 'btoo-stop-gate.js'));
});

test('defaultSourceCandidates returns string array including standard paths', () => {
  const candidates = defaultSourceCandidates();
  assert.ok(Array.isArray(candidates));
  assert.ok(candidates.length >= 2);
  assert.ok(candidates.every(c => typeof c === 'string'));
  assert.ok(candidates.some(c => c.includes('prompt')));
});

test('PROMPT_NEXUS_PATH overrides at the front of the list', () => {
  const original = process.env.PROMPT_NEXUS_PATH;
  try {
    process.env.PROMPT_NEXUS_PATH = '/explicit/override/path';
    const candidates = defaultSourceCandidates();
    assert.strictEqual(candidates[0], '/explicit/override/path');
  } finally {
    if (original === undefined) delete process.env.PROMPT_NEXUS_PATH;
    else process.env.PROMPT_NEXUS_PATH = original;
  }
});

test('isSharedVolumePopulated returns false when marker missing', () => {
  const empty = mktemp('shvol-empty-');
  try {
    assert.strictEqual(isSharedVolumePopulated(empty), false);
  } finally { cleanup(empty); }
});

test('isSharedVolumePopulated returns true when marker exists', () => {
  const populated = mktemp('shvol-pop-');
  try {
    fs.mkdirSync(path.join(populated, 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(populated, 'hooks', 'btoo-stop-gate.js'), '// stub');
    assert.strictEqual(isSharedVolumePopulated(populated), true);
  } finally { cleanup(populated); }
});

test('populateSharedVolume copies hooks + schema from source', () => {
  const source = mktemp('shvol-src-');
  const target = mktemp('shvol-tgt-');
  try {
    cleanup(target);  // ensure target absent so populate creates it
    buildSyntheticPromptNexus(source);
    const result = populateSharedVolume({
      targetDir: target,
      sources: [source],
      log: () => {}
    });
    assert.strictEqual(result.status, 'populated');
    assert.strictEqual(result.target, target);
    assert.strictEqual(result.source, source);
    assert.ok(result.files >= 3);
    assert.ok(fs.existsSync(path.join(target, 'hooks', 'btoo-stop-gate.js')));
    assert.ok(fs.existsSync(path.join(target, 'hooks', 'prompt-listener.js')));
    assert.ok(fs.existsSync(path.join(target, 'evals', 'verdict.schema.json')));
    assert.ok(fs.existsSync(path.join(target, 'commands', 'btoo-check.md')));
  } finally { cleanup(source, target); }
});

test('populateSharedVolume is idempotent (already-populated)', () => {
  const source = mktemp('shvol-src-');
  const target = mktemp('shvol-tgt-');
  try {
    buildSyntheticPromptNexus(source);
    cleanup(target);
    populateSharedVolume({ targetDir: target, sources: [source], log: () => {} });
    // Second call should short-circuit
    const second = populateSharedVolume({
      targetDir: target,
      sources: [source],
      log: () => {}
    });
    assert.strictEqual(second.status, 'already-populated');
  } finally { cleanup(source, target); }
});

test('populateSharedVolume returns no-source when nothing reachable', () => {
  const target = mktemp('shvol-tgt-');
  try {
    cleanup(target);
    const result = populateSharedVolume({
      targetDir: target,
      sources: ['/definitely/does/not/exist-XYZ'],
      log: () => {}
    });
    assert.strictEqual(result.status, 'no-source');
  } finally { cleanup(target); }
});

test('populateSharedVolume picks first reachable source from list', () => {
  const goodSource = mktemp('shvol-good-');
  const target = mktemp('shvol-tgt-');
  try {
    cleanup(target);
    buildSyntheticPromptNexus(goodSource);
    const result = populateSharedVolume({
      targetDir: target,
      sources: ['/no/such/path', goodSource],
      log: () => {}
    });
    assert.strictEqual(result.status, 'populated');
    assert.strictEqual(result.source, goodSource);
  } finally { cleanup(goodSource, target); }
});

console.log(`\nResults: Passed: ${passed}, Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
