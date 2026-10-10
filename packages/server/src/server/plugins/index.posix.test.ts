import { randomUUID } from "node:crypto";
import {
  cp,
  rename,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pino from "pino";
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DaemonConfigStore } from "../daemon-config-store.js";
import { PluginService } from "./index.js";
import { BuiltinPluginLoader } from "./builtin/index.js";
import { ManagedPluginSources } from "./managed-source.js";
import {
  startNpmRegistry,
  npmPluginPackages,
} from "../../../../../scripts/test-support/npm-registry.mjs";
import { runGitCommand } from "../../utils/run-git-command.js";
import {
  platformManifest,
  platformService as fileServiceContract,
  writePlatformPackage,
} from "./test-fixtures/platform-package.js";
import {
  type PlatformResolvePlanInput,
  type PlatformService,
  type PluginPlatformManifest,
} from "@getpaseo/protocol/plugin-platform";
import type {
  PlatformHostBinding,
  PlatformHostCallResult,
  PlatformHostResolve,
} from "@getpaseo/protocol/plugin-platform-execution";
import type { PlatformSession } from "./platform/broker.js";
import { writeHostServicePackage } from "./test-fixtures/platform-host-package.js";

const roots: string[] = [];
type TestPluginRuntime = NonNullable<ConstructorParameters<typeof PluginService>[3]["runtime"]>;

const emptyUsageRuntime = {
  getUsageSourceRegistrations: () => [],
  fetchUsage: async () => undefined,
  discoverUsage: async () => [],
} satisfies Pick<TestPluginRuntime, "getUsageSourceRegistrations" | "fetchUsage" | "discoverUsage">;

async function createPlugin(id: string, source: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-service-"));
  roots.push(directory);
  await writeFile(path.join(directory, "paseo-plugin.json"), JSON.stringify({ id }));
  await writeFile(path.join(directory, "index.server.ts"), source);
  return directory;
}

function createStore(
  home: string,
  plugins: Record<string, { source: "directory"; path: string; enabled?: boolean }> = {},
): DaemonConfigStore {
  return new DaemonConfigStore(home, {
    mcp: { injectIntoAgents: true },
    browserTools: { enabled: false },
    providers: {},
    metadataGeneration: { providers: [] },
    autoArchiveAfterMerge: false,
    enableTerminalAgentHooks: false,
    appendSystemPrompt: "",
    pluginsEnabled: true,
    plugins,
  });
}

function createService(
  home: string,
  plugins: Record<string, { source: "directory"; path: string; enabled?: boolean }> = {},
  dependencies: ConstructorParameters<typeof PluginService>[3] = {},
): PluginService {
  return bindTestSessionHost(
    new PluginService(pino({ level: "silent" }), createStore(home, plugins), "0.4.0", dependencies),
  );
}

function bindTestSessionHost(service: PluginService): PluginService {
  service.bindPaseoSessionHost({
    async attachPluginSocket(_pluginId, socket) {
      const closed = new Promise<void>((resolve) => socket.once("close", resolve));
      socket.on("message", (data) => {
        if (typeof data !== "string") return;
        const message = JSON.parse(data);
        if (message.type !== "hello") return;
        socket.send(
          JSON.stringify({
            type: "session",
            message: {
              type: "status",
              payload: {
                status: "server_info",
                serverId: "plugin-service-test",
                hostname: "plugin-service-test",
                version: "0.4.0",
                features: {},
              },
            },
          }),
        );
      });
      return { closed };
    },
  });
  return service;
}

function catalogIds(service: PluginService): string[] {
  return service
    .catalog()
    .map(({ id }) => id)
    .sort();
}

describe("plugin platform discovery", () => {
  const input: PlatformResolvePlanInput = {
    mode: "one",
    serviceId: "acme.files",
    range: "^1.0.0",
    runtime: "daemon",
    providerScope: "host",
    scope: { kind: "host", serverId: "srv_test" },
  };

  async function fixture(
    manifest: PluginPlatformManifest = platformManifest(),
    contracts: Record<string, PlatformService> = {},
  ) {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-platform-"));
    roots.push(home);
    const directory = path.join(home, "external");
    await writePlatformPackage({ directory, manifest, contracts });
    const store = createStore(home, { external: { source: "directory", path: directory } });
    const service = new PluginService(pino({ level: "silent" }), store, "0.11.1", {
      serverId: "srv_test",
    });
    return { home, directory, store, service };
  }

  it("discovers real package files and resolves declarations without starting code", async () => {
    const { service } = await fixture();
    expect(service.describePlatform()).toEqual({
      apiVersion: "1.0.0",
      definitions: true,
      resolutionPlans: true,
    });
    const catalog = await service.getPlatformCatalog();
    expect(catalog.entries).toHaveLength(1);
    expect(catalog.entries[0]).toMatchObject({
      installation: { kind: "host", serverId: "srv_test", installationId: "external" },
      diagnostics: [],
      package: { name: "@acme/files", version: "1.0.0" },
    });
    const plan = await service.planPlatformResolution(input);
    expect(plan.diagnostics).toEqual([]);
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]!.provider).toEqual({
      installation: { kind: "host", serverId: "srv_test", installationId: "external" },
      providesId: "files",
    });
    expect(service.catalog()).toEqual([]);
  });

  it("uses the same catalog validation for built-in and configured packages", async () => {
    const { home, directory, store } = await fixture();
    const builtinRoot = path.join(home, "builtin");
    await writePlatformPackage({ directory: path.join(builtinRoot, "files") });
    const service = new PluginService(pino({ level: "silent" }), store, "0.11.1", {
      serverId: "srv_test",
      builtinPlugins: new BuiltinPluginLoader(builtinRoot, ["files"]),
    });
    const catalog = await service.getPlatformCatalog();
    expect(
      catalog.entries.map((entry) => [
        entry.installation.installationId,
        entry.origin,
        entry.diagnostics,
      ]),
    ).toEqual([
      ["external", "configured", []],
      ["files", "builtin", []],
    ]);
    expect(
      (await service.planPlatformResolution(input)).diagnostics.map((item) => item.code),
    ).toEqual(["AMBIGUOUS_PROVIDER"]);
    const provider = {
      installation: { kind: "host" as const, serverId: "srv_test", installationId: "files" },
      providesId: "files",
    };
    expect(
      (await service.planPlatformResolution({ ...input, provider })).candidates.map(
        (item) => item.provider,
      ),
    ).toEqual([provider]);
    await writePlatformPackage({
      directory,
      service: { ...fileServiceContract(), inspectPermissions: ["workspace.write"] },
    });
    const conflicts = (await service.getPlatformCatalog()).entries.map(
      (entry) => entry.diagnostics,
    );
    expect(conflicts).toMatchObject([
      [{ code: "CONTRACT_CONFLICT" }],
      [{ code: "CONTRACT_CONFLICT" }],
    ]);
  });

  it("keeps a same-package client consumer configuring without a package self-cycle", async () => {
    const manifest = platformManifest();
    manifest.runtimes.client = {
      entry: "index.client.tsx",
      platforms: ["web", "electron"],
      execution: "trusted",
    };
    manifest.contributions = [
      {
        id: "open",
        runtime: "installation",
        extensionPoint: { id: "helm.ui.command", range: "^1.0.0" },
        data: {
          title: "Open",
          icon: "File",
          bindingKey: "files",
          serviceId: "acme.files",
          range: "^1.0.0",
          method: "read",
        },
      },
    ];
    manifest.requires = [
      {
        bindingKey: "files",
        serviceId: "acme.files",
        range: "^1.0.0",
        optional: false,
        runtime: "daemon",
        scope: "host",
        consumer: { kind: "contribution", id: "open" },
        activation: "contextual",
      },
    ];
    const { service } = await fixture(manifest);
    const plan = await service.planPlatformResolution(input);
    expect(plan.diagnostics).toEqual([]);
    expect(plan.candidates).toHaveLength(1);
    expect(plan.nodes.find((node) => node.nodeId === "external/contribution/open")).toEqual({
      nodeId: "external/contribution/open",
      state: "configuring",
      dependencies: [],
      absentDependencies: [],
      diagnostics: [],
    });
  });

  it.each([
    { optional: false, count: 0, absent: [], errors: ["DEPENDENCY_MISSING"] },
    { optional: true, count: 1, absent: ["missing"], errors: [] },
  ])(
    "reports a missing dependency with optional=$optional",
    async ({ optional, count, absent, errors }) => {
      const manifest = platformManifest();
      manifest.requires = [
        {
          bindingKey: "missing",
          serviceId: "acme.missing",
          range: "^1.0.0",
          optional,
          runtime: "daemon",
          scope: "host",
          consumer: { kind: "provider", id: "files" },
          activation: "eager",
        },
      ];
      const { service } = await fixture(manifest);
      const plan = await service.planPlatformResolution(input);
      expect(plan.candidates).toHaveLength(count);
      expect(
        plan.nodes.find((node) => node.nodeId === "external/provider/files/host")
          ?.absentDependencies,
      ).toEqual(absent);
      expect(plan.diagnostics.map((item) => item.code)).toEqual(errors);
    },
  );

  it("reports real provider cycles with their path", async () => {
    const manifest = platformManifest();
    manifest.contracts.push({
      serviceId: "acme.other",
      apiVersion: "1.0.0",
      schema: "shared/other.json",
    });
    manifest.provides.push({ ...manifest.provides[0]!, id: "other", serviceId: "acme.other" });
    manifest.requires = [
      {
        bindingKey: "other",
        serviceId: "acme.other",
        range: "^1.0.0",
        optional: false,
        runtime: "daemon",
        scope: "host",
        consumer: { kind: "provider", id: "files" },
        activation: "eager",
      },
      {
        bindingKey: "files",
        serviceId: "acme.files",
        range: "^1.0.0",
        optional: false,
        runtime: "daemon",
        scope: "host",
        consumer: { kind: "provider", id: "other" },
        activation: "eager",
      },
    ];
    const { service } = await fixture(manifest, {
      "shared/other.json": { ...fileServiceContract(), serviceId: "acme.other" },
    });
    const plan = await service.planPlatformResolution(input);
    expect(plan.candidates).toEqual([]);
    expect(plan.diagnostics).toEqual([
      {
        code: "DEPENDENCY_CYCLE",
        message: "Plugin dependency cycle",
        nodeId: "external/provider/files/host",
        path: [
          "external/provider/files/host",
          "external/provider/other/host",
          "external/provider/files/host",
        ],
      },
    ]);
  });

  it("distinguishes version mismatch, host mismatch, disabled providers and stale catalogs", async () => {
    const { service, store } = await fixture();
    expect(
      (await service.planPlatformResolution({ ...input, range: "^2.0.0" })).diagnostics.map(
        (item) => item.code,
      ),
    ).toEqual(["DEPENDENCY_VERSION"]);
    expect(
      (
        await service.planPlatformResolution({
          ...input,
          scope: { kind: "host", serverId: "srv_other" },
        })
      ).diagnostics.map((item) => item.code),
    ).toEqual(["NO_EXECUTION_ROUTE"]);
    const catalog = await service.getPlatformCatalog();
    store.patch({ pluginsEnabled: false });
    expect(
      (await service.planPlatformResolution(input)).diagnostics.map((item) => item.code),
    ).toEqual(["PROVIDER_DISABLED"]);
    expect(
      (
        await service.planPlatformResolution({
          ...input,
          expectedCatalogRevision: catalog.revision,
        })
      ).diagnostics.map((item) => item.code),
    ).toEqual(["STALE_CONTEXT"]);
  });

  it("selects multiple implementations from one installation in contract order", async () => {
    const manifest = platformManifest();
    manifest.provides = [
      { ...manifest.provides[0]!, id: "local", selectionKey: "local" },
      { ...manifest.provides[0]!, id: "archive", selectionKey: "archive" },
    ];
    const { directory, service } = await fixture(manifest);
    await writeFile(
      path.join(directory, "shared/files.json"),
      JSON.stringify({
        ...fileServiceContract(),
        cardinality: "set",
        selectionPolicy: {
          keyDescription: "Backend",
          duplicate: "reject",
          order: "selectionKey-then-providerRef",
        },
      }),
    );
    expect(
      (await service.planPlatformResolution({ ...input, mode: "many" })).candidates.map(
        (candidate) => candidate.provider.providesId,
      ),
    ).toEqual(["archive", "local"]);
    expect(
      (await service.planPlatformResolution({ ...input, selectionKey: "local" })).candidates.map(
        (candidate) => candidate.provider.providesId,
      ),
    ).toEqual(["local"]);
    expect(
      (await service.planPlatformResolution(input)).diagnostics.map((item) => item.code),
    ).toEqual(["AMBIGUOUS_PROVIDER"]);
  });

  it("rejects unsupported execution before changing installation configuration", async () => {
    const manifest = platformManifest();
    manifest.requirements.features = ["unimplemented-capability"];
    const { directory, service, store } = await fixture(manifest);
    const before = store.get().plugins;
    await expect(
      service.installDirectory({ path: directory, id: "new-installation" }),
    ).rejects.toMatchObject({ diagnostic: { code: "UNSUPPORTED_FEATURE" } });
    expect(store.get().plugins).toEqual(before);

    // A contract needing events is only visible in its service file, not the manifest.
    await writePlatformPackage({
      directory,
      service: {
        ...fileServiceContract(),
        events: {
          changed: {
            delivery: "ephemeral",
            runtime: "daemon",
            permissions: ["workspace.read"],
            targets: ["service"],
            payload: { type: "object" },
          },
        },
      },
    });
    await expect(
      service.installDirectory({ path: directory, id: "event-installation" }),
    ).rejects.toMatchObject({
      diagnostic: { code: "UNSUPPORTED_FEATURE", message: expect.stringContaining("events") },
    });
    expect(store.get().plugins).toEqual(before);
  });

  it("filters unavailable providers before choosing, while honoring an explicit selection", async () => {
    const manifest = platformManifest();
    manifest.provides.push({ ...manifest.provides[0]!, id: "blocked" });
    manifest.requires = [
      {
        bindingKey: "missing",
        serviceId: "acme.missing",
        range: "^1.0.0",
        optional: false,
        runtime: "daemon",
        scope: "host",
        consumer: { kind: "provider", id: "blocked" },
        activation: "eager",
      },
    ];
    const { service } = await fixture(manifest);
    expect(
      (await service.planPlatformResolution(input)).candidates.map(
        (candidate) => candidate.provider.providesId,
      ),
    ).toEqual(["files"]);
    const provider = {
      installation: { kind: "host" as const, serverId: "srv_test", installationId: "external" },
      providesId: "blocked",
    };
    const explicit = await service.planPlatformResolution({ ...input, provider });
    expect(explicit.candidates).toEqual([]);
    expect(explicit.diagnostics.map((item) => item.code)).toEqual(["DEPENDENCY_MISSING"]);
  });

  it("rejects duplicate set keys even when one provider is explicitly selected", async () => {
    const manifest = platformManifest();
    manifest.provides[0]!.selectionKey = "duplicate";
    manifest.provides.push({ ...manifest.provides[0]!, id: "another" });
    const { directory, service } = await fixture(manifest);
    await writeFile(
      path.join(directory, "shared/files.json"),
      JSON.stringify({
        ...fileServiceContract(),
        cardinality: "set",
        selectionPolicy: {
          keyDescription: "Backend",
          duplicate: "reject",
          order: "selectionKey-then-providerRef",
        },
      }),
    );
    const provider = {
      installation: { kind: "host" as const, serverId: "srv_test", installationId: "external" },
      providesId: "files",
    };
    expect(
      (await service.planPlatformResolution({ ...input, provider })).diagnostics.map(
        (item) => item.code,
      ),
    ).toEqual(["CONTRACT_CONFLICT"]);
  });
  it("validates custom extension data and detects changes in referenced schemas", async () => {
    const manifest = platformManifest();
    manifest.extensionPoints = [
      { id: "acme.widget", apiVersion: "1.0.0", schema: "shared/widget.json" },
    ];
    manifest.contributions = [
      {
        id: "widget",
        runtime: "installation",
        extensionPoint: { id: "acme.widget", range: "^1.0.0" },
        data: { path: "/business/resource" },
      },
    ];
    const { home, directory, service, store } = await fixture(manifest);
    const extension = {
      extensionPointId: "acme.widget",
      apiVersion: "1.0.0",
      dataSchema: { $ref: "./widget-schema.json" },
      hostService: { serviceId: "acme.files", range: "^1.0.0" },
      hostRuntime: "daemon",
      registration: "data",
      activation: "installation",
    };
    const schema = {
      type: "object",
      required: ["path"],
      additionalProperties: false,
      properties: { path: { type: "string", minLength: 1 } },
    };
    await writeFile(path.join(directory, "shared/widget.json"), JSON.stringify(extension));
    await writeFile(path.join(directory, "shared/widget-schema.json"), JSON.stringify(schema));
    expect((await service.getPlatformCatalog()).entries[0]!.diagnostics).toEqual([]);
    const second = path.join(home, "second");
    await cp(directory, second, { recursive: true });
    store.patch({
      plugins: { ...store.get().plugins, second: { source: "directory", path: second } },
    });
    await writeFile(
      path.join(second, "shared/widget-schema.json"),
      JSON.stringify({ ...schema, properties: { path: { type: "string", minLength: 2 } } }),
    );
    const catalog = await service.getPlatformCatalog();
    expect(catalog.entries.map((entry) => entry.diagnostics)).toMatchObject([
      [{ code: "CONTRACT_CONFLICT" }],
      [{ code: "CONTRACT_CONFLICT" }],
    ]);
  });

  it("registers declared permission metadata before checking service references", async () => {
    const manifest = platformManifest();
    manifest.contributions = [
      {
        id: "read-permission",
        runtime: "installation",
        extensionPoint: { id: "helm.auth.permission", range: "^1.0.0" },
        data: {
          id: "acme.files.read",
          basePermissions: ["workspace.read"],
          methods: ["acme.files.read"],
          description: "Read file metadata",
        },
      },
    ];
    const { directory, service } = await fixture(manifest);
    const contract = fileServiceContract();
    contract.methods.read!.permissions = ["acme.files.read"];
    await writeFile(path.join(directory, "shared/files.json"), JSON.stringify(contract));
    expect((await service.getPlatformCatalog()).entries[0]!.diagnostics).toEqual([]);
    contract.methods.read!.permissions = ["acme.files.missing"];
    await writeFile(path.join(directory, "shared/files.json"), JSON.stringify(contract));
    expect((await service.getPlatformCatalog()).entries[0]!.diagnostics).toMatchObject([
      { code: "INVALID_CONTRACT", message: "Unknown or invalid permission: acme.files.missing" },
    ]);
  });
});

describe("plugin platform host services", () => {
  const resolveFiles: PlatformHostResolve = {
    mode: "one",
    serviceId: "acme.files",
    range: "^1.0.0",
    runtime: "daemon",
    providerScope: "host",
    scope: { kind: "host", serverId: "srv_test" },
    target: { kind: "service" },
  };

  async function startHostServices(runtime: "builtin" | "subprocess" = "subprocess") {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-host-services-"));
    roots.push(home);
    const directory = path.join(home, "files");
    const disposeLog = path.join(home, "disposed.log");
    await writeHostServicePackage({ directory, disposeLog, providers: ["files", "store"] });
    const isBuiltin = runtime === "builtin";
    const store = createStore(
      home,
      isBuiltin ? {} : { files: { source: "directory", path: directory } },
    );
    let ownerSessions = 0;
    const service = new PluginService(pino({ level: "silent" }), store, "0.11.1", {
      serverId: "srv_test",
      builtinPlugins: new BuiltinPluginLoader(home, isBuiltin ? ["files"] : []),
    });
    service.bindPaseoSessionHost({
      async attachPluginSocket() {
        ownerSessions += 1;
        throw new Error("v1 plugins must not receive an owner session");
      },
    });
    await service.start();
    return { home, service, disposeLog, ownerSessions: () => ownerSessions };
  }

  function openCaller(service: PluginService, permissions: string[]) {
    const granted = [...permissions];
    const lifetime = new AbortController();
    const session: PlatformSession = service.hostServices!.openSession({
      principalId: "user-1",
      getPermissions: () => granted,
      signal: lifetime.signal,
    });
    return { session, granted, close: () => lifetime.abort() };
  }

  async function resolveOne(session: PlatformSession): Promise<PlatformHostBinding> {
    const result = await session.resolve(resolveFiles);
    if (result.status !== "ok" || result.value.mode !== "one") {
      throw new Error(`Expected one binding: ${JSON.stringify(result)}`);
    }
    return result.value.binding;
  }

  function call(input: {
    session: PlatformSession;
    binding: PlatformHostBinding;
    method: string;
    params?: Record<string, unknown>;
    deadlineMs?: number;
  }): Promise<PlatformHostCallResult> {
    return input.session.call(
      {
        binding: input.binding.binding,
        method: input.method,
        target: { kind: "service" },
        params: input.params ?? {},
        ...(input.deadlineMs ? { deadlineMs: input.deadlineMs } : {}),
      },
      randomUUID(),
    );
  }

  function errorCode(result: PlatformHostCallResult): string | null {
    return result.status === "error" ? result.error.code : null;
  }

  it.each(["builtin", "subprocess"] as const)(
    "runs a %s provider for the authenticated caller without an owner session",
    async (runtime) => {
      const { service, ownerSessions } = await startHostServices(runtime);
      try {
        const { session } = openCaller(service, ["workspace.read"]);
        const binding = await resolveOne(session);
        expect(binding).toMatchObject({
          provider: { installation: { installationId: "files" }, providesId: "files" },
          execution: { kind: "daemon", serverId: "srv_test", runtimeId: "files" },
        });
        expect(await call({ session, binding, method: "whoami" })).toEqual({
          status: "ok",
          value: { principalId: "user-1", permissions: ["workspace.read"], depth: 0 },
        });
        // Parameters cannot carry identity: undeclared fields fail the contract.
        expect(
          errorCode(
            await call({ session, binding, method: "whoami", params: { principalId: "owner" } }),
          ),
        ).toBe("INVALID_ARGUMENT");
        expect(errorCode(await call({ session, binding, method: "undeclared" }))).toBe(
          "INVALID_ARGUMENT",
        );
        expect(ownerSessions()).toBe(0);
        expect(service.catalog()).toEqual([]);
      } finally {
        await service.stopAllPlugins();
      }
    },
  );

  it("checks every method's permissions together against the caller's live grants", async () => {
    const { home, service } = await startHostServices();
    try {
      const { session, granted } = openCaller(service, ["workspace.read"]);
      const binding = await resolveOne(session);
      const written = path.join(home, "written");
      expect(
        errorCode(await call({ session, binding, method: "write", params: { path: written } })),
      ).toBe("FORBIDDEN");
      expect(existsSync(written)).toBe(false);
      expect(errorCode(await call({ session, binding, method: "both" }))).toBe("FORBIDDEN");

      granted.push("workspace.write");
      expect(await call({ session, binding, method: "write", params: { path: written } })).toEqual({
        status: "ok",
        value: { ok: true },
      });
      expect(existsSync(written)).toBe(true);
      expect(await call({ session, binding, method: "both" })).toEqual({
        status: "ok",
        value: { ok: true },
      });

      const aborted = path.join(home, "aborted");
      const inFlight = call({ session, binding, method: "slow", params: { path: aborted } });
      // Wait until the provider runs so revocation has an in-flight call to stop.
      await vi.waitFor(async () => {
        expect(await call({ session, binding, method: "whoami" })).toMatchObject({ status: "ok" });
      });
      granted.splice(granted.indexOf("workspace.read"), 1);
      session.revalidate();
      expect(await inFlight).toMatchObject({ status: "error", error: { code: "FORBIDDEN" } });
      await vi.waitFor(() => expect(existsSync(aborted)).toBe(true));
      expect(errorCode(await call({ session, binding, method: "whoami" }))).toBe("FORBIDDEN");
    } finally {
      await service.stopAllPlugins();
    }
  });

  it("hides providers from callers who cannot inspect their service", async () => {
    const { service } = await startHostServices();
    try {
      const { session } = openCaller(service, ["hub.execute"]);
      expect(await session.resolve(resolveFiles)).toMatchObject({
        status: "error",
        error: { code: "DEPENDENCY_MISSING" },
      });
      const remote = await session.resolve({
        ...resolveFiles,
        scope: { kind: "host", serverId: "srv_other" },
      });
      expect(remote).toMatchObject({ status: "error", error: { code: "NO_EXECUTION_ROUTE" } });
    } finally {
      await service.stopAllPlugins();
    }
  });

  it("carries the caller's authority into nested calls through declared dependencies", async () => {
    const { home, service } = await startHostServices();
    try {
      const reader = openCaller(service, ["workspace.read"]);
      const readerBinding = await resolveOne(reader.session);
      const stored = path.join(home, "stored");
      const relay = (session: PlatformSession, binding: PlatformHostBinding, bindingKey: string) =>
        call({ session, binding, method: "relay", params: { path: stored, bindingKey } });

      expect(await relay(reader.session, readerBinding, "store")).toEqual({
        status: "ok",
        value: { callError: "FORBIDDEN" },
      });
      expect(existsSync(stored)).toBe(false);
      expect(await relay(reader.session, readerBinding, "undeclared")).toEqual({
        status: "ok",
        value: { resolveError: "MANIFEST_MISMATCH" },
      });

      const writer = openCaller(service, ["workspace.read", "workspace.write"]);
      const writerBinding = await resolveOne(writer.session);
      const result = await relay(writer.session, writerBinding, "store");
      if (result.status !== "ok") throw new Error(JSON.stringify(result));
      const value = result.value as {
        callId: string;
        put: { depth: number; parentCallId: string };
      };
      expect(value.put).toEqual({ depth: 1, parentCallId: value.callId });
      expect(existsSync(stored)).toBe(true);
    } finally {
      await service.stopAllPlugins();
    }
  });

  it("separates declared failures, invalid output, unknown command outcomes and deadlines", async () => {
    const { home, service } = await startHostServices();
    try {
      const { session } = openCaller(service, ["workspace.read"]);
      const binding = await resolveOne(session);
      expect(await call({ session, binding, method: "missing" })).toEqual({
        status: "error",
        error: { code: "RESOURCE_NOT_FOUND", message: "No such file", retryable: false },
      });
      expect(errorCode(await call({ session, binding, method: "invalid" }))).toBe(
        "PROVIDER_RESULT_INVALID",
      );
      expect(await call({ session, binding, method: "explode" })).toMatchObject({
        status: "error",
        error: { code: "OUTCOME_UNKNOWN", retryable: false, details: { reason: "INTERNAL" } },
      });

      const aborted = path.join(home, "aborted");
      expect(
        await call({
          session,
          binding,
          method: "slow",
          params: { path: aborted },
          deadlineMs: 100,
        }),
      ).toMatchObject({ status: "error", error: { code: "DEADLINE_EXCEEDED", retryable: true } });
      await vi.waitFor(() => expect(existsSync(aborted)).toBe(true));
      expect(
        errorCode(await call({ session, binding, method: "whoami", deadlineMs: 120_000 })),
      ).toBe("INVALID_ARGUMENT");
    } finally {
      await service.stopAllPlugins();
    }
  });

  describe("provider lifecycle", () => {
    function providerStatuses(service: PluginService, pluginId: string) {
      return service.hostServices!.providerStatuses(pluginId);
    }

    async function startSplitPackages() {
      const home = await mkdtemp(path.join(tmpdir(), "paseo-provider-lifecycle-"));
      roots.push(home);
      const filesDirectory = path.join(home, "files");
      const storeDirectory = path.join(home, "store");
      const disposeLog = path.join(home, "disposed.log");
      await writeHostServicePackage({
        directory: filesDirectory,
        disposeLog,
        providers: ["files"],
      });
      await writeHostServicePackage({
        directory: storeDirectory,
        disposeLog,
        providers: ["store"],
      });
      const service = new PluginService(
        pino({ level: "silent" }),
        createStore(home, { files: { source: "directory", path: filesDirectory } }),
        "0.11.1",
        { serverId: "srv_test" },
      );
      await service.start();
      return { home, service, storeDirectory, disposeLog };
    }

    it("activates a provider as soon as its dependency arrives", async () => {
      const { service, storeDirectory } = await startSplitPackages();
      try {
        expect(providerStatuses(service, "files")).toEqual([
          {
            providesId: "files",
            serviceId: "acme.files",
            apiVersion: "1.0.0",
            state: "pending-dependencies",
            reason: expect.objectContaining({
              code: "DEPENDENCY_MISSING",
              message: expect.stringContaining("acme.store"),
            }),
          },
        ]);
        const { session } = openCaller(service, ["workspace.read"]);
        expect(await session.resolve(resolveFiles)).toMatchObject({
          status: "error",
          error: { code: "DEPENDENCY_MISSING", message: expect.stringContaining("acme.store") },
        });

        await service.installDirectory({ path: storeDirectory });
        expect(providerStatuses(service, "files")).toMatchObject([
          { state: "active", generation: expect.any(String) },
        ]);
        const binding = await resolveOne(session);
        expect(await call({ session, binding, method: "whoami" })).toMatchObject({
          status: "ok",
        });
      } finally {
        await service.stopAllPlugins();
      }
    });

    it("keeps the plugin running and reports a provider whose factory fails", async () => {
      const home = await mkdtemp(path.join(tmpdir(), "paseo-provider-failure-"));
      roots.push(home);
      const directory = path.join(home, "files");
      await writeHostServicePackage({
        directory,
        disposeLog: path.join(home, "disposed.log"),
        providers: ["files", "store"],
        factoryFailure: "missing credentials",
      });
      const service = new PluginService(
        pino({ level: "silent" }),
        createStore(home, { files: { source: "directory", path: directory } }),
        "0.11.1",
        { serverId: "srv_test" },
      );
      await service.start();
      try {
        expect(providerStatuses(service, "files")).toEqual([
          {
            providesId: "files",
            serviceId: "acme.files",
            apiVersion: "1.0.0",
            state: "failed",
            reason: expect.objectContaining({
              code: "PLUGIN_UNAVAILABLE",
              message: expect.stringContaining("missing credentials"),
            }),
          },
          {
            providesId: "store",
            serviceId: "acme.store",
            apiVersion: "1.0.0",
            state: "active",
            generation: expect.any(String),
          },
        ]);
        expect(await service.listPlugins()).toMatchObject([
          {
            id: "files",
            status: "running",
            platformProviders: [
              { providesId: "files", state: "failed" },
              { providesId: "store", state: "active" },
            ],
          },
        ]);
        const { session } = openCaller(service, ["workspace.read"]);
        expect(await session.resolve(resolveFiles)).toMatchObject({
          status: "error",
          error: {
            code: "PLUGIN_UNAVAILABLE",
            message: expect.stringContaining("missing credentials"),
          },
        });
      } finally {
        await service.stopAllPlugins();
      }
    });

    it("retires a provider whose dependency stops and rebuilds it when the dependency returns", async () => {
      const { service, storeDirectory, disposeLog } = await startSplitPackages();
      try {
        await service.installDirectory({ path: storeDirectory });
        const { session } = openCaller(service, ["workspace.read"]);
        const before = await resolveOne(session);

        await service.disablePlugin("store");
        // The dependent retires before the dependency it runs against.
        expect(await readFile(disposeLog, "utf8")).toBe("files\nstore\n");
        expect(errorCode(await call({ session, binding: before, method: "whoami" }))).toBe(
          "STALE_BINDING",
        );
        expect(providerStatuses(service, "files")).toMatchObject([
          {
            state: "pending-dependencies",
            reason: { code: "DEPENDENCY_MISSING", message: expect.stringContaining("acme.store") },
          },
        ]);
        expect(await session.resolve(resolveFiles)).toMatchObject({
          status: "error",
          error: { code: "DEPENDENCY_MISSING", message: expect.stringContaining("acme.store") },
        });

        await service.enablePlugin("store");
        const recovered = await resolveOne(session);
        expect(recovered.binding.generation).not.toBe(before.binding.generation);
        // Only the provider was rebuilt; its plugin process kept running.
        expect(recovered.execution.generation).toBe(before.execution.generation);
        expect(await call({ session, binding: recovered, method: "whoami" })).toMatchObject({
          status: "ok",
        });

        await service.reloadPlugin("store");
        const rebuilt = await resolveOne(session);
        expect(rebuilt.binding.generation).not.toBe(recovered.binding.generation);
        expect(rebuilt.execution.generation).toBe(before.execution.generation);
      } finally {
        await service.stopAllPlugins();
      }
    });

    it("retires every transitive dependent before the provider it runs against", async () => {
      const { home, service, storeDirectory, disposeLog } = await startSplitPackages();
      try {
        const searchDirectory = path.join(home, "search");
        await writeHostServicePackage({
          directory: searchDirectory,
          disposeLog,
          providers: ["search"],
        });
        await service.installDirectory({ path: storeDirectory });
        await service.installDirectory({ path: searchDirectory });
        expect(providerStatuses(service, "search")).toMatchObject([{ state: "active" }]);

        await service.reloadPlugin("store");
        expect(await readFile(disposeLog, "utf8")).toBe("search\nfiles\nstore\n");
        expect(providerStatuses(service, "search")).toMatchObject([{ state: "active" }]);
      } finally {
        await service.stopAllPlugins();
      }
    });

    it("finishes accepted calls before a stopping plugin disposes its providers", async () => {
      const { service, disposeLog } = await startHostServices();
      try {
        const { session } = openCaller(service, ["workspace.read"]);
        const binding = await resolveOne(session);
        const accepted = call({ session, binding, method: "wait", params: { ms: 500 } });

        const stopping = service.disablePlugin("files");
        expect(providerStatuses(service, "files")).toMatchObject([
          { providesId: "files", state: "draining" },
          { providesId: "store", state: "draining" },
        ]);
        expect(await call({ session, binding, method: "whoami" })).toMatchObject({
          status: "error",
          error: { code: "PLUGIN_UNAVAILABLE", retryable: true },
        });
        expect(existsSync(disposeLog)).toBe(false);
        // The accepted call runs to completion; an aborted one would report ok: false.
        expect(await accepted).toEqual({ status: "ok", value: { ok: true } });

        await stopping;
        expect(await readFile(disposeLog, "utf8")).toBe("files\nstore\n");
        expect(providerStatuses(service, "files")).toEqual([]);
      } finally {
        await service.stopAllPlugins();
      }
    });

    it("ends the calls and providers of a plugin process that exits", async () => {
      const { service } = await startHostServices();
      try {
        const { session } = openCaller(service, ["workspace.read"]);
        const binding = await resolveOne(session);
        const accepted = call({ session, binding, method: "wait", params: { ms: 10_000 } });

        expect(errorCode(await call({ session, binding, method: "crash" }))).toBe(
          "PLUGIN_UNAVAILABLE",
        );
        expect(errorCode(await accepted)).toBe("PLUGIN_UNAVAILABLE");
        expect(providerStatuses(service, "files")).toEqual([]);
        expect(await session.resolve(resolveFiles)).toMatchObject({
          status: "error",
          error: { code: "DEPENDENCY_MISSING" },
        });
      } finally {
        await service.stopAllPlugins();
      }
    });

    it("lists the provider states of each running v1 plugin", async () => {
      const { service, storeDirectory } = await startSplitPackages();
      try {
        expect(await service.listPlugins()).toMatchObject([
          {
            id: "files",
            status: "running",
            platformProviders: [
              {
                providesId: "files",
                state: "pending-dependencies",
                reason: { code: "DEPENDENCY_MISSING", retryable: true },
              },
            ],
          },
        ]);
        await service.installDirectory({ path: storeDirectory });
        expect(await service.listPlugins()).toMatchObject([
          { id: "files", platformProviders: [{ state: "active", generation: expect.any(String) }] },
          { id: "store", platformProviders: [{ state: "active", generation: expect.any(String) }] },
        ]);
        await service.disablePlugin("store");
        const [, disabled] = await service.listPlugins();
        expect(disabled).toMatchObject({ id: "store", status: "disabled" });
        expect(disabled).not.toHaveProperty("platformProviders");
      } finally {
        await service.stopAllPlugins();
      }
    });

    it("gives every provider activation a generation of its own", async () => {
      const { service } = await startHostServices();
      try {
        const { session } = openCaller(service, ["workspace.read"]);
        const before = await resolveOne(session);
        expect(before.binding.generation).not.toBe(before.execution.generation);
        await service.reloadPlugin("files");
        const after = await resolveOne(session);
        expect(after.binding.generation).not.toBe(before.binding.generation);
        expect(after.execution.generation).not.toBe(before.execution.generation);
      } finally {
        await service.stopAllPlugins();
      }
    });
  });

  it("expires bindings when the provider restarts or the caller's session ends", async () => {
    const { service, disposeLog } = await startHostServices();
    try {
      const { session, close } = openCaller(service, ["workspace.read"]);
      const before = await resolveOne(session);
      expect(await call({ session, binding: before, method: "whoami" })).toMatchObject({
        status: "ok",
      });

      await service.reloadPlugin("files");
      expect(await readFile(disposeLog, "utf8")).toBe("files\nstore\n");
      expect(errorCode(await call({ session, binding: before, method: "whoami" }))).toBe(
        "STALE_BINDING",
      );
      const after = await resolveOne(session);
      expect(after.execution.generation).not.toBe(before.execution.generation);
      expect(await call({ session, binding: after, method: "whoami" })).toMatchObject({
        status: "ok",
      });

      const other = openCaller(service, ["workspace.read"]);
      expect(
        errorCode(await call({ session: other.session, binding: after, method: "whoami" })),
      ).toBe("STALE_BINDING");
      close();
      expect(errorCode(await call({ session, binding: after, method: "whoami" }))).toBe(
        "STALE_BINDING",
      );
    } finally {
      await service.stopAllPlugins();
    }
  });
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function createPausedRuntime() {
  let releaseStart = () => undefined;
  let markStarted = () => undefined;
  const startGate = new Promise<void>((resolve) => {
    releaseStart = resolve;
  });
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const running = new Set<string>();
  const runtime: TestPluginRuntime = {
    ...emptyUsageRuntime,
    catalog: () => [...running].map((id) => ({ id, clientBundle: "bundle" })),
    invoke: async () => undefined,
    getLogs: () => [],
    clearLogs: () => undefined,
    startPlugin: async (pluginId, _path, canPublish) => {
      markStarted();
      await startGate;
      if (!canPublish()) throw new Error(`Plugin start cancelled: ${pluginId}`);
      running.add(pluginId);
    },
    stopPluginById: async (pluginId) => running.delete(pluginId),
    stopAll: async () => {
      running.clear();
    },
    subscribe: () => () => undefined,
    bindPaseoSessionHost: () => undefined,
  };
  return { runtime, started, releaseStart };
}

function createPluginSelectivePausedRuntime(pausedPluginId: string) {
  let releaseStart = () => undefined;
  let markStarted = () => undefined;
  const startGate = new Promise<void>((resolve) => {
    releaseStart = resolve;
  });
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const starts: string[] = [];
  const running = new Set<string>();
  const runtime: TestPluginRuntime = {
    ...emptyUsageRuntime,
    catalog: () => [...running].map((id) => ({ id, clientBundle: "bundle" })),
    invoke: async () => undefined,
    getLogs: () => [],
    clearLogs: () => undefined,
    startPlugin: async (pluginId, _path, canPublish) => {
      starts.push(pluginId);
      if (pluginId === pausedPluginId) {
        markStarted();
        await startGate;
      }
      if (!canPublish()) throw new Error(`Plugin start cancelled: ${pluginId}`);
      running.add(pluginId);
    },
    stopPluginById: async (pluginId) => running.delete(pluginId),
    stopAll: async () => {
      running.clear();
    },
    subscribe: () => () => undefined,
    bindPaseoSessionHost: () => undefined,
  };
  return { runtime, started, releaseStart, starts };
}

describe("PluginService", () => {
  it.each([
    { shadow: false, runtime: "subprocess" },
    { shadow: true, runtime: "subprocess" },
    { shadow: false, runtime: "builtin" },
    { shadow: true, runtime: "builtin" },
  ])(
    "publishes status and launch metadata through $runtime despite a configured provider (extends: $shadow)",
    async ({ shadow, runtime }) => {
      const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
      roots.push(home);
      const directory = await createPlugin(
        "provider-status",
        `export default function contribute(server) {
      server.registerProvider({ id: "plugin-agent", label: "Plugin agent", command: ["agent", "serve"],
        async status({ launch }) { return launch.env.LOGIN === "yes" ? { available: true } : { available: false, diagnostic: "Sign in" }; },
        async getCatalogCacheKey({ launch }) { return launch.command + ":" + launch.env.LOGIN; },
        async connect({ launch }) {
          if (launch.command !== process.execPath || launch.env.LOGIN !== "no") throw new Error("Unexpected launch");
          return { version: 1, capabilities: [], async send() {}, onEvent() { return () => {}; }, async close() {} };
        },
      });
      return () => {};
    }`,
      );
      const store = createStore(home);
      await store.patch({
        providers: {
          "plugin-agent": shadow
            ? { extends: "acp", label: "Own provider", command: ["own-agent"] }
            : { command: ["configured-agent"], enabled: false },
        },
      });
      const builtinRoot = path.join(home, "builtins");
      if (runtime === "builtin") {
        await mkdir(builtinRoot);
        await cp(directory, path.join(builtinRoot, "provider-status"), { recursive: true });
      }
      const builtinPlugins = new BuiltinPluginLoader(
        builtinRoot,
        runtime === "builtin" ? ["provider-status"] : [],
      );
      const service = bindTestSessionHost(
        new PluginService(pino({ level: "silent" }), store, "0.4.0", { builtinPlugins }),
      );
      await service.start();
      try {
        if (runtime === "subprocess") await service.installDirectory({ path: directory });
        const [registration] = service.getProviderRegistrations();
        expect(registration).toMatchObject({
          id: "plugin-agent",
          command: ["agent", "serve"],
          status: expect.any(Function),
        });
        const launch = { command: process.execPath, args: [], env: { LOGIN: "no" } };
        expect(await registration!.getCatalogCacheKey!({ scope: "global", launch })).toBe(
          process.execPath + ":no",
        );
        expect(await registration!.status!({ launch })).toEqual({
          available: false,
          diagnostic: "Sign in",
        });
        expect(
          await registration!.status!({ launch: { ...launch, env: { LOGIN: "yes" } } }),
        ).toEqual({ available: true });
        const connection = await registration!.connect({ versions: [1], capabilities: [], launch });
        await connection.close();
      } finally {
        await service.stopAllPlugins();
      }
    },
  );

  it("resolves a provider icon path to sanitized inline SVG", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const directory = await createPlugin(
      "provider-icon",
      `export default function contribute(server) {
  server.registerProvider({
    id: "plugin-agent",
    label: "Plugin agent",
    icon: "icon.svg",
    async getCatalogCacheKey(options) { return options.scope === "workspace" ? "runtime:" + options.cwd : undefined; },
    async connect() { throw new Error("not opened by this test"); },
  });
  return () => {};
}`,
    );
    const iconSvg = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" /></svg>';
    await writeFile(path.join(directory, "icon.svg"), iconSvg);
    const service = createService(home);

    await service.start();
    await service.installDirectory({ path: directory });

    expect(service.getProviderRegistrations()).toMatchObject([
      { id: "plugin-agent", icon: iconSvg, getCatalogCacheKey: expect.any(Function) },
    ]);
    const provider = service.getProviderRegistrations()[0]!;
    expect(await provider.getCatalogCacheKey!({ scope: "workspace", cwd: "/project-a" })).toBe(
      "runtime:/project-a",
    );
    expect(
      await provider.getCatalogCacheKey!({ scope: "workspace", cwd: "/project-b", force: true }),
    ).toBe("runtime:/project-b");
    expect(await provider.getCatalogCacheKey!({ scope: "global" })).toBeUndefined();
  });

  it("publishes provider registrations only while their plugin is running", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const directory = await createPlugin(
      "provider-lifecycle",
      `export default function contribute(server) {
  server.registerProvider({
    id: "plugin-agent",
    label: "Plugin agent",
    async connect() { throw new Error("not opened by this test"); },
  });
  return () => {};
}`,
    );
    const service = createService(home);

    await service.start();
    await service.installDirectory({ path: directory });
    expect(service.getProviderRegistrations()).toMatchObject([
      { id: "plugin-agent", label: "Plugin agent" },
    ]);

    await service.disablePlugin("provider-lifecycle");
    expect(service.getProviderRegistrations()).toEqual([]);
  });

  it("retains logs when disabled and clears them only when removed", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const entries = [
      {
        sequence: 1,
        timestamp: "2026-08-16T12:00:00.000Z",
        stream: "stdout" as const,
        message: "ready",
      },
    ];
    const cleared: string[] = [];
    const runtime: TestPluginRuntime = {
      ...emptyUsageRuntime,
      catalog: () => [],
      invoke: async () => undefined,
      getLogs: () => entries,
      clearLogs: (pluginId) => {
        cleared.push(pluginId);
        entries.length = 0;
      },
      startPlugin: async () => undefined,
      stopPluginById: async () => false,
      stopAll: async () => undefined,
      subscribe: () => () => undefined,
      bindPaseoSessionHost: () => undefined,
    };
    const service = createService(
      home,
      { example: { source: "directory", path: "/plugins/example", enabled: false } },
      { runtime },
    );

    expect(service.getLogs("example")).toEqual(entries);
    await service.disablePlugin("example");
    expect(service.getLogs("example")).toEqual(entries);
    expect(cleared).toEqual([]);

    await service.removePlugin("example");
    expect(cleared).toEqual(["example"]);
    expect(entries).toEqual([]);
  });

  it("publishes each configured plugin after its startup state settles", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const first = await createPlugin(
      "startup-first",
      `export default function contribute(plugin: unknown) { void plugin; return () => undefined; }`,
    );
    const second = await createPlugin(
      "startup-second",
      `export default function contribute(plugin: unknown) { void plugin; return () => undefined; }`,
    );
    const service = createService(home, {
      "startup-first": { source: "directory", path: first },
      "startup-second": { source: "directory", path: second },
    });
    const snapshots: string[][] = [];
    service.subscribe(() => snapshots.push(catalogIds(service)));

    await service.start();

    expect(snapshots).toEqual([["startup-first"], ["startup-first", "startup-second"]]);
    await service.stopAllPlugins();
  }, 20_000);

  it("uses an explicit config key, exposes reload failure, and retries from disk", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const directory = await createPlugin(
      "manifest-default",
      `export default function contribute(plugin: unknown) { void plugin; return () => undefined; }`,
    );
    const store = createStore(home);
    const service = bindTestSessionHost(
      new PluginService(pino({ level: "silent" }), store, "0.4.0"),
    );
    await service.start();

    await expect(
      service.installDirectory({ path: directory, id: "work-plugin" }),
    ).resolves.toMatchObject({
      id: "work-plugin",
      status: "running",
    });
    await expect(service.installDirectory({ path: directory, id: "work-plugin" })).rejects.toThrow(
      "choose another ID with --id",
    );

    await writeFile(path.join(directory, "index.server.ts"), "export default broken syntax !!!");
    await expect(service.reloadPlugin("work-plugin")).rejects.toThrow();
    expect(service.catalog()).toEqual([]);
    expect(await service.listPlugins()).toMatchObject([
      expect.objectContaining({ id: "work-plugin", status: "failed", error: expect.any(String) }),
    ]);

    await writeFile(
      path.join(directory, "index.server.ts"),
      `export default function contribute(plugin: unknown) { void plugin; return () => undefined; }`,
    );
    await expect(service.reloadPlugin("work-plugin")).resolves.toMatchObject({ status: "running" });
    await service.stopAllPlugins();
  }, 20_000);

  it("lists manifest metadata for running and disabled plugins without hiding malformed entries", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const running = await createPlugin("running", "export default () => () => {};");
    const disabled = await createPlugin("disabled", "export default () => () => {};");
    const malformed = await createPlugin("malformed", "export default () => () => {};");
    await writeFile(
      path.join(running, "paseo-plugin.json"),
      JSON.stringify({
        id: "running",
        description: "Runs checks",
        name: "Checks",
        icon: "icon.png",
        media: ["screenshot.png", "https://example.com/demo.mp4"],
      }),
    );
    await writeFile(
      path.join(disabled, "paseo-plugin.json"),
      JSON.stringify({ id: "disabled", description: "Waits until enabled" }),
    );
    await writeFile(path.join(malformed, "paseo-plugin.json"), "{");
    const service = createService(home, {
      running: { source: "directory", path: running },
      disabled: { source: "directory", path: disabled, enabled: false },
      malformed: { source: "directory", path: malformed },
    });

    await service.start();

    expect(
      (await service.listPlugins()).map(({ id, description, name, icon, media }) => ({
        id,
        description,
        name,
        icon,
        media,
      })),
    ).toEqual([
      { id: "disabled", description: "Waits until enabled" },
      { id: "malformed", description: undefined },
      {
        id: "running",
        description: "Runs checks",
        name: "Checks",
        icon: "icon.png",
        media: ["screenshot.png", "https://example.com/demo.mp4"],
      },
    ]);
    await service.stopAllPlugins();
  });

  it("resolves a bare registry id even when a matching directory exists in the daemon cwd", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    const owner = path.join(process.cwd(), `registry-shadow-${randomUUID()}`);
    await mkdir(owner);
    roots.push(home, owner);
    const source = `${path.basename(owner)}/example`;
    const repository = await createPlugin("registry-example", "export default () => () => {};\n");
    await mkdir(path.join(owner, "example"));
    await cp(repository, path.join(owner, "example"), { recursive: true });
    await runGitCommand(["init", "-b", "main"], { cwd: repository });
    await runGitCommand(["add", "-A"], { cwd: repository });
    await runGitCommand(
      [
        "-c",
        "user.name=Paseo Tests",
        "-c",
        "user.email=paseo@example.test",
        "commit",
        "-m",
        "fixture",
      ],
      { cwd: repository },
    );
    const { stdout } = await runGitCommand(["rev-parse", "HEAD"], { cwd: repository });
    const requests: Array<string | undefined> = [];
    const server = createServer((request, response) => {
      requests.push(request.url);
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          id: source,
          name: "Example",
          description: "Test",
          categories: [],
          author: { github: path.basename(owner) },
          repository: { url: "https://github.com/fixture/example" },
          artifact: {
            kind: "git",
            remote: pathToFileURL(repository).href,
            commit: stdout.trim(),
            pluginPath: ".",
          },
          media: [],
          submittedAt: "2026-10-03",
          reviewedAt: "2026-10-03",
          updatedAt: "2026-10-03",
          publishedAt: "2026-10-03",
          readme: "# Test",
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing registry address");
    const url = `http://127.0.0.1:${address.port}`;
    const store = createStore(home);
    store.patch({ pluginsEnabled: false });
    const service = bindTestSessionHost(
      new PluginService(pino({ level: "silent" }), store, "0.4.0", {
        managedSources: new ManagedPluginSources(home, { defaultUrl: url }),
      }),
    );
    try {
      await service.start();
      await expect(service.installSource({ source })).resolves.toMatchObject({
        id: "registry-example",
        status: "disabled",
        installation: {
          identity: { kind: "git", registry: { url, id: source } },
          currentRevision: stdout.trim(),
        },
      });
      expect(requests).toEqual([`/plugins/${source}.json`]);
      await expect(
        service.installSource({ source: `./${source}`, id: "local-example" }),
      ).resolves.toMatchObject({
        installation: { identity: { kind: "directory", path: path.join(owner, "example") } },
      });
      expect(requests).toEqual([`/plugins/${source}.json`]);
    } finally {
      await service.stopAllPlugins();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30_000);

  it("names a missing explicit directory instead of trying a managed source", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const directory = path.join(home, "missing");
    const service = createService(home);
    await expect(service.installSource({ source: directory })).rejects.toThrow(
      `Plugin directory does not exist: ${directory}`,
    );
  });

  it("installs an explicit directory and its selected plugin subdirectory", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const repository = await mkdtemp(path.join(tmpdir(), "owner-repository-"));
    roots.push(repository);
    const pluginDirectory = path.join(repository, "plugins", "review");
    await mkdir(pluginDirectory, { recursive: true });
    await writeFile(
      path.join(pluginDirectory, "paseo-plugin.json"),
      JSON.stringify({ id: "local-monorepo" }),
    );
    await writeFile(
      path.join(pluginDirectory, "index.server.ts"),
      "export default function contribute(plugin: unknown) { void plugin; return () => undefined; }",
    );
    const service = createService(home);
    await service.start();

    await expect(
      service.installSource({ source: `${repository}:plugins/review` }),
    ).resolves.toMatchObject({ id: "local-monorepo", path: pluginDirectory, status: "running" });
    await service.stopAllPlugins();
  }, 20_000);

  it.each([true, false])(
    "updates the shipped legacy Git layout with enabled=%s",
    async (enabled) => {
      const home = await mkdtemp(path.join(tmpdir(), "paseo-legacy-layout-"));
      roots.push(home);
      const repository = await mkdtemp(path.join(tmpdir(), "paseo-legacy-remote-"));
      roots.push(repository);
      const id = "legacy-review";
      const pluginPath = "plugins/review";
      await mkdir(path.join(repository, pluginPath), { recursive: true });
      await writeFile(
        path.join(repository, pluginPath, "paseo-plugin.json"),
        JSON.stringify({ id, requirements: { paseo: ">=0.8.0" } }),
      );
      await writeFile(
        path.join(repository, pluginPath, "index.server.ts"),
        `import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import type { PluginServerContext } from "@getpaseo/plugin/server";
export default function contribute(server: PluginServerContext) {
  server.registerSettings(defineSettings({ id: "preferences", scope: "host", version: 1, schema: z.object({ message: z.string().default("default") }) }));
  return () => {};
}`,
      );
      for (const args of [
        ["init", "-b", "main"],
        ["add", "."],
        ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-m", "initial"],
        ["tag", "v1"],
      ])
        await runGitCommand(args, { cwd: repository });
      const initial = (
        await runGitCommand(["rev-parse", "HEAD"], { cwd: repository })
      ).stdout.trim();
      const remote = pathToFileURL(repository).href;
      const legacyRoot = path.join(home, "plugins", id, `${initial.slice(0, 12)}-${randomUUID()}`);
      const checkoutRoot = path.join(legacyRoot, "checkout");
      const directory = path.join(checkoutRoot, pluginPath);
      await mkdir(legacyRoot, { recursive: true });
      await runGitCommand(["clone", remote, checkoutRoot], { cwd: home });
      await runGitCommand(["checkout", "--detach", "v1"], { cwd: checkoutRoot });
      await writeFile(
        path.join(home, "plugins", "sources.json"),
        JSON.stringify({
          [id]: {
            remote,
            requestedRef: "v1",
            trackingBranch: null,
            commit: "f".repeat(40),
            pluginPath,
            checkoutRoot,
          },
        }),
      );
      const settingsDirectory = path.join(home, "plugin-settings");
      await mkdir(path.join(settingsDirectory, id), { recursive: true });
      const settingsFile = path.join(settingsDirectory, id, "preferences.json");
      const savedSettings = JSON.stringify({ version: 1, values: { message: "keep my settings" } });
      await writeFile(settingsFile, savedSettings);
      const store = createStore(home, { [id]: { source: "directory", path: directory, enabled } });
      const open = () =>
        bindTestSessionHost(
          new PluginService(pino({ level: "silent" }), store, "0.8.0", {
            managedSources: new ManagedPluginSources(home),
            settingsDirectory,
          }),
        );
      let service = open();
      try {
        await service.start();
        const expected = {
          identity: { kind: "git", remote, pluginPath },
          currentRevision: initial,
        };
        await rename(repository, `${repository}-offline`);
        try {
          expect(await new ManagedPluginSources(home).describe(id, directory)).toEqual(expected);
          expect(await service.listPlugins()).toMatchObject([
            { id, enabled, status: enabled ? "running" : "disabled", installation: expected },
          ]);
        } finally {
          await rename(`${repository}-offline`, repository);
        }
        await service.stopAllPlugins();
        service = open();
        await service.start();
        await runGitCommand(["checkout", "-b", "new-default"], { cwd: repository });
        await writeFile(path.join(repository, pluginPath, "revision.txt"), "new default");
        for (const args of [
          ["add", "."],
          ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-m", "update"],
        ])
          await runGitCommand(args, { cwd: repository });
        const latest = (
          await runGitCommand(["rev-parse", "HEAD"], { cwd: repository })
        ).stdout.trim();
        const [preview] = await service.previewUpdates({ pluginId: id });
        expect(preview).toMatchObject({
          outcome: "update",
          current: expected,
          target: { kind: "git", commit: latest },
        });
        const [updated] = await service.applyUpdates([preview!.proposal!]);
        expect(updated).toMatchObject({
          outcome: "updated",
          plugin: {
            id,
            enabled,
            status: enabled ? "running" : "disabled",
            installation: { identity: expected.identity, currentRevision: latest },
          },
        });
        await expect(stat(legacyRoot)).rejects.toMatchObject({ code: "ENOENT" });
        expect(await readFile(settingsFile, "utf8")).toBe(savedSettings);
        await service.disablePlugin(id);
        await service.enablePlugin(id);
        expect(await service.reloadPlugin(id)).toMatchObject({ status: "running" });
        expect(await service.invokePluginRpc(id, "settings.preferences.read", {})).toMatchObject({
          status: "ready",
          values: { message: "keep my settings" },
        });
        await service.removePlugin(id);
        await expect(stat(path.join(home, "plugins", id))).rejects.toMatchObject({
          code: "ENOENT",
        });
        expect(await stat(repository)).toBeDefined();
        const sources = new ManagedPluginSources(home);
        // A record cannot confer ownership on another plugin's tree or a malformed version name.
        sources.commit(id, { kind: "git", remote });
        for (const outside of [
          path.join(home, "plugins", "other", path.basename(legacyRoot), "checkout"),
          path.join(home, "plugins", id, "f".repeat(36), "checkout"),
          path.join(home, "plugins", id, `${initial.slice(0, 12)}-invalid`, "checkout"),
        ])
          await expect(sources.describe(id, outside)).rejects.toThrow(
            "outside its managed installation",
          );
      } finally {
        await service.stopAllPlugins();
      }
    },
    30_000,
  );

  it("keeps the running commit when a Git update build command fails", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const repository = await mkdtemp(path.join(tmpdir(), "paseo-plugin-repository-"));
    roots.push(repository);
    await runGitCommand(["init", "-b", "main"], { cwd: repository });
    await runGitCommand(["config", "user.name", "Paseo Tests"], { cwd: repository });
    await runGitCommand(["config", "user.email", "paseo@example.test"], { cwd: repository });
    await writeFile(
      path.join(repository, "paseo-plugin.json"),
      JSON.stringify({ id: "git-update" }),
    );
    await writeFile(
      path.join(repository, "index.server.ts"),
      "export default function contribute(plugin: unknown) { void plugin; return () => undefined; }",
    );
    await runGitCommand(["add", "-A"], { cwd: repository });
    await runGitCommand(["commit", "-m", "initial"], { cwd: repository });

    const store = createStore(home);
    const service = bindTestSessionHost(
      new PluginService(pino({ level: "silent" }), store, "0.4.0", {
        managedSources: new ManagedPluginSources(home),
      }),
    );
    await service.start();
    const installed = await service.installSource({ source: pathToFileURL(repository).href });
    const installedPath = installed.path;
    const installedCommit = installed.commit;

    await writeFile(
      path.join(repository, "paseo-plugin.json"),
      JSON.stringify({
        id: "git-update",
        build: [
          [process.execPath, "-e", 'process.stderr.write("build exploded") ; process.exit(1)'],
        ],
      }),
    );
    await writeFile(
      path.join(repository, "index.server.ts"),
      'export default function contribute(plugin: unknown) { void plugin; throw new Error("broken update"); }',
    );
    await runGitCommand(["add", "-A"], { cwd: repository });
    await runGitCommand(["commit", "-m", "broken update"], { cwd: repository });

    expect(await applyReviewedUpdate(service, "git-update")).toMatchObject([
      { outcome: "error", error: expect.stringContaining("build exploded") },
    ]);
    expect(await readdir(path.join(home, "plugins", ".staging"))).toEqual([]);
    expect(service.catalog()).toEqual([
      expect.objectContaining({ id: "git-update", clientBundle: expect.any(String) }),
    ]);
    expect(await service.listPlugins()).toMatchObject([
      expect.objectContaining({
        id: "git-update",
        path: installedPath,
        commit: installedCommit,
        status: "running",
      }),
    ]);
    await service.stopAllPlugins();
  }, 30_000);

  it("runs Git build commands in staging before validation and activation on install and update", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const repository = await mkdtemp(path.join(tmpdir(), "paseo-plugin-repository-"));
    roots.push(repository);
    await runGitCommand(["init", "-b", "main"], { cwd: repository });
    await runGitCommand(["config", "user.name", "Paseo Tests"], { cwd: repository });
    await runGitCommand(["config", "user.email", "paseo@example.test"], { cwd: repository });
    await writeFile(
      path.join(repository, "paseo-plugin.json"),
      JSON.stringify({
        id: "prepared-git-plugin",
        build: [
          [
            process.execPath,
            "-e",
            'require("node:fs").writeFileSync(process.argv[1], "prepared")',
            "build-marker;touch shell-injection",
          ],
        ],
      }),
    );
    await writeFile(path.join(repository, "index.server.ts"), "export default () => () => {};\n");
    await runGitCommand(["add", "-A"], { cwd: repository });
    await runGitCommand(["commit", "-m", "initial"], { cwd: repository });

    const events: string[] = [];
    const running = new Set<string>();
    const runtime: TestPluginRuntime = {
      ...emptyUsageRuntime,
      catalog: () => [...running].map((id) => ({ id, clientBundle: "bundle" })),
      invoke: async () => undefined,
      getLogs: () => [],
      clearLogs: () => undefined,
      validatePlugin: async (directory) => {
        events.push(
          `validate:${await readFile(path.join(directory, "build-marker;touch shell-injection"), "utf8")}`,
        );
      },
      startPlugin: async (pluginId) => {
        events.push("start");
        running.add(pluginId);
      },
      stopPluginById: async (pluginId) => running.delete(pluginId),
      stopAll: async () => running.clear(),
      subscribe: () => () => undefined,
      bindPaseoSessionHost: () => undefined,
    };
    const service = createService(
      home,
      {},
      {
        runtime,
        managedSources: new ManagedPluginSources(home),
      },
    );
    await service.start();

    const installed = await service.installSource({ source: pathToFileURL(repository).href });

    expect(events).toEqual(["validate:prepared", "start"]);
    await expect(stat(path.join(installed.path, "shell-injection"))).rejects.toThrow();

    await writeFile(
      path.join(repository, "paseo-plugin.json"),
      JSON.stringify({
        id: "prepared-git-plugin",
        build: [
          [
            process.execPath,
            "-e",
            'require("node:fs").writeFileSync("build-marker;touch shell-injection", "updated")',
          ],
        ],
      }),
    );
    await runGitCommand(["add", "-A"], { cwd: repository });
    await runGitCommand(["commit", "-m", "prepared update"], { cwd: repository });

    await expect(applyReviewedUpdate(service, "prepared-git-plugin")).resolves.toEqual([
      expect.objectContaining({ id: "prepared-git-plugin", outcome: "updated" }),
    ]);
    expect(events).toEqual(["validate:prepared", "start", "validate:updated", "start"]);
    await service.stopAllPlugins();
  }, 30_000);

  it("activates an update when the enabled plugin previously failed to start", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const repository = await mkdtemp(path.join(tmpdir(), "paseo-plugin-repository-"));
    roots.push(repository);
    await runGitCommand(["init", "-b", "main"], { cwd: repository });
    await runGitCommand(["config", "user.name", "Paseo Tests"], { cwd: repository });
    await runGitCommand(["config", "user.email", "paseo@example.test"], { cwd: repository });
    await writeFile(
      path.join(repository, "paseo-plugin.json"),
      JSON.stringify({ id: "failed-update" }),
    );
    await writeFile(path.join(repository, "index.server.ts"), "export default () => () => {};\n");
    await runGitCommand(["add", "-A"], { cwd: repository });
    await runGitCommand(["commit", "-m", "initial"], { cwd: repository });

    const managedSources = new ManagedPluginSources(home);
    let initial = await managedSources.prepareInstall({
      source: pathToFileURL(repository).href,
    });
    initial = await managedSources.place("failed-update", initial);
    managedSources.commit("failed-update", initial.record);

    const running = new Set<string>();
    const starts: string[] = [];
    let failNextStart = true;
    const runtime: TestPluginRuntime = {
      ...emptyUsageRuntime,
      catalog: () => [...running].map((id) => ({ id, clientBundle: "bundle" })),
      invoke: async () => undefined,
      getLogs: () => [],
      clearLogs: () => undefined,
      validatePlugin: async () => undefined,
      startPlugin: async (pluginId, sourcePath, canPublish) => {
        starts.push(sourcePath);
        if (failNextStart) {
          failNextStart = false;
          throw new Error("initial start failed");
        }
        if (canPublish()) running.add(pluginId);
      },
      stopPluginById: async (pluginId) => running.delete(pluginId),
      stopAll: async () => running.clear(),
      subscribe: () => () => undefined,
      bindPaseoSessionHost: () => undefined,
    };
    const store = createStore(home, {
      "failed-update": { source: "directory", path: initial.directory, enabled: true },
    });
    const service = new PluginService(pino({ level: "silent" }), store, "0.4.0", {
      runtime,
      managedSources,
    });
    await service.start();
    expect(await service.listPlugins()).toMatchObject([
      expect.objectContaining({ id: "failed-update", status: "failed" }),
    ]);

    await writeFile(
      path.join(repository, "index.server.ts"),
      "export default () => () => { new Date(); };\n",
    );
    await runGitCommand(["add", "-A"], { cwd: repository });
    await runGitCommand(["commit", "-m", "fixed"], { cwd: repository });

    await expect(applyReviewedUpdate(service, "failed-update")).resolves.toEqual([
      expect.objectContaining({ id: "failed-update", outcome: "updated" }),
    ]);
    expect(starts).toHaveLength(2);
    expect(starts[1]).not.toBe(initial.directory);
    expect(await service.listPlugins()).toMatchObject([
      expect.objectContaining({ id: "failed-update", path: starts[1], status: "running" }),
    ]);
    await service.stopAllPlugins();
  }, 30_000);

  it.each([false, true])(
    "cleans a failed update when restoration also fails=%s",
    async (failRestore) => {
      const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-recovery-"));
      roots.push(home);
      const repository = await createPlugin("recovery", "export default () => () => {};\n");
      for (const args of [
        ["init", "-b", "main"],
        ["add", "."],
        ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-m", "initial"],
      ])
        await runGitCommand(args, { cwd: repository });
      const running = new Set<string>();
      let starts = 0;
      const runtime: TestPluginRuntime = {
        ...emptyUsageRuntime,
        catalog: () => [...running].map((id) => ({ id, clientBundle: "bundle" })),
        invoke: async () => undefined,
        getLogs: () => [],
        clearLogs: () => undefined,
        validatePlugin: async () => undefined,
        startPlugin: async (id) => {
          starts++;
          if (starts === 2) throw new Error("candidate activation failed");
          if (starts === 3 && failRestore) throw new Error("prior activation failed");
          running.add(id);
        },
        stopPluginById: async (id) => running.delete(id),
        stopAll: async () => running.clear(),
        subscribe: () => () => undefined,
        bindPaseoSessionHost: () => undefined,
      };
      const service = createService(
        home,
        {},
        { runtime, managedSources: new ManagedPluginSources(home) },
      );
      await service.start();
      const installed = await service.installSource({ source: pathToFileURL(repository).href });
      await writeFile(path.join(repository, "revision.txt"), "new");
      for (const args of [
        ["add", "."],
        ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-m", "update"],
      ])
        await runGitCommand(args, { cwd: repository });
      const result = await applyReviewedUpdate(service, "recovery");
      expect(result).toMatchObject([
        {
          outcome: "error",
          error: expect.stringContaining(
            failRestore ? "restoring previous plugin also failed" : "candidate activation failed",
          ),
        },
      ]);
      expect(await service.listPlugins()).toMatchObject([
        {
          path: installed.path,
          enabled: true,
          status: failRestore ? "failed" : "running",
          installation: installed.installation,
        },
      ]);
      expect(await readdir(path.join(home, "plugins", "recovery"))).toEqual([
        path.basename(path.dirname(installed.path)),
      ]);
      expect(await readdir(path.join(home, "plugins", ".staging"))).toEqual([]);
      await service.stopAllPlugins();
    },
    30_000,
  );

  it("disables and removes a plugin without touching its source directory", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const cleanupFile = path.join(home, "cleanup.txt");
    const directory = await createPlugin(
      "cleanup-plugin",
      `import { writeFileSync } from "node:fs";
export default function contribute(plugin: unknown) {
  void plugin;
  return () => writeFileSync(${JSON.stringify(cleanupFile)}, "cleaned");
}`,
    );
    const store = createStore(home);
    const service = bindTestSessionHost(
      new PluginService(pino({ level: "silent" }), store, "0.4.0"),
    );
    await service.start();
    await service.installDirectory({ path: directory });

    await expect(service.disablePlugin("cleanup-plugin")).resolves.toMatchObject({
      status: "disabled",
    });
    expect(await readFile(cleanupFile, "utf8")).toBe("cleaned");
    await service.removePlugin("cleanup-plugin");

    expect(await service.listPlugins()).toMatchObject([]);
    await expect(stat(directory)).resolves.toMatchObject({});
    await service.stopAllPlugins();
  }, 20_000);

  it("detaches every plugin synchronously when the global switch turns off and recovers", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const first = await createPlugin(
      "first",
      `export default function contribute(plugin: unknown) { void plugin; return () => undefined; }`,
    );
    const second = await createPlugin(
      "second",
      `export default function contribute(plugin: unknown) { void plugin; return () => undefined; }`,
    );
    const store = createStore(home);
    const service = bindTestSessionHost(
      new PluginService(pino({ level: "silent" }), store, "0.4.0"),
    );
    await service.start();
    await service.installDirectory({ path: first });
    await service.installDirectory({ path: second });

    store.patch({ pluginsEnabled: false });

    expect(service.catalog()).toEqual([]);
    await expect(service.invokePluginRpc("second", "anything", {})).rejects.toThrow(
      "Plugin is not available",
    );
    store.patch({ pluginsEnabled: true });
    await service.reloadPlugin("first");
    expect((await service.listPlugins()).map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "first", status: "running" },
      { id: "second", status: "running" },
    ]);
    await service.stopAllPlugins();
  }, 20_000);

  it("does not publish an in-flight start after a later global disable", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const store = createStore(home, {
      slow: { source: "directory", path: "/plugins/slow", enabled: true },
    });
    store.patch({ pluginsEnabled: false });
    const paused = createPausedRuntime();
    const service = new PluginService(pino({ level: "silent" }), store, "0.4.0", {
      runtime: paused.runtime,
    });
    await service.start();

    store.patch({ pluginsEnabled: true });
    await paused.started;
    store.patch({ pluginsEnabled: false });
    paused.releaseStart();
    await service.stopAllPlugins();

    expect(service.catalog()).toEqual([]);
    expect(await service.listPlugins()).toMatchObject([
      { id: "slow", path: "/plugins/slow", enabled: true, status: "disabled" },
    ]);
  });

  it("does not publish an in-flight enable after a later plugin disable", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const store = createStore(home, {
      slow: { source: "directory", path: "/plugins/slow", enabled: false },
    });
    const paused = createPausedRuntime();
    const service = new PluginService(pino({ level: "silent" }), store, "0.4.0", {
      runtime: paused.runtime,
    });
    await service.start();

    const enabling = expect(service.enablePlugin("slow")).rejects.toThrow(
      "Plugin start cancelled: slow",
    );
    await paused.started;
    const disabling = service.disablePlugin("slow");
    paused.releaseStart();

    await enabling;
    await expect(disabling).resolves.toMatchObject({ status: "disabled" });
    expect(service.catalog()).toEqual([]);
  });

  it("keeps a later disable authoritative over an enable waiting behind another plugin", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const store = createStore(home, {
      occupier: { source: "directory", path: "/plugins/occupier", enabled: false },
      slow: { source: "directory", path: "/plugins/slow", enabled: false },
    });
    const paused = createPluginSelectivePausedRuntime("occupier");
    const service = new PluginService(pino({ level: "silent" }), store, "0.4.0", {
      runtime: paused.runtime,
    });
    await service.start();

    const occupying = service.enablePlugin("occupier");
    await paused.started;
    const enabling = service.enablePlugin("slow");
    const disabling = service.disablePlugin("slow");
    paused.releaseStart();

    await occupying;
    await expect(enabling).resolves.toMatchObject({
      id: "slow",
      enabled: false,
      status: "disabled",
    });
    await expect(disabling).resolves.toMatchObject({
      id: "slow",
      enabled: false,
      status: "disabled",
    });
    expect(paused.starts).toEqual(["occupier"]);
    expect(service.catalog()).toEqual([{ id: "occupier", clientBundle: "bundle" }]);
  });

  it("notifies exactly once after successful and failed configured installs", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const successful = await createPlugin(
      "successful-install",
      `export default function contribute(plugin: unknown) { void plugin; return () => undefined; }`,
    );
    const failed = await createPlugin(
      "failed-install",
      `export default function contribute(plugin: unknown) { void plugin; throw new Error("startup exploded"); }`,
    );
    const service = createService(home);
    const events: string[] = [];
    service.subscribe((pluginId) => events.push(pluginId));
    await service.start();

    await service.installDirectory({ path: successful });
    expect(events).toEqual(["successful-install"]);

    events.length = 0;
    await expect(service.installDirectory({ path: failed })).rejects.toThrow("startup exploded");
    expect(events).toEqual(["failed-install"]);
    await service.stopAllPlugins();
  });

  it("reports invalid manifests, missing entries, and startup failures", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const invalid = await createPlugin("valid-before-corruption", "export default () => () => {};");
    await writeFile(path.join(invalid, "paseo-plugin.json"), JSON.stringify({}));
    const missingEntry = await createPlugin("missing-entry", "export default () => () => {};");
    await rm(path.join(missingEntry, "index.server.ts"));
    const legacy = await createPlugin("legacy-plugin", "export default () => () => {};");
    await rm(path.join(legacy, "index.server.ts"));
    await writeFile(path.join(legacy, "index.ts"), "export default () => () => {};");
    const startupFailure = await createPlugin(
      "startup-failure",
      `export default function contribute(plugin: unknown) { void plugin; throw new Error("startup exploded"); }`,
    );
    const service = createService(home);
    await service.start();

    await expect(service.installDirectory({ path: invalid })).rejects.toThrow();
    await expect(service.installDirectory({ path: missingEntry })).rejects.toThrow(
      "Plugin entry points are missing",
    );
    await expect(service.installDirectory({ path: legacy })).rejects.toThrow(
      "This plugin was made for an older version of Paseo and cannot run on Paseo v0.8. Ask its author to update it. Plugin authors can follow the migration guide: https://paseo.sh/docs/plugins/migration",
    );
    await expect(service.installDirectory({ path: startupFailure })).rejects.toThrow(
      "startup exploded",
    );
    expect(await service.listPlugins()).toMatchObject([
      expect.objectContaining({
        id: "legacy-plugin",
        status: "failed",
        error:
          "This plugin was made for an older version of Paseo and cannot run on Paseo v0.8. Ask its author to update it. Plugin authors can follow the migration guide: https://paseo.sh/docs/plugins/migration",
      }),
      expect.objectContaining({
        id: "missing-entry",
        status: "failed",
        error: expect.stringContaining("Plugin entry points are missing"),
      }),
      expect.objectContaining({
        id: "startup-failure",
        status: "failed",
        error: "startup exploded",
      }),
    ]);
    await service.stopAllPlugins();
  });

  it("contains cleanup errors and invokes server cleanup once per stopped installation", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "paseo-plugin-home-"));
    roots.push(home);
    const cleanupFile = path.join(home, "cleanups.txt");
    const directory = await createPlugin(
      "cleanup-count",
      `import { appendFileSync } from "node:fs";
export default function contribute(plugin: unknown) {
  void plugin;
  return () => {
    appendFileSync(${JSON.stringify(cleanupFile)}, "cleanup\\n");
    throw new Error("cleanup exploded");
  };
}`,
    );
    const service = createService(home);
    await service.start();
    await service.installDirectory({ path: directory });
    await service.reloadPlugin("cleanup-count");
    await service.disablePlugin("cleanup-count");
    await service.enablePlugin("cleanup-count");
    await service.removePlugin("cleanup-count");
    await service.installDirectory({ path: directory });
    await service.stopAllPlugins();

    expect((await readFile(cleanupFile, "utf8")).trim().split("\n")).toHaveLength(4);
  });
});

describe("npm plugin installation", () => {
  it("preserves dependencies and metadata, and reloads without npm", async () => {
    const packages = npmPluginPackages();
    const fixture = packages[1];
    packages.push({ ...fixture, version: "2.0.0", tags: ["future"] });
    const failures: Array<[string, Record<string, string>]> = [
      ["bad-manifest", { "paseo-plugin.json": "{}" }],
      [
        "bad-build",
        {
          "paseo-plugin.json": JSON.stringify({
            id: "bad-build",
            requirements: { paseo: ">=0.4.0" },
            build: [[process.execPath, "-e", "throw new Error('preparation failed')"]],
          }),
        },
      ],
      [
        "bad-requirements",
        {
          "paseo-plugin.json": JSON.stringify({
            id: "bad-requirements",
            requirements: { paseo: ">=999.0.0" },
          }),
        },
      ],
      ["bad-code", { "index.server.ts": "invalid syntax !!!" }],
      [
        "bad-activation",
        { "index.server.ts": "export default () => { throw new Error('activation failed'); };" },
      ],
    ];
    const failedPackages = [];
    for (const [name, overrides] of failures) {
      failedPackages.push({ ...fixture, name, files: { ...fixture.files, ...overrides } });
    }
    const registry = await startNpmRegistry([
      ...packages,
      {
        name: "paseo-prepared-plugin",
        version: "1.0.0",
        dependencies: { "paseo-fixture-dependency": "1.0.0" },
        scripts: { postinstall: "node -e \"throw new Error('npm lifecycle must not run')\"" },
        files: {
          "nested/paseo-plugin.json": JSON.stringify({
            id: "prepared",
            requirements: { paseo: ">=0.4.0" },
            build: [
              [
                process.execPath,
                "-e",
                "require('node:fs').mkdirSync('server'); require('node:fs').writeFileSync('server/generated.js', 'export default 42;');",
              ],
            ],
          }),
          "nested/index.server.ts": `import generated from "./server/generated.js";
import dependency from "paseo-fixture-dependency";
import { z } from "zod";
export default function contribute() {
  if (generated !== 42 || z.string().parse(dependency) !== "dependency loaded") throw new Error("Preparation failed");
  return () => {};
}`,
        },
      },
      ...failedPackages,
    ]);
    const home = await mkdtemp(path.join(tmpdir(), "paseo-npm-service-"));
    roots.push(home);
    const previousConfig = process.env.npm_config_userconfig;
    const previousPath = process.env.PATH;
    process.env.npm_config_userconfig = registry.userconfig;
    const store = createStore(home);
    const open = () =>
      bindTestSessionHost(
        new PluginService(pino({ level: "silent" }), store, "0.8.0", {
          managedSources: new ManagedPluginSources(home),
        }),
      );
    let service = open();
    try {
      await service.start();
      const installed = await service.installSource({ source: "npm:paseo-fixture-plugin@^1.0.0" });
      expect(installed).toMatchObject({
        id: "npm-review",
        status: "running",
        installation: {
          identity: { kind: "npm", packageName: "paseo-fixture-plugin", pluginPath: "." },
          currentRevision: "1.1.0",
        },
      });
      expect(installed.commit).toBeUndefined();
      expect(installed.remote).toBeUndefined();
      expect(
        service
          .getLogs("npm-review")
          .map((entry) => entry.message)
          .join("\n"),
      ).toContain("dependency loaded");
      const installRoot = path.dirname(path.dirname(installed.path));
      expect(
        JSON.parse(await readFile(path.join(home, "plugins", "sources.json"), "utf8"))[
          "npm-review"
        ],
      ).toEqual({ kind: "npm" });
      expect(
        JSON.parse(await readFile(path.join(installRoot, "package-lock.json"), "utf8")).packages[
          "node_modules/paseo-fixture-dependency"
        ].version,
      ).toBe("1.0.0");
      for (const [source, id, version] of [
        ["npm:paseo-fixture-plugin@1.0.0", "exact", "1.0.0"],
        ["paseo-fixture-plugin@stable", "tag", "1.0.0"],
        ["npm:@paseo-fixture/review", "scoped", "2.0.0"],
      ]) {
        expect(await service.installSource({ source, id })).toMatchObject({
          id,
          status: "running",
          installation: { currentRevision: version },
        });
      }
      const [preview] = await service.previewUpdates({ pluginId: "exact" });
      expect(preview).toMatchObject({
        outcome: "update",
        current: { currentRevision: "1.0.0" },
        target: { version: "1.1.0" },
      });
      const before = (await service.listPlugins()).find((item) => item.id === "exact")!;
      await service.disablePlugin("exact");
      registry.setTag("paseo-fixture-plugin", "latest", "2.0.0");
      const results = await service.applyUpdates([
        { ...preview!.proposal!, id: "missing-plugin" },
        preview!.proposal!,
      ]);
      expect(results).toMatchObject([
        { outcome: "error" },
        {
          outcome: "updated",
          plugin: { enabled: false, installation: { currentRevision: "1.1.0" } },
        },
      ]);
      expect(results[1]?.plugin?.installation?.identity).toEqual(before.installation?.identity);
      registry.setTag("paseo-fixture-plugin", "latest", "1.1.0");
      expect(await service.applyUpdates([preview!.proposal!])).toMatchObject([
        { outcome: "error", error: expect.stringContaining("changed since review") },
      ]);
      await service.enablePlugin("exact");
      const [future] = await service.previewUpdates({
        pluginId: "exact",
        target: { kind: "npm", version: "future" },
      });
      expect(await service.applyUpdates([future!.proposal!])).toMatchObject([
        { outcome: "updated", plugin: { installation: { currentRevision: "2.0.0" } } },
      ]);
      const [newer] = await service.previewUpdates({ pluginId: "exact" });
      expect(newer).toMatchObject({
        outcome: "installed-newer",
        current: { currentRevision: "2.0.0" },
        target: { version: "1.1.0" },
      });
      expect(newer?.proposal).toBeUndefined();
      const [downgrade] = await service.previewUpdates({
        pluginId: "exact",
        target: { kind: "npm", version: "1.0.0" },
      });
      const wrongArtifact = {
        ...downgrade!.proposal!,
        target: { ...downgrade!.proposal!.target, integrity: "sha512-invalid" },
      };
      expect(await service.applyUpdates([wrongArtifact])).toMatchObject([{ outcome: "error" }]);
      expect(await service.applyUpdates([downgrade!.proposal!])).toMatchObject([
        { outcome: "updated", plugin: { installation: { currentRevision: "1.0.0" } } },
      ]);
      expect((await service.previewUpdates({ pluginId: "exact" }))[0]?.outcome).toBe("update");
      await expect(service.updateSources("exact")).rejects.toThrow("Update the client");
      const prepared = await service.installSource({
        source: "npm:paseo-prepared-plugin@1.0.0:nested",
      });
      expect(prepared).toMatchObject({ id: "prepared", status: "running" });
      expect(await readFile(path.join(prepared.path, "server/generated.js"), "utf8")).toBe(
        "export default 42;",
      );
      expect(prepared.installation).toMatchObject({ identity: { pluginPath: "nested" } });
      await service.removePlugin("prepared");
      expect(registry.requests).not.toContain("/@getpaseo/plugin");
      await expect(service.installSource({ source: "npm:missing-plugin" })).rejects.toThrow();
      await expect(
        service.installSource({ source: "npm:paseo-fixture-plugin", ref: "main" }),
      ).rejects.toThrow("--ref is only valid for Git");
      await expect(service.installSource({ source: "npm:paseo-fixture-plugin" })).rejects.toThrow(
        "already configured",
      );
      expect(await readdir(path.join(home, "plugins", ".staging"))).toEqual([]);
      for (const name of [
        "bad-manifest",
        "bad-build",
        "bad-requirements",
        "bad-code",
        "bad-activation",
      ]) {
        await expect(service.installSource({ source: `npm:${name}`, id: name })).rejects.toThrow();
        expect((await service.listPlugins()).map((plugin) => plugin.id)).toEqual([
          "exact",
          "npm-review",
          "scoped",
          "tag",
        ]);
        expect(await readdir(path.join(home, "plugins", ".staging"))).toEqual([]);
      }
      await service.disablePlugin("scoped");
      await service.stopAllPlugins();
      const recordsPath = path.join(home, "plugins", "sources.json");
      const oldRecords = JSON.parse(await readFile(recordsPath, "utf8"));
      Object.assign(oldRecords["npm-review"], {
        requestedSpec: "0.0.1",
        version: "0.0.1",
        packageName: "obsolete",
        installRoot: "/obsolete",
        integrity: "obsolete",
      });
      await writeFile(recordsPath, JSON.stringify(oldRecords));
      process.env.PATH = path.join(home, "no-executables");
      service = open();
      await service.start();
      expect(await service.listPlugins()).toMatchObject(
        expect.arrayContaining([
          expect.objectContaining({
            id: "npm-review",
            status: "running",
            installation: installed.installation,
          }),
          expect.objectContaining({ id: "scoped", enabled: false, status: "disabled" }),
        ]),
      );
      expect(await service.reloadPlugin("npm-review")).toMatchObject({
        status: "running",
        installation: installed.installation,
      });
      await expect(
        service.installSource({ source: "npm:paseo-fixture-plugin", id: "missing-npm" }),
      ).rejects.toThrow("npm is required on the daemon host");
      expect(await readdir(path.join(home, "plugins", ".staging"))).toEqual([]);
      const packagePath = path.join(installed.path, "package.json");
      const packageJson = await readFile(packagePath, "utf8");
      await writeFile(
        packagePath,
        JSON.stringify({ ...JSON.parse(packageJson), version: "99.0.0" }),
      );
      const corrupt = (await service.listPlugins()).find((plugin) => plugin.id === "npm-review")!;
      expect(corrupt.status).toBe("running");
      expect(corrupt.installation).toEqual({ identity: installed.installation!.identity });
      expect((await service.previewUpdates({ pluginId: "npm-review" }))[0]).toMatchObject({
        outcome: "error",
        error: expect.stringContaining("Installed revision is unavailable"),
      });
      expect(await service.reloadPlugin("npm-review")).toMatchObject({ status: "running" });
      await writeFile(packagePath, packageJson);
      await service.removePlugin("npm-review");
      await expect(stat(installRoot)).rejects.toMatchObject({ code: "ENOENT" });
      expect(
        JSON.parse(await readFile(path.join(home, "plugins", "sources.json"), "utf8"))[
          "npm-review"
        ],
      ).toBeUndefined();
    } finally {
      process.env.PATH = previousPath;
      if (previousConfig === undefined) delete process.env.npm_config_userconfig;
      else process.env.npm_config_userconfig = previousConfig;
      await service.stopAllPlugins();
      await registry.close();
    }
  }, 120_000);
});

async function applyReviewedUpdate(service: PluginService, pluginId: string) {
  const [preview] = await service.previewUpdates({ pluginId });
  expect(preview?.outcome).toBe("update");
  return service.applyUpdates([preview!.proposal!]);
}
