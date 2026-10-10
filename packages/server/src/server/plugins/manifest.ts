import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { PluginIdSchema, PluginRequirementsSchema } from "@getpaseo/protocol/messages";
import { validatePluginRequirements } from "@getpaseo/protocol/plugin-requirements";
import { type PluginPlatformManifest } from "@getpaseo/protocol/plugin-platform";
import { PLATFORM_PERMISSION_EXTENSION_POINT } from "@getpaseo/protocol/plugin-platform-contributions";
import { PLUGIN_PLATFORM_HOST_SERVICES_FEATURE } from "@getpaseo/protocol/plugin-platform-execution";
import {
  parsePluginPlatformManifest,
  PluginPlatformError,
} from "@getpaseo/protocol/plugin-platform-validation";

const MANIFEST_FILENAME = "paseo-plugin.json";
const PluginBuildCommandSchema = z
  .array(z.string().refine((argument) => argument.trim().length > 0))
  .min(1);
// Manifest asset paths use forward slashes and stay inside the plugin package.
const PluginAssetPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value === value.trim() &&
      !value.startsWith("/") &&
      !/[\\:?#\p{Cc}]/u.test(value) &&
      !value.split("/").includes("..") &&
      !value.endsWith("/") &&
      value.split("/").at(-1) !== ".",
    "Expected a relative file path inside the plugin package",
  );
const PluginManifestSchema = z.object({
  manifestVersion: z.never().optional(),
  id: PluginIdSchema,
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  icon: PluginAssetPathSchema.refine(
    (value) => /\.png$/i.test(value),
    "Expected a relative path to a PNG",
  ).optional(),
  media: z.array(z.union([PluginAssetPathSchema, z.url({ protocol: /^https$/ })])).optional(),
  // A misspelled requirement must not silently disable compatibility checks.
  requirements: PluginRequirementsSchema.strict().optional(),
  build: z.array(PluginBuildCommandSchema).min(1).optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema> | PluginPlatformManifest;

/** Names the first declaration this host cannot execute, or null when the package can run. */
function unsupportedExecution(manifest: PluginPlatformManifest): string | null {
  const daemon = manifest.runtimes.daemon;
  if (manifest.kind !== "code" || !daemon) return "packages without a daemon entry";
  if (daemon.execution !== "trusted") return "isolated execution";
  if (manifest.runtimes.client) return "client entries";
  if (manifest.settings.length) return "settings";
  if (manifest.states.length) return "state definitions";
  const feature = manifest.requirements.features?.find(
    (item) => item !== PLUGIN_PLATFORM_HOST_SERVICES_FEATURE,
  );
  if (feature) return `the required feature ${feature}`;
  const contribution = manifest.contributions.find(
    (item) => item.extensionPoint.id !== PLATFORM_PERMISSION_EXTENSION_POINT,
  );
  if (contribution) return `the ${contribution.extensionPoint.id} contribution ${contribution.id}`;
  const provider = manifest.provides.find(
    (item) =>
      item.runtime !== "daemon" ||
      item.scopes.some((scope) => scope !== "host") ||
      item.stopPolicy !== "drain",
  );
  if (provider) return `provider ${provider.id} outside a drained daemon host scope`;
  const dependency = manifest.requires.find(
    (item) =>
      item.runtime !== "daemon" ||
      item.scope !== "host" ||
      item.consumer.kind !== "provider" ||
      item.activation !== "eager",
  );
  if (dependency) return `dependency ${dependency.bindingKey} outside an eager daemon provider`;
  return null;
}

export function assertPluginExecutionSupported(manifest: PluginManifest): void {
  if (manifest.manifestVersion !== 1) return;
  const unsupported = unsupportedExecution(manifest);
  if (unsupported) {
    throw new PluginPlatformError({
      code: "UNSUPPORTED_FEATURE",
      message: `This host cannot execute ${unsupported} in v1 plugins`,
    });
  }
}

export async function readPluginManifest(directory: string): Promise<PluginManifest> {
  const manifestPath = path.join(directory, MANIFEST_FILENAME);
  const info = await stat(manifestPath).catch(() => null);
  if (!info?.isFile()) throw new Error(`Plugin manifest is missing: ${manifestPath}`);
  const input: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  const marker = z.object({ manifestVersion: z.unknown().optional() }).parse(input);
  if (marker.manifestVersion === 1) return parsePluginPlatformManifest(input);
  const manifest = PluginManifestSchema.parse(input);
  validatePluginRequirements(manifest.requirements);
  return manifest;
}
