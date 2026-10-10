import { Ajv2020 } from "ajv/dist/2020.js";
import satisfies from "semver/functions/satisfies.js";
import { STANDARD_PLATFORM_EXTENSION_POINTS } from "@getpaseo/protocol/plugin-platform-contributions";
import {
  PLUGIN_PLATFORM_API_VERSION,
  type PlatformCatalog,
  type PlatformCatalogEntry,
  type PlatformExtensionPoint,
  type PlatformService,
  type PluginPlatformManifest,
} from "@getpaseo/protocol/plugin-platform";
import {
  platformDiagnostic,
  PluginPlatformError,
} from "@getpaseo/protocol/plugin-platform-validation";
import { readPluginManifest } from "../manifest.js";
import { loadPlatformPackage, type LoadedPlatformPackage } from "./package.js";
import { platformDigest } from "./schema-files.js";
import { validatePlatformPermissions } from "./permissions.js";

export interface PlatformPackageSource {
  id: string;
  directory: string;
  origin: PlatformCatalogEntry["origin"];
  enabled: boolean;
}
interface CatalogInput {
  serverId: string;
  daemonVersion: string;
  sources: PlatformPackageSource[];
}
export interface LoadedEntry {
  entry: PlatformCatalogEntry;
  loaded: LoadedPlatformPackage | null;
}
interface ExtensionRegistration {
  definition: PlatformExtensionPoint;
  validate(input: unknown): void;
}
const standardValidators = new Ajv2020({ allErrors: true, strictTypes: false });
const standardExtensions: ExtensionRegistration[] = STANDARD_PLATFORM_EXTENSION_POINTS.map(
  (definition) => {
    const validate = standardValidators.compile(definition.dataSchema);
    return {
      definition,
      validate(input) {
        if (!validate(input))
          throw new PluginPlatformError({
            code: "MANIFEST_MISMATCH",
            message: standardValidators.errorsText(validate.errors),
          });
      },
    };
  },
);

export function loadedCatalogEntry(input: {
  installation: PlatformCatalogEntry["installation"];
  origin: PlatformCatalogEntry["origin"];
  enabled: boolean;
  manifest: PluginPlatformManifest;
  loaded: LoadedPlatformPackage;
}): PlatformCatalogEntry {
  return {
    package: input.loaded.package,
    installation: input.installation,
    origin: input.origin,
    enabled: input.enabled,
    manifest: input.manifest,
    services: input.loaded.services,
    extensionPoints: input.loaded.extensions.map(({ definition, schemaDigest }) => ({
      definition,
      schemaDigest,
    })),
    diagnostics: [],
  };
}

async function loadEntry(
  input: CatalogInput,
  source: PlatformPackageSource,
): Promise<LoadedEntry | null> {
  const entry: PlatformCatalogEntry = {
    package: null,
    installation: { kind: "host", serverId: input.serverId, installationId: source.id },
    origin: source.origin,
    enabled: source.enabled,
    manifest: null,
    services: [],
    extensionPoints: [],
    diagnostics: [],
  };
  try {
    const manifest = await readPluginManifest(source.directory);
    if (manifest.manifestVersion !== 1) return null;
    entry.manifest = manifest;
    if (source.origin === "builtin" && source.id !== manifest.id)
      throw new PluginPlatformError({
        code: "MANIFEST_MISMATCH",
        message: `Built-in installation ${source.id} does not match manifest ${manifest.id}`,
      });
    const loaded = await loadPlatformPackage({
      directory: source.directory,
      manifest,
      daemonVersion: input.daemonVersion,
      origin: source.origin,
    });
    return {
      entry: loadedCatalogEntry({
        installation: entry.installation,
        origin: entry.origin,
        enabled: entry.enabled,
        manifest,
        loaded,
      }),
      loaded,
    };
  } catch (error) {
    entry.diagnostics.push({ ...platformDiagnostic(error), installationId: source.id });
    return { entry, loaded: null };
  }
}

function checkDefinitionConflicts(entries: LoadedEntry[]): void {
  const definitions = new Map<string, Map<string, PlatformCatalogEntry[]>>();
  function record(key: string, digest: string, entry: PlatformCatalogEntry): void {
    let variants = definitions.get(key);
    if (!variants) {
      variants = new Map();
      definitions.set(key, variants);
    }
    const owners = variants.get(digest) ?? [];
    owners.push(entry);
    variants.set(digest, owners);
  }
  for (const { entry } of entries) {
    if (!entry.enabled || entry.diagnostics.length) continue;
    for (const service of entry.services)
      record(
        `service:${service.definition.serviceId}@${service.definition.apiVersion}`,
        service.schemaDigest,
        entry,
      );
    for (const item of entry.extensionPoints) {
      const extension = item.definition;
      const standard = STANDARD_PLATFORM_EXTENSION_POINTS.find(
        (definition) =>
          definition.extensionPointId === extension.extensionPointId &&
          definition.apiVersion === extension.apiVersion,
      );
      if (standard && platformDigest(standard) !== platformDigest(extension)) {
        entry.diagnostics.push({
          code: "CONTRACT_CONFLICT",
          message: `Conflicting standard extension point: ${extension.extensionPointId}`,
        });
      }
      record(
        `extension:${extension.extensionPointId}@${extension.apiVersion}`,
        item.schemaDigest,
        entry,
      );
    }
  }
  for (const [key, variants] of definitions) {
    if (variants.size < 2) continue;
    for (const owners of variants.values()) {
      for (const entry of owners)
        entry.diagnostics.push({
          code: "CONTRACT_CONFLICT",
          message: `Different definitions share ${key}`,
          installationId: entry.installation.installationId,
        });
    }
  }
}

function checkProviderContract(
  entry: PlatformCatalogEntry,
  service: PlatformService,
  provider: NonNullable<PlatformCatalogEntry["manifest"]>["provides"][number],
): void {
  const members = [
    ...Object.values(service.methods),
    ...Object.values(service.events),
    ...Object.values(service.interceptors),
  ];
  if (members.some((member) => member.runtime !== provider.runtime)) {
    entry.diagnostics.push({
      code: "MANIFEST_MISMATCH",
      message: `Provider ${provider.id} does not match its service runtime`,
    });
  }
  if (service.cardinality === "set" && !provider.selectionKey) {
    entry.diagnostics.push({
      code: "MANIFEST_MISMATCH",
      message: `Set provider ${provider.id} needs a selectionKey`,
    });
  }
}

function validateContributions(
  entry: PlatformCatalogEntry,
  extensions: ExtensionRegistration[],
  services: PlatformService[],
): void {
  if (!entry.manifest) return;
  for (const contribution of entry.manifest.contributions) {
    const extension = extensions.find(
      (item) =>
        item.definition.extensionPointId === contribution.extensionPoint.id &&
        satisfies(item.definition.apiVersion, contribution.extensionPoint.range),
    );
    if (!extension) continue;
    try {
      extension.validate(contribution.data);
      if (extension.definition.registration === "data" && contribution.runtime !== "installation")
        throw new PluginPlatformError({
          code: "MANIFEST_MISMATCH",
          message: `Data contribution ${contribution.id} cannot register runtime code`,
        });
      if (extension.definition.registration === "implementation") {
        const entryName = contribution.runtime === "desktop" ? "client" : contribution.runtime;
        if (entryName === "installation" || !entry.manifest.runtimes[entryName])
          throw new PluginPlatformError({
            code: "MANIFEST_MISMATCH",
            message: `Contribution ${contribution.id} has no implementation entry`,
          });
      }
      const data = contribution.data;
      const standard = STANDARD_PLATFORM_EXTENSION_POINTS.some(
        (item) => item.extensionPointId === contribution.extensionPoint.id,
      );
      if (
        standard &&
        typeof data.serviceId === "string" &&
        typeof data.range === "string" &&
        typeof data.method === "string"
      ) {
        const contract = services.find(
          (service) =>
            service.serviceId === data.serviceId &&
            satisfies(service.apiVersion, String(data.range)),
        );
        if (contract && !contract.methods[data.method])
          throw new PluginPlatformError({
            code: "MANIFEST_MISMATCH",
            message: `Contribution ${contribution.id} projects an undeclared method`,
          });
      }
    } catch (error) {
      entry.diagnostics.push({
        ...platformDiagnostic(error),
        installationId: entry.installation.installationId,
      });
    }
  }
}

function checkRegistrations(entries: LoadedEntry[]): void {
  const enabled = entries.filter(({ entry }) => entry.enabled && !entry.diagnostics.length);
  const services = enabled.flatMap(({ entry }) =>
    entry.services.map((service) => service.definition),
  );
  const extensions = [
    ...standardExtensions,
    ...enabled.flatMap(({ loaded }) => loaded?.extensions ?? []),
  ];
  for (const { entry } of enabled) {
    if (!entry.manifest) continue;
    for (const provider of entry.manifest.provides) {
      const service = services.find(
        (definition) =>
          definition.serviceId === provider.serviceId &&
          definition.apiVersion === provider.apiVersion,
      );
      if (service) checkProviderContract(entry, service, provider);
    }
    validateContributions(entry, extensions, services);
  }
}

export async function buildPlatformCatalog(input: CatalogInput): Promise<PlatformCatalog> {
  // This is a projection of PluginService's source configuration, not another installation store.
  const loaded: LoadedEntry[] = [];
  for (const source of input.sources) {
    const entry = await loadEntry(input, source);
    if (entry) loaded.push(entry);
  }
  return assemblePlatformCatalog(input.serverId, loaded);
}

export function assemblePlatformCatalog(serverId: string, loaded: LoadedEntry[]): PlatformCatalog {
  checkDefinitionConflicts(loaded);
  validatePlatformPermissions(loaded.map(({ entry }) => entry));
  checkRegistrations(loaded);
  const entries = loaded
    .map(({ entry }) => entry)
    .sort((left, right) =>
      left.installation.installationId.localeCompare(right.installation.installationId),
    );
  return {
    serverId,
    apiVersion: PLUGIN_PLATFORM_API_VERSION,
    revision: platformDigest(entries),
    entries,
  };
}
