# Container Persistence

agent_harness participates in a Claude session that spans multiple containers
(this repo, prompt_hub, future projects). Hooks, verdicts, and shared scripts
need to follow the user across containers without bind-mounting the host
filesystem (which fails in cloud sessions where the host has no `prompt_hub`
clone).

## Solution: docker named volume on the .vhdx disk

Docker Desktop on Windows stores named volumes inside the WSL2 backing disk
(`docker-desktop-data.vhdx`). Anything written to a named volume persists
across container restarts, rebuilds, and even uninstalls of individual
projects — until the volume itself is removed.

We use a single shared volume for all Claude state:

| Volume name | Mount path inside container | Source-of-truth | Owners |
|-------------|------------------------------|-----------------|--------|
| `claude-shared-state` | `/mnt/claude-shared` | PromptNexus assets | All Claude-aware containers |

### What lives in the volume

```
/mnt/claude-shared/
+-- hooks/
|   +-- btoo-stop-gate.js          <- PromptNexus Stop-gate (Haiku auditor)
|   +-- prompt-listener.js         <- PromptNexus UserPromptSubmit listener
|   +-- ...
+-- evals/
|   +-- verdict.schema.json        <- BTOO verdict schema v1.0.0
|   +-- principles/                <- 9 principle definitions
|   +-- verdicts/                  <- per-turn verdict files (rotating)
+-- commands/
    +-- btoo-check.md              <- /btoo-check on-demand audit
```

The marker file is `hooks/btoo-stop-gate.js`. If it exists, the volume is
considered populated.

## Provisioning

### Devcontainer (this repo)

[.devcontainer/devcontainer.json](../.devcontainer/devcontainer.json) declares:

```json
"initializeCommand": "node scripts/setup.js --init-env-only && docker volume create claude-shared-state",
"mounts": [
  "...",
  "source=claude-shared-state,target=/mnt/claude-shared,type=volume"
]
```

`initializeCommand` runs **on the host** before `docker run`, so the volume
exists by the time `--env-file=.env` and the volume mount resolve. The full
populate (rsync from a PromptNexus clone) runs inside the container in
`postCreate.sh -> node scripts/setup.js`, which calls
[scripts/lib/shared-volume.js](../scripts/lib/shared-volume.js).

### Manual (host shell)

```sh
docker volume create claude-shared-state
node scripts/setup.js   # populates the volume from the first source it can find
```

Source discovery order (first match wins):

1. `$PROMPT_NEXUS_PATH` env var
2. `/workspaces/prompt_hub/prompt-nexus`
3. `/workspaces/prompt-nexus`
4. `$HOME/AI-Workspace/_projects/prompt_hub/prompt-nexus`
5. `$HOME/AI-Workspace/_projects/prompt-nexus`

If none match, the populate is a no-op and the Stop-gate is reported as
inactive in every UserPromptSubmit injection (see
[STANDARDS-ENFORCEMENT.md](STANDARDS-ENFORCEMENT.md)).

## Inspection

```sh
# What's in the volume?
docker run --rm -v claude-shared-state:/data alpine ls -la /data

# Volume metadata (mountpoint on the .vhdx)
docker volume inspect claude-shared-state

# Disk usage
docker system df -v | grep claude-shared-state
```

## Backup / restore

```sh
# Snapshot to a tarball
docker run --rm -v claude-shared-state:/src -v "$PWD":/dst alpine \
  tar czf /dst/claude-shared-$(date +%Y%m%d).tar.gz -C /src .

# Restore
docker run --rm -v claude-shared-state:/dst -v "$PWD":/src alpine \
  sh -c 'cd /dst && tar xzf /src/claude-shared-YYYYMMDD.tar.gz'
```

## Nuke and rebuild

If you need to reset (corrupt verdicts, schema upgrade, etc.):

```sh
docker volume rm claude-shared-state          # destroys the volume
docker volume create claude-shared-state      # recreate empty
node scripts/setup.js                         # re-populate from PromptNexus
```

`btoo-directives` will report `Stop-gate: inactive` between the rm and the
re-populate, so the failure mode is visible rather than silent.

## Cross-container verification

The whole point of the volume is that two containers see the same state.
Smoke test:

```sh
# Container A (agent_harness)
docker run --rm -v claude-shared-state:/mnt/claude-shared alpine \
  sh -c 'echo {turn:abc} > /mnt/claude-shared/evals/verdicts/test.json'

# Container B (prompt_hub or any other)
docker run --rm -v claude-shared-state:/mnt/claude-shared alpine \
  cat /mnt/claude-shared/evals/verdicts/test.json
# Expected: {turn:abc}
```

Both containers see the same `verdicts/test.json` because they are reading
the same .vhdx-backed volume.

## Why not a host bind-mount?

A bind-mount like `-v $HOME/AI-Workspace/_projects/prompt-nexus:/mnt/prompt-nexus`
would work on the developer's host but fails in cloud sessions (Cowork,
Codespaces, gitpod), where the host filesystem has no such directory. Named
volumes are portable: as long as the workflow ships its own `setup.js`
populator (this repo does), every host can boot the same container layout.
