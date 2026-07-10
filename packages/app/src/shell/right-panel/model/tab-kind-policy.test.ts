import { describe, expect, it } from "vitest";
import type { TabKind } from "./tab-content";
import { TAB_KIND_POLICY } from "./tab-kind-policy";

// TAB_KIND_POLICY is the one static table the launcher, new-tab dropdown, dedup, and single-instance
// rules all read. These tests separate implemented capability from entry-point visibility: file remains
// usable through path-bearing opens, while only the four deferred roadmap rows appear in creation UI.

const NON_FILE: TabKind[] = ["conversation", "browser", "review", "terminal"];

describe("TAB_KIND_POLICY", () => {
  // Exactly one usable type this round: the whole feature is "file first".
  it("enables only the file type", () => {
    expect(TAB_KIND_POLICY.file.enabled).toBe(true);
    for (const kind of NON_FILE) {
      expect(TAB_KIND_POLICY[kind].enabled).toBe(false);
    }
  });

  // The four deferred types are shown as "coming soon" (honest roadmap, no dead-end); file is not.
  it("marks the four deferred types coming soon and file not", () => {
    expect(TAB_KIND_POLICY.file.comingSoon).toBe(false);
    for (const kind of NON_FILE) {
      expect(TAB_KIND_POLICY[kind].comingSoon).toBe(true);
    }
  });

  // review is the lone single-instance type; the other four (file included) are multi-instance.
  it("makes review single-instance and the rest multi", () => {
    expect(TAB_KIND_POLICY.review.instancing).toBe("single");
    expect(TAB_KIND_POLICY.file.instancing).toBe("multi");
    expect(TAB_KIND_POLICY.conversation.instancing).toBe("multi");
    expect(TAB_KIND_POLICY.browser.instancing).toBe("multi");
    expect(TAB_KIND_POLICY.terminal.instancing).toBe("multi");
  });

  // A file always needs a concrete path from the tree/conversation, so neither creation surface lists it;
  // the four deferred kinds remain visible in both surfaces as an honest roadmap.
  it("hides file from both creation surfaces and shows the four deferred kinds", () => {
    expect(TAB_KIND_POLICY.file.showInLauncher).toBe(false);
    expect(TAB_KIND_POLICY.file.showInNewTab).toBe(false);
    for (const kind of NON_FILE) {
      expect(TAB_KIND_POLICY[kind].showInLauncher).toBe(true);
      expect(TAB_KIND_POLICY[kind].showInNewTab).toBe(true);
    }
  });
});
