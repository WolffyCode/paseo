import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { findCodexRolloutPath } from "./rollout-path.js";

function threadIdCreatedAt(createdAtMs: number): string {
  const timestampHex = createdAtMs.toString(16).padStart(12, "0");
  return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8)}-7a83-b8d6-efd4ff86f123`;
}

const THREAD_ID = threadIdCreatedAt(Date.parse("2026-10-14T00:30:00.000Z"));
const LEGACY_THREAD_ID = "5973e5d8-91b4-4b07-9a5e-2f7e0a3c6d11";

describe("findCodexRolloutPath", () => {
  let codexHome: string;

  beforeEach(() => {
    codexHome = mkdtempSync(join(tmpdir(), "codex-rollout-path-"));
  });

  afterEach(() => {
    rmSync(codexHome, { recursive: true, force: true });
  });

  function writeRollout(relativeDirectory: string, fileName: string): string {
    const directory = join(codexHome, relativeDirectory);
    mkdirSync(directory, { recursive: true });
    const rolloutPath = join(directory, fileName);
    writeFileSync(rolloutPath, "{}\n");
    return rolloutPath;
  }

  test("finds the rollout in the day directory of the thread's creation", async () => {
    writeRollout("sessions/2026/10/14", "rollout-2026-10-14T08-30-00-other-thread.jsonl");
    const rolloutPath = writeRollout(
      "sessions/2026/10/14",
      `rollout-2026-10-14T08-30-00-${THREAD_ID}.jsonl`,
    );

    await expect(findCodexRolloutPath({ codexHome, threadId: THREAD_ID })).resolves.toBe(
      rolloutPath,
    );
  });

  test("finds a rollout dated by a host behind UTC", async () => {
    const rolloutPath = writeRollout(
      "sessions/2026/10/13",
      `rollout-2026-10-13T17-30-00-${THREAD_ID}.jsonl`,
    );

    await expect(findCodexRolloutPath({ codexHome, threadId: THREAD_ID })).resolves.toBe(
      rolloutPath,
    );
  });

  test("finds a rollout Codex compressed", async () => {
    const rolloutPath = writeRollout(
      "sessions/2026/10/14",
      `rollout-2026-10-14T08-30-00-${THREAD_ID}.jsonl.zst`,
    );

    await expect(findCodexRolloutPath({ codexHome, threadId: THREAD_ID })).resolves.toBe(
      rolloutPath,
    );
  });

  test("finds an archived rollout", async () => {
    const rolloutPath = writeRollout(
      "archived_sessions",
      `rollout-2026-10-14T08-30-00-${THREAD_ID}.jsonl.zst`,
    );

    await expect(findCodexRolloutPath({ codexHome, threadId: THREAD_ID })).resolves.toBe(
      rolloutPath,
    );
  });

  test("finds an archived rollout for a thread id without a creation time", async () => {
    writeRollout("sessions/2025/06/01", `rollout-2025-06-01T10-00-00-${LEGACY_THREAD_ID}.jsonl`);
    const rolloutPath = writeRollout(
      "archived_sessions",
      `rollout-2025-06-01T10-00-00-${LEGACY_THREAD_ID}.jsonl`,
    );

    await expect(findCodexRolloutPath({ codexHome, threadId: LEGACY_THREAD_ID })).resolves.toBe(
      rolloutPath,
    );
  });

  test("returns null when Codex has no rollout for the thread", async () => {
    writeRollout("sessions/2026/10/20", `rollout-2026-10-20T08-30-00-${THREAD_ID}.jsonl`);

    await expect(findCodexRolloutPath({ codexHome, threadId: THREAD_ID })).resolves.toBeNull();
  });

  test("returns null when the Codex home does not exist", async () => {
    await expect(
      findCodexRolloutPath({ codexHome: join(codexHome, "missing"), threadId: THREAD_ID }),
    ).resolves.toBeNull();
  });
});
