import { z } from "zod";
import { browserPage, type BrowserRecord } from "@/desktop/browser/store/state";
import type { WorkspaceTab } from "@/workspace-tabs/model";

export const CONTENT_RECENT_LIMIT = 20;

export type ContentRecentInput =
  | { kind: "page"; url: string; title: string; faviconUrl: string | null }
  | { kind: "file"; path: string }
  | { kind: "terminal"; terminalId: string };

export type ContentRecent = ContentRecentInput & { at: number };

/** Column 3 belongs to one conversation; `owner` is the name `conversationOwner` gives it. */
export interface ConversationKey {
  workspaceKey: string;
  owner: string;
}

export interface ContentRecentsState {
  /** Newest first, by workspace key and then by conversation owner. */
  recentsByWorkspace: Record<string, Record<string, ContentRecent[]>>;
}

const ContentRecentSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("page"),
    url: z.string(),
    title: z.string(),
    faviconUrl: z.string().nullable(),
    at: z.number(),
  }),
  z.strictObject({ kind: z.literal("file"), path: z.string(), at: z.number() }),
  z.strictObject({ kind: z.literal("terminal"), terminalId: z.string(), at: z.number() }),
]);

export const ContentRecentsStateSchema: z.ZodType<ContentRecentsState> = z.strictObject({
  recentsByWorkspace: z.record(z.string(), z.record(z.string(), z.array(ContentRecentSchema))),
});

export function contentRecentIdentity(recent: ContentRecentInput): string {
  switch (recent.kind) {
    case "page":
      return `page:${recent.url}`;
    case "file":
      return `file:${recent.path}`;
    case "terminal":
      return `terminal:${recent.terminalId}`;
  }
}

export function conversationRecents(
  state: ContentRecentsState,
  conversation: ConversationKey,
): ContentRecent[] | undefined {
  return state.recentsByWorkspace[conversation.workspaceKey]?.[conversation.owner];
}

function withWorkspaceRecents<S extends ContentRecentsState>(
  state: S,
  workspaceKey: string,
  recentsByOwner: Record<string, ContentRecent[]>,
): S {
  return {
    ...state,
    recentsByWorkspace: { ...state.recentsByWorkspace, [workspaceKey]: recentsByOwner },
  };
}

function recentMatchesInput(recent: ContentRecent, input: ContentRecentInput): boolean {
  if (contentRecentIdentity(recent) !== contentRecentIdentity(input)) return false;
  if (recent.kind !== "page" || input.kind !== "page") return true;
  return recent.title === input.title && recent.faviconUrl === input.faviconUrl;
}

/** Returns the same state when the newest entry already matches, so re-renders don't persist. */
export function recordContentRecent<S extends ContentRecentsState>(
  state: S,
  conversation: ConversationKey,
  input: ContentRecentInput,
  now: number,
): S {
  const recents = conversationRecents(state, conversation) ?? [];
  const newest = recents[0];
  if (newest && recentMatchesInput(newest, input)) return state;

  const identity = contentRecentIdentity(input);
  const olderRecents = recents.filter((recent) => contentRecentIdentity(recent) !== identity);
  const nextRecents = [{ ...input, at: now }, ...olderRecents].slice(0, CONTENT_RECENT_LIMIT);
  return withWorkspaceRecents(state, conversation.workspaceKey, {
    ...state.recentsByWorkspace[conversation.workspaceKey],
    [conversation.owner]: nextRecents,
  });
}

/** Column 3 follows its conversation when the conversation is renamed, e.g. a draft becoming an agent. */
export function rebindContentRecents<S extends ContentRecentsState>(
  state: S,
  input: { workspaceKey: string; previousOwner: string; nextOwner: string },
): S {
  const recentsByOwner = state.recentsByWorkspace[input.workspaceKey];
  const movedRecents = recentsByOwner?.[input.previousOwner];
  if (!recentsByOwner || !movedRecents || input.previousOwner === input.nextOwner) return state;

  const seenIdentities = new Set<string>();
  const mergedRecents = [...(recentsByOwner[input.nextOwner] ?? []), ...movedRecents]
    .sort((left, right) => right.at - left.at)
    .filter((recent) => {
      const identity = contentRecentIdentity(recent);
      if (seenIdentities.has(identity)) return false;
      seenIdentities.add(identity);
      return true;
    })
    .slice(0, CONTENT_RECENT_LIMIT);
  const nextRecentsByOwner = { ...recentsByOwner, [input.nextOwner]: mergedRecents };
  delete nextRecentsByOwner[input.previousOwner];
  return withWorkspaceRecents(state, input.workspaceKey, nextRecentsByOwner);
}

/** The resource a column 3 tab shows, if it is one the home page lists. */
export function recentInputForTab(
  tab: WorkspaceTab | null,
  browser: BrowserRecord | null,
): ContentRecentInput | null {
  if (!tab) return null;
  const target = tab.target;
  if (target.kind === "file") return { kind: "file", path: target.path };
  if (target.kind === "terminal") return { kind: "terminal", terminalId: target.terminalId };
  // A loading page still carries the previous page's title, so wait for it to settle.
  if (target.kind !== "browser" || !browser || browser.isLoading) return null;

  const page = browserPage(browser);
  if (!page) return null;
  return { kind: "page", ...page };
}

/** The column-3 tab where a recent resource is still open. */
export interface OpenRecentTab {
  tabId: string;
}

export function findOpenTabForRecent(input: {
  tabs: readonly WorkspaceTab[];
  recent: ContentRecent;
  /** The address a page tab shows, or null for a page that is gone. */
  urlOfBrowser: (browserId: string) => string | null;
}): OpenRecentTab | null {
  const { recent } = input;
  for (const tab of input.tabs) {
    const target = tab.target;
    if (recent.kind === "file" && target.kind === "file" && target.path === recent.path) {
      return { tabId: tab.tabId };
    }
    const isOpenTerminal =
      recent.kind === "terminal" &&
      target.kind === "terminal" &&
      target.terminalId === recent.terminalId;
    const isOpenPage =
      recent.kind === "page" &&
      target.kind === "browser" &&
      input.urlOfBrowser(target.browserId) === recent.url;
    if (isOpenTerminal || isOpenPage) {
      return { tabId: tab.tabId };
    }
  }
  return null;
}
