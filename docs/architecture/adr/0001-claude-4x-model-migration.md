# ADR 0001 — Claude 4.X Model Migration

- **Status:** Proposed
- **Date:** 2026-05-01
- **Deciders:** Harness maintainers
- **Related:** ADR 0002 (feature coverage), ADR 0003 (verification)

## Context

The harness currently uses Claude Code's three model aliases — `haiku`, `sonnet`, `opus` — across all 48 agents. The validator at `scripts/ci/validate-agents.js:11` enforces only those three aliases:

```js
const VALID_MODELS = ['haiku', 'sonnet', 'opus'];
```

Aliases are convenient: Claude Code's runtime resolves them to "the latest" model in each tier. They are also fragile for our use case:

1. **Reproducibility.** Two runs of the same agent on different days can use different underlying models silently. Quality regressions are hard to root-cause.
2. **Capability gating.** Some features (extended thinking budgets, computer use surface, citations API quirks) behave differently between model versions. Aliases hide that.
3. **Peer-IDE drift.** `.opencode/opencode.json` and `.codex-plugin/plugin.json` already pin to model IDs (`claude-opus-4-5`, etc.) — but those are stale (4.5, not the current 4.X family). Aliases inside Claude Code's surface and pinned IDs in peer-IDE surfaces have already drifted.
4. **Marketplace expectations.** Plugin consumers reasonably expect agents to declare what they were authored against.

The latest Claude family (as of 2026-05-01) is 4.X:

- **Opus 4.7** — `claude-opus-4-7`
- **Sonnet 4.6** — `claude-sonnet-4-6`
- **Haiku 4.5** — `claude-haiku-4-5-20251001`

## Decision

Pin every agent in `agents/` to a specific Claude 4.X model ID, and extend the validator to accept both pinned IDs and the legacy aliases (the latter for backward-compat with downstream consumers who haven't migrated yet).

**Mapping rule** (one-shot migration):

| Old | New |
|---|---|
| `model: opus` | `model: claude-opus-4-7` |
| `model: sonnet` | `model: claude-sonnet-4-6` |
| `model: haiku` | `model: claude-haiku-4-5-20251001` |

**Validator change** (`scripts/ci/validate-agents.js`):

```js
const VALID_MODEL_ALIASES = ['haiku', 'sonnet', 'opus'];
const VALID_MODEL_IDS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
];
const VALID_MODELS = [...VALID_MODEL_ALIASES, ...VALID_MODEL_IDS];
```

**Migration tool:** ship `scripts/migrate-agent-models.js` — idempotent, supports `--dry-run`, prints a unified diff before writing, exits non-zero if any agent has a model field the script doesn't recognize.

**Test:** add `tests/ci/validate-agents-models.test.js` asserting every agent under `agents/` has a `model` field that is in `VALID_MODEL_IDS` (post-migration). Aliases are accepted by the validator but discouraged by the test for first-party agents.

## Consequences

**Positive**
- Reproducible agent behavior over time.
- Frontmatter becomes self-documenting about capability targets.
- Future model bumps are explicit, reviewable PRs (one search-and-replace per generation).

**Negative**
- 48 files churn in a single migration commit.
- Each Claude generation requires a new migration commit (mitigated by `migrate-agent-models.js` being idempotent and re-runnable).
- Plugin consumers who were depending on alias semantics need a release-notes callout.

**Neutral**
- Validator stays backward-compatible: aliases still pass.
- No runtime change inside Claude Code; the resolver accepts both forms.

## Alternatives Considered

1. **Keep aliases everywhere.** Rejected: loses reproducibility; conflict with the user's stated preference.
2. **Hybrid (pin only critical agents).** Rejected: introduces a two-tier policy that future contributors will violate without realizing it.
3. **Move pinning into a separate `model-policy.json`.** Rejected: adds an indirection layer that doesn't pay for itself; agent frontmatter is the natural home.

## References

- `scripts/ci/validate-agents.js` — current validator
- `agents/*.md` — 48 agents to migrate
- `.opencode/opencode.json`, `.codex-plugin/plugin.json` — peer-IDE configs to align (covered by §3d of the parent plan)
- Anthropic SDK model ID conventions
