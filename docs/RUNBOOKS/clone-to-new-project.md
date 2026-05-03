# Runbook — Clone agent_harness → New Prompt Bot/Agent Project

**Version:** 1.0
**Spec:** [docs/specs/clone-to-new-project.spec.md](../specs/clone-to-new-project.spec.md)
**Wall-clock target:** ≤ 90 seconds from `git clone` exit to `/harness-audit` green (warm host).
**First concrete use:** Bootstrap a Prompt Bot/Agent in `projects/prompt-bot/`.

This runbook is exact and self-contained. Read top to bottom on first run; use as a checklist after.
If a step fails, jump to **§ Failure Recovery** by failure ID (F1–F9).

---

## Pre-flight (host) — 1 step, ≤ 15 seconds of user time

**You need:** Docker Desktop running. VS Code with the **Dev Containers** extension. A GitHub identity with read access to `agent_harness` and push access to wherever the new project will live.

**You do NOT need:** A working host yarn/node/npm, a global `claude` CLI, or any other host-side tooling. The devcontainer is the canonical environment — your host does not have to be pristine.

### Step 0 — Clone and open

```bash
git clone <agent_harness-remote-url> agent_harness
cd agent_harness
code .
```

When VS Code prompts **"Reopen in Container,"** click it.

If you do not see the prompt: Command Palette (`Ctrl+Shift+P`) → **Dev Containers: Reopen in Container**.

---

## Phase 1 — Devcontainer boot (automated, ≤ 60 seconds warm)

**Nothing for you to type.** The container builds and `postCreate.sh` runs. Watch the **Dev Containers** terminal output.

**What is happening** (file references for §Reference):
- Image build from `mcr.microsoft.com/devcontainers/javascript-node:1-20-bookworm` plus `Dockerfile` additions (corepack, yarn 4.9.2, `@anthropic-ai/claude-code`, Playwright deps).
- Named volumes attach: `ecc-node-modules`, `ecc-yarn-cache`, `ecc-npm-cache`, `ecc-claude-state`. These persist across rebuilds — your `~/.claude` state and `node_modules` are preserved.
- Container env vars set automatically: `ECC_HOOK_PROFILE=standard`, `DEFAULT_BASE_BRANCH=main`, `SESSION_SCRIPT=./session-start.sh`, `CONFIG_FILE=./mcp-config.json`, `ENABLE_VERBOSE_LOGGING=false`.
- `postCreate.sh` runs: `yarn install --immutable` → MCP pre-warm of 6 npx servers (github, context7, exa, memory, playwright, sequential-thinking) → `npm run verify --skip-mcp`.

### Step 1 — Verify postCreate exited 0

In the **Dev Containers** terminal, scroll to the end of the postCreate stream. You should see, in order:

1. `✓ yarn install` (or equivalent — no red lines)
2. `✓ MCP pre-warm complete` (failures here are non-fatal — see F1 if a server stayed down)
3. `✓ npm run verify --skip-mcp` exit 0

> **First-build note:** The very first time you build on a host, image pull adds 2–5 minutes. That is **outside** the 90-second budget — it is a one-time cost. Subsequent rebuilds use the named volumes and hit the 60-second target.

If postCreate ended red → **F2** (Windows EACCES) or **F8** (cold cache).

---

## Phase 2 — Harness audit (the gate, ≤ 30 seconds)

Open Claude Code in the integrated terminal (or start a session in the IDE).

### Step 2 — Run the audit

```text
/harness-audit
```

**What "green" means:**
- All 6 MCP servers report healthy (`github`, `context7`, `exa`, `memory`, `playwright`, `sequential-thinking`).
- `ECC_HOOK_PROFILE` resolves to `standard`.
- `CLAUDE_PLUGIN_ROOT` points at the workspace plugin root, not a stale `~/.claude/plugins/` install.
- No hooks listed as "no-op (root not found)."

If any of those are red → **F3** (stale `CLAUDE_PLUGIN_ROOT`) or **F1** (an MCP server didn't pre-warm). Do not proceed past this gate until the audit is green.

### Step 3 — (Optional) Skill health snapshot

```text
/skill-health
```

Confirms the 189 skills are discoverable. If a skill you expect to use is missing, see **F6** (`agent.yaml` drift).

---

## Phase 3 — Project vision (PRD, ≤ 5 minutes user-driven)

You are now in a green harness. From here, the **PRP chain** is the named, default path. There is no `/scaffold` or `/new-project` command in this harness — the path is `/prp-prd → /prp-plan → /prp-implement → /prp-commit → /prp-pr`.

### Step 4 — Write the PRD

```text
/prp-prd "Build a Prompt Bot/Agent that <one-line vision>"
```

For our first concrete use, the vision is:

> **"Build a Prompt Bot/Agent that takes a user prompt, applies one transformation, returns the output, and ships with one test."**

Answer the interactive Q&A. Keep answers concise (this is a 5-minute step, not 50):

- **Problem:** What user pain does the bot solve? (one sentence)
- **Persona:** Who runs it — a developer at the CLI, a teammate in Slack, a scheduled job? (one persona, not three)
- **Primary metric:** How will you know it works? (one number — e.g., "round-trip latency under 2 seconds for the transformation")
- **Constraints:** Three at most — runtime, deps, deployment surface.

### Step 5 — Confirm PRD artifact

The command emits a PRD file. The runbook recommends pinning it to:

```
projects/prompt-bot/project.prd.md
```

If `/prp-prd` writes elsewhere, move/symlink it to that path so Phase 4 finds it deterministically. (Open question Q3 in the spec — pending resolution.)

**Acceptance:** The PRD has the seven canonical sections (problem, goals, non-goals, personas, user stories, requirements, success metrics).

---

## Phase 4 — Implementation plan (≤ 3 minutes)

### Step 6 — Generate the phased plan

```text
/prp-plan ./projects/prompt-bot/project.prd.md
```

The command reads the PRD, scans codebase patterns, and emits a phased implementation plan.

### Step 7 — Review the plan, split phases > 1 PR

Open the emitted file (typically `projects/prompt-bot/project-impl-plan.md`). Verify:

- Each phase has explicit **exit criteria** ("phase done when X tests pass and Y file exists").
- No phase is more than ~1 PR worth of work. If one is, split it manually before continuing — this avoids `/prp-implement` doing too much in one turn.
- At least one phase is tagged `phase: 1` (the entry point).

> **Escape hatch:** If the work clearly spans many sessions and many PRs (this is rare for a Prompt Bot but happens for larger agent projects), use `/blueprint "<objective>"` instead of `/prp-plan`. Blueprint writes a multi-PR plan to `plans/`. Out of scope for the happy path; documented in the spec under §8.

---

## Phase 5 — Implement, gate, commit, PR

### Step 8 — Run phase 1

```text
/prp-implement ./projects/prompt-bot/project-impl-plan.md
```

**Heads-up — expected and not a failure:** the **first Edit/Write per file** can invoke the `pre:edit-write:gateguard-fact-force` hook. The agent will pause and ask for context (importers, schema, user instruction). Provide it and continue. This is intentional — it suppresses "rewrite the whole file" behavior. If a step is truly cold-create (e.g., a generated file), see **F4**.

### Step 9 — Quality gate

```text
/quality-gate
```

This runs the harness's quality checks. Note that the **`stop:format-typecheck` hook batches Biome/Prettier + tsc at end-of-turn** (not inline) — so type errors surface here, not after each Edit. Treat its output as authoritative. See **F7**.

### Step 10 — Commit

```text
/prp-commit
```

Emits a conventional commit (`feat: …`) tied to the phase you just completed.

### Step 11 — Open the PR

```text
/prp-pr
```

PR title and body are derived from the PRD + plan. Verify:

- Title is conventional (`feat:`, `fix:`, etc.).
- Body links the PRD (`projects/prompt-bot/project.prd.md`) and plan (`projects/prompt-bot/project-impl-plan.md`).
- CI is green.

### Step 12 — Reflect (extract patterns for future bootstraps)

```text
/learn
```

Then if the patterns are reusable across projects:

```text
/promote
```

This is the loop-closer — it makes the *next* clone-to-new-project bootstrap faster.

---

## Verification — End-of-bootstrap checklist

Run through this before declaring the bootstrap done:

- [ ] **G1:** Wall-clock from `git clone` exit to `/harness-audit` green was ≤ 90 seconds (warm host).
- [ ] **G3:** `/harness-audit` is green; all 6 MCP servers responsive.
- [ ] **G4:** Used the PRP chain in order — no skipped steps, no parallel branches except the documented `/blueprint` escape hatch.
- [ ] **G5:** No failure mode required undocumented recovery. (If you had to invent a fix, file an update against this runbook.)
- [ ] PR is open against `main`, CI green, links the PRD and plan.
- [ ] You did not need to consult any file outside this runbook to complete the bootstrap.

---

## Failure Recovery

Each entry maps 1:1 to a failure mode in the spec (§7). Search the runbook by ID.

### F1 — MCP pre-warm timeout

**Symptom:** `/mcp list` shows fewer than 6 servers, or `/harness-audit` flags one MCP red.
**Fix:** Inside the container, run `node scripts/ecc.js verify`. If a specific server is still down: `/mcp restart <name>`. **Do not edit `.mcp.json`.**

### F2 — Windows bind-mount EACCES on `node_modules`

**Symptom:** `yarn install` errors with `EACCES`, often on `.bin/` symlinks.
**Fix:** From the host, delete any host-side `node_modules/` in the cloned workspace. Command Palette → **Dev Containers: Rebuild Container**.

### F3 — `CLAUDE_PLUGIN_ROOT` resolves to a stale install

**Symptom:** Audit shows hooks as "no-op (root not found)" or `CLAUDE_PLUGIN_ROOT` points at `~/.claude/plugins/...` instead of the workspace.
**Fix:** Inside the container terminal, before starting Claude:
```bash
export CLAUDE_PLUGIN_ROOT=/workspaces/agent_harness
```
Restart the Claude session, re-audit.

### F4 — `pre:edit-write:gateguard-fact-force` stalls

**Symptom:** `/prp-implement` pauses on the first Edit/Write per file.
**Fix:** Provide the requested context (importers, schema, user instruction) and continue. **This is the gate working as designed — not a bug.**
**Only if genuinely needed** (e.g., a generated file with no upstream): set `ECC_DISABLED_HOOKS=pre:edit-write:gateguard-fact-force` for that one phase, then unset.

### F5 — `pre:config-protection` blocks a lint-config edit

**Symptom:** Edit on `.eslintrc.*`, `.prettierrc.*`, `eslint.config.*`, or `tsconfig.*` is blocked.
**Fix:** This gate is intentional. If the edit is genuinely required (e.g., the new project needs its own lint config), use a separate procedure: `ECC_DISABLED_HOOKS=pre:config-protection` → make the edit → unset → re-audit. **Do not bake this into the happy-path runbook.**

### F6 — `agent.yaml` drift ("skill not found")

**Symptom:** A skill referenced by a command reports "skill not found" though `skills/<name>/` exists on disk.
**Fix:** The skill is missing from `agent.yaml`'s `skills:` block. Add it, save, re-audit. `agent.yaml` is the canonical export contract — entries not listed there are invisible to the loader.

### F7 — `stop:format-typecheck` reports end-of-turn errors

**Symptom:** Edits looked clean during the response; the Stop hook surfaces tsc/Biome errors after the turn ends.
**Fix:** Treat the Stop output as authoritative. Address errors before continuing to the next phase. **Do not** disable the hook to "make it green" — that breaks the contract.

### F8 — First container build is slow (> 5 minutes)

**Symptom:** First-ever build pulls the base image (~1 GB) and runs Dockerfile from scratch.
**Fix:** Expected. This is a one-time cold-cache cost on a new host, **outside G1's budget**. Named volumes preserve `node_modules` and yarn cache so subsequent rebuilds hit the 60-second target.

### F9 — Hook profile is wrong for your team

**Symptom:** Hooks too noisy (interrupting flow) or too quiet (not catching issues you expect).
**Fix:** Edit `.devcontainer/devcontainer.json`'s `containerEnv.ECC_HOOK_PROFILE` to `minimal` or `strict` for the whole team. Or use `ECC_DISABLED_HOOKS=<id1>,<id2>` for surgical opt-outs. Re-audit.

---

## Reference

### Phase → owner table

| Phase | Step | Owner | File |
|---|---|---|---|
| 1 | Container build & deps | `postCreate.sh` | [.devcontainer/postCreate.sh](../../.devcontainer/postCreate.sh) |
| 1 | MCP pre-warm | postCreate + `.mcp.json` | [.mcp.json](../../.mcp.json) |
| 2 | Harness verification | `/harness-audit` | [commands/harness-audit.md](../../commands/harness-audit.md) |
| 2 | Skill catalog (optional) | `/skill-health` | [commands/skill-health.md](../../commands/skill-health.md) |
| 3 | PRD authoring | `/prp-prd` | [commands/prp-prd.md](../../commands/prp-prd.md) |
| 4 | Implementation plan | `/prp-plan` | [commands/prp-plan.md](../../commands/prp-plan.md) |
| 4 | Multi-PR plan (escape hatch) | `/blueprint` | [skills/blueprint/SKILL.md](../../skills/blueprint/SKILL.md) |
| 5 | Phase execution | `/prp-implement` | [commands/prp-implement.md](../../commands/prp-implement.md) |
| 5 | Quality gate | `/quality-gate` | [commands/quality-gate.md](../../commands/quality-gate.md) |
| 5 | Commit | `/prp-commit` | [commands/prp-commit.md](../../commands/prp-commit.md) |
| 5 | PR | `/prp-pr` | [commands/prp-pr.md](../../commands/prp-pr.md) |
| Cross | Pattern extraction | `/learn` → `/promote` | [commands/learn.md](../../commands/learn.md), [commands/promote.md](../../commands/promote.md) |
| Cross | Codify recurring pattern | `/skill-create` | [commands/skill-create.md](../../commands/skill-create.md) |
| Cross | Agent SDK guidance | `claude-agent-sdk` skill | [skills/claude-agent-sdk/](../../skills/claude-agent-sdk/) |
| Cross | Autonomous deploy (out of scope) | `autonomous-agent-harness` skill | [skills/autonomous-agent-harness/](../../skills/autonomous-agent-harness/) |

### Runtime escape hatches

| Variable | Effect | Default |
|---|---|---|
| `ECC_HOOK_PROFILE` | `minimal` / `standard` / `strict` — gates hook aggressiveness | `standard` |
| `ECC_DISABLED_HOOKS` | Comma-separated hook IDs to disable surgically | (empty) |
| `ECC_GOVERNANCE_CAPTURE` | `1` opts in to `pre/post:governance-capture` (secrets, policy, approvals) | (off) |
| `CLAUDE_PLUGIN_ROOT` | Points hook bootstrap at the right plugin root | resolved from env / `~/.claude/plugins/` |

### Out-of-scope pointers (read these separately, not part of this runbook)

- **CI/CD for the new agent** — separate workflow.
- **Autonomous-loop deployment** — `skills/autonomous-agent-harness/` and `skills/continuous-agent-loop/`.
- **Installing ECC components into a third-party codebase** — `install.sh` / `install.ps1` / `node scripts/ecc.js install`.
- **The `harness-template` repo's `/think→/plan→/code→/review→/test→/ship→/reflect` spine** — different repo, different architecture.

---

## Changelog

- **2026-05-02 v1.0** — First version, derived from [docs/specs/clone-to-new-project.spec.md](../specs/clone-to-new-project.spec.md). First concrete use: bootstrap a Prompt Bot/Agent.
