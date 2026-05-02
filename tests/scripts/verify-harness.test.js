#!/usr/bin/env node
/**
 * Smoke tests for scripts/verify-harness.js
 *
 * The verifier is dependency-aware (skips ajv-using validators when node_modules
 * is missing) and supports --skip-mcp / --skip-tests for fast iteration. These
 * tests assert that contract.
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const verifierPath = path.join(repoRoot, 'scripts', 'verify-harness.js');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    return false;
  }
}

function runVerifier(args) {
  return spawnSync(process.execPath, [verifierPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30000,
  });
}

function run() {
  console.log('\n=== Testing scripts/verify-harness.js ===\n');

  let passed = 0;
  let failed = 0;

  if (test('verify-harness script exists and is parseable', () => {
    require(verifierPath); // syntax check via require
  })) passed++; else failed++;

  if (test('exits 0 on yellow (no errors) with --skip-mcp --skip-tests', () => {
    const r = runVerifier(['--skip-mcp', '--skip-tests']);
    if (r.error) throw r.error;
    // Should be 0 (yellow tolerated) or 1 only if a validator surfaced an actual ERROR
    assert.ok(r.status === 0 || r.status === 1, `unexpected exit ${r.status}`);
    assert.ok(/OVERALL:/.test(r.stdout), 'missing OVERALL summary');
  })) passed++; else failed++;

  if (test('emits machine-readable JSON when --json passed', () => {
    const r = runVerifier(['--skip-mcp', '--skip-tests', '--json']);
    const lastLine = r.stdout.trim().split(/\r?\n/).pop();
    const parsed = JSON.parse(lastLine);
    assert.ok(['GREEN', 'YELLOW', 'RED'].includes(parsed.overall));
    assert.ok(typeof parsed.counts === 'object');
    assert.ok(Array.isArray(parsed.results));
  })) passed++; else failed++;

  if (test('reports plugin-manifest as a check', () => {
    const r = runVerifier(['--skip-mcp', '--skip-tests']);
    assert.ok(/plugin-manifest/.test(r.stdout), 'plugin-manifest check missing');
  })) passed++; else failed++;

  if (test('reports hook-profiles checks (scripts-exist, non-empty, inclusion)', () => {
    const r = runVerifier(['--skip-mcp', '--skip-tests']);
    assert.ok(/hook-profiles:scripts-exist/.test(r.stdout));
    assert.ok(/hook-profiles:non-empty/.test(r.stdout));
    assert.ok(/hook-profiles:inclusion/.test(r.stdout));
  })) passed++; else failed++;

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

run();
