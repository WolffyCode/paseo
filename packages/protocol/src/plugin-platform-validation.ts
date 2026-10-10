import { z } from "zod";
import valid from "semver/functions/valid.js";
import validRange from "semver/ranges/valid.js";
import {
  PluginPlatformManifestSchema,
  PlatformServiceSchema,
  PlatformExtensionPointSchema,
  type PluginPlatformManifest,
  type PlatformDiagnostic,
  type PlatformService,
  type PlatformExtensionPoint,
} from "./plugin-platform.js";

export class PluginPlatformError extends Error {
  constructor(readonly diagnostic: PlatformDiagnostic) {
    super(diagnostic.message);
    this.name = "PluginPlatformError";
  }
}

function invalid(message: string): never {
  throw new PluginPlatformError({ code: "INVALID_MANIFEST", message });
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) invalid(`Duplicate ${label}`);
}

function range(value: string): void {
  if (validRange(value) === null) invalid(`Invalid semantic version range: ${value}`);
}

function version(value: string): void {
  if (valid(value) !== value) invalid(`Invalid semantic version: ${value}`);
}

function validatePackageKind(manifest: PluginPlatformManifest): void {
  const runtimeCount = Object.keys(manifest.runtimes).length;
  if (manifest.kind === "code") {
    if (!runtimeCount) invalid("A code package needs a runtime entry");
    return;
  }
  const executable =
    runtimeCount ||
    manifest.provides.length ||
    manifest.states.length ||
    manifest.settings.length ||
    manifest.build;
  if (executable)
    invalid(
      "Resource packages cannot contain executable entries, providers, settings, state or build commands",
    );
  for (const contribution of manifest.contributions) {
    const allowed = ["helm.agent.skill", "helm.ui.theme"].includes(contribution.extensionPoint.id);
    if (!allowed || contribution.runtime !== "installation")
      invalid("Resource package contributions must be static Skills or themes");
  }
}

function validateDependencies(manifest: PluginPlatformManifest): void {
  const keys = manifest.requires.map(
    (dependency) => JSON.stringify(dependency.consumer) + ":" + dependency.bindingKey,
  );
  unique(keys, "consumer binding key");
  for (const dependency of manifest.requires) {
    range(dependency.range);
    const consumer = dependency.consumer;
    let declared: boolean;
    switch (consumer.kind) {
      case "runtime":
        declared = manifest.runtimes[consumer.runtime] !== undefined;
        break;
      case "provider":
        declared = manifest.provides.some((item) => item.id === consumer.id);
        break;
      case "contribution":
        declared = manifest.contributions.some((item) => item.id === consumer.id);
        break;
    }
    if (!declared) invalid(`Dependency ${dependency.bindingKey} references an undeclared consumer`);
  }
}

function validateTransitions(
  definition: PluginPlatformManifest["states"][number] | PluginPlatformManifest["settings"][number],
): void {
  unique(
    definition.transitions.map((transition) => String(transition.from)),
    "state transition source",
  );
  const edges = new Map(
    definition.transitions.map((transition) => [transition.from, transition.to]),
  );
  for (const start of edges.keys()) {
    const seen = new Set<number>();
    let current: number | undefined = start;
    while (current !== undefined) {
      if (seen.has(current)) invalid(`State transition cycle in ${definition.id}`);
      seen.add(current);
      current = edges.get(current);
    }
  }
}

function validateStateDefinitions(manifest: PluginPlatformManifest): void {
  for (const definition of [...manifest.settings, ...manifest.states])
    validateTransitions(definition);
  for (const state of manifest.states) {
    if (!manifest.runtimes[state.runtime])
      invalid(`State ${state.id} has no ${state.runtime} entry`);
    if (state.owner === "view" && state.runtime !== "client")
      invalid(`View state ${state.id} must belong to a client`);
    unique(state.readableVersions.map(String), "readable state version");
    if (!state.readableVersions.includes(state.schemaVersion))
      invalid(`State ${state.id} cannot read its current version`);
  }
  for (const settings of manifest.settings) {
    unique(settings.allowedScopes, "settings scope");
    unique(
      settings.fields.map((field) => field.path),
      "settings field",
    );
    if (settings.transitions.length && !manifest.runtimes[settings.migrationRuntime])
      invalid(`Settings ${settings.id} has no migration runtime`);
    for (const field of settings.fields) {
      unique(field.allowedScopes, "field scope");
      if (field.allowedScopes.some((scope) => !settings.allowedScopes.includes(scope)))
        invalid(`Settings field ${field.path} exceeds its allowed scopes`);
      // Fields are the leaves layers override, so one cannot contain another.
      const nested = settings.fields.find((other) => other.path.startsWith(`${field.path}/`));
      if (nested) invalid(`Settings field ${field.path} contains field ${nested.path}`);
      // A provider reads its configuration once, when it is created.
      if (field.application === "provider" && !field.restartRequired)
        invalid(`Provider settings field ${field.path} must be restart-required`);
    }
  }
}

function validateProviderDeclarations(manifest: PluginPlatformManifest): void {
  for (const provider of manifest.provides) {
    version(provider.apiVersion);
    unique(provider.scopes, "provider scope");
    const entry = provider.runtime === "desktop" ? "client" : provider.runtime;
    if (!manifest.runtimes[entry]) invalid(`Provider ${provider.id} has no ${entry} entry`);
    if (
      provider.settingsId &&
      !manifest.settings.some((settings) => settings.id === provider.settingsId)
    )
      invalid(`Provider ${provider.id} references unknown settings`);
    if (
      provider.stateId &&
      !manifest.states.some(
        (state) =>
          state.id === provider.stateId && state.owner === "provider" && state.runtime === entry,
      )
    )
      invalid(`Provider ${provider.id} references incompatible state`);
  }
}

function validateContributionDeclarations(manifest: PluginPlatformManifest): void {
  for (const contribution of manifest.contributions) {
    range(contribution.extensionPoint.range);
    if (
      contribution.settingsId &&
      !manifest.settings.some((settings) => settings.id === contribution.settingsId)
    )
      invalid(`Contribution ${contribution.id} references unknown settings`);
    if (
      contribution.stateId &&
      !manifest.states.some(
        (state) => state.id === contribution.stateId && state.owner === "instance",
      )
    )
      invalid(`Contribution ${contribution.id} references incompatible instance state`);
  }
}

export function parsePluginPlatformManifest(input: unknown): PluginPlatformManifest {
  const manifest = PluginPlatformManifestSchema.parse(input);
  range(manifest.requirements.paseo);
  range(manifest.requirements.helmPlatform);
  unique(manifest.requirements.features ?? [], "required feature");
  if (manifest.runtimes.client) unique(manifest.runtimes.client.platforms, "client platform");
  if (manifest.build?.some((command) => command.some((argument) => !argument.trim())))
    invalid("Build arguments must not be blank");
  for (const entries of [
    manifest.provides,
    manifest.contributions,
    manifest.settings,
    manifest.states,
  ])
    unique(
      entries.map((entry) => entry.id),
      "declaration ID",
    );
  unique(
    manifest.contracts.map((contract) => `${contract.serviceId}@${contract.apiVersion}`),
    "service definition",
  );
  unique(
    manifest.extensionPoints.map((extension) => `${extension.id}@${extension.apiVersion}`),
    "extension-point definition",
  );
  for (const entry of [...manifest.contracts, ...manifest.extensionPoints])
    version(entry.apiVersion);
  validatePackageKind(manifest);
  validateDependencies(manifest);
  validateStateDefinitions(manifest);
  validateProviderDeclarations(manifest);
  validateContributionDeclarations(manifest);
  return manifest;
}

export function parsePlatformService(input: unknown): PlatformService {
  const service = PlatformServiceSchema.parse(input);
  version(service.apiVersion);
  unique(service.inspectPermissions, "inspection permission");
  if (!Object.keys(service.methods).length) invalid(`Service ${service.serviceId} needs a method`);
  if (!service.serviceId.startsWith(service.ownerNamespace + "."))
    invalid("Service ID is outside its owner namespace");
  for (const [name, method] of Object.entries(service.methods)) {
    const query = method.mode === "query";
    if (query !== (method.retry === "read")) invalid(`Method ${name} has an invalid retry policy`);
    if (method.retry === "durable" && !method.observationPermissions)
      invalid(`Method ${name} needs observation permissions`);
    if (
      method.mode === "presentation" &&
      (method.runtime === "daemon" || method.retry !== "no-replay")
    )
      invalid(`Presentation method ${name} needs a client and no-replay policy`);
    if (method.input.type !== "object") invalid(`Method ${name} input must be an object schema`);
    unique(method.permissions, "method permission");
    unique(method.observationPermissions ?? [], "operation observation permission");
    unique(method.resourceKinds ?? [], "method resource kind");
    unique(method.requiredEnvelopeFields ?? [], "required envelope field");
    unique(method.targets, "method target");
  }
  for (const [name, event] of Object.entries(service.events)) {
    unique(event.permissions, "event permission");
    unique(event.resourceKinds ?? [], "event resource kind");
    unique(event.targets, "event target");
    if (event.targets.includes("resource") && !event.resourceKinds)
      invalid(`Event ${name} needs resource kinds`);
  }
  return service;
}

export function parsePlatformExtensionPoint(input: unknown): PlatformExtensionPoint {
  const extension = PlatformExtensionPointSchema.parse(input);
  version(extension.apiVersion);
  range(extension.hostService.range);
  return extension;
}

export function platformDiagnostic(error: unknown): PlatformDiagnostic {
  if (error instanceof PluginPlatformError) return error.diagnostic;
  if (error instanceof z.ZodError) return { code: "INVALID_MANIFEST", message: error.message };
  if (error instanceof Error) return { code: "INVALID_CONTRACT", message: error.message };
  return { code: "INVALID_CONTRACT", message: String(error) };
}
