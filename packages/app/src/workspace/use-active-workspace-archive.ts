import { useMemo, useState } from "react";
import { type CheckoutStatusPayload, useCheckoutStatusQuery } from "@/git/use-status-query";
import { useSessionStore, type WorkspaceDescriptor } from "@/stores/session-store";
import {
  useActiveWorkspaceSelection,
  type ActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { redirectIfArchivingActiveWorkspace } from "@/utils/sidebar-workspace-archive-redirect";
import { resolveWorkspaceMapKeyByIdentity } from "@/utils/workspace-identity";
import {
  useWorkspaceArchive,
  type WorkspaceArchiveController,
} from "@/workspace/use-workspace-archive";

export interface ActiveWorkspaceArchiveInput {
  serverId: string;
  /** The routed workspace's directory, which also finds the workspace when the route cannot. */
  cwd: string;
  /** Names the workspace in the archive warning until its record has loaded. */
  fallbackName: string;
}

export interface ActiveWorkspaceArchiveController extends WorkspaceArchiveController {
  isArchiving: boolean;
  canArchive: boolean;
}

function resolveArchiveWorkspaceDescriptor(input: {
  workspaces: Map<string, WorkspaceDescriptor> | undefined;
  activeWorkspaceSelection: ActiveWorkspaceSelection | null;
  workspaceDirectory: string | null | undefined;
}): WorkspaceDescriptor | null {
  const activeWorkspaceKey = input.activeWorkspaceSelection
    ? resolveWorkspaceMapKeyByIdentity({
        workspaces: input.workspaces,
        workspaceId: input.activeWorkspaceSelection.workspaceId,
      })
    : null;
  if (activeWorkspaceKey) {
    return input.workspaces?.get(activeWorkspaceKey) ?? null;
  }
  if (!input.workspaceDirectory) {
    return null;
  }
  for (const candidate of input.workspaces?.values() ?? []) {
    if (candidate.workspaceDirectory === input.workspaceDirectory) {
      return candidate;
    }
  }
  return null;
}

function resolveWorkspaceArchiveRisk(
  workspace: WorkspaceDescriptor | null,
  gitStatus: CheckoutStatusPayload | null,
): { isDirty: boolean | null | undefined; aheadOfOrigin: number | null | undefined } {
  return {
    isDirty: gitStatus?.isDirty ?? workspace?.gitRuntime?.isDirty,
    aheadOfOrigin: gitStatus?.aheadOfOrigin ?? workspace?.gitRuntime?.aheadOfOrigin,
  };
}

function canArchiveWorkspace(
  workspace: WorkspaceDescriptor | null,
  risk: ReturnType<typeof resolveWorkspaceArchiveRisk>,
): boolean {
  return (
    workspace !== null &&
    (workspace.workspaceKind !== "worktree" ||
      (risk.isDirty !== undefined && risk.aheadOfOrigin !== undefined))
  );
}

/**
 * Archives the routed workspace. The Git actions menu and the conversation header both offer
 * this, and they must agree on which workspace it is and when a worktree is risky to drop.
 */
export function useActiveWorkspaceArchive({
  serverId,
  cwd,
  fallbackName,
}: ActiveWorkspaceArchiveInput): ActiveWorkspaceArchiveController {
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const { status } = useCheckoutStatusQuery({ serverId, cwd });
  const gitStatus = status && status.isGit ? status : null;
  const workspaceDirectory = status?.cwd ?? cwd;
  const sessionWorkspaces = useSessionStore((state) => state.sessions[serverId]?.workspaces);
  const [isHidingWorkspace, setIsHidingWorkspace] = useState(false);
  const workspaceDescriptor = useMemo(
    () =>
      resolveArchiveWorkspaceDescriptor({
        workspaces: sessionWorkspaces,
        activeWorkspaceSelection,
        workspaceDirectory,
      }),
    [activeWorkspaceSelection, sessionWorkspaces, workspaceDirectory],
  );
  const archiveRisk = resolveWorkspaceArchiveRisk(workspaceDescriptor, gitStatus);

  const controller = useWorkspaceArchive({
    serverId,
    workspaceId: workspaceDescriptor?.id ?? "",
    workspaceKind: workspaceDescriptor?.workspaceKind ?? "directory",
    name: workspaceDescriptor?.name ?? fallbackName,
    isDirty: archiveRisk.isDirty,
    aheadOfOrigin: archiveRisk.aheadOfOrigin,
    diffStat: workspaceDescriptor?.diffStat ?? null,
    onSetHiding: setIsHidingWorkspace,
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

  return {
    ...controller,
    isArchiving: workspaceDescriptor?.archivingAt != null || isHidingWorkspace,
    canArchive: canArchiveWorkspace(workspaceDescriptor, archiveRisk),
  };
}
