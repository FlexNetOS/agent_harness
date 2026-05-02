# ADR 0004 — DevContainer + Docker Packaging

- **Status:** Proposed
- **Date:** 2026-05-01
- **Deciders:** Harness maintainers
- **Related:** ADR 0003 (verification — invoked by postCreate)

## Context

The harness is currently developed and consumed on bare hosts. There is no `.devcontainer/`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, or container-aware tooling. Contributors install Node 20, enable corepack, install Yarn 4.9.2, install Python 3.11 (for `ecc_dashboard.py`), and may need to install Playwright system dependencies for the `playwright` MCP — all manually, repeated per machine, with cross-platform variation (Windows/macOS/Linux).

A `.devcontainer + Dockerfile` package serves two goals:

1. **Reproducible dev environment** for working *on* the harness.
2. **Sandbox runtime** for running Claude Code *with* the harness pre-installed — useful for clean-room validation and demo setups.

Per the user's directive, packaging is the final phase of the harness uplift.

## Decision

Single Dockerfile under `.devcontainer/`. **No** root-level Dockerfile. **No** `docker-compose.yml`. MCP servers in this harness are stdio subprocesses spawned by Claude Code (no network peers, no second service), so compose adds nothing.

### File layout

```
.devcontainer/devcontainer.json
.devcontainer/Dockerfile
.devcontainer/postCreate.sh
.dockerignore                 (repo root)
.env.example                  (repo root — already exists, will be updated)
```

### Base image

`mcr.microsoft.com/devcontainers/javascript-node:1-20-bookworm`

- Debian-based: Playwright/Chromium needs glibc and ~30 system libs (`libnss3`, `libatk-bridge2.0-0`, …). Alpine fights you.
- Includes non-root `node` user, sudo, git, curl, OpenSSH, locale.
- Avoids re-implementing devcontainer base layer manually.

### Dependency strategy

- Dockerfile: `corepack enable && corepack prepare yarn@4.9.2 --activate`. Python 3.11 via the `ghcr.io/devcontainers/features/python:1` feature.
- `postCreate.sh`: `yarn install --immutable` against the bind-mounted workspace (lockfile is the source of truth).
- **Volumes:**
  - Named volume: `/workspaces/agent_harness/node_modules` (avoids Windows-to-Linux fs perf hit, EPERM on symlinks)
  - Named volume: `/home/node/.yarn/berry/cache`
  - Named volume: `/home/node/.npm` (persists MCP `npx` warmups across rebuilds)
  - Named volume: `/home/node/.claude` (CC plugin/session state — **separate from host's `~/.claude`** to avoid Windows line-ending and credential corruption)

### MCP pre-warm

`postCreate.sh` runs `npx -y <pkg>@<version> --help || true` once per server in `.mcp.json` (six total). Pre-warm happens **post-create**, not in `RUN`, so:
- Image rebuilds aren't bloated by ~400 MB of npm cache.
- Different branches/checkouts can have different MCP versions without invalidating image layers.
- The `~/.npm` named volume persists the cache across container rebuilds.

### Claude Code in the container

`RUN npm i -g @anthropic-ai/claude-code`. Marginal cost (~50 MB), large UX win. Goal #2 (sandbox for running CC) requires it; goal #1 (just dev) ignores it harmlessly.

### Devcontainer features

- `ghcr.io/devcontainers/features/github-cli:1`
- `ghcr.io/devcontainers/features/python:1` (`version: "3.11"` for `ecc_dashboard.py` and `pyproject.toml`)
- `ghcr.io/devcontainers/features/common-utils:2` (explicit, harmless dup with base)

Skip: docker-in-docker (no compose, no nested builds), node feature (base has it).

### Secrets

- `.env` host-only — never enters image layers.
- `runArgs: ["--env-file", "${localWorkspaceFolder}/.env"]` loads at runtime.
- `.env.example` documents: `ANTHROPIC_API_KEY`, `GITHUB_PERSONAL_ACCESS_TOKEN`, `EXA_API_KEY`, `CONTEXT7_API_KEY`.

### `.dockerignore`

Excludes: `node_modules`, `.git`, `.env`, `coverage`, `research/`, `ecc2/`, `.claude/` (host-side CC state), `*.log`, `dashboard.html` (personal), `TASKS.md` (personal), `MEMORY.md` (personal).

### Security

- `remoteUser: node` (never root).
- `~/.gitconfig` mounted read-only into `/home/node/.gitconfig` for commit identity without secrets.
- Workspace bind mount stays read-write (development).

### postCreate.sh validation chain

After install + warmup, postCreate runs `npm run verify` (ADR 0003) — if reds, postCreate exits non-zero and the user sees a clear "harness verification failed" banner instead of a silently-broken environment.

### Validation commands (documented in README's Devcontainer section)

```bash
# One-shot smoke
docker build -t ecc-harness:dev -f .devcontainer/Dockerfile .
docker run --rm -v "$PWD:/workspaces/agent_harness" -w /workspaces/agent_harness \
  ecc-harness:dev bash -lc "corepack enable && yarn install --immutable && node tests/run-all.js"

# Full devcontainer
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . npm run verify
devcontainer exec --workspace-folder . claude --version
devcontainer exec --workspace-folder . claude mcp list

# VS Code (Windows host)
code .   # Command Palette → "Dev Containers: Reopen in Container"
```

## Consequences

**Positive**
- New contributors run one command (or open in VS Code) and have a verified environment.
- CI can run `npm run verify` inside the same image as a dev box — no drift.
- MCP first-run is instant (warm cache).
- Sandbox use case (run Claude Code in a clean room with this plugin) works out of the box.

**Negative**
- Maintenance: base image bumps, Yarn version updates, Playwright deps drift. Mitigation: pin versions explicitly; bumps are visible in PRs.
- Disk: ~1.5 GB image + named volumes. Acceptable for a dev-tooling image.
- Windows host: bind-mount perf with `node_modules` on host is poor; named volume is the workaround (already adopted).

**Neutral**
- No effect on host-only Claude Code workflows; devcontainer is opt-in.

## Alternatives Considered

1. **Compose with separate "app" + "mcp-gateway" services.** Rejected: MCP servers are stdio child processes; no second service to host.
2. **Multi-stage Dockerfile.** Rejected: helps when shipping a runtime image without build tools — irrelevant; the devcontainer *is* the build tool.
3. **Alpine base.** Rejected: Playwright/Chromium glibc requirement.
4. **Bake `node_modules` into image.** Rejected: lockfile must be the source of truth; bind-mount + named volume gives best of both.
5. **Pre-warm MCP in `RUN`.** Rejected: bloats image, defeats branch flexibility.

## References

- `package.json` — Yarn 4.9.2, Node ≥18
- `pyproject.toml` and `ecc_dashboard.py` — Python 3.11 dep
- `.mcp.json` — six servers to pre-warm
- `.env.example` — secrets template
- ADR 0003 — `npm run verify` invoked by postCreate
- VS Code Dev Containers spec
