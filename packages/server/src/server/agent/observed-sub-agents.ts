// Pure derivation for "observed" sub-agents: read-only tree records the daemon
// surfaces by watching a provider's own internal subagent (Claude Task / Codex
// sub-agent). Both providers emit a `sub_agent_observation` stream event; these
// helpers turn that event into the stable id, lifecycle status, and title used
// to build the read-only agent record. No provider branching lives here — the
// `sub_agent` tool-call detail is the only abstraction both providers share.

import { observedAgentId } from "@getpaseo/protocol/observed-agent-id";

type ObservedSubAgentToolCallStatus = "running" | "completed" | "failed" | "canceled";

type ObservedSubAgentLifecycle = "running" | "idle" | "error";

// Flat single-key id for an observed sub-agent node, derived from the Task
// tool-use id that spawned it. toolUseId is globally unique (`toolu_*`) and is
// carried identically by both the live callId and the file meta.toolUseId, so
// every update for one sub-agent — from either source, at any depth — resolves to
// exactly one record (node-level dedup by id space). Delegates to the shared
// protocol minter so the `observed:` prefix (which the client recognizes via
// `isObservedAgentId`) has a single source of truth.
export function observedSubAgentId(toolUseId: string): string {
  return observedAgentId(toolUseId);
}

// Maps the sub-agent tool-call status to the lifecycle status the tree renders:
// running keeps the pulsing green dot, terminal-but-fine settles to idle, and a
// failed sub-agent surfaces as error.
export function observedSubAgentStatus(
  status: ObservedSubAgentToolCallStatus,
): ObservedSubAgentLifecycle {
  if (status === "running") {
    return "running";
  }
  if (status === "failed") {
    return "error";
  }
  return "idle";
}

interface ObservedSubAgentTitleInput {
  description?: string;
  subAgentType?: string;
}

// Title shown in the tree and the read-only view header. Prefers the caller's
// task description, falls back to the sub-agent type, then a generic label so a
// node is never blank.
export function observedSubAgentTitle(input: ObservedSubAgentTitleInput): string {
  const description = input.description?.trim();
  if (description) {
    return description;
  }
  const subAgentType = input.subAgentType?.trim();
  if (subAgentType) {
    return subAgentType;
  }
  return "Sub-agent";
}
