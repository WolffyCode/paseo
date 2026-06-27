import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createTestLogger } from "../../../../test-utils/test-logger.js";
import { ClaudeAgentClient } from "./agent.js";
import { claudeProjectDirSync } from "./project-dir.js";

// After restart, an observed Claude sub-agent loads its history read-only from
// the parent transcript: only the sidechain (sub-agent) entries, converted
// through the same path as the main timeline (prose + tool calls + results).
describe("Claude observed sub-agent history", () => {
  let tempRoot: string;
  let cwd: string;
  let configDir: string;
  let previousConfigDir: string | undefined;
  const childSessionId = "child-session-abc";

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "claude-observed-history-"));
    cwd = path.join(tempRoot, "repo");
    configDir = path.join(tempRoot, "claude-config");
    mkdirSync(cwd, { recursive: true });

    const historyDir = claudeProjectDirSync(cwd, { configDir });
    mkdirSync(historyDir, { recursive: true });
    writeFileSync(
      path.join(historyDir, `${childSessionId}.jsonl`),
      [
        // Parent (non-sidechain) noise — must be skipped by the observed reader.
        JSON.stringify({
          type: "assistant",
          sessionId: childSessionId,
          cwd,
          message: { role: "assistant", content: "PARENT_NOISE_SHOULD_BE_SKIPPED" },
        }),
        // The child sub-agent's own turn: prose + a tool call.
        JSON.stringify({
          type: "assistant",
          isSidechain: true,
          sessionId: childSessionId,
          cwd,
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
          sessionId: childSessionId,
          cwd,
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

  test("loads only the sidechain entries as a full timeline (prose + tool call + result)", async () => {
    const client = new ClaudeAgentClient({
      logger: createTestLogger(),
      resolveBinary: async () => "/test/claude/bin",
    });

    const timeline = await client.loadObservedSubAgentHistory({ sessionId: childSessionId, cwd });

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

    // Parent (non-sidechain) entries are excluded.
    const leakedParent = timeline.some(
      (item) => item.type === "assistant_message" && item.text.includes("PARENT_NOISE"),
    );
    expect(leakedParent).toBe(false);
  });
});
