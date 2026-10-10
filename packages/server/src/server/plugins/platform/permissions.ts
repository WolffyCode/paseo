import { DAEMON_PERMISSIONS } from "@getpaseo/protocol/messages";
import {
  PLATFORM_PERMISSION_EXTENSION_POINT,
  PlatformPermissionDefinitionSchema,
} from "@getpaseo/protocol/plugin-platform-contributions";
import { type PlatformCatalogEntry } from "@getpaseo/protocol/plugin-platform";
import {
  platformDiagnostic,
  PluginPlatformError,
} from "@getpaseo/protocol/plugin-platform-validation";
import { platformDigest } from "./schema-files.js";
import type { z } from "zod";

interface PermissionDefinition {
  value: z.infer<typeof PlatformPermissionDefinitionSchema>;
  entries: PlatformCatalogEntry[];
}

function checkPermissionConflict(
  previous: PermissionDefinition,
  value: PermissionDefinition["value"],
): void {
  if (platformDigest(previous.value) === platformDigest(value)) return;
  const diagnostic = {
    code: "CONTRACT_CONFLICT" as const,
    message: `Conflicting permission definition: ${value.id}`,
  };
  for (const owner of previous.entries) owner.diagnostics.push(diagnostic);
  throw new PluginPlatformError(diagnostic);
}

const basePermissions: ReadonlySet<string> = new Set([
  ...DAEMON_PERMISSIONS,
  "client.view.read",
  "client.view.control",
  "client.layout.write",
]);

interface PermissionScope {
  entry: PlatformCatalogEntry;
  entries: PlatformCatalogEntry[];
  permission: PermissionDefinition["value"];
}

function checkPermissionMethods({ entry, entries, permission }: PermissionScope): void {
  const definitions = entries
    .filter((item) => item.enabled && !item.diagnostics.length)
    .flatMap((item) => item.services);
  const provided = entry.manifest?.provides ?? [];
  const owned = definitions.filter(
    ({ definition }) =>
      entry.services.some(
        (service) =>
          service.definition.serviceId === definition.serviceId &&
          service.definition.apiVersion === definition.apiVersion,
      ) ||
      provided.some(
        (provider) =>
          provider.serviceId === definition.serviceId &&
          provider.apiVersion === definition.apiVersion,
      ),
  );
  const methods = new Set(
    owned.flatMap(({ definition }) =>
      Object.keys(definition.methods).map((method) => `${definition.serviceId}.${method}`),
    ),
  );
  if (permission.methods.some((method) => !methods.has(method)))
    throw new PluginPlatformError({
      code: "MANIFEST_MISMATCH",
      message: `Permission ${permission.id} references an undeclared service method`,
    });
  if (
    new Set(permission.methods).size !== permission.methods.length ||
    new Set(permission.basePermissions).size !== permission.basePermissions.length
  )
    throw new PluginPlatformError({
      code: "MANIFEST_MISMATCH",
      message: `Permission ${permission.id} contains duplicate declarations`,
    });
}

function declaredPermissions(entries: PlatformCatalogEntry[]): Map<string, PermissionDefinition> {
  const definitions = new Map<string, PermissionDefinition>();
  for (const entry of entries) {
    if (!entry.enabled || entry.diagnostics.length || !entry.manifest) continue;
    for (const contribution of entry.manifest.contributions) {
      if (contribution.extensionPoint.id !== PLATFORM_PERMISSION_EXTENSION_POINT) continue;
      try {
        const value = PlatformPermissionDefinitionSchema.parse(contribution.data);
        checkPermissionMethods({ entry, entries, permission: value });
        const publisher = entry.manifest.packageId.split("/")[0]!;
        if (basePermissions.has(value.id) || !value.id.startsWith(publisher + "."))
          throw new PluginPlatformError({
            code: "MANIFEST_MISMATCH",
            message: `Permission ${value.id} is outside the package namespace or protected`,
          });
        const previous = definitions.get(value.id);
        if (previous) checkPermissionConflict(previous, value);
        if (previous) previous.entries.push(entry);
        else definitions.set(value.id, { value, entries: [entry] });
      } catch (error) {
        entry.diagnostics.push(platformDiagnostic(error));
      }
    }
  }
  return definitions;
}

export function validatePlatformPermissions(entries: PlatformCatalogEntry[]): void {
  const definitions = declaredPermissions(entries);
  const known = new Set(basePermissions);
  function resolve(id: string, chain: string[]): void {
    if (known.has(id)) return;
    if (chain.includes(id))
      throw new PluginPlatformError({
        code: "DEPENDENCY_CYCLE",
        message: "Permission definition cycle",
        path: [...chain, id],
      });
    const definition = definitions.get(id);
    if (!definition || definition.entries.some((entry) => entry.diagnostics.length))
      throw new PluginPlatformError({
        code: "INVALID_CONTRACT",
        message: `Unknown or invalid permission: ${id}`,
      });
    for (const base of definition.value.basePermissions) resolve(base, [...chain, id]);
    known.add(id);
  }
  for (const [id, definition] of definitions) {
    try {
      resolve(id, []);
    } catch (error) {
      for (const entry of definition.entries) entry.diagnostics.push(platformDiagnostic(error));
    }
  }
  for (const entry of entries) {
    if (!entry.enabled || entry.diagnostics.length) continue;
    const permissions = entry.services.flatMap(({ definition }) => [
      ...definition.inspectPermissions,
      ...Object.values(definition.methods).flatMap((method) =>
        method.permissions.concat(method.observationPermissions ?? []),
      ),
      ...Object.values(definition.events).flatMap((event) => event.permissions),
      ...Object.values(definition.interceptors).flatMap((interceptor) => interceptor.permissions),
    ]);
    for (const permission of new Set(permissions)) {
      try {
        resolve(permission, []);
      } catch (error) {
        entry.diagnostics.push(platformDiagnostic(error));
      }
    }
  }
}

export interface PlatformPermissionResolver {
  /** Expands plugin permissions into the daemon permissions a caller must hold together. */
  bases(permissions: readonly string[]): string[];
}

// Build this from an assembled catalog: its invalid definitions already carry diagnostics and are
// skipped here, so reading the definitions again adds nothing to the entries.
export function createPlatformPermissionResolver(
  entries: PlatformCatalogEntry[],
): PlatformPermissionResolver {
  const definitions = declaredPermissions(entries);
  function visit(id: string, chain: readonly string[], bases: Set<string>): void {
    if (basePermissions.has(id)) {
      bases.add(id);
      return;
    }
    const definition = definitions.get(id);
    if (!definition || chain.includes(id))
      throw new PluginPlatformError({
        code: "INVALID_CONTRACT",
        message: `Unknown or cyclic permission: ${id}`,
      });
    for (const base of definition.value.basePermissions) visit(base, [...chain, id], bases);
  }
  return {
    bases(permissions) {
      const bases = new Set<string>();
      for (const permission of permissions) visit(permission, [], bases);
      return [...bases];
    },
  };
}
