import { describe, expect, test } from "vitest";
import {
  conversationStatusLabelText,
  deriveAttentionKind,
  deriveConversationRunStatus,
} from "./run-status";

describe("deriveConversationRunStatus", () => {
  test("maps every lifecycle branch into the tree's five visible states", () => {
    expect(
      deriveConversationRunStatus({
        status: "running",
        requiresAttention: false,
        attentionReason: null,
        pendingPermissionCount: 0,
      }),
    ).toBe("running");
    expect(
      deriveConversationRunStatus({
        status: "idle",
        requiresAttention: true,
        attentionReason: "finished",
        pendingPermissionCount: 0,
      }),
    ).toBe("needsAttention");
    expect(
      deriveConversationRunStatus({
        status: "idle",
        requiresAttention: false,
        attentionReason: null,
        pendingPermissionCount: 0,
      }),
    ).toBe("idle");
    expect(
      deriveConversationRunStatus({
        status: "error",
        requiresAttention: false,
        attentionReason: null,
        pendingPermissionCount: 0,
      }),
    ).toBe("error");
    expect(
      deriveConversationRunStatus({
        status: "initializing",
        requiresAttention: false,
        attentionReason: null,
        pendingPermissionCount: 0,
      }),
    ).toBe("initializing");
  });

  test("maps closed straight to idle even when stale attention flags are still set", () => {
    expect(
      deriveConversationRunStatus({
        status: "closed",
        requiresAttention: true,
        attentionReason: "finished",
        pendingPermissionCount: 3,
      }),
    ).toBe("idle");
  });

  test("keeps permission above errors and errors above finished attention", () => {
    expect(
      deriveConversationRunStatus({
        status: "error",
        requiresAttention: true,
        attentionReason: "error",
        pendingPermissionCount: 0,
      }),
    ).toBe("error");
    expect(
      deriveConversationRunStatus({
        status: "error",
        requiresAttention: true,
        attentionReason: "permission",
        pendingPermissionCount: 0,
      }),
    ).toBe("needsAttention");
    expect(
      deriveConversationRunStatus({
        status: "running",
        requiresAttention: false,
        attentionReason: null,
        pendingPermissionCount: 2,
      }),
    ).toBe("needsAttention");
  });
});

describe("deriveAttentionKind", () => {
  test("distinguishes permission attention from a requested reply", () => {
    expect(
      deriveAttentionKind({
        status: "idle",
        requiresAttention: true,
        attentionReason: "permission",
        pendingPermissionCount: 0,
      }),
    ).toBe("permission");
    expect(
      deriveAttentionKind({
        status: "idle",
        requiresAttention: true,
        attentionReason: "finished",
        pendingPermissionCount: 0,
      }),
    ).toBe("reply");
    expect(
      deriveAttentionKind({
        status: "idle",
        requiresAttention: false,
        attentionReason: null,
        pendingPermissionCount: 0,
      }),
    ).toBeNull();
  });
});

describe("conversationStatusLabelText", () => {
  test("covers every user-visible status label", () => {
    expect(conversationStatusLabelText("running", null)).toBe("运行中");
    expect(conversationStatusLabelText("needsAttention", "permission")).toBe("等待权限确认");
    expect(conversationStatusLabelText("needsAttention", "reply")).toBe("等待你的回复");
    expect(conversationStatusLabelText("idle", null)).toBe("空闲");
    expect(conversationStatusLabelText("error", null)).toBe("出错");
    expect(conversationStatusLabelText("initializing", null)).toBe("初始化中…");
  });
});
