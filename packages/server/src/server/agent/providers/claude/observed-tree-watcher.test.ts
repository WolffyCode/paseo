import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AgentTimelineItem, ObservedTreeEvent } from "../../agent-sdk-types.js";
import { loadObservedSubAgentTree, watchObservedSubAgentTree } from "./observed-tree-watcher.js";

const ROOT_SESSION_ID = "root-sess";
const ROOT_AGENT_ID = "root-agent";

// Each test gets a throwaway project dir; resolveProjectDir is injected so the
// watcher reads exactly this tree (no dependency on ~/.claude path encoding).
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

function setupTree(): {
  projectDir: string;
  subagentsDir: string;
  rootTranscript: string;
  resolveProjectDir: () => string;
} {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "observed-tree-"));
  cleanups.push(() => fs.rmSync(projectDir, { recursive: true, force: true }));
  const subagentsDir = path.join(projectDir, ROOT_SESSION_ID, "subagents");
  fs.mkdirSync(subagentsDir, { recursive: true });
  const rootTranscript = path.join(projectDir, `${ROOT_SESSION_ID}.jsonl`);
  return { projectDir, subagentsDir, rootTranscript, resolveProjectDir: () => projectDir };
}

function taskToolUse(id: string): Record<string, unknown> {
  return {
    type: "assistant",
    message: { role: "assistant", content: [{ type: "tool_use", id, name: "Task", input: {} }] },
  };
}
function assistantText(text: string, agentId: string): Record<string, unknown> {
  return {
    type: "assistant",
    isSidechain: true,
    agentId,
    message: { role: "assistant", content: [{ type: "text", text }] },
  };
}
function writeJsonl(file: string, records: Record<string, unknown>[]): void {
  fs.writeFileSync(file, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
}
function writeMeta(dir: string, agentId: string, meta: Record<string, unknown>): void {
  fs.writeFileSync(path.join(dir, `agent-${agentId}.meta.json`), JSON.stringify(meta));
}

// A trivial convert so timeline_item emission is observable without pulling the
// full Claude session converter (which is injected for real in agent.ts).
function convertEntry(entry: Record<string, unknown>): AgentTimelineItem[] {
  const message = entry.message as { content?: unknown } | undefined;
  const blocks = Array.isArray(message?.content) ? message.content : [];
  const out: AgentTimelineItem[] = [];
  for (const block of blocks) {
    if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
      out.push({
        type: "assistant_message",
        text: String((block as { text?: string }).text ?? ""),
      });
    }
  }
  return out;
}

const baseRef = (rootIsActive: boolean) => ({
  rootSessionId: ROOT_SESSION_ID,
  cwd: "/irrelevant",
  rootAgentId: ROOT_AGENT_ID,
  rootIsActive,
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await delay(15);
  }
  throw new Error("waitFor timed out");
}

describe("loadObservedSubAgentTree", () => {
  it("scans a depth-2 subtree into correctly-nested flat nodes", async () => {
    const tree = setupTree();
    writeJsonl(tree.rootTranscript, [taskToolUse("toolu_X")]);
    writeJsonl(path.join(tree.subagentsDir, "agent-X.jsonl"), [taskToolUse("toolu_Z")]);
    writeMeta(tree.subagentsDir, "X", {
      description: "child",
      toolUseId: "toolu_X",
      spawnDepth: 1,
    });
    writeJsonl(path.join(tree.subagentsDir, "agent-Z.jsonl"), [assistantText("hi", "Z")]);
    writeMeta(tree.subagentsDir, "Z", {
      description: "grandchild",
      toolUseId: "toolu_Z",
      spawnDepth: 2,
    });

    const nodes = await loadObservedSubAgentTree({
      ref: baseRef(false),
      resolveProjectDir: tree.resolveProjectDir,
    });

    const byId = new Map(nodes.map((node) => [node.id, node]));
    expect(byId.get("observed:toolu_X")?.parentAgentId).toBe(ROOT_AGENT_ID);
    expect(byId.get("observed:toolu_Z")?.parentAgentId).toBe("observed:toolu_X");
    expect(byId.get("observed:toolu_X")?.nativeRef).toEqual({
      rootSessionId: ROOT_SESSION_ID,
      agentId: "X",
    });
  });

  it("returns [] when the subagents directory does not exist (bootstrap-safe)", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "observed-empty-"));
    cleanups.push(() => fs.rmSync(projectDir, { recursive: true, force: true }));
    const nodes = await loadObservedSubAgentTree({
      ref: baseRef(false),
      resolveProjectDir: () => projectDir,
    });
    expect(nodes).toEqual([]);
  });
});

describe("watchObservedSubAgentTree", () => {
  it("does not throw or watch when the subagents directory is missing (seam C bootstrap guard)", () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "observed-missing-"));
    cleanups.push(() => fs.rmSync(projectDir, { recursive: true, force: true }));
    const unsubscribe = watchObservedSubAgentTree({
      ref: baseRef(true),
      onEvent: () => {},
      resolveProjectDir: () => projectDir,
      convertEntry,
    });
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("emits a node event when a new subagent file appears", async () => {
    const tree = setupTree();
    writeJsonl(tree.rootTranscript, [taskToolUse("toolu_X")]);
    const events: ObservedTreeEvent[] = [];
    const unsubscribe = watchObservedSubAgentTree({
      ref: baseRef(true),
      onEvent: (event) => events.push(event),
      resolveProjectDir: tree.resolveProjectDir,
      convertEntry,
    });
    cleanups.push(unsubscribe);
    // Let fs.watch finish attaching before the new file appears — attach has a
    // small OS-level latency, and without this the rename can fire before the
    // watch is ready (flaky only under concurrent test workers).
    await delay(50);

    writeMeta(tree.subagentsDir, "X", {
      description: "child",
      toolUseId: "toolu_X",
      spawnDepth: 1,
    });
    writeJsonl(path.join(tree.subagentsDir, "agent-X.jsonl"), [assistantText("working", "X")]);

    const findNodeX = () =>
      events.find((event) => event.kind === "node" && event.node.id === "observed:toolu_X");
    await waitFor(() => findNodeX() !== undefined);
    expect(findNodeX()).toBeDefined();
  });

  it("reflects a newly-written child line into a timeline_item in well under 1s (chairman <1s hard requirement)", async () => {
    const tree = setupTree();
    writeJsonl(tree.rootTranscript, [taskToolUse("toolu_X")]);
    writeMeta(tree.subagentsDir, "X", {
      description: "child",
      toolUseId: "toolu_X",
      spawnDepth: 1,
    });
    const agentFile = path.join(tree.subagentsDir, "agent-X.jsonl");
    writeJsonl(agentFile, [assistantText("first", "X")]);

    const timelineItems: { at: number; nodeId: string }[] = [];
    const unsubscribe = watchObservedSubAgentTree({
      ref: baseRef(true),
      onEvent: (event) => {
        if (event.kind === "timeline_item") {
          timelineItems.push({ at: Date.now(), nodeId: event.nodeId });
        }
      },
      resolveProjectDir: tree.resolveProjectDir,
      convertEntry,
    });
    cleanups.push(unsubscribe);

    // Let the watcher attach + settle the initial scan offset.
    await delay(150);

    const writtenAt = Date.now();
    fs.appendFileSync(agentFile, `${JSON.stringify(assistantText("second", "X"))}\n`);

    await waitFor(() => timelineItems.length > 0);
    const latency = timelineItems[0].at - writtenAt;
    expect(timelineItems[0].nodeId).toBe("observed:toolu_X");
    expect(latency).toBeLessThan(1000);
  });

  it("does not re-emit already-tailed lines on a later flush (offset monotonic, no dupes)", async () => {
    const tree = setupTree();
    writeJsonl(tree.rootTranscript, [taskToolUse("toolu_X")]);
    writeMeta(tree.subagentsDir, "X", {
      description: "child",
      toolUseId: "toolu_X",
      spawnDepth: 1,
    });
    const agentFile = path.join(tree.subagentsDir, "agent-X.jsonl");
    writeJsonl(agentFile, [assistantText("first", "X")]);

    const texts: string[] = [];
    const unsubscribe = watchObservedSubAgentTree({
      ref: baseRef(true),
      onEvent: (event) => {
        if (event.kind === "timeline_item" && event.item.type === "assistant_message") {
          texts.push(event.item.text);
        }
      },
      resolveProjectDir: tree.resolveProjectDir,
      convertEntry,
    });
    cleanups.push(unsubscribe);
    await delay(150);

    fs.appendFileSync(agentFile, `${JSON.stringify(assistantText("second", "X"))}\n`);
    await waitFor(() => texts.includes("second"));
    fs.appendFileSync(agentFile, `${JSON.stringify(assistantText("third", "X"))}\n`);
    await waitFor(() => texts.includes("third"));

    expect(texts.filter((text) => text === "second")).toHaveLength(1);
    expect(texts.filter((text) => text === "first")).toHaveLength(0);
  });
});
