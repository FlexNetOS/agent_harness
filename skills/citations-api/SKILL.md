---
name: citations-api
description: Generate document-grounded responses with native citation blocks tying every claim back to source spans. Different from MCP-mediated citations (web search results); this is server-side, structured, and verifiable.
origin: claude-api-feature-coverage
---

# Citations API

Server-side document grounding. When you supply documents with `citations: { enabled: true }`, the model emits structured `citation` blocks pointing at exact spans of source text.

## When to Use

- Compliance / legal / medical use cases where each claim needs an auditable source.
- RAG systems where you want verifiable provenance, not vibes.
- Customer support where the agent must cite the policy section it relied on.
- Internal knowledge-base assistants where users need to click through to the source.

Skip when:
- Sources are too small to need citations (one short doc).
- You're doing free-form generation rather than fact-grounded answers.

## How It Works

Pass each source document as a content block with `citations: { enabled: true }`. Documents can be plain text (with character offsets), structured text (with custom indices), or PDFs (with page numbers).

The model's response interleaves `text` blocks with `citation` blocks. Each citation references one or more source spans by `document_index`, `start_char_index`/`end_char_index`, `start_page_number`/`end_page_number`, or `start_block_index`/`end_block_index` depending on document type.

## Examples

### TypeScript

```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

const r = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: [{ type: "text", text: "Answer with citations.", cache_control: { type: "ephemeral" } }],
  messages: [{
    role: "user",
    content: [
      {
        type: "document",
        title: "Refund Policy",
        source: { type: "text", media_type: "text/plain", data: REFUND_POLICY_TEXT },
        citations: { enabled: true },
      },
      { type: "text", text: "How long do customers have to return an item?" },
    ],
  }],
});

for (const block of r.content) {
  if (block.type === "text") {
    process.stdout.write(block.text);
    if (block.citations) {
      for (const c of block.citations) {
        process.stdout.write(` [${c.document_title}: chars ${c.start_char_index}-${c.end_char_index}]`);
      }
    }
  }
}
```

### Python

```python
from anthropic import Anthropic
client = Anthropic()

r = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "document",
                "title": "Refund Policy",
                "source": {"type": "text", "media_type": "text/plain", "data": REFUND_POLICY_TEXT},
                "citations": {"enabled": True},
            },
            {"type": "text", "text": "How long do customers have to return an item?"},
        ],
    }],
)

for block in r.content:
    if block.type == "text":
        text = block.text
        if block.citations:
            spans = [f"[{c.document_title}:{c.start_char_index}-{c.end_char_index}]" for c in block.citations]
            text += " " + " ".join(spans)
        print(text, end="")
```

## Pitfalls

- **Don't combine with caching naively.** Documents with `citations: enabled` aren't a great cache target — the citation index is sensitive to content changes. Cache the system prompt instead.
- **Document index drift.** Re-ordering documents in `messages` shifts the `document_index` referenced in citations. Treat the citation list as snapshot-bound.
- **Span semantics differ by source type.** Plain text uses character offsets; structured text uses custom block indices; PDFs use page numbers. Your UI must branch.
- **Hallucinated citations are rare but possible.** Server-side grounding is much stronger than asking the model to "cite sources" via prompt — but always verify against the source text in safety-critical contexts.
- **Native vs MCP citations are different surfaces.** MCP results from tools like `exa` come back as URLs; native citations point inside documents you supplied. Don't conflate.

## SDK References

- TypeScript: `@anthropic-ai/sdk` >= 0.30
- Python: `anthropic` >= 0.40
- Anthropic docs: Citations guide
