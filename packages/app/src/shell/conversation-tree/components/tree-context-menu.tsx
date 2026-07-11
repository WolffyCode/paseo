import { observer } from "mobx-react-lite";
import {
  Archive,
  Circle,
  Copy,
  ExternalLink,
  FolderOpen,
  GitBranch,
  GitFork,
  Link2,
  PenLine,
  Pin,
  PinOff,
  Trash2,
  type LucideIcon,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  useContextMenu,
} from "@/components/ui/context-menu";
import { getIsElectron } from "@/constants/platform";
import { themeModel } from "../../theme/theme-model";
import type { ConversationMenuItem, ConversationMenuItemId } from "../model/conversation-menu";
import { deriveConversationMenuItems } from "../model/conversation-menu";
import type { ConversationTreeStore } from "../model/conversation-tree-store";
import type { ProjectMenuItem, ProjectMenuItemId } from "../model/project-menu";
import { deriveProjectMenuItems } from "../model/project-menu";
import type { ConversationTreeNode } from "../model/types";
import { resolveNodeWorkspace } from "./project-workspace";

export interface ConversationTreeMenuTarget {
  readonly node: ConversationTreeNode;
  readonly anchor: { readonly x: number; readonly y: number };
}

/** Render the project or shared conversation menu at the row's click point. */
export const TreeContextMenu = observer(function TreeContextMenu({
  store,
  target,
  isOffline,
  onClose,
}: {
  store: ConversationTreeStore;
  target: ConversationTreeMenuTarget | null;
  isOffline: boolean;
  onClose: () => void;
}) {
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose],
  );
  return (
    <ContextMenu open={target !== null} onOpenChange={onOpenChange}>
      {target === null ? null : <MenuBody store={store} target={target} isOffline={isOffline} />}
    </ContextMenu>
  );
});

/** Position the menu at the click anchor and pick the project vs. conversation body. */
const MenuBody = observer(function MenuBody({
  store,
  target,
  isOffline,
}: {
  store: ConversationTreeStore;
  target: ConversationTreeMenuTarget;
  isOffline: boolean;
}) {
  const { setAnchorRect } = useContextMenu();
  useEffect(() => {
    setAnchorRect({ x: target.anchor.x, y: target.anchor.y, width: 0, height: 0 });
  }, [setAnchorRect, target.anchor.x, target.anchor.y]);
  if (target.node.kind === "project") {
    return <ProjectMenuBody store={store} node={target.node} isOffline={isOffline} />;
  }
  return <ConversationMenuBody store={store} node={target.node} isOffline={isOffline} />;
});

/** Derive and render the project row's context-menu items. */
const ProjectMenuBody = observer(function ProjectMenuBody({
  store,
  node,
  isOffline,
}: {
  store: ConversationTreeStore;
  node: Extract<ConversationTreeNode, { kind: "project" }>;
  isOffline: boolean;
}) {
  const workspace = resolveNodeWorkspace(node, store.workspaceDetails);
  const desktopDirectory = getIsElectron() && workspace !== null;
  const target = { kind: "project" as const, projectKey: node.id };
  const items = deriveProjectMenuItems({
    isPinned: store.isPinned(target),
    canReveal: desktopDirectory,
    canCreateWorktree: desktopDirectory,
    isOffline,
  });
  return (
    <ContextMenuContent
      side="bottom"
      align="end"
      minWidth={192}
      testID="conv-tree-context-menu-project"
    >
      {items.map((item) => (
        <ProjectMenuRow key={item.id} store={store} node={node} item={item} workspace={workspace} />
      ))}
    </ContextMenuContent>
  );
});

/** Derive and render the conversation/subagent row's shared context-menu items. */
const ConversationMenuBody = observer(function ConversationMenuBody({
  store,
  node,
  isOffline,
}: {
  store: ConversationTreeStore;
  node: Exclude<ConversationTreeNode, { kind: "project" }>;
  isOffline: boolean;
}) {
  const workspace = resolveNodeWorkspace(node, store.workspaceDetails);
  const hasWorkspace = node.workspaceId !== null && workspace !== null;
  const target =
    node.workspaceId === null
      ? null
      : ({ kind: "workspace" as const, workspaceId: node.workspaceId } as const);
  const items = deriveConversationMenuItems({
    hasWorkspace,
    isPinned: target === null ? false : store.isPinned(target),
    canReveal: getIsElectron() && workspace !== null,
    canOpenInNewWindow: getIsElectron(),
    isOffline,
  });
  return (
    <ContextMenuContent
      side="bottom"
      align="end"
      minWidth={224}
      testID="conv-tree-context-menu-conversation"
    >
      {items.map((item) => (
        <ConversationMenuRow
          key={item.id}
          store={store}
          node={node}
          item={item}
          workspace={workspace}
        />
      ))}
    </ContextMenuContent>
  );
});

/** Render one project-menu item and dispatch its action on select. */
function ProjectMenuRow({
  store,
  node,
  item,
  workspace,
}: {
  store: ConversationTreeStore;
  node: Extract<ConversationTreeNode, { kind: "project" }>;
  item: ProjectMenuItem;
  workspace: ReturnType<typeof resolveNodeWorkspace>;
}) {
  const onSelect = useCallback(() => {
    dispatchProjectItem(store, node, item.id, workspace);
  }, [item.id, node, store, workspace]);
  const pending = item.id === "remove" && store.removingProjectKeys.has(node.id);
  return (
    <MenuRow
      id={item.id}
      enabled={item.enabled}
      destructive={item.destructive}
      separatorBefore={item.separatorBefore}
      pending={pending}
      onSelect={onSelect}
    />
  );
}

/** Render one conversation-menu item and dispatch its action on select. */
function ConversationMenuRow({
  store,
  node,
  item,
  workspace,
}: {
  store: ConversationTreeStore;
  node: Exclude<ConversationTreeNode, { kind: "project" }>;
  item: ConversationMenuItem;
  workspace: ReturnType<typeof resolveNodeWorkspace>;
}) {
  const onSelect = useCallback(() => {
    dispatchConversationItem(store, node, item.id, workspace);
  }, [item.id, node, store, workspace]);
  return (
    <MenuRow
      id={item.id}
      enabled={item.enabled}
      destructive={item.destructive}
      separatorBefore={item.separatorBefore}
      pending={false}
      onSelect={onSelect}
    />
  );
}

/** Render one context-menu item's icon, label, and pending/destructive styling. */
function MenuRow({
  id,
  enabled,
  destructive,
  separatorBefore,
  pending,
  onSelect,
}: {
  id: ProjectMenuItemId | ConversationMenuItemId;
  enabled: boolean;
  destructive: boolean;
  separatorBefore: boolean;
  pending: boolean;
  onSelect: () => void;
}) {
  const tk = themeModel.tokens;
  const Icon = MENU_ICON[id];
  const leading = useMemo(
    () => <Icon size={14} color={destructive ? tk.statusDanger : tk.foregroundMuted} />,
    [Icon, destructive, tk.foregroundMuted, tk.statusDanger],
  );
  return (
    <>
      {separatorBefore ? <ContextMenuSeparator /> : null}
      <ContextMenuItem
        destructive={destructive}
        disabled={!enabled}
        leading={leading}
        onSelect={onSelect}
        status={pending ? "pending" : undefined}
        pendingLabel="移除中..."
        testID={`conv-tree-menu-${id}`}
      >
        {MENU_LABEL[id]}
      </ContextMenuItem>
    </>
  );
}

/** Route a selected project-menu item id to its store action. */
function dispatchProjectItem(
  store: ConversationTreeStore,
  node: Extract<ConversationTreeNode, { kind: "project" }>,
  id: ProjectMenuItemId,
  workspace: ReturnType<typeof resolveNodeWorkspace>,
): void {
  switch (id) {
    case "pin":
    case "unpin":
      store.togglePin({ kind: "project", projectKey: node.id });
      return;
    case "reveal-in-finder":
      if (workspace !== null) void store.revealWorkspace(workspace.workspaceId);
      return;
    case "create-worktree":
      if (workspace !== null) {
        store.openProjectConversation({
          sourceDirectory: workspace.detail.directory,
          projectKey: node.id,
          projectName: node.title,
        });
      }
      return;
    case "rename-project":
      store.beginRename("project", node.id);
      return;
    case "remove":
      void store.requestRemoveProject(node.id);
      return;
    case "archive":
      return;
  }
}

/** Route a selected conversation-menu item id to its store action. */
function dispatchConversationItem(
  store: ConversationTreeStore,
  node: Exclude<ConversationTreeNode, { kind: "project" }>,
  id: ConversationMenuItemId,
  workspace: ReturnType<typeof resolveNodeWorkspace>,
): void {
  switch (id) {
    case "pin":
    case "unpin":
      if (node.workspaceId !== null) {
        store.togglePin({ kind: "workspace", workspaceId: node.workspaceId });
      }
      return;
    case "rename":
      store.beginRename("conversation", node.id);
      return;
    case "reveal-in-finder":
      if (workspace !== null) void store.revealWorkspace(workspace.workspaceId);
      return;
    case "copy-session-id":
      store.copySessionId(node.id);
      return;
    case "open-in-new-window":
      if (workspace !== null) store.openWorkspaceInNewWindow(workspace.workspaceId);
      return;
    case "archive":
    case "mark-unread":
    case "copy-workspace-path":
    case "copy-deep-link":
    case "fork-local":
    case "fork-worktree":
      return;
  }
}

const MENU_LABEL: Record<ProjectMenuItemId | ConversationMenuItemId, string> = {
  pin: "置顶",
  unpin: "取消置顶",
  "reveal-in-finder": "在 Finder 中显示",
  "create-worktree": "创建工作树...",
  "rename-project": "重命名项目",
  archive: "归档",
  remove: "移除",
  rename: "重命名",
  "mark-unread": "标记为未读",
  "copy-workspace-path": "复制工作目录",
  "copy-session-id": "复制会话 ID",
  "copy-deep-link": "复制深度链接",
  "fork-local": "派生到本地",
  "fork-worktree": "派生到新工作树",
  "open-in-new-window": "在新窗口打开",
};

const MENU_ICON: Record<ProjectMenuItemId | ConversationMenuItemId, LucideIcon> = {
  pin: Pin,
  unpin: PinOff,
  "reveal-in-finder": FolderOpen,
  "create-worktree": GitBranch,
  "rename-project": PenLine,
  archive: Archive,
  remove: Trash2,
  rename: PenLine,
  "mark-unread": Circle,
  "copy-workspace-path": Copy,
  "copy-session-id": Copy,
  "copy-deep-link": Link2,
  "fork-local": GitFork,
  "fork-worktree": GitFork,
  "open-in-new-window": ExternalLink,
};
