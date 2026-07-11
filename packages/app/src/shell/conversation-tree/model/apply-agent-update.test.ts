import { describe, expect, test } from "vitest";
import { applyAgentUpdate } from "./apply-agent-update";
import type { ConversationTreeAgent, ConversationTreeProject } from "./types";

/** Build a complete agent snapshot for incremental update tests. */
function agent(id: string, overrides: Partial<ConversationTreeAgent> = {}): ConversationTreeAgent {
  return {
    id,
    title: id,
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

/** Build project membership snapshots without involving workspace protocol fixtures. */
function project(projectKey: string, workspaceIds: readonly string[]): ConversationTreeProject {
  return { projectKey, name: `Project ${projectKey}`, workspaceIds };
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
      { kind: "upsert", agent: nextAgent, projectKey: "target" },
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
      { kind: "upsert", agent: newAgent, projectKey: "new-project" },
    );

    expect(added.projects.get("new-project")).toEqual({
      projectKey: "new-project",
      name: "new-project",
      workspaceIds: ["workspace-new"],
    });

    const detached = applyAgentUpdate(added, {
      kind: "upsert",
      agent: newAgent,
      projectKey: null,
    });
    expect(detached.projects.get("new-project")?.workspaceIds).toEqual([]);
  });

  test("remove reports both the exact removed id and descendants made unreachable by its absence", () => {
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
    expect(result.unreachableIds).toEqual(new Set(["root", "child", "grandchild"]));
  });

  test("treats archived or closed upserts as removals from the active snapshot", () => {
    const root = agent("root");
    const archived = applyAgentUpdate(
      { agents: new Map([[root.id, root]]), projects: new Map() },
      {
        kind: "upsert",
        agent: { ...root, archivedAt: "2026-07-12T02:00:00.000Z" },
        projectKey: null,
      },
    );
    const closed = applyAgentUpdate(
      { agents: new Map([[root.id, root]]), projects: new Map() },
      { kind: "upsert", agent: { ...root, status: "closed" }, projectKey: null },
    );

    expect(archived.agents.size).toBe(0);
    expect(archived.unreachableIds).toEqual(new Set(["root"]));
    expect(closed.agents.size).toBe(0);
    expect(closed.unreachableIds).toEqual(new Set(["root"]));
  });

  test("marks orphan and cyclic upserts unreachable without affecting healthy roots", () => {
    const healthy = agent("healthy");
    const orphan = agent("orphan", { parentAgentId: "missing" });
    const result = applyAgentUpdate(
      { agents: new Map([[healthy.id, healthy]]), projects: new Map() },
      { kind: "upsert", agent: orphan, projectKey: null },
    );

    expect(result.unreachableIds).toEqual(new Set(["orphan"]));
  });
});
