import { randomUUID } from "node:crypto";
import type pino from "pino";
import type {
  PlatformCatalog,
  PlatformDiagnostic,
  PlatformProvider,
  PlatformProviderCandidate,
  PlatformService,
  PluginPlatformManifest,
} from "@getpaseo/protocol/plugin-platform";
import type {
  PlatformDaemonRuntime,
  PlatformHostBinding,
  PlatformProviderStatus,
} from "@getpaseo/protocol/plugin-platform-execution";
import type { PluginPlatformError } from "@getpaseo/protocol/plugin-platform-validation";
import { assemblePlatformCatalog, loadedCatalogEntry } from "./catalog.js";
import { executionError, platformError, toDiagnostic } from "./execution-errors.js";
import { PLATFORM_HOST_CAPABILITIES } from "./host-capabilities.js";
import type { LoadedPlatformPackage } from "./package.js";
import {
  createPlatformPermissionResolver,
  type PlatformPermissionResolver,
} from "./permissions.js";
import type { PlatformWorkerRequest } from "./process-protocol.js";
import { planPlatformGraph, providerNodeId, type PlanNode } from "./resolution.js";

const { limits } = PLATFORM_HOST_CAPABILITIES;

export type PlatformExecutionRequest = Extract<
  PlatformWorkerRequest,
  { type: "platform.activate" | "platform.deactivate" | "platform.invoke" }
>;
/** One running v1 plugin process, published by the runtime for as long as it serves calls. */
export interface PlatformExecution {
  readonly manifest: PluginPlatformManifest;
  readonly installation: PlatformProviderCandidate["provider"]["installation"];
  readonly origin: "builtin" | "configured";
  readonly runtime: PlatformDaemonRuntime;
  readonly loaded: LoadedPlatformPackage;
  request(message: PlatformExecutionRequest, timeoutMs: number): Promise<unknown>;
  send(message: PlatformWorkerRequest): void;
}
export interface ExecutionCatalog {
  readonly catalog: PlatformCatalog;
  readonly permissions: PlatformPermissionResolver;
}
export interface Contract {
  readonly service: PlatformService;
  readonly definer: LoadedPlatformPackage;
}
/** A call admitted to one provider generation; release it when the call ends. */
export interface ProviderAdmission {
  readonly execution: PlatformExecution;
  /** Aborts when the provider stops before the call ends. */
  readonly signal: AbortSignal;
  release(): void;
}
export type ProviderAvailability =
  | {
      readonly status: "available";
      readonly generation: string;
      readonly runtime: PlatformDaemonRuntime;
    }
  | { readonly status: "unavailable"; readonly reason: PlatformDiagnostic };
interface LifecycleDependencies {
  serverId: string;
  logger: pino.Logger;
  /** Runs once a provider generation takes no more calls, so its bindings can go. */
  onGenerationEnded(generation: string): void;
}
type NodeStatus =
  | { readonly state: "unresolved" | "activating" }
  | { readonly state: "pending-dependencies" | "inactive"; readonly reason: PlatformDiagnostic }
  | { readonly state: "active"; readonly run: ProviderRun; readonly signature: string }
  | { readonly state: "draining"; readonly run: ProviderRun }
  | { readonly state: "failed"; readonly reason: PlatformDiagnostic; readonly signature: string };
type DesiredState =
  | { readonly state: "pending-dependencies" | "inactive"; readonly reason: PlatformDiagnostic }
  | {
      readonly state: "active";
      /** The dependency nodes and generations this activation runs against. */
      readonly signature: string;
      readonly dependencies: readonly string[];
    };
interface ProviderNode {
  readonly nodeId: string;
  readonly execution: PlatformExecution;
  readonly declaration: PlatformProvider;
  status: NodeStatus;
}
interface RunningNode {
  readonly node: ProviderNode;
  readonly run: ProviderRun;
}

/** One activation of a provider node: its generation and the calls admitted to it. */
class ProviderRun {
  readonly generation = randomUUID();
  /** A provider activates after its dependencies, so a higher sequence retires first. */
  readonly sequence: number;
  readonly dependencies: readonly string[];
  private readonly controller = new AbortController();
  private admitted = 0;
  private isClosed = false;
  private onDrained: (() => void) | null = null;

  constructor(input: { sequence: number; dependencies: readonly string[] }) {
    this.sequence = input.sequence;
    this.dependencies = input.dependencies;
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get isOpen(): boolean {
    return !this.isClosed;
  }

  /** Counts a call until its release runs; a closed run admits nothing. */
  admit(): (() => void) | null {
    if (this.isClosed) return null;
    this.admitted += 1;
    let isReleased = false;
    return () => {
      if (isReleased) return;
      isReleased = true;
      this.admitted -= 1;
      if (this.admitted === 0) this.onDrained?.();
    };
  }

  /** Resolves when no admitted call remains, and admits nothing from that moment on. */
  drained(): Promise<void> {
    return new Promise((resolve) => {
      this.onDrained = () => {
        // Closing in the same step as the last release leaves no gap for another admission.
        this.isClosed = true;
        this.onDrained = null;
        resolve();
      };
      if (this.admitted === 0) this.onDrained();
    });
  }

  abort(reason: PluginPlatformError): void {
    this.isClosed = true;
    this.controller.abort(reason);
  }
}

function runOf(status: NodeStatus): ProviderRun | null {
  if (status.state === "active" || status.state === "draining") return status.run;
  return null;
}

function drainingReason(node: ProviderNode): PluginPlatformError {
  return executionError("PLUGIN_UNAVAILABLE", `Provider ${node.declaration.id} is draining`);
}

/** Why a node takes no new top-level call; a running node is only draining. */
function unavailableReason(node: ProviderNode): PlatformDiagnostic {
  const status = node.status;
  const providesId = node.declaration.id;
  switch (status.state) {
    case "unresolved":
      return { code: "PLUGIN_UNAVAILABLE", message: `Provider ${providesId} is not ready` };
    case "activating":
      return { code: "PLUGIN_UNAVAILABLE", message: `Provider ${providesId} is starting` };
    case "active":
    case "draining":
      return drainingReason(node).diagnostic;
    default:
      return status.reason;
  }
}

function projectStatus(node: ProviderNode): PlatformProviderStatus {
  const { declaration, status } = node;
  const projected: PlatformProviderStatus = {
    providesId: declaration.id,
    serviceId: declaration.serviceId,
    apiVersion: declaration.apiVersion,
    state: status.state,
  };
  const run = runOf(status);
  if (run) projected.generation = run.generation;
  if ("reason" in status) projected.reason = platformError(status.reason);
  return projected;
}

/**
 * Owns the running v1 executions and their provider nodes. Providers activate as soon as their
 * dependencies are active, retire before the providers they depend on, and get a new generation
 * on every activation. Activation, retirement and draining run one at a time; calls and
 * resolution only read the current state.
 */
export class ProviderLifecycle {
  private readonly executions = new Map<string, PlatformExecution>();
  /** Runtime generations being drained; their providers retire and take no new top-level call. */
  private readonly stopping = new Set<string>();
  private readonly nodes = new Map<string, ProviderNode>();
  private cache: ExecutionCatalog | null = null;
  private queue: Promise<void> = Promise.resolve();
  private activations = 0;

  constructor(private readonly dependencies: LifecycleDependencies) {}

  /**
   * Adds a started plugin and resolves once its providers have settled. It registers at once, so
   * an exit reported before the settling runs still finds the plugin to detach.
   */
  attach(execution: PlatformExecution): Promise<void> {
    this.executions.set(execution.runtime.generation, execution);
    this.cache = null;
    const installationId = execution.installation.installationId;
    for (const declaration of execution.manifest.provides) {
      for (const providerScope of declaration.scopes) {
        const nodeId = providerNodeId({
          installationId,
          providesId: declaration.id,
          providerScope,
        });
        this.nodes.set(nodeId, { nodeId, execution, declaration, status: { state: "unresolved" } });
      }
    }
    return this.enqueue(() => this.settle());
  }

  /**
   * Stops a plugin gracefully. Its providers refuse new top-level calls at once, finish the calls
   * they accepted, and retire after their dependents.
   */
  async drain(runtimeGeneration: string): Promise<void> {
    this.stopping.add(runtimeGeneration);
    for (const node of this.nodesOf(runtimeGeneration)) {
      if (node.status.state === "active") node.status = { state: "draining", run: node.status.run };
    }
    await this.enqueue(async () => {
      await this.settle();
      this.remove(runtimeGeneration);
      await this.settle();
    });
  }

  /** Ends a plugin whose process exited: its providers end at once and so do their calls. */
  detach(runtimeGeneration: string): void {
    const execution = this.executions.get(runtimeGeneration);
    if (!execution) return;
    const exited = executionError(
      "PLUGIN_UNAVAILABLE",
      `Plugin ${execution.installation.installationId} exited`,
    );
    for (const node of this.nodesOf(runtimeGeneration)) {
      const run = runOf(node.status);
      if (!run) continue;
      run.abort(exited);
      this.dependencies.onGenerationEnded(run.generation);
    }
    this.remove(runtimeGeneration);
    void this.enqueue(() => this.settle()).catch((error) => {
      this.dependencies.logger.error({ err: error }, "Failed to settle providers after an exit");
    });
  }

  current(): ExecutionCatalog {
    if (this.cache) return this.cache;
    const entries = [...this.executions.values()].map((execution) => ({
      entry: loadedCatalogEntry({
        installation: execution.installation,
        origin: execution.origin,
        enabled: true,
        manifest: execution.manifest,
        loaded: execution.loaded,
      }),
      loaded: execution.loaded,
    }));
    const catalog = assemblePlatformCatalog(this.dependencies.serverId, entries);
    this.cache = { catalog, permissions: createPlatformPermissionResolver(catalog.entries) };
    return this.cache;
  }

  contract(ref: { serviceId: string; schemaDigest: string }): Contract {
    for (const entry of this.current().catalog.entries) {
      const service = entry.services.find(
        (item) =>
          item.definition.serviceId === ref.serviceId && item.schemaDigest === ref.schemaDigest,
      );
      if (!service) continue;
      const definer = this.executionFor(entry.installation.installationId).loaded;
      return { service: service.definition, definer };
    }
    throw executionError(
      "STALE_BINDING",
      `Service contract ${ref.serviceId} is no longer available`,
    );
  }

  /** Whether a provider takes a call now and at which generation; draining ones take nested calls. */
  availability(input: {
    candidate: PlatformProviderCandidate;
    isNested: boolean;
  }): ProviderAvailability {
    const { candidate, isNested } = input;
    const node = this.nodes.get(
      providerNodeId({
        installationId: candidate.provider.installation.installationId,
        providesId: candidate.provider.providesId,
        providerScope: candidate.providerScope,
      }),
    );
    if (!node) {
      const message = `Provider ${candidate.provider.providesId} is not ready`;
      return { status: "unavailable", reason: { code: "PLUGIN_UNAVAILABLE", message } };
    }
    const status = node.status;
    const isAdmitting =
      status.state === "active" || (status.state === "draining" && isNested && status.run.isOpen);
    if (!isAdmitting) return { status: "unavailable", reason: unavailableReason(node) };
    return {
      status: "available",
      generation: status.run.generation,
      runtime: node.execution.runtime,
    };
  }

  /** Admits a call to the provider generation a binding names, or throws why it cannot run. */
  admit(input: { binding: PlatformHostBinding; isNested: boolean }): ProviderAdmission {
    const { binding, isNested } = input;
    const node = this.nodes.get(
      providerNodeId({
        installationId: binding.provider.installation.installationId,
        providesId: binding.provider.providesId,
        providerScope: binding.providerScope,
      }),
    );
    const run = node ? runOf(node.status) : null;
    if (!node || run?.generation !== binding.binding.generation) {
      throw executionError("STALE_BINDING", "The provider restarted; resolve the service again");
    }
    const isRefused = node.status.state === "draining" && !isNested;
    const release = isRefused ? null : run.admit();
    if (!release) throw drainingReason(node);
    return { execution: node.execution, signal: run.signal, release };
  }

  /** The lifecycle state of each provider a running plugin declares. */
  statuses(installationId: string): PlatformProviderStatus[] {
    return [...this.nodes.values()]
      .filter((node) => node.execution.installation.installationId === installationId)
      .sort((left, right) => left.nodeId.localeCompare(right.nodeId))
      .map(projectStatus);
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.queue.then(task);
    // The caller observes a failure through `next`; the queue keeps serving later tasks.
    this.queue = next.catch(() => undefined);
    return next;
  }

  private executionFor(installationId: string): PlatformExecution {
    for (const execution of this.executions.values()) {
      if (execution.installation.installationId === installationId) return execution;
    }
    throw executionError("PLUGIN_UNAVAILABLE", `Plugin ${installationId} is not running`);
  }

  private nodesOf(runtimeGeneration: string): ProviderNode[] {
    return [...this.nodes.values()].filter(
      (node) => node.execution.runtime.generation === runtimeGeneration,
    );
  }

  private remove(runtimeGeneration: string): void {
    for (const node of this.nodesOf(runtimeGeneration)) this.nodes.delete(node.nodeId);
    this.executions.delete(runtimeGeneration);
    this.stopping.delete(runtimeGeneration);
    this.cache = null;
  }

  private async settle(): Promise<void> {
    let isChanged = true;
    while (isChanged) isChanged = await this.settleRound();
  }

  /**
   * Moves nodes one dependency layer toward their desired state. A round that retires anything
   * ends there, so dependents see the new states before anything activates again.
   */
  private async settleRound(): Promise<boolean> {
    const { serverId } = this.dependencies;
    const graph = planPlatformGraph(this.current().catalog, { kind: "host", serverId });
    const desired = new Map<ProviderNode, DesiredState>();
    for (const node of this.nodes.values()) desired.set(node, this.desiredState(node, graph));
    const retiring = this.retiringNodes(desired);
    if (retiring.length) {
      await this.retire(retiring);
      return true;
    }
    let isChanged = false;
    for (const [node, target] of desired) {
      // A process that exited during this round took its nodes with it.
      if (this.nodes.get(node.nodeId) !== node) continue;
      const status = node.status;
      if (target.state !== "active") {
        if (!runOf(status)) node.status = target;
        continue;
      }
      const isWaiting =
        status.state === "unresolved" ||
        status.state === "pending-dependencies" ||
        status.state === "inactive";
      // A failed factory runs again only against other dependency generations.
      const isRetryDue = status.state === "failed" && status.signature !== target.signature;
      if (!isWaiting && !isRetryDue) continue;
      await this.activate(node, target);
      isChanged = true;
    }
    return isChanged;
  }

  /** A node should be active once its plan resolves and every dependency it plans on is active. */
  private desiredState(node: ProviderNode, graph: Map<string, PlanNode>): DesiredState {
    const installationId = node.execution.installation.installationId;
    if (this.stopping.has(node.execution.runtime.generation)) {
      const message = `Plugin ${installationId} is stopping`;
      return { state: "inactive", reason: { code: "PLUGIN_UNAVAILABLE", message } };
    }
    const planned = graph.get(node.nodeId);
    if (!planned) {
      // The running catalog rejected this plugin's definitions, so it has no plan node.
      const entry = this.current().catalog.entries.find(
        (item) => item.installation.installationId === installationId,
      );
      const reason = entry?.diagnostics[0] ?? {
        code: "DEPENDENCY_MISSING",
        message: `Provider ${node.declaration.id} has no dependency plan`,
      };
      return { state: "pending-dependencies", reason };
    }
    if (planned.state === "configuring") {
      const message = "Provider dependencies require instance configuration";
      return { state: "pending-dependencies", reason: { code: "DEPENDENCY_MISSING", message } };
    }
    if (planned.state !== "resolved") {
      const reason = planned.diagnostics[0] ?? {
        code: "DEPENDENCY_MISSING",
        message: `Provider ${node.declaration.id} has unresolved dependencies`,
      };
      return { state: "pending-dependencies", reason };
    }
    const generations: string[] = [];
    for (const dependencyId of planned.dependencies) {
      const dependency = this.nodes.get(dependencyId);
      const status = dependency?.status;
      if (status?.state !== "active") {
        const serviceId = dependency?.declaration.serviceId ?? dependencyId;
        const message = `Provider ${node.declaration.id} waits for ${serviceId} to become active`;
        return { state: "pending-dependencies", reason: { code: "DEPENDENCY_MISSING", message } };
      }
      generations.push(`${dependencyId}@${status.run.generation}`);
    }
    return {
      state: "active",
      signature: generations.sort().join(" "),
      dependencies: planned.dependencies,
    };
  }

  /** Running nodes that must stop, with every running node that runs against them; dependents first. */
  private retiringNodes(desired: Map<ProviderNode, DesiredState>): RunningNode[] {
    const running: RunningNode[] = [];
    const retiring = new Set<string>();
    for (const [node, target] of desired) {
      const status = node.status;
      const run = runOf(status);
      if (!run) continue;
      running.push({ node, run });
      const keepsRunning =
        status.state === "active" &&
        target.state === "active" &&
        target.signature === status.signature;
      if (!keepsRunning) retiring.add(node.nodeId);
    }
    let isGrowing = retiring.size > 0;
    while (isGrowing) {
      isGrowing = false;
      for (const { node, run } of running) {
        if (retiring.has(node.nodeId)) continue;
        if (!run.dependencies.some((dependencyId) => retiring.has(dependencyId))) continue;
        retiring.add(node.nodeId);
        isGrowing = true;
      }
    }
    return running
      .filter(({ node }) => retiring.has(node.nodeId))
      .sort((left, right) => right.run.sequence - left.run.sequence);
  }

  /**
   * Refuses new top-level calls on every retiring node at once, then finishes and disposes them
   * one at a time, dependents first: a dependency keeps serving the nested calls of dependents
   * that are still finishing their accepted work. Every admitted call settles within its own
   * deadline, and a nested call ends with its parent, so each wait is bounded.
   */
  private async retire(retiring: readonly RunningNode[]): Promise<void> {
    for (const { node, run } of retiring) node.status = { state: "draining", run };
    for (const { node, run } of retiring) {
      await run.drained();
      await this.deactivate(node, run);
      node.status = { state: "unresolved" };
      this.dependencies.onGenerationEnded(run.generation);
    }
  }

  private async activate(
    node: ProviderNode,
    target: Extract<DesiredState, { state: "active" }>,
  ): Promise<void> {
    this.activations += 1;
    const run = new ProviderRun({ sequence: this.activations, dependencies: target.dependencies });
    node.status = { state: "activating" };
    try {
      await node.execution.request(
        {
          type: "platform.activate",
          requestId: randomUUID(),
          providesId: node.declaration.id,
          generation: run.generation,
          methods: this.methodsOf(node.declaration),
        },
        limits.deadlineMs,
      );
      node.status = { state: "active", run, signature: target.signature };
    } catch (error) {
      const message = `Provider ${node.declaration.id} failed to start: ${toDiagnostic(error).message}`;
      node.status = {
        state: "failed",
        signature: target.signature,
        reason: { code: "PLUGIN_UNAVAILABLE", message },
      };
      this.dependencies.logger.warn(
        { err: error, installationId: node.execution.installation.installationId },
        "Provider failed to start",
      );
      // A factory that outlived the deadline may still finish; this disposes it when it does.
      void this.deactivate(node, run);
    }
  }

  private async deactivate(node: ProviderNode, run: ProviderRun): Promise<void> {
    try {
      await node.execution.request(
        {
          type: "platform.deactivate",
          requestId: randomUUID(),
          providesId: node.declaration.id,
          generation: run.generation,
        },
        limits.deadlineMs,
      );
    } catch (error) {
      // An exiting process disposes its providers itself; the generation ends either way.
      this.dependencies.logger.warn(
        { err: error, installationId: node.execution.installation.installationId },
        "Provider did not confirm its disposal",
      );
    }
  }

  private methodsOf(provider: PlatformProvider): string[] {
    for (const entry of this.current().catalog.entries) {
      const service = entry.services.find(
        ({ definition }) =>
          definition.serviceId === provider.serviceId &&
          definition.apiVersion === provider.apiVersion,
      );
      if (service) return Object.keys(service.definition.methods);
    }
    throw executionError(
      "MANIFEST_MISMATCH",
      `No running contract defines ${provider.serviceId} ${provider.apiVersion}`,
    );
  }
}
