import { describe, expect, it } from "vitest";
import { buildWorkspaceDraftAgentConfig } from "./workspace-draft-agent-config";

describe("workspace-draft-agent-config", () => {
  it("builds chat-only config for workspace draft agents", () => {
    expect(
      buildWorkspaceDraftAgentConfig({
        provider: "codex",
        cwd: "/tmp/project",
        modeId: "auto",
        model: "gpt-5.4",
        thinkingOptionId: "high",
      }),
    ).toEqual({
      provider: "codex",
      cwd: "/tmp/project",
      modeId: "auto",
      model: "gpt-5.4",
      thinkingOptionId: "high",
    });
  });

  it("includes vendorId when provided", () => {
    expect(
      buildWorkspaceDraftAgentConfig({
        provider: "claude",
        cwd: "/x",
        vendorId: "vnd_1",
        model: "glm-5.1",
      }),
    ).toEqual({
      provider: "claude",
      cwd: "/x",
      vendorId: "vnd_1",
      model: "glm-5.1",
    });
  });

  it("omits vendorId key when not provided (back-compat)", () => {
    const result = buildWorkspaceDraftAgentConfig({
      provider: "claude",
      cwd: "/x",
    });
    expect(result).not.toHaveProperty("vendorId");
  });
});
