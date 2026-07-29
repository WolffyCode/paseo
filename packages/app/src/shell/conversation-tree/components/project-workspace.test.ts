import { describe, expect, test } from "vitest";
import type { WorkspaceDetail } from "../model/types";
import { resolveProjectWorkspace } from "./project-workspace";

function detail(
  projectId: string,
  workspaceKind: WorkspaceDetail["workspaceKind"],
  directory: string,
): WorkspaceDetail {
  return {
    projectId,
    workspaceKind,
    title: null,
    directory,
    branch: null,
    lastChangeAt: null,
    diffStat: null,
  };
}

describe("resolveProjectWorkspace", () => {
  test("prefers the project main directory over its conversation worktrees", () => {
    const result = resolveProjectWorkspace(
      "project",
      new Map([
        ["worktree", detail("project", "worktree", "/repo/.worktrees/feature")],
        ["other", detail("other", "local_checkout", "/other")],
        ["main", detail("project", "local_checkout", "/repo")],
      ]),
    );

    expect(result).toMatchObject({ workspaceId: "main", detail: { directory: "/repo" } });
  });

  test("falls back to a known project workspace and returns null for an unknown project", () => {
    const details = new Map([
      ["worktree", detail("project", "worktree", "/repo/.worktrees/feature")],
    ]);

    expect(resolveProjectWorkspace("project", details)?.workspaceId).toBe("worktree");
    expect(resolveProjectWorkspace("missing", details)).toBeNull();
  });
});
