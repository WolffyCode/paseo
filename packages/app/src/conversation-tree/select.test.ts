import { describe, expect, it } from "vitest";
import {
  buildConversationTree,
  type ConversationTreeAgent,
  type ConversationTreeProject,
  flattenConversationTreeRows,
} from "@/conversation-tree/select";

function agent(id: string, overrides: Partial<ConversationTreeAgent> = {}): ConversationTreeAgent {
  return {
    id,
    title: null,
    status: "idle",
    parentAgentId: null,
    createdAt: new Date(0),
    ...overrides,
  };
}

function project(projectKey: string, workspaceIds: string[]): ConversationTreeProject {
  return { projectKey, projectName: projectKey, workspaceIds };
}

const NO_COLLAPSE = {
  collapsedProjectKeys: new Set<string>(),
  collapsedConversationIds: new Set<string>(),
};

describe("buildConversationTree", () => {
  it("groups root agents under their project by workspaceId", () => {
    const tree = buildConversationTree({
      serverId: "s1",
      agents: [agent("a1", { workspaceId: "w1", title: "Refactor", status: "running" })],
      projects: [project("p1", ["w1"])],
    });

    expect(tree).toHaveLength(1);
    expect(tree[0]?.kind).toBe("project");
    expect(tree[0]?.id).toBe("p1");
    expect(tree[0]?.status).toBeNull();
    expect(tree[0]?.children.map((node) => node.id)).toEqual(["a1"]);
    const conversation = tree[0]?.children[0];
    expect(conversation?.kind).toBe("conversation");
    expect(conversation?.title).toBe("Refactor");
    expect(conversation?.status).toBe("running");
    expect(conversation?.workspaceId).toBe("w1");
  });

  it("keeps an empty project node when it has no live conversations", () => {
    const tree = buildConversationTree({
      serverId: "s1",
      agents: [],
      projects: [project("p1", ["w1"])],
    });

    expect(tree).toHaveLength(1);
    expect(tree[0]?.kind).toBe("project");
    expect(tree[0]?.children).toHaveLength(0);
  });

  it("nests subagents under their parent conversation, filling children recursively past the render depth", () => {
    const tree = buildConversationTree({
      serverId: "s1",
      agents: [
        agent("root", { workspaceId: "w1" }),
        agent("sub", { workspaceId: "w1", parentAgentId: "root" }),
        agent("subsub", { workspaceId: "w1", parentAgentId: "sub" }),
      ],
      projects: [project("p1", ["w1"])],
    });

    const conversation = tree[0]?.children[0];
    expect(conversation?.children.map((node) => node.id)).toEqual(["sub"]);
    expect(conversation?.children[0]?.kind).toBe("subagent");
    // The data layer fills the full recursion even though the renderer caps depth — so
    // un-capping MAX_RENDER_DEPTH later needs zero selector changes.
    expect(conversation?.children[0]?.children.map((node) => node.id)).toEqual(["subsub"]);
  });

  it("aggregates subagentCount as the total descendant count", () => {
    const tree = buildConversationTree({
      serverId: "s1",
      agents: [
        agent("root", { workspaceId: "w1" }),
        agent("sub", { workspaceId: "w1", parentAgentId: "root" }),
        agent("subsub", { workspaceId: "w1", parentAgentId: "sub" }),
      ],
      projects: [project("p1", ["w1"])],
    });

    const conversation = tree[0]?.children[0];
    expect(conversation?.subagentCount).toBe(2); // sub + subsub
    expect(conversation?.children[0]?.subagentCount).toBe(1); // subsub
  });

  it("excludes archived agents from nodes and counts", () => {
    const tree = buildConversationTree({
      serverId: "s1",
      agents: [
        agent("root", { workspaceId: "w1" }),
        agent("sub", { workspaceId: "w1", parentAgentId: "root" }),
        agent("archivedSub", {
          workspaceId: "w1",
          parentAgentId: "root",
          archivedAt: new Date(),
        }),
        agent("archivedRoot", { workspaceId: "w1", archivedAt: new Date() }),
      ],
      projects: [project("p1", ["w1"])],
    });

    expect(tree[0]?.children.map((node) => node.id)).toEqual(["root"]);
    expect(tree[0]?.children[0]?.subagentCount).toBe(1); // only the live sub
  });

  it("places root agents without a known project in a loose conversation section after the projects", () => {
    const tree = buildConversationTree({
      serverId: "s1",
      agents: [agent("loose", { workspaceId: "wX", title: "Explain schema" })],
      projects: [project("p1", ["w1"])],
    });

    expect(tree.map((node) => node.kind)).toEqual(["project", "conversation"]);
    expect(tree[0]?.children).toHaveLength(0);
    expect(tree[1]?.id).toBe("loose");
    expect(tree[1]?.kind).toBe("conversation");
  });

  it("sorts conversations and subagents by createdAt", () => {
    const tree = buildConversationTree({
      serverId: "s1",
      agents: [
        agent("a2", { workspaceId: "w1", createdAt: new Date(200) }),
        agent("a1", { workspaceId: "w1", createdAt: new Date(100) }),
        agent("sub2", { workspaceId: "w1", parentAgentId: "a1", createdAt: new Date(400) }),
        agent("sub1", { workspaceId: "w1", parentAgentId: "a1", createdAt: new Date(300) }),
      ],
      projects: [project("p1", ["w1"])],
    });

    expect(tree[0]?.children.map((node) => node.id)).toEqual(["a1", "a2"]);
    expect(tree[0]?.children[0]?.children.map((node) => node.id)).toEqual(["sub1", "sub2"]);
  });

  it("carries requiresAttention through to conversation nodes", () => {
    const tree = buildConversationTree({
      serverId: "s1",
      agents: [agent("a1", { workspaceId: "w1", requiresAttention: true })],
      projects: [project("p1", ["w1"])],
    });

    expect(tree[0]?.children[0]?.requiresAttention).toBe(true);
  });
});

describe("flattenConversationTreeRows", () => {
  function sampleTree() {
    return buildConversationTree({
      serverId: "s1",
      agents: [
        agent("root", { workspaceId: "w1" }),
        agent("sub", { workspaceId: "w1", parentAgentId: "root" }),
        agent("subsub", { workspaceId: "w1", parentAgentId: "sub" }),
      ],
      projects: [project("p1", ["w1"])],
    });
  }

  it("emits project → conversation → subagent rows with increasing depth and caps at maxDepth", () => {
    const rows = flattenConversationTreeRows(sampleTree(), { ...NO_COLLAPSE, maxDepth: 2 });

    expect(rows.map((row) => [row.node.id, row.depth])).toEqual([
      ["p1", 0],
      ["root", 1],
      ["sub", 2],
    ]);
  });

  it("flags a row that has children below the render cap as non-expandable but still counted", () => {
    const rows = flattenConversationTreeRows(sampleTree(), { ...NO_COLLAPSE, maxDepth: 2 });

    const subRow = rows.find((row) => row.node.id === "sub");
    // sub has subsub child, but depth+1 (3) exceeds maxDepth (2): no chevron, badge shows the count.
    expect(subRow?.canExpand).toBe(false);
    expect(subRow?.node.subagentCount).toBe(1);

    const conversationRow = rows.find((row) => row.node.id === "root");
    expect(conversationRow?.canExpand).toBe(true);
    expect(conversationRow?.isExpanded).toBe(true);
  });

  it("hides a project's children when the project key is collapsed", () => {
    const rows = flattenConversationTreeRows(sampleTree(), {
      collapsedProjectKeys: new Set(["p1"]),
      collapsedConversationIds: new Set(),
      maxDepth: 2,
    });

    expect(rows.map((row) => row.node.id)).toEqual(["p1"]);
    expect(rows[0]?.canExpand).toBe(true);
    expect(rows[0]?.isExpanded).toBe(false);
  });

  it("hides a conversation's subagents when the conversation id is collapsed", () => {
    const rows = flattenConversationTreeRows(sampleTree(), {
      collapsedProjectKeys: new Set(),
      collapsedConversationIds: new Set(["root"]),
      maxDepth: 2,
    });

    expect(rows.map((row) => row.node.id)).toEqual(["p1", "root"]);
    expect(rows.find((row) => row.node.id === "root")?.isExpanded).toBe(false);
  });

  it("keeps an empty project expandable so the renderer can show 暂无对话", () => {
    const tree = buildConversationTree({
      serverId: "s1",
      agents: [],
      projects: [project("p1", ["w1"])],
    });
    const rows = flattenConversationTreeRows(tree, { ...NO_COLLAPSE, maxDepth: 2 });

    expect(rows.map((row) => row.node.id)).toEqual(["p1"]);
    expect(rows[0]?.canExpand).toBe(true);
    expect(rows[0]?.isExpanded).toBe(true);
    expect(rows[0]?.node.children).toHaveLength(0);
  });
});
