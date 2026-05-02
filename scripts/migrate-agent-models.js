#!/usr/bin/env node
/**
 * Migrate agent frontmatter `model` fields from legacy aliases to pinned Claude 4.X IDs.
 *
 * Mapping (per ADR 0001):
 *   model: opus    -> model: claude-opus-4-7
 *   model: sonnet  -> model: claude-sonnet-4-6
 *   model: haiku   -> model: claude-haiku-4-5-20251001
 *
 * Idempotent: re-running on already-migrated files is a no-op.
 *
 * Flags:
 *   --dry-run     show planned changes without writing
 *   --json        emit machine-readable summary
 *   --revert      reverse-map pinned IDs back to aliases (for rollback)
 *
 * Exits non-zero if any file has an unrecognized model value.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.resolve(__dirname, '..', 'agents');
const ARGS = new Set(process.argv.slice(2));

const FORWARD = {
  opus: 'claude-opus-4-7',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
};
const REVERSE = Object.fromEntries(Object.entries(FORWARD).map(([a, b]) => [b, a]));
const MAP = ARGS.has('--revert') ? REVERSE : FORWARD;
const DIRECTION = ARGS.has('--revert') ? 'revert' : 'forward';

const KNOWN_VALUES = new Set([
  ...Object.keys(FORWARD),
  ...Object.values(FORWARD),
]);

function migrateContent(content) {
  // Match `model:` line in YAML frontmatter only (between first two --- lines).
  // Use a single regex anchored to the frontmatter block to avoid touching body text.
  const fmMatch = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!fmMatch) return { changed: false, content, reason: 'no-frontmatter' };

  const [, head, body, tail] = fmMatch;
  const modelMatch = body.match(/^([ \t]*model:[ \t]*)([^\r\n#]+?)([ \t]*(?:#.*)?)$/m);
  if (!modelMatch) return { changed: false, content, reason: 'no-model-field' };

  const [fullLine, prefix, value, suffix] = modelMatch;
  const trimmed = value.trim();

  if (!KNOWN_VALUES.has(trimmed)) {
    return { changed: false, content, reason: `unknown-model:${trimmed}` };
  }

  const target = MAP[trimmed];
  if (!target) {
    // Already in the target form, no change needed
    return { changed: false, content, reason: 'already-migrated', from: trimmed, to: trimmed };
  }

  const newLine = `${prefix}${target}${suffix}`;
  const newBody = body.replace(fullLine, newLine);
  const newContent = head + newBody + tail + content.slice(fmMatch[0].length);
  return { changed: true, content: newContent, from: trimmed, to: target };
}

function listAgentFiles() {
  return fs.readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(AGENTS_DIR, f));
}

function main() {
  if (!fs.existsSync(AGENTS_DIR)) {
    console.error(`agents/ directory not found at ${AGENTS_DIR}`);
    process.exit(1);
  }

  const files = listAgentFiles();
  const dryRun = ARGS.has('--dry-run');
  const summary = { direction: DIRECTION, total: files.length, changed: [], unchanged: [], unknown: [] };

  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (e) {
      summary.unknown.push({ file: path.basename(file), reason: e.message });
      continue;
    }
    const r = migrateContent(content);
    const rel = path.basename(file);

    if (r.changed) {
      summary.changed.push({ file: rel, from: r.from, to: r.to });
      if (!dryRun) fs.writeFileSync(file, r.content, 'utf8');
    } else if (r.reason && r.reason.startsWith('unknown-model')) {
      summary.unknown.push({ file: rel, reason: r.reason });
    } else {
      summary.unchanged.push({ file: rel, reason: r.reason });
    }
  }

  if (ARGS.has('--json')) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`migrate-agent-models (${DIRECTION}${dryRun ? ', dry-run' : ''})`);
    console.log(`  scanned:   ${summary.total}`);
    console.log(`  changed:   ${summary.changed.length}${dryRun ? ' (would change)' : ''}`);
    console.log(`  unchanged: ${summary.unchanged.length}`);
    console.log(`  unknown:   ${summary.unknown.length}`);
    if (summary.changed.length > 0) {
      console.log('\nChanges:');
      for (const c of summary.changed) {
        console.log(`  ${c.file}: ${c.from} -> ${c.to}`);
      }
    }
    if (summary.unknown.length > 0) {
      console.log('\nUnknown model values (manual review needed):');
      for (const u of summary.unknown) console.log(`  ${u.file}: ${u.reason}`);
    }
  }

  process.exit(summary.unknown.length > 0 ? 1 : 0);
}

main();
