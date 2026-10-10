import { randomUUID } from "node:crypto";
import type pino from "pino";
import satisfies from "semver/functions/satisfies.js";
import {
  PlatformIdSchema,
  type PlatformProviderCandidate,
  type PlatformService,
} from "@getpaseo/protocol/plugin-platform";
import type {
  PlatformBindingRef,
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
  PlatformProviderStatus,
} from "@getpaseo/protocol/plugin-platform-execution";
import { PluginPlatformError } from "@getpaseo/protocol/plugin-platform-validation";
import type { LoadedPlatformPackage, MethodValue } from "./package.js";
import { planPlatformResolution } from "./resolution.js";
import {
  PlatformWorkerError,
  executionError,
  platformError,
  toPlatformError,
} from "./execution-errors.js";
import { PLATFORM_HOST_CAPABILITIES, PLATFORM_WORKER_REPLY_GRACE_MS } from "./host-capabilities.js";
import {
  ProviderLifecycle,
  type ExecutionCatalog,
  type PlatformExecution,
  type ProviderAdmission,
} from "./provider-lifecycle.js";
import type { PlatformNestedMessage } from "./process-protocol.js";

const { limits } = PLATFORM_HOST_CAPABILITIES;

type PlatformMethod = PlatformService["methods"][string];
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
  logger: pino.Logger;
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
  /** The provider generation that admitted the call. */
  readonly generation: string;
  readonly scope: PlatformHostBinding["scope"];
  readonly controller: AbortController;
  readonly signal: AbortSignal;
  /** The daemon permissions the invoked method needs, checked again when grants change. */
  readonly required: readonly string[];
  readonly trace: PlatformInvocationProjection["trace"];
  readonly path: readonly string[];
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
  /** Nested resolution serves calls already in flight, which a draining provider still takes. */
  readonly isNested: boolean;
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

/**
 * The single entry point for host services: sessions, bindings and invocations live here, and
 * provider nodes live in the lifecycle it owns.
 */
export class PlatformBroker {
  private readonly bindings = new Map<string, Binding>();
  private readonly invocations = new Map<string, Invocation>();
  private readonly lifecycle: ProviderLifecycle;

  constructor(private readonly dependencies: BrokerDependencies) {
    this.lifecycle = new ProviderLifecycle({
      serverId: dependencies.serverId,
      logger: dependencies.logger,
      onGenerationEnded: (generation) => this.expireGeneration(generation),
    });
  }

  describe(): PlatformHostCapabilities {
    return PLATFORM_HOST_CAPABILITIES;
  }

  /** Publishes a started plugin; resolves once its providers have settled. */
  attach(execution: PlatformExecution): Promise<void> {
    return this.lifecycle.attach(execution);
  }

  /** Stops a plugin's providers gracefully; resolves once they have retired. */
  drain(runtimeGeneration: string): Promise<void> {
    return this.lifecycle.drain(runtimeGeneration);
  }

  /** Ends everything that belongs to an exited process; other plugins keep their bindings. */
  detach(runtimeGeneration: string): void {
    this.lifecycle.detach(runtimeGeneration);
  }

  providerStatuses(installationId: string): PlatformProviderStatus[] {
    return this.lifecycle.statuses(installationId);
  }

  openSession(authority: PlatformAuthority): PlatformSession {
    const owner = Symbol("platform-session");
    authority.signal.addEventListener("abort", () => this.releaseOwner(owner), { once: true });
    return {
      resolve: async (input) => this.resolveResult({ authority, owner, input, isNested: false }),
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

  /** Bindings to an ended provider generation go; calls with them are stale from now on. */
  private expireGeneration(generation: string): void {
    for (const [bindingId, binding] of this.bindings) {
      if (binding.ref.binding.generation === generation) this.bindings.delete(bindingId);
    }
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
    const { service } = this.lifecycle.contract(candidate);
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
    const { authority, owner, input, isNested } = request;
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
    const current = this.lifecycle.current();
    const plan = planPlatformResolution(current.catalog, input, (candidate) => {
      const availability = this.lifecycle.availability({ candidate, isNested });
      return availability.status === "available" ? null : availability.reason;
    });
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
    const bindings = visible.map((candidate) => this.bind({ candidate, request }));
    if (input.mode === "one") return { mode: "one", binding: bindings[0]! };
    return { mode: "many", bindings, diagnostics: plan.diagnostics.map(platformError) };
  }

  private bind(input: {
    candidate: PlatformProviderCandidate;
    request: ResolveRequest;
  }): PlatformHostBinding {
    const { candidate, request } = input;
    const availability = this.lifecycle.availability({ candidate, isNested: request.isNested });
    // The plan kept only available candidates during this same synchronous pass.
    if (availability.status === "unavailable") throw new PluginPlatformError(availability.reason);
    const ref: PlatformHostBinding = {
      ...candidate,
      binding: { bindingId: randomUUID(), generation: availability.generation },
      scope: request.input.scope,
      execution: availability.runtime,
    };
    this.bindings.set(ref.binding.bindingId, {
      ref,
      authority: request.authority,
      owner: request.owner,
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
      isNested: true,
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
    let admission: ProviderAdmission | null = null;
    let invocation: Invocation | null = null;
    try {
      if (!PlatformIdSchema.safeParse(requestId).success) {
        throw executionError("INVALID_ARGUMENT", "requestId must be a non-empty opaque ID");
      }
      const binding = this.ownedBinding(owner, input.binding);
      admission = this.lifecycle.admit({ binding: binding.ref, isNested: parent !== null });
      const current = this.lifecycle.current();
      const contract = this.lifecycle.contract(binding.ref);
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
      invocation = this.beginInvocation({
        binding,
        admission,
        required,
        parent,
        path,
        requestId,
      });
      const output = await this.dispatchInvocation(invocation, input, deadlineMs);
      // Revocation during the call withholds the result as well.
      this.requirePermissions(binding.authority, required);
      this.requireConforming(contract.definer, { ...methodRef, field: "output", value: output });
      return { status: "ok", value: output };
    } catch (error) {
      const isDispatchedCommand = invocation !== null && method?.mode === "command";
      return { status: "error", error: callFailure({ error, isDispatchedCommand }) };
    } finally {
      if (invocation) this.finishInvocation(invocation.handle);
      admission?.release();
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

  private beginInvocation(input: {
    binding: Binding;
    admission: ProviderAdmission;
    required: readonly string[];
    parent: Invocation | null;
    path: readonly string[];
    requestId: string;
  }): Invocation {
    const { binding, admission, required, parent, path, requestId } = input;
    const callerSignal = parent
      ? AbortSignal.any([binding.authority.signal, parent.signal])
      : binding.authority.signal;
    const controller = new AbortController();
    const invocation: Invocation = {
      handle: randomUUID(),
      authority: binding.authority,
      owner: Symbol("platform-invocation"),
      execution: admission.execution,
      providesId: binding.ref.provider.providesId,
      generation: binding.ref.binding.generation,
      scope: binding.ref.scope,
      controller,
      signal: AbortSignal.any([controller.signal, callerSignal, admission.signal]),
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
        generation: invocation.generation,
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
      deadlineMs + PLATFORM_WORKER_REPLY_GRACE_MS,
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
