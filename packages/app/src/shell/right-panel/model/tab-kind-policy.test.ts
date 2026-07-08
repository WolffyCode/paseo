import { describe, expect, it } from "vitest";
import type { TabKind } from "./tab-content";
import { TAB_KIND_POLICY } from "./tab-kind-policy";

// TAB_KIND_POLICY is the one static table the launcher, new-tab dropdown, dedup, and single-instance
// rules all read. These tests lock its shape: exactly `file` is usable this round; the other four are
// present-but-coming-soon data rows (a roadmap, not abstractions). It is a table, not a function —
// there is no dynamic input to derive.

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

  // The file launcher row advertises its ⌘P shortcut; the table is the source of that hint.
  it("gives file the ⌘P shortcut hint", () => {
    expect(TAB_KIND_POLICY.file.shortcutHint).toBe("⌘P");
  });
});
