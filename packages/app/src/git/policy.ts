import type { ReactElement } from "react";

import type { ActionStatus } from "@/components/ui/dropdown-menu";
import { i18n } from "@/i18n/i18next";

export type GitActionId =
  | "commit"
  | "pull"
  | "push"
  | "pull-and-push"
  | "merge-branch"
  | "merge-from-base"
  | "archive-worktree";

export interface GitAction {
  id: GitActionId;
  label: string;
  pendingLabel: string;
  successLabel: string;
  disabled: boolean;
  status: ActionStatus;
  unavailableMessage?: string;
  icon?: ReactElement;
  /** When true, a menu separator should be rendered before this item. */
  startsGroup: boolean;
  handler: () => void;
}

export interface GitActions {
  primary: GitAction | null;
  secondary: GitAction[];
  menu: GitAction[];
}

interface GitActionRuntimeState {
  disabled: boolean;
  status: ActionStatus;
  icon?: ReactElement;
  handler: () => void;
}

export interface BuildGitActionsInput {
  isGit: boolean;
  hasRemote: boolean;
  isPaseoOwnedWorktree: boolean;
  isOnBaseBranch: boolean;
  hasUncommittedChanges: boolean;
  baseRefAvailable: boolean;
  baseRefLabel: string;
  aheadCount: number;
  behindBaseCount: number;
  aheadOfOrigin: number | null;
  behindOfOrigin: number | null;
  shouldPromoteArchive: boolean;
  runtime: Record<GitActionId, GitActionRuntimeState>;
}

const REMOTE_ACTION_IDS: GitActionId[] = ["pull", "push", "pull-and-push"];

export function buildGitActions(input: BuildGitActionsInput): GitActions {
  if (!input.isGit) {
    return { primary: null, secondary: [], menu: [] };
  }

  const allActions = new Map<GitActionId, GitAction>();

  allActions.set("commit", {
    id: "commit",
    label: i18n.t("workspace.git.actions.commit.label"),
    pendingLabel: i18n.t("workspace.git.actions.commit.pending"),
    successLabel: i18n.t("workspace.git.actions.commit.success"),
    disabled: input.runtime.commit.disabled,
    status: input.runtime.commit.status,
    icon: input.runtime.commit.icon,
    startsGroup: false,
    handler: input.runtime.commit.handler,
  });

  allActions.set("pull", {
    id: "pull",
    label: i18n.t("workspace.git.actions.pull.label"),
    pendingLabel: i18n.t("workspace.git.actions.pull.pending"),
    successLabel: i18n.t("workspace.git.actions.pull.success"),
    disabled: input.runtime.pull.disabled,
    status: input.runtime.pull.status,
    unavailableMessage: input.runtime.pull.disabled ? undefined : getPullUnavailableMessage(input),
    icon: input.runtime.pull.icon,
    startsGroup: false,
    handler: input.runtime.pull.handler,
  });

  allActions.set("push", {
    id: "push",
    label: i18n.t("workspace.git.actions.push.label"),
    pendingLabel: i18n.t("workspace.git.actions.push.pending"),
    successLabel: i18n.t("workspace.git.actions.push.success"),
    disabled: input.runtime.push.disabled,
    status: input.runtime.push.status,
    unavailableMessage: input.runtime.push.disabled ? undefined : getPushUnavailableMessage(input),
    icon: input.runtime.push.icon,
    startsGroup: false,
    handler: input.runtime.push.handler,
  });

  allActions.set("pull-and-push", {
    id: "pull-and-push",
    label: i18n.t("workspace.git.actions.pullAndPush.label"),
    pendingLabel: i18n.t("workspace.git.actions.pullAndPush.pending"),
    successLabel: i18n.t("workspace.git.actions.pullAndPush.success"),
    disabled: input.runtime["pull-and-push"].disabled,
    status: input.runtime["pull-and-push"].status,
    unavailableMessage: input.runtime["pull-and-push"].disabled
      ? undefined
      : getPullAndPushUnavailableMessage(input),
    icon: input.runtime["pull-and-push"].icon,
    startsGroup: false,
    handler: input.runtime["pull-and-push"].handler,
  });

  allActions.set("merge-branch", {
    id: "merge-branch",
    label: i18n.t("workspace.git.actions.mergeBranch.label"),
    pendingLabel: i18n.t("workspace.git.actions.mergeBranch.pending"),
    successLabel: i18n.t("workspace.git.actions.mergeBranch.success"),
    disabled: input.runtime["merge-branch"].disabled,
    status: input.runtime["merge-branch"].status,
    unavailableMessage: input.runtime["merge-branch"].disabled
      ? undefined
      : getMergeBranchUnavailableMessage(input),
    icon: input.runtime["merge-branch"].icon,
    startsGroup: false,
    handler: input.runtime["merge-branch"].handler,
  });

  allActions.set("merge-from-base", {
    id: "merge-from-base",
    label: i18n.t("workspace.git.actions.mergeFromBase.label", { baseRef: input.baseRefLabel }),
    pendingLabel: i18n.t("workspace.git.actions.mergeFromBase.pending"),
    successLabel: i18n.t("workspace.git.actions.mergeFromBase.success"),
    disabled: input.runtime["merge-from-base"].disabled,
    status: input.runtime["merge-from-base"].status,
    unavailableMessage: input.runtime["merge-from-base"].disabled
      ? undefined
      : getMergeFromBaseUnavailableMessage(input),
    icon: input.runtime["merge-from-base"].icon,
    startsGroup: true,
    handler: input.runtime["merge-from-base"].handler,
  });

  allActions.set("archive-worktree", {
    id: "archive-worktree",
    label: i18n.t("workspace.git.actions.archive.label"),
    pendingLabel: i18n.t("workspace.git.actions.archive.pending"),
    successLabel: i18n.t("workspace.git.actions.archive.success"),
    disabled: input.runtime["archive-worktree"].disabled,
    status: input.runtime["archive-worktree"].status,
    unavailableMessage:
      input.runtime["archive-worktree"].disabled || input.isPaseoOwnedWorktree
        ? undefined
        : i18n.t("workspace.git.actions.unavailable.archiveNotWorktree"),
    icon: input.runtime["archive-worktree"].icon,
    startsGroup: true,
    handler: input.runtime["archive-worktree"].handler,
  });

  const primaryActionId = getPrimaryActionId(input);
  const primary = primaryActionId ? (allActions.get(primaryActionId) ?? null) : null;

  const secondaryIds = [...REMOTE_ACTION_IDS];
  if (!input.isOnBaseBranch) {
    secondaryIds.push(...getFeatureActionIds(input));
  }
  if (input.isPaseoOwnedWorktree) {
    secondaryIds.push("archive-worktree");
  }

  return {
    primary,
    secondary: secondaryIds.map((id) => allActions.get(id)!),
    menu: [],
  };
}

function getPrimaryActionId(input: BuildGitActionsInput): GitActionId | null {
  if (input.shouldPromoteArchive && input.isPaseoOwnedWorktree) {
    return "archive-worktree";
  }
  if (input.hasUncommittedChanges) {
    return "commit";
  }
  if (canPull(input)) {
    return "pull";
  }
  if (canPush(input)) {
    return "push";
  }
  if (!input.isOnBaseBranch && input.aheadCount > 0) {
    return "merge-branch";
  }
  if (!input.isOnBaseBranch && canMergeFromBase(input)) {
    return "merge-from-base";
  }
  return null;
}

function getFeatureActionIds(_input: BuildGitActionsInput): GitActionId[] {
  return ["merge-from-base", "merge-branch"];
}

function canPull(input: BuildGitActionsInput): boolean {
  return input.hasRemote && !input.hasUncommittedChanges && (input.behindOfOrigin ?? 0) > 0;
}

function canPush(input: BuildGitActionsInput): boolean {
  return input.hasRemote && hasPushableCommits(input) && (input.behindOfOrigin ?? 0) === 0;
}

function hasPushableCommits(input: BuildGitActionsInput): boolean {
  if ((input.aheadOfOrigin ?? 0) > 0) {
    return true;
  }
  // No-upstream Paseo worktrees are first-pushable: the daemon push sets upstream with `git push -u`.
  // Do not fold this into aheadOfOrigin; null also covers deleted/pruned upstream branches.
  return input.isPaseoOwnedWorktree && input.aheadOfOrigin === null && input.aheadCount > 0;
}

function canMergeFromBase(input: BuildGitActionsInput): boolean {
  return (
    !input.isOnBaseBranch &&
    input.baseRefAvailable &&
    !input.hasUncommittedChanges &&
    input.behindBaseCount > 0
  );
}

function getPullUnavailableMessage(input: BuildGitActionsInput): string | undefined {
  if (!input.hasRemote) {
    return i18n.t("workspace.git.actions.unavailable.pullNoRemote");
  }
  if (input.hasUncommittedChanges) {
    return i18n.t("workspace.git.actions.unavailable.pullDirty");
  }
  if (input.behindOfOrigin === null) {
    return "Pull isn't available here because this branch is not connected to a remote yet";
  }
  if (input.behindOfOrigin === 0) {
    return i18n.t("workspace.git.actions.unavailable.pullUpToDate");
  }
  return undefined;
}

function getPushUnavailableMessage(input: BuildGitActionsInput): string | undefined {
  if (!input.hasRemote) {
    return i18n.t("workspace.git.actions.unavailable.pushNoRemote");
  }
  if ((input.behindOfOrigin ?? 0) > 0) {
    return i18n.t("workspace.git.actions.unavailable.pushBehind");
  }
  if (!hasPushableCommits(input)) {
    return i18n.t("workspace.git.actions.unavailable.pushNothing");
  }
  return undefined;
}

function getPullAndPushUnavailableMessage(input: BuildGitActionsInput): string | undefined {
  if (!input.hasRemote) {
    return i18n.t("workspace.git.actions.unavailable.pullAndPushNoRemote");
  }
  if (input.hasUncommittedChanges) {
    return i18n.t("workspace.git.actions.unavailable.pullAndPushDirty");
  }
  if (input.behindOfOrigin === null) {
    return "Pull and push isn't available because there are no incoming changes to pull first";
  }
  if (input.behindOfOrigin === 0 && input.aheadOfOrigin === 0) {
    return i18n.t("workspace.git.actions.unavailable.pullAndPushInSync");
  }
  if (input.behindOfOrigin === 0) {
    return "Pull and push isn't available because there are no incoming changes to pull first";
  }
  if ((input.aheadOfOrigin ?? 0) === 0) {
    return "Pull and push isn't available because there is nothing new to send after pulling";
  }
  return undefined;
}

function getMergeBranchUnavailableMessage(input: BuildGitActionsInput): string | undefined {
  if (!input.baseRefAvailable) {
    return i18n.t("workspace.git.actions.unavailable.mergeNoBase");
  }
  if (input.hasUncommittedChanges) {
    return i18n.t("workspace.git.actions.unavailable.mergeDirty");
  }
  if (input.aheadCount === 0) {
    return i18n.t("workspace.git.actions.unavailable.mergeNothing");
  }
  return undefined;
}

function getMergeFromBaseUnavailableMessage(input: BuildGitActionsInput): string | undefined {
  if (!input.baseRefAvailable) {
    return i18n.t("workspace.git.actions.unavailable.updateNoBase");
  }
  if (input.hasUncommittedChanges) {
    return i18n.t("workspace.git.actions.unavailable.updateDirty");
  }
  if (input.behindBaseCount === 0) {
    return i18n.t("workspace.git.actions.unavailable.updateCurrent", {
      baseRef: input.baseRefLabel,
    });
  }
  return undefined;
}
