import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PARENT_AGENT_ID_LABEL } from "@getpaseo/protocol/agent-labels";
import { applyCallerParentLabel, runRunCommand, type AgentRunOptions } from "./run";

describe("applyCallerParentLabel", () => {
  it("defaults the spawned agent to a subagent of the caller (PASEO_AGENT_ID)", () => {
    const result = applyCallerParentLabel({}, "agent-123");
    expect(result[PARENT_AGENT_ID_LABEL]).toBe("agent-123");
  });

  it("is a no-op when there is no caller agent (human shell, no PASEO_AGENT_ID)", () => {
    expect(applyCallerParentLabel({ foo: "bar" }, undefined)).toEqual({ foo: "bar" });
    expect(applyCallerParentLabel({ foo: "bar" }, "   ")).toEqual({ foo: "bar" });
  });

  it("lets an explicit --label parent win over the caller default", () => {
    const result = applyCallerParentLabel(
      { [PARENT_AGENT_ID_LABEL]: "explicit-parent" },
      "agent-123",
    );
    expect(result[PARENT_AGENT_ID_LABEL]).toBe("explicit-parent");
  });

  it("trims the caller id", () => {
    expect(applyCallerParentLabel({}, "  agent-123  ")[PARENT_AGENT_ID_LABEL]).toBe("agent-123");
  });
});

// validateRunOptions runs before the CLI ever connects to a daemon, so these
// invalid combinations reject without one running.
describe("runRunCommand option validation", () => {
  const originalWorkspaceId = process.env.PASEO_WORKSPACE_ID;

  beforeEach(() => {
    delete process.env.PASEO_WORKSPACE_ID;
  });

  afterEach(() => {
    if (originalWorkspaceId === undefined) {
      delete process.env.PASEO_WORKSPACE_ID;
    } else {
      process.env.PASEO_WORKSPACE_ID = originalWorkspaceId;
    }
  });

  async function expectInvalidOptions(options: AgentRunOptions, messageMatch: RegExp) {
    await expect(runRunCommand("do something", options, {} as never)).rejects.toMatchObject({
      code: "INVALID_OPTIONS",
      message: expect.stringMatching(messageMatch),
    });
  }

  it("rejects --worktree combined with --workspace", async () => {
    await expectInvalidOptions(
      { worktree: "feat", workspace: "ws-1" },
      /--worktree and --workspace cannot be combined/,
    );
  });

  it("rejects --worktree combined with an ambient PASEO_WORKSPACE_ID", async () => {
    process.env.PASEO_WORKSPACE_ID = "ws-ambient";
    await expectInvalidOptions(
      { worktree: "feat" },
      /--worktree cannot be combined with an ambient PASEO_WORKSPACE_ID/,
    );
  });

  it("allows a bare --worktree through validation when no workspace is selected", async () => {
    // A bare --worktree with no --workspace and no ambient PASEO_WORKSPACE_ID
    // must clear validation. It still fails later (provider resolution), which
    // is enough to prove the new guard did not reject it.
    await expect(
      runRunCommand("do something", { worktree: "feat", provider: undefined }, {} as never),
    ).rejects.not.toMatchObject({ code: "INVALID_OPTIONS" });
  });
});
