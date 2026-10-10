import type {
  PlatformDaemonRuntime,
  PlatformError,
  PlatformHostBinding,
  PlatformHostCall,
  PlatformHostCallResult,
  PlatformInvocationProjection,
  PlatformNestedResolve,
} from "@getpaseo/protocol/plugin-platform-execution";
import type { PlatformProviderRef, PlatformScope } from "../v1.js";

// This entry exposes the implemented host-service subset of the v1 server contract.
export type Disposer = () => void | Promise<void>;
export interface EffectScope {
  readonly signal: AbortSignal;
  use(dispose: Disposer): Disposer;
  child(label: string): EffectScope;
  dispose(): Promise<void>;
}
export type Result<T> = { status: "ok"; value: T } | { status: "error"; error: PlatformError };
export type ServiceCallInput = Omit<PlatformHostCall, "binding" | "method">;
export type ServiceResolveInput = Omit<PlatformNestedResolve, "bindingKey" | "mode">;
export interface ServiceProxy {
  readonly binding: PlatformHostBinding;
  call(method: string, input: ServiceCallInput): Promise<PlatformHostCallResult>;
  release(): void;
}
export interface ServiceSet {
  readonly bindings: readonly ServiceProxy[];
  readonly diagnostics: readonly PlatformError[];
}
export interface ServiceDirectory {
  resolveOne(bindingKey: string, input: ServiceResolveInput): Promise<Result<ServiceProxy>>;
  resolveMany(bindingKey: string, input: ServiceResolveInput): Promise<Result<ServiceSet>>;
}
export interface InvocationContext extends PlatformInvocationProjection {
  readonly signal: AbortSignal;
  readonly services: ServiceDirectory;
}
export type ServiceHandler = (
  input: Record<string, unknown>,
  context: InvocationContext,
) => unknown;
export interface Provider {
  readonly methods: Readonly<Record<string, ServiceHandler>>;
  dispose(): void | Promise<void>;
}
export interface ProviderContext {
  readonly provider: PlatformProviderRef;
  readonly scope: PlatformScope;
  readonly runtime: PlatformDaemonRuntime;
  readonly effects: EffectScope;
}
export type ProviderFactory = (context: ProviderContext) => Provider | Promise<Provider>;
export interface ServerPluginContext {
  readonly installation: PlatformProviderRef["installation"];
  readonly runtime: PlatformDaemonRuntime;
  readonly effects: EffectScope;
  readonly providers: {
    provide(providesId: string, factory: ProviderFactory): Disposer;
  };
}
export type ServerPluginRegistration = (context: ServerPluginContext) => Disposer;
export type {
  PlatformBindingRef,
  PlatformError,
  PlatformHostBinding,
  PlatformHostCall,
  PlatformHostCallResult,
  PlatformInvocationProjection,
} from "@getpaseo/protocol/plugin-platform-execution";
