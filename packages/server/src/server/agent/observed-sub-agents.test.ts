import { describe, expect, it } from "vitest";

import {
  observedSubAgentId,
  observedSubAgentStatus,
  observedSubAgentTitle,
} from "./observed-sub-agents.js";

describe("observedSubAgentId", () => {
  it("derives a flat single-key id from the sub-agent tool-use id", () => {
    expect(observedSubAgentId("toolu_abc")).toBe("observed:toolu_abc");
  });

  it("is deterministic so the live callId and file meta.toolUseId resolve to one id", () => {
    expect(observedSubAgentId("toolu_x")).toBe(observedSubAgentId("toolu_x"));
  });

  it("prefixes with observed: so it never collides with a real (UUID) agent id", () => {
    expect(observedSubAgentId("toolu_x").startsWith("observed:")).toBe(true);
  });
});

describe("observedSubAgentStatus", () => {
  it("maps a running sub-agent tool-call to a running tree node", () => {
    expect(observedSubAgentStatus("running")).toBe("running");
  });

  it("maps a completed sub-agent to idle", () => {
    expect(observedSubAgentStatus("completed")).toBe("idle");
  });

  it("maps a canceled sub-agent to idle", () => {
    expect(observedSubAgentStatus("canceled")).toBe("idle");
  });

  it("maps a failed sub-agent to error", () => {
    expect(observedSubAgentStatus("failed")).toBe("error");
  });
});

describe("observedSubAgentTitle", () => {
  it("prefers the sub-agent description", () => {
    expect(
      observedSubAgentTitle({ description: "查询北京今日天气", subAgentType: "general-purpose" }),
    ).toBe("查询北京今日天气");
  });

  it("falls back to the subAgentType when there is no description", () => {
    expect(observedSubAgentTitle({ subAgentType: "general-purpose" })).toBe("general-purpose");
  });

  it("falls back to a generic label when neither is present", () => {
    expect(observedSubAgentTitle({})).toBe("Sub-agent");
  });
});
