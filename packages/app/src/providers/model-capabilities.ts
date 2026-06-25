/**
 * model-capabilities.ts
 *
 * Pure function: (provider, vendor, modelId) → ModelCapabilities.
 *
 * Heuristics (conservative defaults for unknowns):
 *
 * ┌─────────────────────────────────────────────────────────┬──────────┬──────────┬─────────────┐
 * │ Case                                                    │webSearch │ thinking │ attachments │
 * ├─────────────────────────────────────────────────────────┼──────────┼──────────┼─────────────┤
 * │ provider=null (fresh draft, no provider chosen)         │  false   │  false   │   true      │
 * │ provider="claude", vendor=null (direct Anthropic)       │  true    │  true    │   true      │
 * │ provider="claude", vendor≠null (third-party relay)      │  false   │  true    │   true      │
 * │ provider="codex", modelId matches /^o\d/ (o-series)     │  false   │  true    │   true      │
 * │ provider="codex", other openai model                    │  false   │  false   │   true      │
 * │ any other provider                                      │  false   │  false   │   true      │
 * └─────────────────────────────────────────────────────────┴──────────┴──────────┴─────────────┘
 *
 * Reasoning:
 * - Direct Anthropic: the official API supports WebSearch (tool_use), extended thinking,
 *   and vision — all three on.
 * - Third-party claude-compatible relays (vendor ≠ null): third-party endpoints typically
 *   do NOT proxy WebSearch tool_use (matches 1.4 disallowedTools pattern); most support
 *   thinking/reasoning and multimodal. webSearch off, thinking+attachments on.
 * - codex/openai: o-series models have extended reasoning; gpt-series don't.
 *   OpenAI's direct API does not expose WebSearch as a tool_use call in the same way.
 * - Unknown provider: fully conservative — no web search, no thinking, attachments on
 *   (images are safe to send; the model will simply ignore them).
 *
 * NO hooks, NO side effects, NO IO. Only input determines output.
 */
import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import type { Vendor } from "@getpaseo/protocol/provider-config";

export interface ModelCapabilities {
  /** Whether the model/endpoint supports web search (network-enabled retrieval). */
  webSearch: boolean;
  /** Whether the model supports extended thinking / reasoning mode. */
  thinking: boolean;
  /** Whether the model accepts file/image attachments. */
  attachments: boolean;
}

/** Conservative defaults for unknown models/providers. */
const CONSERVATIVE_DEFAULTS: ModelCapabilities = {
  webSearch: false,
  thinking: false,
  attachments: true,
};

/**
 * Returns capability booleans for the selected model.
 *
 * @param provider - The AgentProvider string (e.g. "claude", "codex"), or null when no provider
 *                   has been chosen yet (fresh draft). Null returns CONSERVATIVE_DEFAULTS.
 * @param vendor   - The Vendor object if routing through a third-party relay, or null for direct connect.
 * @param modelId  - The selected model ID string, or null if none chosen yet.
 */
export function getModelCapabilities(input: {
  provider: AgentProvider | null;
  vendor: Vendor | null;
  modelId: string | null;
}): ModelCapabilities {
  const { provider, vendor, modelId } = input;

  // No provider chosen yet (fresh draft) → conservative defaults (no thinking chip shown).
  if (provider === null) {
    return { ...CONSERVATIVE_DEFAULTS };
  }

  // --- Anthropic Claude ---
  if (provider === "claude") {
    if (vendor === null) {
      // Direct Anthropic endpoint: all features available.
      return { webSearch: true, thinking: true, attachments: true };
    }
    // Third-party relay (vendor ≠ null): no WebSearch (third-party endpoints don't
    // proxy Anthropic's WebSearch tool), but thinking + attachments are typically fine.
    return { webSearch: false, thinking: true, attachments: true };
  }

  // --- Codex / OpenAI ---
  if (provider === "codex") {
    // o-series (o1, o3, o1-mini, o3-mini, etc.) support extended reasoning.
    const isOSeries = modelId != null && /^o\d/i.test(modelId);
    return { webSearch: false, thinking: isOSeries, attachments: true };
  }

  // --- Unknown provider → conservative ---
  return { ...CONSERVATIVE_DEFAULTS };
}
