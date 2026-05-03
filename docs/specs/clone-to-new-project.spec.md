# Clone-to-New-Project Workflow Spec

**Spec ID:** `ecc/clone-to-new-project`
**Status:** Draft v1
**Author:** Claude Opus 4.7 (via `product-management:write-spec`)
**Date:** 2026-05-02
**Repo:** `agent_harness` (everything-claude-code, v2.0.0-rc.1)
**First concrete use:** Bootstrap a new "Prompt Bot/Agent" project from a clean clone.

---

## 1. Problem Statement

A new contributor or operator with a clean machine and a fresh clone of `agent_harness` cannot today reach "first useful prompt against a new project" without consulting README.md, AGENTS.md, COMMANDS-QUICK-REF.md, the devcontainer files, and tribal knowledge about which slash command starts what. The path exists — it is just unwritten — and every first-time bootstrap reinvents it.

Three concrete pains:

- **No single canonical sequence.** The harness has 68 commands, 190 skills, and 48 agents. There is no `/scaffold-project` or `/new-project`. A first-timer must infer that `/prp-prd → /prp-plan → /prp-implement` is "the path," and that `/harness-audit` should run *before* any of that.
- **Hidden gates surprise the workflow.** `pre:bash:dispatcher` runs on every Bash call, `pre:edit-write:gateguard-fact-force` blocks the first Edit/Write per file, and `pre:config-protection` blocks edits to lint configs. A runbook that does not name these gates looks like it is broken when it is not.
- **The Windows host is unreliable.** The user's host is mid-repair; the devcontainer is the only environment we can assume is clean. Any workflow that depends on host-side tooling (a global `claude` install, a host yarn, a host shell config) will fail at least once.

The cost of leaving this unsolved: every fresh clone burns 30–60 minutes of trial-and-error. The user's standard ("ship the finished product on turn 1, no workarounds") is structurally unreachable without a written workflow.

---

## 2. Goals

The workflow this spec defines must achieve:

- **G1 — Time-to-first-prompt ≤ 90 seconds, end-to-end.** From `git clone` returning to the user typing their first slash command into a healthy session, the wall-clock budget is 90 seconds (60s for the documented postCreate.sh path + 30s for the harness-audit pass). Beyond that, the transition is no longer "smooth, instant."
- **G2 — Every step is reproducible from the runbook alone, with zero recall to memory or README.** A reader who has never seen this repo before should be able to execute the runbook line-by-line and reach the same end state as a maintainer.
- **G3 — `/harness-audit` is green before any project work begins.** All 6 MCP servers respond, `ECC_HOOK_PROFILE` resolves, no hooks are silently no-op'd via missing `CLAUDE_PLUGIN_ROOT`. Green-audit is the gate that admits the user into the PRP chain.
- **G4 — The PRP chain is the named, default path.** `/prp-prd → /prp-plan → /prp-implement → /prp-commit → /prp-pr` is the spine of the project-bootstrap phase. The runbook calls these out by name, in order, with the artifacts each one writes.
- **G5 — Every documented failure mode has a one-line recovery.** No "try restarting and see," no "consult docs/." If MCP pre-warm times out, the runbook says exactly what to do. If gateguard stalls, the runbook says exactly how to satisfy it.

---

## 3. Non-Goals

Explicitly out of scope for this spec and the runbook it produces:

- **N1 — Installing ECC components into a third-party codebase.** The `install.sh` / `install.ps1` / `scripts/ecc.js install` flow is its own workflow. This spec is about bootstrapping a *new* project alongside the harness, not about retrofitting an existing one.
- **N2 — CI/CD configuration for the new agent.** The runbook stops at "first PR opened." Wiring up GitHub Actions, deploy keys, autonomous-loop scheduling, or hosting is out of scope.
- **N3 — Autonomous-loop deployment.** The `autonomous-agent-harness` and `continuous-agent-loop` skills are orthogonal to this workflow. Pointers only; no procedures.
- **N4 — Host-machine configuration.** No "install Docker," no "configure WSL," no "fix Git Credential Manager." The runbook assumes the devcontainer can be opened. The user's host repair is tracked separately.
- **N5 — Multi-repo / monorepo scaffolding.** This spec covers a single new project alongside the harness. The `harness-template` repo's spine architecture (`/think → /plan → /code …`) is a different beast and is not in scope.
- **N6 — Choosing between PRP and `/blueprint`.** The default is PRP. `/blueprint` is mentioned as an escape hatch for multi-PR work, but the runbook does not branch on it.

---

## 4. Personas

**P1 — The first-time operator (primary persona).**
A contributor who has cloned `agent_harness` for the first time. Knows Claude Code exists, has used it casually. Has not memorized 68 commands. Wants to build a Prompt Bot/Agent today and ship something by end-of-day. Will read the runbook top-to-bottom once, then come back to it as a checklist. (The `runbook` skill, registered in `agent.yaml`, is the entry point.)

**P2 — The repair-mode maintainer (the user, today).**
Knows the harness intimately. Host is partially broken; devcontainer is the trusted environment. Needs the runbook to *not* assume host hygiene. Will use the runbook as a forcing function for completeness — every gap is a paper cut on every future bootstrap.

**P3 — The runbook reader six months from now.**
The harness will have evolved. New commands, new skills, deprecated hooks. This persona needs the runbook to document *which file each fact came from* so they can re-verify when something changes. References > prose.

---

## 5. User Journey

The journey from `git clone` to "first PR for the new Prompt Bot" has six phases. The runbook will mirror this structure.

### Phase 0 — Pre-flight (host)

**Inputs:** A working Docker Desktop / VS Code Dev Containers extension on the host. A GitHub identity that can clone `agent_harness` and push to the new project.
**Out:** `agent_harness` cloned to disk; the host is otherwise untouched.

Actions:
1. `git clone <agent_harness-remote> agent_harness && cd agent_harness`
2. Open the folder in VS Code; accept the "Reopen in Container" prompt.

**Time budget:** ≤ 15 seconds (the user's action time; build time is in Phase 1).

### Phase 1 — Devcontainer boot

**Inputs:** The opened folder. `.devcontainer/devcontainer.json`, `Dockerfile`, `postCreate.sh`.
**Out:** Container running; `node_modules` populated; `.mcp.json` servers pre-warmed; `npm run verify --skip-mcp` passed.

What runs (no user action; observe only):
1. Docker pulls/builds the image (`mcr.microsoft.com/devcontainers/javascript-node:1-20-bookworm` + Dockerfile additions).
2. Named volumes attach: `ecc-node-modules`, `ecc-yarn-cache`, `ecc-npm-cache`, `ecc-claude-state`.
3. Container env vars set: `ECC_HOOK_PROFILE=standard`, `DEFAULT_BASE_BRANCH=main`, `SESSION_SCRIPT=./session-start.sh`, `CONFIG_FILE=./mcp-config.json`, `ENABLE_VERBOSE_LOGGING=false`.
4. `postCreate.sh` runs: yarn 4.9.2 activation → `yarn install --immutable` → MCP pre-warm of 6 npx servers → `npm run verify --skip-mcp`.

**Time budget:** ≤ 60 seconds steady-state on a warm host (first build is longer; that is a one-time cost outside G1).
**Verification:** Terminal shows postCreate.sh exit 0; `node_modules/ajv` present; no red error lines in the postCreate stream.

### Phase 2 — Harness audit (gate)

**Inputs:** A live Claude Code session in the container.
**Out:** `/harness-audit` reports green. All 6 MCP servers respond. Hook profile is `standard`. No hooks silently no-op'd.

Actions:
1. Open Claude Code in the integrated terminal (or start a session).
2. Run `/harness-audit`.

**Time budget:** ≤ 30 seconds.
**Acceptance:** All hook lanes registered; all MCP servers report healthy; `CLAUDE_PLUGIN_ROOT` resolves to the workspace plugin root, not a stale `~/.claude/plugins/` install.

This is the **G3 gate.** If audit is not green, the runbook routes to §7 Failure Modes. Project work does *not* start until audit is green.

### Phase 3 — Project vision (PRD)

**Inputs:** A green harness, a one-line vision ("Build a Prompt Bot/Agent that …").
**Out:** `projects/prompt-bot/project.prd.md` — interactive PRD with problem, users, success metrics.

Actions:
1. `/prp-prd "Build a Prompt Bot/Agent that <one-line>"`.
2. Answer the interactive Q&A (problem, persona, primary metric, three constraints). Keep answers concise — this is a 5-minute step, not 50.
3. Confirm the emitted PRD path.

**Time budget:** ≤ 5 minutes (user-driven, not machine-bound).
**Artifact:** `projects/prompt-bot/project.prd.md` exists, has the seven canonical sections (problem, goals, non-goals, personas, user stories, requirements, success metrics).

### Phase 4 — Implementation plan

**Inputs:** The PRD from Phase 3.
**Out:** `projects/prompt-bot/project-impl-plan.md` — phased plan with codebase patterns, anti-patterns, exit criteria per phase.

Actions:
1. `/prp-plan ./projects/prompt-bot/project.prd.md`.
2. Review the emitted plan; adjust phases if any phase is > 1 PR worth of work (split it).

**Time budget:** ≤ 3 minutes.
**Artifact:** Plan file with at least one phase tagged `phase: 1` and one acceptance criterion per phase.

### Phase 5 — Implement, commit, PR

**Inputs:** The plan from Phase 4.
**Out:** A passing first phase; a conventional commit; an open PR against `main`.

Actions:
1. `/prp-implement ./projects/prompt-bot/project-impl-plan.md` — executes phase 1 with checkpoints.
   - **Heads-up:** the first Edit/Write per file may invoke `pre:edit-write:gateguard-fact-force`. The agent will pause and ask for context. This is expected, not a failure. Provide the context (importers, schema, user instruction) and continue.
2. `/quality-gate` — runs the harness's quality checks (linters, tests, type-check via `stop:format-typecheck`).
3. `/prp-commit` — emits a conventional commit (`feat: …`).
4. `/prp-pr` — opens the PR. Title and body come from the PRD + plan.

**Time budget:** Variable (depends on phase 1 scope). The runbook does not promise a wall-clock here.
**Acceptance:** PR is open, green CI, conventional title, body links the PRD and plan.

---

## 6. Success Metrics

### Leading indicators (verified per-bootstrap, on the runbook itself)

| Metric | Target | Measurement |
|---|---|---|
| Time from `git clone` exit to `/harness-audit` green | ≤ 90 seconds (G1) | Wall-clock; recorded at the top of every bootstrap session log |
| Runbook step count from clone to first PR | ≤ 12 numbered steps | Count headings in the runbook; if it grows past 12, the workflow has bloated |
| Runbook re-reads required after first read | 0 | Self-reported by the operator at end of bootstrap; tracked in `TASKS.md` |
| `/harness-audit` failure modes covered in runbook | 100% of known modes | Cross-check the audit's red-status list against §7 of this spec |
| Steps requiring `ECC_DISABLED_HOOKS` or hook profile changes on the happy path | 0 | If any step needs an escape hatch, the workflow is not "smooth" — file a fix |

### Lagging indicators (verified across many bootstraps)

| Metric | Target (90 days post-publish) | Source |
|---|---|---|
| Bootstraps that reach "PR open" without consulting any file outside the runbook | ≥ 80% | Self-report at end of bootstrap |
| Bootstraps that hit a documented failure mode and recovered using only the runbook | ≥ 90% | Same |
| New ECC commands or hooks added without updating this spec | 0 (audit quarterly) | `agent.yaml` diff vs. spec; goal is "the runbook never goes stale" |

---

## 7. Failure Modes & Recovery

These are the failure modes most likely to occur in Phases 1–5. Every entry has a one-line recovery; the runbook restates them inline at the relevant step.

### F1 — MCP pre-warm timeout in postCreate.sh

**Symptom:** postCreate logs include `npx -y <pkg>` lines that hang or exit non-zero. `/mcp list` shows fewer than 6 servers later.
**Root cause:** Network slowness or a transient npm registry issue during pre-warm. Pre-warm is best-effort and swallows failures (by design).
**Recovery:** Inside the container, run `node scripts/ecc.js verify` (or the script's equivalent re-warm command). If a specific MCP server is still down, restart that server via `/mcp restart <name>`. Do not edit `.mcp.json`.

### F2 — Windows bind-mount EACCES on `node_modules`

**Symptom:** `yarn install` errors with `EACCES: permission denied`, often on `.bin/` symlinks.
**Root cause:** The named-volume strategy in `devcontainer.json` exists exactly to prevent this — but if the user previously ran `npm install` on the host and committed a `node_modules/` directory, the bind-mount fights the named volume.
**Recovery:** From the host, delete any host-side `node_modules/` in the workspace. Rebuild the devcontainer (Command Palette → "Dev Containers: Rebuild Container").

### F3 — `/harness-audit` red because `CLAUDE_PLUGIN_ROOT` resolves to a stale install

**Symptom:** `/harness-audit` shows hooks as "no-op (root not found)" or points at a `~/.claude/plugins/` path that does not match the current workspace.
**Root cause:** A previous global ECC install left state in `~/.claude/plugins/`, and the hook bootstrap's fallback resolver picks that one over the workspace plugin.
**Recovery:** In the container, `export CLAUDE_PLUGIN_ROOT=/workspaces/agent_harness` (or the actual workspace path) before starting the Claude session, or persist via the `ecc-claude-state` volume's settings.

### F4 — `pre:edit-write:gateguard-fact-force` stalls phase 5

**Symptom:** `/prp-implement` pauses on the first Edit/Write per file with a request for importers, schema, or user-instruction context.
**Root cause:** This is the fact-forcing gate. It is intentional. It is *not* a failure.
**Recovery:** Provide the requested context. If a step in the runbook unavoidably needs a single one-shot Edit (e.g., a generated file the agent has no upstream to investigate), set `ECC_DISABLED_HOOKS=pre:edit-write:gateguard-fact-force` for *that* phase only, and revert.

### F5 — `pre:config-protection` blocks an unavoidable lint-config edit

**Symptom:** Edit on `.eslintrc.*`, `.prettierrc.*`, `eslint.config.*`, `tsconfig.*` is blocked with a "fix the code, not the config" message.
**Root cause:** Intentional gate. Designed to keep agents from weakening project standards.
**Recovery:** If the edit is genuinely required (new project needs its own lint config), use a separate procedure: temporarily set `ECC_DISABLED_HOOKS=pre:config-protection`, make the edit, unset, audit. Do not bake this into the happy-path runbook.

### F6 — `agent.yaml` drift (a skill or command is "missing")

**Symptom:** A skill referenced by a command (`/skill-create`, etc.) reports "skill not found in registry" even though the directory exists in `skills/`.
**Root cause:** The skill was added to `skills/` but not to `agent.yaml`. `agent.yaml` is the canonical export contract; entries not listed there are invisible to the loader.
**Recovery:** Add the skill name to `agent.yaml` under `skills:`. Re-run `/harness-audit`.

### F7 — `stop:format-typecheck` reports errors at end-of-turn that were invisible during edits

**Symptom:** Edits looked clean during the response; the Stop hook surfaces tsc / Biome errors after the turn ends.
**Root cause:** Format and typecheck are *batched* at the Stop phase by design (300s timeout). They do not run inline.
**Recovery:** Treat the Stop output as the authoritative check. Address errors before continuing to the next phase. Do not disable `stop:format-typecheck` to "make it green" — that breaks the contract.

### F8 — First container build is slow (> 5 minutes)

**Symptom:** First-ever build on a host pulls the base image (~1 GB) and runs Dockerfile steps from scratch.
**Root cause:** Cold Docker cache. This is not in G1's budget — G1 covers warm-host steady state.
**Recovery:** Document as expected. The first bootstrap on a new host pays this cost once; named volumes preserve `node_modules` and yarn cache so subsequent rebuilds are fast.

### F9 — Hook profile is wrong for a team policy

**Symptom:** Hooks too noisy (interrupting flow) or too quiet (not catching issues the team expects to catch).
**Root cause:** `ECC_HOOK_PROFILE` defaults to `standard`. Some teams want `minimal` (less interruption) or `strict` (stronger governance + design-quality checks).
**Recovery:** Set `ECC_HOOK_PROFILE=minimal|strict` in `.devcontainer/devcontainer.json` (`containerEnv`) for the whole team, or `ECC_DISABLED_HOOKS` for surgical opt-outs. Re-audit.

---

## 8. Roles of Existing Harness Pieces

For the runbook author, here is which command/skill owns which step:

| Phase | Step | Owner (command/skill) | File reference |
|---|---|---|---|
| 1 | Container build & deps | `.devcontainer/postCreate.sh` | `.devcontainer/postCreate.sh` |
| 1 | MCP pre-warm | postCreate.sh + `.mcp.json` | `.mcp.json` |
| 2 | Harness verification | `/harness-audit` | `commands/harness-audit.md` |
| 2 | Skill catalog discovery (optional) | `/skill-health` | `commands/skill-health.md` |
| 3 | PRD authoring | `/prp-prd` | `commands/prp-prd.md` |
| 4 | Implementation planning | `/prp-plan` | `commands/prp-plan.md` |
| 4 | Multi-PR planning (escape hatch only) | `/blueprint` | `skills/blueprint/SKILL.md` |
| 5 | Phase execution | `/prp-implement` | `commands/prp-implement.md` |
| 5 | Quality gate | `/quality-gate` | `commands/quality-gate.md` |
| 5 | Commit | `/prp-commit` | `commands/prp-commit.md` |
| 5 | PR | `/prp-pr` | `commands/prp-pr.md` |
| Cross | Pattern extraction (post-bootstrap) | `/learn` then `/promote` | `commands/learn.md`, `commands/promote.md` |
| Cross | Codify a recurring pattern as skill | `/skill-create` | `commands/skill-create.md` |
| Cross | Agent SDK guidance for the bot itself | `claude-agent-sdk` skill | `skills/claude-agent-sdk/` |
| Cross | Autonomous-loop deployment (out of scope, pointer only) | `autonomous-agent-harness` skill | `skills/autonomous-agent-harness/` |

---

## 9. Open Questions

These are unresolved and need an answer before the runbook ships in `v1.0`. Tagged with the function that should resolve them.

- **Q1 (engineering):** Should the runbook live at `docs/RUNBOOKS/clone-to-new-project.md` or under `commands/runbook.md` as a slash command? The user's request reads as "create a `/runbook`" — interpreted as both an artifact (markdown) and a callable command. Recommend doing both: a callable `/runbook` command that prints/follows the markdown.
- **Q2 (engineering):** What is the canonical home for new projects bootstrapped *alongside* the harness? Options: `projects/<name>/`, sibling directory, separate repo. The runbook currently assumes `projects/prompt-bot/`. Confirm.
- **Q3 (product):** Should `/prp-prd`'s default PRD location be configurable, so the runbook can promise a stable path? Today the path is whatever the agent picks.
- **Q4 (engineering):** Is `ECC_HOOK_PROFILE` settable per-session (e.g., for the bootstrap turn only) or is it container-wide? The runbook would benefit from a session-scoped override for the rare phase-5 edge case in F4/F5.
- **Q5 (ops):** Does `/harness-audit` distinguish "MCP server slow on first call" from "MCP server unhealthy"? The first should not fail the audit; the second should. Confirm current behavior and adjust if needed.
- **Q6 (docs):** Should this spec become a permanent template under `docs/specs/` for future workflows (e.g., "clone-to-CI," "clone-to-deploy"), or is it a one-off?
- **Q7 (product):** The user described the use case as "Prompt Bot/Agent." What is the minimal "phase 1" definition for that bot in the PRP chain? Suggest: a single skill that takes a user prompt, applies one transformation, returns an output, plus one test. This is a question for the PRD step itself, not for the runbook — but the runbook should cite it as the example.

---

## 10. Acceptance Criteria for This Spec

Before this spec is "done":

- [ ] All five goals (G1–G5) have at least one corresponding metric in §6.
- [ ] All nine failure modes (F1–F9) have a one-line recovery.
- [ ] The user journey in §5 names exactly one slash command per step (no "or").
- [ ] §8 has a file reference for every command and skill mentioned.
- [ ] Open questions in §9 are genuinely open — none of them is answerable from the briefing context.
- [ ] The spec is ≤ 700 lines (this one is ~580). If it grows past that, split it.

---

## 11. Next Step

The runbook author (next turn) will use §5 (User journey) and §7 (Failure modes & recovery) verbatim as the runbook's spine. §8 (Roles) becomes the "Reference" appendix at the bottom of the runbook. §6 (Success metrics) becomes the "Verification" checklist that runs at the end of every bootstrap.

The runbook will be saved to `docs/RUNBOOKS/clone-to-new-project.md` *and* registered as a callable slash command at `commands/runbook.md` (per Q1's recommended resolution).
