import stableStringify from "fast-json-stable-stringify";
import satisfies from "semver/functions/satisfies.js";
import validRange from "semver/ranges/valid.js";
import { STANDARD_PLATFORM_EXTENSION_POINTS } from "@getpaseo/protocol/plugin-platform-contributions";
import {
  type PlatformCatalog,
  type PlatformCatalogEntry,
  type PlatformConsumer,
  type PlatformDependency,
  type PlatformDiagnostic,
  type PlatformProviderCandidate,
  type PlatformResolutionPlan,
  type PlatformResolvePlanInput,
  type PlatformService,
} from "@getpaseo/protocol/plugin-platform";
import { platformDigest } from "./schema-files.js";

type PlanNode = PlatformResolutionPlan["nodes"][number];
interface Candidate {
  value: PlatformProviderCandidate;
  definition: PlatformService;
  entry: PlatformCatalogEntry;
  nodeId: string;
}
interface DependencyNode {
  nodeId: string;
  entry: PlatformCatalogEntry;
  consumer: PlatformConsumer;
  requires: PlatformDependency[];
  configuring: boolean;
}
interface Selection {
  candidates: Candidate[];
  diagnostics: PlatformDiagnostic[];
}

function nodeId(installationId: string, consumer: PlatformConsumer, scope?: string): string {
  const id = consumer.kind === "runtime" ? consumer.runtime : consumer.id;
  const segments = [installationId, consumer.kind, id];
  if (scope) segments.push(scope);
  return segments.map(encodeURIComponent).join("/");
}

function scopeAvailable(
  scope: PlatformResolvePlanInput["scope"],
  providerScope: PlatformResolvePlanInput["providerScope"],
): boolean {
  if (scope.kind === "client") return providerScope === "client";
  if (providerScope === "host") return true;
  if (providerScope === "project") return "projectId" in scope && scope.projectId !== undefined;
  return providerScope === "conversation" && scope.kind === "conversation";
}

function collectCandidates(catalog: PlatformCatalog): Candidate[] {
  const enabled = catalog.entries.filter((entry) => entry.enabled && !entry.diagnostics.length);
  const services = enabled.flatMap((entry) => entry.services);
  const candidates: Candidate[] = [];
  for (const entry of enabled) {
    if (!entry.manifest) continue;
    for (const provider of entry.manifest.provides) {
      const service = services.find(
        (item) =>
          item.definition.serviceId === provider.serviceId &&
          item.definition.apiVersion === provider.apiVersion,
      );
      if (!service) continue;
      for (const scope of provider.scopes) {
        candidates.push({
          value: {
            provider: { installation: entry.installation, providesId: provider.id },
            serviceId: provider.serviceId,
            apiVersion: provider.apiVersion,
            schemaDigest: service.schemaDigest,
            runtime: provider.runtime,
            providerScope: scope,
            selectionKey: provider.selectionKey,
          },
          definition: service.definition,
          entry,
          nodeId: nodeId(
            entry.installation.installationId,
            { kind: "provider", id: provider.id },
            scope,
          ),
        });
      }
    }
  }
  return candidates;
}

function missingReason(
  catalog: PlatformCatalog,
  input: PlatformResolvePlanInput,
): PlatformDiagnostic {
  const matching = catalog.entries.filter((entry) =>
    entry.manifest?.provides.some((provider) => provider.serviceId === input.serviceId),
  );
  const invalid = matching.flatMap((entry) => entry.diagnostics);
  if (invalid.length) return invalid[0]!;
  if (matching.length && matching.every((entry) => !entry.enabled))
    return { code: "PROVIDER_DISABLED", message: `Providers for ${input.serviceId} are disabled` };
  return { code: "DEPENDENCY_MISSING", message: `No provider is declared for ${input.serviceId}` };
}

interface SelectionQuery {
  catalog: PlatformCatalog;
  candidates: Candidate[];
  input: PlatformResolvePlanInput;
  availability?: (candidate: Candidate) => PlanNode;
}

function selectAvailable(query: SelectionQuery, selected: Candidate[]): Selection {
  const ready: Candidate[] = [];
  const unavailable: PlatformDiagnostic[] = [];
  for (const candidate of selected) {
    const node = query.availability?.(candidate);
    if (!node || node.state === "resolved") {
      ready.push(candidate);
      continue;
    }
    if (node.state === "configuring")
      unavailable.push({
        code: "DEPENDENCY_MISSING",
        nodeId: node.nodeId,
        message: "Provider dependencies require instance configuration",
      });
    else unavailable.push(...node.diagnostics);
  }
  if (!ready.length) return { candidates: [], diagnostics: unavailable };
  if (query.input.mode === "one" && ready.length !== 1)
    return {
      candidates: [],
      diagnostics: [
        { code: "AMBIGUOUS_PROVIDER", message: `Select a provider for ${query.input.serviceId}` },
      ],
    };
  ready.sort((left, right) => {
    const leftKey = `${left.value.selectionKey ?? ""}:${stableStringify(left.value.provider)}`;
    const rightKey = `${right.value.selectionKey ?? ""}:${stableStringify(right.value.provider)}`;
    return leftKey < rightKey ? -1 : Number(leftKey > rightKey);
  });
  return { candidates: ready, diagnostics: query.input.mode === "many" ? unavailable : [] };
}

function select(query: SelectionQuery): Selection {
  const { catalog, candidates, input } = query;
  const compatible = candidates.filter(
    (candidate) => candidate.value.serviceId === input.serviceId,
  );
  if (!compatible.length) return { candidates: [], diagnostics: [missingReason(catalog, input)] };
  const versioned = compatible.filter((candidate) =>
    satisfies(candidate.value.apiVersion, input.range),
  );
  if (!versioned.length)
    return {
      candidates: [],
      diagnostics: [
        {
          code: "DEPENDENCY_VERSION",
          message: `No ${input.serviceId} provider satisfies ${input.range}`,
        },
      ],
    };
  const scoped = versioned.filter(
    (candidate) =>
      candidate.value.runtime === input.runtime &&
      candidate.value.providerScope === input.providerScope &&
      scopeAvailable(input.scope, candidate.value.providerScope),
  );
  const keys = scoped
    .filter((candidate) => candidate.definition.cardinality === "set")
    .map((candidate) => candidate.value.selectionKey);
  if (new Set(keys).size !== keys.length)
    return {
      candidates: [],
      diagnostics: [
        { code: "CONTRACT_CONFLICT", message: "Set providers have duplicate selection keys" },
      ],
    };
  const selected = scoped.filter((candidate) => {
    if (
      input.provider &&
      platformDigest(input.provider) !== platformDigest(candidate.value.provider)
    )
      return false;
    return input.selectionKey === undefined || input.selectionKey === candidate.value.selectionKey;
  });
  if (!selected.length)
    return {
      candidates: [],
      diagnostics: [
        {
          code: "NO_EXECUTION_ROUTE",
          message: `No matching provider at ${input.runtime}/${input.providerScope}`,
        },
      ],
    };
  if (
    input.mode === "many" &&
    selected.some((candidate) => candidate.definition.cardinality !== "set")
  )
    return {
      candidates: [],
      diagnostics: [
        {
          code: "MANIFEST_MISMATCH",
          message: "Multiple-provider resolution requires a set service",
        },
      ],
    };
  return selectAvailable(query, selected);
}

function collectNodes(catalog: PlatformCatalog): Map<string, DependencyNode> {
  const nodes = new Map<string, DependencyNode>();
  for (const entry of catalog.entries) {
    const manifest = entry.manifest;
    if (!entry.enabled || entry.diagnostics.length || !manifest) continue;
    function add(consumer: PlatformConsumer, scope?: string): void {
      const requires = manifest!.requires.filter(
        (dependency) => platformDigest(dependency.consumer) === platformDigest(consumer),
      );
      const id = nodeId(entry.installation.installationId, consumer, scope);
      const configuring = requires.some((dependency) => dependency.activation === "contextual");
      nodes.set(id, { nodeId: id, consumer, entry, requires, configuring });
    }
    if (manifest.runtimes.client) add({ kind: "runtime", runtime: "client" });
    if (manifest.runtimes.daemon) add({ kind: "runtime", runtime: "daemon" });
    for (const provider of manifest.provides)
      for (const scope of provider.scopes) add({ kind: "provider", id: provider.id }, scope);
    for (const contribution of manifest.contributions)
      add({ kind: "contribution", id: contribution.id });
  }
  return nodes;
}

function contributionEdges(node: DependencyNode): string[] {
  if (node.consumer.kind !== "contribution" || !node.entry.manifest) return [];
  const id = node.consumer.id;
  const contribution = node.entry.manifest.contributions.find((item) => item.id === id)!;
  const links = contribution.data.requiresContributions;
  if (!Array.isArray(links)) return [];
  const standard = STANDARD_PLATFORM_EXTENSION_POINTS.some(
    (extension) => extension.extensionPointId === contribution.extensionPoint.id,
  );
  if (!standard) return [];
  return links
    .filter((link): link is string => typeof link === "string")
    .map((link) =>
      nodeId(node.entry.installation.installationId, { kind: "contribution", id: link }),
    );
}

function missingExtension(node: DependencyNode, catalog: PlatformCatalog): PlatformDiagnostic[] {
  if (node.consumer.kind !== "contribution" || !node.entry.manifest) return [];
  const id = node.consumer.id;
  const contribution = node.entry.manifest.contributions.find((item) => item.id === id)!;
  const installed = catalog.entries
    .filter((entry) => entry.enabled && !entry.diagnostics.length)
    .flatMap((entry) => entry.extensionPoints.map((extension) => extension.definition));
  const definitions = STANDARD_PLATFORM_EXTENSION_POINTS.concat(installed);
  const found = definitions.some(
    (definition) =>
      definition.extensionPointId === contribution.extensionPoint.id &&
      satisfies(definition.apiVersion, contribution.extensionPoint.range),
  );
  if (found) return [];
  return [
    {
      code: "DEPENDENCY_MISSING",
      nodeId: node.nodeId,
      message: `Extension point definition is unavailable: ${contribution.extensionPoint.id}`,
    },
  ];
}

interface GraphInput {
  catalog: PlatformCatalog;
  input: PlatformResolvePlanInput;
  candidates: Candidate[];
  nodes: Map<string, DependencyNode>;
}

function resolveGraph(graph: GraphInput): Map<string, PlanNode> {
  const completed = new Map<string, PlanNode>();
  let evaluations = 0;
  function visit(id: string, path: string[]): PlanNode {
    const cached = completed.get(id);
    if (cached && path.length === 0) return cached;
    const result: PlanNode = {
      nodeId: id,
      state: "resolved",
      dependencies: [],
      absentDependencies: [],
      diagnostics: [],
    };
    if (++evaluations > 10000 || path.length > 64)
      return {
        ...result,
        state: "blocked",
        diagnostics: [
          {
            code: "RESOLUTION_LIMIT",
            message: "Plugin dependency graph exceeds the discovery limit",
            nodeId: id,
          },
        ],
      };
    if (path.includes(id))
      return {
        ...result,
        state: "blocked",
        diagnostics: [
          {
            code: "DEPENDENCY_CYCLE",
            message: "Plugin dependency cycle",
            nodeId: id,
            path: [...path, id],
          },
        ],
      };
    const node = graph.nodes.get(id)!;
    result.diagnostics.push(...missingExtension(node, graph.catalog));
    const dependencyStates = new Map<string, PlanNode>();
    function dependencyState(target: string): PlanNode {
      const previous = dependencyStates.get(target);
      if (previous) return previous;
      const state = visit(target, [...path, id]);
      dependencyStates.set(target, state);
      return state;
    }
    if (node.configuring) result.state = "configuring";
    for (const dependency of node.requires) {
      if (dependency.activation === "contextual") continue;
      const selection = select({
        catalog: graph.catalog,
        candidates: graph.candidates,
        input: {
          mode: "one",
          serviceId: dependency.serviceId,
          range: dependency.range,
          runtime: dependency.runtime,
          providerScope: dependency.scope,
          scope: graph.input.scope,
        },
        availability: (candidate) => dependencyState(candidate.nodeId),
      });
      if (
        dependency.optional &&
        !selection.candidates.length &&
        selection.diagnostics.every((diagnostic) =>
          [
            "DEPENDENCY_MISSING",
            "DEPENDENCY_VERSION",
            "PROVIDER_DISABLED",
            "NO_EXECUTION_ROUTE",
          ].includes(diagnostic.code),
        )
      ) {
        result.absentDependencies.push(dependency.bindingKey);
        continue;
      }
      result.diagnostics.push(...selection.diagnostics);
      result.dependencies.push(...selection.candidates.map((candidate) => candidate.nodeId));
    }
    result.dependencies.push(...contributionEdges(node));
    for (const target of result.dependencies) {
      const dependency = dependencyState(target);
      result.diagnostics.push(...dependency.diagnostics);
      if (dependency.state === "configuring" && !result.diagnostics.length)
        result.state = "configuring";
    }
    if (result.diagnostics.length) result.state = "blocked";
    if (path.length === 0) completed.set(id, result);
    return result;
  }
  for (const id of graph.nodes.keys()) visit(id, []);
  return completed;
}

export function planPlatformResolution(
  catalog: PlatformCatalog,
  input: PlatformResolvePlanInput,
): PlatformResolutionPlan {
  const plan: PlatformResolutionPlan = {
    catalogRevision: catalog.revision,
    mode: input.mode,
    candidates: [],
    nodes: [],
    diagnostics: [],
  };
  if (validRange(input.range) === null) {
    plan.diagnostics.push({ code: "DEPENDENCY_VERSION", message: `Invalid range: ${input.range}` });
    return plan;
  }
  if (input.scope.kind !== "client" && input.scope.serverId !== catalog.serverId) {
    plan.diagnostics.push({
      code: "NO_EXECUTION_ROUTE",
      message: "The requested scope belongs to another host",
    });
    return plan;
  }
  if (input.expectedCatalogRevision && input.expectedCatalogRevision !== catalog.revision) {
    plan.diagnostics.push({
      code: "STALE_CONTEXT",
      message: "The plugin catalog changed; refresh before resolving",
    });
    return plan;
  }
  const candidates = collectCandidates(catalog);
  const nodes = collectNodes(catalog);
  const graph = resolveGraph({ catalog, input, candidates, nodes });
  plan.nodes = [...graph.values()].sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  const selection = select({
    catalog,
    candidates,
    input,
    availability: (candidate) => graph.get(candidate.nodeId)!,
  });
  plan.diagnostics.push(...selection.diagnostics);
  for (const candidate of selection.candidates) {
    const node = graph.get(candidate.nodeId)!;
    if (node.state === "resolved") plan.candidates.push(candidate.value);
    else if (node.state === "configuring")
      plan.diagnostics.push({
        code: "DEPENDENCY_MISSING",
        nodeId: node.nodeId,
        message: "Provider dependencies require instance configuration",
      });
    else plan.diagnostics.push(...node.diagnostics);
  }
  return plan;
}
