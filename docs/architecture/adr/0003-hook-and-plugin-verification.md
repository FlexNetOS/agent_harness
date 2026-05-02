# ADR 0003 — Hook and Plugin Verification Protocol

- **Status:** Proposed
- **Date:** 2026-05-01
- **Deciders:** Harness maintainers
- **Related:** ADR 0001, ADR 0002, ADR 0004

## Context

The hook framework is mature: `scripts/hooks/run-with-flags.js` is a wrapper that handles JSON-stdin parsing, profile gating (`ECC_HOOK_PROFILE` ∈ {minimal, standard, strict}), per-hook disable flags (`ECC_DISABLED_HOOKS=hook-id-1,hook-id-2`), and bootstrap-path resolution via `scripts/hooks/plugin-hook-bootstrap.js`. `hooks/hooks.json` declares triggers (PreToolUse, PreCompact, SessionStart, PostToolUse, PostToolUseFailure, Stop, SessionEnd) and wires every hook through the wrapper.

Plugin manifest (`.claude-plugin/plugin.json`) declares skills and commands paths and intentionally leaves `mcpServers: {}` empty — MCP servers are loaded from `.mcp.json` instead. Six MCP servers are wired in `.mcp.json`:

```
github, context7, exa, memory, playwright, sequential-thinking
```

with auth via env vars (`GITHUB_PERSONAL_ACCESS_TOKEN`, `EXA_API_KEY`, `CONTEXT7_API_KEY`, `ANTHROPIC_API_KEY`).

CI validators exist for agents, commands, rules, skills, hooks, install manifests, and personal-paths leakage. `tests/run-all.js` runs them all.

What's *missing* is a single command that gives a one-shot green/yellow/red report on the entire harness — useful before a release, after a clone, in CI, and inside a freshly built devcontainer (ADR 0004).

## Decision

Author `scripts/verify-harness.js` (single entrypoint) and wire it as `npm run verify`. The script orchestrates existing validators and adds three new checks:

1. **Plugin manifest sanity.** Parse `.claude-plugin/plugin.json` and verify `skills`, `commands`, `agents` paths resolve. Confirm `mcpServers: {}` is intentional (warn if non-empty since the harness pattern is to defer to `.mcp.json`).
2. **Hook profile sweep.** Parse `hooks/hooks.json` directly to extract every hook's `id` and `profilesCsv` (the third positional arg in commands routed through `run-with-flags.js`). Compute which hooks are enabled per profile and assert: every hook resolves to a script that exists on disk, every profile has a non-empty hook set, and the inclusion order is correct (`minimal ⊆ standard ⊆ strict` — `minimal` activates the fewest hooks; `strict` activates the most). Direct parsing avoids modifying the critical `run-with-flags.js` executor.
3. **MCP server smoke.** For each entry in `.mcp.json`, run a 5-second timeout `npx -y <pkg>@<version> --help` (or HTTP HEAD for `type: "http"` servers like `exa`). Report **green** if the server exits 0 and reports usable output, **yellow** if it loads but env vars look unset, **red** if it fails to install or run. Surface env-var requirements explicitly per server.

**Run sequence inside `verify-harness.js`:**

| Step | Action | Failure level |
|---|---|---|
| 1 | `node scripts/ci/validate-agents.js` | red |
| 2 | `node scripts/ci/validate-commands.js` | red |
| 3 | `node scripts/ci/validate-rules.js` | red |
| 4 | `node scripts/ci/validate-skills.js` | red |
| 5 | `node scripts/ci/validate-hooks.js` | red |
| 6 | `node scripts/ci/validate-install-manifests.js` | red |
| 7 | `node scripts/ci/validate-no-personal-paths.js` | red |
| 8 | Plugin manifest sanity (new) | red on parse error, yellow on `mcpServers` non-empty |
| 9 | Hook profile sweep (new) | red if any profile errors; yellow if a profile is empty |
| 10 | MCP server smoke (new) | per-server green/yellow/red; aggregated to overall yellow if any yellow, red if any red |
| 11 | `node tests/run-all.js` | red on any test failure |

**Output format:** plain text + machine-readable trailer. Exit 0 only if no reds. Suitable for CI.

```
[OK]    validate-agents
[OK]    validate-commands
...
[WARN]  mcp:exa — env var EXA_API_KEY appears unset
[OK]    mcp:github
...

OVERALL: YELLOW (8 OK, 1 WARN, 0 ERROR)
```

## Consequences

**Positive**
- One command tells you if the harness is healthy.
- Devcontainer postCreate (ADR 0004) can call `npm run verify` to validate the fresh environment.
- New contributors have a clear "did I break it?" check.

**Negative**
- New script, ~250 LOC. Maintenance cost is low because it's mostly glue.
- MCP smoke adds ~30 seconds to a local run (six `npx` invocations). Mitigation: `--skip-mcp` flag for fast iteration.

**Neutral**
- Existing validators are unchanged; verify-harness orchestrates them.
- The `--list` flag added to `run-with-flags.js` is additive and useful on its own (debugging which hooks fire in which profile).

## Alternatives Considered

1. **Add to `tests/run-all.js`.** Rejected: tests/ is for unit + CI validators; verify-harness is *operational* — env-aware and slower.
2. **Shell script.** Rejected: harness is Node-first per `.claude/rules/node.md`; cross-platform via Node is required.
3. **GitHub Actions workflow only.** Rejected: contributors need it locally too, and devcontainer postCreate needs it.

## References

- `scripts/hooks/run-with-flags.js` — to add `--list` flag
- `scripts/hooks/plugin-hook-bootstrap.js` — plugin-root resolution
- `scripts/lib/hook-flags.js` — profile gating logic
- `scripts/ci/validate-*.js` — existing validators to orchestrate
- `.mcp.json` — six servers to smoke
- `.claude-plugin/plugin.json` — manifest to sanity-check
