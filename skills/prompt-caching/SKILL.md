---
name: prompt-caching
description: Use ephemeral prompt caching to cut latency and cost on repeated long-context calls. Apply cache_control to large, stable blocks (system prompts, tools, large documents) and verify cache hits via response usage metrics.
origin: claude-api-feature-coverage
---

# Prompt Caching

Reduces input cost by ~90% and latency by ~80% on cache hits. Cache scope is per-block via `cache_control: { type: "ephemeral" }`. Default TTL is 5 minutes from last hit.

## When to Use

- System prompts that exceed ~1024 tokens (Sonnet/Opus) or ~2048 tokens (Haiku) and are reused across turns.
- Tool definitions that are large and stable (e.g., generated from an OpenAPI schema).
- Documents you reference repeatedly inside a single agent loop (RAG context, code under review, large transcripts).
- Multi-turn agentic loops where the conversation prefix grows but the cached portion is reused.

Skip caching for:
- Inputs under ~1k tokens.
- Single-shot calls with no expected reuse within 5 minutes.
- Inputs that change every call (no stable prefix).

## How It Works

The cache is content-addressed: the hash of the cached prefix (system + cached blocks) plus the model identity determines the cache key. Cache hits are reported in the response `usage` object:

```json
{
  "usage": {
    "input_tokens": 30,
    "cache_creation_input_tokens": 12000,
    "cache_read_input_tokens": 0,
    "output_tokens": 80
  }
}
```

`cache_creation_input_tokens` charges 25% extra; `cache_read_input_tokens` charges 10% of base.

Up to 4 cache breakpoints per request. Each cached block must be at the cache minimum size; smaller blocks are ignored.

## Examples

### TypeScript (`@anthropic-ai/sdk`)

```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: [
    { type: "text", text: "You are a code reviewer." },
    {
      type: "text",
      text: LARGE_STYLE_GUIDE, // ≥1024 tokens, stable across calls
      cache_control: { type: "ephemeral" },
    },
  ],
  messages: [{ role: "user", content: "Review this PR diff:\n" + diff }],
});

console.log(response.usage);
// { cache_creation_input_tokens: 12000, cache_read_input_tokens: 0, ... }
// On the second call within 5 minutes: cache_read_input_tokens: 12000
```

### Python (`anthropic`)

```python
from anthropic import Anthropic
client = Anthropic()

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=[
        {"type": "text", "text": "You are a code reviewer."},
        {
            "type": "text",
            "text": LARGE_STYLE_GUIDE,
            "cache_control": {"type": "ephemeral"},
        },
    ],
    messages=[{"role": "user", "content": f"Review this PR diff:\n{diff}"}],
)
print(response.usage)
```

## Pitfalls

- **Block ordering matters.** A cached block must precede non-cached content; once a non-cached block appears in a position, everything after it is uncached for that breakpoint.
- **TTL is sliding.** Each cache hit resets the 5-minute timer. Long pauses lose the cache; budget for re-creation cost.
- **Tool definitions count.** If you change one tool, the entire cached tools block invalidates.
- **Model-specific minimums.** Haiku has a higher minimum cacheable block size than Sonnet/Opus.
- **Don't cache PII or secrets.** Cache contents are content-hashed but still flow through the same infra; treat ephemeral cache like any inference input.

## SDK References

- TypeScript: `@anthropic-ai/sdk` >= 0.30 supports `cache_control` natively
- Python: `anthropic` >= 0.40 supports `cache_control` natively
- Anthropic docs: Prompt Caching guide
