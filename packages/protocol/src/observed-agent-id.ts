// Agent-id naming convention for "observed" sub-agents — the read-only mirrors the
// daemon surfaces by watching a provider's own internal subagent (Claude Task /
// Codex sub-agent). The daemon mints these ids; the client recognizes them to keep
// observed agents on a read-only path (never resumed / loaded as a full agent). One
// shared source here so the prefix is never spelled out as a magic string twice.

export const OBSERVED_AGENT_ID_PREFIX = "observed:";

// Builds the stable, flat id for an observed sub-agent from the tool-use id that
// spawned it. toolUseId is globally unique (`toolu_*`), so each sub-agent resolves
// to exactly one id; the prefix guarantees it never collides with a real agent id.
export function observedAgentId(toolUseId: string): string {
  return `${OBSERVED_AGENT_ID_PREFIX}${toolUseId}`;
}

// Whether an agent id names an observed sub-agent. Callers use this to route the id
// onto the read-only path instead of the agent load/resume path (which would throw
// "Unknown agent" for these sessionless mirrors).
export function isObservedAgentId(agentId: string): boolean {
  return agentId.startsWith(OBSERVED_AGENT_ID_PREFIX);
}
