import { test, expect } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DaemonClient } from "./test-utils/index.js";
import { createTestPaseoDaemon } from "./test-utils/paseo-daemon.js";
import { createTestAgentClients } from "./test-utils/fake-agent-client.js";

// workspace.create has four reject branches before it ever touches the
// registries; this pins each one's errorCode (or, for project-not-found, its
// message) as seen by the daemon client, so the CLI/app contract on top of them
// stays covered.
test("workspace.create surfaces each early-reject error branch", async () => {
  const daemon = await createTestPaseoDaemon();
  const missingDir = path.join(tmpdir(), `paseo-workspace-create-missing-${Date.now()}`);
  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.1.82",
  });

  try {
    await client.connect();

    // directory source pointed at a path that does not exist -> directory_not_found
    const directoryNotFound = await client.createWorkspace({
      source: { kind: "directory", path: missingDir },
    });
    expect(directoryNotFound.workspace).toBeNull();
    expect(directoryNotFound.errorCode).toBe("directory_not_found");
    expect(directoryNotFound.error).toContain(missingDir);

    // worktree source without a cwd or projectId -> source_required
    const sourceRequired = await client.createWorkspace({
      source: { kind: "worktree", worktreeSlug: "feat" },
    });
    expect(sourceRequired.workspace).toBeNull();
    expect(sourceRequired.errorCode).toBe("source_required");

    // worktree source with an unknown projectId -> project-not-found message
    // (surfaced via the generic catch, so it carries an error but no errorCode)
    const projectNotFound = await client.createWorkspace({
      source: { kind: "worktree", projectId: "proj-does-not-exist", worktreeSlug: "feat" },
    });
    expect(projectNotFound.workspace).toBeNull();
    expect(projectNotFound.error).toContain("Project not found: proj-does-not-exist");
  } finally {
    await client.close().catch(() => undefined);
    await daemon.close();
    rmSync(missingDir, { recursive: true, force: true });
  }
}, 180000);

test("a failed chat agent launch does not leave an active empty chat and a fresh retry succeeds", async () => {
  let fail = true;
  const daemon = await createTestPaseoDaemon({
    agentClients: createTestAgentClients({
      beforeCreateSession: async () => {
        if (fail) throw new Error("Provider startup failed");
      },
    }),
  });
  const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws` });
  try {
    await client.connect();
    const input: Parameters<DaemonClient["createWorkspace"]>[0] = {
      source: { kind: "chat" },
      agent: { config: { provider: "claude", cwd: "." }, initialPrompt: "Start a chat" },
    };
    const failed = await client.createWorkspace({ ...input, idempotencyKey: "failed-chat" });
    expect(failed.error).toContain("Provider startup failed");
    expect(
      (await client.fetchWorkspaces()).entries.filter((entry) => entry.purpose === "chat"),
    ).toHaveLength(0);
    fail = false;
    const retried = await client.createWorkspace({ ...input, idempotencyKey: "failed-chat" });
    expect(retried.error).toBeNull();
    expect(retried.agent?.cwd).toBe(retried.workspace?.workspaceDirectory);
    expect(
      (await client.fetchWorkspaces()).entries.filter((entry) => entry.purpose === "chat"),
    ).toHaveLength(1);
  } finally {
    await client.close();
    await daemon.close();
  }
}, 180000);

test("independent chat records survive a daemon restart with their identity and name", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "chat-restart-"));
  const firstDaemon = await createTestPaseoDaemon({ paseoHomeRoot: root, cleanup: false });
  const firstClient = new DaemonClient({ url: `ws://127.0.0.1:${firstDaemon.port}/ws` });
  try {
    await firstClient.connect();
    const created = await firstClient.createWorkspace({
      source: { kind: "chat" },
      title: "Persisted conversation",
    });
    expect(created.error).toBeNull();
    await firstClient.close();
    await firstDaemon.close();
    const restarted = await createTestPaseoDaemon({ paseoHomeRoot: root });
    const client = new DaemonClient({ url: `ws://127.0.0.1:${restarted.port}/ws` });
    try {
      await client.connect();
      const chats = (await client.fetchWorkspaces()).entries.filter(
        (entry) => entry.purpose === "chat",
      );
      expect(chats).toHaveLength(1);
      expect(chats[0]).toMatchObject({
        id: created.workspace?.id,
        name: "Persisted conversation",
        workspaceKind: "directory",
        purpose: "chat",
      });
    } finally {
      await client.close();
      await restarted.close();
    }
  } finally {
    await firstClient.close();
    await firstDaemon.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 180000);

test("independent chats allocate distinct private directories without a project or Git checkout", async () => {
  const daemon = await createTestPaseoDaemon();
  const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws` });
  try {
    await client.connect();
    const first = await client.createWorkspace({
      source: { kind: "chat" },
      title: "Architecture discussion",
    });
    const second = await client.createWorkspace({
      source: { kind: "chat" },
      title: "Writing ideas",
    });
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.workspace?.purpose).toBe("chat");
    expect(second.workspace?.purpose).toBe("chat");
    expect(first.workspace?.id).not.toBe(second.workspace?.id);
    expect(first.workspace?.workspaceDirectory).toBe(
      path.join(daemon.paseoHome, "chats", first.workspace!.id),
    );
    expect(existsSync(path.join(first.workspace!.workspaceDirectory!, ".git"))).toBe(false);
    expect(first.workspace?.workspaceKind).toBe("directory");
    const project = (await client.listProjects()).projects.find(
      (entry) => entry.projectId === first.workspace!.projectId,
    );
    expect(project?.purpose).toBe("chat");
    await client.setWorkspaceTitle(first.workspace!.id, "Renamed discussion");
    const renamed = (await client.fetchWorkspaces()).entries.find(
      (entry) => entry.id === first.workspace!.id,
    );
    expect(renamed?.name).toBe("Renamed discussion");
    await client.archiveWorkspace(first.workspace!.id);
    const remaining = (await client.fetchWorkspaces()).entries.filter(
      (entry) => entry.purpose === "chat",
    );
    expect(remaining.map((entry) => entry.id)).toEqual([second.workspace!.id]);
    expect(existsSync(second.workspace!.workspaceDirectory!)).toBe(true);
  } finally {
    await client.close();
    await daemon.close();
  }
}, 180000);

test("chat creation retries reuse one allocation and initial agents cannot redirect its directory", async () => {
  const daemon = await createTestPaseoDaemon();
  const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws` });
  try {
    await client.connect();
    const input: Parameters<DaemonClient["createWorkspace"]>[0] = {
      source: { kind: "chat" },
      title: "One conversation",
      idempotencyKey: "chat-allocation-retry",
      agent: {
        config: { provider: "claude", cwd: "/caller-selected-project" },
        initialPrompt: "Hello",
        clientMessageId: "chat-message",
      },
    };
    const first = await client.createWorkspace(input);
    const replay = await client.createWorkspace(input);
    expect(first.error).toBeNull();
    expect(replay.workspace?.id).toBe(first.workspace?.id);
    expect(replay.agent?.id).toBe(first.agent?.id);
    expect(first.agent?.cwd).toBe(first.workspace?.workspaceDirectory);
    expect(
      (await client.fetchWorkspaces()).entries.filter((entry) => entry.purpose === "chat"),
    ).toHaveLength(1);
  } finally {
    await client.close();
    await daemon.close();
  }
}, 180000);

test("workspace creation replay rejects a checkout removed after completion", async () => {
  const daemon = await createTestPaseoDaemon();
  const directory = mkdtempSync(path.join(tmpdir(), "workspace-replay-"));
  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.1.82",
  });
  try {
    await client.connect();
    const request = {
      source: { kind: "directory" as const, path: directory },
      idempotencyKey: "removed-checkout",
    };
    const created = await client.createWorkspace(request);
    expect(created.error).toBeNull();
    expect(created.workspace).not.toBeNull();
    rmSync(directory, { recursive: true, force: true });
    const replayed = await client.createWorkspace(request);
    expect(replayed.workspace).toBeNull();
    expect(replayed.errorCode).toBe("directory_not_found");
  } finally {
    await client.close().catch(() => undefined);
    await daemon.close();
    rmSync(directory, { recursive: true, force: true });
  }
}, 180000);
