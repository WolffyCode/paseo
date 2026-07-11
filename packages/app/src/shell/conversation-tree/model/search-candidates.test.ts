import { describe, expect, test } from "vitest";
import { findConversationSearchCandidates } from "./search-candidates";
import type {
  ConversationTreeConversationNode,
  ConversationTreeNode,
  ConversationTreeProjectNode,
  ConversationTreeSubagentNode,
} from "./types";

/** Build a subagent node with optional nested children for recursive-match fixtures. */
function subagent(
  id: string,
  title: string,
  children: readonly ConversationTreeSubagentNode[] = [],
): ConversationTreeSubagentNode {
  return {
    kind: "subagent",
    id,
    title,
    workspaceId: null,
    statusDot: "idle",
    subagentCount: children.length,
    children,
  };
}

/** Build a root conversation node with optional subagent children. */
function conversation(
  id: string,
  title: string,
  children: readonly ConversationTreeSubagentNode[] = [],
): ConversationTreeConversationNode {
  return {
    kind: "conversation",
    id,
    title,
    workspaceId: `workspace-${id}`,
    statusDot: "idle",
    subagentCount: children.length,
    children,
  };
}

/** Build a project node wrapping root conversations. */
function project(
  id: string,
  title: string,
  children: readonly ConversationTreeConversationNode[],
): ConversationTreeProjectNode {
  return {
    kind: "project",
    id,
    title,
    workspaceId: null,
    statusDot: null,
    subagentCount: 0,
    children,
  };
}

describe("findConversationSearchCandidates", () => {
  test("matches by case-insensitive substring across root conversations and nested subagents", () => {
    const tree: ConversationTreeNode[] = [
      project("p1", "Project One", [
        conversation("root-a", "Fix the Login Bug", [subagent("sub-a", "Write regression test")]),
        conversation("root-b", "Refactor CSS", []),
      ]),
      conversation("loose", "Loose LOGIN cleanup", []),
    ];

    const results = findConversationSearchCandidates({ nodes: tree, query: "login" });

    expect(results.map((candidate) => candidate.node.id)).toEqual(["root-a", "loose"]);
  });

  test("attaches the owning project name to conversations nested under a project, null for loose ones", () => {
    const tree: ConversationTreeNode[] = [
      project("p1", "Project One", [conversation("root-a", "Alpha", [])]),
      conversation("loose", "Loose Beta", []),
    ];

    const results = findConversationSearchCandidates({ nodes: tree, query: "" });

    expect(results.find((candidate) => candidate.node.id === "root-a")?.projectName).toBe(
      "Project One",
    );
    expect(results.find((candidate) => candidate.node.id === "loose")?.projectName).toBeNull();
  });

  test("returns every conversation and subagent, never a project row, for an empty query", () => {
    const tree: ConversationTreeNode[] = [
      project("p1", "Project One", [
        conversation("root-a", "Alpha", [subagent("sub-a", "Alpha child")]),
      ]),
    ];

    const results = findConversationSearchCandidates({ nodes: tree, query: "   " });

    expect(results.map((candidate) => `${candidate.node.kind}:${candidate.node.id}`)).toEqual([
      "conversation:root-a",
      "subagent:sub-a",
    ]);
  });

  test("returns nothing when the query matches no title anywhere in the tree", () => {
    const tree: ConversationTreeNode[] = [
      project("p1", "Project One", [conversation("root-a", "Alpha", [])]),
    ];

    const results = findConversationSearchCandidates({ nodes: tree, query: "zzz-no-match" });

    expect(results).toEqual([]);
  });
});
