#!/usr/bin/env node
/**
 * UserPromptSubmit hook: inject Karpathy guidelines + "Boil the Ocean"
 * completeness standard as additionalContext on every turn.
 *
 * The text is mandatory in spirit — it's the user's standing standard for
 * every turn. Profile-gated so it can be muted for diagnostics:
 *   ECC_HOOK_PROFILE=minimal      -> no-op pass-through
 *   ECC_HOOK_PROFILE=standard     -> inject (default)
 *   ECC_HOOK_PROFILE=strict       -> inject
 *   ECC_DISABLED_HOOKS=btoo-directives -> no-op
 *
 * Output shape: { hookSpecificOutput: { hookEventName: 'UserPromptSubmit',
 * additionalContext: '...' } }, matching the Claude Code harness contract
 * established by scripts/hooks/session-start.js.
 *
 * Stop-gate enforcement is owned by PromptNexus (Haiku-flagged auditor).
 * This hook reports its availability so the model knows whether the audit
 * loop is live.
 */

'use strict';

const path = require('path');

let isSharedVolumePopulated;
try {
  ({ isSharedVolumePopulated } = require('../lib/shared-volume'));
} catch {
  isSharedVolumePopulated = () => false;
}

const KARPATHY_BLOCK = [
  '### Karpathy guidelines (mandatory)',
  '- Think before coding: state assumptions explicitly; surface tradeoffs.',
  '- Simplicity first: minimum code that solves the problem; no speculative features.',
  '- Surgical changes: touch only what the task requires; do not refactor adjacent code.',
  '- Goal-driven execution: define verifiable success criteria; loop until verified.'
].join('\n');

const BTOO_BLOCK = [
  '### Boil the ocean (completeness standard, mandatory)',
  'The marginal cost of completeness is near zero with AI. Do the whole thing.',
  'Do it right. Do it with tests. Do it with documentation. Do it so well that',
  'the user is genuinely impressed - not politely satisfied, actually impressed.',
  '',
  '- Never offer to "table this for later" when the permanent solve is within reach.',
  '- Never leave a dangling thread when tying it off takes five more minutes.',
  '- Never present a workaround when the real fix exists.',
  '- The standard is not "good enough" - it is "holy shit, that is done."',
  '- Search before building. Test before shipping. Ship the complete thing.',
  '- The answer to a request is the finished product, not a plan to build it.',
  '- Time, fatigue, complexity - none are excuses. Boil the ocean.'
].join('\n');

function buildDirective(opts = {}) {
  const sharedDir = opts.sharedDir
    || process.env.CLAUDE_SHARED_VOLUME_DIR
    || '/mnt/claude-shared';
  const stopGateActive = isSharedVolumePopulated(sharedDir);
  const stopGateLine = stopGateActive
    ? `Stop-gate: active (PromptNexus auditor at ${path.posix.join(sharedDir, 'hooks/btoo-stop-gate.js')}).`
    : 'Stop-gate: inactive (no PromptNexus assets mounted; primer-only).';

  return [
    '## STANDARDS IN EFFECT',
    '',
    KARPATHY_BLOCK,
    '',
    BTOO_BLOCK,
    '',
    stopGateLine
  ].join('\n');
}

/**
 * Hook entry point. Called by run-with-flags.js when the hook is enabled.
 *
 * @param {string} _rawInput  Raw stdin (UserPromptSubmit event JSON; unused).
 * @param {object} _ctx       Runner context (unused).
 * @returns {{stdout:string, exitCode:number}}
 */
function run(_rawInput, _ctx) {
  const additionalContext = buildDirective();
  const payload = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext
    }
  };
  return { stdout: JSON.stringify(payload), exitCode: 0 };
}

module.exports = { run, buildDirective, KARPATHY_BLOCK, BTOO_BLOCK };

if (require.main === module) {
  // Allow direct invocation for smoke testing:
  //   node scripts/hooks/btoo-directives.js
  process.stdout.write(buildDirective() + '\n');
}
