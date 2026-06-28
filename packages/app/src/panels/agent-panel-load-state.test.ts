import { describe, expect, it } from "vitest";
import type { AgentScreenMissingState } from "@/hooks/use-agent-screen-state-machine";
import {
  clearHistorySyncErrorAfterSuccessfulSync,
  deriveNeedsAuthoritativeSync,
  reconcileMissingAgentStateWithPresentAgent,
} from "./agent-panel-load-state";

describe("reconcileMissingAgentStateWithPresentAgent", () => {
  it("clears lookup-only states once the agent record is present", () => {
    expect(reconcileMissingAgentStateWithPresentAgent({ kind: "resolving" })).toEqual({
      kind: "idle",
    });
    expect(
      reconcileMissingAgentStateWithPresentAgent({
        kind: "not_found",
        message: "Agent not found: agent-1",
      }),
    ).toEqual({ kind: "idle" });
  });

  it("preserves history sync errors while the agent record is present", () => {
    const state: AgentScreenMissingState = {
      kind: "error",
      message: "Failed to get logs: session is archived",
    };

    expect(reconcileMissingAgentStateWithPresentAgent(state)).toBe(state);
  });
});

describe("clearHistorySyncErrorAfterSuccessfulSync", () => {
  it("clears a sync error after a later successful refresh", () => {
    expect(
      clearHistorySyncErrorAfterSuccessfulSync({
        kind: "error",
        message: "Failed to get logs: session is archived",
      }),
    ).toEqual({ kind: "idle" });
  });

  it("leaves non-error states alone", () => {
    const state: AgentScreenMissingState = { kind: "resolving" };

    expect(clearHistorySyncErrorAfterSuccessfulSync(state)).toBe(state);
  });
});

describe("deriveNeedsAuthoritativeSync", () => {
  it("returns false when there is no agent id", () => {
    expect(
      deriveNeedsAuthoritativeSync({
        agentId: undefined,
        observed: false,
        agentHistorySyncGeneration: -1,
        historySyncGeneration: 3,
      }),
    ).toBe(false);
  });

  it("returns true when the agent's history sync generation is behind", () => {
    expect(
      deriveNeedsAuthoritativeSync({
        agentId: "agent-1",
        observed: false,
        agentHistorySyncGeneration: -1,
        historySyncGeneration: 3,
      }),
    ).toBe(true);
  });

  it("returns false once the agent's history sync generation has caught up", () => {
    expect(
      deriveNeedsAuthoritativeSync({
        agentId: "agent-1",
        observed: false,
        agentHistorySyncGeneration: 3,
        historySyncGeneration: 3,
      }),
    ).toBe(false);
  });

  it("returns false for an observed sub-agent even when its generation is behind", () => {
    expect(
      deriveNeedsAuthoritativeSync({
        agentId: "observed:toolu_x",
        observed: true,
        agentHistorySyncGeneration: -1,
        historySyncGeneration: 3,
      }),
    ).toBe(false);
  });
});
