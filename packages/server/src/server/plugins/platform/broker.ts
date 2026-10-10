import { randomUUID } from "node:crypto";
import satisfies from "semver/functions/satisfies.js";
import {
  PLUGIN_PLATFORM_API_VERSION,
  PlatformIdSchema,
  type PlatformCatalog,
  type PlatformProviderCandidate,
  type PlatformService,
  type PluginPlatformManifest,
} from "@getpaseo/protocol/plugin-platform";
import type {
  PlatformBindingRef,
  PlatformDaemonRuntime,
  PlatformError,
  PlatformHostBinding,
  PlatformHostCall,
  PlatformHostCallResult,
  PlatformHostCapabilities,
  PlatformHostReleaseResult,
  PlatformHostResolutionMany,
  PlatformHostResolutionOne,
  PlatformHostResolve,
  PlatformHostResolveResult,
  PlatformInvocationProjection,
  PlatformNestedResolve,
} from "@getpaseo/protocol/plugin-platform-execution";
import { PluginPlatformError } from "@getpaseo/protocol/plugin-platform-validation";
import { assemblePlatformCatalog, loadedCatalogEntry } from "./catalog.js";
import {
  loadPlatformPackage,
  type LoadedPlatformPackage,
  type MethodValue,
  type PlatformPackageInput,
} from "./package.js";
import { planPlatformResolution } from "./resolution.js";
import {
  createPlatformPermissionResolver,
  type PlatformPermissionResolver,
} from "./permissions.js";
import {
  PlatformWorkerError,
  executionError,
  platformError,
  toPlatformError,
} from "./execution-errors.js";
import type { PlatformNestedMessage, PlatformWorkerRequest } from "./process-protocol.js";

export const PLATFORM_HOST_CAPABILITIES: PlatformHostCapabilities = {
  apiVersion: PLUGIN_PLATFORM_API_VERSION,
  runtimes: ["daemon"],
  providerScopes: ["host"],
  targets: ["service"],
  retryPolicies: ["read", "no-replay"],
  callers: ["session"],
  limits: {
    deadlineMs: 30_000,
    maxCallDepth: 16,
    maxBindingsPerSession: 256,
    maxActiveCalls: 256,
  },
};
const { limits } = PLATFORM_HOST_CAPABILITIES;
// The broker's own deadline settles a call first; this only bounds a worker that never replies.
const WORKER_REPLY_GRACE_MS = 5_000;

type PlatformMethod = PlatformService["methods"][string];
type ProviderTarget = Omit<PlatformHostBinding, "binding">;
export type PlatformExecutionRequest = Extract<
  PlatformWorkerRequest,
  { type: "platform.activate" | "platform.invoke" }
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
/** The authenticated caller behind a session; permissions are read live on every check. */
export interface PlatformAuthority {
  readonly principalId: string;
  getPermissions(): readonly string[];
  readonly signal: AbortSignal;
}
export interface PlatformSession {
  resolve(input: PlatformHostResolve): Promise<PlatformHostResolveResult>;
  call(input: PlatformHostCall, requestId: string): Promise<PlatformHostCallResult>;
  release(binding: PlatformBindingRef): PlatformHostReleaseResult;
  /** Cancels in-flight calls the caller's current permissions no longer allow. */
  revalidate(): void;
}
interface BrokerDependencies {
  serverId: string;
}
interface Binding {
  readonly ref: PlatformHostBinding;
  readonly authority: PlatformAuthority;
  readonly owner: symbol;
}
interface Invocation {
  readonly handle: string;
  readonly authority: PlatformAuthority;
  /** Owns the bindings this invocation resolves for its nested calls. */
  readonly owner: symbol;
  readonly execution: PlatformExecution;
  readonly providesId: string;
  readonly scope: PlatformHostBinding["scope"];
  readonly controller: AbortController;
  readonly signal: AbortSignal;
  /** The daemon permissions the invoked method needs, checked again when grants change. */
  readonly required: readonly string[];
  readonly trace: PlatformInvocationProjection["trace"];
  readonly path: readonly string[];
}
interface ExecutionCatalog {
  readonly catalog: PlatformCatalog;
  readonly permissions: PlatformPermissionResolver;
}
interface Contract {
  readonly service: PlatformService;
  readonly definer: LoadedPlatformPackage;
}
interface CallRequest {
  readonly owner: symbol;
  readonly input: PlatformHostCall;
  readonly requestId: string;
  readonly parent: Invocation | null;
}
interface ResolveRequest {
  readonly authority: PlatformAuthority;
  readonly owner: symbol;
  readonly input: PlatformHostResolve;
}

/** Rejects contracts whose members need capabilities this host does not execute yet. */
export function assertExecutableService(service: PlatformService): void {
  const { runtimes, targets, retryPolicies } = PLATFORM_HOST_CAPABILITIES;
  const hasObservations =
    Object.keys(service.events).length > 0 || Object.keys(service.interceptors).length > 0;
  const hasUnsupportedMethod = Object.values(service.methods).some(
    (method) =>
      !runtimes.includes(method.runtime) ||
      !retryPolicies.includes(method.retry) ||
      method.targets.some((target) => !targets.includes(target)) ||
      (method.requiredEnvelopeFields?.length ?? 0) > 0,
  );
  if (hasObservations || hasUnsupportedMethod) {
    throw executionError(
      "UNSUPPORTED_FEATURE",
      `Service ${service.serviceId} needs events, interceptors, envelopes, targets or retry policies this host does not execute`,
    );
  }
}

/** Loads a v1 package and rejects any contract this host cannot execute. */
export async function loadExecutablePlatformPackage(
  input: PlatformPackageInput,
): Promise<LoadedPlatformPackage> {
  const loaded = await loadPlatformPackage(input);
  for (const { definition } of loaded.services) assertExecutableService(definition);
  return loaded;
}

/** A session that cannot call host services, answering every request with one fixed error. */
export function rejectingPlatformSession(error: PlatformError): PlatformSession {
  const failure = { status: "error" as const, error };
  return {
    resolve: async () => failure,
    call: async () => failure,
    release: () => failure,
    revalidate: () => undefined,
  };
}

function missingProvider(serviceId: string): PluginPlatformError {
  return executionError("DEPENDENCY_MISSING", `No provider of ${serviceId} is available`);
}

function callFailure(input: { error: unknown; isDispatchedCommand: boolean }): PlatformError {
  const failure = toPlatformError(input.error);
  const isOutcomeKnown = input.error instanceof PlatformWorkerError && input.error.outcomeKnown;
  if (!input.isDispatchedCommand || isOutcomeKnown) return failure;
  return {
    code: "OUTCOME_UNKNOWN",
    message: `The command may have run; do not repeat it automatically. ${failure.message}`,
    retryable: false,
    details: { reason: failure.code },
  };
}

function abortReason(signal: AbortSignal): PluginPlatformError {
  if (signal.reason instanceof PluginPlatformError) return signal.reason;
  return executionError("CANCELLED", "The call was cancelled");
}

function settleWithin<T>(input: {
  work: Promise<T>;
  signal: AbortSignal;
  deadlineMs: number;
}): Promise<T> {
  const { work, signal, deadlineMs } = input;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(executionError("DEADLINE_EXCEEDED", `No result within ${deadlineMs} ms`));
    }, deadlineMs);
    function abort(): void {
      reject(abortReason(signal));
    }
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    void work.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    });
  });
}

export class PlatformBroker {
  private readonly executions = new Map<string, PlatformExecution>();
  private readonly bindings = new Map<string, Binding>();
  private readonly invocations = new Map<string, Invocation>();
  /** Provider activations per runtime generation; a provider activates once per process. */
  private readonly activations = new Map<string, Map<string, Promise<void>>>();
  private cache: ExecutionCatalog | null = null;

  constructor(private readonly dependencies: BrokerDependencies) {}

  describe(): PlatformHostCapabilities {
    return PLATFORM_HOST_CAPABILITIES;
  }

  attach(execution: PlatformExecution): void {
    this.executions.set(execution.runtime.generation, execution);
    this.cache = null;
  }

  /** Ends everything that belongs to a stopped runtime; other plugins keep their bindings. */
  detach(generation: string): void {
    if (!this.executions.delete(generation)) return;
    this.cache = null;
    this.activations.delete(generation);
    for (const [bindingId, binding] of this.bindings) {
      if (binding.ref.execution.generation === generation) this.bindings.delete(bindingId);
    }
    const stopped = executionError("PLUGIN_UNAVAILABLE", "The provider's plugin stopped");
    for (const [handle, invocation] of this.invocations) {
      if (invocation.execution.runtime.generation === generation) {
        this.finishInvocation(handle, stopped);
      }
    }
  }

  openSession(authority: PlatformAuthority): PlatformSession {
    const owner = Symbol("platform-session");
    authority.signal.addEventListener("abort", () => this.releaseOwner(owner), { once: true });
    return {
      resolve: async (input) => this.resolveResult({ authority, owner, input }),
      call: (input, requestId) => this.call({ owner, input, requestId, parent: null }),
      release: (binding) => this.release(owner, binding),
      revalidate: () => this.revalidate(authority),
    };
  }

  async handleWorker(execution: PlatformExecution, message: PlatformNestedMessage): Promise<void> {
    const invocation = this.invocations.get(message.invocationHandle);
    const isCurrent =
      invocation !== undefined &&
      invocation.execution.runtime.generation === execution.runtime.generation &&
      !invocation.signal.aborted;
    if (message.type === "platform.release") {
      // A release that arrives after its invocation ended has nothing left to free.
      if (isCurrent) this.release(invocation.owner, message.binding);
      return;
    }
    if (!isCurrent) {
      const ended = {
        status: "error" as const,
        error: toPlatformError(executionError("CANCELLED", "The calling invocation has ended")),
      };
      if (message.type === "platform.call") {
        execution.send({ type: "platform.called", requestId: message.requestId, result: ended });
      } else {
        execution.send({ type: "platform.resolved", requestId: message.requestId, result: ended });
      }
      return;
    }
    if (message.type === "platform.call") {
      const result = await this.call({
        owner: invocation.owner,
        input: message.input,
        requestId: invocation.trace.requestId,
        parent: invocation,
      });
      execution.send({ type: "platform.called", requestId: message.requestId, result });
      return;
    }
    execution.send({
      type: "platform.resolved",
      requestId: message.requestId,
      result: this.resolveNested(invocation, message.input),
    });
  }

  private executionCatalog(): ExecutionCatalog {
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

  private executionFor(installationId: string): PlatformExecution {
    for (const execution of this.executions.values()) {
      if (execution.installation.installationId === installationId) return execution;
    }
    throw executionError("PLUGIN_UNAVAILABLE", `Plugin ${installationId} is not running`);
  }

  private contractOf(
    catalog: PlatformCatalog,
    contract: { serviceId: string; schemaDigest: string },
  ): Contract {
    for (const entry of catalog.entries) {
      const service = entry.services.find(
        (item) =>
          item.definition.serviceId === contract.serviceId &&
          item.schemaDigest === contract.schemaDigest,
      );
      if (!service) continue;
      const definer = this.executionFor(entry.installation.installationId).loaded;
      return { service: service.definition, definer };
    }
    throw executionError(
      "STALE_BINDING",
      `Service contract ${contract.serviceId} is no longer available`,
    );
  }

  private holdsAll(authority: PlatformAuthority, required: readonly string[]): boolean {
    const granted = new Set(authority.getPermissions());
    return required.every((permission) => granted.has(permission));
  }

  private requireActiveCaller(authority: PlatformAuthority): void {
    if (authority.signal.aborted) throw executionError("CANCELLED", "The calling session closed");
  }

  private requirePermissions(authority: PlatformAuthority, required: readonly string[]): void {
    this.requireActiveCaller(authority);
    if (!this.holdsAll(authority, required)) {
      throw executionError("FORBIDDEN", "The caller lacks the permissions this method requires");
    }
  }

  private canInspect(
    authority: PlatformAuthority,
    current: ExecutionCatalog,
    candidate: PlatformProviderCandidate,
  ): boolean {
    const { service } = this.contractOf(current.catalog, candidate);
    return this.holdsAll(authority, current.permissions.bases(service.inspectPermissions));
  }

  /** Whether any running contract of the requested service and range is visible to the caller. */
  private canInspectService(
    authority: PlatformAuthority,
    current: ExecutionCatalog,
    request: { serviceId: string; range: string },
  ): boolean {
    return current.catalog.entries.some(
      (entry) =>
        !entry.diagnostics.length &&
        entry.services.some(
          ({ definition }) =>
            definition.serviceId === request.serviceId &&
            satisfies(definition.apiVersion, request.range) &&
            this.holdsAll(authority, current.permissions.bases(definition.inspectPermissions)),
        ),
    );
  }

  private resolveResult(request: ResolveRequest): PlatformHostResolveResult {
    try {
      return { status: "ok", value: this.resolve(request) };
    } catch (error) {
      return { status: "error", error: toPlatformError(error) };
    }
  }

  private resolve(request: ResolveRequest): PlatformHostResolutionOne | PlatformHostResolutionMany {
    const { authority, owner, input } = request;
    this.requireActiveCaller(authority);
    const isLocalHostRoute =
      input.scope.kind === "host" &&
      input.scope.serverId === this.dependencies.serverId &&
      input.runtime === "daemon" &&
      input.providerScope === "host";
    if (!isLocalHostRoute) {
      throw executionError(
        "NO_EXECUTION_ROUTE",
        "This host executes only its own host-scoped daemon services",
      );
    }
    const current = this.executionCatalog();
    const plan = planPlatformResolution(current.catalog, input);
    const visible = plan.candidates.filter((candidate) =>
      this.canInspect(authority, current, candidate),
    );
    if (!visible.length) {
      const [problem] = plan.diagnostics;
      // A caller who cannot inspect the service learns nothing beyond its absence.
      const canExplain = problem && this.canInspectService(authority, current, input);
      throw canExplain ? new PluginPlatformError(problem) : missingProvider(input.serviceId);
    }
    const ownedCount = [...this.bindings.values()].filter(
      (binding) => binding.owner === owner,
    ).length;
    if (ownedCount + visible.length > limits.maxBindingsPerSession) {
      throw executionError(
        "LIMIT_EXCEEDED",
        "Release unused service bindings before resolving more",
      );
    }
    const bindings = visible.map((candidate) =>
      this.bind({ candidate, scope: input.scope, authority, owner }),
    );
    if (input.mode === "one") return { mode: "one", binding: bindings[0]! };
    return { mode: "many", bindings, diagnostics: plan.diagnostics.map(platformError) };
  }

  private bind(input: {
    candidate: PlatformProviderCandidate;
    scope: PlatformHostBinding["scope"];
    authority: PlatformAuthority;
    owner: symbol;
  }): PlatformHostBinding {
    const execution = this.executionFor(input.candidate.provider.installation.installationId);
    const ref: PlatformHostBinding = {
      ...input.candidate,
      binding: { bindingId: randomUUID(), generation: execution.runtime.generation },
      scope: input.scope,
      execution: execution.runtime,
    };
    this.bindings.set(ref.binding.bindingId, {
      ref,
      authority: input.authority,
      owner: input.owner,
    });
    return ref;
  }

  private resolveNested(
    invocation: Invocation,
    input: PlatformNestedResolve,
  ): PlatformHostResolveResult {
    const dependency = invocation.execution.manifest.requires.find(
      (item) =>
        item.consumer.kind === "provider" &&
        item.consumer.id === invocation.providesId &&
        item.bindingKey === input.bindingKey,
    );
    if (!dependency) {
      return {
        status: "error",
        error: toPlatformError(
          executionError(
            "MANIFEST_MISMATCH",
            `Provider ${invocation.providesId} does not declare dependency ${input.bindingKey}`,
          ),
        ),
      };
    }
    const resolve: PlatformHostResolve = {
      mode: input.mode,
      serviceId: dependency.serviceId,
      range: dependency.range,
      runtime: dependency.runtime,
      providerScope: dependency.scope,
      scope: input.scope,
      target: input.target,
    };
    if (input.provider) resolve.provider = input.provider;
    if (input.selectionKey !== undefined) resolve.selectionKey = input.selectionKey;
    return this.resolveResult({
      authority: invocation.authority,
      owner: invocation.owner,
      input: resolve,
    });
  }

  private ownedBinding(owner: symbol, ref: PlatformBindingRef): Binding {
    const binding = this.bindings.get(ref.bindingId);
    const isOwned =
      binding !== undefined &&
      binding.owner === owner &&
      binding.ref.binding.generation === ref.generation;
    if (!isOwned) {
      throw executionError(
        "STALE_BINDING",
        "The binding was released, expired, or belongs to another caller",
      );
    }
    return binding;
  }

  /** Releasing is idempotent; a binding owned by another caller is left untouched. */
  private release(owner: symbol, ref: PlatformBindingRef): PlatformHostReleaseResult {
    const binding = this.bindings.get(ref.bindingId);
    const isOwned =
      binding !== undefined &&
      binding.owner === owner &&
      binding.ref.binding.generation === ref.generation;
    if (isOwned) this.bindings.delete(ref.bindingId);
    return { status: "ok", value: null };
  }

  private releaseOwner(owner: symbol): void {
    for (const [bindingId, binding] of this.bindings) {
      if (binding.owner === owner) this.bindings.delete(bindingId);
    }
  }

  private revalidate(authority: PlatformAuthority): void {
    const revoked = executionError("FORBIDDEN", "The caller's permissions changed during the call");
    for (const [handle, invocation] of this.invocations) {
      if (invocation.authority !== authority) continue;
      if (!this.holdsAll(authority, invocation.required)) this.finishInvocation(handle, revoked);
    }
  }

  private async call(request: CallRequest): Promise<PlatformHostCallResult> {
    const { owner, input, requestId, parent } = request;
    let method: PlatformMethod | null = null;
    let invocation: Invocation | null = null;
    try {
      if (!PlatformIdSchema.safeParse(requestId).success) {
        throw executionError("INVALID_ARGUMENT", "requestId must be a non-empty opaque ID");
      }
      const binding = this.ownedBinding(owner, input.binding);
      const current = this.executionCatalog();
      const contract = this.contractOf(current.catalog, binding.ref);
      if (!Object.hasOwn(contract.service.methods, input.method)) {
        throw executionError(
          "INVALID_ARGUMENT",
          `Service ${binding.ref.serviceId} does not declare method ${input.method}`,
        );
      }
      method = contract.service.methods[input.method]!;
      const required = current.permissions.bases(method.permissions);
      this.requirePermissions(binding.authority, required);
      const deadlineMs = this.deadline(input.deadlineMs);
      const startedAt = performance.now();
      const methodRef: Omit<MethodValue, "field" | "value"> = {
        serviceId: binding.ref.serviceId,
        apiVersion: binding.ref.apiVersion,
        method: input.method,
      };
      this.requireConforming(contract.definer, {
        ...methodRef,
        field: "input",
        value: input.params,
      });
      const path = this.callPath(parent, binding.ref, input.method);
      if (this.invocations.size >= limits.maxActiveCalls) {
        throw executionError("LIMIT_EXCEEDED", "Too many plugin service calls are in progress");
      }
      this.requireAvailable(current.catalog, binding.ref);
      const callerSignal = parent
        ? AbortSignal.any([binding.authority.signal, parent.signal])
        : binding.authority.signal;
      // The caller's deadline also bounds a provider's first activation.
      await settleWithin({
        work: this.activate(binding.ref, current.catalog),
        signal: callerSignal,
        deadlineMs,
      });
      this.requirePermissions(binding.authority, required);
      invocation = this.beginInvocation({
        binding,
        callerSignal,
        required,
        parent,
        path,
        requestId,
      });
      const remainingMs = Math.max(1, Math.ceil(deadlineMs - (performance.now() - startedAt)));
      const output = await this.dispatchInvocation(invocation, input, remainingMs);
      // Revocation during the call withholds the result as well.
      this.requirePermissions(binding.authority, required);
      this.requireConforming(contract.definer, { ...methodRef, field: "output", value: output });
      return { status: "ok", value: output };
    } catch (error) {
      const isDispatchedCommand = invocation !== null && method?.mode === "command";
      return { status: "error", error: callFailure({ error, isDispatchedCommand }) };
    } finally {
      if (invocation) this.finishInvocation(invocation.handle);
    }
  }

  private deadline(requested: number | undefined): number {
    if (requested === undefined) return limits.deadlineMs;
    if (requested > limits.deadlineMs) {
      throw executionError(
        "INVALID_ARGUMENT",
        `deadlineMs exceeds this host's limit of ${limits.deadlineMs}`,
      );
    }
    return requested;
  }

  private requireConforming(definer: LoadedPlatformPackage, value: MethodValue): void {
    const problem = definer.checkMethodValue(value);
    if (!problem) return;
    const code = value.field === "input" ? "INVALID_ARGUMENT" : "PROVIDER_RESULT_INVALID";
    throw executionError(code, `${value.serviceId}.${value.method} ${value.field}: ${problem}`);
  }

  private callPath(
    parent: Invocation | null,
    ref: PlatformHostBinding,
    method: string,
  ): readonly string[] {
    const step = `${ref.execution.generation}:${ref.provider.providesId}.${method}`;
    const parentPath = parent?.path ?? [];
    const isRepeated = parentPath.includes(step);
    if (isRepeated || parentPath.length + 1 > limits.maxCallDepth) {
      throw executionError(
        "CALL_CYCLE",
        "Nested calls repeat a method or exceed the call depth limit",
      );
    }
    return [...parentPath, step];
  }

  /** The provider and its required dependencies must still resolve before each call. */
  private requireAvailable(catalog: PlatformCatalog, ref: PlatformHostBinding): void {
    const plan = planPlatformResolution(catalog, {
      mode: "one",
      serviceId: ref.serviceId,
      range: ref.apiVersion,
      runtime: ref.runtime,
      providerScope: ref.providerScope,
      scope: ref.scope,
      provider: ref.provider,
    });
    const [problem] = plan.diagnostics;
    if (problem) throw new PluginPlatformError(problem);
  }

  private activate(target: ProviderTarget, catalog: PlatformCatalog): Promise<void> {
    const generation = target.execution.generation;
    const execution = this.executions.get(generation);
    if (!execution) {
      return Promise.reject(executionError("PLUGIN_UNAVAILABLE", "The provider's plugin stopped"));
    }
    let provided = this.activations.get(generation);
    if (!provided) {
      provided = new Map();
      this.activations.set(generation, provided);
    }
    const providesId = target.provider.providesId;
    const existing = provided.get(providesId);
    if (existing) return existing;
    const activation = this.activateProvider({ execution, target, catalog });
    provided.set(providesId, activation);
    const activations = provided;
    // The caller receives the failure; dropping the entry lets the next call retry activation.
    activation.catch(() => {
      if (activations.get(providesId) === activation) activations.delete(providesId);
    });
    return activation;
  }

  private async activateProvider(input: {
    execution: PlatformExecution;
    target: ProviderTarget;
    catalog: PlatformCatalog;
  }): Promise<void> {
    const { execution, target, catalog } = input;
    const providesId = target.provider.providesId;
    const dependencies = execution.manifest.requires.filter(
      (dependency) =>
        dependency.consumer.kind === "provider" && dependency.consumer.id === providesId,
    );
    for (const dependency of dependencies) {
      const plan = planPlatformResolution(catalog, {
        mode: "one",
        serviceId: dependency.serviceId,
        range: dependency.range,
        runtime: dependency.runtime,
        providerScope: dependency.scope,
        scope: target.scope,
      });
      const [candidate] = plan.candidates;
      if (!candidate) {
        if (dependency.optional) continue;
        const [problem] = plan.diagnostics;
        throw problem ? new PluginPlatformError(problem) : missingProvider(dependency.serviceId);
      }
      const dependencyExecution = this.executionFor(candidate.provider.installation.installationId);
      await this.activate(
        { ...candidate, scope: target.scope, execution: dependencyExecution.runtime },
        catalog,
      );
    }
    const { service } = this.contractOf(catalog, target);
    await execution.request(
      {
        type: "platform.activate",
        requestId: randomUUID(),
        providesId,
        methods: Object.keys(service.methods),
      },
      limits.deadlineMs,
    );
  }

  private beginInvocation(input: {
    binding: Binding;
    callerSignal: AbortSignal;
    required: readonly string[];
    parent: Invocation | null;
    path: readonly string[];
    requestId: string;
  }): Invocation {
    const { binding, callerSignal, required, parent, path, requestId } = input;
    const execution = this.executions.get(binding.ref.execution.generation);
    if (!execution) throw executionError("PLUGIN_UNAVAILABLE", "The provider's plugin stopped");
    const controller = new AbortController();
    const invocation: Invocation = {
      handle: randomUUID(),
      authority: binding.authority,
      owner: Symbol("platform-invocation"),
      execution,
      providesId: binding.ref.provider.providesId,
      scope: binding.ref.scope,
      controller,
      signal: AbortSignal.any([controller.signal, callerSignal]),
      required,
      trace: {
        requestId,
        callId: randomUUID(),
        parentCallId: parent?.trace.callId ?? null,
        depth: path.length - 1,
      },
      path,
    };
    this.invocations.set(invocation.handle, invocation);
    return invocation;
  }

  private dispatchInvocation(
    invocation: Invocation,
    input: PlatformHostCall,
    deadlineMs: number,
  ): Promise<unknown> {
    const work = invocation.execution.request(
      {
        type: "platform.invoke",
        requestId: randomUUID(),
        invocationHandle: invocation.handle,
        providesId: invocation.providesId,
        method: input.method,
        input: input.params,
        context: {
          actor: {
            kind: "user",
            principalId: invocation.authority.principalId,
            permissions: [...invocation.authority.getPermissions()],
          },
          source: { kind: "session" },
          execution: invocation.execution.runtime,
          target: input.target,
          scope: invocation.scope,
          trace: invocation.trace,
        },
      },
      deadlineMs + WORKER_REPLY_GRACE_MS,
    );
    return settleWithin({ work, signal: invocation.signal, deadlineMs });
  }

  private finishInvocation(handle: string, reason?: PluginPlatformError): void {
    const invocation = this.invocations.get(handle);
    if (!invocation) return;
    this.invocations.delete(handle);
    invocation.controller.abort(reason);
    invocation.execution.send({ type: "platform.cancel", invocationHandle: handle });
    this.releaseOwner(invocation.owner);
  }
}
