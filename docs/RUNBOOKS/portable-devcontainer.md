# Portable DevContainer — Use agent_harness Against Any Project

This runbook explains how to use the `agent_harness` devcontainer as a portable
tooling layer against arbitrary sibling projects, with `prompt-nexus` attached
as a sidecar workspace.

It uses **plain Docker Compose**. VS Code is optional.

If you just want to develop `agent_harness` itself, use the existing single-container
devcontainer (`.devcontainer/devcontainer.json`) instead — this runbook does not
apply. See ADR 0004.

## When to use this flow

Use it when:
- You want to open a project that is **not** `agent_harness` (e.g., `ai-top-utility`)
  but want all of agent_harness's agents/skills/commands available as tooling.
- You want `prompt-nexus` running concurrently as a sidecar.
- You want one canonical setup that works on Linux, macOS, WSL, and Docker Desktop
  on Windows without per-OS branching.

## One-time per host: align `~/.config`

The container bind-mounts the host's `~/.config` directory into
`/home/node/.config`. This keeps `gh auth`, Claude state, and any other
XDG-aware tool's config persistent across rebuilds and consistent with what
you use on the host.

Linux and macOS already use `~/.config/` as the canonical XDG dir, so nothing
needs to change. Windows defaults to `%AppData%\GitHub CLI` for `gh` and
similarly fragments other tools. To align Windows with the Linux/macOS shape,
run these commands **once** (in `cmd.exe` on Windows; PowerShell users can
substitute `$env:USERPROFILE`):

```cmd
setx GH_CONFIG_DIR     "%USERPROFILE%\.config\gh"
setx XDG_CONFIG_HOME   "%USERPROFILE%\.config"
robocopy "%AppData%\GitHub CLI" "%USERPROFILE%\.config\gh" /MIR
```

After this, `gh` on the Windows host writes to `%USERPROFILE%\.config\gh`
matching Linux/macOS, and the same `HOST_CONFIG_DIR=/c/Users/<user>/.config`
mount works on every host.

Verify:

```bash
gh auth status            # should report "Logged in"; if not, run `gh auth login`
ls "$USERPROFILE/.config/gh/hosts.yml"   # Windows: should exist
ls "$HOME/.config/gh/hosts.yml"          # mac/Linux: should exist
```

## One-time per machine: clone agent_harness

```bash
git clone https://github.com/FlexNetOS/agent_harness.git
cd agent_harness
cp .devcontainer/.env.example .devcontainer/.env
$EDITOR .devcontainer/.env
```

Edit the four host-path variables to match your machine. The `.env` file is
gitignored; never commit it.

## Per project: bring up the harness against a target

```bash
# From inside the agent_harness checkout
docker compose -f .devcontainer/docker-compose.yml \
               --env-file .devcontainer/.env \
               config        # validates env-var substitution

docker compose -f .devcontainer/docker-compose.yml \
               --env-file .devcontainer/.env \
               up -d         # starts harness + prompt-nexus

docker compose -f .devcontainer/docker-compose.yml \
               exec harness bash   # interactive shell
```

Inside the resulting shell:

- `pwd` should be `/workspaces/<HARNESS_TARGET_NAME>` (e.g., `/workspaces/ai-top-utility`)
- `ls /workspaces` should show `agent_harness`, `<target>`, and `prompt-nexus`
- `gh auth status` should report logged in
- `git config --get commit.gpgsign` should print `false`
- `claude --version` and `claude mcp list` should work

The sidecar is reachable on the `ah-net` network as `prompt-nexus`:

```bash
docker compose exec harness bash -lc 'getent hosts prompt-nexus'
docker compose exec prompt-nexus bash -lc 'cd /app && pwd && ls'
```

## To switch to a different target project

```bash
docker compose -f .devcontainer/docker-compose.yml down       # keeps named volumes
$EDITOR .devcontainer/.env                                    # change HARNESS_TARGET_*
docker compose -f .devcontainer/docker-compose.yml \
               --env-file .devcontainer/.env up -d            # reuses cached deps
```

The `ecc-node-modules`, `ecc-yarn-cache`, `ecc-npm-cache`, and `ecc-claude-state`
named volumes survive `down` — only `down -v` clears them. So switching
targets is fast.

## To add a third sidecar

Create `.devcontainer/docker-compose.override.yml`:

```yaml
services:
  third-thing:
    image: node:20-bookworm
    user: node
    working_dir: /app
    volumes:
      - ${THIRD_THING_HOST}:/app:cached
    command: sleep infinity
    networks: [ah-net]
```

Add `THIRD_THING_HOST=...` to `.env`. Compose merges the override automatically.

## Troubleshooting

### `gh auth status` reports "not logged in" in the container

Most common cause: `GITHUB_TOKEN` or `GH_TOKEN` is leaking into the container
from the host. The `/etc/profile.d/ecc-env.sh` drop unsets them on every
interactive login shell, but a non-login shell or a tool that re-injects the
token can shadow stored auth.

Check inside the container:

```bash
echo "GITHUB_TOKEN=$GITHUB_TOKEN GH_TOKEN=$GH_TOKEN"   # both should be empty
ls /home/node/.config/gh/hosts.yml                      # should exist
```

If `hosts.yml` is missing, the host bind-mount path is wrong — verify
`HOST_CONFIG_DIR` in `.env` points at the parent of `gh/`.

### Commit fails with "Couldn't load public key C:\..."

The host's `user.signingkey` is bleeding through `~/.gitconfig`. The Dockerfile
disables signing at the system level, but a per-user `~/.gitconfig` mount
wins. Either:

```bash
git config --local commit.gpgsign false   # one repo
# OR
git config --global commit.gpgsign false  # all repos in the container
```

### Compose substitution silently produces empty mounts

If `.env` is missing a variable, Compose substitutes empty string and you get
`""` mounts that fail with cryptic errors. Always run `docker compose config`
before `up` — it shows the resolved spec and fails loudly on missing vars.

### `npm run verify` fails with stale-deps errors

Named volumes can get out of sync after a yarn or Node version bump. Reset:

```bash
docker compose down -v   # WARNING: clears all caches
docker compose --env-file .env up -d
docker compose exec harness bash -lc 'npm run verify'
```

## Why VS Code is not required

The single-container `.devcontainer/devcontainer.json` is wired for VS Code's
"Reopen in Container" workflow. The compose flow above does not depend on it
— `docker compose up -d` and `docker compose exec` are sufficient. VS Code,
Cursor, JetBrains, or any IDE can attach to the running `ecc-harness`
container after the fact via their respective "attach to running container"
features.

## Architecture rationale

See `docs/architecture/adr/0005-portable-multicontainer.md` — particularly the
"MCP topology — unchanged" section. MCP servers remain stdio children of
`claude` inside the `harness` service. The sidecar is a workspace-only
artifact, not an MCP protocol peer. **Do not containerize MCP servers into
compose services** — they expect fork/pipe semantics that `docker exec`
shims cannot replicate.
