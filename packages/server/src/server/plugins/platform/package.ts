import satisfies from "semver/functions/satisfies.js";
import valid from "semver/functions/valid.js";
import { z } from "zod";
import {
  PLUGIN_PLATFORM_API_VERSION,
  type PluginPlatformManifest,
  type PlatformCatalogEntry,
  type PlatformExtensionPoint,
} from "@getpaseo/protocol/plugin-platform";
import {
  parsePlatformService,
  parsePlatformExtensionPoint,
  PluginPlatformError,
} from "@getpaseo/protocol/plugin-platform-validation";
import { assertPluginCompatibility } from "@getpaseo/protocol/plugin-requirements";
import { STANDARD_PLATFORM_EXTENSION_POINTS } from "@getpaseo/protocol/plugin-platform-contributions";
import { PluginSchemaFiles, platformDigest } from "./schema-files.js";

interface LoadedExtension {
  definition: PlatformExtensionPoint;
  schemaDigest: string;
  validate(value: unknown): void;
}
type SettingsDeclaration = PluginPlatformManifest["settings"][number];
/** A settings declaration with the validators of its packaged schema. */
export interface LoadedSettings {
  readonly declaration: SettingsDeclaration;
  /** Changes whenever the declaration or the schema documents it references change. */
  readonly digest: string;
  /** Returns why a complete settings value breaks the schema, or null when it conforms. */
  checkValue(value: unknown): string | null;
  /** Returns why a value breaks one declared field's schema, or null when it conforms. */
  checkField(path: string, value: unknown): string | null;
  /** The schema default of a declared field, or undefined when it has none. */
  defaultOf(path: string): unknown;
}
export interface LoadedPlatformPackage {
  package: NonNullable<PlatformCatalogEntry["package"]>;
  services: PlatformCatalogEntry["services"];
  extensions: LoadedExtension[];
  settings: ReadonlyMap<string, LoadedSettings>;
  /** Returns why a method input or output breaks its contract, or null when it conforms. */
  checkMethodValue(value: MethodValue): string | null;
}
export interface MethodValue {
  serviceId: string;
  apiVersion: string;
  method: string;
  field: "input" | "output";
  value: unknown;
}
export interface PlatformPackageInput {
  directory: string;
  manifest: PluginPlatformManifest;
  daemonVersion: string;
  origin: PlatformCatalogEntry["origin"];
}

function methodKey(serviceId: string, apiVersion: string, method: string): string {
  return `${serviceId}@${apiVersion}:${method}`;
}

function assertOwned(id: string, manifest: PluginPlatformManifest): void {
  const publisher = manifest.packageId.split("/")[0]!;
  if (!id.startsWith(publisher + ".")) {
    throw new PluginPlatformError({
      code: "MANIFEST_MISMATCH",
      message: `Definition ${id} is outside publisher namespace ${publisher}`,
    });
  }
}

function checkEnvironment(input: PlatformPackageInput): void {
  const { manifest, origin } = input;
  assertPluginCompatibility({ ...manifest, version: input.daemonVersion, runtime: "daemon" });
  if (!satisfies(PLUGIN_PLATFORM_API_VERSION, manifest.requirements.helmPlatform)) {
    throw new PluginPlatformError({
      code: "UNSUPPORTED_FEATURE",
      message: `Plugin requires platform ${manifest.requirements.helmPlatform}`,
    });
  }
  const isolated = Object.values(manifest.runtimes).some(
    (runtime) => runtime.execution === "isolated",
  );
  if (isolated)
    throw new PluginPlatformError({
      code: "UNSUPPORTED_FEATURE",
      message: "Isolated plugin execution is not supported",
    });
  if (manifest.provides.some((provider) => provider.runtime === "desktop")) {
    throw new PluginPlatformError({
      code: "NO_EXECUTION_ROUTE",
      message: `Desktop providers belong to the client broker, not a ${origin} daemon installation`,
    });
  }
}

const SchemaObjectSchema = z.record(z.string(), z.unknown());

/** The schema of a declared field, reached through nested `properties`, or null when undeclared. */
function fieldSchema(
  schema: Record<string, unknown>,
  path: string,
): Record<string, unknown> | null {
  let cursor: unknown = schema;
  for (const segment of path.slice(1).split("/")) {
    const properties = SchemaObjectSchema.safeParse(
      SchemaObjectSchema.safeParse(cursor).data?.properties,
    );
    if (!properties.success) return null;
    cursor = properties.data[segment.replaceAll("~1", "/").replaceAll("~0", "~")];
  }
  return SchemaObjectSchema.safeParse(cursor).data ?? null;
}

function loadSettings(input: {
  manifest: PluginPlatformManifest;
  declaration: SettingsDeclaration;
  document: SchemaDocument;
  files: PluginSchemaFiles;
}): LoadedSettings {
  const { manifest, declaration, document, files } = input;
  const providers = manifest.provides.filter((provider) => provider.settingsId === declaration.id);
  const providerScopes = new Set(providers.flatMap((provider) => provider.scopes));
  const fieldSchemas = new Map<string, Record<string, unknown>>();
  const fieldIds = new Map<string, string>();
  for (const field of declaration.fields) {
    const schema = fieldSchema(document.value, field.path);
    if (!schema)
      throw new PluginPlatformError({
        code: "MANIFEST_MISMATCH",
        message: `Undeclared settings field ${field.path}`,
      });
    // Restarting is per provider, so a field that restarts one cannot vary by a narrower scope.
    const restartsProvider = field.application === "provider" || field.restartRequired;
    if (restartsProvider && field.allowedScopes.some((scope) => !providerScopes.has(scope))) {
      throw new PluginPlatformError({
        code: "MANIFEST_MISMATCH",
        message: `Settings field ${field.path} exceeds the lifetime scopes of the providers it restarts`,
      });
    }
    const pointer = field.path
      .slice(1)
      .split("/")
      .map((segment) => `/properties/${encodeURIComponent(segment)}`)
      .join("");
    const id = `${document.id}#${pointer}`;
    files.compile(id);
    fieldSchemas.set(field.path, schema);
    fieldIds.set(field.path, id);
  }
  function requireField(path: string): string {
    const id = fieldIds.get(path);
    if (id) return id;
    throw new PluginPlatformError({
      code: "INVALID_ARGUMENT",
      message: `Settings ${declaration.id} do not declare field ${path}`,
    });
  }
  return {
    declaration,
    digest: platformDigest({ declaration, schema: files.digest(document) }),
    checkValue: (value) => files.check(document.id, value),
    checkField: (path, value) => files.check(requireField(path), value),
    defaultOf(path) {
      requireField(path);
      const schema = fieldSchemas.get(path)!;
      return "default" in schema ? structuredClone(schema.default) : undefined;
    },
  };
}

const ContributionReferencesSchema = z.object({
  requiredServices: z.array(z.string()).optional(),
  requiresContributions: z.array(z.string()).optional(),
  bindingKey: z.string().optional(),
  serviceId: z.string().optional(),
  range: z.string().optional(),
  viewStateId: z.string().optional(),
  settingsId: z.string().optional(),
  cardContributionId: z.string().optional(),
});

export function validateContributionReferences(manifest: PluginPlatformManifest): void {
  for (const contribution of manifest.contributions) {
    if (
      !STANDARD_PLATFORM_EXTENSION_POINTS.some(
        (extension) => extension.extensionPointId === contribution.extensionPoint.id,
      )
    )
      continue;
    const data = ContributionReferencesSchema.parse(contribution.data);
    const dependencies = manifest.requires.filter(
      (dependency) =>
        dependency.consumer.kind === "contribution" && dependency.consumer.id === contribution.id,
    );
    for (const key of data.requiredServices ?? []) {
      if (!dependencies.some((dependency) => dependency.bindingKey === key))
        throw new PluginPlatformError({
          code: "MANIFEST_MISMATCH",
          message: `Contribution ${contribution.id} references undeclared dependency ${key}`,
        });
    }
    for (const id of data.requiresContributions ?? []) {
      if (!manifest.contributions.some((item) => item.id === id))
        throw new PluginPlatformError({
          code: "MANIFEST_MISMATCH",
          message: `Contribution ${contribution.id} references missing contribution ${id}`,
        });
    }
    if (data.bindingKey) {
      const dependency = dependencies.find((item) => item.bindingKey === data.bindingKey);
      const matches =
        dependency && dependency.serviceId === data.serviceId && dependency.range === data.range;
      if (!matches)
        throw new PluginPlatformError({
          code: "MANIFEST_MISMATCH",
          message: `Contribution ${contribution.id} projection differs from its dependency`,
        });
    }
    validateContributionState(manifest, data);
  }
}

function validateContributionState(
  manifest: PluginPlatformManifest,
  data: z.infer<typeof ContributionReferencesSchema>,
): void {
  if (
    data.viewStateId &&
    !manifest.states.some(
      (state) =>
        state.id === data.viewStateId && state.owner === "view" && state.runtime === "client",
    )
  ) {
    throw new PluginPlatformError({
      code: "MANIFEST_MISMATCH",
      message: `Unknown view state: ${data.viewStateId}`,
    });
  }
  if (data.settingsId && !manifest.settings.some((settings) => settings.id === data.settingsId)) {
    throw new PluginPlatformError({
      code: "MANIFEST_MISMATCH",
      message: `Unknown settings: ${data.settingsId}`,
    });
  }
  if (
    data.cardContributionId &&
    !manifest.contributions.some(
      (contribution) =>
        contribution.id === data.cardContributionId &&
        contribution.extensionPoint.id === "helm.ui.card",
    )
  ) {
    throw new PluginPlatformError({
      code: "MANIFEST_MISMATCH",
      message: `Unknown navigation card: ${data.cardContributionId}`,
    });
  }
}

type SchemaDocument = Awaited<ReturnType<PluginSchemaFiles["read"]>>;

async function readAssets(
  files: PluginSchemaFiles,
  manifest: PluginPlatformManifest,
): Promise<SchemaDocument[]> {
  const schemas: SchemaDocument[] = [];
  for (const runtime of Object.values(manifest.runtimes)) await files.asset(runtime.entry);
  if (manifest.icon) await files.asset(manifest.icon);
  for (const contribution of manifest.contributions) {
    if (
      !STANDARD_PLATFORM_EXTENSION_POINTS.some(
        (extension) => extension.extensionPointId === contribution.extensionPoint.id,
      )
    )
      continue;
    const assets = z
      .object({
        configurationSchema: z.string().optional(),
        itemSchema: z.string().optional(),
        tokens: z.string().optional(),
        path: z.string().optional(),
      })
      .parse(contribution.data);
    for (const schema of [assets.configurationSchema, assets.itemSchema]) {
      if (schema) schemas.push(await files.read(schema));
    }
    if (assets.tokens) await files.asset(assets.tokens);
    if (assets.path) await files.asset(assets.path);
  }
  return schemas;
}

export async function loadPlatformPackage(
  input: PlatformPackageInput,
): Promise<LoadedPlatformPackage> {
  checkEnvironment(input);
  const { manifest } = input;
  const files = new PluginSchemaFiles(input.directory, manifest.packageId);
  const packageFile = await files.readMetadata("package.json");
  const metadata = z
    .object({ name: z.string().min(1), version: z.string().min(1) })
    .parse(packageFile.value);
  if (valid(metadata.version) !== metadata.version)
    throw new PluginPlatformError({
      code: "INVALID_MANIFEST",
      message: "package.json must declare an exact semantic version",
    });
  const services: LoadedPlatformPackage["services"] = [];
  const methodSchemas = new Map<string, string>();
  const extensions: LoadedExtension[] = [];
  const contracts = await Promise.all(
    manifest.contracts.map((contract) => files.readMetadata(contract.schema)),
  );
  const extensionFiles = await Promise.all(
    manifest.extensionPoints.map((extension) => files.readMetadata(extension.schema)),
  );
  const settingsFiles = await Promise.all(
    manifest.settings.map((settings) => files.read(settings.schema)),
  );
  const stateFiles = await Promise.all(manifest.states.map((state) => files.read(state.schema)));
  const extraSchemas = await readAssets(files, manifest);
  await files.prepare();
  for (const [index, document] of contracts.entries()) {
    const contract = manifest.contracts[index]!;
    const definition = parsePlatformService(document.value);
    assertOwned(definition.serviceId, manifest);
    if (
      definition.serviceId !== contract.serviceId ||
      definition.apiVersion !== contract.apiVersion
    )
      throw new PluginPlatformError({
        code: "MANIFEST_MISMATCH",
        message: `Contract file does not match declaration: ${contract.schema}`,
      });
    for (const method of Object.keys(definition.methods)) {
      files.compile(`${document.id}#/methods/${method}/input`);
      files.compile(`${document.id}#/methods/${method}/output`);
      methodSchemas.set(
        methodKey(definition.serviceId, definition.apiVersion, method),
        `${document.id}#/methods/${method}`,
      );
    }
    for (const [name, event] of Object.entries(definition.events)) {
      const fields =
        event.delivery === "snapshot" ? ["snapshotSchema", "deltaSchema"] : ["payload"];
      for (const field of fields)
        if (field in event) files.compile(`${document.id}#/events/${name}/${field}`);
    }
    for (const name of Object.keys(definition.interceptors)) {
      files.compile(`${document.id}#/interceptors/${name}/input`);
      files.compile(`${document.id}#/interceptors/${name}/output`);
    }
    services.push({ definition, schemaDigest: files.digest(document) });
  }
  for (const [index, document] of extensionFiles.entries()) {
    const declaration = manifest.extensionPoints[index]!;
    const definition = parsePlatformExtensionPoint(document.value);
    assertOwned(definition.extensionPointId, manifest);
    if (
      definition.extensionPointId !== declaration.id ||
      definition.apiVersion !== declaration.apiVersion
    )
      throw new PluginPlatformError({
        code: "MANIFEST_MISMATCH",
        message: `Extension-point file does not match declaration: ${declaration.schema}`,
      });
    const schemaId = `${document.id}#/dataSchema`;
    files.compile(schemaId);
    extensions.push({
      definition,
      schemaDigest: files.digest(document),
      validate: (value) => files.validate(schemaId, value),
    });
  }
  for (const document of [...settingsFiles, ...stateFiles, ...extraSchemas])
    files.compile(document.id);
  const settings = new Map<string, LoadedSettings>();
  for (const [index, document] of settingsFiles.entries()) {
    const declaration = manifest.settings[index]!;
    settings.set(declaration.id, loadSettings({ manifest, declaration, document, files }));
  }
  validateContributionReferences(manifest);
  return {
    package: metadata,
    services,
    extensions,
    settings,
    checkMethodValue({ serviceId, apiVersion, method, field, value }) {
      const schema = methodSchemas.get(methodKey(serviceId, apiVersion, method));
      if (!schema)
        throw new PluginPlatformError({
          code: "INVALID_CONTRACT",
          message: `Method schema is unavailable: ${serviceId}.${method}`,
        });
      return files.check(`${schema}/${field}`, value);
    },
  };
}
