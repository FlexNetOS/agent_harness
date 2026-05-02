# ADR 0002 — Claude API Feature Coverage

- **Status:** Proposed
- **Date:** 2026-05-01
- **Deciders:** Harness maintainers
- **Related:** ADR 0001 (model migration), ADR 0003 (verification)

## Context

The harness has strong coverage of *workflow* concerns (testing, code review, debugging, refactoring) and *MCP-as-client* concerns (six wired servers, 19+ template configs). It has weak coverage of several first-party Claude API features that any modern Claude application is expected to use:

| Feature | Currently in harness? |
|---|---|
| Prompt caching (`cache_control: { type: "ephemeral" }`) | No |
| Extended thinking (`thinking: { type: "enabled", budget_tokens }`) | No |
| Message Batches API | No |
| Computer use tool surface | No (mentioned only pedagogically) |
| Files API | No |
| Native citations API (`citations` blocks) | No (only MCP-surfaced citations) |
| Claude Agent SDK patterns | No |
| Tool use / function calling | Partial (MCP-only; no SDK-level tool_choice patterns) |
| Compaction / context management | Yes (`strategic-compact` skill, hook) |
| MCP as client | Yes (six servers in `.mcp.json`) |
| Subagents / Task tool | No |
| Hooks | Yes (comprehensive framework) |

A "perfect comprehensive agent harness" should ship first-class skills for each of these so consumers learn the right patterns by example.

## Decision

Add seven new skill directories under `skills/`, one per missing feature. Each skill follows the existing format (`SKILL.md` with `When to Use`, `How It Works`, `Examples`) and provides both a TypeScript example (`@anthropic-ai/sdk`) and a Python example (`anthropic`) where applicable. Examples include prompt caching by default per the Claude API skill's project guidelines.

| Skill | Directory | Covers |
|---|---|---|
| Prompt Caching | `skills/prompt-caching/` | `cache_control` ephemeral cache, 5-min TTL, hit-rate measurement, multi-block caching, cache scope rules |
| Extended Thinking | `skills/extended-thinking/` | `thinking: { type: "enabled", budget_tokens }`, when to use Opus 4.7, summary vs full thinking, redaction safety |
| Batch API | `skills/batch-api/` | Message Batches API for async/bulk jobs, polling, result fetching, cost trade-offs vs sync |
| Computer Use | `skills/computer-use/` | Tool surface, screenshot loop, safety gates, allowed-applications list, tier model |
| Files API | `skills/files-api/` | Upload patterns, file references in messages, lifecycle, deletion, document grounding |
| Citations API | `skills/citations-api/` | Native `citations` blocks, document-grounded responses, comparison with MCP-mediated citations |
| Claude Agent SDK | `skills/claude-agent-sdk/` | Building custom agents with the Claude Agent SDK, subagent patterns, tool-use loops |

**Conventions for new skill files:**

- YAML frontmatter: `name`, `description`, `origin: claude-api-feature-coverage` (so they're traceable as a cohort).
- Sections: `## When to Use`, `## How It Works`, `## Examples`, `## Pitfalls`, `## SDK References`.
- Examples must be self-contained (importable) and tagged with the SDK version they target.
- Each skill cross-references the relevant Anthropic docs URL.
- Examples MUST use Claude 4.X model IDs (per ADR 0001) — not aliases.

**Future work** (not in this ADR):
- Embed an MCP server *for the harness itself* — would let other Claude clients consume the harness's skills/agents/rules over MCP. Tracked as a Someday task.
- A "subagent orchestration" skill that wraps the Task tool (when its parameter shape stabilizes across versions).

## Consequences

**Positive**
- Consumers learning from this harness see modern, working examples of every Claude feature.
- Marketplace differentiation: this becomes the reference plugin for "doing it right."
- New skills are additive — no existing skill changes.

**Negative**
- 7 new skill directories increase the total skill count (already 182). Skill-discovery hygiene matters; each new skill must justify itself in its `description`.
- Examples need maintenance as SDK versions evolve. Mitigation: pin SDK versions in each example's import comment; CI test (future) can lint for stale versions.

**Neutral**
- Existing skills are untouched.

## Alternatives Considered

1. **One mega-skill "claude-api-features".** Rejected: each feature has a distinct activation context; skills are easier to retrieve when narrow.
2. **Reference docs only, no examples.** Rejected: a skill without an example is just a link; the value is in showing the working pattern.
3. **Skills under a subfolder (`skills/claude-api/...`).** Rejected: the existing harness layout is flat at `skills/<name>/`; staying consistent.

## References

- `skills/strategic-compact/SKILL.md` — existing example of context-management skill, format reference
- Anthropic API docs: prompt caching, extended thinking, batches, computer use, files, citations
- Claude Agent SDK reference
- `package.json` — confirms harness has no `@anthropic-ai/sdk` runtime dep (examples are illustrative; not executed by the harness)
