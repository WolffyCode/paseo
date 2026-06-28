import { generateDraftId } from "@/stores/draft-keys";
import {
  buildWorkspaceTabPersistenceKey,
  type WorkspaceTabTarget,
} from "@/stores/workspace-tabs-store";
import { buildHostWorkspaceRoute } from "@/utils/host-routes";
import type { TabSurface } from "@/workspace-tabs/tab-surface";

export interface PrepareWorkspaceTabInput {
  serverId: string;
  workspaceId: string;
  target: WorkspaceTabTarget;
  // Overrides the tab's default surface (see `tabSurfaceForKind`). Subagents pass
  // "right" so they open in the tool panel instead of the single main pane.
  surface?: TabSurface;
  pin?: boolean;
}

export interface NavigateToPreparedWorkspaceTabInput extends PrepareWorkspaceTabInput {
  currentPathname?: string | null;
}

export interface PrepareWorkspaceTabDeps {
  openTabFocused: (
    workspaceKey: string,
    target: WorkspaceTabTarget,
    surface?: TabSurface,
  ) => string | null;
  pinAgent: (workspaceKey: string, agentId: string) => void;
}

export interface NavigateToPreparedWorkspaceTabDeps extends PrepareWorkspaceTabDeps {
  navigateToWorkspace: (
    serverId: string,
    workspaceId: string,
    options: { currentPathname?: string | null },
  ) => void;
}

function getPreparedTarget(target: WorkspaceTabTarget): WorkspaceTabTarget {
  if (target.kind !== "draft" || target.draftId.trim() !== "new") {
    return target;
  }
  return { kind: "draft", draftId: generateDraftId() };
}

export function prepareWorkspaceTab(
  input: PrepareWorkspaceTabInput,
  deps: PrepareWorkspaceTabDeps,
): string {
  const target = getPreparedTarget(input.target);
  const key =
    buildWorkspaceTabPersistenceKey({
      serverId: input.serverId,
      workspaceId: input.workspaceId,
    }) ?? "";

  deps.openTabFocused(key, target, input.surface);

  if (input.pin && target.kind === "agent") {
    deps.pinAgent(key, target.agentId);
  }

  return buildHostWorkspaceRoute(input.serverId, input.workspaceId);
}

export function navigateToPreparedWorkspaceTab(
  input: NavigateToPreparedWorkspaceTabInput,
  deps: NavigateToPreparedWorkspaceTabDeps,
): string {
  const route = prepareWorkspaceTab(input, deps);
  deps.navigateToWorkspace(input.serverId, input.workspaceId, {
    currentPathname: input.currentPathname,
  });
  return route;
}
