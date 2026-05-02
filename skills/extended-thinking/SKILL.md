---
name: extended-thinking
description: Use Claude's extended thinking mode for hard reasoning tasks (architecture, ambiguous bugs, deep research) by enabling a thinking budget. Best with Opus 4.7. Pair with prompt caching when the system prompt is stable.
origin: claude-api-feature-coverage
---

# Extended Thinking

Allows Claude to produce structured internal reasoning before its visible response. Enabled per-call via `thinking: { type: "enabled", budget_tokens: ... }`.

## When to Use

- Architecture and design decisions where multiple options must be weighed.
- Ambiguous bug investigation where the root cause is non-obvious.
- Math, formal logic, or proof-style problems.
- Research synthesis across many heterogeneous documents.
- Multi-constraint optimization (trade-off frameworks, scheduling, planning).

Skip when:
- The task is mechanical or pattern-matching (formatting, simple transforms).
- Latency budget is tight and the task is well-scoped.
- You're paying for tokens in a tight cost loop and the gain is marginal.

## How It Works

The model emits `thinking` blocks (and optionally `redacted_thinking` blocks) before the visible `text` response. Thinking tokens count against `budget_tokens` and are billed as output. The visible response remains within `max_tokens`.

```json
{
  "thinking": { "type": "enabled", "budget_tokens": 8000 },
  "max_tokens": 4000
}
```

`budget_tokens` must be less than `max_tokens` minus a safety margin. The model can use less than the budget — unused tokens aren't billed.

Use Opus 4.7 (`claude-opus-4-7`) for the deepest reasoning. Sonnet 4.6 (`claude-sonnet-4-6`) supports extended thinking with a smaller effective ceiling.

## Examples

### TypeScript

```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 16000,
  thinking: { type: "enabled", budget_tokens: 8000 },
  system: [{ type: "text", text: ARCHITECTURE_CONTEXT, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: "Design a sharding strategy for the user table." }],
});

for (const block of response.content) {
  if (block.type === "thinking") {
    // Optional: log reasoning for audit; do NOT show to end users by default
    console.error("[thinking]", block.thinking);
  } else if (block.type === "text") {
    console.log(block.text);
  }
}
```

### Python

```python
from anthropic import Anthropic
client = Anthropic()

response = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=16000,
    thinking={"type": "enabled", "budget_tokens": 8000},
    system=[{"type": "text", "text": ARCHITECTURE_CONTEXT, "cache_control": {"type": "ephemeral"}}],
    messages=[{"role": "user", "content": "Design a sharding strategy for the user table."}],
)
for block in response.content:
    if block.type == "thinking":
        pass  # internal — log to audit, not to user
    elif block.type == "text":
        print(block.text)
```

## Pitfalls

- **Don't show thinking blocks to end users.** They are draft reasoning, often meandering, sometimes wrong on the way to a correct answer. Treat them as audit-only.
- **Redacted blocks.** When the model self-detects sensitive content in its own reasoning, it returns `redacted_thinking` instead of `thinking`. Your code should handle both.
- **Tool use interaction.** Thinking blocks can precede tool calls. Preserve them across tool-call cycles by including prior `thinking` blocks back in the conversation history.
- **Cost scales with budget.** A `budget_tokens: 32000` call can be 3-5x more expensive than the same call without thinking. Set budgets deliberately.
- **Caching compatibility.** Extended thinking works with prompt caching, but the thinking content is not cached — only the input prefix.

## SDK References

- TypeScript: `@anthropic-ai/sdk` >= 0.30
- Python: `anthropic` >= 0.40
- Anthropic docs: Extended Thinking guide
