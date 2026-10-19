import { useCallback, useMemo, type ReactElement } from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import {
  Archive,
  Circle,
  CircleCheck,
  Code,
  Copy,
  Ellipsis,
  GitFork,
  Pencil,
  Pin,
  PinOff,
  RotateCw,
  Tag,
} from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { EditorTargetIcon } from "@/components/icons/editor-target-icon";
import { useSidebarWorkspaceReadActions } from "@/components/sidebar/use-sidebar-workspace-read-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSubTrigger,
  type MenuPageDefinition,
} from "@/components/ui/dropdown-menu";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { useToast } from "@/contexts/toast-context";
import { useActiveWorkspacePin } from "@/hooks/use-active-workspace-pin";
import { useAgentClipboardActions } from "@/hooks/use-agent-clipboard-actions";
import { useForkAgent } from "@/hooks/use-fork-agent";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import { resolvePreferredEditorId, usePreferredEditor } from "@/hooks/use-preferred-editor";
import { useWorkspaceClipboardActions } from "@/hooks/use-workspace-clipboard-actions";
import { useHostFeature } from "@/runtime/host-features";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { useSessionStore, type WorkspaceDescriptor } from "@/stores/session-store";
import { useWorkspace } from "@/stores/session-store-hooks";
import type { Theme } from "@/styles/theme";
import {
  openDesktopTarget,
  useDesktopOpenTargets,
  type DesktopOpenTarget,
} from "@/workspace/desktop-open-targets";
import { OpenInFileManagerMenuItem } from "@/workspace/open-in-file-manager/menu-item";
import { useActiveWorkspaceArchive } from "@/workspace/use-active-workspace-archive";
import {
  useWorkspaceLabelMenuPages,
  WORKSPACE_LABEL_PAGE_ID,
  type WorkspaceLabelTarget,
} from "@/workspace-labels/picker";

const MENU_WIDTH = 240;
const MENU_ICON_SIZE = 14;
const SHORT_ID_LENGTH = 7;
const FORK_PAGE_ID = "conversation-fork";
const EDITOR_PAGE_ID = "conversation-open-in-editor";
const COPY_PAGE_ID = "conversation-copy";
const NO_PAGES: readonly MenuPageDefinition[] = [];

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const extraMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundExtraMuted });
const ThemedEllipsis = withUnistyles(Ellipsis);
const ThemedPencil = withUnistyles(Pencil);
const ThemedPin = withUnistyles(Pin);
const ThemedPinOff = withUnistyles(PinOff);
const ThemedCircle = withUnistyles(Circle);
const ThemedCircleCheck = withUnistyles(CircleCheck);
const ThemedTag = withUnistyles(Tag);
const ThemedGitFork = withUnistyles(GitFork);
const ThemedCode = withUnistyles(Code);
const ThemedCopy = withUnistyles(Copy);
const ThemedRotateCw = withUnistyles(RotateCw);
const ThemedArchive = withUnistyles(Archive);
const ThemedEditorTargetIcon = withUnistyles(EditorTargetIcon);

const renameLeading = <ThemedPencil size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const pinLeading = <ThemedPin size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const unpinLeading = <ThemedPinOff size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const markAsReadLeading = <ThemedCircleCheck size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const markAsUnreadLeading = <ThemedCircle size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const labelsLeading = <ThemedTag size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const forkLeading = <ThemedGitFork size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const editorLeading = <ThemedCode size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const copyLeading = <ThemedCopy size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const reloadLeading = <ThemedRotateCw size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const archiveLeading = <ThemedArchive size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;

/** Conversation actions that need the workspace screen's own state. */
export interface ConversationAgentActions {
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
}

interface ConversationActionsMenuProps {
  serverId: string;
  workspaceId: string;
  tab: WorkspaceTabDescriptor;
  agentId: string;
  agentActions: ConversationAgentActions;
}

/**
 * Column 2's ⋯ menu. It mixes the conversation's own actions with its workspace's, because in
 * the four-column layout a conversation is how you reach its workspace.
 */
export function ConversationActionsMenu({
  serverId,
  workspaceId,
  tab,
  agentId,
  agentActions,
}: ConversationActionsMenuProps): ReactElement {
  const { t } = useTranslation();
  const workspace = useWorkspace(serverId, workspaceId);
  const pin = useActiveWorkspacePin();
  const { onMarkAsRead, onMarkAsUnread } = useSidebarWorkspaceReadActions({
    serverId,
    workspaceId,
  });
  const archive = useActiveWorkspaceArchive({
    serverId,
    cwd: workspace?.workspaceDirectory ?? "",
    fallbackName: t("workspace.tabs.fallback.workspace"),
  });
  const isLocalDaemon = useIsLocalDaemon(serverId);
  const { targets: openTargets } = useDesktopOpenTargets({ isLocalExecution: isLocalDaemon });
  const editorTargets = useMemo(
    () => openTargets.filter((target) => target.kind === "editor"),
    [openTargets],
  );
  const labelTarget = useMemo<WorkspaceLabelTarget>(
    () => ({ serverId, workspaceId, labels: workspace?.labels ?? [] }),
    [serverId, workspaceId, workspace?.labels],
  );
  const labelPages = useWorkspaceLabelMenuPages(labelTarget);
  const forkPage = useForkPage({ serverId, workspaceId, agentId });
  const editorPage = useEditorPage({ workspace, editorTargets });
  const copyPage = useCopyPage({ serverId, workspace, agentId });
  const pages = useMemo(
    () => [...labelPages, forkPage, ...(editorPage ? [editorPage] : NO_PAGES), copyPage],
    [copyPage, editorPage, forkPage, labelPages],
  );

  const { onRenameTab, onReloadAgent } = agentActions;
  const handleRename = useCallback(() => onRenameTab(tab), [onRenameTab, tab]);
  const handleReloadAgent = useCallback(() => {
    void onReloadAgent(agentId);
  }, [onReloadAgent, agentId]);

  return (
    <DropdownMenu>
      <ToolbarButton
        kind="menu"
        label={t("workbench.conversation.actions")}
        testID="workbench-conversation-actions"
      >
        <ThemedEllipsis size={MENU_ICON_SIZE} uniProps={extraMutedColorMapping} />
      </ToolbarButton>
      <DropdownMenuContent
        side="bottom"
        align="end"
        offset={4}
        width={MENU_WIDTH}
        pages={pages}
        testID="workbench-conversation-actions-content"
      >
        <DropdownMenuItem
          leading={renameLeading}
          onSelect={handleRename}
          testID="workbench-conversation-rename"
        >
          {t("workspace.tabs.menu.rename")}
        </DropdownMenuItem>
        {pin.canToggle ? (
          <DropdownMenuItem
            leading={pin.isPinned ? unpinLeading : pinLeading}
            onSelect={pin.toggle}
            testID="workbench-conversation-pin"
          >
            {pin.isPinned
              ? t("sidebar.workspace.actions.unpin")
              : t("sidebar.workspace.actions.pin")}
          </DropdownMenuItem>
        ) : null}
        {onMarkAsRead ? (
          <DropdownMenuItem
            leading={markAsReadLeading}
            onSelect={onMarkAsRead}
            testID="workbench-conversation-mark-as-read"
          >
            {t("sidebar.workspace.actions.markAsRead")}
          </DropdownMenuItem>
        ) : null}
        {onMarkAsUnread ? (
          <DropdownMenuItem
            leading={markAsUnreadLeading}
            onSelect={onMarkAsUnread}
            testID="workbench-conversation-mark-as-unread"
          >
            {t("sidebar.workspace.actions.markAsUnread")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSubTrigger
          id={WORKSPACE_LABEL_PAGE_ID}
          leading={labelsLeading}
          testID="workbench-conversation-labels"
        >
          {t("workspaceLabels.title")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSeparator />
        <DropdownMenuSubTrigger
          id={FORK_PAGE_ID}
          leading={forkLeading}
          testID="workbench-conversation-fork"
        >
          {t("workbench.conversation.fork.title")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSeparator />
        <OpenInFileManagerMenuItem
          serverId={serverId}
          path={workspace?.workspaceDirectory}
          testID="workbench-conversation-open-folder"
        />
        {editorPage ? (
          <DropdownMenuSubTrigger
            id={EDITOR_PAGE_ID}
            leading={editorLeading}
            testID="workbench-conversation-open-in-editor"
          >
            {t("workbench.conversation.openInEditor")}
          </DropdownMenuSubTrigger>
        ) : null}
        <DropdownMenuSubTrigger
          id={COPY_PAGE_ID}
          leading={copyLeading}
          testID="workbench-conversation-copy"
        >
          {t("workbench.conversation.copy.title")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          leading={reloadLeading}
          tooltip={t("workspace.tabs.menu.reloadAgentTooltip")}
          onSelect={handleReloadAgent}
          testID="workbench-conversation-reload-agent"
        >
          {t("workspace.tabs.menu.reloadAgent")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          leading={archiveLeading}
          disabled={!archive.canArchive}
          status={archive.isArchiving ? "pending" : "idle"}
          pendingLabel={t("sidebar.workspace.actions.archiving")}
          onSelect={archive.archive}
          testID="workbench-conversation-archive"
        >
          {t("sidebar.workspace.actions.archive")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useForkPage(input: {
  serverId: string;
  workspaceId: string;
  agentId: string;
}): MenuPageDefinition {
  const { serverId, workspaceId, agentId } = input;
  const { t } = useTranslation();
  const toast = useToast();
  const forkAgent = useForkAgent({ serverId, toast });
  const fork = useCallback(
    (target: "tab" | "workspace") => {
      // Read at press time: subscribing would re-render the header on every agent update.
      const agent = useSessionStore.getState().sessions[serverId]?.agents?.get(agentId);
      if (!agent) return;
      void forkAgent({ agentId, agent, workspaceId, target });
    },
    [agentId, forkAgent, serverId, workspaceId],
  );
  const forkInSameWorkspace = useCallback(() => fork("tab"), [fork]);
  const forkInNewWorkspace = useCallback(() => fork("workspace"), [fork]);
  return useMemo(
    () => ({
      id: FORK_PAGE_ID,
      title: t("workbench.conversation.fork.title"),
      content: (
        <>
          <DropdownMenuItem
            onSelect={forkInSameWorkspace}
            testID="workbench-conversation-fork-same-workspace"
          >
            {t("workbench.conversation.fork.sameWorkspace")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={forkInNewWorkspace}
            testID="workbench-conversation-fork-new-workspace"
          >
            {t("workbench.conversation.fork.newWorkspace")}
          </DropdownMenuItem>
        </>
      ),
    }),
    [forkInNewWorkspace, forkInSameWorkspace, t],
  );
}

/** Null when no editor can open this workspace: only the desktop's own daemon shares its disk. */
function useEditorPage(input: {
  workspace: WorkspaceDescriptor | null;
  editorTargets: readonly DesktopOpenTarget[];
}): MenuPageDefinition | null {
  const { workspace, editorTargets } = input;
  const { t } = useTranslation();
  const { preferredEditorId, updatePreferredEditor } = usePreferredEditor();
  const workspaceDirectory = workspace?.workspaceDirectory ?? "";
  const effectivePreferredEditorId = useMemo(
    () =>
      resolvePreferredEditorId(
        editorTargets.map((target) => target.id),
        preferredEditorId,
      ),
    [editorTargets, preferredEditorId],
  );
  return useMemo(() => {
    if (editorTargets.length === 0 || workspaceDirectory.length === 0) return null;
    return {
      id: EDITOR_PAGE_ID,
      title: t("workbench.conversation.openInEditor"),
      content: (
        <>
          {editorTargets.map((target) => (
            <EditorTargetItem
              key={target.id}
              target={target}
              workspaceDirectory={workspaceDirectory}
              isPreferred={target.id === effectivePreferredEditorId}
              onOpened={updatePreferredEditor}
            />
          ))}
        </>
      ),
    };
  }, [editorTargets, effectivePreferredEditorId, t, updatePreferredEditor, workspaceDirectory]);
}

function EditorTargetItem({
  target,
  workspaceDirectory,
  isPreferred,
  onOpened,
}: {
  target: DesktopOpenTarget;
  workspaceDirectory: string;
  isPreferred: boolean;
  onOpened: (editorId: string) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const toast = useToast();
  const leading = useMemo(
    () => <ThemedEditorTargetIcon icon={target.icon} size={16} uniProps={mutedColorMapping} />,
    [target.icon],
  );
  const handleSelect = useCallback(() => {
    void openDesktopTarget({ editorId: target.id, workspacePath: workspaceDirectory })
      .then(() => onOpened(target.id))
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : t("workspace.git.openInEditor.failedOpen"),
        );
      });
  }, [onOpened, t, target.id, toast, workspaceDirectory]);
  return (
    <DropdownMenuItem
      leading={leading}
      selected={isPreferred}
      onSelect={handleSelect}
      testID={`workbench-conversation-open-in-editor-${target.id}`}
    >
      {target.label}
    </DropdownMenuItem>
  );
}

function useCopyPage(input: {
  serverId: string;
  workspace: WorkspaceDescriptor | null;
  agentId: string;
}): MenuPageDefinition {
  const { serverId, workspace, agentId } = input;
  const { t } = useTranslation();
  const workspaceClipboard = useWorkspaceClipboardActions();
  const agentClipboard = useAgentClipboardActions(serverId);
  const canReadStoragePaths = useHostFeature(serverId, "agentStoragePaths");
  const currentBranch = workspace?.purpose === "chat" ? null : workspace?.gitRuntime?.currentBranch;
  const copyableWorkspace = useMemo(
    () =>
      workspace
        ? {
            workspaceId: workspace.id,
            workspaceDirectory: workspace.workspaceDirectory,
            currentBranch,
          }
        : null,
    [currentBranch, workspace],
  );
  const copyWorkspacePath = useCallback(() => {
    if (copyableWorkspace) workspaceClipboard.copyPath(copyableWorkspace);
  }, [copyableWorkspace, workspaceClipboard]);
  const copyBranchName = useCallback(() => {
    if (copyableWorkspace) workspaceClipboard.copyBranchName(copyableWorkspace);
  }, [copyableWorkspace, workspaceClipboard]);
  const copySessionId = useCallback(() => {
    void agentClipboard.copySessionId(agentId);
  }, [agentClipboard, agentId]);
  const copyAgentId = useCallback(() => {
    void agentClipboard.copyAgentId(agentId);
  }, [agentClipboard, agentId]);
  const copyResumeCommand = useCallback(() => {
    void agentClipboard.copyResumeCommand(agentId);
  }, [agentClipboard, agentId]);
  const copySessionFilePath = useCallback(() => {
    void agentClipboard.copySessionFilePath(agentId);
  }, [agentClipboard, agentId]);
  const copyAgentRecordPath = useCallback(() => {
    void agentClipboard.copyAgentRecordPath(agentId);
  }, [agentClipboard, agentId]);
  const shortAgentId = useMemo(
    () => <Text style={styles.menuHint}>{agentId.slice(0, SHORT_ID_LENGTH)}</Text>,
    [agentId],
  );

  return useMemo(
    () => ({
      id: COPY_PAGE_ID,
      title: t("workbench.conversation.copy.title"),
      content: (
        <>
          <DropdownMenuItem
            disabled={!copyableWorkspace}
            onSelect={copyWorkspacePath}
            testID="workbench-conversation-copy-workspace-path"
          >
            {t("workbench.conversation.copy.workspacePath")}
          </DropdownMenuItem>
          {currentBranch ? (
            <DropdownMenuItem
              onSelect={copyBranchName}
              testID="workbench-conversation-copy-branch-name"
            >
              {t("workbench.conversation.copy.branchName")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={copySessionId}
            testID="workbench-conversation-copy-session-id"
          >
            {t("workbench.conversation.copy.sessionId")}
          </DropdownMenuItem>
          <DropdownMenuItem
            trailing={shortAgentId}
            onSelect={copyAgentId}
            testID="workbench-conversation-copy-agent-id"
          >
            {t("workbench.conversation.copy.agentId")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={copyResumeCommand}
            testID="workbench-conversation-copy-resume-command"
          >
            {t("workbench.conversation.copy.resumeCommand")}
          </DropdownMenuItem>
          {canReadStoragePaths ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={copySessionFilePath}
                testID="workbench-conversation-copy-session-file-path"
              >
                {t("workbench.conversation.copy.sessionFilePath")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={copyAgentRecordPath}
                testID="workbench-conversation-copy-agent-record-path"
              >
                {t("workbench.conversation.copy.agentRecordPath")}
              </DropdownMenuItem>
            </>
          ) : null}
        </>
      ),
    }),
    [
      canReadStoragePaths,
      copyAgentId,
      copyAgentRecordPath,
      copyBranchName,
      copyResumeCommand,
      copySessionFilePath,
      copySessionId,
      copyWorkspacePath,
      copyableWorkspace,
      currentBranch,
      shortAgentId,
      t,
    ],
  );
}

const styles = StyleSheet.create((theme) => ({
  menuHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
