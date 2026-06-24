import { memo, useCallback, useMemo, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, Pressable, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Archive, CircleCheck, FolderOpen, MoreVertical, Pencil, Pin } from "lucide-react-native";
import { useMutation } from "@tanstack/react-query";
import type { Theme } from "@/styles/theme";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import type { DraggableListDragHandleProps } from "@/components/draggable-list.types";
import type { ShortcutKey } from "@/utils/format-shortcut";
import { formatTimeAgoShort } from "@/utils/time";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Shortcut } from "@/components/ui/shortcut";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { useToast } from "@/contexts/toast-context";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useCheckoutGitActionsStore } from "@/git/actions-store";
import { toWorktreeArchiveRisk } from "@/git/worktree-archive-warning";
import { useWorkspaceArchive } from "@/workspace/use-workspace-archive";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import { useClearWorkspaceAttention } from "@/hooks/use-clear-workspace-attention";
import { redirectIfArchivingActiveWorkspace } from "@/utils/sidebar-workspace-archive-redirect";
import { requireWorkspaceDirectory, resolveWorkspaceDirectory } from "@/utils/workspace-directory";
import { useSidebarPinsStore } from "@/stores/sidebar-pins-store";
import {
  hasDesktopOpenTargetsBridge,
  listDesktopOpenTargets,
  openDesktopTarget,
} from "@/workspace/desktop-open-targets";
import { isWeb as platformIsWeb, isNative as platformIsNative } from "@/constants/platform";
import { useLongPressDragInteraction } from "@/components/sidebar/use-long-press-drag-interaction";
import {
  SidebarWorkspaceRowFrame,
  SidebarWorkspaceRowContent,
  SidebarWorkspaceTrailingActionBase,
  SidebarWorkspaceTrailingActionOverlay,
  SidebarWorkspaceTrailingActionSlot,
} from "@/components/sidebar/sidebar-workspace-row-content";

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const ThemedMoreVertical = withUnistyles(MoreVertical);
const ThemedPin = withUnistyles(Pin);
const ThemedFolderOpen = withUnistyles(FolderOpen);
const ThemedArchive = withUnistyles(Archive);
const ThemedPencil = withUnistyles(Pencil);
const ThemedCircleCheck = withUnistyles(CircleCheck);

const pinLeadingIcon = <ThemedPin size={14} uniProps={foregroundMutedColorMapping} />;
const pinnedLeadingIcon = (
  <ThemedPin size={14} fill="currentColor" uniProps={foregroundMutedColorMapping} />
);
const revealLeadingIcon = <ThemedFolderOpen size={14} uniProps={foregroundMutedColorMapping} />;
const renameLeadingIcon = <ThemedPencil size={14} uniProps={foregroundMutedColorMapping} />;
const markAsReadLeadingIcon = (
  <ThemedCircleCheck size={14} uniProps={foregroundMutedColorMapping} />
);
const archiveLeadingIcon = <ThemedArchive size={14} uniProps={foregroundMutedColorMapping} />;

function renderKebabTriggerIcon({ hovered }: { hovered?: boolean }) {
  return (
    <ThemedMoreVertical
      size={14}
      uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
    />
  );
}

function renderPinIndicatorIcon({ hovered }: { hovered?: boolean }) {
  return (
    <ThemedPin
      size={14}
      fill="currentColor"
      uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
    />
  );
}

function renderRemoveIcon({ hovered }: { hovered?: boolean }) {
  return (
    <ThemedArchive
      size={14}
      uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
    />
  );
}

function noop() {}

interface SidebarWorkspaceRowProps {
  workspace: SidebarWorkspaceEntry;
  selected: boolean;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  onPress: () => void;
  /** Secondary line under the name (status grouping shows the project name). */
  subtitle?: string | null;
  /** Project grouping only: shows a transient "creating" affordance. */
  isCreating?: boolean;
  /** Project grouping only: drag-to-reorder wiring. Absent → not draggable. */
  drag?: () => void;
  isDragging?: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
}

export function SidebarWorkspaceRow({
  workspace,
  selected,
  shortcutNumber,
  showShortcutBadge,
  onPress,
  subtitle,
  isCreating = false,
  drag,
  isDragging = false,
  dragHandleProps,
}: SidebarWorkspaceRowProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [isHidingWorkspace, setIsHidingWorkspace] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const workspaceDirectory = resolveWorkspaceDirectory({
    workspaceDirectory: workspace.workspaceDirectory,
  });
  const worktreeArchiveStatus = useCheckoutGitActionsStore((state) =>
    workspaceDirectory
      ? state.getStatus({
          serverId: workspace.serverId,
          cwd: workspaceDirectory,
          actionId: "archive-worktree",
        })
      : "idle",
  );
  const isWorktree = workspace.workspaceKind === "worktree";
  const isArchiving = isWorktree ? workspace.archivingAt !== null : isHidingWorkspace;

  const redirectAfterArchive = useCallback(() => {
    redirectIfArchivingActiveWorkspace({
      serverId: workspace.serverId,
      workspaceId: workspace.workspaceId,
      activeWorkspaceSelection: selected
        ? { serverId: workspace.serverId, workspaceId: workspace.workspaceId }
        : null,
    });
  }, [selected, workspace]);

  const archiveController = useWorkspaceArchive({
    serverId: workspace.serverId,
    workspaceId: workspace.workspaceId,
    workspaceDirectory: workspace.workspaceDirectory,
    workspaceKind: workspace.workspaceKind,
    name: workspace.name,
    ...toWorktreeArchiveRisk(workspace),
    onArchiveStarted: redirectAfterArchive,
    onSetHiding: setIsHidingWorkspace,
  });

  const handleArchive = useCallback(() => {
    if (isArchiving) {
      return;
    }
    archiveController.archive();
  }, [archiveController, isArchiving]);

  // "Reveal in Finder" (在 Finder 中显示) — desktop-only, routes the workspace directory
  // through the Electron file-manager open target. Hidden on web/native (no bridge).
  const handleRevealInFinder = useCallback(() => {
    let revealTargetDirectory: string;
    try {
      revealTargetDirectory = requireWorkspaceDirectory({
        workspaceId: workspace.workspaceId,
        workspaceDirectory: workspace.workspaceDirectory,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("sidebar.workspace.toasts.workspacePathUnavailable"),
      );
      return;
    }
    void (async () => {
      const targets = await listDesktopOpenTargets();
      const fileManager = targets.find((target) => target.kind === "file-manager");
      if (!fileManager) {
        return;
      }
      await openDesktopTarget({
        editorId: fileManager.id,
        path: revealTargetDirectory,
        mode: "reveal",
      });
    })().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to reveal in Finder");
    });
  }, [t, toast, workspace.workspaceDirectory, workspace.workspaceId]);
  const canRevealInFinder = hasDesktopOpenTargetsBridge();

  const renameMutation = useMutation({
    mutationFn: async (title: string) => {
      const client = getHostRuntimeStore().getClient(workspace.serverId);
      if (!client) {
        throw new Error(t("sidebar.workspace.toasts.hostDisconnected"));
      }
      await client.setWorkspaceTitle(workspace.workspaceId, title.length === 0 ? null : title);
    },
  });

  const handleOpenRename = useCallback(() => {
    setIsRenameOpen(true);
  }, []);

  const handleCloseRename = useCallback(() => {
    setIsRenameOpen(false);
  }, []);

  const handleSubmitRename = useCallback(
    async (value: string) => {
      await renameMutation.mutateAsync(value.trim());
    },
    [renameMutation],
  );

  const archiveShortcutKeys = useShortcutKeys("archive-worktree");
  const { hasClearableAttention, clearAttention } = useClearWorkspaceAttention({
    serverId: workspace.serverId,
    workspaceId: workspace.workspaceId,
  });
  const handleMarkAsRead = useCallback(() => {
    void clearAttention().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to mark workspace as read");
    });
  }, [clearAttention, toast]);

  useKeyboardActionHandler({
    handlerId: `worktree-archive-${workspace.workspaceKey}`,
    actions: ["worktree.archive"],
    enabled: selected && !isArchiving,
    priority: 0,
    handle: () => {
      handleArchive();
      return true;
    },
  });

  let archiveStatus: "idle" | "pending" | "success" = "idle";
  if (isWorktree) {
    archiveStatus = worktreeArchiveStatus;
  } else if (isHidingWorkspace) {
    archiveStatus = "pending";
  }

  return (
    <>
      <WorkspaceRowBody
        workspace={workspace}
        selected={selected}
        shortcutNumber={shortcutNumber}
        showShortcutBadge={showShortcutBadge}
        subtitle={subtitle}
        isCreating={isCreating}
        isArchiving={isArchiving}
        onPress={onPress}
        drag={drag}
        isDragging={isDragging}
        dragHandleProps={dragHandleProps}
        archiveLabel={t("sidebar.workspace.actions.archive")}
        archiveStatus={archiveStatus}
        archivePendingLabel={t("sidebar.workspace.actions.archiving")}
        onArchive={handleArchive}
        onRevealInFinder={canRevealInFinder ? handleRevealInFinder : undefined}
        onRename={handleOpenRename}
        onMarkAsRead={hasClearableAttention ? handleMarkAsRead : undefined}
        archiveShortcutKeys={selected ? archiveShortcutKeys : null}
      />
      <AdaptiveRenameModal
        visible={isRenameOpen}
        title={t("sidebar.workspace.rename.title")}
        initialValue={workspace.title ?? workspace.name}
        placeholder={workspace.name}
        submitLabel={t("sidebar.workspace.rename.submit")}
        onClose={handleCloseRename}
        onSubmit={handleSubmitRename}
        testID={`sidebar-workspace-rename-modal-${workspace.workspaceKey}`}
      />
    </>
  );
}

interface WorkspaceRowBodyProps {
  workspace: SidebarWorkspaceEntry;
  selected: boolean;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  subtitle?: string | null;
  isCreating: boolean;
  isArchiving: boolean;
  onPress: () => void;
  drag?: () => void;
  isDragging: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  onArchive?: () => void;
  onRevealInFinder?: () => void;
  onRename?: () => void;
  onMarkAsRead?: () => void;
  archiveShortcutKeys?: ShortcutKey[][] | null;
}

function WorkspaceRowBody({
  workspace,
  selected,
  shortcutNumber,
  showShortcutBadge,
  subtitle,
  isCreating,
  isArchiving,
  onPress,
  drag,
  isDragging,
  dragHandleProps,
  archiveLabel,
  archiveStatus = "idle",
  archivePendingLabel,
  onArchive,
  onRevealInFinder,
  onRename,
  onMarkAsRead,
  archiveShortcutKeys,
}: WorkspaceRowBodyProps) {
  const isTouchPlatform = platformIsNative;
  const draggable = Boolean(drag);
  const interaction = useLongPressDragInteraction({
    drag: drag ?? noop,
    menuController: null,
  });
  const {
    role: _dragRole,
    tabIndex: _dragTabIndex,
    "aria-roledescription": _dragRoleDescription,
    ...dragAttributes
  } = dragHandleProps?.attributes ?? {};

  const handlePress = useCallback(() => {
    if (interaction.didLongPressRef.current) {
      interaction.didLongPressRef.current = false;
      return;
    }
    onPress();
  }, [interaction.didLongPressRef, onPress]);

  const accessibilityState = useMemo(() => ({ selected }), [selected]);

  return (
    <SidebarWorkspaceRowFrame workspace={workspace} isDragging={isDragging}>
      {({ isHovered, hoverHandlers }) => {
        const isDesktop = !isTouchPlatform;
        const showScriptsIcon = isDesktop && workspace.hasRunningScripts;
        const hasRunningService = workspace.scripts.some(
          (s) => s.lifecycle === "running" && (s.type ?? "service") === "service",
        );
        let scriptIconKind: "service" | "command" | null = null;
        if (showScriptsIcon) {
          scriptIconKind = hasRunningService ? "service" : "command";
        }
        const workspaceRowStyle = getWorkspaceRowStyle({ isDragging, selected, isHovered });
        return (
          <View
            {...(draggable ? dragAttributes : {})}
            {...(draggable ? dragHandleProps?.listeners : {})}
            ref={
              draggable ? (dragHandleProps?.setActivatorNodeRef as unknown as Ref<View>) : undefined
            }
            style={styles.workspaceRowContainer}
            {...hoverHandlers}
          >
            <Pressable
              disabled={isArchiving}
              aria-selected={selected}
              accessibilityRole="button"
              accessibilityState={accessibilityState}
              style={workspaceRowStyle}
              onPressIn={draggable ? interaction.handlePressIn : undefined}
              onTouchMove={draggable ? interaction.handleTouchMove : undefined}
              onPressOut={draggable ? interaction.handlePressOut : undefined}
              onPress={handlePress}
              testID={`sidebar-workspace-row-${workspace.workspaceKey}`}
            >
              <SidebarWorkspaceRowContent
                workspace={workspace}
                subtitle={subtitle}
                scriptIconKind={scriptIconKind}
                isHovered={isHovered}
                isLoading={isArchiving || isCreating}
                isCreating={isCreating}
                shortcutNumber={shortcutNumber}
                showShortcutBadge={showShortcutBadge}
              >
                <WorkspaceRowTrailingActions
                  workspace={workspace}
                  isHovered={isHovered}
                  isTouchPlatform={isTouchPlatform}
                  isCreating={isCreating}
                  showShortcutBadge={showShortcutBadge}
                  shortcutNumber={shortcutNumber}
                  archiveLabel={archiveLabel}
                  archiveStatus={archiveStatus}
                  archivePendingLabel={archivePendingLabel}
                  archiveShortcutKeys={archiveShortcutKeys}
                  onArchive={onArchive}
                  onRevealInFinder={onRevealInFinder}
                  onRename={onRename}
                  onMarkAsRead={onMarkAsRead}
                />
              </SidebarWorkspaceRowContent>
            </Pressable>
          </View>
        );
      }}
    </SidebarWorkspaceRowFrame>
  );
}

function WorkspaceRowTrailingActions({
  workspace,
  isHovered,
  isTouchPlatform,
  isCreating,
  showShortcutBadge,
  shortcutNumber,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
  onArchive,
  onMarkAsRead,
  onRevealInFinder,
  onRename,
}: {
  workspace: SidebarWorkspaceEntry;
  isHovered: boolean;
  isTouchPlatform: boolean;
  isCreating: boolean;
  showShortcutBadge: boolean;
  shortcutNumber: number | null;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  archiveShortcutKeys?: ShortcutKey[][] | null;
  onArchive?: () => void;
  onMarkAsRead?: () => void;
  onRevealInFinder?: () => void;
  onRename?: () => void;
}) {
  const { t } = useTranslation();
  const isPinned = useSidebarPinsStore((state) =>
    state.isPinned(workspace.serverId, { kind: "workspace", workspaceId: workspace.workspaceId }),
  );
  const showShortcut = showShortcutBadge && shortcutNumber !== null;
  const showKebab = Boolean(onArchive && (isHovered || isTouchPlatform));
  const showKebabInSlot = showKebab && !showShortcut;
  // Codex-style file tree: the trailing slot shows a relative "time ago" label sourced from
  // when the workspace entered its current status, in place of the old +/- diff stat.
  const timeAgoLabel = workspace.statusEnteredAt
    ? formatTimeAgoShort(workspace.statusEnteredAt, t)
    : null;
  const shouldRenderActionSlot = Boolean(onArchive || timeAgoLabel);

  // A pinned workspace lives standalone in the "置顶" section — its trailing
  // controls (persistent pin + remove + kebab) live in their own component.
  if (isPinned && onArchive) {
    return (
      <WorkspacePinnedTrailingActions
        workspace={workspace}
        isHovered={isHovered}
        isTouchPlatform={isTouchPlatform}
        isCreating={isCreating}
        onArchive={onArchive}
        onRevealInFinder={onRevealInFinder}
        onRename={onRename}
        onMarkAsRead={onMarkAsRead}
        archiveLabel={archiveLabel}
        archiveStatus={archiveStatus}
        archivePendingLabel={archivePendingLabel}
        archiveShortcutKeys={archiveShortcutKeys}
      />
    );
  }

  return (
    <>
      {isCreating ? (
        <Text style={styles.workspaceCreatingText}>{t("sidebar.workspace.status.creating")}</Text>
      ) : null}
      {shouldRenderActionSlot ? (
        <SidebarWorkspaceTrailingActionSlot>
          <SidebarWorkspaceTrailingActionBase
            visible={Boolean(timeAgoLabel && !showKebabInSlot && !showShortcut)}
          >
            {timeAgoLabel ? (
              <View style={styles.timeAgoContainer}>
                <Text style={styles.timeAgoText} numberOfLines={1}>
                  {timeAgoLabel}
                </Text>
              </View>
            ) : null}
          </SidebarWorkspaceTrailingActionBase>
          <SidebarWorkspaceTrailingActionOverlay visible={showKebabInSlot}>
            {onArchive ? (
              <WorkspaceKebabMenu
                workspaceKey={workspace.workspaceKey}
                serverId={workspace.serverId}
                workspaceId={workspace.workspaceId}
                onRevealInFinder={onRevealInFinder}
                onRename={onRename}
                onMarkAsRead={onMarkAsRead}
                onArchive={onArchive}
                archiveLabel={archiveLabel}
                archiveStatus={archiveStatus}
                archivePendingLabel={archivePendingLabel}
                archiveShortcutKeys={archiveShortcutKeys}
              />
            ) : null}
          </SidebarWorkspaceTrailingActionOverlay>
        </SidebarWorkspaceTrailingActionSlot>
      ) : null}
    </>
  );
}

function WorkspacePinnedTrailingActions({
  workspace,
  isHovered,
  isTouchPlatform,
  isCreating,
  onArchive,
  onRevealInFinder,
  onRename,
  onMarkAsRead,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
}: {
  workspace: SidebarWorkspaceEntry;
  isHovered: boolean;
  isTouchPlatform: boolean;
  isCreating: boolean;
  onArchive: () => void;
  onRevealInFinder?: () => void;
  onRename?: () => void;
  onMarkAsRead?: () => void;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  archiveShortcutKeys?: ShortcutKey[][] | null;
}) {
  const { t } = useTranslation();
  const togglePinTarget = useSidebarPinsStore((state) => state.togglePin);
  const handleUnpin = useCallback(() => {
    togglePinTarget(workspace.serverId, {
      kind: "workspace",
      workspaceId: workspace.workspaceId,
    });
  }, [togglePinTarget, workspace.serverId, workspace.workspaceId]);
  const quickActionsVisible = isHovered || isTouchPlatform;
  return (
    <>
      {isCreating ? (
        <Text style={styles.workspaceCreatingText}>{t("sidebar.workspace.status.creating")}</Text>
      ) : null}
      <View style={styles.pinnedTrailingActions}>
        <Pressable
          style={workspacePinButtonStyle}
          onPress={handleUnpin}
          hitSlop={4}
          accessibilityRole={platformIsWeb ? undefined : "button"}
          accessibilityLabel={t("sidebar.workspace.actions.unpin")}
          testID={`sidebar-workspace-unpin-${workspace.workspaceKey}`}
        >
          {renderPinIndicatorIcon}
        </Pressable>
        {quickActionsVisible ? (
          <Pressable
            style={workspacePinButtonStyle}
            onPress={onArchive}
            hitSlop={4}
            accessibilityRole={platformIsWeb ? undefined : "button"}
            accessibilityLabel={archiveLabel ?? t("sidebar.workspace.actions.archive")}
            testID={`sidebar-workspace-remove-${workspace.workspaceKey}`}
          >
            {renderRemoveIcon}
          </Pressable>
        ) : null}
        {quickActionsVisible ? (
          <WorkspaceKebabMenu
            workspaceKey={workspace.workspaceKey}
            serverId={workspace.serverId}
            workspaceId={workspace.workspaceId}
            onRevealInFinder={onRevealInFinder}
            onRename={onRename}
            onMarkAsRead={onMarkAsRead}
            onArchive={onArchive}
            archiveLabel={archiveLabel}
            archiveStatus={archiveStatus}
            archivePendingLabel={archivePendingLabel}
            archiveShortcutKeys={archiveShortcutKeys}
          />
        ) : null}
      </View>
    </>
  );
}

function WorkspaceKebabMenu({
  workspaceKey,
  serverId,
  workspaceId,
  onRevealInFinder,
  onRename,
  onMarkAsRead,
  onArchive,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
}: {
  workspaceKey: string;
  serverId: string;
  workspaceId: string;
  onRevealInFinder?: () => void;
  onRename?: () => void;
  onMarkAsRead?: () => void;
  onArchive: () => void;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  archiveShortcutKeys?: ShortcutKey[][] | null;
}) {
  const { t } = useTranslation();
  // Pinning a single workspace breaks it out as a standalone row in the sidebar's
  // "置顶" section (with project/branch context on hover).
  const isPinned = useSidebarPinsStore((state) =>
    state.isPinned(serverId, { kind: "workspace", workspaceId }),
  );
  const togglePin = useSidebarPinsStore((state) => state.togglePin);
  const handleTogglePin = useCallback(() => {
    togglePin(serverId, { kind: "workspace", workspaceId });
  }, [togglePin, serverId, workspaceId]);
  const archiveTrailing = useMemo(
    () => (archiveShortcutKeys ? <Shortcut chord={archiveShortcutKeys} /> : null),
    [archiveShortcutKeys],
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        hitSlop={8}
        style={workspaceKebabStyle}
        accessibilityRole={platformIsWeb ? undefined : "button"}
        accessibilityLabel={t("sidebar.workspace.actions.menu")}
        testID={`sidebar-workspace-kebab-${workspaceKey}`}
      >
        {renderKebabTriggerIcon}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={260}>
        {onMarkAsRead ? (
          <DropdownMenuItem
            testID={`sidebar-workspace-menu-mark-as-read-${workspaceKey}`}
            leading={markAsReadLeadingIcon}
            onSelect={onMarkAsRead}
          >
            Mark as read
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          testID={`sidebar-workspace-menu-pin-${workspaceKey}`}
          leading={isPinned ? pinnedLeadingIcon : pinLeadingIcon}
          onSelect={handleTogglePin}
        >
          {isPinned ? t("sidebar.workspace.actions.unpin") : t("sidebar.workspace.actions.pin")}
        </DropdownMenuItem>
        {onRevealInFinder ? (
          <DropdownMenuItem
            testID={`sidebar-workspace-menu-reveal-${workspaceKey}`}
            leading={revealLeadingIcon}
            onSelect={onRevealInFinder}
          >
            {t("sidebar.workspace.actions.revealInFinder")}
          </DropdownMenuItem>
        ) : null}
        {onRename ? (
          <DropdownMenuItem
            testID={`sidebar-workspace-menu-rename-${workspaceKey}`}
            leading={renameLeadingIcon}
            onSelect={onRename}
          >
            {t("sidebar.workspace.actions.rename")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          testID={`sidebar-workspace-menu-archive-${workspaceKey}`}
          leading={archiveLeadingIcon}
          trailing={archiveTrailing}
          status={archiveStatus}
          pendingLabel={archivePendingLabel}
          onSelect={onArchive}
        >
          {archiveLabel ?? t("sidebar.workspace.actions.archive")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function workspaceKebabStyle({
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.kebabButton, hovered && styles.kebabButtonHovered];
}

function workspacePinButtonStyle({
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.pinButton, hovered && styles.pinButtonHovered];
}

function getWorkspaceRowStyle({
  isDragging,
  selected,
  isHovered,
}: {
  isDragging: boolean;
  selected: boolean;
  isHovered: boolean;
}) {
  return [
    styles.workspaceRow,
    isDragging && styles.workspaceRowDragging,
    selected && styles.sidebarRowSelected,
    isHovered && styles.workspaceRowHovered,
  ];
}

export const MemoSidebarWorkspaceRow = memo(SidebarWorkspaceRow);

const styles = StyleSheet.create((theme) => ({
  workspaceRowContainer: {
    position: "relative",
  },
  workspaceRow: {
    minHeight: 36,
    marginBottom: theme.spacing[1],
    paddingVertical: theme.spacing[2],
    paddingLeft: theme.spacing[2],
    paddingRight: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "center",
    gap: theme.spacing[1],
    userSelect: "none",
  },
  workspaceRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  workspaceRowDragging: {
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    transform: [{ scale: 1.02 }],
    zIndex: 3,
    ...theme.shadow.md,
  },
  sidebarRowSelected: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  workspaceCreatingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    flexShrink: 0,
  },
  timeAgoContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 20,
    flexShrink: 0,
  },
  timeAgoText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
  },
  kebabButton: {
    padding: 2,
    borderRadius: 4,
    marginLeft: 2,
  },
  kebabButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  pinnedTrailingActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 0,
  },
  pinButton: {
    padding: 2,
    borderRadius: 4,
  },
  pinButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
}));
