# Tasks

> Engineering tasks for the "perfect comprehensive agent harness" initiative — see `docs/architecture/adr/` for full plan and `C:\Users\DavidRevenaugh\.claude\plans\the-goal-of-this-curried-dragon.md` for the source plan.

## Active

- [ ] **(Blocked on Windows env repair)** Run `yarn install` + `npm run verify` on the host once the user's environment-repair tooling lands. Inside the devcontainer this is already proven GREEN/YELLOW.

## Waiting On

## Someday

- [ ] Embed an MCP server *for the harness itself* (referenced in ADR 0002 as future work)
- [ ] Comprehensive cross-platform memory bootstrap scan (deferred — offered, not auto-run)

## Done

- [x] ~~Hermetic isGitRepo test~~ (2026-05-02) — rewrote `tests/lib/utils.test.js` to use `withFreshGitRepo` and `withFreshTmpDir` helpers (`os.tmpdir()` + `git init`); covers both positive and negative cases. Tests now hermetic; doesn't depend on ambient CWD being a git repo.
- [x] ~~Devcontainer hardening — named-volume init + EPERM tolerance~~ (2026-05-02) — Dockerfile pre-creates `/home/node/.yarn/berry/cache`, `/home/node/.npm`, `/home/node/.claude`, `/workspaces/agent_harness/node_modules` with `node:node` ownership so named volumes initialize correctly. `postCreate.sh` tolerates yarn's cosmetic EPERM on workspace bin chmod (Windows bind-mount artifact) and verifies deps via `node_modules/ajv` presence instead of yarn exit code.
- [x] ~~End-to-end devcontainer validation~~ (2026-05-02) — `docker build` succeeds; postCreate runs end-to-end: `yarn install`, MCP pre-warm for all 6 servers, `npm run verify` reports 14 OK / 1 expected WARN / **0 ERROR**. Full `npm test` separately: **2256/2256 passing**. `npm run lint` (eslint + markdownlint) clean. Claude Code 2.1.126 on PATH inside the image. Catalog synced (skills 189).
- [x] ~~Phase 4: DevContainer + Docker packaging~~ (2026-05-01) — `.devcontainer/{devcontainer.json,Dockerfile,postCreate.sh}`, `.dockerignore`, `.env.example` extended, README section added
- [x] ~~Phase 3d: Bump model refs in peer-IDE configs~~ (2026-05-01) — `.opencode/opencode.json` and `.codex-plugin/plugin.json` updated; skill count 182 -> 189
- [x] ~~Phase 3c: MCP coverage uplift~~ (2026-05-01) — `mcp-configs/README.md` documents live vs template tiering
- [x] ~~Phase 3b: 7 feature-coverage skills~~ (2026-05-01) — prompt-caching, extended-thinking, batch-api, computer-use, files-api, citations-api, claude-agent-sdk (skill count: 182 -> 189)
- [x] ~~Phase 3a: 48 agents migrated to Claude 4.X pinned IDs~~ (2026-05-01) — `scripts/migrate-agent-models.js` (idempotent, dry-run, --revert), validator extended, `tests/ci/validate-agents-models.test.js` asserts pinning (50/50 pass)
- [x] ~~Phase 2: Hook + plugin verification~~ (2026-05-01) — `scripts/verify-harness.js` reports green/yellow/red across 14 checks; wired as `npm run verify`; 5 unit tests pass
- [x] ~~Phase 1: Four ADRs authored~~ (2026-05-01) — 0001 model migration, 0002 API feature coverage, 0003 verification, 0004 devcontainer; `docs/architecture/adr/README.md` indexes them
- [x] ~~Phase 0: Productivity bootstrap (TASKS.md + dashboard.html)~~ (2026-05-01) — CLAUDE.md and memory/ skipped because the project's existing CLAUDE.md and `~/.claude/projects/.../memory/` auto-memory already cover those tiers
- [x] ~~Plan exploration: inventory harness, audit hooks/plugins, survey Claude API gaps~~ (2026-05-01)
- [x] ~~Plan approved by user~~ (2026-05-01)
