import { describe, expect, test } from "vitest";
import { isConversationTreeRowSelected } from "./selection-state";
import type { ConversationTreeConversationNode } from "./types";

const NODE: ConversationTreeConversationNode = {
  kind: "conversation",
  id: "root",
  title: "Root",
  workspaceId: "workspace",
  runStatus: "idle",
  updatedAt: "2026-07-12T00:00:00.000Z",
  providerId: "claude",
  attentionKind: null,
  subagentCount: 0,
  children: [],
};

describe("isConversationTreeRowSelected", () => {
  test("selects a row through either center focus or active-row identity", () => {
    expect(isConversationTreeRowSelected(NODE, "root", null)).toBe(true);
    expect(isConversationTreeRowSelected(NODE, null, "root")).toBe(true);
    expect(isConversationTreeRowSelected(NODE, "other", "other")).toBe(false);
  });
});
