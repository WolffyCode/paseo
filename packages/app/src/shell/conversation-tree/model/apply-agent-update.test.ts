import { describe, expect, test } from "vitest";
import { applyAgentUpdate } from "./apply-agent-update";
import type { ConversationTreeAgent, ConversationTreeProject } from "./types";

/** Build a complete agent snapshot for incremental update tests. */
function agent(id: string, overrides: Partial<ConversationTreeAgent> = {}): ConversationTreeAgent {
  return {
    id,
    provider: "claude",
    title: id,
    workspaceId: null,
    parentAgentId: null,
    status: "idle",
    requiresAttention: false,
    attentionReason: null,
    pendingPermissionCount: 0,
    archivedAt: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    sessionId: null,
    ...overrides,
  };
}

/** Build project membership snapshots without involving workspace protocol fixtures. */
function project(projectKey: string, workspaceIds: readonly string[]): ConversationTreeProject {
  return { projectKey, name: `Project ${projectKey}`, workspaceIds };
}

/** Build the upsert event's project placement exactly as the daemon always bundles it. */
function placement(projectKey: string, projectName = `Project ${projectKey}`) {
  return { projectKey, projectName };
}

describe("applyAgentUpdate", () => {
  test("upserts an agent and moves its workspace onto the event's project identity", () => {
    const previousAgent = agent("root", { workspaceId: "old-workspace" });
    const nextAgent = agent("root", { workspaceId: "new-workspace", status: "running" });
    const result = applyAgentUpdate(
      {
        agents: new Map([[previousAgent.id, previousAgent]]),
        projects: new Map([
          ["old", project("old", ["old-workspace", "new-workspace"])],
          ["target", project("target", [])],
        ]),
      },
      { kind: "upsert", agent: nextAgent, project: placement("target") },
    );

    expect(result.agents.get("root")).toBe(nextAgent);
    expect(result.projects.get("old")?.workspaceIds).toEqual(["old-workspace"]);
    expect(result.projects.get("target")?.workspaceIds).toEqual(["new-workspace"]);
    expect(result.unreachableIds).toEqual(new Set());
  });

  test("creates an unknown project and removes workspace membership when placement becomes null", () => {
    const newAgent = agent("new", { workspaceId: "workspace-new" });
    const added = applyAgentUpdate(
      { agents: new Map(), projects: new Map() },
      { kind: "upsert", agent: newAgent, project: placement("new-project") },
    );

    expect(added.projects.get("new-project")).toEqual({
      projectKey: "new-project",
      name: "Project new-project",
      workspaceIds: ["workspace-new"],
    });

    const detached = applyAgentUpdate(added, {
      kind: "upsert",
      agent: newAgent,
      project: null,
    });
    expect(detached.projects.get("new-project")?.workspaceIds).toEqual([]);
  });

  test("names a newly created project from the upsert's resolved projectName, not the raw key", () => {
    const rawKey = "/Users/dev/Desktop/ct-verify/proj-gamma";
    const result = applyAgentUpdate(
      { agents: new Map(), projects: new Map() },
      {
        kind: "upsert",
        agent: agent("agent-a", { workspaceId: "workspace-a" }),
        project: { projectKey: rawKey, projectName: "proj-gamma" },
      },
    );

    expect(result.projects.get(rawKey)?.name).toBe("proj-gamma");
  });

  test("merges two same-key upserts into one project entry regardless of arrival order", () => {
    const agentA = agent("agent-a", { workspaceId: "workspace-a" });
    const agentB = agent("agent-b", { workspaceId: "workspace-b" });
    const samePlacement = placement("proj-gamma", "proj-gamma");
    const empty = { agents: new Map(), projects: new Map() };

    const forward = applyAgentUpdate(
      applyAgentUpdate(empty, { kind: "upsert", agent: agentA, project: samePlacement }),
      { kind: "upsert", agent: agentB, project: samePlacement },
    );
    const reversed = applyAgentUpdate(
      applyAgentUpdate(empty, { kind: "upsert", agent: agentB, project: samePlacement }),
      { kind: "upsert", agent: agentA, project: samePlacement },
    );

    for (const result of [forward, reversed]) {
      expect(result.projects.size).toBe(1);
      expect(result.projects.get("proj-gamma")?.name).toBe("proj-gamma");
      expect(new Set(result.projects.get("proj-gamma")?.workspaceIds)).toEqual(
        new Set(["workspace-a", "workspace-b"]),
      );
    }
  });

  test("remove reports only the exact removed id; its now-parentless descendants stay reachable as promoted roots", () => {
    const root = agent("root");
    const child = agent("child", { parentAgentId: "root" });
    const grandchild = agent("grandchild", { parentAgentId: "child" });

    const result = applyAgentUpdate(
      {
        agents: new Map([
          [root.id, root],
          [child.id, child],
          [grandchild.id, grandchild],
        ]),
        projects: new Map(),
      },
      { kind: "remove", agentId: "root" },
    );

    expect(Array.from(result.agents.keys())).toEqual(["child", "grandchild"]);
    expect(result.unreachableIds).toEqual(new Set(["root"]));
  });

  test("treats an archived upsert as a removal from the active snapshot", () => {
    const root = agent("root");
    const archived = applyAgentUpdate(
      { agents: new Map([[root.id, root]]), projects: new Map() },
      {
        kind: "upsert",
        agent: { ...root, archivedAt: "2026-07-12T02:00:00.000Z" },
        project: null,
      },
    );

    expect(archived.agents.size).toBe(0);
    expect(archived.unreachableIds).toEqual(new Set(["root"]));
  });

  test("keeps a closed upsert in the snapshot instead of treating it as a removal", () => {
    const root = agent("root");
    const closed = applyAgentUpdate(
      { agents: new Map([[root.id, root]]), projects: new Map() },
      { kind: "upsert", agent: { ...root, status: "closed" }, project: null },
    );

    expect(closed.agents.size).toBe(1);
    expect(closed.agents.get("root")?.status).toBe("closed");
    expect(closed.unreachableIds).toEqual(new Set());
  });

  test("treats a purely dangling parent reference as reachable, matching build-tree's root promotion", () => {
    const healthy = agent("healthy");
    const orphan = agent("orphan", { parentAgentId: "missing" });
    const result = applyAgentUpdate(
      { agents: new Map([[healthy.id, healthy]]), projects: new Map() },
      { kind: "upsert", agent: orphan, project: null },
    );

    expect(result.unreachableIds).toEqual(new Set());
  });

  test("marks self and mutual parent cycles unreachable without affecting a healthy root", () => {
    const healthy = agent("healthy");
    const selfCycle = agent("self-cycle", { parentAgentId: "self-cycle" });
    const cycleA = agent("cycle-a", { parentAgentId: "cycle-b" });
    const cycleB = agent("cycle-b", { parentAgentId: "cycle-a" });
    const result = applyAgentUpdate(
      {
        agents: new Map([
          [healthy.id, healthy],
          [selfCycle.id, selfCycle],
          [cycleA.id, cycleA],
          [cycleB.id, cycleB],
        ]),
        projects: new Map(),
      },
      { kind: "upsert", agent: healthy, project: null },
    );

    expect(result.unreachableIds).toEqual(new Set(["self-cycle", "cycle-a", "cycle-b"]));
  });
});
