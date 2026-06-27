import { describe, expect, it } from "vitest";

import type { ObservedNodeSnapshot } from "../../agent-sdk-types.js";
import {
  OBSERVED_ROOT_OWNER,
  buildToolUseOwnerIndex,
  collectObservedDescendants,
  deriveObservedDepth,
  deriveObservedNodeStatus,
  incrementalTailSlice,
  mergeObservedNodeRecord,
  resolveObservedNode,
  type SubagentMeta,
} from "./observed-tree.js";

// --- record builders mirroring the real Claude transcript shapes the watcher
// reads off disk (assistant tool_use / user tool_result / system task_*). ---
function taskToolUse(id: string, name = "Task"): Record<string, unknown> {
  return {
    type: "assistant",
    message: { role: "assistant", content: [{ type: "tool_use", id, name, input: {} }] },
  };
}
function toolResult(
  toolUseId: string,
  opts?: { isError?: boolean; text?: string; backgrounded?: boolean },
): Record<string, unknown> {
  const block: Record<string, unknown> = {
    type: "tool_result",
    tool_use_id: toolUseId,
    content: [{ type: "text", text: opts?.text ?? "done" }],
  };
  if (opts?.isError) {
    block.is_error = true;
  }
  if (opts?.backgrounded) {
    block.is_backgrounded = true;
  }
  return { type: "user", message: { role: "user", content: [block] } };
}
function taskStarted(taskId: string, toolUseId?: string): Record<string, unknown> {
  return {
    type: "system",
    subtype: "task_started",
    task_id: taskId,
    ...(toolUseId ? { tool_use_id: toolUseId } : {}),
    description: "x",
  };
}
function taskNotification(
  taskId: string,
  status: "completed" | "failed" | "stopped",
  toolUseId?: string,
): Record<string, unknown> {
  return {
    type: "system",
    subtype: "task_notification",
    task_id: taskId,
    status,
    ...(toolUseId ? { tool_use_id: toolUseId } : {}),
  };
}

describe("buildToolUseOwnerIndex", () => {
  it("resolves each tool_use id to the file (root or agent) that owns it across depth 1/2/3", () => {
    const { owners } = buildToolUseOwnerIndex({
      rootRecords: [taskToolUse("toolu_X"), toolResult("toolu_X")],
      agentRecordsByAgentId: new Map([
        ["X", [taskToolUse("toolu_Z"), toolResult("toolu_Z")]],
        ["Z", [taskToolUse("toolu_W")]],
      ]),
    });
    expect(owners.get("toolu_X")?.ownerAgentId).toBe(OBSERVED_ROOT_OWNER);
    expect(owners.get("toolu_Z")?.ownerAgentId).toBe("X");
    expect(owners.get("toolu_W")?.ownerAgentId).toBe("Z");
  });

  it("captures the owner Task tool_result as the foreground terminal authority (idle / error)", () => {
    const { owners } = buildToolUseOwnerIndex({
      rootRecords: [
        taskToolUse("toolu_ok"),
        toolResult("toolu_ok"),
        taskToolUse("toolu_bad"),
        toolResult("toolu_bad", { isError: true }),
      ],
      agentRecordsByAgentId: new Map(),
    });
    expect(owners.get("toolu_ok")?.ownerToolResultErrored).toBe(false);
    expect(owners.get("toolu_bad")?.ownerToolResultErrored).toBe(true);
  });

  it("treats a 'running in the background' tool_result as a non-terminal bg-ack, not a terminal", () => {
    const { owners } = buildToolUseOwnerIndex({
      rootRecords: [
        taskToolUse("toolu_bg"),
        toolResult("toolu_bg", { text: "running in the background", backgrounded: true }),
      ],
      agentRecordsByAgentId: new Map(),
    });
    expect(owners.get("toolu_bg")?.ownerToolResultErrored).toBeUndefined();
    expect(owners.get("toolu_bg")?.ownerToolResultIsBackgroundAck).toBe(true);
  });

  it("builds the task_id -> tool_use_id index from task_started in the same pass (seam D)", () => {
    const { toolUseByTaskId } = buildToolUseOwnerIndex({
      rootRecords: [taskStarted("task_1", "toolu_A")],
      agentRecordsByAgentId: new Map(),
    });
    expect(toolUseByTaskId.get("task_1")).toBe("toolu_A");
  });

  it("routes a background task_notification to its tool_use via the task_id index when tool_use_id is absent (seam D)", () => {
    const { owners } = buildToolUseOwnerIndex({
      rootRecords: [
        taskToolUse("toolu_A"),
        toolResult("toolu_A", { text: "running in the background", backgrounded: true }),
        taskStarted("task_1", "toolu_A"),
        taskNotification("task_1", "completed"),
      ],
      agentRecordsByAgentId: new Map(),
    });
    expect(owners.get("toolu_A")?.taskNotificationStatus).toBe("completed");
  });

  it("leaves the notification unrouted when the task_id index is empty (seam D / W2 accepted residue)", () => {
    const { owners } = buildToolUseOwnerIndex({
      rootRecords: [taskToolUse("toolu_A"), taskNotification("task_orphan", "completed")],
      agentRecordsByAgentId: new Map(),
    });
    expect(owners.get("toolu_A")?.taskNotificationStatus).toBeUndefined();
  });

  it("ingests direct-child agent files unconditionally so a grandchild's owner is found (P1-1)", () => {
    const { owners } = buildToolUseOwnerIndex({
      rootRecords: [taskToolUse("toolu_child")],
      agentRecordsByAgentId: new Map([["child", [taskToolUse("toolu_grandchild")]]]),
    });
    expect(owners.get("toolu_grandchild")?.ownerAgentId).toBe("child");
  });
});

describe("deriveObservedNodeStatus", () => {
  it("① owner Task tool_result is the foreground authority: success -> idle, error -> error", () => {
    expect(deriveObservedNodeStatus({ ownerToolResultErrored: false, rootIsActive: true })).toBe(
      "idle",
    );
    expect(deriveObservedNodeStatus({ ownerToolResultErrored: true, rootIsActive: true })).toBe(
      "error",
    );
  });

  it("② task_notification settles a background child: completed/stopped -> idle, failed -> error", () => {
    expect(
      deriveObservedNodeStatus({ taskNotificationStatus: "completed", rootIsActive: false }),
    ).toBe("idle");
    expect(
      deriveObservedNodeStatus({ taskNotificationStatus: "stopped", rootIsActive: false }),
    ).toBe("idle");
    expect(
      deriveObservedNodeStatus({ taskNotificationStatus: "failed", rootIsActive: false }),
    ).toBe("error");
  });

  it("③ a 'running in the background' bg-ack with no notification stays running (non-terminal)", () => {
    expect(
      deriveObservedNodeStatus({ ownerToolResultIsBackgroundAck: true, rootIsActive: false }),
    ).toBe("running");
  });

  it("④ with no terminal signal: rootIsActive -> running, else static idle (seam B)", () => {
    expect(deriveObservedNodeStatus({ rootIsActive: true })).toBe("running");
    expect(deriveObservedNodeStatus({ rootIsActive: false })).toBe("idle");
  });

  it("ranks the foreground tool_result terminal over task_notification (① over ②)", () => {
    expect(
      deriveObservedNodeStatus({
        ownerToolResultErrored: false,
        taskNotificationStatus: "failed",
        rootIsActive: true,
      }),
    ).toBe("idle");
  });

  it("keeps a real terminal sticky even while the root is active (seam B: terminal outranks ④)", () => {
    expect(deriveObservedNodeStatus({ ownerToolResultErrored: false, rootIsActive: true })).toBe(
      "idle",
    );
  });
});

describe("resolveObservedNode", () => {
  const metaX: SubagentMeta = {
    agentType: "Explore",
    description: "child",
    toolUseId: "toolu_X",
    spawnDepth: 1,
  };
  const metaZ: SubagentMeta = {
    agentType: "general",
    description: "grandchild",
    toolUseId: "toolu_Z",
    spawnDepth: 2,
  };
  const metaByAgentId = new Map<string, SubagentMeta>([
    ["X", metaX],
    ["Z", metaZ],
  ]);
  const ownerIndex = new Map([
    ["toolu_X", { ownerAgentId: OBSERVED_ROOT_OWNER }],
    ["toolu_Z", { ownerAgentId: "X" }],
  ]);

  it("points a direct child at the real root agent id with a flat observed id", () => {
    const node = resolveObservedNode({
      agentId: "X",
      meta: metaX,
      ownerIndex,
      metaByAgentId,
      rootAgentId: "root-uuid",
      rootSessionId: "sess",
      rootIsActive: true,
    });
    expect(node.parentAgentId).toBe("root-uuid");
    expect(node.id).toBe("observed:toolu_X");
  });

  it("points a deeper node at observed:<ownerToolUseId>", () => {
    const node = resolveObservedNode({
      agentId: "Z",
      meta: metaZ,
      ownerIndex,
      metaByAgentId,
      rootAgentId: "root-uuid",
      rootSessionId: "sess",
      rootIsActive: true,
    });
    expect(node.parentAgentId).toBe("observed:toolu_X");
  });

  it("falls back to the root when the owner cannot be resolved (never drops the node)", () => {
    const node = resolveObservedNode({
      agentId: "O",
      meta: { toolUseId: "toolu_orphan" },
      ownerIndex,
      metaByAgentId,
      rootAgentId: "root-uuid",
      rootSessionId: "sess",
      rootIsActive: true,
    });
    expect(node.parentAgentId).toBe("root-uuid");
  });

  it("carries a nativeRef (rootSessionId + agentId) so the timeline can be opened", () => {
    const node = resolveObservedNode({
      agentId: "X",
      meta: metaX,
      ownerIndex,
      metaByAgentId,
      rootAgentId: "root-uuid",
      rootSessionId: "sess-1",
      rootIsActive: true,
    });
    expect(node.nativeRef).toEqual({ rootSessionId: "sess-1", agentId: "X" });
  });
});

describe("deriveObservedDepth", () => {
  const metaByAgentId = new Map<string, SubagentMeta>([
    ["X", { toolUseId: "toolu_X" }],
    ["Z", { toolUseId: "toolu_Z" }],
    ["W", { toolUseId: "toolu_W" }],
  ]);
  const ownerIndex = new Map([
    ["toolu_X", { ownerAgentId: OBSERVED_ROOT_OWNER }],
    ["toolu_Z", { ownerAgentId: "X" }],
    ["toolu_W", { ownerAgentId: "Z" }],
  ]);

  it("counts a direct child as depth 1, grandchild 2, great-grandchild 3", () => {
    expect(deriveObservedDepth("X", metaByAgentId, ownerIndex)).toBe(1);
    expect(deriveObservedDepth("Z", metaByAgentId, ownerIndex)).toBe(2);
    expect(deriveObservedDepth("W", metaByAgentId, ownerIndex)).toBe(3);
  });

  it("derives depth from the owner chain even when spawnDepth is absent", () => {
    expect(deriveObservedDepth("W", metaByAgentId, ownerIndex)).toBe(3);
  });
});

describe("collectObservedDescendants", () => {
  it("collects children, grandchildren and great-grandchildren along the observed parent chain", () => {
    const set = collectObservedDescendants("root-uuid", [
      { id: "observed:toolu_X", parentAgentId: "root-uuid" },
      { id: "observed:toolu_Z", parentAgentId: "observed:toolu_X" },
      { id: "observed:toolu_W", parentAgentId: "observed:toolu_Z" },
      { id: "observed:toolu_other", parentAgentId: "different-root" },
    ]);
    expect(set).toEqual(new Set(["observed:toolu_X", "observed:toolu_Z", "observed:toolu_W"]));
  });

  it("does not collect nodes under a different root (no over-reach)", () => {
    expect(
      collectObservedDescendants("root-uuid", [{ id: "observed:a", parentAgentId: "other-root" }])
        .size,
    ).toBe(0);
  });
});

describe("mergeObservedNodeRecord", () => {
  const base: ObservedNodeSnapshot = {
    id: "observed:toolu_X",
    parentAgentId: "root",
    title: "child",
    status: "running",
  };

  it("returns the incoming node when there is no previous record", () => {
    expect(mergeObservedNodeRecord(null, base)).toEqual(base);
  });

  it("coalesces nativeRef so a later out-of-order live half-node never erases the file-filled ref (seam A, defined-wins not LWW)", () => {
    const withRef: ObservedNodeSnapshot = {
      ...base,
      status: "idle",
      nativeRef: { rootSessionId: "s", agentId: "X" },
    };
    const liveHalfNode: ObservedNodeSnapshot = { ...base, status: "running" };
    expect(mergeObservedNodeRecord(withRef, liveHalfNode).nativeRef).toEqual({
      rootSessionId: "s",
      agentId: "X",
    });
  });

  it("fills nativeRef from the file when the previous live half-node lacked it (seam A)", () => {
    const liveHalfNode: ObservedNodeSnapshot = { ...base };
    const fileNode: ObservedNodeSnapshot = {
      ...base,
      nativeRef: { rootSessionId: "s", agentId: "X" },
    };
    expect(mergeObservedNodeRecord(liveHalfNode, fileNode).nativeRef).toEqual({
      rootSessionId: "s",
      agentId: "X",
    });
  });

  it("adopts the incoming status (recomputed upstream by deriveObservedNodeStatus, never stale-held across merge, seam B)", () => {
    expect(
      mergeObservedNodeRecord({ ...base, status: "running" }, { ...base, status: "idle" }).status,
    ).toBe("idle");
  });
});

describe("incrementalTailSlice", () => {
  it("returns only complete lines and advances the offset past them", () => {
    const { lines, nextOffset } = incrementalTailSlice(10, "a\nb\nc");
    expect(lines).toEqual(["a", "b"]);
    expect(nextOffset).toBe(10 + Buffer.byteLength("a\nb\n", "utf8"));
  });

  it("does not split a half-written trailing line (no mis-slice)", () => {
    const { lines, nextOffset } = incrementalTailSlice(0, '{"x":1}\n{"y"');
    expect(lines).toEqual(['{"x":1}']);
    expect(nextOffset).toBe(Buffer.byteLength('{"x":1}\n', "utf8"));
  });

  it("does not advance when there is no complete line yet", () => {
    expect(incrementalTailSlice(5, "partial")).toEqual({ lines: [], nextOffset: 5 });
  });

  it("counts multi-byte characters by byte length so the offset stays exact (no dupes, no gaps)", () => {
    const { lines, nextOffset } = incrementalTailSlice(0, "中\n");
    expect(lines).toEqual(["中"]);
    expect(nextOffset).toBe(Buffer.byteLength("中\n", "utf8"));
  });

  it("skips blank lines between records", () => {
    expect(incrementalTailSlice(0, "a\n\nb\n").lines).toEqual(["a", "b"]);
  });
});
