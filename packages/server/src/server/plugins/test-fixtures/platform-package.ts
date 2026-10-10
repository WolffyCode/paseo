import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PluginPlatformManifestSchema,
  PlatformServiceSchema,
  type PluginPlatformManifest,
  type PlatformService,
} from "@getpaseo/protocol/plugin-platform";

export function platformManifest(
  overrides: Partial<PluginPlatformManifest> = {},
): PluginPlatformManifest {
  return PluginPlatformManifestSchema.parse({
    manifestVersion: 1,
    packageId: "acme/files",
    id: "files",
    name: "Files",
    kind: "code",
    requirements: { paseo: ">=0.11.1", helmPlatform: "^1.0.0" },
    runtimes: { daemon: { entry: "index.server.ts", execution: "trusted" } },
    contracts: [{ serviceId: "acme.files", apiVersion: "1.0.0", schema: "shared/files.json" }],
    extensionPoints: [],
    settings: [],
    states: [],
    provides: [
      {
        id: "files",
        serviceId: "acme.files",
        apiVersion: "1.0.0",
        runtime: "daemon",
        scopes: ["host"],
        stopPolicy: "drain",
      },
    ],
    requires: [],
    contributions: [],
    ...overrides,
  });
}

export function platformService(): PlatformService {
  return PlatformServiceSchema.parse({
    schemaVersion: 1,
    serviceId: "acme.files",
    apiVersion: "1.0.0",
    ownerNamespace: "acme",
    cardinality: "single",
    inspectPermissions: ["workspace.read"],
    methods: {
      read: {
        mode: "query",
        runtime: "daemon",
        targets: ["service"],
        permissions: ["workspace.read"],
        retry: "read",
        cancellation: "cooperative",
        input: { type: "object", additionalProperties: false },
        output: { type: "string" },
      },
    },
    events: {},
    interceptors: {},
  });
}

interface FixtureInput {
  directory: string;
  manifest?: PluginPlatformManifest;
  service?: PlatformService;
  /** The daemon entry source; by default the entry throws to prove discovery never runs it. */
  serverSource?: string;
  /** Additional package files, such as more service contracts, keyed by relative path. */
  files?: Record<string, unknown>;
}

export async function writePlatformPackage(input: FixtureInput): Promise<PluginPlatformManifest> {
  const manifest = input.manifest ?? platformManifest();
  await mkdir(path.join(input.directory, "shared"), { recursive: true });
  await writeFile(path.join(input.directory, "paseo-plugin.json"), JSON.stringify(manifest));
  await writeFile(
    path.join(input.directory, "package.json"),
    JSON.stringify({ name: "@acme/files", version: "1.0.0" }),
  );
  await writeFile(
    path.join(input.directory, "shared/files.json"),
    JSON.stringify(input.service ?? platformService()),
  );
  for (const [file, value] of Object.entries(input.files ?? {})) {
    await mkdir(path.dirname(path.join(input.directory, file)), { recursive: true });
    await writeFile(path.join(input.directory, file), JSON.stringify(value));
  }
  for (const runtime of Object.values(manifest.runtimes)) {
    await writeFile(
      path.join(input.directory, runtime.entry),
      input.serverSource ?? "throw new Error('Discovery must not execute plugin code');\n",
    );
  }
  return manifest;
}
