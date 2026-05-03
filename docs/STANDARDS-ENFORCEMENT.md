# Standards Enforcement

agent_harness enforces two coding standards on every turn through a two-tier hook
architecture: **priming at the start of the turn**, **auditing at Stop**.

## Two-tier architecture

```
                                  +------------------------+
  user prompt --->  UserPromptSubmit --->  Claude composes --->  Stop event
                          |                  response                |
                          v                                          v
                  btoo-directives                            PromptNexus
                  (this repo)                                btoo-stop-gate
                  primes Claude                              audits delivery
                  with standards                             via Haiku-flagged
                                                             model
```

| Layer | Hook | Repo of record | Mode |
|-------|------|----------------|------|
| 1. Prime | [scripts/hooks/btoo-directives.js](../scripts/hooks/btoo-directives.js) | agent_harness (this) | UserPromptSubmit |
| 2. Audit | `btoo-stop-gate.js` | PromptNexus, mounted at `/mnt/claude-shared/hooks/` | Stop |

The priming layer makes every turn start with the standards in
`additionalContext`, so Claude composes its response while already aware of
them. The auditing layer then scores the produced delivery against nine
deterministic principles; verdicts land in `evals/verdicts/<turn>.json` on the
shared volume.

## What gets injected

Every UserPromptSubmit hook fire produces a JSON payload of this shape:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "...Karpathy + Boil-the-Ocean text + Stop-gate state..."
  }
}
```

Contents:

1. **Karpathy guidelines** (4 rules): think-before-coding, simplicity-first,
   surgical-changes, goal-driven-execution.
2. **Boil the Ocean** completeness standard (8 rules), verbatim from the
   user's canonical phrasing.
3. **Stop-gate availability** line — `active` if `/mnt/claude-shared/hooks/btoo-stop-gate.js`
   exists, `inactive` otherwise. Makes enforcement state visible to Claude.

The slash command [/karpathy-guidelines](../commands/karpathy-guidelines.md)
surfaces the same content on demand.

## Configuration knobs

| Var | Effect |
|-----|--------|
| `ECC_HOOK_PROFILE=minimal` | Disables priming. Stop-gate (PromptNexus) is unaffected. |
| `ECC_HOOK_PROFILE=standard` | Default. Priming active. |
| `ECC_HOOK_PROFILE=strict` | Priming active (same as standard). |
| `ECC_DISABLED_HOOKS=btoo-directives` | Disables priming regardless of profile. |
| `CLAUDE_SHARED_VOLUME_DIR` | Override `/mnt/claude-shared` mount path. |
| `PROMPT_NEXUS_PATH` | Override the source clone for first-boot population. |

## How priming wires up

[hooks/hooks.json](../hooks/hooks.json) registers a UserPromptSubmit entry that
calls the standard ECC plugin-root bootstrap, then `run-with-flags.js`:

```
node -e "<plugin-root resolver>" node scripts/hooks/run-with-flags.js \
  user-prompt-submit:btoo-directives \
  scripts/hooks/btoo-directives.js \
  standard,strict
```

`run-with-flags.js` checks profile/disable flags, then `require()`s
`btoo-directives.js` and calls its exported `run()` for the fast path (no
extra Node spawn).

## How auditing wires up

The Stop-gate runs out-of-process. PromptNexus owns the user-level
`UserPromptSubmit` and `Stop` listeners in `~/.claude/settings.json`. Those
listeners consult its `btoo-stop-gate.js` and write a verdict to
`/mnt/claude-shared/evals/verdicts/<ISO-turn>.json`. agent_harness does not
touch that path; it is a consumer.

If the shared volume is empty (e.g., a cloud session without prompt_hub
adjacent), the Stop-gate is inactive and priming says so explicitly so the
model is not under the false impression an audit will catch lapses.

## Verifying it works

```sh
# Priming smoke test
echo '{}' | node scripts/hooks/run-with-flags.js \
  user-prompt-submit:btoo-directives \
  scripts/hooks/btoo-directives.js
# Expected: JSON containing "Karpathy" and "Boil the ocean"

# With minimal profile -> no-op
echo '{}' | ECC_HOOK_PROFILE=minimal node scripts/hooks/run-with-flags.js \
  user-prompt-submit:btoo-directives \
  scripts/hooks/btoo-directives.js
# Expected: stdout = '{}' (raw passthrough)

# Disabled
echo '{}' | ECC_DISABLED_HOOKS=user-prompt-submit:btoo-directives \
  node scripts/hooks/run-with-flags.js \
  user-prompt-submit:btoo-directives \
  scripts/hooks/btoo-directives.js
# Expected: stdout = '{}' (raw passthrough)
```

Tests covering the same: [tests/hooks/btoo-directives.test.js](../tests/hooks/btoo-directives.test.js).

## Why this design

- **No vendored Stop-gate.** PromptNexus is canonical; duplicating it would
  create drift. Cross-container sharing solves the access problem.
- **Priming is cheap.** UserPromptSubmit on a `run()`-export hook is one
  `require()` plus JSON serialization — well under 50ms.
- **Visibility over silence.** When the audit loop is unavailable, we tell
  Claude rather than letting half-shipped work slip through unnoticed.

See [docs/CONTAINER-PERSISTENCE.md](CONTAINER-PERSISTENCE.md) for how the
shared volume is provisioned.
