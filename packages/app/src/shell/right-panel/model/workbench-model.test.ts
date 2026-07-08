import { describe, expect, it, vi } from "vitest";
import type { ActivityDot, OpenTabRequest, TabContent, TabContentFactory } from "./tab-content";
import { WorkbenchModel } from "./workbench-model";

// WorkbenchModel is the tab-framework domain object (MobX class). These tests drive it with a fake
// TabContentFactory (never the real FileDocumentModel — the framework must not know concrete types) and
// assert the framework contract: append/focus/dedup/close/reorder, launcher↔tabs mode, and that a
// PanelTab stores IDENTITY ONLY (title/activityDot are read live off content, never mirrored).

// A recording stand-in for a tab's content. title/activityDot are mutable so a test can prove the tab
// head reads them LIVE off content (no stored copy); the two hooks are spies.
class FakeContent implements TabContent {
  title: string;
  activityDot: ActivityDot = "none";
  onActivated = vi.fn();
  onClosing = vi.fn();
  constructor(path: string) {
    this.title = path.split("/").pop() ?? path;
  }
}

// A fake factory that records what it built, so tests can reach each tab's content spies.
class FakeFactory implements TabContentFactory {
  readonly created: FakeContent[] = [];
  create(request: OpenTabRequest): TabContent {
    const content = new FakeContent(request.location.path);
    this.created.push(content);
    return content;
  }
}

function makeWorkbench(): { wb: WorkbenchModel; factory: FakeFactory } {
  const factory = new FakeFactory();
  return { wb: new WorkbenchModel(factory), factory };
}

describe("WorkbenchModel · mode", () => {
  // An empty workbench is the launcher; the first tab flips it to the tabs view — a derivation, not a
  // special case, so "close all → launcher" falls out for free.
  it("derives launcher when empty and tabs when populated", () => {
    const { wb } = makeWorkbench();
    expect(wb.mode).toBe("launcher");
    wb.openTab({ kind: "file", location: { path: "a.ts" } });
    expect(wb.mode).toBe("tabs");
  });
});

describe("WorkbenchModel · openTab", () => {
  // Opening a new file appends a tab and focuses it, activating its content (tree reveal).
  it("appends and focuses a new file, activating its content", () => {
    const { wb, factory } = makeWorkbench();
    wb.openTab({ kind: "file", location: { path: "src/a.ts" } });
    expect(wb.tabs).toHaveLength(1);
    expect(wb.focusedTabId).toBe(wb.tabs[0].id);
    expect(factory.created[0].onActivated).toHaveBeenCalledTimes(1);
  });

  // Re-opening the same file focuses the existing tab — one file, one tab (verify item 17). Identity is
  // path-only and normalized, so a different spelling (case/slash) still dedups.
  it("focuses the existing tab for the same file (path identity, normalized)", () => {
    const { wb } = makeWorkbench();
    wb.openTab({ kind: "file", location: { path: "src/App.ts" } });
    const firstId = wb.tabs[0].id;
    wb.openTab({ kind: "file", location: { path: "src\\app.ts" } });
    expect(wb.tabs).toHaveLength(1);
    expect(wb.focusedTabId).toBe(firstId);
  });

  // Two distinct files get two tabs; the most recently opened is focused.
  it("appends a second tab for a different file", () => {
    const { wb } = makeWorkbench();
    wb.openTab({ kind: "file", location: { path: "a.ts" } });
    wb.openTab({ kind: "file", location: { path: "b.ts" } });
    expect(wb.tabs).toHaveLength(2);
    expect(wb.focusedTabId).toBe(wb.tabs[1].id);
  });
});

describe("WorkbenchModel · PanelTab stores identity only", () => {
  // A PanelTab carries id/kind/path + a content reference — never title/activityDot. Those are read
  // LIVE off content so there is one truth source; flipping the content's dot is visible through the tab.
  it("keeps no title/dot on the tab and reads them live from content", () => {
    const { wb } = makeWorkbench();
    wb.openTab({ kind: "file", location: { path: "src/a.ts" } });
    const tab = wb.tabs[0];
    expect("title" in tab).toBe(false);
    expect("activityDot" in tab).toBe(false);
    expect(tab.content.title).toBe("a.ts");
    (tab.content as FakeContent).activityDot = "dirty";
    expect(wb.tabs[0].content.activityDot).toBe("dirty");
  });
});

describe("WorkbenchModel · focusTab", () => {
  // Switching focus blurs the old tab (onClosing = autosave hook) and activates the new one (reveal).
  it("blurs the previous tab and activates the next", () => {
    const { wb, factory } = makeWorkbench();
    wb.openTab({ kind: "file", location: { path: "a.ts" } });
    wb.openTab({ kind: "file", location: { path: "b.ts" } });
    const [a, b] = factory.created;
    a.onActivated.mockClear();
    a.onClosing.mockClear();
    b.onActivated.mockClear();
    wb.focusTab(wb.tabs[0].id);
    expect(b.onClosing).toHaveBeenCalledTimes(1);
    expect(a.onActivated).toHaveBeenCalledTimes(1);
  });
});

describe("WorkbenchModel · close", () => {
  // Closing a tab runs its content's onClosing (blur = autosave) and removes it from the workbench. The
  // spy is cleared right before the close so we count only the close's contribution, not the earlier
  // focus-switch blur from opening the second tab.
  it("closes a tab, autosaving via onClosing", () => {
    const { wb, factory } = makeWorkbench();
    wb.openTab({ kind: "file", location: { path: "a.ts" } });
    wb.openTab({ kind: "file", location: { path: "b.ts" } });
    const closeId = wb.tabs[0].id;
    factory.created[0].onClosing.mockClear();
    wb.closeTab(closeId);
    expect(wb.tabs).toHaveLength(1);
    expect(wb.tabs[0].path).toBe("b.ts");
    expect(factory.created[0].onClosing).toHaveBeenCalledTimes(1);
  });

  // Closing the focused tab moves focus to a neighbor (and activates it); closing a background tab
  // leaves focus where it is.
  it("moves focus to a neighbor when the focused tab closes", () => {
    const { wb } = makeWorkbench();
    wb.openTab({ kind: "file", location: { path: "a.ts" } });
    wb.openTab({ kind: "file", location: { path: "b.ts" } });
    wb.focusTab(wb.tabs[0].id); // focus a
    wb.closeTab(wb.tabs[0].id); // close a → focus should move to b
    expect(wb.tabs).toHaveLength(1);
    expect(wb.focusedTabId).toBe(wb.tabs[0].id);
    expect(wb.tabs[0].path).toBe("b.ts");
  });

  // closeOthers keeps only the target; every other tab is autosaved+removed and the target is focused.
  // Spies cleared before the call so we count only closeOthers' own onClosing on the removed tabs.
  it("closeOthers keeps the target and autosaves the rest", () => {
    const { wb, factory } = makeWorkbench();
    wb.openTab({ kind: "file", location: { path: "a.ts" } });
    wb.openTab({ kind: "file", location: { path: "b.ts" } });
    wb.openTab({ kind: "file", location: { path: "c.ts" } });
    const keepId = wb.tabs[1].id;
    for (const content of factory.created) {
      content.onClosing.mockClear();
    }
    wb.closeOthers(keepId);
    expect(wb.tabs).toHaveLength(1);
    expect(wb.focusedTabId).toBe(keepId);
    expect(factory.created[0].onClosing).toHaveBeenCalledTimes(1); // a
    expect(factory.created[1].onClosing).not.toHaveBeenCalled(); // b (kept)
    expect(factory.created[2].onClosing).toHaveBeenCalledTimes(1); // c
  });

  // closeAll autosaves every tab and returns to the launcher (empty → mode derivation). Spies cleared
  // before the call so we count only closeAll's onClosing, not the setup focus-switch blurs.
  it("closeAll empties the workbench back to the launcher", () => {
    const { wb, factory } = makeWorkbench();
    wb.openTab({ kind: "file", location: { path: "a.ts" } });
    wb.openTab({ kind: "file", location: { path: "b.ts" } });
    for (const content of factory.created) {
      content.onClosing.mockClear();
    }
    wb.closeAll();
    expect(wb.tabs).toHaveLength(0);
    expect(wb.focusedTabId).toBeNull();
    expect(wb.mode).toBe("launcher");
    expect(factory.created[0].onClosing).toHaveBeenCalledTimes(1);
    expect(factory.created[1].onClosing).toHaveBeenCalledTimes(1);
  });
});

describe("WorkbenchModel · reorderTab", () => {
  // Dragging a tab to a new index reorders the tab list without changing which tab is focused.
  it("reorders tabs by drop index, preserving focus", () => {
    const { wb } = makeWorkbench();
    wb.openTab({ kind: "file", location: { path: "a.ts" } });
    wb.openTab({ kind: "file", location: { path: "b.ts" } });
    wb.openTab({ kind: "file", location: { path: "c.ts" } });
    const focused = wb.focusedTabId;
    wb.reorderTab(wb.tabs[2].id, 0); // move c to front
    expect(wb.tabs.map((t) => t.path)).toEqual(["c.ts", "a.ts", "b.ts"]);
    expect(wb.focusedTabId).toBe(focused);
  });
});

describe("WorkbenchModel · openLauncherType", () => {
  // The file launcher row WITHOUT a selection opens an empty "choose a file" tab so the tab strip appears
  // (requirement item 3 / sRS2·4·7); it dedups to at most one empty tab. With a location it opens that file.
  it("opens an empty 'choose a file' tab without a location (deduped), and the file with one", () => {
    const { wb } = makeWorkbench();
    wb.openLauncherType("file");
    expect(wb.tabs).toHaveLength(1);
    expect(wb.tabs[0].path).toBe("");
    wb.openLauncherType("file"); // re-click → still one empty tab (dedup by empty path)
    expect(wb.tabs).toHaveLength(1);
    wb.openLauncherType("file", { path: "a.ts" });
    expect(wb.tabs).toHaveLength(2);
    expect(wb.tabs[1].path).toBe("a.ts");
  });

  // A disabled/deferred kind (review) never opens a tab this round.
  it("does nothing for a disabled kind", () => {
    const { wb } = makeWorkbench();
    wb.openLauncherType("review", { path: "a.ts" });
    expect(wb.tabs).toHaveLength(0);
  });
});
