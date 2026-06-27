import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createTestLogger } from "../../../../test-utils/test-logger.js";
import { ClaudeAgentClient } from "./agent.js";
import { claudeProjectDirSync } from "./project-dir.js";

// An observed Claude sub-agent loads its read-only timeline from its OWN native
// transcript (subagents/agent-<id>.jsonl) — the whole file is this child's
// conversation, read verbatim through the same converter as the main timeline.
// This is the TIMELINE channel's single source (no isSidechain filtering, no
// second writer).
describe("Claude observed sub-agent history", () => {
  let tempRoot: string;
  let cwd: string;
  let configDir: string;
  let previousConfigDir: string | undefined;
  const rootSessionId = "root-session-abc";
  const agentId = "a09f860045e052924";

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "claude-observed-history-"));
    cwd = path.join(tempRoot, "repo");
    configDir = path.join(tempRoot, "claude-config");
    mkdirSync(cwd, { recursive: true });

    const projectDir = claudeProjectDirSync(cwd, { configDir });
    const subagentsDir = path.join(projectDir, rootSessionId, "subagents");
    mkdirSync(subagentsDir, { recursive: true });
    writeFileSync(
      path.join(subagentsDir, `agent-${agentId}.jsonl`),
      [
        // The child sub-agent's own turn: prose + a tool call.
        JSON.stringify({
          type: "assistant",
          isSidechain: true,
          agentId,
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "我来查一下北京今天的天气。" },
              {
                type: "tool_use",
                id: "sub-search-1",
                name: "WebSearch",
                input: { query: "北京 天气 今天" },
              },
            ],
          },
        }),
        // The child's tool result.
        JSON.stringify({
          type: "user",
          isSidechain: true,
          agentId,
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "sub-search-1",
                content: "晴，24–31°C",
                is_error: false,
              },
            ],
          },
        }),
      ].join("\n"),
      "utf8",
    );

    previousConfigDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    if (previousConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousConfigDir;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("loads the sub-agent's own transcript as a full timeline (prose + tool call + result)", async () => {
    const client = new ClaudeAgentClient({
      logger: createTestLogger(),
      resolveBinary: async () => "/test/claude/bin",
    });

    const timeline = await client.loadObservedSubAgentHistory({
      nativeRef: { rootSessionId, agentId },
      cwd,
    });

    // Prose mirrored as assistant_message (same shape as the main timeline).
    const prose = timeline.find(
      (item) => item.type === "assistant_message" && item.text.includes("北京今天的天气"),
    );
    expect(prose).toBeDefined();

    // The child's tool call and its result both surfaced.
    const running = timeline.find(
      (item) => item.type === "tool_call" && item.name === "WebSearch" && item.status === "running",
    );
    expect(running).toBeDefined();
    const completed = timeline.find(
      (item) =>
        item.type === "tool_call" && item.name === "WebSearch" && item.status === "completed",
    );
    expect(completed).toBeDefined();
  });

  test("returns [] when the sub-agent transcript is not on disk yet (seam A: ref filled before file)", async () => {
    const client = new ClaudeAgentClient({
      logger: createTestLogger(),
      resolveBinary: async () => "/test/claude/bin",
    });

    const timeline = await client.loadObservedSubAgentHistory({
      nativeRef: { rootSessionId, agentId: "agent-not-written-yet" },
      cwd,
    });

    expect(timeline).toEqual([]);
  });
});
