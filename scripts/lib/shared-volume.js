#!/usr/bin/env node
/**
 * Shared-volume populator for cross-container Claude state.
 *
 * The cloud session uses a docker named volume mounted at /mnt/claude-shared
 * so PromptNexus hooks, the verdict schema, and shared commands persist
 * across containers (and live on the WSL2 .vhdx disk on Windows hosts).
 *
 * This module copies the canonical PromptNexus assets into that volume on
 * first boot. It is idempotent: if the volume already contains the marker
 * file, it is a no-op. If no source clone is reachable, it warns and exits
 * cleanly — the rest of the boot proceeds with the Stop-gate inactive.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MARKER_REL = path.join('hooks', 'btoo-stop-gate.js');

const ASSETS_TO_COPY = [
  { type: 'dir',  rel: 'hooks' },
  { type: 'file', rel: path.join('evals', 'verdict.schema.json') },
  { type: 'dir',  rel: 'commands' },
  { type: 'dir',  rel: 'evals/principles' }
];

function defaultSourceCandidates() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [];

  if (process.env.PROMPT_NEXUS_PATH && process.env.PROMPT_NEXUS_PATH.trim()) {
    candidates.push(process.env.PROMPT_NEXUS_PATH.trim());
  }
  candidates.push('/workspaces/prompt_hub/prompt-nexus');
  candidates.push('/workspaces/prompt-nexus');
  if (home) {
    candidates.push(path.join(home, 'AI-Workspace', '_projects', 'prompt_hub', 'prompt-nexus'));
    candidates.push(path.join(home, 'AI-Workspace', '_projects', 'prompt-nexus'));
  }
  return candidates.filter(Boolean);
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      count += 1;
    }
  }
  return count;
}

/**
 * Populate the shared volume from a PromptNexus clone.
 *
 * @param {object} [opts]
 * @param {string} [opts.targetDir] Mount path; default /mnt/claude-shared,
 *                                  overridable via CLAUDE_SHARED_VOLUME_DIR.
 * @param {string[]} [opts.sources] Candidate source dirs (priority order).
 * @param {function} [opts.log]     Logger; defaults to stderr write.
 * @param {string} [opts.logPrefix='[shared-volume]']
 * @returns {{status:'populated'|'already-populated'|'no-source'|'error',
 *           target:string, source?:string, files?:number, detail?:string}}
 */
function populateSharedVolume(opts = {}) {
  const log = typeof opts.log === 'function'
    ? opts.log
    : (msg) => process.stderr.write(`${msg}\n`);
  const logPrefix = typeof opts.logPrefix === 'string' && opts.logPrefix
    ? opts.logPrefix
    : '[shared-volume]';

  const targetDir = opts.targetDir
    || process.env.CLAUDE_SHARED_VOLUME_DIR
    || '/mnt/claude-shared';

  if (fs.existsSync(path.join(targetDir, MARKER_REL))) {
    return { status: 'already-populated', target: targetDir };
  }

  const candidates = Array.isArray(opts.sources) && opts.sources.length > 0
    ? opts.sources
    : defaultSourceCandidates();

  const source = candidates.find(c => {
    try { return fs.existsSync(path.join(c, MARKER_REL)); }
    catch { return false; }
  });

  if (!source) {
    log(`${logPrefix} PromptNexus not found in any of: ${candidates.join(', ')}; Stop-gate will be inactive`);
    return { status: 'no-source', target: targetDir, detail: candidates.join(', ') };
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    let files = 0;
    for (const asset of ASSETS_TO_COPY) {
      const srcPath = path.join(source, asset.rel);
      const destPath = path.join(targetDir, asset.rel);
      if (!fs.existsSync(srcPath)) continue;
      if (asset.type === 'dir') {
        files += copyDirRecursive(srcPath, destPath);
      } else {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
        files += 1;
      }
    }
    log(`${logPrefix} populated ${targetDir} from ${source} (${files} files)`);
    return { status: 'populated', target: targetDir, source, files };
  } catch (err) {
    log(`${logPrefix} populate failed: ${err.message}`);
    return { status: 'error', target: targetDir, source, detail: err.message };
  }
}

/**
 * Cheap check used by the directives hook to report Stop-gate availability.
 *
 * @param {string} [targetDir]
 * @returns {boolean}
 */
function isSharedVolumePopulated(targetDir) {
  const dir = targetDir
    || process.env.CLAUDE_SHARED_VOLUME_DIR
    || '/mnt/claude-shared';
  try {
    return fs.existsSync(path.join(dir, MARKER_REL));
  } catch {
    return false;
  }
}

module.exports = {
  populateSharedVolume,
  isSharedVolumePopulated,
  defaultSourceCandidates,
  MARKER_REL,
  ASSETS_TO_COPY
};
