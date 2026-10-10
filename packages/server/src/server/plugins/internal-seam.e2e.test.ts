import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { DaemonClient } from "../test-utils/daemon-client.js";
import { createTestPaseoDaemon } from "../test-utils/paseo-daemon.js";
import { BuiltinPluginLoader } from "./builtin/index.js";
import { platformManifest, writePlatformPackage } from "./test-fixtures/platform-package.js";
import { filesSettings, writeHostServicePackage } from "./test-fixtures/platform-host-package.js";
import { DAEMON_PERMISSIONS } from "@getpaseo/protocol/messages";

const directory = fileURLToPath(new URL("./test-fixtures/internal-seam/", import.meta.url));
const fixtureRoot = fileURLToPath(new URL("./test-fixtures/", import.meta.url));

test("plugin platform discovery crosses the real client and daemon boundary without executing v1 code", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "paseo-platform-wire-"));
  const manifest = platformManifest();
  manifest.requirements.features = ["unimplemented-capability"];
  await writePlatformPackage({ directory: path.join(root, "files"), manifest });
  const executionMarker = path.join(root, "entry-executed");
  await writeFile(
    path.join(root, "files/index.server.ts"),
    `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(executionMarker)}, "executed");\nexport default function register() { return () => {}; }\n`,
  );
  const daemon = await createTestPaseoDaemon({
    daemonVersion: "0.11.1",
    pluginsEnabled: false,
    builtinPlugins: new BuiltinPluginLoader(root, ["files"]),
    plugins: { external: { source: "directory", path: path.join(root, "files"), enabled: false } },
  });
  const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws` });
  try {
    await client.connect();
    expect(await client.describePluginPlatform()).toEqual({
      apiVersion: "1.0.0",
      definitions: true,
      resolutionPlans: true,
    });
    const catalog = await client.getPluginPlatformCatalog();
    expect(
      catalog.entries.map((entry) => [
        entry.installation.installationId,
        entry.origin,
        entry.enabled,
        entry.diagnostics,
      ]),
    ).toEqual([
      ["external", "configured", false, []],
      ["files", "builtin", true, []],
    ]);
    const plan = await client.planPluginPlatformResolution({
      mode: "one",
      serviceId: "acme.files",
      range: "^1.0.0",
      runtime: "daemon",
      providerScope: "host",
      scope: { kind: "host", serverId: catalog.serverId },
      expectedCatalogRevision: catalog.revision,
    });
    expect(plan.diagnostics).toEqual([]);
    expect(plan.candidates.map((candidate) => candidate.provider.providesId)).toEqual(["files"]);
    expect(await client.getPluginCatalog()).toEqual([]);
    expect(existsSync(executionMarker)).toBe(false);
  } finally {
    await client.close();
    await daemon.close();
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

test("plugin host services run a built-in v1 provider for the connected principal", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "paseo-host-services-wire-"));
  await writeHostServicePackage({
    directory: path.join(root, "files"),
    disposeLog: path.join(root, "disposed.log"),
    providers: ["files", "store"],
  });
  const daemon = await createTestPaseoDaemon({
    daemonVersion: "0.11.1",
    pluginsEnabled: false,
    builtinPlugins: new BuiltinPluginLoader(root, ["files"]),
  });
  const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws` });
  try {
    await client.connect();
    expect(await client.describePluginHostServices()).toMatchObject({
      apiVersion: "1.0.0",
      runtimes: ["daemon"],
      targets: ["service"],
      retryPolicies: ["read", "no-replay"],
    });
    const resolved = await client.resolvePluginHostService({
      mode: "one",
      serviceId: "acme.files",
      range: "^1.0.0",
      runtime: "daemon",
      providerScope: "host",
      scope: { kind: "host", serverId: daemon.daemon.getServerId() },
      target: { kind: "service" },
    });
    if (resolved.status !== "ok" || resolved.value.mode !== "one") {
      throw new Error(`Expected one binding: ${JSON.stringify(resolved)}`);
    }
    const call = {
      binding: resolved.value.binding.binding,
      method: "whoami",
      target: { kind: "service" as const },
      params: {},
    };
    expect(await client.callPluginHostService(call)).toEqual({
      status: "ok",
      value: { principalId: "owner", permissions: [...DAEMON_PERMISSIONS], depth: 0 },
    });
    expect(await client.releasePluginHostService(call.binding)).toEqual({
      status: "ok",
      value: null,
    });
    expect(await client.callPluginHostService(call)).toMatchObject({
      status: "error",
      error: { code: "STALE_BINDING" },
    });
  } finally {
    await client.close();
    await daemon.close();
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

test("plugin configuration layers are written and read through the daemon", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "paseo-plugin-config-wire-"));
  const projectDirectory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-config-project-"));
  await writeHostServicePackage({
    directory: path.join(root, "files"),
    disposeLog: path.join(root, "disposed.log"),
    providers: ["files", "store"],
    settings: filesSettings(),
  });
  const daemon = await createTestPaseoDaemon({
    daemonVersion: "0.11.1",
    pluginsEnabled: false,
    builtinPlugins: new BuiltinPluginLoader(root, ["files"]),
  });
  const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws` });
  try {
    await client.connect();
    const serverId = daemon.daemon.getServerId();
    const created = await client.createWorkspace({
      idempotencyKey: "plugin-config-workspace",
      source: { kind: "directory", path: projectDirectory },
    });
    if (!created.workspace) throw new Error("Expected a workspace");
    const { id: conversationId, projectId } = created.workspace;
    const settings = {
      installation: { kind: "host" as const, serverId, installationId: "files" },
      settingsId: "files",
    };
    const project = { kind: "project" as const, serverId, projectId };
    expect(
      await client.writePluginConfigurationLayer({
        settings,
        scope: project,
        expectedRevision: "missing",
        values: { showHidden: true },
      }),
    ).toMatchObject({ status: "ok", value: { restartedProviders: [] } });
    const read = await client.readPluginConfiguration({
      settings,
      scope: { kind: "conversation", serverId, conversationId, projectId },
    });
    expect(read).toMatchObject({
      status: "ok",
      value: {
        values: { showHidden: true, watcherLimit: 512 },
        provenance: { "/showHidden": { source: "layer", scope: project } },
      },
    });
  } finally {
    await client.close();
    await daemon.close();
    await rm(root, { recursive: true, force: true });
    await rm(projectDirectory, { recursive: true, force: true });
  }
}, 60_000);

test("built-in and directory plugins share RPC and lifecycle behavior while built-ins stay hidden and enabled", async () => {
  const workspaceDirectory = await mkdtemp(path.join(tmpdir(), "paseo-internal-seam-"));
  const daemon = await createTestPaseoDaemon({
    daemonVersion: "0.8.0",
    pluginsEnabled: false,
    builtinPlugins: new BuiltinPluginLoader(fixtureRoot, ["internal-seam"]),
  });
  const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws`, appVersion: "0.8.0" });
  try {
    await client.connect();
    expect(await client.listPlugins()).toEqual([]);
    expect(await client.invokePluginRpc("internal-seam", "state", {})).toEqual({ workspaces: 0 });
    expect((await client.getPluginLogs("internal-seam")).map(({ message }) => message)).toContain(
      "[paseo] Plugin ready",
    );
    await client.patchDaemonConfig({ pluginsEnabled: true });
    await client.installDirectoryPlugin(directory, "directory-seam");
    expect((await client.listPlugins()).map(({ id }) => id)).toEqual(["directory-seam"]);
    expect(await client.invokePluginRpc("directory-seam", "state", {})).toEqual({ workspaces: 0 });
    await client.createWorkspace({
      idempotencyKey: "internal-seam-workspace",
      source: { kind: "directory", path: workspaceDirectory },
    });
    await expect
      .poll(() => client.invokePluginRpc("internal-seam", "state", {}))
      .toEqual({ workspaces: 1 });
    await expect
      .poll(() => client.invokePluginRpc("directory-seam", "state", {}))
      .toEqual({ workspaces: 1 });
    await client.patchDaemonConfig({ pluginsEnabled: false });
    expect(await client.invokePluginRpc("internal-seam", "state", {})).toEqual({ workspaces: 1 });
    expect(await client.listPlugins()).toMatchObject([
      { id: "directory-seam", status: "disabled" },
    ]);
  } finally {
    await client.close();
    await daemon.close();
    await rm(workspaceDirectory, { recursive: true, force: true });
  }
}, 60_000);

test("a failing built-in does not stop the daemon or the next built-in", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "paseo-builtin-failure-"));
  const failingDirectory = path.join(root, "failing-builtin");
  await mkdir(failingDirectory);
  await writeFile(
    path.join(failingDirectory, "paseo-plugin.json"),
    JSON.stringify({ id: "failing-builtin", requirements: { paseo: ">=0.8.0" } }),
  );
  await writeFile(
    path.join(failingDirectory, "index.server.ts"),
    "export default function contribute() { throw new Error('fixture startup failure'); }",
  );
  await cp(directory, path.join(root, "internal-seam"), { recursive: true });
  const daemon = await createTestPaseoDaemon({
    daemonVersion: "0.8.0",
    pluginsEnabled: false,
    builtinPlugins: new BuiltinPluginLoader(root, ["failing-builtin", "internal-seam"]),
  });
  const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws`, appVersion: "0.8.0" });
  try {
    await client.connect();
    expect(await client.invokePluginRpc("internal-seam", "state", {})).toEqual({ workspaces: 0 });
    expect(await client.listPlugins()).toEqual([]);
  } finally {
    await client.close();
    await daemon.close();
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
