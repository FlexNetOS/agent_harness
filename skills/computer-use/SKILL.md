---
name: computer-use
description: Build agents that operate a desktop or browser via the computer-use tool surface. Includes screenshot/click/type loops, safety gates, and tier-based application restrictions. Best on Opus 4.7 or Sonnet 4.6.
origin: claude-api-feature-coverage
---

# Computer Use

The computer-use tool lets the model take actions on a real or virtual screen — screenshot, mouse, keyboard, application focus. Combine with strict scoping and human-approved action lists.

## When to Use

- Automating UI workflows that have no API (desktop apps, legacy web apps without DOM access).
- Cross-application orchestration (drag from Photos to a doc).
- QA / accessibility audits via visible-state observation.
- Demo generation (record an agent doing a task).

Strongly prefer dedicated MCP tools or Chrome MCP first:
- App has its own MCP (Slack, Gmail, Linear, GitHub, Notion) → use that.
- Web app, no MCP → Chrome MCP (DOM-aware, fast, safe).
- Native desktop app, no MCP → computer use is the right tier.

## How It Works

The model is given the `computer` tool with a viewport size; it emits action steps (`screenshot`, `left_click`, `type`, `key`, `scroll`). Your harness executes each action and replies with the resulting screenshot.

The control loop:

1. Take a screenshot, send it back as the tool result.
2. Model inspects, decides next action.
3. Loop until the model emits a final text response or a stop condition.

Safety gates the harness should enforce:

- **Application allowlist.** Only act inside explicitly approved apps. The Anthropic skill's documented tiers are: `read` (browsers — read only), `click` (terminals/IDEs — click only), `full` (everything else). Match the tier; raise the bar with your own gates.
- **Link safety.** Never click web links inside native apps via computer use; route through the browser MCP after the user verifies the URL.
- **Financial actions.** Never execute trades, send money, or initiate transfers — ask the user to perform these themselves.
- **Loop budget.** Cap turns and screenshots; bail with a human handoff on N consecutive identical screenshots (likely stuck).

## Examples

### TypeScript control loop

```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

async function controlLoop(prompt: string, maxTurns = 30) {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  for (let turn = 0; turn < maxTurns; turn++) {
    const r = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      tools: [{ type: "computer_20250124", name: "computer", display_width_px: 1440, display_height_px: 900 }],
      messages,
    });

    if (r.stop_reason === "end_turn") return r.content;
    if (r.stop_reason !== "tool_use") return r.content;

    const toolUses = r.content.filter(b => b.type === "tool_use");
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const result = await executeAction(use.input as ComputerAction);
      toolResults.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: result.screenshotBase64 } }],
      });
    }
    messages.push({ role: "assistant", content: r.content }, { role: "user", content: toolResults });
  }
  throw new Error("max turns exceeded");
}
```

`executeAction` is your platform-specific shim (e.g., calling `xdotool` on Linux, `pyautogui` on Windows/macOS).

## Pitfalls

- **Coordinate drift.** Screen DPI and zoom changes the model's coordinate predictions. Lock the display scale.
- **Bot-detection.** Some apps detect automation (CAPTCHA, mouse-jitter heuristics). Computer use leaves obvious signals; assume it can be detected.
- **Slow.** Each turn = one round-trip + one screenshot encode. Plan for 1-5s per action minimum.
- **Cost.** Screenshots are large image inputs. Use prompt caching on stable parts of the conversation; consider downsampling screenshots when fine detail isn't needed.
- **Brittle to UI changes.** A button moves and the agent breaks. Keep automation prompts narrow ("click the green Submit button at the bottom right") rather than coordinate-based.

## SDK References

- TypeScript: `@anthropic-ai/sdk` >= 0.30 — `tools` array supports `{ type: "computer_20250124", ... }`
- Python: `anthropic` >= 0.40
- Anthropic docs: Computer Use guide; reference implementation in `anthropic-quickstarts/computer-use-demo`
