import { describe, expect, it } from "vitest";
import { createBrowserRecord, type BrowserRecord } from "@/desktop/browser/store/state";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/workspace-tabs/model";
import {
  CONTENT_RECENT_LIMIT,
  type ContentRecentsState,
  type ConversationKey,
  conversationRecents,
  findOpenTabForRecent,
  rebindContentRecents,
  recentInputForTab,
  recordContentRecent,
} from "./state";

const WORKSPACE_KEY = "server-1:workspace-1";
const AGENT_ONE: ConversationKey = { workspaceKey: WORKSPACE_KEY, owner: "agent:one" };
const NO_RECENTS: ContentRecentsState = { recentsByWorkspace: {} };

function workspaceTab(tabId: string, target: WorkspaceTabTarget): WorkspaceTab {
  return { tabId, target, createdAt: 0 };
}

function loadedBrowser(patch: Partial<BrowserRecord>): BrowserRecord {
  const record = createBrowserRecord({ browserId: "b1", initialUrl: null, now: 0 });
  return { ...record, ...patch };
}

describe("recordContentRecent", () => {
  it("puts the newest resource first and moves a reopened one to the front", () => {
    let state = recordContentRecent(NO_RECENTS, AGENT_ONE, { kind: "file", path: "a.ts" }, 1);
    state = recordContentRecent(
      state,
      AGENT_ONE,
      { kind: "page", url: "https://x.dev/", title: "X", faviconUrl: null },
      2,
    );
    state = recordContentRecent(state, AGENT_ONE, { kind: "file", path: "a.ts" }, 3);

    expect(conversationRecents(state, AGENT_ONE)).toEqual([
      { kind: "file", path: "a.ts", at: 3 },
      { kind: "page", url: "https://x.dev/", title: "X", faviconUrl: null, at: 2 },
    ]);
  });

  it("refreshes the newest page when its title arrives", () => {
    let state = recordContentRecent(
      NO_RECENTS,
      AGENT_ONE,
      { kind: "page", url: "https://x.dev/", title: "x.dev", faviconUrl: null },
      1,
    );
    state = recordContentRecent(
      state,
      AGENT_ONE,
      { kind: "page", url: "https://x.dev/", title: "X", faviconUrl: "https://x.dev/icon.png" },
      2,
    );

    expect(conversationRecents(state, AGENT_ONE)).toEqual([
      {
        kind: "page",
        url: "https://x.dev/",
        title: "X",
        faviconUrl: "https://x.dev/icon.png",
        at: 2,
      },
    ]);
  });

  it("keeps the same state when the newest resource is recorded again", () => {
    const state = recordContentRecent(
      NO_RECENTS,
      AGENT_ONE,
      { kind: "terminal", terminalId: "t1" },
      1,
    );

    expect(recordContentRecent(state, AGENT_ONE, { kind: "terminal", terminalId: "t1" }, 2)).toBe(
      state,
    );
  });

  it(`keeps at most ${CONTENT_RECENT_LIMIT} resources per conversation`, () => {
    let state = NO_RECENTS;
    for (let index = 0; index <= CONTENT_RECENT_LIMIT; index += 1) {
      state = recordContentRecent(state, AGENT_ONE, { kind: "file", path: `${index}.ts` }, index);
    }

    const recents = conversationRecents(state, AGENT_ONE) ?? [];
    expect(recents).toHaveLength(CONTENT_RECENT_LIMIT);
    expect(recents[0]).toEqual({ kind: "file", path: `${CONTENT_RECENT_LIMIT}.ts`, at: 20 });
    expect(recents.some((recent) => recent.kind === "file" && recent.path === "0.ts")).toBe(false);
  });

  it("keeps each conversation's resources apart", () => {
    const agentTwo: ConversationKey = { workspaceKey: WORKSPACE_KEY, owner: "agent:two" };
    const otherWorkspace: ConversationKey = {
      workspaceKey: "server-1:workspace-2",
      owner: "agent:one",
    };
    let state = recordContentRecent(NO_RECENTS, AGENT_ONE, { kind: "file", path: "a.ts" }, 1);
    state = recordContentRecent(state, agentTwo, { kind: "file", path: "b.ts" }, 2);
    state = recordContentRecent(state, otherWorkspace, { kind: "file", path: "c.ts" }, 3);

    expect(conversationRecents(state, AGENT_ONE)).toEqual([{ kind: "file", path: "a.ts", at: 1 }]);
    expect(conversationRecents(state, agentTwo)).toEqual([{ kind: "file", path: "b.ts", at: 2 }]);
    expect(conversationRecents(state, otherWorkspace)).toEqual([
      { kind: "file", path: "c.ts", at: 3 },
    ]);
  });
});

describe("rebindContentRecents", () => {
  const draft: ConversationKey = { workspaceKey: WORKSPACE_KEY, owner: "draft:d1" };

  it("moves a draft's resources to the agent it became", () => {
    const state = recordContentRecent(NO_RECENTS, draft, { kind: "file", path: "a.ts" }, 1);

    const rebound = rebindContentRecents(state, {
      workspaceKey: WORKSPACE_KEY,
      previousOwner: "draft:d1",
      nextOwner: "agent:one",
    });

    expect(conversationRecents(rebound, AGENT_ONE)).toEqual([
      { kind: "file", path: "a.ts", at: 1 },
    ]);
    expect(conversationRecents(rebound, draft)).toBeUndefined();
  });

  it("merges into resources the next owner already has, newest first", () => {
    let state = recordContentRecent(NO_RECENTS, draft, { kind: "file", path: "a.ts" }, 1);
    state = recordContentRecent(state, draft, { kind: "file", path: "b.ts" }, 3);
    state = recordContentRecent(state, AGENT_ONE, { kind: "file", path: "a.ts" }, 2);

    const rebound = rebindContentRecents(state, {
      workspaceKey: WORKSPACE_KEY,
      previousOwner: "draft:d1",
      nextOwner: "agent:one",
    });

    expect(conversationRecents(rebound, AGENT_ONE)).toEqual([
      { kind: "file", path: "b.ts", at: 3 },
      { kind: "file", path: "a.ts", at: 2 },
    ]);
  });

  it("keeps the same state when the previous owner has no resources", () => {
    expect(
      rebindContentRecents(NO_RECENTS, {
        workspaceKey: WORKSPACE_KEY,
        previousOwner: "draft:d1",
        nextOwner: "agent:one",
      }),
    ).toBe(NO_RECENTS);
  });
});

describe("recentInputForTab", () => {
  it("maps file and terminal tabs", () => {
    expect(
      recentInputForTab(
        workspaceTab("tab-1", { kind: "file", path: "src/a.ts", lineStart: 4 }),
        null,
      ),
    ).toEqual({ kind: "file", path: "src/a.ts" });
    expect(
      recentInputForTab(workspaceTab("tab-2", { kind: "terminal", terminalId: "t1" }), null),
    ).toEqual({ kind: "terminal", terminalId: "t1" });
  });

  it("maps a browser tab to the page it shows", () => {
    const browserTab = workspaceTab("tab-1", { kind: "browser", browserId: "b1" });
    const browser = loadedBrowser({
      url: "https://x.dev/docs",
      title: "Docs",
      faviconUrl: "https://x.dev/icon.png",
    });

    expect(recentInputForTab(browserTab, browser)).toEqual({
      kind: "page",
      url: "https://x.dev/docs",
      title: "Docs",
      faviconUrl: "https://x.dev/icon.png",
    });
  });

  it("skips the start page, a loading page and a failed page", () => {
    const browserTab = workspaceTab("tab-1", { kind: "browser", browserId: "b1" });

    expect(recentInputForTab(browserTab, loadedBrowser({}))).toBeNull();
    expect(
      recentInputForTab(browserTab, loadedBrowser({ url: "https://x.dev/", isLoading: true })),
    ).toBeNull();
    expect(
      recentInputForTab(browserTab, loadedBrowser({ url: "https://x.dev/", lastError: "offline" })),
    ).toBeNull();
    expect(recentInputForTab(browserTab, null)).toBeNull();
  });

  it("ignores every other tab", () => {
    expect(recentInputForTab(workspaceTab("tab-1", { kind: "new_tab" }), null)).toBeNull();
    expect(recentInputForTab(workspaceTab("tab-2", { kind: "changes_tree" }), null)).toBeNull();
    expect(recentInputForTab(null, null)).toBeNull();
  });
});

describe("findOpenTabForRecent", () => {
  const tabs = [
    workspaceTab("browser-tab", { kind: "browser", browserId: "b1" }),
    workspaceTab("file-tab", { kind: "file", path: "src/a.ts" }),
    workspaceTab("terminal-tab", { kind: "terminal", terminalId: "t1" }),
  ];
  const urlOfBrowser = (browserId: string) => (browserId === "b1" ? "https://x.dev/" : null);

  it("finds the tab that shows the resource", () => {
    expect(
      findOpenTabForRecent({
        tabs,
        urlOfBrowser,
        recent: { kind: "page", url: "https://x.dev/", title: "X", faviconUrl: null, at: 1 },
      }),
    ).toEqual({ tabId: "browser-tab" });
    expect(
      findOpenTabForRecent({
        tabs,
        urlOfBrowser,
        recent: { kind: "file", path: "src/a.ts", at: 1 },
      }),
    ).toEqual({ tabId: "file-tab" });
    expect(
      findOpenTabForRecent({
        tabs,
        urlOfBrowser,
        recent: { kind: "terminal", terminalId: "t1", at: 1 },
      }),
    ).toEqual({ tabId: "terminal-tab" });
  });

  it("returns null when no tab shows the resource", () => {
    expect(
      findOpenTabForRecent({
        tabs,
        urlOfBrowser,
        recent: { kind: "page", url: "https://y.dev/", title: "Y", faviconUrl: null, at: 1 },
      }),
    ).toBeNull();
    expect(
      findOpenTabForRecent({
        tabs,
        urlOfBrowser,
        recent: { kind: "terminal", terminalId: "t2", at: 1 },
      }),
    ).toBeNull();
  });
});
