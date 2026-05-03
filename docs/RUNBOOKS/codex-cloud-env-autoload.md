# Codex Cloud Env Autoload Plan

Status: plan
Created: 2026-05-03
Scope: Codex web/cloud sessions for this harness repo

## Ground Truth

- Codex cloud environments are configured in Codex settings, not from the local `~/.codex/config.toml` alone.
- Codex cloud environment variables are available for the full task, including setup and the agent phase.
- Codex cloud secrets are only available to setup scripts and are removed before the agent phase.
- Setup scripts run in a separate Bash session. A bare `export NAME=value` in setup does not persist into the agent phase; use environment settings or write non-secret exports into `~/.bashrc`.
- The local Codex config supports MCP `env`, `env_http_headers`, and `env_vars` fields, but those do not automatically create cloud environment settings.

Sources:
- https://developers.openai.com/codex/cloud/environments
- https://developers.openai.com/codex/config-reference
- https://developers.openai.com/codex/app/local-environments

## Target Outcome

Every new Codex cloud session for this repo starts with the approved harness variables loaded, without copying local secrets blindly and without relying on setup-script exports that disappear before the agent runs.

## Non-Negotiable Constraints

- Do not bulk-export the local process environment.
- Do not commit generated files containing real secret values.
- Do not add a Codex/OpenAI API key for this machine's normal subscription-auth workflow.
- Do not promote a secret into an agent-phase environment variable unless the manifest marks it as an explicit risk acceptance.
- Treat cloud settings mutation as a real integration only if Codex exposes a supported CLI, API, or settings import path. Otherwise, generate a verified import/checklist artifact and stop there.

## Proposed Files

- `.codex/cloud-env.manifest.json`
  - Checked in.
  - Whitelist of allowed variables.
  - Fields: `name`, `phase`, `classification`, `required`, `source`, `cloudName`, `validation`, `notes`.
  - `phase`: `setup`, `agent`, or `both`.
  - `classification`: `public`, `local_path`, `machine_env`, `secret_setup_only`, `agent_sensitive`.

- `scripts/codex/cloud-env-inventory.js`
  - Reads the manifest, local `~/.codex/config.toml`, repo `.env.example` files, devcontainer settings, and selected Windows user environment variables.
  - Emits a redacted report.
  - Fails on undeclared variables, missing required values, or secret-like names not present in the manifest.

- `scripts/codex/cloud-env-export.js`
  - Emits generated, gitignored artifacts:
    - `.codex/generated/cloud-env.public.env`
    - `.codex/generated/cloud-env.settings.md`
    - `.codex/generated/cloud-setup.sh`
    - `.codex/generated/cloud-maintenance.sh`
  - Redacts secrets by default.
  - Requires an explicit `--include-secret-names` flag to include secret names without values.

- `tests/codex/cloud-env-inventory.test.js`
  - Fixture-based tests for classification, redaction, missing-required failures, and denylist enforcement.

## Implementation Steps

1. Inventory the current required cloud variables.
   - Start from the loaded Codex MCP config: `MCP_DOCKER`, `cognitum`, `github`, `context7`, `exa`, `memory`, `playwright`, `sequential-thinking`, and `supabase`.
   - Add harness runtime variables needed by hooks, scripts, package manager detection, and devcontainer setup.
   - Mark Windows-only local paths as local-only unless the cloud setup has a Linux equivalent.

2. Create the manifest and denylist.
   - Deny by pattern first: `*_KEY`, `*_TOKEN`, `*_SECRET`, `*_PASSWORD`, `OPENAI_API_KEY`, `CODEX_API_KEY`.
   - Re-allow only named variables with an explicit classification.
   - Put Cognitum under subscription/user MCP handling; do not introduce a Codex API key.

3. Build the inventory command.
   - Parse TOML with a real TOML parser.
   - Parse `.env` examples with a dotenv parser.
   - Never print full values for secret-like names.
   - Exit non-zero if required values are missing or if a secret-like variable appears outside the manifest.

4. Build the export command.
   - Generate cloud environment variables for `phase = both` and `phase = agent`.
   - Generate cloud setup-only secret names for `phase = setup`.
   - Generate `cloud-setup.sh` that appends only non-secret persisted values to `~/.bashrc`.
   - Generate `cloud-maintenance.sh` for dependency refresh after cached containers resume.

5. Wire Codex cloud settings.
   - If a supported Codex cloud environment API or CLI exists, add a guarded `--apply` mode that updates the selected environment by name.
   - If no supported API exists, keep `--apply` unavailable and use the generated `cloud-env.settings.md` as the exact Codex settings entry checklist.
   - Record the environment name in the manifest, for example `agent-harness-default`.

6. Validate with a real cloud task.
   - Add a non-secret canary variable such as `ECC_CLOUD_ENV_REV=2026-05-03-001`.
   - Confirm it is visible during setup and the agent phase.
   - Add a setup-only secret canary and confirm the setup script can see it while the agent phase cannot.
   - Confirm a changed variable invalidates or refreshes the cached cloud environment as expected.

7. Add operational checks.
   - Add `npm run codex:cloud-env:check`.
   - Add `npm run codex:cloud-env:export`.
   - Add a pre-cloud-session checklist to `docs/RUNBOOKS/codex-cloud-env-autoload.md` after implementation.

## Acceptance Criteria

- `npm run codex:cloud-env:check` fails on missing required variables and passes on the fixture set.
- `npm run codex:cloud-env:export` produces only redacted, gitignored generated artifacts.
- No generated file contains real secret values.
- Codex cloud settings receive every `phase = both` variable through environment settings or a supported API.
- Setup-only secrets are not expected to be visible to the agent phase.
- A real cloud canary task proves the environment revision variable is present in the agent phase.
