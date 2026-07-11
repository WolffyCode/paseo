import type {
  WorkspaceDescriptorPayload,
  WorkspaceProjectDescriptorPayload,
} from "@getpaseo/protocol/messages";
import { describe, expect, test } from "vitest";
import { groupWorkspacesIntoProjects } from "./group-projects";

/** Build a complete protocol workspace descriptor for grouping tests. */
function workspace(input: {
  id: string;
  projectId: string;
  projectDisplayName: string;
  projectRootPath: string;
  name: string;
}): WorkspaceDescriptorPayload {
  return {
    id: input.id,
    projectId: input.projectId,
    projectDisplayName: input.projectDisplayName,
    projectRootPath: input.projectRootPath,
    workspaceDirectory: input.projectRootPath,
    projectKind: "git",
    workspaceKind: "worktree",
    name: input.name,
    archivingAt: null,
    status: "done",
    statusEnteredAt: null,
    activityAt: null,
    scripts: [],
  };
}

/** Build the protocol shape for a project that currently has no active workspace. */
function emptyProject(input: {
  projectId: string;
  projectDisplayName: string;
  projectRootPath: string;
}): WorkspaceProjectDescriptorPayload {
  return {
    projectId: input.projectId,
    projectDisplayName: input.projectDisplayName,
    projectRootPath: input.projectRootPath,
    projectKind: "git",
  };
}

describe("groupWorkspacesIntoProjects", () => {
  test("groups workspaces by project and sorts each project's ids by display name", () => {
    const projects = groupWorkspacesIntoProjects({
      workspaces: [
        workspace({
          id: "w10",
          projectId: "/repo/alpha",
          projectDisplayName: "alpha",
          projectRootPath: "/repo/alpha",
          name: "worktree 10",
        }),
        workspace({
          id: "w2",
          projectId: "/repo/alpha",
          projectDisplayName: "alpha",
          projectRootPath: "/repo/alpha",
          name: "worktree 2",
        }),
      ],
      emptyProjects: [],
    });

    expect(projects).toEqual([
      { projectKey: "/repo/alpha", name: "alpha", workspaceIds: ["w2", "w10"] },
    ]);
  });

  test("merges empty projects and lets custom project names drive project ordering", () => {
    const projects = groupWorkspacesIntoProjects({
      workspaces: [
        workspace({
          id: "workspace-z",
          projectId: "/repo/zeta",
          projectDisplayName: "A custom name",
          projectRootPath: "/repo/zeta",
          name: "main",
        }),
      ],
      emptyProjects: [
        emptyProject({
          projectId: "/repo/alpha",
          projectDisplayName: "alpha",
          projectRootPath: "/repo/alpha",
        }),
      ],
    });

    expect(projects).toEqual([
      { projectKey: "/repo/zeta", name: "A custom name", workspaceIds: ["workspace-z"] },
      { projectKey: "/repo/alpha", name: "alpha", workspaceIds: [] },
    ]);
  });

  test("uses the physical directory basename when a remote display name is only the auto slug", () => {
    const projects = groupWorkspacesIntoProjects({
      workspaces: [
        workspace({
          id: "workspace",
          projectId: "remote:github.com/Org/repo",
          projectDisplayName: "Org/repo",
          projectRootPath: "/checkouts/local-repo",
          name: "main",
        }),
      ],
      emptyProjects: [],
    });

    expect(projects[0]?.name).toBe("local-repo");
  });
});
