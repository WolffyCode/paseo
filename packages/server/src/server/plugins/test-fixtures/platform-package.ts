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
  /** The contract written to `shared/files.json`, the default manifest's only contract. */
  service?: PlatformService;
  /** Further contracts keyed by the package path the manifest declares for them. */
  contracts?: Record<string, PlatformService>;
  /** Settings JSON Schemas keyed by the package path the manifest declares for them. */
  settingsSchemas?: Record<string, object>;
  /** The daemon entry source; by default the entry throws to prove discovery never runs it. */
  serverSource?: string;
}

export async function writePlatformPackage(input: FixtureInput): Promise<PluginPlatformManifest> {
  const manifest = input.manifest ?? platformManifest();
  const contracts: Record<string, PlatformService> = {
    "shared/files.json": input.service ?? platformService(),
    ...input.contracts,
  };
  await mkdir(input.directory, { recursive: true });
  await writeFile(path.join(input.directory, "paseo-plugin.json"), JSON.stringify(manifest));
  await writeFile(
    path.join(input.directory, "package.json"),
    JSON.stringify({ name: `@${manifest.packageId}`, version: "1.0.0" }),
  );
  for (const { schema } of manifest.contracts) {
    const contract = contracts[schema];
    if (!contract) throw new Error(`The fixture has no contract for ${schema}`);
    await mkdir(path.dirname(path.join(input.directory, schema)), { recursive: true });
    await writeFile(path.join(input.directory, schema), JSON.stringify(contract));
  }
  for (const { schema } of manifest.settings) {
    const settingsSchema = input.settingsSchemas?.[schema];
    if (!settingsSchema) throw new Error(`The fixture has no settings schema for ${schema}`);
    await mkdir(path.dirname(path.join(input.directory, schema)), { recursive: true });
    await writeFile(path.join(input.directory, schema), JSON.stringify(settingsSchema));
  }
  for (const runtime of Object.values(manifest.runtimes)) {
    await writeFile(
      path.join(input.directory, runtime.entry),
      input.serverSource ?? "throw new Error('Discovery must not execute plugin code');\n",
    );
  }
  return manifest;
}
