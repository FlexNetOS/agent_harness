#!/usr/bin/env node
/**
 * Assert every agent in agents/ uses a pinned Claude 4.X model ID
 * (per ADR 0001). The validator at scripts/ci/validate-agents.js still
 * accepts legacy aliases for backward-compat, but first-party agents must
 * be on pinned IDs for reproducibility.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const AGENTS_DIR = path.join(repoRoot, 'agents');

const PINNED_4X_IDS = new Set([
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]);

function extractModel(content) {
  const fmMatch = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!fmMatch) return null;
  const m = fmMatch[2].match(/^[ \t]*model:[ \t]*([^\r\n#]+?)[ \t]*(?:#.*)?$/m);
  return m ? m[1].trim() : null;
}

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

function run() {
  console.log('\n=== Validating all agents pin Claude 4.X model IDs (ADR 0001) ===\n');

  let passed = 0;
  let failed = 0;

  if (test('agents/ directory exists', () => {
    assert.ok(fs.existsSync(AGENTS_DIR), 'agents/ missing');
  })) passed++; else failed++;

  const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'));

  if (test(`agents/ has at least one .md file (found ${files.length})`, () => {
    assert.ok(files.length > 0);
  })) passed++; else failed++;

  for (const file of files) {
    if (test(`${file} uses a pinned Claude 4.X model ID`, () => {
      const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
      const model = extractModel(content);
      assert.ok(model, `${file}: missing model field`);
      assert.ok(
        PINNED_4X_IDS.has(model),
        `${file}: model='${model}' is not pinned (must be one of: ${[...PINNED_4X_IDS].join(', ')})`
      );
    })) passed++; else failed++;
  }

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

run();
