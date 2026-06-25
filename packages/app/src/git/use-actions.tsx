import { useState, useCallback, useEffect, useMemo, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { type CheckoutGitActionStatus, useCheckoutGitActionsStore } from "@/git/actions-store";
import { type CheckoutStatusPayload, useCheckoutStatusQuery } from "@/git/use-status-query";
import { buildGitActions, type GitAction, type GitActions } from "@/git/policy";
import { useToast } from "@/contexts/toast-context";
import { useSessionStore } from "@/stores/session-store";
import {
  useActiveWorkspaceSelection,
  type ActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { redirectIfArchivingActiveWorkspace } from "@/utils/sidebar-workspace-archive-redirect";
import { type WorktreeArchiveWarningLabels } from "@/git/worktree-archive-warning";
import { useWorkspaceArchive } from "@/workspace/use-workspace-archive";

export type { GitActionId, GitAction, GitActions } from "@/git/policy";

function isActionDisabled(actionsDisabled: boolean, status: CheckoutGitActionStatus): boolean {
  return actionsDisabled || status === "pending";
}

function resolveBranchLabel(input: {
  currentBranch: string | null | undefined;
  notGit: boolean;
  notRepositoryLabel: string;
  unknownLabel: string;
}): string {
  if (input.currentBranch && input.currentBranch !== "HEAD") {
    return input.currentBranch;
  }
  if (input.notGit) {
    return input.notRepositoryLabel;
  }
  return input.unknownLabel;
}

function formatBaseRefLabel(baseRef: string | undefined, fallbackLabel: string): string {
  if (!baseRef) return fallbackLabel;
  const trimmed = baseRef.replace(/^refs\/(heads|remotes)\//, "").trim();
  return trimmed.startsWith("origin/") ? trimmed.slice("origin/".length) : trimmed;
}

interface DeriveGitActionsStateArgs {
  isGit: boolean;
  status: CheckoutStatusPayload | null;
  gitStatus: CheckoutStatusPayload | null;
  hasUncommittedChanges: boolean;
  postShipArchiveSuggested: boolean;
  isStatusLoading: boolean;
  baseRefLabel: string;
}

interface DerivedGitActionsState {
  actionsDisabled: boolean;
  aheadCount: number;
  behindBaseCount: number;
  aheadOfOrigin: number | null;
  behindOfOrigin: number | null;
  hasRemote: boolean;
  isPaseoOwnedWorktree: boolean;
  isOnBaseBranch: boolean;
  shouldPromoteArchive: boolean;
}

interface GitCommitCounts {
  aheadCount: number;
  behindBaseCount: number;
  aheadOfOrigin: number | null;
  behindOfOrigin: number | null;
}

function extractGitCommitCounts(gitStatus: CheckoutStatusPayload | null): GitCommitCounts {
  return {
    aheadCount: gitStatus?.aheadBehind?.ahead ?? 0,
    behindBaseCount: gitStatus?.aheadBehind?.behind ?? 0,
    aheadOfOrigin: gitStatus?.aheadOfOrigin ?? null,
    behindOfOrigin: gitStatus?.behindOfOrigin ?? null,
  };
}

function computeShouldPromoteArchive(input: {
  isPaseoOwnedWorktree: boolean;
  hasUncommittedChanges: boolean;
  postShipArchiveSuggested: boolean;
}): boolean {
  return (
    input.isPaseoOwnedWorktree && !input.hasUncommittedChanges && input.postShipArchiveSuggested
  );
}

function deriveGitActionsState(args: DeriveGitActionsStateArgs): DerivedGitActionsState {
  const {
    isGit,
    status,
    gitStatus,
    hasUncommittedChanges,
    postShipArchiveSuggested,
    isStatusLoading,
    baseRefLabel,
  } = args;
  const actionsDisabled = !isGit || Boolean(status?.error) || isStatusLoading;
  const isPaseoOwnedWorktree = gitStatus?.isPaseoOwnedWorktree ?? false;
  return {
    actionsDisabled,
    ...extractGitCommitCounts(gitStatus),
    hasRemote: gitStatus?.hasRemote ?? false,
    isPaseoOwnedWorktree,
    isOnBaseBranch: gitStatus?.currentBranch === baseRefLabel,
    shouldPromoteArchive: computeShouldPromoteArchive({
      isPaseoOwnedWorktree,
      hasUncommittedChanges,
      postShipArchiveSuggested,
    }),
  };
}

interface UseGitActionsInput {
  serverId: string;
  cwd: string;
  icons: {
    commit: ReactElement;
    pull: ReactElement;
    push: ReactElement;
    pullAndPush: ReactElement;
    merge: ReactElement;
    mergeFromBase: ReactElement;
    archive: ReactElement;
  };
}

interface UseGitActionsResult {
  gitActions: GitActions;
  branchLabel: string;
  isGit: boolean;
}

interface UseWorkspaceScreenArchiveControllerInput {
  serverId: string;
  activeWorkspaceSelection: ActiveWorkspaceSelection | null;
  workspaceDirectory: string | null | undefined;
  branchLabel: string;
  gitStatus: CheckoutStatusPayload | null;
  t: (key: string, options?: Record<string, unknown>) => string;
}

function useWorkspaceScreenArchiveController({
  serverId,
  activeWorkspaceSelection,
  workspaceDirectory,
  branchLabel,
  gitStatus,
  t,
}: UseWorkspaceScreenArchiveControllerInput) {
  const sessionWorkspaces = useSessionStore((state) => state.sessions[serverId]?.workspaces);
  const archiveWorkspaceRecord = useMemo(() => {
    if (!workspaceDirectory) {
      return null;
    }
    for (const candidate of sessionWorkspaces?.values() ?? []) {
      if (candidate.workspaceDirectory === workspaceDirectory) {
        return candidate;
      }
    }
    return null;
  }, [sessionWorkspaces, workspaceDirectory]);

  return useWorkspaceArchive({
    serverId,
    workspaceId: activeWorkspaceSelection?.workspaceId ?? archiveWorkspaceRecord?.id ?? "",
    workspaceDirectory,
    workspaceKind: gitStatus?.isPaseoOwnedWorktree ? "worktree" : "local_checkout",
    name: archiveWorkspaceRecord?.name ?? branchLabel,
    isDirty: gitStatus?.isDirty,
    aheadOfOrigin: gitStatus?.aheadOfOrigin,
    diffStat: archiveWorkspaceRecord?.diffStat ?? null,
    warningLabels: getWorktreeArchiveWarningLabels(t),
    onArchiveStarted: () => {
      if (!activeWorkspaceSelection) {
        return;
      }
      redirectIfArchivingActiveWorkspace({
        serverId,
        workspaceId: activeWorkspaceSelection.workspaceId,
        activeWorkspaceSelection,
      });
    },
  });
}

export function useGitActions({ serverId, cwd, icons }: UseGitActionsInput): UseGitActionsResult {
  const { t } = useTranslation();
  const toast = useToast();
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const [postShipArchiveSuggested, setPostShipArchiveSuggested] = useState(false);

  const { status, isLoading: isStatusLoading } = useCheckoutStatusQuery({ serverId, cwd });
  const gitStatus = status && status.isGit ? status : null;
  const isGit = Boolean(gitStatus);
  const notGit = status !== null && !status.isGit && !status.error;
  const baseRef = gitStatus?.baseRef ?? undefined;

  const hasUncommittedChanges = Boolean(gitStatus?.isDirty);

  const baseRefLabel = useMemo(
    () => formatBaseRefLabel(baseRef, t("workspace.git.diff.base")),
    [baseRef, t],
  );
  const branchLabel = resolveBranchLabel({
    currentBranch: gitStatus?.currentBranch,
    notGit,
    notRepositoryLabel: t("workspace.git.diff.notRepository"),
    unknownLabel: t("workspace.git.diff.branchUnknown"),
  });

  useEffect(() => {
    setPostShipArchiveSuggested(false);
  }, [cwd]);

  const commitStatus = useCheckoutGitActionsStore((s) =>
    s.getStatus({ serverId, cwd, actionId: "commit" }),
  );
  const pullStatus = useCheckoutGitActionsStore((s) =>
    s.getStatus({ serverId, cwd, actionId: "pull" }),
  );
  const pushStatus = useCheckoutGitActionsStore((s) =>
    s.getStatus({ serverId, cwd, actionId: "push" }),
  );
  const pullAndPushStatus = useCheckoutGitActionsStore((s) =>
    s.getStatus({ serverId, cwd, actionId: "pull-and-push" }),
  );
  const mergeStatus = useCheckoutGitActionsStore((s) =>
    s.getStatus({ serverId, cwd, actionId: "merge-branch" }),
  );
  const mergeFromBaseStatus = useCheckoutGitActionsStore((s) =>
    s.getStatus({ serverId, cwd, actionId: "merge-from-base" }),
  );
  const archiveStatus = useCheckoutGitActionsStore((s) =>
    s.getStatus({ serverId, cwd, actionId: "archive-worktree" }),
  );

  const runCommit = useCheckoutGitActionsStore((s) => s.commit);
  const runPull = useCheckoutGitActionsStore((s) => s.pull);
  const runPush = useCheckoutGitActionsStore((s) => s.push);
  const runPullAndPush = useCheckoutGitActionsStore((s) => s.pullAndPush);
  const runMergeBranch = useCheckoutGitActionsStore((s) => s.mergeBranch);
  const runMergeFromBase = useCheckoutGitActionsStore((s) => s.mergeFromBase);

  const toastActionError = useCallback(
    (error: unknown, fallback: string) => {
      const message = error instanceof Error ? error.message : fallback;
      toast.error(message);
    },
    [toast],
  );

  const toastActionSuccess = useCallback(
    (message: string) => {
      toast.show(message, { variant: "success" });
    },
    [toast],
  );

  // Handlers
  const handleCommit = useCallback(() => {
    void runCommit({ serverId, cwd })
      .then(() => {
        toastActionSuccess(t("workspace.git.actions.commit.success"));
        return;
      })
      .catch((err) => {
        toastActionError(err, t("workspace.git.actions.toasts.failedCommit"));
      });
  }, [cwd, runCommit, serverId, t, toastActionError, toastActionSuccess]);

  const handlePull = useCallback(() => {
    void runPull({ serverId, cwd })
      .then(() => {
        toastActionSuccess(t("workspace.git.actions.pull.success"));
        return;
      })
      .catch((err) => {
        toastActionError(err, t("workspace.git.actions.toasts.failedPull"));
      });
  }, [cwd, runPull, serverId, t, toastActionError, toastActionSuccess]);

  const handlePush = useCallback(() => {
    void runPush({ serverId, cwd })
      .then(() => {
        toastActionSuccess(t("workspace.git.actions.push.success"));
        return;
      })
      .catch((err) => {
        toastActionError(err, t("workspace.git.actions.toasts.failedPush"));
      });
  }, [cwd, runPush, serverId, t, toastActionError, toastActionSuccess]);

  const handlePullAndPush = useCallback(() => {
    void runPullAndPush({ serverId, cwd })
      .then(() => {
        toastActionSuccess(t("workspace.git.actions.pullAndPush.success"));
        return;
      })
      .catch((err) => {
        toastActionError(err, t("workspace.git.actions.toasts.failedPullAndPush"));
      });
  }, [cwd, runPullAndPush, serverId, t, toastActionError, toastActionSuccess]);

  const handleMergeBranch = useCallback(() => {
    if (!baseRef) {
      toast.error(t("workspace.git.actions.toasts.baseRefUnavailable"));
      return;
    }
    void runMergeBranch({ serverId, cwd, baseRef })
      .then(() => {
        setPostShipArchiveSuggested(true);
        toastActionSuccess(t("workspace.git.actions.mergeBranch.success"));
        return;
      })
      .catch((err) => {
        toastActionError(err, t("workspace.git.actions.toasts.failedMerge"));
      });
  }, [baseRef, cwd, runMergeBranch, serverId, t, toast, toastActionError, toastActionSuccess]);

  const handleMergeFromBase = useCallback(() => {
    if (!baseRef) {
      toast.error(t("workspace.git.actions.toasts.baseRefUnavailable"));
      return;
    }
    void runMergeFromBase({ serverId, cwd, baseRef })
      .then(() => {
        toastActionSuccess(t("workspace.git.actions.mergeFromBase.success"));
        return;
      })
      .catch((err) => {
        toastActionError(err, t("workspace.git.actions.toasts.failedMergeFromBase"));
      });
  }, [baseRef, cwd, runMergeFromBase, serverId, t, toast, toastActionError, toastActionSuccess]);

  const archiveController = useWorkspaceScreenArchiveController({
    serverId,
    activeWorkspaceSelection,
    workspaceDirectory: status?.cwd,
    branchLabel,
    gitStatus,
    t,
  });

  const handleArchiveWorktree = useCallback(() => {
    archiveController.archive();
  }, [archiveController]);

  const derived = deriveGitActionsState({
    isGit,
    status,
    gitStatus,
    hasUncommittedChanges,
    postShipArchiveSuggested,
    isStatusLoading,
    baseRefLabel,
  });
  const {
    actionsDisabled,
    aheadCount,
    behindBaseCount,
    aheadOfOrigin,
    behindOfOrigin,
    hasRemote,
    isPaseoOwnedWorktree,
    isOnBaseBranch,
    shouldPromoteArchive,
  } = derived;

  // Build actions
  const gitActions: GitActions = useMemo(() => {
    const actions = buildGitActions({
      isGit,
      hasRemote,
      isPaseoOwnedWorktree,
      isOnBaseBranch,
      hasUncommittedChanges,
      baseRefAvailable: Boolean(baseRef),
      baseRefLabel,
      aheadCount,
      behindBaseCount,
      aheadOfOrigin,
      behindOfOrigin,
      shouldPromoteArchive,
      runtime: {
        commit: {
          disabled: isActionDisabled(actionsDisabled, commitStatus),
          status: commitStatus,
          icon: icons.commit,
          handler: handleCommit,
        },
        pull: {
          disabled: isActionDisabled(actionsDisabled, pullStatus),
          status: pullStatus,
          icon: icons.pull,
          handler: handlePull,
        },
        push: {
          disabled: isActionDisabled(actionsDisabled, pushStatus),
          status: pushStatus,
          icon: icons.push,
          handler: handlePush,
        },
        "pull-and-push": {
          disabled: isActionDisabled(actionsDisabled, pullAndPushStatus),
          status: pullAndPushStatus,
          icon: icons.pullAndPush,
          handler: handlePullAndPush,
        },
        "merge-branch": {
          disabled: isActionDisabled(actionsDisabled, mergeStatus),
          status: mergeStatus,
          icon: icons.merge,
          handler: handleMergeBranch,
        },
        "merge-from-base": {
          disabled: isActionDisabled(actionsDisabled, mergeFromBaseStatus),
          status: mergeFromBaseStatus,
          icon: icons.mergeFromBase,
          handler: handleMergeFromBase,
        },
        "archive-worktree": {
          disabled: isActionDisabled(actionsDisabled, archiveStatus),
          status: archiveStatus,
          icon: icons.archive,
          handler: handleArchiveWorktree,
        },
      },
    });
    return translateGitActions(actions, { baseRefLabel, t });
  }, [
    t,
    isGit,
    hasRemote,
    aheadCount,
    behindBaseCount,
    isPaseoOwnedWorktree,
    isOnBaseBranch,
    hasUncommittedChanges,
    aheadOfOrigin,
    behindOfOrigin,
    baseRefLabel,
    shouldPromoteArchive,
    actionsDisabled,
    commitStatus,
    pullStatus,
    pushStatus,
    pullAndPushStatus,
    mergeStatus,
    mergeFromBaseStatus,
    archiveStatus,
    handleCommit,
    handlePull,
    handlePush,
    handlePullAndPush,
    handleMergeBranch,
    handleMergeFromBase,
    handleArchiveWorktree,
    icons,
    baseRef,
  ]);

  return { gitActions, branchLabel, isGit };
}

function translateGitActions(
  actions: GitActions,
  input: {
    baseRefLabel: string;
    t: (key: string, options?: Record<string, unknown>) => string;
  },
): GitActions {
  return {
    primary: actions.primary ? translateGitAction(actions.primary, input) : null,
    secondary: actions.secondary.map((action) => translateGitAction(action, input)),
    menu: actions.menu.map((action) => translateGitAction(action, input)),
  };
}

function translateGitAction(
  action: GitAction,
  {
    baseRefLabel,
    t,
  }: {
    baseRefLabel: string;
    t: (key: string, options?: Record<string, unknown>) => string;
  },
): GitAction {
  const labels = getTranslatedGitActionLabels(action, { baseRefLabel, t });
  return {
    ...action,
    ...labels,
    unavailableMessage: translateGitActionUnavailableMessage(action.unavailableMessage, {
      baseRefLabel,
      t,
    }),
  };
}

function getTranslatedGitActionLabels(
  action: GitAction,
  {
    baseRefLabel,
    t,
  }: {
    baseRefLabel: string;
    t: (key: string, options?: Record<string, unknown>) => string;
  },
): Pick<GitAction, "label" | "pendingLabel" | "successLabel"> {
  switch (action.id) {
    case "commit":
      return {
        label: t("workspace.git.actions.commit.label"),
        pendingLabel: t("workspace.git.actions.commit.pending"),
        successLabel: t("workspace.git.actions.commit.success"),
      };
    case "pull":
      return {
        label: t("workspace.git.actions.pull.label"),
        pendingLabel: t("workspace.git.actions.pull.pending"),
        successLabel: t("workspace.git.actions.pull.success"),
      };
    case "push":
      return {
        label: t("workspace.git.actions.push.label"),
        pendingLabel: t("workspace.git.actions.push.pending"),
        successLabel: t("workspace.git.actions.push.success"),
      };
    case "pull-and-push":
      return {
        label: t("workspace.git.actions.pullAndPush.label"),
        pendingLabel: t("workspace.git.actions.pullAndPush.pending"),
        successLabel: t("workspace.git.actions.pullAndPush.success"),
      };
    case "merge-branch":
      return {
        label: t("workspace.git.actions.mergeBranch.label"),
        pendingLabel: t("workspace.git.actions.mergeBranch.pending"),
        successLabel: t("workspace.git.actions.mergeBranch.success"),
      };
    case "merge-from-base":
      return {
        label: t("workspace.git.actions.mergeFromBase.label", { baseRef: baseRefLabel }),
        pendingLabel: t("workspace.git.actions.mergeFromBase.pending"),
        successLabel: t("workspace.git.actions.mergeFromBase.success"),
      };
    case "archive-worktree":
      return {
        label: t("workspace.git.actions.archive.label"),
        pendingLabel: t("workspace.git.actions.archive.pending"),
        successLabel: t("workspace.git.actions.archive.success"),
      };
  }
}

function translateGitActionUnavailableMessage(
  message: string | undefined,
  {
    baseRefLabel,
    t,
  }: {
    baseRefLabel: string;
    t: (key: string, options?: Record<string, unknown>) => string;
  },
): string | undefined {
  if (!message) return undefined;
  const keyByMessage: Record<string, string> = {
    "Pull isn't available here because this branch is not connected to a remote yet":
      "workspace.git.actions.unavailable.pullNoRemote",
    "Pull isn't available while you have local changes so commit or stash them first":
      "workspace.git.actions.unavailable.pullDirty",
    "Pull isn't available because this branch is already up to date":
      "workspace.git.actions.unavailable.pullUpToDate",
    "Push isn't available here because this branch is not connected to a remote yet":
      "workspace.git.actions.unavailable.pushNoRemote",
    "Push isn't available yet because there are newer changes to bring in first":
      "workspace.git.actions.unavailable.pushBehind",
    "Push isn't available because there is nothing new to send":
      "workspace.git.actions.unavailable.pushNothing",
    "Pull and push isn't available here because this branch is not connected to a remote yet":
      "workspace.git.actions.unavailable.pullAndPushNoRemote",
    "Pull and push isn't available while you have local changes so commit or stash them first":
      "workspace.git.actions.unavailable.pullAndPushDirty",
    "Pull and push isn't available because this branch is already in sync":
      "workspace.git.actions.unavailable.pullAndPushInSync",
    "Merge isn't available because we couldn't determine the base branch":
      "workspace.git.actions.unavailable.mergeNoBase",
    "Merge isn't available while you have local changes so commit or stash them first":
      "workspace.git.actions.unavailable.mergeDirty",
    "Merge isn't available because this branch doesn't have anything new to merge yet":
      "workspace.git.actions.unavailable.mergeNothing",
    "Update isn't available because we couldn't determine the base branch":
      "workspace.git.actions.unavailable.updateNoBase",
    "Update isn't available while you have local changes so commit or stash them first":
      "workspace.git.actions.unavailable.updateDirty",
    "Archive isn't available here because this workspace was not created as a Paseo worktree":
      "workspace.git.actions.unavailable.archiveNotWorktree",
  };
  if (
    message.startsWith("Update isn't available because this branch is already up to date with ")
  ) {
    return t("workspace.git.actions.unavailable.updateCurrent", { baseRef: baseRefLabel });
  }
  const key = keyByMessage[message];
  return key ? t(key) : message;
}

function getWorktreeArchiveWarningLabels(
  t: (key: string, options?: Record<string, unknown>) => string,
): WorktreeArchiveWarningLabels {
  return {
    title: (worktreeName) => t("workspace.git.actions.archiveWarning.title", { worktreeName }),
    confirm: t("workspace.git.actions.archiveWarning.confirm"),
    cancel: t("workspace.git.actions.archiveWarning.cancel"),
    uncommittedChanges: t("workspace.git.actions.archiveWarning.uncommittedChanges"),
    uncommittedChangesWithDiff: (diffStat) =>
      t("workspace.git.actions.archiveWarning.uncommittedChangesWithDiff", { diffStat }),
    addedLine: (count) =>
      t(
        count === 1
          ? "workspace.git.actions.archiveWarning.addedLine"
          : "workspace.git.actions.archiveWarning.addedLines",
        { count },
      ),
    deletedLine: (count) =>
      t(
        count === 1
          ? "workspace.git.actions.archiveWarning.deletedLine"
          : "workspace.git.actions.archiveWarning.deletedLines",
        { count },
      ),
    unpushedCommit: (count) =>
      t(
        count === 1
          ? "workspace.git.actions.archiveWarning.unpushedCommit"
          : "workspace.git.actions.archiveWarning.unpushedCommits",
        { count },
      ),
  };
}
