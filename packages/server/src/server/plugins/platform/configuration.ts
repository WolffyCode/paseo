import path from "node:path";
import stableStringify from "fast-json-stable-stringify";
import type { PlatformProvider, PlatformScope } from "@getpaseo/protocol/plugin-platform";
import type { PlatformEffectiveConfiguration } from "@getpaseo/protocol/plugin-platform-execution";
import {
  MISSING_SETTINGS_REVISION,
  PluginSettingsDocuments,
  SettingsEnvelopeSchema,
  serializeSettings,
  type SettingsDocument,
} from "../settings/documents.js";
import { PlatformDetailedError, executionError } from "./execution-errors.js";
import type { LoadedPlatformPackage, LoadedSettings } from "./package.js";
import { platformDigest } from "./schema-files.js";
import type { PlatformLayerScope, PlatformScopes } from "./scopes.js";

type JsonObject = Record<string, unknown>;
type FieldApplication = "provider" | "invocation";

/** The installation whose declared settings a configuration request addresses. */
export interface SettingsOwner {
  readonly installation: { readonly installationId: string };
  readonly loaded: LoadedPlatformPackage;
}
/** A provider's lifecycle settings and the identity of the values that restart it. */
export interface ProviderConfiguration {
  readonly config: PlatformEffectiveConfiguration;
  readonly restartDigest: string;
}
export interface ConfigurationChange {
  readonly revision: string;
  /** Whether a restart-required value changed, so the providers using these settings restart. */
  readonly restartsProviders: boolean;
}
interface LayerRequest {
  readonly owner: SettingsOwner;
  readonly settingsId: string;
  readonly scope: PlatformScope;
}
interface LayerChange extends LayerRequest {
  readonly expectedRevision: string;
}
interface Layer {
  readonly scope: PlatformLayerScope;
  readonly revision: string;
  /** Override values keyed by declared field path. */
  readonly overrides: ReadonlyMap<string, unknown>;
}
type ParsedLayer =
  | { readonly status: "ok"; readonly layer: Layer }
  | { readonly status: "invalid"; readonly error: PlatformDetailedError };
type Overrides =
  | { readonly status: "ok"; readonly overrides: Map<string, unknown> }
  | { readonly status: "invalid"; readonly problem: string };

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pointerSegments(pointer: string): string[] {
  return pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function valueAt(values: JsonObject, pointer: string): unknown {
  let cursor: unknown = values;
  for (const segment of pointerSegments(pointer)) {
    if (!isJsonObject(cursor)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function setAt(values: JsonObject, pointer: string, value: unknown): void {
  const segments = pointerSegments(pointer);
  const last = segments.pop()!;
  let cursor = values;
  for (const segment of segments) {
    const next = cursor[segment];
    if (isJsonObject(next)) {
      cursor = next;
      continue;
    }
    const created: JsonObject = {};
    cursor[segment] = created;
    cursor = created;
  }
  cursor[last] = value;
}

function nestedValues(overrides: ReadonlyMap<string, unknown>): JsonObject {
  const values: JsonObject = {};
  for (const [pointer, value] of overrides) setAt(values, pointer, value);
  return values;
}

function isSameOverrides(
  left: ReadonlyMap<string, unknown>,
  right: ReadonlyMap<string, unknown>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [pointer, value] of left) {
    if (!right.has(pointer) || stableStringify(right.get(pointer)) !== stableStringify(value))
      return false;
  }
  return true;
}

function layerName(settingsId: string, scope: PlatformLayerScope): string {
  if (scope.kind === "host") return `${settingsId}.json`;
  if (scope.kind === "project")
    return path.join(settingsId, "projects", `${encodeURIComponent(scope.projectId)}.json`);
  return path.join(settingsId, "conversations", `${encodeURIComponent(scope.conversationId)}.json`);
}

/** Splits layer values into overrides of declared fields; anything else is reported. */
function collectOverrides(
  settings: LoadedSettings,
  values: unknown,
  scope: PlatformLayerScope["kind"],
): Overrides {
  const { fields } = settings.declaration;
  const overrides = new Map<string, unknown>();
  const problems: string[] = [];
  function visit(value: unknown, pointer: string): void {
    const field = fields.find((item) => item.path === pointer);
    if (field) {
      const problem = field.allowedScopes.includes(scope)
        ? settings.checkField(pointer, value)
        : `not allowed at ${scope} scope`;
      if (problem) problems.push(`${pointer}: ${problem}`);
      else overrides.set(pointer, value);
      return;
    }
    // Objects between the root and the declared fields only group them.
    const isContainer = fields.some((item) => item.path.startsWith(`${pointer}/`));
    if (!isContainer) {
      problems.push(`${pointer}: not a declared field`);
      return;
    }
    if (!isJsonObject(value)) {
      problems.push(pointer ? `${pointer}: must be an object` : "values must be an object");
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
    }
  }
  visit(values, "");
  if (problems.length) return { status: "invalid", problem: problems.join("; ") };
  return { status: "ok", overrides };
}

function invalidLayer(scope: PlatformLayerScope, revision: string, problem: string) {
  return new PlatformDetailedError(
    { code: "CONFIG_INVALID", message: `The ${scope.kind} settings layer is invalid: ${problem}` },
    { scope, revision },
  );
}

/** Reads a stored layer without changing it; a broken layer keeps its text and reports why. */
function parseLayer(
  settings: LoadedSettings,
  scope: PlatformLayerScope,
  document: SettingsDocument,
): ParsedLayer {
  const { revision } = document;
  if (document.raw === null)
    return { status: "ok", layer: { scope, revision, overrides: new Map() } };
  let stored: unknown;
  try {
    stored = JSON.parse(document.raw);
  } catch {
    return { status: "invalid", error: invalidLayer(scope, revision, "it is not JSON") };
  }
  const envelope = SettingsEnvelopeSchema.safeParse(stored);
  if (!envelope.success) {
    return {
      status: "invalid",
      error: invalidLayer(scope, revision, "it is not a settings document"),
    };
  }
  const { schemaVersion } = settings.declaration;
  if (envelope.data.version !== schemaVersion) {
    const problem = `it was saved for schema version ${envelope.data.version}, not ${schemaVersion}`;
    return { status: "invalid", error: invalidLayer(scope, revision, problem) };
  }
  const collected = collectOverrides(settings, envelope.data.values, scope.kind);
  if (collected.status === "invalid") {
    return { status: "invalid", error: invalidLayer(scope, revision, collected.problem) };
  }
  return { status: "ok", layer: { scope, revision, overrides: collected.overrides } };
}

/** Applies layers field by field, deepest last, then the schema defaults of fields still unset. */
function compose(
  settings: LoadedSettings,
  layers: readonly Layer[],
): PlatformEffectiveConfiguration {
  const values: JsonObject = {};
  const provenance: PlatformEffectiveConfiguration["provenance"] = {};
  for (const field of settings.declaration.fields) {
    const layer = layers.findLast((item) => item.overrides.has(field.path));
    if (layer) {
      setAt(values, field.path, structuredClone(layer.overrides.get(field.path)));
      provenance[field.path] = { source: "layer", scope: layer.scope, revision: layer.revision };
      continue;
    }
    const fallback = settings.defaultOf(field.path);
    if (fallback === undefined) continue;
    setAt(values, field.path, fallback);
    provenance[field.path] = { source: "schema-default" };
  }
  const sourceRevisions = layers.map(({ scope, revision }) => ({ scope, revision }));
  const effectiveRevision = platformDigest({ settings: settings.digest, layers: sourceRevisions });
  return { values, effectiveRevision, sourceRevisions, provenance };
}

/** The settings of a provider that declares none. */
function emptyConfiguration(): PlatformEffectiveConfiguration {
  return {
    values: {},
    effectiveRevision: platformDigest(null),
    sourceRevisions: [],
    provenance: {},
  };
}

/** The fields of one application, as a provider or a call receives them. */
function project(
  settings: LoadedSettings,
  configuration: PlatformEffectiveConfiguration,
  application: FieldApplication,
): PlatformEffectiveConfiguration {
  const values: JsonObject = {};
  const provenance: PlatformEffectiveConfiguration["provenance"] = {};
  for (const field of settings.declaration.fields) {
    if (field.application !== application) continue;
    const value = valueAt(configuration.values, field.path);
    if (value !== undefined) setAt(values, field.path, structuredClone(value));
    const origin = configuration.provenance[field.path];
    if (origin) provenance[field.path] = origin;
  }
  const { effectiveRevision, sourceRevisions } = configuration;
  return { values, effectiveRevision, sourceRevisions, provenance };
}

/** Identifies the values that only reach providers through a restart. */
function restartDigest(
  settings: LoadedSettings,
  configuration: PlatformEffectiveConfiguration,
): string {
  const fields = settings.declaration.fields.filter(
    (field) => field.restartRequired || field.application === "provider",
  );
  return platformDigest(
    fields.map((field) => ({ path: field.path, value: valueAt(configuration.values, field.path) })),
  );
}

/**
 * The v1 configuration owner: layered settings documents per installation, merged from host to
 * conversation. Layers hold overrides only; every write checks the layer's revision first and
 * validates the merged result before replacing the document.
 */
export class PlatformConfiguration {
  private readonly directory: string | null;
  private readonly scopes: PlatformScopes;
  private queue: Promise<unknown> = Promise.resolve();

  /** Without a directory, this host stores no settings and providers that declare some fail. */
  constructor(input: { directory: string | null; scopes: PlatformScopes }) {
    this.directory = input.directory;
    this.scopes = input.scopes;
  }

  get isAvailable(): boolean {
    return this.directory !== null;
  }

  /** The settings a provider is created with, at its lifetime scope. */
  async providerConfiguration(input: {
    owner: SettingsOwner;
    provider: PlatformProvider;
    scope: PlatformScope;
  }): Promise<ProviderConfiguration> {
    const { owner, provider, scope } = input;
    if (!provider.settingsId)
      return { config: emptyConfiguration(), restartDigest: platformDigest(null) };
    const request = { owner, settingsId: provider.settingsId, scope };
    const settings = this.settingsOf(request);
    const configuration = await this.read(request);
    return {
      config: project(settings, configuration, "provider"),
      restartDigest: restartDigest(settings, configuration),
    };
  }

  /** The settings one call receives, at the call's business scope. */
  async invocationConfiguration(input: {
    owner: SettingsOwner;
    provider: PlatformProvider;
    scope: PlatformScope;
  }): Promise<PlatformEffectiveConfiguration> {
    const { owner, provider, scope } = input;
    if (!provider.settingsId) return emptyConfiguration();
    const request = { owner, settingsId: provider.settingsId, scope };
    return project(this.settingsOf(request), await this.read(request), "invocation");
  }

  /** The effective value of every declared field at a scope. */
  async read(input: LayerRequest): Promise<PlatformEffectiveConfiguration> {
    const settings = this.settingsOf(input);
    const layers = await this.layersOf(settings, input.scope);
    const documents = this.documentsOf(input.owner);
    const stored = await Promise.all(
      layers.map((scope) => this.readLayer({ documents, settings, scope })),
    );
    const configuration = compose(settings, stored);
    const problem = settings.checkValue(configuration.values);
    if (!problem) return configuration;
    const reason = `the merged settings break the schema: ${problem}`;
    // The deepest layer is the most specific place to fix a merged value.
    const target = stored.at(-1);
    if (target) throw invalidLayer(target.scope, target.revision, reason);
    throw executionError(
      "CONFIG_INVALID",
      `Settings ${settings.declaration.id} have no valid value at ${input.scope.kind} scope: ${reason}`,
    );
  }

  /** Replaces the scope's override layer; omitted fields inherit again. */
  async write(input: LayerChange & { values: unknown }): Promise<ConfigurationChange> {
    const settings = this.settingsOf(input);
    const layers = await this.writableLayersOf(settings, input.scope);
    const collected = collectOverrides(settings, input.values, layers.at(-1)!.kind);
    if (collected.status === "invalid") throw executionError("INVALID_ARGUMENT", collected.problem);
    return this.commit({ ...input, settings, layers, next: () => collected.overrides });
  }

  /** Removes declared fields from the scope's override layer; absent fields change nothing. */
  async clear(input: LayerChange & { paths: readonly string[] }): Promise<ConfigurationChange> {
    const settings = this.settingsOf(input);
    const layers = await this.writableLayersOf(settings, input.scope);
    const undeclared = input.paths.find(
      (pointer) => !settings.declaration.fields.some((field) => field.path === pointer),
    );
    if (undeclared) {
      throw executionError(
        "INVALID_ARGUMENT",
        `Settings ${settings.declaration.id} do not declare field ${undeclared}`,
      );
    }
    return this.commit({
      ...input,
      settings,
      layers,
      next(current) {
        if (current.status === "invalid") throw current.error;
        const overrides = new Map(current.layer.overrides);
        for (const pointer of input.paths) overrides.delete(pointer);
        return overrides;
      },
    });
  }

  private commit(input: {
    owner: SettingsOwner;
    settings: LoadedSettings;
    layers: readonly PlatformLayerScope[];
    expectedRevision: string;
    next(current: ParsedLayer): ReadonlyMap<string, unknown>;
  }): Promise<ConfigurationChange> {
    return this.serial(async () => {
      const { settings, layers } = input;
      const documents = this.documentsOf(input.owner);
      const target = layers.at(-1)!;
      const name = layerName(settings.declaration.id, target);
      const stored = await documents.read(name);
      if (stored.revision !== input.expectedRevision) {
        throw executionError(
          "CONFIG_CONFLICT",
          `The ${target.kind} settings layer changed; reload it before saving`,
        );
      }
      const others = await Promise.all(
        layers.slice(0, -1).map((scope) => this.readLayer({ documents, settings, scope })),
      );
      const current = parseLayer(settings, target, stored);
      const overrides = input.next(current);
      const after = compose(settings, [
        ...others,
        { scope: target, revision: stored.revision, overrides },
      ]);
      const problem = settings.checkValue(after.values);
      if (problem) {
        throw executionError(
          "INVALID_ARGUMENT",
          `The merged settings break the schema: ${problem}`,
        );
      }
      if (current.status === "ok" && isSameOverrides(current.layer.overrides, overrides)) {
        return { revision: stored.revision, restartsProviders: false };
      }
      let revision = MISSING_SETTINGS_REVISION;
      if (overrides.size === 0) await documents.remove(name);
      else {
        const raw = serializeSettings(settings.declaration.schemaVersion, nestedValues(overrides));
        revision = await documents.write(name, raw);
      }
      // A layer that was broken before the write may have held any restart-required value.
      const before = current.status === "ok" ? compose(settings, [...others, current.layer]) : null;
      const restartsProviders =
        before === null || restartDigest(settings, before) !== restartDigest(settings, after);
      return { revision, restartsProviders };
    });
  }

  private async readLayer(input: {
    documents: PluginSettingsDocuments;
    settings: LoadedSettings;
    scope: PlatformLayerScope;
  }): Promise<Layer> {
    const { documents, settings, scope } = input;
    const document = await documents.read(layerName(settings.declaration.id, scope));
    const parsed = parseLayer(settings, scope, document);
    if (parsed.status === "invalid") throw parsed.error;
    return parsed.layer;
  }

  /** The scope's layers this settings definition allows, host first. */
  private async layersOf(
    settings: LoadedSettings,
    scope: PlatformScope,
  ): Promise<PlatformLayerScope[]> {
    const layers = await this.scopes.layers(scope);
    return layers.filter((layer) => settings.declaration.allowedScopes.includes(layer.kind));
  }

  private async writableLayersOf(
    settings: LoadedSettings,
    scope: PlatformScope,
  ): Promise<PlatformLayerScope[]> {
    const layers = await this.layersOf(settings, scope);
    if (layers.at(-1)?.kind !== scope.kind) {
      throw executionError(
        "INVALID_ARGUMENT",
        `Settings ${settings.declaration.id} cannot be set at ${scope.kind} scope`,
      );
    }
    return layers;
  }

  private settingsOf(request: LayerRequest): LoadedSettings {
    const settings = request.owner.loaded.settings.get(request.settingsId);
    if (settings) return settings;
    throw executionError(
      "RESOURCE_NOT_FOUND",
      `Plugin ${request.owner.installation.installationId} declares no settings ${request.settingsId}`,
    );
  }

  private documentsOf(owner: SettingsOwner): PluginSettingsDocuments {
    if (!this.directory) {
      throw executionError("UNSUPPORTED_FEATURE", "This host stores no plugin settings");
    }
    // The same directory holds the installation's legacy settings and is removed with it.
    return new PluginSettingsDocuments(
      path.join(this.directory, owner.installation.installationId),
    );
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(work);
    // The caller observes a failure through `pending`; the queue keeps serving later writes.
    this.queue = pending.catch(() => undefined);
    return pending;
  }
}
