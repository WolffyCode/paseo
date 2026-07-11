import { describe, expect, test } from "vitest";
import { buildConversationTree } from "./build-tree";
import type { ConversationTreeAgent, ConversationTreeProject, WorkspaceDetail } from "./types";

/** Build a complete agent fixture while keeping each test focused on its changed fields. */
function agent(id: string, overrides: Partial<ConversationTreeAgent> = {}): ConversationTreeAgent {
  return {
    id,
    title: `Agent ${id}`,
    workspaceId: null,
    parentAgentId: null,
    status: "idle",
    requiresAttention: false,
    attentionReason: null,
    pendingPermissionCount: 0,
    archivedAt: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    sessionId: null,
    ...overrides,
  };
}

/** Build the hover/title detail shape used by root-conversation title resolution. */
function workspaceDetail(title: string | null): WorkspaceDetail {
  return {
    title,
    directory: "/repo",
    branch: "main",
    lastChangeAt: "2026-07-12T00:00:00.000Z",
    diffStat: { added: 3, removed: 1 },
  };
}

const PROJECTS: readonly ConversationTreeProject[] = [
  { projectKey: "p1", name: "Project One", workspaceIds: ["w1", "w2"] },
  { projectKey: "empty", name: "Empty Project", workspaceIds: [] },
];

describe("buildConversationTree", () => {
  test("buckets roots by project identity and leaves unmapped roots loose", () => {
    const nodes = buildConversationTree({
      agents: [
        agent("late", {
          workspaceId: " w1 ",
          createdAt: "2026-07-12T02:00:00.000Z",
        }),
        agent("early", {
          workspaceId: "w2",
          createdAt: "2026-07-12T01:00:00.000Z",
        }),
        agent("loose", { workspaceId: "unmapped" }),
      ],
      projects: PROJECTS,
      workspaceDetails: new Map(),
    });

    expect(nodes.map((node) => `${node.kind}:${node.id}`)).toEqual([
      "project:p1",
      "project:empty",
      "conversation:loose",
    ]);
    expect(nodes[0]?.children.map((node) => node.id)).toEqual(["early", "late"]);
    expect(nodes[1]?.children).toEqual([]);
  });

  test("recurses without a product depth limit and counts every descendant", () => {
    const nodes = buildConversationTree({
      agents: [
        agent("root", { workspaceId: "w1" }),
        agent("child-2", {
          parentAgentId: "root",
          createdAt: "2026-07-12T02:00:00.000Z",
        }),
        agent("child-1", {
          parentAgentId: "root",
          createdAt: "2026-07-12T01:00:00.000Z",
        }),
        agent("depth-3", { parentAgentId: "child-1" }),
        agent("depth-4", { parentAgentId: "depth-3" }),
        agent("depth-5", { parentAgentId: "depth-4" }),
      ],
      projects: PROJECTS,
      workspaceDetails: new Map(),
    });

    const root = nodes[0]?.children[0];
    expect(root?.children.map((node) => node.id)).toEqual(["child-1", "child-2"]);
    expect(root?.subagentCount).toBe(5);
    expect(root?.children[0]?.children[0]?.children[0]?.children[0]?.id).toBe("depth-5");
  });

  test("filters an archived parent together with its unreachable descendants", () => {
    const nodes = buildConversationTree({
      agents: [
        agent("kept", { workspaceId: "w1" }),
        agent("archived", {
          workspaceId: "w1",
          archivedAt: "2026-07-12T03:00:00.000Z",
        }),
        agent("archived-child", { parentAgentId: "archived" }),
      ],
      projects: PROJECTS,
      workspaceDetails: new Map(),
    });

    expect(nodes[0]?.children.map((node) => node.id)).toEqual(["kept"]);
  });

  test("keeps a closed agent and its live children visible, mapped into the idle status dot", () => {
    const nodes = buildConversationTree({
      agents: [
        agent("kept", { workspaceId: "w1" }),
        agent("closed-root", { workspaceId: "w1", status: "closed" }),
        agent("closed-root-child", { parentAgentId: "closed-root" }),
      ],
      projects: PROJECTS,
      workspaceDetails: new Map(),
    });

    expect(nodes[0]?.children.map((node) => node.id)).toEqual(["closed-root", "kept"]);
    const closedRoot = nodes[0]?.children[0];
    expect(closedRoot?.statusDot).toBe("idle");
    expect(closedRoot?.children.map((node) => node.id)).toEqual(["closed-root-child"]);
  });

  test("promotes an agent whose parent id is absent from every snapshot state to its own root", () => {
    const nodes = buildConversationTree({
      agents: [
        agent("kept", { workspaceId: "w1" }),
        agent("orphan-root", {
          workspaceId: "w1",
          parentAgentId: "cross-daemon-ghost",
          createdAt: "2026-07-12T02:00:00.000Z",
        }),
        agent("orphan-child", { parentAgentId: "orphan-root" }),
        agent("loose-orphan", { parentAgentId: "also-missing" }),
      ],
      projects: PROJECTS,
      workspaceDetails: new Map(),
    });

    expect(nodes[0]?.children.map((node) => node.id)).toEqual(["kept", "orphan-root"]);
    expect(nodes[0]?.children[1]?.children.map((node) => node.id)).toEqual(["orphan-child"]);
    expect(nodes.map((node) => `${node.kind}:${node.id}`)).toContain("conversation:loose-orphan");
  });

  test("keeps a live child of a known-but-archived parent invisible rather than promoting it", () => {
    const nodes = buildConversationTree({
      agents: [
        agent("archived-parent", {
          workspaceId: "w1",
          archivedAt: "2026-07-12T03:00:00.000Z",
        }),
        agent("still-live-child", { parentAgentId: "archived-parent" }),
      ],
      projects: PROJECTS,
      workspaceDetails: new Map(),
    });

    expect(nodes.map((node) => `${node.kind}:${node.id}`)).not.toContain(
      "conversation:still-live-child",
    );
    expect(nodes[0]?.children).toEqual([]);
  });

  test("uses live workspace titles only for root conversations and falls back to agent identity", () => {
    const nodes = buildConversationTree({
      agents: [
        agent("root", { title: "Agent title", workspaceId: "w1" }),
        agent("child", {
          title: "Child title",
          workspaceId: "w2",
          parentAgentId: "root",
        }),
        agent("untitled", { title: "  ", workspaceId: "loose" }),
      ],
      projects: PROJECTS,
      workspaceDetails: new Map([
        ["w1", workspaceDetail("Live workspace title")],
        ["w2", workspaceDetail("Must not replace child title")],
      ]),
    });

    const root = nodes[0]?.children[0];
    expect(root?.title).toBe("Live workspace title");
    expect(root?.children[0]?.title).toBe("Child title");
    expect(nodes[2]?.title).toBe("untitled");
  });

  test("deduplicates repeated agent identities on the single agent-id axis", () => {
    const nodes = buildConversationTree({
      agents: [
        agent("same", { title: "stale", workspaceId: "w1" }),
        agent("same", { title: "latest", workspaceId: "w1", status: "running" }),
      ],
      projects: PROJECTS,
      workspaceDetails: new Map(),
    });

    expect(nodes[0]?.children).toHaveLength(1);
    expect(nodes[0]?.children[0]).toMatchObject({
      id: "same",
      title: "latest",
      statusDot: "running",
    });
  });

  test("cuts self and mutual parent cycles without affecting reachable roots", () => {
    const nodes = buildConversationTree({
      agents: [
        agent("healthy", { workspaceId: "w1" }),
        agent("self-cycle", { parentAgentId: "self-cycle" }),
        agent("cycle-a", { parentAgentId: "cycle-b" }),
        agent("cycle-b", { parentAgentId: "cycle-a" }),
      ],
      projects: PROJECTS,
      workspaceDetails: new Map(),
    });

    expect(nodes[0]?.children.map((node) => node.id)).toEqual(["healthy"]);
    expect(nodes.slice(2)).toEqual([]);
  });
});
