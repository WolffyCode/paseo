import type { AgentScreenMissingState } from "@/hooks/use-agent-screen-state-machine";

export function reconcileMissingAgentStateWithPresentAgent(
  state: AgentScreenMissingState,
): AgentScreenMissingState {
  if (state.kind === "resolving" || state.kind === "not_found") {
    return { kind: "idle" };
  }
  return state;
}

export function clearHistorySyncErrorAfterSuccessfulSync(
  state: AgentScreenMissingState,
): AgentScreenMissingState {
  if (state.kind === "error") {
    return { kind: "idle" };
  }
  return state;
}

// Whether the agent screen must wait on an authoritative history fetch before it can
// render its timeline as ready. Observed sub-agents are read-only mirrors whose
// timeline streams in with the parent — they never fetch, so they must report `false`
// here or the screen blocks on a sync that never runs (loading forever).
export function deriveNeedsAuthoritativeSync(input: {
  agentId: string | undefined;
  observed: boolean;
  agentHistorySyncGeneration: number;
  historySyncGeneration: number;
}): boolean {
  if (!input.agentId || input.observed) {
    return false;
  }
  return input.agentHistorySyncGeneration < input.historySyncGeneration;
}
