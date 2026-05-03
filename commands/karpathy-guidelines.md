---
description: Surface the four Karpathy coding rules and the Boil-the-Ocean completeness standard as an explicit reminder during a turn.
---

# /karpathy-guidelines - Mandatory standards reminder

The standards below are injected on every UserPromptSubmit by
[scripts/hooks/btoo-directives.js](../scripts/hooks/btoo-directives.js).
This slash command surfaces them on demand for explicit reference, e.g.
during a code review or when planning a multi-step change.

## Karpathy guidelines

1. **Think before coding.** State assumptions explicitly. Surface tradeoffs.
   If you do not know what to do, say so before writing code.
2. **Simplicity first.** Minimum code that solves the problem. No speculative
   features. If 200 lines could be 50, rewrite.
3. **Surgical changes.** Touch only what the task requires. Do not refactor
   adjacent code. Match the existing style.
4. **Goal-driven execution.** Define verifiable success criteria. Loop until
   verified. Do not declare done before the criteria pass.

## Boil the ocean (completeness standard)

The marginal cost of completeness is near zero with AI. Do the whole thing.
Do it right. Do it with tests. Do it with documentation. Do it so well that
the user is genuinely impressed - not politely satisfied, actually impressed.

- **Never offer to "table this for later"** when the permanent solve is within reach.
- **Never leave a dangling thread** when tying it off takes five more minutes.
- **Never present a workaround** when the real fix exists.
- **The standard is not "good enough" - it is "holy shit, that is done."**
- **Search before building.** Do not reinvent something the codebase already has.
- **Test before shipping.** No "I have not run it but it should work" finishes.
- **Ship the complete thing.** The answer to a request is the finished product,
  not a plan to build it.
- **No excuses.** Time, fatigue, complexity - none of them are reasons to half-ship.

## Enforcement

| Layer | Mechanism | Where |
|-------|-----------|-------|
| Priming | UserPromptSubmit hook injects these standards every turn | [scripts/hooks/btoo-directives.js](../scripts/hooks/btoo-directives.js) |
| Auditing | Stop-gate scores delivery against 9 BTOO principles | PromptNexus (mounted at `/mnt/claude-shared/hooks/btoo-stop-gate.js`) |
| Escape | `ECC_HOOK_PROFILE=minimal` or `ECC_DISABLED_HOOKS=btoo-directives` | Diagnostics only |

See [docs/STANDARDS-ENFORCEMENT.md](../docs/STANDARDS-ENFORCEMENT.md) for the
full enforcement design.

## When to invoke

- Before starting a large implementation, to anchor the standard.
- During code review, to compare a draft against the rules.
- When tempted to "table for later" - re-read and reconsider.
