import {
  PlatformServiceSchema,
  type PlatformProvider,
  type PlatformService,
  type PluginPlatformManifest,
} from "@getpaseo/protocol/plugin-platform";
import { platformManifest, writePlatformPackage } from "./platform-package.js";

export type HostProvider = "files" | "store" | "search";
export type PlatformSettings = PluginPlatformManifest["settings"][number];
/** The service each provider requires, under the binding key named after that provider. */
const DEPENDENCIES: Partial<Record<HostProvider, HostProvider>> = {
  files: "store",
  search: "files",
};

const pathInput = {
  type: "object",
  required: ["path"],
  additionalProperties: false,
  properties: { path: { type: "string", minLength: 1 } },
};
const emptyInput = { type: "object", additionalProperties: false, properties: {} };
const okOutput = {
  type: "object",
  required: ["ok"],
  additionalProperties: false,
  properties: { ok: { type: "boolean" } },
};

function query(permissions: string[], input: object, output: object) {
  return {
    mode: "query",
    runtime: "daemon",
    targets: ["service"],
    permissions,
    retry: "read",
    cancellation: "cooperative",
    input,
    output,
  };
}

function command(permissions: string[], input: object, output: object) {
  return { ...query(permissions, input, output), mode: "command", retry: "no-replay" };
}

function filesService(): PlatformService {
  return PlatformServiceSchema.parse({
    schemaVersion: 1,
    serviceId: "acme.files",
    apiVersion: "1.0.0",
    ownerNamespace: "acme",
    cardinality: "single",
    inspectPermissions: ["workspace.read"],
    methods: {
      whoami: query(["workspace.read"], emptyInput, {
        type: "object",
        required: ["principalId", "permissions", "depth"],
        additionalProperties: false,
        properties: {
          principalId: { type: "string" },
          permissions: { type: "array", items: { type: "string" } },
          depth: { type: "integer" },
        },
      }),
      write: command(["workspace.write"], pathInput, okOutput),
      both: query(["workspace.read", "workspace.write"], emptyInput, okOutput),
      missing: query(["workspace.read"], emptyInput, okOutput),
      explode: command(["workspace.read"], emptyInput, okOutput),
      invalid: query(["workspace.read"], emptyInput, okOutput),
      slow: query(["workspace.read"], pathInput, okOutput),
      wait: query(
        ["workspace.read"],
        {
          type: "object",
          required: ["ms"],
          additionalProperties: false,
          properties: { ms: { type: "integer", minimum: 1, maximum: 10_000 } },
        },
        okOutput,
      ),
      crash: query(["workspace.read"], emptyInput, okOutput),
      config: query(["workspace.read"], emptyInput, { type: "object" }),
      relay: query(
        ["workspace.read"],
        {
          type: "object",
          required: ["path", "bindingKey"],
          additionalProperties: false,
          properties: { path: { type: "string" }, bindingKey: { type: "string" } },
        },
        { type: "object" },
      ),
    },
    events: {},
    interceptors: {},
  });
}

function storeService(): PlatformService {
  return PlatformServiceSchema.parse({
    schemaVersion: 1,
    serviceId: "acme.store",
    apiVersion: "1.0.0",
    ownerNamespace: "acme",
    cardinality: "single",
    inspectPermissions: ["workspace.read"],
    methods: {
      put: command(["workspace.write"], pathInput, {
        type: "object",
        required: ["depth", "parentCallId"],
        additionalProperties: false,
        properties: {
          depth: { type: "integer" },
          parentCallId: { type: ["string", "null"] },
        },
      }),
    },
    events: {},
    interceptors: {},
  });
}

function searchService(): PlatformService {
  return PlatformServiceSchema.parse({
    schemaVersion: 1,
    serviceId: "acme.search",
    apiVersion: "1.0.0",
    ownerNamespace: "acme",
    cardinality: "single",
    inspectPermissions: ["workspace.read"],
    methods: { find: query(["workspace.read"], emptyInput, okOutput) },
    events: {},
    interceptors: {},
  });
}

const FILES_SETTINGS_SCHEMA = "shared/files-settings.json";

/** The settings the files provider declares when a fixture asks for them. */
export function filesSettings(): PlatformSettings {
  return {
    id: "files",
    schemaVersion: 1,
    schema: FILES_SETTINGS_SCHEMA,
    migrationRuntime: "daemon",
    allowedScopes: ["host", "project", "conversation"],
    fields: [
      {
        path: "/showHidden",
        allowedScopes: ["host", "project", "conversation"],
        application: "invocation",
        restartRequired: false,
      },
      {
        path: "/tree/depth",
        allowedScopes: ["host", "project", "conversation"],
        application: "invocation",
        restartRequired: false,
      },
      {
        path: "/watcherLimit",
        allowedScopes: ["host"],
        application: "provider",
        restartRequired: true,
      },
    ],
    transitions: [],
  };
}

const filesSettingsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    showHidden: { type: "boolean", default: false },
    tree: {
      type: "object",
      additionalProperties: false,
      properties: { depth: { type: "integer", minimum: 1 } },
    },
    watcherLimit: { type: "integer", minimum: 1, default: 512 },
  },
};

interface SourceInput {
  providers: readonly HostProvider[];
  /** Each provider appends its ID to this file when it is disposed. */
  disposeLog: string;
  factoryFailure?: string;
  /** Settings the files provider declares; their schema is `filesSettingsSchema`. */
  settings?: PlatformSettings;
}

function filesSource(input: SourceInput): string {
  const failure = input.factoryFailure
    ? `throw new Error(${JSON.stringify(input.factoryFailure)});`
    : "";
  return `  context.providers.provide("files", (providerContext) => {
    ${failure}
    return {
    methods: {
      config: (_input, invocation) => ({
        invocation: invocation.effectiveConfig,
        provider: providerContext.config,
      }),
      whoami: (_input, invocation) => ({
        principalId: invocation.actor.principalId,
        permissions: invocation.actor.permissions,
        depth: invocation.trace.depth,
      }),
      write: (input) => {
        writeFileSync(input.path, "written");
        return { ok: true };
      },
      both: () => ({ ok: true }),
      missing: () => {
        // Shaped like a rethrown PlatformError from a nested call, which also carries retryable.
        throw new PluginPlatformError({
          code: "RESOURCE_NOT_FOUND",
          message: "No such file",
          retryable: true,
        });
      },
      explode: () => {
        throw new Error("disk failed");
      },
      invalid: () => ({ unexpected: 1 }),
      slow: (input, invocation) =>
        new Promise((resolve) => {
          invocation.signal.addEventListener("abort", () => {
            writeFileSync(input.path, "aborted");
            resolve({ ok: true });
          });
        }),
      wait: (input, invocation) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ ok: true }), input.ms);
          invocation.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve({ ok: false });
          });
        }),
      // Exits the plugin process; only subprocess plugins may call it.
      crash: () => process.exit(1),
      relay: async (input, invocation) => {
        const store = await invocation.services.resolveOne(input.bindingKey, {
          target: { kind: "service" },
          scope: invocation.scope,
        });
        if (store.status === "error") return { resolveError: store.error.code };
        const result = await store.value.call("put", {
          target: { kind: "service" },
          params: { path: input.path },
        });
        if (result.status === "error") return { callError: result.error.code };
        return { callId: invocation.trace.callId, put: result.value };
      },
    },
    dispose() {
      appendFileSync(${JSON.stringify(input.disposeLog)}, "files\\n");
    },
    };
  });
`;
}

function storeSource(input: SourceInput): string {
  return `  context.providers.provide("store", () => ({
    methods: {
      put: (input, invocation) => {
        writeFileSync(input.path, "stored");
        return { depth: invocation.trace.depth, parentCallId: invocation.trace.parentCallId };
      },
    },
    dispose() {
      appendFileSync(${JSON.stringify(input.disposeLog)}, "store\\n");
    },
  }));
`;
}

function searchSource(input: SourceInput): string {
  return `  context.providers.provide("search", () => ({
    methods: { find: () => ({ ok: true }) },
    dispose() {
      appendFileSync(${JSON.stringify(input.disposeLog)}, "search\\n");
    },
  }));
`;
}

const SOURCES: Record<HostProvider, (input: SourceInput) => string> = {
  files: filesSource,
  store: storeSource,
  search: searchSource,
};

function serverSource(input: SourceInput): string {
  const providers = input.providers.map((provider) => SOURCES[provider](input)).join("");
  return `import { appendFileSync, writeFileSync } from "node:fs";
import { PluginPlatformError } from "@getpaseo/plugin/v1";

export default function register(context) {
${providers}  return () => {};
}
`;
}

/**
 * Writes an executable v1 package declaring the given providers. `files` depends on `acme.store`
 * and `search` on `acme.files`, provided by this package or by separately installed ones. The
 * package takes its ID from its first provider.
 */
export async function writeHostServicePackage(
  input: SourceInput & { directory: string },
): Promise<void> {
  const [first] = input.providers;
  if (!first) throw new Error("A host service package needs at least one provider");
  const declare = (provider: HostProvider): PlatformProvider => ({
    id: provider,
    serviceId: `acme.${provider}`,
    apiVersion: "1.0.0",
    runtime: "daemon",
    scopes: ["host"],
    stopPolicy: "drain",
    ...(provider === "files" && input.settings ? { settingsId: input.settings.id } : {}),
  });
  const manifest = platformManifest({
    packageId: `acme/${first}`,
    id: first,
    name: first,
    contracts: input.providers.map((provider) => ({
      serviceId: `acme.${provider}`,
      apiVersion: "1.0.0",
      schema: `shared/${provider}.json`,
    })),
    provides: input.providers.map(declare),
    settings: input.settings ? [input.settings] : [],
    requires: input.providers.flatMap((provider) => {
      const dependency = DEPENDENCIES[provider];
      if (!dependency) return [];
      return [
        {
          bindingKey: dependency,
          serviceId: `acme.${dependency}`,
          range: "^1.0.0",
          optional: false,
          runtime: "daemon" as const,
          scope: "host" as const,
          consumer: { kind: "provider" as const, id: provider },
          activation: "eager" as const,
        },
      ];
    }),
  });
  await writePlatformPackage({
    directory: input.directory,
    manifest,
    contracts: {
      "shared/files.json": filesService(),
      "shared/store.json": storeService(),
      "shared/search.json": searchService(),
    },
    settingsSchemas: { [FILES_SETTINGS_SCHEMA]: filesSettingsSchema },
    serverSource: serverSource(input),
  });
}
