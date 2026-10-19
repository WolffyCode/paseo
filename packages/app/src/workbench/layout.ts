import type { SplitNode, SplitPane, WorkspaceLayout } from "@/stores/workspace-layout-actions";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/workspace-tabs/model";
import type { PaneHost } from "@/panels/panel-manifest";
import { createNewWorkspaceTab } from "@/workspace-tabs/new-tab";

export const WORKBENCH_ROOT_ID = "workbench";
export const CONVERSATION_PANE_ID = "workbench:conversations";
const CONTENT_PREFIX = "workbench:content:";
const FILES_PREFIX = "workbench:files:";

export function isWorkbenchLayout(layout: WorkspaceLayout): boolean {
  return layout.root.kind === "group" && layout.root.group.id === WORKBENCH_ROOT_ID;
}

export function usesWorkbench(layout: WorkspaceLayout | null, compact: boolean): boolean {
  return !compact && layout !== null && isWorkbenchLayout(layout);
}

export function workbenchPaneHost(paneId: string | null | undefined): PaneHost | null {
  if (paneId === CONVERSATION_PANE_ID || paneId?.startsWith(`${CONVERSATION_PANE_ID}:`))
    return "conversations";
  if (paneId?.startsWith(CONTENT_PREFIX)) return "content";
  if (paneId?.startsWith(FILES_PREFIX)) return "files";
  return null;
}

export function showsWorkbenchTabBar(paneId: string | null | undefined): boolean {
  return workbenchPaneHost(paneId) !== "conversations" && workbenchPaneHost(paneId) !== "files";
}

export function isConversationTarget(target: WorkspaceTabTarget): boolean {
  return target.kind === "agent" || target.kind === "draft" || target.kind === "provider_subagent";
}

export function conversationOwner(tab: WorkspaceTab | undefined): string {
  if (!tab) return "empty";
  if (tab.target.kind === "agent") return `agent:${tab.target.agentId}`;
  if (tab.target.kind === "draft") return `draft:${tab.target.draftId}`;
  if (tab.target.kind === "provider_subagent") {
    return `subagent:${tab.target.parentAgentId}:${tab.target.subagentId}`;
  }
  return `view:${tab.tabId}`;
}

export function workbenchPaneOwner(paneId: string): string | null {
  if (paneId.startsWith(CONTENT_PREFIX)) return paneId.slice(CONTENT_PREFIX.length);
  if (paneId.startsWith(FILES_PREFIX)) return paneId.slice(FILES_PREFIX.length);
  return null;
}

export function workbenchContentPaneId(owner: string): string {
  return `${CONTENT_PREFIX}${owner}`;
}

export function workbenchFilesPaneId(owner: string): string {
  return `${FILES_PREFIX}${owner}`;
}

export function workbenchPanes(layout: WorkspaceLayout): SplitPane[] {
  if (!isWorkbenchLayout(layout)) return [];
  function visit(node: SplitNode): SplitPane[] {
    return node.kind === "pane" ? [node.pane] : node.group.children.flatMap(visit);
  }
  return visit(layout.root);
}

export function workbenchConversationRoot(layout: WorkspaceLayout): SplitNode {
  if (layout.root.kind !== "group") return layout.root;
  const panes = workbenchPanes(layout).filter(
    (pane) => workbenchPaneHost(pane.id) === "conversations",
  );
  const primary = panes.find((pane) => pane.id === CONVERSATION_PANE_ID) ?? panes[0];
  if (!primary) return layout.root;
  const seen = new Set<string>();
  const tabs = panes
    .flatMap((pane) => pane.tabs ?? [])
    .filter((tab) => {
      if (seen.has(tab.tabId)) return false;
      seen.add(tab.tabId);
      return true;
    });
  const focused = tabs.some((tab) => tab.tabId === primary.focusedTabId)
    ? primary.focusedTabId
    : tabs[0]?.tabId;
  return paneNode({ id: CONVERSATION_PANE_ID, tabs, focusedTabId: focused });
}

export function activeConversationPane(layout: WorkspaceLayout): SplitPane | undefined {
  const panes = workbenchPanes(layout);
  const conversations = panes.filter((pane) => workbenchPaneHost(pane.id) === "conversations");
  const owner = layout.focusedPaneId ? workbenchPaneOwner(layout.focusedPaneId) : null;
  return (
    conversations.find((pane) => pane.id === layout.focusedPaneId) ??
    conversations.find((pane) => pane.tabs?.some((tab) => conversationOwner(tab) === owner)) ??
    conversations[0]
  );
}

export function activeConversationOwner(layout: WorkspaceLayout): string {
  const pane = activeConversationPane(layout);
  const tab = pane?.tabs?.find((entry) => entry.tabId === pane.focusedTabId);
  return conversationOwner(tab);
}

/** The tab column 3 shows: the focused tab of the active conversation's content pane. */
export function focusedContentTab(layout: WorkspaceLayout): WorkspaceTab | null {
  const contentPaneId = workbenchContentPaneId(activeConversationOwner(layout));
  const contentPane = workbenchPanes(layout).find((pane) => pane.id === contentPaneId);
  if (!contentPane) return null;
  return contentPane.tabs?.find((tab) => tab.tabId === contentPane.focusedTabId) ?? null;
}

function paneNode(input: {
  id: string;
  tabs: WorkspaceTab[];
  focusedTabId?: string | null;
  hidden?: boolean;
}): SplitNode {
  const focusedTabId = input.tabs.some((tab) => tab.tabId === input.focusedTabId)
    ? (input.focusedTabId ?? null)
    : (input.tabs[0]?.tabId ?? null);
  return {
    kind: "pane",
    pane: {
      id: input.id,
      tabs: input.tabs,
      tabIds: input.tabs.map((tab) => tab.tabId),
      focusedTabId,
      hidden: input.hidden === true,
    },
  };
}

export function createWorkbenchLayout(input: {
  tabs: WorkspaceTab[];
  focusedTabId: string | null;
  parentTabIdByTabId?: Record<string, string>;
}): WorkspaceLayout {
  const conversations = input.tabs.filter(
    (tab) => isConversationTarget(tab.target) || tab.target.kind === "new_tab",
  );
  if (conversations.length === 0) conversations.push(createNewWorkspaceTab());
  function findConversation(tabId: string | null): WorkspaceTab | undefined {
    const visited = new Set<string>();
    while (tabId && !visited.has(tabId)) {
      const tab = conversations.find((entry) => entry.tabId === tabId);
      if (tab) return tab;
      visited.add(tabId);
      tabId = input.parentTabIdByTabId?.[tabId] ?? null;
    }
    return undefined;
  }
  const conversation = findConversation(input.focusedTabId) ?? conversations[0];
  const owner = conversationOwner(conversation);
  const content = input.tabs.filter(
    (tab) =>
      !isConversationTarget(tab.target) &&
      tab.target.kind !== "new_tab" &&
      tab.target.kind !== "files",
  );
  const files = input.tabs.filter((tab) => tab.target.kind === "files").slice(0, 1);
  const contentByOwner = new Map<string, WorkspaceTab[]>();
  for (const tab of content) {
    const tabOwner = conversationOwner(findConversation(tab.tabId) ?? conversation);
    contentByOwner.set(tabOwner, [...(contentByOwner.get(tabOwner) ?? []), tab]);
  }
  return reconcileWorkbenchLayout({
    root: {
      kind: "group",
      group: {
        id: WORKBENCH_ROOT_ID,
        direction: "horizontal",
        sizes: [0.5, 0.35, 0.15],
        children: [
          paneNode({
            id: CONVERSATION_PANE_ID,
            tabs: conversations,
            focusedTabId: conversation.tabId,
          }),
          ...Array.from(contentByOwner, ([contentOwner, tabs]) =>
            paneNode({
              id: workbenchContentPaneId(contentOwner),
              tabs,
              focusedTabId: input.focusedTabId,
            }),
          ),
          paneNode({ id: workbenchFilesPaneId(owner), tabs: files }),
        ],
      },
    },
    focusedPaneId: CONVERSATION_PANE_ID,
    parentTabIdByTabId: input.parentTabIdByTabId,
  });
}

/** All conversation views stay in the existing layout owner, including inactive content. */
export function reconcileWorkbenchLayout(layout: WorkspaceLayout): WorkspaceLayout {
  if (!isWorkbenchLayout(layout) || layout.root.kind !== "group") return layout;
  const panes = workbenchPanes(layout);
  const conversations = panes.filter((pane) => workbenchPaneHost(pane.id) === "conversations");
  if (conversations.length === 0) return layout;
  const owner = activeConversationOwner(layout);
  const contentId = workbenchContentPaneId(owner);
  const filesId = workbenchFilesPaneId(owner);
  for (const tab of conversations.flatMap((pane) => pane.tabs ?? [])) {
    const tabOwner = conversationOwner(tab);
    for (const id of [workbenchContentPaneId(tabOwner), workbenchFilesPaneId(tabOwner)]) {
      if (!panes.some((pane) => pane.id === id)) {
        panes.push({ id, tabs: [], tabIds: [], focusedTabId: null });
      }
    }
  }
  const children = [
    workbenchConversationRoot(layout),
    ...panes
      .filter((pane) => workbenchPaneHost(pane.id) !== "conversations")
      .map((pane): SplitNode => {
        const host = workbenchPaneHost(pane.id);
        let tabs = pane.tabs ?? [];
        if (host === "content" && tabs.length === 0) tabs = [createNewWorkspaceTab()];
        if (host === "files" && tabs.length === 0) {
          tabs = [{ tabId: `${pane.id}:tree`, target: { kind: "files" }, createdAt: 0 }];
        }
        const hidden = pane.id !== contentId && pane.id !== filesId;
        return paneNode({ ...pane, tabs, hidden });
      }),
  ];
  const focusedPane = panes.find((pane) => pane.id === layout.focusedPaneId);
  const focusOwner = focusedPane ? workbenchPaneOwner(focusedPane.id) : null;
  const focusBelongsToOtherConversation = focusOwner !== null && focusOwner !== owner;
  return {
    ...layout,
    root: {
      kind: "group",
      group: { ...layout.root.group, children, sizes: children.map(() => 1 / children.length) },
    },
    focusedPaneId: focusBelongsToOtherConversation
      ? (activeConversationPane(layout)?.id ?? CONVERSATION_PANE_ID)
      : layout.focusedPaneId,
  };
}

export function activateWorkbenchPaneOwner(
  layout: WorkspaceLayout,
  paneId: string,
): WorkspaceLayout {
  const owner = workbenchPaneOwner(paneId);
  if (!owner || !isWorkbenchLayout(layout) || layout.root.kind !== "group") return layout;
  function activate(node: SplitNode): SplitNode {
    if (node.kind === "group")
      return {
        kind: "group",
        group: { ...node.group, children: node.group.children.map(activate) },
      };
    if (workbenchPaneHost(node.pane.id) !== "conversations") return node;
    const tab = node.pane.tabs?.find((entry) => conversationOwner(entry) === owner);
    return tab ? { kind: "pane", pane: { ...node.pane, focusedTabId: tab.tabId } } : node;
  }
  const children = layout.root.group.children.map(activate);
  return { ...layout, root: { kind: "group", group: { ...layout.root.group, children } } };
}

export function bindWorkbenchConversation(
  layout: WorkspaceLayout,
  previous: string,
  next: string,
): WorkspaceLayout {
  if (!isWorkbenchLayout(layout) || layout.root.kind !== "group") return layout;
  function bindId(id: string | null): string | null {
    if (id === workbenchContentPaneId(previous)) return workbenchContentPaneId(next);
    if (id === workbenchFilesPaneId(previous)) return workbenchFilesPaneId(next);
    return id;
  }
  const children = layout.root.group.children.map((node): SplitNode => {
    if (node.kind !== "pane") return node;
    return { kind: "pane", pane: { ...node.pane, id: bindId(node.pane.id) ?? node.pane.id } };
  });
  return {
    ...layout,
    focusedPaneId: bindId(layout.focusedPaneId),
    root: { kind: "group", group: { ...layout.root.group, children } },
  };
}

export function resolveWorkbenchDestination(input: {
  layout: WorkspaceLayout;
  target: WorkspaceTabTarget;
  sourcePaneId?: string | null;
  parentTabId?: string;
}): string | null {
  const panes = workbenchPanes(input.layout);
  const conversationDestination =
    workbenchPaneHost(input.sourcePaneId) === "conversations"
      ? input.sourcePaneId!
      : (activeConversationPane(input.layout)?.id ?? CONVERSATION_PANE_ID);
  if (isConversationTarget(input.target)) return conversationDestination;
  const parentPane = input.parentTabId
    ? panes.find((pane) => pane.tabIds.includes(input.parentTabId ?? ""))
    : null;
  const parentTab = parentPane?.tabs?.find((tab) => tab.tabId === input.parentTabId);
  if (input.parentTabId && !parentTab && !input.sourcePaneId) return null;
  let owner = activeConversationOwner(input.layout);
  if (parentTab && isConversationTarget(parentTab.target)) owner = conversationOwner(parentTab);
  else if (parentPane) owner = workbenchPaneOwner(parentPane.id) ?? owner;
  else if (input.sourcePaneId) owner = workbenchPaneOwner(input.sourcePaneId) ?? owner;
  if (input.target.kind === "files") return workbenchFilesPaneId(owner);
  if (input.target.kind === "new_tab" && workbenchPaneHost(input.sourcePaneId) === "conversations")
    return conversationDestination;
  return workbenchContentPaneId(owner);
}
