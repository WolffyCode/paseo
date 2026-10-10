import { PlatformServiceSchema, type PlatformService } from "@getpaseo/protocol/plugin-platform";
import { platformManifest, writePlatformPackage } from "./platform-package.js";

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

function serverSource(disposeMarker: string): string {
  return `import { writeFileSync } from "node:fs";
import { PluginPlatformError } from "@getpaseo/plugin/v1";

export default function register(context) {
  context.providers.provide("files", () => ({
    methods: {
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
      writeFileSync(${JSON.stringify(disposeMarker)}, "disposed");
    },
  }));
  context.providers.provide("store", () => ({
    methods: {
      put: (input, invocation) => {
        writeFileSync(input.path, "stored");
        return { depth: invocation.trace.depth, parentCallId: invocation.trace.parentCallId };
      },
    },
    dispose() {},
  }));
  return () => {};
}
`;
}

/** Writes an executable v1 package whose `files` provider depends on its own `store` provider. */
export async function writeHostServicePackage(input: {
  directory: string;
  disposeMarker: string;
}): Promise<void> {
  const manifest = platformManifest({
    contracts: [
      { serviceId: "acme.files", apiVersion: "1.0.0", schema: "shared/files.json" },
      { serviceId: "acme.store", apiVersion: "1.0.0", schema: "shared/store.json" },
    ],
  });
  manifest.provides.push({ ...manifest.provides[0]!, id: "store", serviceId: "acme.store" });
  manifest.requires = [
    {
      bindingKey: "store",
      serviceId: "acme.store",
      range: "^1.0.0",
      optional: false,
      runtime: "daemon",
      scope: "host",
      consumer: { kind: "provider", id: "files" },
      activation: "eager",
    },
  ];
  await writePlatformPackage({
    directory: input.directory,
    manifest,
    service: filesService(),
    files: { "shared/store.json": storeService() },
    serverSource: serverSource(input.disposeMarker),
  });
}
