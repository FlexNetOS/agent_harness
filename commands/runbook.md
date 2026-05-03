---
description: "Open and follow the canonical clone-to-new-project runbook. Use at the start of any fresh agent_harness bootstrap."
argument-hint: "[runbook-name | default: clone-to-new-project]"
---

# /runbook

Open the canonical runbook for bootstrapping a new project from a clean `agent_harness` clone, and walk the user through it phase by phase.

## When to use

- A fresh clone of `agent_harness` has just opened in a devcontainer.
- The user wants to bootstrap a new project (e.g. a Prompt Bot/Agent) and has not yet run `/harness-audit`.
- A teammate is onboarding and asked "where do I start?"

## What this command does

1. Reads the runbook at `docs/RUNBOOKS/clone-to-new-project.md` (default — override via the argument).
2. Confirms the user is in a devcontainer and that postCreate.sh exited 0.
3. Walks the runbook phase-by-phase, **stopping at the §Phase 2 gate** (`/harness-audit`) and refusing to continue if the audit is not green.
4. After the audit gate, drives the PRP chain (`/prp-prd → /prp-plan → /prp-implement → /quality-gate → /prp-commit → /prp-pr`) one step at a time, pausing for user confirmation between phases.
5. On any failure mode F1–F9 listed in the runbook, applies the documented one-line recovery and re-tries the failed step.

## Arguments

- `clone-to-new-project` (default) — The bootstrap runbook authored from `docs/specs/clone-to-new-project.spec.md`.
- Any other name → read `docs/RUNBOOKS/<name>.md` and follow the same protocol.

## Inputs the command will ask for

- **One-line project vision** (passed to `/prp-prd`). Example: *"Build a Prompt Bot/Agent that takes a user prompt, applies one transformation, returns the output, and ships with one test."*
- **Project directory** (default `projects/<slug>/`).
- **Hook profile override** (optional — if the user has chosen `minimal` or `strict` instead of the default `standard`).

## Acceptance for "/runbook complete"

- `/harness-audit` is green at the §Phase 2 gate.
- A PRD file exists at `projects/<slug>/project.prd.md`.
- An implementation plan exists at `projects/<slug>/project-impl-plan.md`.
- Phase 1 of the plan has been implemented, gated, committed, and opened as a PR.
- The end-of-bootstrap verification checklist in the runbook is fully checked.

## Failure handling

If a step fails, look up the failure ID (F1–F9) in `docs/RUNBOOKS/clone-to-new-project.md` § Failure Recovery. Apply the one-line fix. If the failure is **not** documented, stop, surface the symptom to the user, and propose adding it to the runbook (do not invent an undocumented workaround on the happy path).

## See also

- Spec: [docs/specs/clone-to-new-project.spec.md](../docs/specs/clone-to-new-project.spec.md)
- Runbook: [docs/RUNBOOKS/clone-to-new-project.md](../docs/RUNBOOKS/clone-to-new-project.md)
- Related commands: `/harness-audit`, `/prp-prd`, `/prp-plan`, `/prp-implement`, `/quality-gate`, `/prp-commit`, `/prp-pr`, `/learn`, `/promote`
