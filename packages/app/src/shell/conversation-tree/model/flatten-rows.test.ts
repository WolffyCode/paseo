import { describe, expect, test } from "vitest";
import { flattenTreeRows } from "./flatten-rows";
import type {
  ConversationTreeConversationNode,
  ConversationTreeProjectNode,
  ConversationTreeSubagentNode,
} from "./types";

/** Create a subagent node whose declared count matches its supplied descendants. */
function subagent(
  id: string,
  children: readonly ConversationTreeSubagentNode[] = [],
): ConversationTreeSubagentNode {
  let subagentCount = 0;
  for (const child of children) {
    subagentCount += 1 + child.subagentCount;
  }
  return {
    kind: "subagent",
    id,
    title: id,
    workspaceId: null,
    statusDot: "idle",
    subagentCount,
    children,
  };
}

/** Create a root conversation with the same descendant-count semantics as build-tree. */
function conversation(
  id: string,
  children: readonly ConversationTreeSubagentNode[] = [],
): ConversationTreeConversationNode {
  let subagentCount = 0;
  for (const child of children) {
    subagentCount += 1 + child.subagentCount;
  }
  return {
    kind: "conversation",
    id,
    title: id,
    workspaceId: `workspace-${id}`,
    statusDot: "idle",
    subagentCount,
    children,
  };
}

/** Create a project node, including the empty-project affordance case. */
function project(
  id: string,
  children: readonly ConversationTreeConversationNode[] = [],
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

describe("flattenTreeRows", () => {
  test("keeps empty projects expandable while leaf agents have no expand affordance", () => {
    const rows = flattenTreeRows([project("empty"), conversation("leaf")], {
      isCollapsed: () => false,
      maxDepth: 8,
    });

    expect(
      rows.map((row) => ({ id: row.node.id, canExpand: row.canExpand, expanded: row.isExpanded })),
    ).toEqual([
      { id: "empty", canExpand: true, expanded: true },
      { id: "leaf", canExpand: false, expanded: false },
    ]);
  });

  test("honors collapse state without losing the parent row", () => {
    const rows = flattenTreeRows([project("project", [conversation("root")])], {
      isCollapsed: (node) => node.id === "project",
      maxDepth: 8,
    });

    expect(rows.map((row) => row.node.id)).toEqual(["project"]);
    expect(rows[0]).toMatchObject({ canExpand: true, isExpanded: false });
  });

  test("caps visible depth and chevrons without changing descendant counts", () => {
    const root = conversation("root", [subagent("child", [subagent("grandchild")])]);
    const rows = flattenTreeRows([project("project", [root])], {
      isCollapsed: () => false,
      maxDepth: 1,
    });

    expect(rows.map((row) => ({ id: row.node.id, depth: row.depth }))).toEqual([
      { id: "project", depth: 0 },
      { id: "root", depth: 1 },
    ]);
    expect(rows[1]).toMatchObject({ canExpand: false, isExpanded: false });
    expect(rows[1]?.node.subagentCount).toBe(2);
  });
});
