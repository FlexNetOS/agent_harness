# ADR 0005 — Portable Multi-Container DevContainer (Compose Sidecar)

- **Status:** Proposed
- **Date:** 2026-05-03
- **Deciders:** Harness maintainers
- **Related:** ADR 0004 (DevContainer + Docker Packaging)

## Context

ADR 0004 stood up a single-container devcontainer at `.devcontainer/`. The driving use case was "develop the harness itself" plus "clean-room sandbox for running Claude Code." That ADR explicitly rejected `docker-compose.yml` with the rationale: *MCP servers are stdio subprocesses spawned by Claude Code (no network peers, no second service), so compose adds nothing.*

A new use case has emerged that the original ADR did not anticipate:

1. The user wants to **open arbitrary sibling projects** (e.g., `ai-top-utility`) inside a fresh `agent_harness` container so the full agent/skill/command catalogue is available as tooling for projects that aren't the harness itself.
2. The user wants a **second sibling project (`prompt-nexus`) auto-attached as a sidecar workspace** — both bind-mounted (editable) and running in its own container so it can be `docker compose exec`'d into directly.
3. The user wants the same setup to **work without VS Code**, on any host with Docker (Linux, macOS, WSL, Docker Desktop).
4. The user wants `gh auth` and commit signing to **persist across container rebuilds and across hosts** so cloning to a new machine requires no per-project tweaking.

Workspace-as-sidecar is a different problem from "containerize MCP servers." MCP topology stays unchanged — see *Decision* below.

## Decision

Add a second, opt-in entry point at `.devcontainer/docker-compose.yml`. The original `.devcontainer/devcontainer.json` is unchanged and remains the default for harness-on-harness work. Users who want the portable multi-project flow copy `.env.example` → `.env`, set host paths, and run `docker compose --env-file .env up -d`.

### File layout

```
.devcontainer/
  devcontainer.json       # unchanged — single-container, harness-only
  Dockerfile              # +6 lines: profile-drop + system-level signing-disabled
  postCreate.sh           # +15 lines: gh auth probe + final banner
  docker-compose.yml      # NEW — harness + prompt-nexus services
  .env.example            # NEW — host-path env template
```

### Compose topology

```
[harness]              [prompt-nexus]
   |                          |
   |    network: ah-net       |
   +--------------------------+

mounts:
  ${AGENT_HARNESS_HOST}    -> /workspaces/agent_harness
  ${HARNESS_TARGET_HOST}   -> /workspaces/${HARNESS_TARGET_NAME}
  ${PROMPT_NEXUS_HOST}     -> /workspaces/prompt-nexus  (in harness)
                           -> /app                       (in prompt-nexus)
  ${HOST_CONFIG_DIR}       -> /home/node/.config         (gh, claude, op...)
  ecc-node-modules         -> /workspaces/agent_harness/node_modules
  ecc-yarn-cache           -> /home/node/.yarn/berry/cache
  ecc-npm-cache            -> /home/node/.npm
  ecc-claude-state         -> /home/node/.claude
```

### MCP topology — unchanged

**MCPs remain stdio children of `claude` inside the `harness` service.** The compose addition does not move MCP servers into their own services. ADR 0004's rationale ("MCP servers are stdio subprocesses, no second service to host") still holds for the protocol layer.

**Hard rule for future ADRs:** do not containerize MCP servers into compose services. Stdio MCPs cannot speak across container boundaries cleanly — they expect fork/pipe semantics that `docker exec` shims cannot replicate without breaking the spec.

### Named-volume invariant

The `ecc-*` named volumes are **harness-owned**. They cache:

- `agent_harness`'s own `node_modules` (for harness dev)
- yarn berry cache
- npm cache (MCP `npx` warm-ups)
- `~/.claude` plugin/session state

Target projects (`HARNESS_TARGET`, `prompt-nexus`) **manage their own `node_modules` on their own bind mount**. They do not share the named volumes. This means:

- A target project's `npm install` writes to its own bind-mounted `node_modules`, not the cached harness one.
- `docker compose down` does not lose harness-owned caches; `docker compose down -v` does.
- Switching `HARNESS_TARGET` in `.env` and re-`up`'ing reuses the same harness caches — fast iteration across multiple target projects.

### Persistent fixes baked into the image

Two changes in `Dockerfile` make the cross-OS workflow cleaner:

1. **`/etc/profile.d/ecc-env.sh`** — every interactive shell unsets `GITHUB_TOKEN` and `GH_TOKEN` (which would otherwise shadow gh's stored auth) and anchors `XDG_CONFIG_HOME` to `~/.config` so XDG-aware tools find the bind-mounted host config.
2. **`git config --system commit.gpgsign false`** — the container has no access to host SSH/GPG keys by default. Without this, host configs that point `user.signingkey` at a Windows-only path (`C:\Users\...`) cause every commit inside the container to fail. Per-repo override remains possible if a Linux-side signing key is later mounted.

### Unified `~/.config` across all hosts

The bind-mount is `${HOST_CONFIG_DIR}:/home/node/.config`, where `HOST_CONFIG_DIR` is always `~/.config` regardless of host OS. On Linux/macOS this is the natural location. On Windows, the runbook ships a one-time migration:

```cmd
setx GH_CONFIG_DIR     "%USERPROFILE%\.config\gh"
setx XDG_CONFIG_HOME   "%USERPROFILE%\.config"
robocopy "%AppData%\GitHub CLI" "%USERPROFILE%\.config\gh" /MIR
```

After this, gh on the Windows host writes to `%USERPROFILE%\.config\gh`, matching Linux/macOS, and the same compose mount works everywhere with no per-OS branching in `.env`.

### Coexistence with the legacy single-container flow

Both entry points share the Dockerfile, postCreate, and named volumes. The differences:

| Aspect                     | `devcontainer.json` (legacy) | `docker-compose.yml` (new) |
|----------------------------|------------------------------|----------------------------|
| Workspace                  | `agent_harness` only         | harness + target + prompt-nexus |
| Sidecar container          | none                         | `prompt-nexus`             |
| `~/.config` bind-mount     | none                         | yes                        |
| `ECC_DEVCONTAINER_VALIDATION` env | unset                  | `"true"`                   |
| Primary entry              | VS Code "Reopen in Container" | `docker compose up -d`     |

The `ECC_DEVCONTAINER_VALIDATION` flag is what `scripts/hooks/session-start.js` (Phase 2 of this work) uses to decide whether to emit the environment-validation banner. The legacy flow does not set the flag, so existing harness-on-harness users see no behavior change.

## Consequences

**Positive**
- One agent_harness checkout serves any number of target projects without copy-pasting `.devcontainer/` per project.
- gh auth and commit signing handled once per host, persistent forever.
- No VS Code dependency — works on any host with Docker.
- Existing single-container flow is untouched; this is purely additive.

**Negative**
- Docs surface doubles. Mitigation: the runbook (`docs/RUNBOOKS/portable-devcontainer.md`) makes the choice tree explicit.
- Disk: a second long-lived `prompt-nexus` container costs ~200 MB (`node:20-bookworm` base). Acceptable for a dev box.
- Image rebuild on first pull after the Dockerfile bump (one new layer). Cached afterward.

**Neutral**
- Existing CI is unaffected — CI continues to build the single Dockerfile.

## Alternatives Considered

1. **Bind-mount `prompt-nexus` into the harness container as a second project tree, no second container.** Rejected: the user wants prompt-nexus runnable as a service (e.g., for end-to-end testing against it), which a sidecar enables and a bare bind-mount does not.

2. **Generate per-target `.devcontainer/` configs inside each target project.** Rejected: drift risk; centralizing the config in agent_harness is the whole point.

3. **Auto-detect and use a target project's own `Dockerfile` for the prompt-nexus service.** Rejected: implicit behavior surprises users. Explicit `docker-compose.override.yml` is the supported escape hatch.

4. **Mount Windows `~/.ssh` to keep commit signing working in-container.** Rejected: read-only Windows path mounts have permission/UID issues with OpenSSH; signing-disabled is simpler and the container's commits are not enforced-signed by GitHub for this repo.

## References

- ADR 0004 — DevContainer packaging (single-container baseline)
- `.devcontainer/docker-compose.yml` — the compose definition
- `.devcontainer/.env.example` — host-path env template
- `docs/RUNBOOKS/portable-devcontainer.md` — usage runbook (Phase 2)
- `scripts/hooks/session-start.js` — validator banner gated on `ECC_DEVCONTAINER_VALIDATION` (Phase 2)
