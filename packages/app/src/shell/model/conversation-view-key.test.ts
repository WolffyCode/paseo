import { describe, expect, it } from "vitest";
import { buildConversationViewKey } from "./conversation-view-key";

describe("buildConversationViewKey", () => {
  it("isolates hosts and keeps drafts on a stable draft identity axis", () => {
    expect(buildConversationViewKey("server-a", { kind: "agent", agentId: "one" })).toBe(
      "server-a:agent:one",
    );
    expect(buildConversationViewKey("server-b", { kind: "agent", agentId: "one" })).toBe(
      "server-b:agent:one",
    );
    expect(buildConversationViewKey("server-a", { kind: "draft", draftId: "draft-one" })).toBe(
      "server-a:draft:draft-one",
    );
  });
});
