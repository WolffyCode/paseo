import { describe, expect, test } from "vitest";
import { partitionPinnedNodes } from "./partition-pinned";
import type { ConversationTreeConversationNode, ConversationTreeProjectNode } from "./types";

/** Create a root row with a workspace identity that can participate in shared sidebar pins. */
function conversation(id: string, workspaceId: string): ConversationTreeConversationNode {
  return {
    kind: "conversation",
    id,
    title: id,
    workspaceId,
    statusDot: "idle",
    subagentCount: 0,
    children: [],
  };
}

/** Create a project row around root conversations for pin-lifting tests. */
function project(
  id: string,
  children: readonly ConversationTreeConversationNode[],
): ConversationTreeProjectNode {
  return {
    kind: "project",
    id,
    title: id,
    workspaceId: null,
    statusDot: null,
    subagentCount: 0,
    children,
  };
}

describe("partitionPinnedNodes", () => {
  test("moves a pinned project with its entire subtree into the pinned group", () => {
    const pinnedProject = project("pinned-project", [conversation("root", "w-root")]);
    const regularProject = project("regular-project", []);

    const result = partitionPinnedNodes({
      nodes: [pinnedProject, regularProject],
      pins: [{ kind: "project", projectKey: "pinned-project" }],
    });

    expect(result.pinned).toEqual([pinnedProject]);
    expect(result.projects).toEqual([regularProject]);
    expect(result.loose).toEqual([]);
  });

  test("lifts pinned conversations from both project and loose sources", () => {
    const liftedProjectRoot = conversation("project-root", "w-project");
    const keptProjectRoot = conversation("kept-root", "w-kept");
    const projectNode = project("project", [liftedProjectRoot, keptProjectRoot]);
    const liftedLoose = conversation("loose-pinned", "w-loose-pinned");
    const keptLoose = conversation("loose-kept", "w-loose-kept");

    const result = partitionPinnedNodes({
      nodes: [projectNode, liftedLoose, keptLoose],
      pins: [
        { kind: "workspace", workspaceId: "w-project" },
        { kind: "workspace", workspaceId: "w-loose-pinned" },
      ],
    });

    expect(result.pinned).toEqual([liftedProjectRoot, liftedLoose]);
    expect(result.projects[0]?.children).toEqual([keptProjectRoot]);
    expect(result.loose).toEqual([keptLoose]);
  });

  test("preserves references for every object untouched by pinning", () => {
    const child = conversation("child", "w-child");
    const projectNode = project("project", [child]);
    const loose = conversation("loose", "w-loose");

    const result = partitionPinnedNodes({ nodes: [projectNode, loose], pins: [] });

    expect(result.projects[0]).toBe(projectNode);
    expect(result.projects[0]?.children[0]).toBe(child);
    expect(result.loose[0]).toBe(loose);
  });
});
