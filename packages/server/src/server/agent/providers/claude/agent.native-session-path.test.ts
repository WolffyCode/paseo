import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createTestLogger } from "../../../../test-utils/test-logger.js";
import { ClaudeAgentClient } from "./agent.js";
import { claudeProjectDirSync } from "./project-dir.js";

const SESSION_ID = "8f1c2e4a-0000-4000-8000-000000000001";

describe("Claude native session path", () => {
  let root: string;
  let configDir: string;
  let cwd: string;
  let client: ClaudeAgentClient;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "claude-native-session-path-")));
    configDir = join(root, "claude-config");
    cwd = join(root, "project");
    mkdirSync(cwd, { recursive: true });
    client = new ClaudeAgentClient({
      logger: createTestLogger(),
      runtimeSettings: { env: { CLAUDE_CONFIG_DIR: configDir } },
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeTranscript(projectDir: string): string {
    mkdirSync(projectDir, { recursive: true });
    const transcriptPath = join(projectDir, `${SESSION_ID}.jsonl`);
    writeFileSync(transcriptPath, "{}\n");
    return transcriptPath;
  }

  test("resolves the transcript in the configured Claude directory for the session cwd", async () => {
    const transcriptPath = writeTranscript(claudeProjectDirSync(cwd, { configDir }));

    await expect(
      client.resolveNativeSessionPath({
        provider: "claude",
        sessionId: SESSION_ID,
        nativeHandle: SESSION_ID,
        metadata: { cwd },
      }),
    ).resolves.toBe(transcriptPath);
  });

  test("resolves a transcript that Claude kept under another project folder", async () => {
    const transcriptPath = writeTranscript(join(configDir, "projects", "-moved-project"));

    await expect(
      client.resolveNativeSessionPath({
        provider: "claude",
        sessionId: SESSION_ID,
        metadata: { cwd },
      }),
    ).resolves.toBe(transcriptPath);
  });

  test("has no transcript path without the session working directory", async () => {
    writeTranscript(claudeProjectDirSync(cwd, { configDir }));

    await expect(
      client.resolveNativeSessionPath({ provider: "claude", sessionId: SESSION_ID }),
    ).resolves.toBeNull();
  });
});
