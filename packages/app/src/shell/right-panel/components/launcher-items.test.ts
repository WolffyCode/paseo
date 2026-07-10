import { describe, expect, it, vi } from "vitest";

vi.mock("./icons", () => ({
  IconConversation: "conversation-icon",
  IconFile: "file-icon",
  IconGlobe: "browser-icon",
  IconReview: "review-icon",
  IconTerminal: "terminal-icon",
}));

import { LAUNCH_HINT, LAUNCH_ITEMS, NEW_TAB_ITEMS } from "./launcher-items";

// The two creation surfaces are projections of TAB_KIND_POLICY, not hand-maintained copies. Both keep
// the deferred roadmap order and exclude file, whose only valid opens carry a path from tree/conversation.
describe("right-panel creation items", () => {
  const deferredKinds = ["terminal", "browser", "review", "conversation"];

  it("derives the launcher as the four deferred kinds without file", () => {
    expect(LAUNCH_ITEMS.map((item) => item.kind)).toEqual(deferredKinds);
  });

  it("derives the new-tab menu as the same four deferred kinds without file", () => {
    expect(NEW_TAB_ITEMS.map((item) => item.kind)).toEqual(deferredKinds);
  });

  it("directs file opens to the tree or conversation and labels every listed type as deferred", () => {
    expect(LAUNCH_HINT).toBe("文件经左侧目录树或对话打开 · 其余类型后续开放");
    expect(LAUNCH_ITEMS.every((item) => item.policy.comingSoon && !item.policy.enabled)).toBe(true);
    expect(NEW_TAB_ITEMS.every((item) => item.policy.comingSoon && !item.policy.enabled)).toBe(
      true,
    );
  });
});
