---
name: files-api
description: Use the Files API to upload documents (PDFs, images, large text) once, then reference them by ID across many calls. Avoids re-sending bytes per call; pairs naturally with prompt caching.
origin: claude-api-feature-coverage
---

# Files API

Upload-once, reference-by-ID document handling. Replaces inline base64 attachments for repeat use.

## When to Use

- A document is referenced across many calls in a session (RAG, support cases, contract review).
- The document is large (>1 MB) and you want to avoid re-encoding for each call.
- A pipeline (Batches API) needs to reference the same document across many requests.
- You're handling user uploads and want a stable handle without re-uploading on every interaction.

Skip when:
- Single-shot use — inline attachment is simpler.
- Document changes every call.

## How It Works

Upload returns a `file_id`. Reference it inside `messages.content` blocks via `{ type: "document", source: { type: "file", file_id: "..." } }` or `{ type: "image", source: { type: "file", file_id: "..." } }`.

Files have a TTL (varies by plan); they're auto-deleted on expiry, or you can delete them explicitly. Files are namespaced to your workspace.

## Examples

### TypeScript

```ts
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import fs from "node:fs";
const client = new Anthropic();

// 1. Upload
const file = await client.beta.files.upload({
  file: await toFile(fs.createReadStream("./contract.pdf"), "contract.pdf"),
});

// 2. Reference in many calls (cheap)
const r = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  betas: ["files-api-2025-04-14"],
  system: [{ type: "text", text: "You review contracts.", cache_control: { type: "ephemeral" } }],
  messages: [{
    role: "user",
    content: [
      { type: "document", source: { type: "file", file_id: file.id } },
      { type: "text", text: "List the indemnification clauses." },
    ],
  }],
});

// 3. Delete when done
await client.beta.files.delete(file.id);
```

### Python

```python
from anthropic import Anthropic
client = Anthropic()

with open("contract.pdf", "rb") as f:
    file = client.beta.files.upload(file=("contract.pdf", f, "application/pdf"))

r = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    betas=["files-api-2025-04-14"],
    system=[{"type": "text", "text": "You review contracts.", "cache_control": {"type": "ephemeral"}}],
    messages=[{
        "role": "user",
        "content": [
            {"type": "document", "source": {"type": "file", "file_id": file.id}},
            {"type": "text", "text": "List the indemnification clauses."},
        ],
    }],
)

client.beta.files.delete(file.id)
```

## Pitfalls

- **Beta header.** The Files API is currently beta — pass `betas: ["files-api-2025-04-14"]` (or the current beta tag from docs). Stable header eventually.
- **TTL.** Files auto-expire. For long-running pipelines, refresh or pin in your DB.
- **Workspace scope.** `file_id`s are tied to your workspace and not portable across orgs.
- **Cost surprise.** First call still pays full document tokens (no magic discount). Pair with prompt caching to amortize across calls.
- **Allowed types.** PDFs, common image formats, plain text. Verify support for your format before coding to it.

## SDK References

- TypeScript: `@anthropic-ai/sdk` >= 0.30 — `client.beta.files`
- Python: `anthropic` >= 0.40 — `client.beta.files`
- Anthropic docs: Files API guide
