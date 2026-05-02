# MCP Server Configurations

This directory holds the **template / reference** catalog of MCP servers that work well with this harness. The **live** servers — the ones Claude Code actually connects to — are declared in the repo-root `.mcp.json` instead.

Two tiers, one source of truth per tier.

## Tiering

| Tier | File | Purpose |
|---|---|---|
| **Live** | `../.mcp.json` | Servers Claude Code starts on launch. Keep this set small (recommended ≤10) so the context window isn't dominated by tool definitions. |
| **Templates** | `./mcp-servers.json` | Reference configurations for ~27 useful servers. Most have placeholder env vars (e.g., `YOUR_GITHUB_PAT_HERE`). Copy entries into `.mcp.json` only when you actually need them. |

`.claude-plugin/plugin.json` deliberately leaves `mcpServers: {}` empty and defers to `.mcp.json` — see ADR 0003 for rationale.

## Live Set (current)

The six servers wired in `.mcp.json`:

| Server | Package | Auth |
|---|---|---|
| `github` | `@modelcontextprotocol/server-github@2025.4.8` | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| `context7` | `@upstash/context7-mcp@2.1.4` | optional `CONTEXT7_API_KEY` |
| `exa` | HTTPS endpoint `https://mcp.exa.ai/mcp` | `EXA_API_KEY` (sent in request headers per Exa docs) |
| `memory` | `@modelcontextprotocol/server-memory@2026.1.26` | none |
| `playwright` | `@playwright/mcp@0.0.69` (--extension) | none (browser perms) |
| `sequential-thinking` | `@modelcontextprotocol/server-sequential-thinking@2025.12.18` | none |

## Available Templates

`mcp-servers.json` includes (non-exhaustive):

- **Issue trackers** — `jira` (Atlassian), `confluence`, `linear` (where available)
- **Code hosts** — `github` (already live), additional GH variants
- **Databases** — `supabase`, `clickhouse`, `filesystem`
- **Search & web** — `firecrawl`, `exa-web-search`, `browser-use`, `browserbase`
- **Cloud** — `vercel`, `railway`, `cloudflare-docs`, `cloudflare-workers-bindings`, `cloudflare-workers-builds`, `cloudflare-observability`
- **Memory & state** — `omega-memory`, `memory` (already live)
- **Build & ops** — `magic`, `playwright` (already live), `token-optimizer`, `devfleet`, `evalview`
- **Misc** — `fal-ai`, `laraplugins`

## Adding a Server to the Live Set

1. Pick the entry from `mcp-servers.json` (or author a new one).
2. Substitute env-var placeholders for real values; **never commit secrets**. Keep secrets in your shell or `.env` (gitignored).
3. Copy the entry into `.mcp.json` under `mcpServers`.
4. Run `npm run verify` (see ADR 0003) — the MCP smoke check will report whether the server starts and whether required env vars are set.
5. Restart Claude Code so the new server loads on session start.

## Removing a Server from the Live Set

1. Delete the entry from `.mcp.json`.
2. Restart Claude Code.
3. (Optional) Move the entry back into `mcp-servers.json` for future reuse, sanitizing any real values to placeholders.

## Why Two Tiers

Claude Code loads every entry in `.mcp.json` at session start; each server's tool definitions consume context window. Templates in this directory let us keep a curated catalog of "known-good" configurations without paying that cost upfront. New users start with the live six and opt in to more as they need them.

## Auth & Secrets

- Never commit auth tokens, even in templates. Use the `YOUR_X_HERE` convention so a forgotten secret is loud.
- For local development, prefer a host-side `.env` (gitignored) and load via your shell or a tool like `direnv`.
- For containerized development (see ADR 0004), the `.devcontainer/devcontainer.json` loads `.env` via `runArgs` — secrets never enter image layers.

## Health Checking

Run `npm run verify` (or `node scripts/verify-harness.js`) for an end-to-end check including a per-server MCP smoke test. The smoke test reports:

- **OK** — server installed and responds to `--help`
- **WARN** — server installed but required env vars look unset
- **ERROR** — server failed to install or respond

Skip the MCP portion with `node scripts/verify-harness.js --skip-mcp` for fast iteration.
