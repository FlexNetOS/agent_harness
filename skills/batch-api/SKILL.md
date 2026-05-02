---
name: batch-api
description: Use the Message Batches API for async, high-volume Claude inference. Trades latency (up to 24h) for ~50% lower cost. Best for offline classification, evaluation runs, content generation pipelines, and bulk RAG indexing.
origin: claude-api-feature-coverage
---

# Message Batches API

Submit up to 100,000 messages per batch; results return within 24 hours (often minutes for small batches). Cost is ~50% of the equivalent sync calls.

## When to Use

- Offline classification (label millions of items).
- Evaluation harness runs (run an eval suite against many model versions).
- Content generation pipelines that don't need real-time responses (newsletter articles, product descriptions).
- Bulk dataset annotation or RAG document summarization.
- Backfilling historical data with model outputs.

Skip when:
- Latency matters (user-facing, agent loops).
- You need to chain outputs (one call's result feeds the next).
- The batch is tiny (<10 calls) — the orchestration overhead isn't worth it.

## How It Works

A batch is a list of `requests`, each with a unique `custom_id` and a standard `params` object (same shape as a sync `messages.create` call). The API returns a batch ID; you poll for completion or list results.

```
POST /v1/messages/batches
[
  { "custom_id": "doc-001", "params": { "model": "claude-sonnet-4-6", ... } },
  { "custom_id": "doc-002", "params": { "model": "claude-sonnet-4-6", ... } }
]
```

Per-request `params` may include `cache_control`, tools, system prompts, and `thinking` — the same surface as the sync API.

## Examples

### TypeScript

```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

// 1. Create
const batch = await client.messages.batches.create({
  requests: docs.map((doc, i) => ({
    custom_id: `doc-${i}`,
    params: {
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Summarize:\n${doc}` }],
    },
  })),
});

// 2. Poll
let status = batch;
while (status.processing_status !== "ended") {
  await new Promise(r => setTimeout(r, 30_000));
  status = await client.messages.batches.retrieve(batch.id);
}

// 3. Stream results (JSONL)
const results = await client.messages.batches.results(batch.id);
for await (const item of results) {
  if (item.result.type === "succeeded") {
    console.log(item.custom_id, item.result.message.content);
  } else {
    console.error(item.custom_id, item.result.error);
  }
}
```

### Python

```python
from anthropic import Anthropic
client = Anthropic()

batch = client.messages.batches.create(
    requests=[
        {
            "custom_id": f"doc-{i}",
            "params": {
                "model": "claude-sonnet-4-6",
                "max_tokens": 512,
                "system": [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
                "messages": [{"role": "user", "content": f"Summarize:\n{doc}"}],
            },
        }
        for i, doc in enumerate(docs)
    ]
)

while batch.processing_status != "ended":
    time.sleep(30)
    batch = client.messages.batches.retrieve(batch.id)

for item in client.messages.batches.results(batch.id):
    if item.result.type == "succeeded":
        print(item.custom_id, item.result.message.content)
```

## Pitfalls

- **`custom_id` must be unique per batch.** Use stable, idempotent IDs so partial-failure retries don't duplicate.
- **Per-request errors don't fail the batch.** Always inspect `item.result.type` — `succeeded`, `errored`, `expired`, or `canceled`.
- **24-hour SLA, not real-time.** Don't build a user flow on it.
- **No streaming.** You only get full responses, not token-by-token output.
- **Rate-limit aware.** Batches count against your overall token-per-minute budget when they execute.
- **Cache interactions.** Cache breakpoints in batch requests work, but the cache is a single shared cache — duplicates within a batch can still hit the cache.

## SDK References

- TypeScript: `@anthropic-ai/sdk` >= 0.30
- Python: `anthropic` >= 0.40
- Anthropic docs: Message Batches API
