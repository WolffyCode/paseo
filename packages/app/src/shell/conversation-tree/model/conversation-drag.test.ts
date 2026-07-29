import { describe, expect, it } from "vitest";
import { decodeConversationDrag, encodeConversationDrag } from "./conversation-drag";
import type { ConversationTreeConversationNode } from "./types";

/** Build the minimum complete root node required by the drag contract. */
function root(workspaceId: string | null): ConversationTreeConversationNode {
  return {
    kind: "conversation",
    id: "agent-1",
    title: "Agent 1",
    workspaceId,
    runStatus: "idle",
    subagentCount: 0,
    updatedAt: "2026-07-28T00:00:00.000Z",
    providerId: "codex",
    attentionKind: null,
    children: [],
  };
}

describe("conversation drag payload", () => {
  it("round-trips a workspace-backed root conversation", () => {
    const encoded = encodeConversationDrag(root("workspace-1"));
    expect(encoded).not.toBeNull();
    expect(decodeConversationDrag(encoded ?? "")).toEqual({
      agentId: "agent-1",
      workspaceId: "workspace-1",
      title: "Agent 1",
    });
  });

  it("rejects loose roots and malformed browser data", () => {
    expect(encodeConversationDrag(root(null))).toBeNull();
    expect(decodeConversationDrag("not-json")).toBeNull();
    expect(decodeConversationDrag('{"agentId":"agent-1"}')).toBeNull();
  });
});
