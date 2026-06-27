// Claude fs-boundary compat layer for the observed subagent tree. Locates a root
// session's native subagents/ directory, scans it into flat node snapshots, and
// watches it for near-real-time growth — feeding the pure core in observed-tree.ts
// and never re-implementing parsing/convert (those are injected/reused). This is
// where the chairman's "<1s child-text latency" bound is constructed: fs.watch
// fires on OS file events (immediate) and a small debounce (OBSERVED_TREE_FLUSH_MS)
// coalesces bursts, so a written child line surfaces as a timeline_item within a
// couple hundred ms — verified end-to-end in observed-tree-watcher.test.ts.

import fs from "node:fs";
import path from "node:path";

import type {
  AgentTimelineItem,
  ObservedNodeSnapshot,
  ObservedSubtreeRef,
  ObservedTreeEvent,
  ObservedTreeUnsubscribe,
} from "../../agent-sdk-types.js";
import { observedSubAgentId } from "../../observed-sub-agents.js";
import {
  buildToolUseOwnerIndex,
  incrementalTailSlice,
  mergeObservedNodeRecord,
  resolveObservedNode,
  type SubagentMeta,
} from "./observed-tree.js";

// Debounce window after an fs.watch event before re-reading. Small enough that the
// end-to-end child-text latency stays a couple hundred ms (well under the 1s hard
// bound), large enough to coalesce the burst of events one append produces.
export const OBSERVED_TREE_FLUSH_MS = 120;

const AGENT_FILE_PATTERN = /^agent-(.+)\.jsonl$/;

export interface LoadObservedSubAgentTreeInput {
  ref: ObservedSubtreeRef;
  resolveProjectDir: (cwd: string) => string;
}

export interface WatchObservedSubAgentTreeInput {
  ref: ObservedSubtreeRef;
  onEvent: (event: ObservedTreeEvent) => void;
  resolveProjectDir: (cwd: string) => string;
  // Reuses the provider's existing transcript->timeline converter (never rewritten
  // here). Injected by ClaudeAgentClient from a throwaway session.
  convertEntry: (entry: Record<string, unknown>) => AgentTimelineItem[];
  flushDelayMs?: number;
}

interface ObservedSubtreePaths {
  rootTranscript: string;
  subagentsDir: string;
}

// The two native locations for a root session: its own transcript (where direct
// children's Task tool_use/tool_result + task_notification live) and the flat
// subagents/ directory (one agent-<id>.jsonl per sub-agent, all depths).
function resolveSubtreePaths(
  ref: ObservedSubtreeRef,
  resolveProjectDir: (cwd: string) => string,
): ObservedSubtreePaths {
  const projectDir = resolveProjectDir(ref.cwd);
  return {
    rootTranscript: path.join(projectDir, `${ref.rootSessionId}.jsonl`),
    subagentsDir: path.join(projectDir, ref.rootSessionId, "subagents"),
  };
}

function readFileSafe(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

// Parses whole-file jsonl text into records, skipping blank/corrupt lines so a
// half-written tail line never throws.
function parseJsonlText(text: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        records.push(parsed as Record<string, unknown>);
      }
    } catch {
      // skip a corrupt / partially-written line
    }
  }
  return records;
}

// Reads agent-<id>.meta.json (the SDK writes agentType/description/toolUseId/
// spawnDepth) into SubagentMeta. toolUseId is required — without it the node has
// no identity/owner key, so the file is skipped.
function readMeta(subagentsDir: string, agentId: string): SubagentMeta | null {
  const text = readFileSafe(path.join(subagentsDir, `agent-${agentId}.meta.json`));
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const toolUseId = parsed.toolUseId;
    if (typeof toolUseId !== "string" || toolUseId.length === 0) {
      return null;
    }
    return {
      toolUseId,
      ...(typeof parsed.agentType === "string" ? { agentType: parsed.agentType } : {}),
      ...(typeof parsed.description === "string" ? { description: parsed.description } : {}),
      ...(typeof parsed.spawnDepth === "number" ? { spawnDepth: parsed.spawnDepth } : {}),
    };
  } catch {
    return null;
  }
}

function listAgentIds(subagentsDir: string): string[] {
  try {
    return fs
      .readdirSync(subagentsDir)
      .map((name) => AGENT_FILE_PATTERN.exec(name)?.[1])
      .filter((id): id is string => Boolean(id));
  } catch {
    return [];
  }
}

// Reads only the bytes after `offset` to EOF. Byte-level (not whole-file) so an
// established tree of many files stays cheap; a half multi-byte char at EOF is
// harmless because incrementalTailSlice keeps the trailing partial line for the
// next read.
function readNewBytes(file: string, offset: number): string {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    if (size <= offset) {
      return "";
    }
    const length = size - offset;
    const buffer = Buffer.allocUnsafe(length);
    fs.readSync(fd, buffer, 0, length, offset);
    return buffer.toString("utf8");
  } catch {
    return "";
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }
}

function sameNativeRef(a: ObservedNodeSnapshot, b: ObservedNodeSnapshot): boolean {
  return a.nativeRef?.agentId === b.nativeRef?.agentId;
}

// One synchronous structural scan of a root's whole subtree into flat nodes. Shared
// by the one-shot loader and the watcher's initial scan. Pure read; returns [] when
// there is no subtree yet (bootstrap-safe).
function scanObservedTree(
  ref: ObservedSubtreeRef,
  resolveProjectDir: (cwd: string) => string,
): ObservedNodeSnapshot[] {
  const paths = resolveSubtreePaths(ref, resolveProjectDir);
  if (!fs.existsSync(paths.subagentsDir)) {
    return [];
  }
  const metaByAgentId = new Map<string, SubagentMeta>();
  const agentRecordsByAgentId = new Map<string, Record<string, unknown>[]>();
  for (const agentId of listAgentIds(paths.subagentsDir)) {
    const meta = readMeta(paths.subagentsDir, agentId);
    if (!meta) {
      continue;
    }
    metaByAgentId.set(agentId, meta);
    agentRecordsByAgentId.set(
      agentId,
      parseJsonlText(readFileSafe(path.join(paths.subagentsDir, `agent-${agentId}.jsonl`))),
    );
  }
  const { owners } = buildToolUseOwnerIndex({
    rootRecords: parseJsonlText(readFileSafe(paths.rootTranscript)),
    agentRecordsByAgentId,
  });
  const rootIsActive = ref.rootIsActive ?? false;
  const nodes: ObservedNodeSnapshot[] = [];
  for (const [agentId, meta] of metaByAgentId) {
    nodes.push(
      resolveObservedNode({
        agentId,
        meta,
        ownerIndex: owners,
        metaByAgentId,
        rootAgentId: ref.rootAgentId,
        rootSessionId: ref.rootSessionId,
        rootIsActive,
      }),
    );
  }
  return nodes;
}

// One-shot scan of a root's observed subtree (restart / history open). Pure read,
// no watch. Async by contract; the scan itself is a cheap synchronous disk read.
export function loadObservedSubAgentTree(
  input: LoadObservedSubAgentTreeInput,
): Promise<ObservedNodeSnapshot[]> {
  return Promise.resolve(scanObservedTree(input.ref, input.resolveProjectDir));
}

// Live watcher for one active root: an initial scan (node events, offsets parked at
// EOF) then fs.watch on the subagents dir + root transcript, debounced into an
// incremental flush. The flush re-tails changed files for the structural index
// (parent/status of EVERY active file, opened or not — seam E) and emits a
// timeline_item per newly-tailed child line. Holds the root's node set so node
// diffs are emitted only on real change.
class ObservedTreeWatcher {
  private readonly ref: ObservedSubtreeRef;
  private readonly paths: ObservedSubtreePaths;
  private readonly onEvent: (event: ObservedTreeEvent) => void;
  private readonly convertEntry: (entry: Record<string, unknown>) => AgentTimelineItem[];
  private readonly flushDelayMs: number;

  private readonly offsets = new Map<string, number>();
  private readonly metaByAgentId = new Map<string, SubagentMeta>();
  private readonly agentRecords = new Map<string, Record<string, unknown>[]>();
  private rootRecords: Record<string, unknown>[] = [];
  private readonly nodes = new Map<string, ObservedNodeSnapshot>();

  private dirWatcher: fs.FSWatcher | null = null;
  private rootWatcher: fs.FSWatcher | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(input: WatchObservedSubAgentTreeInput) {
    this.ref = input.ref;
    this.onEvent = input.onEvent;
    this.convertEntry = input.convertEntry;
    this.flushDelayMs = input.flushDelayMs ?? OBSERVED_TREE_FLUSH_MS;
    this.paths = resolveSubtreePaths(input.ref, input.resolveProjectDir);
  }

  // Bootstrap: only attach when the directory already exists (seam C — never watch
  // a missing dir / never ENOENT). The manager retries on the next observation.
  start(): void {
    if (!fs.existsSync(this.paths.subagentsDir)) {
      return;
    }
    this.initialScan();
    this.attach();
  }

  dispose(): void {
    this.disposed = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.dirWatcher?.close();
    this.rootWatcher?.close();
    this.dirWatcher = null;
    this.rootWatcher = null;
  }

  // Reads a file whole, parks the offset at EOF, and returns its records. Used for
  // the initial scan so the watcher streams only future growth (the existing
  // timeline is loaded on open via loadObservedSubAgentHistory).
  private primeFile(file: string): Record<string, unknown>[] {
    const text = readFileSafe(file);
    this.offsets.set(file, Buffer.byteLength(text, "utf8"));
    return parseJsonlText(text);
  }

  private initialScan(): void {
    this.rootRecords = this.primeFile(this.paths.rootTranscript);
    for (const agentId of listAgentIds(this.paths.subagentsDir)) {
      this.adoptAgentFile(agentId);
    }
    this.rebuildAndEmitNodes();
  }

  // Registers an agent file (meta + primed records). Returns false when meta is
  // missing/unwritten so the caller retries on the next flush.
  private adoptAgentFile(agentId: string): boolean {
    const meta = readMeta(this.paths.subagentsDir, agentId);
    if (!meta) {
      return false;
    }
    this.metaByAgentId.set(agentId, meta);
    this.agentRecords.set(
      agentId,
      this.primeFile(path.join(this.paths.subagentsDir, `agent-${agentId}.jsonl`)),
    );
    return true;
  }

  private attach(): void {
    try {
      this.dirWatcher = fs.watch(this.paths.subagentsDir, () => this.scheduleFlush());
    } catch {
      // seam C: directory vanished between existsSync and watch — leave unattached.
    }
    try {
      if (fs.existsSync(this.paths.rootTranscript)) {
        this.rootWatcher = fs.watch(this.paths.rootTranscript, () => this.scheduleFlush());
      }
    } catch {
      // root transcript not yet present; node-channel still works off direct-child files.
    }
  }

  private scheduleFlush(): void {
    if (this.disposed || this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushDelayMs);
  }

  // Reads new bytes after the parked offset, slices COMPLETE lines only, advances
  // the offset by their byte length, and returns the parsed new records.
  private tailNewRecords(file: string): Record<string, unknown>[] {
    const prevOffset = this.offsets.get(file) ?? 0;
    const chunk = readNewBytes(file, prevOffset);
    if (!chunk) {
      return [];
    }
    const { lines, nextOffset } = incrementalTailSlice(prevOffset, chunk);
    this.offsets.set(file, nextOffset);
    return parseJsonlText(lines.join("\n"));
  }

  private flush(): void {
    if (this.disposed) {
      return;
    }
    this.rootRecords.push(...this.tailNewRecords(this.paths.rootTranscript));
    for (const agentId of listAgentIds(this.paths.subagentsDir)) {
      if (!this.metaByAgentId.has(agentId)) {
        // A newly-appeared sub-agent: adopt it (offset parked at EOF) — its existing
        // body is loaded on open, its future growth tails from here.
        this.adoptAgentFile(agentId);
        continue;
      }
      const newRecords = this.tailNewRecords(
        path.join(this.paths.subagentsDir, `agent-${agentId}.jsonl`),
      );
      if (newRecords.length === 0) {
        continue;
      }
      this.agentRecords.get(agentId)?.push(...newRecords);
      const nodeId = observedSubAgentId(this.metaByAgentId.get(agentId)?.toolUseId ?? agentId);
      for (const record of newRecords) {
        for (const item of this.convertEntry(record)) {
          this.onEvent({ kind: "timeline_item", nodeId, item });
        }
      }
    }
    this.rebuildAndEmitNodes();
  }

  // Recomputes the owner index over all accumulated records, re-resolves every
  // node, merges idempotently, and emits a node event only when something changed.
  private rebuildAndEmitNodes(): void {
    const { owners } = buildToolUseOwnerIndex({
      rootRecords: this.rootRecords,
      agentRecordsByAgentId: this.agentRecords,
    });
    const rootIsActive = this.ref.rootIsActive ?? true;
    for (const [agentId, meta] of this.metaByAgentId) {
      const next = resolveObservedNode({
        agentId,
        meta,
        ownerIndex: owners,
        metaByAgentId: this.metaByAgentId,
        rootAgentId: this.ref.rootAgentId,
        rootSessionId: this.ref.rootSessionId,
        rootIsActive,
      });
      const prev = this.nodes.get(next.id) ?? null;
      const merged = mergeObservedNodeRecord(prev, next);
      this.nodes.set(merged.id, merged);
      const changed =
        !prev ||
        prev.status !== merged.status ||
        prev.parentAgentId !== merged.parentAgentId ||
        prev.title !== merged.title ||
        !sameNativeRef(prev, merged);
      if (changed) {
        this.onEvent({ kind: "node", node: merged });
      }
    }
  }
}

// Watches a root session's observed subtree and returns an unsubscribe. Bootstrap-
// safe: a missing directory yields a no-op unsubscribe (seam C).
export function watchObservedSubAgentTree(
  input: WatchObservedSubAgentTreeInput,
): ObservedTreeUnsubscribe {
  const watcher = new ObservedTreeWatcher(input);
  watcher.start();
  return () => watcher.dispose();
}
