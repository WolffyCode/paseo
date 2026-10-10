import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  Disposer,
  EffectScope,
  InvocationContext,
  Provider,
  ProviderFactory,
  ServerPluginRegistration,
  ServiceDirectory,
  ServiceHandler,
  ServiceProxy,
  ServiceResolveInput,
} from "@getpaseo/plugin/v1/server";
import {
  PlatformHostCallResultSchema,
  PlatformHostCallSchema,
  PlatformHostFailureSchema,
  PlatformHostResolutionManySchema,
  PlatformHostResolutionOneSchema,
  PlatformNestedResolveSchema,
  type PlatformError,
  type PlatformHostBinding,
  type PlatformNestedResolve,
} from "@getpaseo/protocol/plugin-platform-execution";
import { PlatformDiagnosticSchema } from "@getpaseo/protocol/plugin-platform";
import { PluginPlatformError } from "@getpaseo/protocol/plugin-platform-validation";
import type { PluginWorkerChannel } from "../plugin-process.js";
import {
  PluginProcessRequestSchema,
  type PluginProcessRequest,
} from "../plugin-process-protocol.js";
import type {
  PlatformWorkerInitialization,
  PlatformWorkerMessage,
  PlatformWorkerRequest,
} from "./process-protocol.js";
import { createEffectScope } from "./effects.js";
import {
  PlatformWorkerError,
  describeUnknownError,
  executionError,
  toDiagnostic,
  toPlatformError,
} from "./execution-errors.js";

interface ActiveProvider {
  provider: Provider;
  effects: EffectScope;
}
interface NestedRequest {
  handle: string;
  resolve(value: unknown): void;
  reject(error: Error): void;
}
type ActivateRequest = Extract<PlatformWorkerRequest, { type: "platform.activate" }>;
type InvokeRequest = Extract<PlatformWorkerRequest, { type: "platform.invoke" }>;
type NestedRequestMessage = Extract<
  PlatformWorkerMessage,
  { type: "platform.resolve" | "platform.call" }
>;

const JsonValueSchema = z.json();
const ResolveOneResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), value: PlatformHostResolutionOneSchema }).strict(),
  PlatformHostFailureSchema,
]);
const ResolveManyResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), value: PlatformHostResolutionManySchema }).strict(),
  PlatformHostFailureSchema,
]);

function assertProviderShape(value: unknown, providesId: string): asserts value is Provider {
  const isProvider =
    typeof value === "object" &&
    value !== null &&
    "dispose" in value &&
    typeof value.dispose === "function" &&
    "methods" in value &&
    typeof value.methods === "object" &&
    value.methods !== null;
  if (!isProvider) {
    throw executionError(
      "MANIFEST_MISMATCH",
      `Provider ${providesId} must return methods and dispose`,
    );
  }
}

function assertContractMethods(provider: Provider, providesId: string, expected: string[]): void {
  const names = Object.keys(provider.methods).sort();
  const sortedExpected = [...expected].sort();
  const hasSameNames =
    names.length === sortedExpected.length &&
    names.every((name, index) => name === sortedExpected[index]);
  const hasOnlyFunctions = Object.values(provider.methods).every(
    (method) => typeof method === "function",
  );
  if (!hasSameNames || !hasOnlyFunctions) {
    throw executionError(
      "MANIFEST_MISMATCH",
      `Provider ${providesId} methods differ from its service contract`,
    );
  }
}

async function runHandler(
  handler: ServiceHandler,
  input: Record<string, unknown>,
  context: InvocationContext,
): Promise<unknown> {
  try {
    return await handler(input, context);
  } catch (error) {
    // A typed platform error is the provider's own result; anything else leaves the outcome open.
    // Only its code and message cross the boundary, so a rethrown nested error stays declared.
    const declared =
      error instanceof PluginPlatformError
        ? PlatformDiagnosticSchema.safeParse({
            code: error.diagnostic.code,
            message: error.diagnostic.message,
          })
        : null;
    if (declared?.success) throw new PlatformWorkerError(declared.data, true);
    throw new PlatformWorkerError(
      { code: "INTERNAL", message: describeUnknownError(error) },
      false,
    );
  }
}

// Failures raised before a handler runs, such as a missing provider, mean it never started.
function isOutcomeKnown(error: unknown): boolean {
  if (error instanceof PlatformWorkerError) return error.outcomeKnown;
  return error instanceof PluginPlatformError;
}

function invalidArgument(message: string): { status: "error"; error: PlatformError } {
  return { status: "error", error: toPlatformError(executionError("INVALID_ARGUMENT", message)) };
}

function parseJsonOutput(output: unknown): unknown {
  const parsed = JsonValueSchema.safeParse(output);
  if (!parsed.success) {
    throw new PlatformWorkerError(
      { code: "PROVIDER_RESULT_INVALID", message: "Provider output must be a JSON value" },
      false,
    );
  }
  return parsed.data;
}

export function createPlatformWorker(options: {
  channel: PluginWorkerChannel;
  register: ServerPluginRegistration;
  initialization: PlatformWorkerInitialization;
}): { shutdown(): Promise<void> } {
  const { channel, register, initialization } = options;
  const { manifest, installation, runtime } = initialization;
  const effects = createEffectScope();
  const factories = new Map<string, ProviderFactory>();
  const active = new Map<string, ActiveProvider>();
  const calls = new Map<string, AbortController>();
  const nested = new Map<string, NestedRequest>();
  let isRegistering = false;
  let isInitialized = false;
  let isStopping = false;
  let activations = Promise.resolve();
  let closing: Promise<void> | null = null;

  function serialize(task: () => Promise<void>): Promise<void> {
    const next = activations.then(task);
    // The caller observes the failure through `next`; the queue keeps serving later tasks.
    activations = next.catch(() => undefined);
    return next;
  }

  async function deactivateAll(): Promise<void> {
    for (const [providesId, current] of [...active].toReversed()) {
      active.delete(providesId);
      await current.effects.dispose();
    }
  }

  async function createProvider(message: ActivateRequest): Promise<void> {
    if (active.has(message.providesId)) return;
    const factory = factories.get(message.providesId);
    if (!factory) {
      throw executionError(
        "MANIFEST_MISMATCH",
        `Provider ${message.providesId} has no registered factory`,
      );
    }
    const scope = effects.child(message.providesId);
    try {
      const provider: unknown = await factory({
        provider: { installation, providesId: message.providesId },
        scope: { kind: "host", serverId: runtime.serverId },
        runtime,
        effects: scope,
      });
      assertProviderShape(provider, message.providesId);
      scope.use(() => provider.dispose());
      assertContractMethods(provider, message.providesId, message.methods);
      if (isStopping) throw executionError("PLUGIN_UNAVAILABLE", "Plugin is stopping");
      active.set(message.providesId, { provider, effects: scope });
    } catch (error) {
      await scope.dispose();
      throw error;
    }
  }

  function cancel(handle: string): void {
    calls.get(handle)?.abort();
    calls.delete(handle);
    for (const [requestId, request] of nested) {
      if (request.handle !== handle) continue;
      nested.delete(requestId);
      request.reject(executionError("CANCELLED", "The calling invocation has ended"));
    }
  }

  function requestNested(handle: string, message: NestedRequestMessage): Promise<unknown> {
    const call = calls.get(handle);
    if (!call || call.signal.aborted) {
      return Promise.reject(executionError("CANCELLED", "The calling invocation has ended"));
    }
    return new Promise((resolve, reject) => {
      nested.set(message.requestId, { handle, resolve, reject });
      channel.send(message);
    });
  }

  function settleNested(requestId: string, result: unknown): void {
    const request = nested.get(requestId);
    // The invocation already ended and rejected this request locally.
    if (!request) return;
    nested.delete(requestId);
    request.resolve(result);
  }

  function proxy(handle: string, binding: PlatformHostBinding): ServiceProxy {
    let isReleased = false;
    return {
      binding,
      async call(method, input) {
        if (isReleased) {
          return {
            status: "error",
            error: toPlatformError(executionError("STALE_BINDING", "Service binding was released")),
          };
        }
        // Plugin code is untyped at runtime; a malformed request must fail here, not the process.
        const call = PlatformHostCallSchema.safeParse({
          ...input,
          binding: binding.binding,
          method,
        });
        if (!call.success) return invalidArgument(call.error.message);
        try {
          const result = await requestNested(handle, {
            type: "platform.call",
            requestId: randomUUID(),
            invocationHandle: handle,
            input: call.data,
          });
          return PlatformHostCallResultSchema.parse(result);
        } catch (error) {
          return { status: "error", error: toPlatformError(error) };
        }
      },
      release() {
        if (isReleased) return;
        isReleased = true;
        channel.send({
          type: "platform.release",
          invocationHandle: handle,
          binding: binding.binding,
        });
      },
    };
  }

  function services(handle: string): ServiceDirectory {
    function resolve(
      mode: PlatformNestedResolve["mode"],
      bindingKey: string,
      request: ServiceResolveInput,
    ): Promise<unknown> {
      const input = PlatformNestedResolveSchema.safeParse({ ...request, bindingKey, mode });
      if (!input.success) return Promise.resolve(invalidArgument(input.error.message));
      return requestNested(handle, {
        type: "platform.resolve",
        requestId: randomUUID(),
        invocationHandle: handle,
        input: input.data,
      });
    }
    return {
      async resolveOne(bindingKey, request) {
        try {
          const result = ResolveOneResultSchema.parse(await resolve("one", bindingKey, request));
          if (result.status === "error") return result;
          return { status: "ok", value: proxy(handle, result.value.binding) };
        } catch (error) {
          return { status: "error", error: toPlatformError(error) };
        }
      },
      async resolveMany(bindingKey, request) {
        try {
          const result = ResolveManyResultSchema.parse(await resolve("many", bindingKey, request));
          if (result.status === "error") return result;
          return {
            status: "ok",
            value: {
              bindings: result.value.bindings.map((binding) => proxy(handle, binding)),
              diagnostics: result.value.diagnostics,
            },
          };
        } catch (error) {
          return { status: "error", error: toPlatformError(error) };
        }
      },
    };
  }

  async function invoke(message: InvokeRequest): Promise<unknown> {
    await activations;
    const current = active.get(message.providesId);
    if (!current) {
      throw executionError("PLUGIN_UNAVAILABLE", `Provider ${message.providesId} is not active`);
    }
    const handler = current.provider.methods[message.method];
    if (!handler) {
      throw executionError(
        "INVALID_ARGUMENT",
        `Provider ${message.providesId} has no method ${message.method}`,
      );
    }
    const controller = new AbortController();
    calls.set(message.invocationHandle, controller);
    const context: InvocationContext = Object.freeze({
      ...message.context,
      signal: AbortSignal.any([controller.signal, current.effects.signal]),
      services: services(message.invocationHandle),
    });
    try {
      return parseJsonOutput(await runHandler(handler, message.input, context));
    } finally {
      cancel(message.invocationHandle);
    }
  }

  function provide(providesId: string, factory: ProviderFactory): Disposer {
    if (!isRegistering) {
      throw executionError(
        "REGISTRATION_CLOSED",
        "Register provider factories synchronously inside register()",
      );
    }
    if (!manifest.provides.some((provider) => provider.id === providesId)) {
      throw executionError("MANIFEST_MISMATCH", `Provider ${providesId} is not declared`);
    }
    if (factories.has(providesId)) {
      throw executionError("REGISTRATION_CONFLICT", `Provider ${providesId} is already registered`);
    }
    factories.set(providesId, factory);
    return () => {
      factories.delete(providesId);
    };
  }

  function initialize(): void {
    if (isInitialized)
      throw executionError("REGISTRATION_CONFLICT", "Plugin is already initialized");
    isInitialized = true;
    isRegistering = true;
    let cleanup: Disposer | undefined;
    try {
      cleanup = register({ installation, runtime, effects, providers: { provide } });
    } finally {
      isRegistering = false;
    }
    // Plugin bundles are untyped JavaScript at runtime, so the declared return type is not proof.
    if (typeof cleanup !== "function") {
      throw executionError("MANIFEST_MISMATCH", "register() must return a disposer");
    }
    effects.use(cleanup);
    const registered = [...factories.keys()].sort();
    const declared = manifest.provides.map((provider) => provider.id).sort();
    const isComplete =
      registered.length === declared.length &&
      registered.every((id, index) => id === declared[index]);
    if (!isComplete) {
      throw executionError("MANIFEST_MISMATCH", "Registered providers differ from the manifest");
    }
    channel.send({ type: "ready", methods: [], providers: [], platformProviders: registered });
  }

  function shutdown(): Promise<void> {
    if (!closing) {
      isStopping = true;
      // Map iteration tolerates cancel() deleting the entry it is visiting.
      for (const handle of calls.keys()) cancel(handle);
      closing = serialize(deactivateAll)
        .finally(() => effects.dispose())
        .finally(() => {
          unsubscribe();
          channel.disconnect();
        });
    }
    return closing;
  }

  function stopAfterFatal(reason: string): void {
    channel.send({ type: "fatal", error: reason });
    void shutdown().catch((failure) => console.error("Plugin cleanup failed", failure));
  }

  function reply(requestId: string, work: Promise<unknown>): void {
    void work.then(
      (output) => channel.send({ type: "result", requestId, output }),
      (error: unknown) =>
        channel.send({
          type: "platform.error",
          requestId,
          error: toDiagnostic(error),
          outcomeKnown: isOutcomeKnown(error),
        }),
    );
  }

  function dispatch(message: PluginProcessRequest): void {
    if (message.type === "shutdown") {
      void shutdown().catch((error) => console.error("Plugin cleanup failed", error));
      return;
    }
    if (message.type === "platform.resolved" || message.type === "platform.called") {
      settleNested(message.requestId, message.result);
      return;
    }
    if (message.type === "platform.cancel") {
      cancel(message.invocationHandle);
      return;
    }
    // The runtime rejects its outstanding requests itself when it stops a plugin.
    if (isStopping) return;
    if (message.type === "initialize") {
      try {
        initialize();
      } catch (error) {
        stopAfterFatal(describeUnknownError(error));
      }
      return;
    }
    if (message.type === "platform.activate") {
      reply(
        message.requestId,
        serialize(() => createProvider(message)).then(() => null),
      );
      return;
    }
    if (message.type === "platform.invoke") {
      reply(message.requestId, invoke(message));
      return;
    }
    stopAfterFatal("v1 plugins accept only platform requests");
  }

  const unsubscribe = channel.onMessage((raw) => {
    const parsed = PluginProcessRequestSchema.safeParse(raw);
    if (parsed.success) dispatch(parsed.data);
    else stopAfterFatal(`Invalid plugin process request: ${parsed.error.message}`);
  });
  return { shutdown };
}
