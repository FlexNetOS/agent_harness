---
name: claude-agent-sdk
description: Build production agents with the Claude Agent SDK — tool loops, subagent orchestration, MCP integration, and durable session state. Use this skill to scaffold an agent that does more than a single API call.
origin: claude-api-feature-coverage
---

# Claude Agent SDK

The Claude Agent SDK is the higher-level Anthropic SDK for building agents. It wraps the Messages API with tool dispatch, MCP-as-client, subagent delegation, structured outputs, retries, and session persistence.

## When to Use

- You need an agent loop (tool call -> tool execute -> tool result -> next call) and don't want to hand-roll the orchestration.
- The agent should consume MCP servers (filesystem, database, API gateway) as tools.
- You want subagent delegation (parent agent spawns specialist subagents for parts of a task).
- You need structured outputs (JSON Schema-validated) without writing your own validator loop.
- Multi-turn sessions need to persist (session resume, context carryover).

Skip when:
- A single `messages.create` call answers the question — drop down to the Messages API directly.
- You're embedding Claude in a non-agent product (chat UI, autocomplete) — the lower-level API is fine.

## How It Works

The Agent SDK exposes:

- `Agent` — top-level orchestrator with `system`, `tools`, `mcpServers`, `model`.
- Tool registration — local tool functions or MCP servers (stdio/http).
- Subagent definitions — specialized child agents the parent can dispatch to.
- `agent.run(input)` — runs the loop until terminal state (final text, error, or budget exhausted).

The SDK handles:
- The tool-call -> tool-result -> next-call loop.
- Backoff on rate limits.
- Stream parsing.
- Structured-output retries.
- Session ID + resumption tokens.

## Examples

### TypeScript scaffold

```ts
import { Agent } from "@anthropic-ai/agent-sdk"; // illustrative; check your installed version

const agent = new Agent({
  model: "claude-sonnet-4-6",
  system: [
    { type: "text", text: "You are a code-review agent.", cache_control: { type: "ephemeral" } },
    { type: "text", text: STYLE_GUIDE, cache_control: { type: "ephemeral" } },
  ],
  tools: [
    {
      name: "read_file",
      description: "Read a repo-relative file.",
      input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      handler: async ({ path }) => ({ content: await fs.readFile(path, "utf8") }),
    },
  ],
  mcpServers: {
    github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github@2025.4.8"] },
  },
  subagents: {
    "deep-investigator": {
      model: "claude-opus-4-7",
      system: "Investigate gnarly bugs by reading code paths exhaustively.",
      thinking: { type: "enabled", budget_tokens: 8000 },
    },
  },
});

const result = await agent.run({
  input: "Review the diff at PR #42, delegate to deep-investigator if you find a security smell.",
  session_id: "review-pr-42",
});

console.log(result.text);
```

### Python scaffold

```python
from anthropic_agent_sdk import Agent  # illustrative import path

agent = Agent(
    model="claude-sonnet-4-6",
    system=[
        {"type": "text", "text": "You are a code-review agent.", "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": STYLE_GUIDE, "cache_control": {"type": "ephemeral"}},
    ],
    tools=[read_file_tool],
    mcp_servers={
        "github": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-github@2025.4.8"]},
    },
    subagents={
        "deep-investigator": {
            "model": "claude-opus-4-7",
            "system": "Investigate gnarly bugs by reading code paths exhaustively.",
            "thinking": {"type": "enabled", "budget_tokens": 8000},
        },
    },
)

result = agent.run(
    input="Review the diff at PR #42, delegate to deep-investigator if you find a security smell.",
    session_id="review-pr-42",
)

print(result.text)
```

## Pitfalls

- **API surface is moving.** Pin the SDK version in `package.json` / `pyproject.toml`. Snapshot the schemas you depend on.
- **Tool handlers must be idempotent.** The loop can re-issue the same tool call after a stream interruption. Design handlers to tolerate replay.
- **Subagent costs.** Each subagent dispatch is a fresh model call, often on a more expensive model. Set budgets explicitly.
- **MCP server lifetimes.** `npx`-spawned servers stay alive for the agent process. Long-running agents should `agent.close()` to drain them.
- **Session storage is your job.** The SDK gives you a session ID; persistence (Redis, SQLite, etc.) is yours to wire.
- **Don't reinvent the loop.** If you find yourself parsing tool calls manually, drop back into the Messages API instead of fighting the SDK.

## SDK References

- TypeScript: `@anthropic-ai/agent-sdk` (canonical name as of writing — verify package name in current docs)
- Python: `anthropic-agent-sdk` (verify name)
- Anthropic docs: Claude Agent SDK guide and API reference
- Related: this harness's `agents/` directory uses the simpler agent-frontmatter format consumed directly by Claude Code; the Agent SDK is for building standalone agent apps outside the IDE.
