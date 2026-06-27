// Pure tree core for the observed subagent tree (no fs, no network). Turns parsed
// Claude transcript records + per-subagent meta into the flat node snapshots the
// client tree renders. The fs boundary (reading subagents/, watching, tailing)
// lives in observed-tree-watcher.ts; everything here is a pure function so the
// owner-resolution, status, depth, dedup and tail-slicing logic is unit-testable
// without touching disk (standards §1, §5).

import type { ObservedNodeSnapshot } from "../../agent-sdk-types.js";
import { observedSubAgentId, observedSubAgentTitle } from "../../observed-sub-agents.js";

// Sentinel owner for a tool_use that lives in the ROOT transcript (a direct
// child). Distinct from any real agentId so resolveObservedNode can tell "parent
// is the root agent" from "parent is a deeper observed node".
export const OBSERVED_ROOT_OWNER = "<root>";

// Parsed `agent-<id>.meta.json` — the SDK writes exactly these fields (verified on
// disk). toolUseId is the Task tool-use that spawned this sub-agent (its identity
// + owner key); spawnDepth is advisory (the owner chain is the depth authority).
export interface SubagentMeta {
  agentType?: string;
  description?: string;
  toolUseId: string;
  spawnDepth?: number;
}

// Where one tool_use lives + the raw terminal signals read off the owner file.
// Carries the discrete signals (not a pre-baked status) so deriveObservedNodeStatus
// can recompute status against the live rootIsActive every time — status is never
// frozen into the index (seam B: no stale terminal across recompute).
export interface ToolUseOwnership {
  ownerAgentId: string; // agentId, or OBSERVED_ROOT_OWNER
  ownerToolResultErrored?: boolean; // ① real (non-bg) owner Task tool_result: is_error
  ownerToolResultIsBackgroundAck?: boolean; // ③ "running in the background" — non-terminal
  taskNotificationStatus?: "completed" | "failed" | "stopped"; // ② background settle
}

export interface ObservedNodeStatusSignals {
  ownerToolResultErrored?: boolean;
  ownerToolResultIsBackgroundAck?: boolean;
  taskNotificationStatus?: "completed" | "failed" | "stopped";
  rootIsActive: boolean;
}

interface PendingTaskNotification {
  taskId: string;
  toolUseId?: string;
  status: "completed" | "failed" | "stopped";
}

const BACKGROUND_ACK_PATTERN = /running in the background/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// The content blocks of an assistant/user message record, or [] for anything else.
function contentBlocks(record: Record<string, unknown>): Record<string, unknown>[] {
  const message = record.message;
  if (!isRecord(message)) {
    return [];
  }
  const content = message.content;
  return Array.isArray(content) ? content.filter(isRecord) : [];
}

// A backgrounded Task tool_result ("running in the background" / is_backgrounded)
// is an acknowledgement, NOT a terminal — the child keeps running past the parent
// turn and only settles via a later task_notification.
function isBackgroundAck(block: Record<string, unknown>): boolean {
  return (
    block.is_backgrounded === true || BACKGROUND_ACK_PATTERN.test(toolResultText(block.content))
  );
}

// Flattens a tool_result's content (string or text blocks) for keyword matching.
function toolResultText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .join(" ");
}

function normalizeNotificationStatus(
  value: unknown,
): "completed" | "failed" | "stopped" | undefined {
  const status = readString(value)?.toLowerCase();
  if (status === "completed") {
    return "completed";
  }
  if (status === "failed" || status === "error") {
    return "failed";
  }
  if (status === "stopped" || status === "canceled" || status === "cancelled") {
    return "stopped";
  }
  return undefined;
}

// Records each tool_use's owner file (first writer wins; tool_use ids are globally
// unique, so the file that emitted one owns the sub-agent it spawned).
function ingestToolUses(
  record: Record<string, unknown>,
  ownerAgentId: string,
  owners: Map<string, ToolUseOwnership>,
): void {
  for (const block of contentBlocks(record)) {
    if (!readString(block.type)?.endsWith("tool_use")) {
      continue;
    }
    const id = readString(block.id);
    if (id && !owners.has(id)) {
      owners.set(id, { ownerAgentId });
    }
  }
}

// Folds each tool_result's terminal signal into its owner: a real terminal records
// is_error; a "running in the background" ack is marked non-terminal instead.
function ingestToolResults(
  record: Record<string, unknown>,
  ownerAgentId: string,
  owners: Map<string, ToolUseOwnership>,
): void {
  for (const block of contentBlocks(record)) {
    if (!readString(block.type)?.endsWith("tool_result")) {
      continue;
    }
    const toolUseId = readString(block.tool_use_id);
    if (!toolUseId) {
      continue;
    }
    const ownership = owners.get(toolUseId) ?? { ownerAgentId };
    if (isBackgroundAck(block)) {
      ownership.ownerToolResultIsBackgroundAck = true;
    } else {
      ownership.ownerToolResultErrored = block.is_error === true;
    }
    owners.set(toolUseId, ownership);
  }
}

// Builds the task_id->toolUseId index from task_started/progress and defers each
// task_notification (routed after the full index exists, seam D).
function ingestSystemRecord(
  record: Record<string, unknown>,
  toolUseByTaskId: Map<string, string>,
  pendingNotifications: PendingTaskNotification[],
): void {
  const subtype = readString(record.subtype);
  const taskId = readString(record.task_id);
  const toolUseId = readString(record.tool_use_id);
  if ((subtype === "task_started" || subtype === "task_progress") && taskId && toolUseId) {
    if (!toolUseByTaskId.has(taskId)) {
      toolUseByTaskId.set(taskId, toolUseId);
    }
  } else if (subtype === "task_notification" && taskId) {
    const status = normalizeNotificationStatus(record.status);
    if (status) {
      pendingNotifications.push({ taskId, status, ...(toolUseId ? { toolUseId } : {}) });
    }
  }
}

// Ingests one file's records into the shared owner index, dispatching by record
// type. Reused for the root file and every agent file so the structural read is
// unconditional and source-symmetric (P1-1: a grandchild's owner lives in its
// direct child's file).
function ingestRecords(input: {
  records: Iterable<Record<string, unknown>>;
  ownerAgentId: string;
  owners: Map<string, ToolUseOwnership>;
  toolUseByTaskId: Map<string, string>;
  pendingNotifications: PendingTaskNotification[];
}): void {
  for (const record of input.records) {
    const type = readString(record.type);
    if (type === "assistant") {
      ingestToolUses(record, input.ownerAgentId, input.owners);
    } else if (type === "user") {
      ingestToolResults(record, input.ownerAgentId, input.owners);
    } else if (type === "system") {
      ingestSystemRecord(record, input.toolUseByTaskId, input.pendingNotifications);
    }
  }
}

// One unconditional structural pass over the root file + every agent file, building
// both indices needed to rebuild the tree: owners (toolUseId -> where it lives +
// terminal signals) and toolUseByTaskId (task_id -> toolUseId, from task_started/
// progress) so a backgrounded task_notification missing tool_use_id can be routed
// back (seam D — SDK's task_*.tool_use_id is optional, never the sole key).
export function buildToolUseOwnerIndex(input: {
  rootRecords: Iterable<Record<string, unknown>>;
  agentRecordsByAgentId: ReadonlyMap<string, Iterable<Record<string, unknown>>>;
}): { owners: Map<string, ToolUseOwnership>; toolUseByTaskId: Map<string, string> } {
  const owners = new Map<string, ToolUseOwnership>();
  const toolUseByTaskId = new Map<string, string>();
  const pendingNotifications: PendingTaskNotification[] = [];

  ingestRecords({
    records: input.rootRecords,
    ownerAgentId: OBSERVED_ROOT_OWNER,
    owners,
    toolUseByTaskId,
    pendingNotifications,
  });
  for (const [agentId, records] of input.agentRecordsByAgentId) {
    ingestRecords({
      records,
      ownerAgentId: agentId,
      owners,
      toolUseByTaskId,
      pendingNotifications,
    });
  }

  // Route deferred notifications now that the full task_id index is built. A
  // notification whose task_id never appeared in any task_started stays unrouted
  // (seam D / W2 accepted residue: terminal not routable, node holds its prior state).
  for (const notification of pendingNotifications) {
    const toolUseId = notification.toolUseId ?? toolUseByTaskId.get(notification.taskId);
    if (!toolUseId) {
      continue;
    }
    const ownership = owners.get(toolUseId);
    if (ownership) {
      ownership.taskNotificationStatus = notification.status;
    }
  }

  return { owners, toolUseByTaskId };
}

// The single status authority. Recomputed from persistent file signals + the
// scan-time rootIsActive every time (never cached) so a real terminal (①/②) is
// structurally sticky while a static idle (④) can be revised back to running once
// the root becomes active again (seam B: a half-run node isn't pinned idle on
// restart). Order is the closing-point order from architecture §4·4.
export function deriveObservedNodeStatus(
  signals: ObservedNodeStatusSignals,
): "running" | "idle" | "error" {
  if (signals.ownerToolResultErrored !== undefined) {
    return signals.ownerToolResultErrored ? "error" : "idle";
  }
  if (signals.taskNotificationStatus) {
    return signals.taskNotificationStatus === "failed" ? "error" : "idle";
  }
  if (signals.ownerToolResultIsBackgroundAck) {
    return "running";
  }
  return signals.rootIsActive ? "running" : "idle";
}

// Builds one node snapshot: id from its own toolUseId, parent pointer from its
// owner (real root id for a direct child, observed:<ownerToolUseId> for deeper,
// root as the never-drop fallback for an unresolved owner), status from the single
// authority, and the nativeRef that locates its own transcript (seam A: only the
// file scan has the agentId, so the live half-node fills this in later).
export function resolveObservedNode(input: {
  agentId: string;
  meta: SubagentMeta;
  ownerIndex: ReadonlyMap<string, ToolUseOwnership>;
  metaByAgentId: ReadonlyMap<string, SubagentMeta>;
  rootAgentId: string;
  rootSessionId: string;
  rootIsActive: boolean;
}): ObservedNodeSnapshot {
  const ownership = input.ownerIndex.get(input.meta.toolUseId);
  let parentAgentId = input.rootAgentId;
  if (ownership && ownership.ownerAgentId !== OBSERVED_ROOT_OWNER) {
    const ownerMeta = input.metaByAgentId.get(ownership.ownerAgentId);
    parentAgentId = ownerMeta ? observedSubAgentId(ownerMeta.toolUseId) : input.rootAgentId;
  }
  return {
    id: observedSubAgentId(input.meta.toolUseId),
    parentAgentId,
    title: observedSubAgentTitle({
      description: input.meta.description,
      subAgentType: input.meta.agentType,
    }),
    status: deriveObservedNodeStatus({
      ownerToolResultErrored: ownership?.ownerToolResultErrored,
      ownerToolResultIsBackgroundAck: ownership?.ownerToolResultIsBackgroundAck,
      taskNotificationStatus: ownership?.taskNotificationStatus,
      rootIsActive: input.rootIsActive,
    }),
    nativeRef: { rootSessionId: input.rootSessionId, agentId: input.agentId },
  };
}

// Depth from the owner chain (direct child = 1), the authority over the advisory
// meta.spawnDepth so depth is correct even when spawnDepth is absent. The seen
// guard makes a corrupt cyclic owner reference terminate instead of looping.
export function deriveObservedDepth(
  agentId: string,
  metaByAgentId: ReadonlyMap<string, SubagentMeta>,
  ownerIndex: ReadonlyMap<string, ToolUseOwnership>,
): number {
  let depth = 0;
  let current: string | undefined = agentId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    depth += 1;
    const meta = metaByAgentId.get(current);
    if (!meta) {
      break;
    }
    const ownership = ownerIndex.get(meta.toolUseId);
    if (!ownership || ownership.ownerAgentId === OBSERVED_ROOT_OWNER) {
      break;
    }
    current = ownership.ownerAgentId;
  }
  return depth;
}

// Every observed node under a root, to any depth, following the observed parent
// chain. The recursion domain for runtime-gone drop and archive cascade — single
// layer filtering leaked deep nodes (PM correction), so this walks the whole subtree.
export function collectObservedDescendants(
  rootAgentId: string,
  records: Iterable<{ id: string; parentAgentId: string }>,
): Set<string> {
  const all = [...records];
  const descendants = new Set<string>();
  const reachable = new Set<string>([rootAgentId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of all) {
      if (descendants.has(record.id) || !reachable.has(record.parentAgentId)) {
        continue;
      }
      descendants.add(record.id);
      reachable.add(record.id);
      changed = true;
    }
  }
  return descendants;
}

// Idempotent convergence of a live (node-only) and a file record for the same id.
// nativeRef uses defined-wins/coalesce, never a bare last-writer-wins: an
// out-of-order live half-node (no ref) must NOT erase the ref the file filled
// (seam A red-team tightening ①). status is adopted from `next` — it was already
// recomputed upstream by deriveObservedNodeStatus against persistent signals, so
// merge never re-decides or stale-holds it (seam B red-team tightening ②).
export function mergeObservedNodeRecord(
  prev: ObservedNodeSnapshot | null,
  next: ObservedNodeSnapshot,
): ObservedNodeSnapshot {
  if (!prev) {
    return next;
  }
  const nativeRef = next.nativeRef ?? prev.nativeRef;
  return {
    id: next.id,
    parentAgentId: next.parentAgentId || prev.parentAgentId,
    title: next.title || prev.title,
    status: next.status,
    ...(nativeRef ? { nativeRef } : {}),
  };
}

// Slices a freshly-read chunk into COMPLETE lines only, advancing a byte offset
// past them: a half-written trailing line is left for the next read (no mis-slice),
// and the offset is counted by UTF-8 byte length so it stays exact across
// multi-byte characters (no dupes, no gaps) — the basis of lossless incremental tail.
export function incrementalTailSlice(
  prevOffset: number,
  chunk: string,
): { lines: string[]; nextOffset: number } {
  const lastNewline = chunk.lastIndexOf("\n");
  if (lastNewline === -1) {
    return { lines: [], nextOffset: prevOffset };
  }
  const consumed = chunk.slice(0, lastNewline + 1);
  const lines = consumed.split(/\r?\n/).filter((line) => line.length > 0);
  return { lines, nextOffset: prevOffset + Buffer.byteLength(consumed, "utf8") };
}
