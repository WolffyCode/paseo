import type {
  WorkspaceDescriptorPayload,
  WorkspaceProjectDescriptorPayload,
} from "@getpaseo/protocol/messages";
import type { ConversationTreeProject } from "./types";

export interface GroupWorkspacesIntoProjectsInput {
  readonly workspaces: readonly WorkspaceDescriptorPayload[];
  readonly emptyProjects: readonly WorkspaceProjectDescriptorPayload[];
}

interface ProjectNameSource {
  readonly projectId: string;
  readonly projectDisplayName: string;
  readonly projectCustomName?: string | null;
  readonly projectRootPath: string;
}

interface MutableProjectGroup {
  readonly projectKey: string;
  name: string;
  readonly workspaceNamesById: Map<string, string>;
}

/** Group active workspace descriptors with empty project parents using projectId as identity. */
export function groupWorkspacesIntoProjects(
  input: GroupWorkspacesIntoProjectsInput,
): ConversationTreeProject[] {
  const groups = new Map<string, MutableProjectGroup>();
  for (const project of input.emptyProjects) {
    groups.set(project.projectId, {
      projectKey: project.projectId,
      name: resolveProjectName(project),
      workspaceNamesById: new Map(),
    });
  }
  for (const workspace of input.workspaces) {
    const existing = groups.get(workspace.projectId);
    const group =
      existing ??
      ({
        projectKey: workspace.projectId,
        name: resolveProjectName(workspace),
        workspaceNamesById: new Map(),
      } satisfies MutableProjectGroup);
    group.name = resolveProjectName(workspace);
    group.workspaceNamesById.set(workspace.id, workspace.name);
    groups.set(workspace.projectId, group);
  }

  const projects: ConversationTreeProject[] = [];
  for (const group of groups.values()) {
    const workspaces = Array.from(group.workspaceNamesById, ([id, name]) => ({ id, name }));
    workspaces.sort(compareWorkspaces);
    projects.push({
      projectKey: group.projectKey,
      name: group.name,
      workspaceIds: workspaces.map((workspace) => workspace.id),
    });
  }
  projects.sort(compareProjects);
  return projects;
}

/** Resolve the user-facing project name while preserving the physical-directory default. */
function resolveProjectName(source: ProjectNameSource): string {
  const explicitCustomName = source.projectCustomName?.trim() ?? "";
  if (explicitCustomName.length > 0) {
    return explicitCustomName;
  }
  const displayName = source.projectDisplayName.trim();
  const automaticName = automaticProjectName(source.projectId);
  if (displayName.length > 0 && displayName !== automaticName) {
    return displayName;
  }
  const segments = source.projectRootPath.split(/[\\/]/).filter(Boolean);
  const basename = segments[segments.length - 1]?.trim() ?? "";
  return basename.length > 0 ? basename : automaticName;
}

/** Reproduce the daemon's automatic project label so a resolved label is not mistaken for a rename. */
function automaticProjectName(projectId: string): string {
  const githubPrefix = "remote:github.com/";
  if (projectId.startsWith(githubPrefix)) {
    const remoteName = projectId.slice(githubPrefix.length);
    return remoteName.length > 0 ? remoteName : projectId;
  }
  const segments = projectId.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? projectId;
}

/** Sort workspaces naturally by display name and then stable workspace id. */
function compareWorkspaces(
  left: { readonly id: string; readonly name: string },
  right: { readonly id: string; readonly name: string },
): number {
  const nameDelta = left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return nameDelta !== 0 ? nameDelta : left.id.localeCompare(right.id);
}

/** Sort project rows naturally by their resolved user-facing names. */
function compareProjects(left: ConversationTreeProject, right: ConversationTreeProject): number {
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
}
