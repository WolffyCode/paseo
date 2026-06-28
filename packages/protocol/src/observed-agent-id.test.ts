import { describe, expect, it } from "vitest";

import {
  isObservedAgentId,
  observedAgentId,
  OBSERVED_AGENT_ID_PREFIX,
} from "./observed-agent-id.js";

describe("observedAgentId", () => {
  it("prefixes the tool-use id with the observed namespace", () => {
    expect(observedAgentId("toolu_abc")).toBe("observed:toolu_abc");
  });

  it("is stable for the same tool-use id", () => {
    expect(observedAgentId("toolu_x")).toBe(observedAgentId("toolu_x"));
  });

  it("uses the shared prefix constant", () => {
    expect(observedAgentId("toolu_x").startsWith(OBSERVED_AGENT_ID_PREFIX)).toBe(true);
  });
});

describe("isObservedAgentId", () => {
  it("recognizes ids minted by observedAgentId", () => {
    expect(isObservedAgentId(observedAgentId("toolu_01AJxSotfSMyzuunxiVCuuHx"))).toBe(true);
  });

  it("rejects real (paseo / uuid) agent ids", () => {
    expect(isObservedAgentId("agent-1")).toBe(false);
    expect(isObservedAgentId("3f9c1d2e-1234-4abc-9def-000000000000")).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(isObservedAgentId("")).toBe(false);
  });

  it("does not match an id that merely contains the prefix mid-string", () => {
    expect(isObservedAgentId("real-observed:toolu_x")).toBe(false);
  });
});
