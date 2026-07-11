import { describe, expect, test } from "vitest";
import { deriveConversationStatusDot } from "./status-dot";

describe("deriveConversationStatusDot", () => {
  test("maps every lifecycle branch into the tree's five visible states", () => {
    expect(
      deriveConversationStatusDot({
        status: "running",
        requiresAttention: false,
        attentionReason: null,
        pendingPermissionCount: 0,
      }),
    ).toBe("running");
    expect(
      deriveConversationStatusDot({
        status: "idle",
        requiresAttention: true,
        attentionReason: "finished",
        pendingPermissionCount: 0,
      }),
    ).toBe("needsAttention");
    expect(
      deriveConversationStatusDot({
        status: "idle",
        requiresAttention: false,
        attentionReason: null,
        pendingPermissionCount: 0,
      }),
    ).toBe("idle");
    expect(
      deriveConversationStatusDot({
        status: "error",
        requiresAttention: false,
        attentionReason: null,
        pendingPermissionCount: 0,
      }),
    ).toBe("error");
    expect(
      deriveConversationStatusDot({
        status: "initializing",
        requiresAttention: false,
        attentionReason: null,
        pendingPermissionCount: 0,
      }),
    ).toBe("initializing");
  });

  test("keeps permission above errors and errors above finished attention", () => {
    expect(
      deriveConversationStatusDot({
        status: "error",
        requiresAttention: true,
        attentionReason: "error",
        pendingPermissionCount: 0,
      }),
    ).toBe("error");
    expect(
      deriveConversationStatusDot({
        status: "error",
        requiresAttention: true,
        attentionReason: "permission",
        pendingPermissionCount: 0,
      }),
    ).toBe("needsAttention");
    expect(
      deriveConversationStatusDot({
        status: "running",
        requiresAttention: false,
        attentionReason: null,
        pendingPermissionCount: 2,
      }),
    ).toBe("needsAttention");
  });
});
