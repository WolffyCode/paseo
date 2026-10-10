import { z } from "zod";
import {
  PlatformIdSchema,
  PlatformJsonSchema,
  PlatformLocalIdSchema,
  PlatformProviderCandidateSchema,
  PlatformProviderRefSchema,
  PlatformQualifiedIdSchema,
  PlatformResolvePlanInputSchema,
  PlatformScopeSchema,
  PlatformVersionSchema,
} from "./plugin-platform.js";

export const PLUGIN_PLATFORM_HOST_SERVICES_FEATURE = "pluginPlatformHostServicesV1";
// The v1 contract bounds every deadline; each host announces a lower limit in its capabilities.
const MAX_INVOCATION_DEADLINE_MS = 120_000;

export const PlatformErrorSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
    message: z.string().min(1),
    retryable: z.boolean(),
    details: PlatformJsonSchema.optional(),
  })
  .strict();
// Capability lists are open strings so a newer host can announce more values to older clients.
export const PlatformHostCapabilitiesSchema = z
  .object({
    apiVersion: PlatformVersionSchema,
    runtimes: z.array(z.string()),
    providerScopes: z.array(z.string()),
    targets: z.array(z.string()),
    retryPolicies: z.array(z.string()),
    callers: z.array(z.string()),
    limits: z
      .object({
        deadlineMs: z.number().int().positive(),
        maxCallDepth: z.number().int().positive(),
        maxBindingsPerSession: z.number().int().positive(),
        maxActiveCalls: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();
export const PlatformBindingRefSchema = z
  .object({ bindingId: PlatformIdSchema, generation: PlatformIdSchema })
  .strict();
export const PlatformDaemonRuntimeSchema = z
  .object({
    kind: z.literal("daemon"),
    serverId: PlatformIdSchema,
    runtimeId: PlatformIdSchema,
    generation: PlatformIdSchema,
  })
  .strict();
// The state is an open string so a newer host can report lifecycle states older clients do not know.
export const PlatformProviderStatusSchema = z
  .object({
    providesId: PlatformLocalIdSchema,
    serviceId: PlatformQualifiedIdSchema,
    apiVersion: PlatformVersionSchema,
    state: z.string(),
    generation: PlatformIdSchema.optional(),
    reason: PlatformErrorSchema.optional(),
  })
  .strict();
export const PlatformServiceTargetSchema = z.object({ kind: z.literal("service") }).strict();
export const PlatformHostBindingSchema = PlatformProviderCandidateSchema.extend({
  binding: PlatformBindingRefSchema,
  scope: PlatformScopeSchema,
  execution: PlatformDaemonRuntimeSchema,
});
export const PlatformHostResolveSchema = PlatformResolvePlanInputSchema.omit({
  expectedCatalogRevision: true,
})
  .extend({ target: PlatformServiceTargetSchema })
  .strict();
export const PlatformHostCallSchema = z
  .object({
    binding: PlatformBindingRefSchema,
    method: z
      .string()
      .regex(/^[a-z][a-zA-Z0-9]*$/)
      .max(100),
    target: PlatformServiceTargetSchema,
    params: PlatformJsonSchema,
    deadlineMs: z.number().int().min(1).max(MAX_INVOCATION_DEADLINE_MS).optional(),
  })
  .strict();
export const PlatformNestedResolveSchema = z
  .object({
    bindingKey: PlatformLocalIdSchema,
    mode: z.enum(["one", "many"]),
    target: PlatformServiceTargetSchema,
    scope: PlatformScopeSchema,
    provider: PlatformProviderRefSchema.optional(),
    selectionKey: PlatformIdSchema.optional(),
  })
  .strict();
// Provenance sources are open strings so a newer host can report sources older clients do not know.
export const PlatformEffectiveConfigurationSchema = z
  .object({
    values: PlatformJsonSchema,
    effectiveRevision: PlatformIdSchema,
    sourceRevisions: z.array(
      z.object({ scope: PlatformScopeSchema, revision: PlatformIdSchema }).strict(),
    ),
    provenance: z.record(
      z.string(),
      z
        .object({
          source: z.string(),
          scope: PlatformScopeSchema.optional(),
          revision: PlatformIdSchema.optional(),
        })
        .strict(),
    ),
  })
  .strict();
export const PlatformInvocationProjectionSchema = z
  .object({
    actor: z
      .object({
        kind: z.literal("user"),
        principalId: PlatformIdSchema,
        permissions: z.array(z.string()),
      })
      .strict(),
    source: z.object({ kind: z.literal("session") }).strict(),
    execution: PlatformDaemonRuntimeSchema,
    target: PlatformServiceTargetSchema,
    scope: PlatformScopeSchema,
    /** The invocation settings of the call's own scope, read when the call starts. */
    effectiveConfig: PlatformEffectiveConfigurationSchema,
    trace: z
      .object({
        requestId: PlatformIdSchema,
        callId: PlatformIdSchema,
        parentCallId: PlatformIdSchema.nullable(),
        depth: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export const PlatformHostFailureSchema = z
  .object({ status: z.literal("error"), error: PlatformErrorSchema })
  .strict();
export const PlatformHostResolutionOneSchema = z
  .object({ mode: z.literal("one"), binding: PlatformHostBindingSchema })
  .strict();
export const PlatformHostResolutionManySchema = z
  .object({
    mode: z.literal("many"),
    bindings: z.array(PlatformHostBindingSchema).min(1),
    diagnostics: z.array(PlatformErrorSchema),
  })
  .strict();
export const PlatformHostResolveResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("ok"),
      value: z.discriminatedUnion("mode", [
        PlatformHostResolutionOneSchema,
        PlatformHostResolutionManySchema,
      ]),
    })
    .strict(),
  PlatformHostFailureSchema,
]);
export const PlatformHostCallResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), value: z.unknown() }).strict(),
  PlatformHostFailureSchema,
]);
export const PlatformHostReleaseResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), value: z.null() }).strict(),
  PlatformHostFailureSchema,
]);
export const PluginPlatformHostDescribeRequestSchema = z.object({
  type: z.literal("plugin.platform.host.describe.request"),
  requestId: z.string(),
});
export const PluginPlatformHostDescribeResponseSchema = z.object({
  type: z.literal("plugin.platform.host.describe.response"),
  payload: z.object({ requestId: z.string(), capabilities: PlatformHostCapabilitiesSchema }),
});
export const PluginPlatformHostResolveRequestSchema = z.object({
  type: z.literal("plugin.platform.host.resolve.request"),
  requestId: z.string(),
  input: PlatformHostResolveSchema,
});
export const PluginPlatformHostResolveResponseSchema = z.object({
  type: z.literal("plugin.platform.host.resolve.response"),
  payload: z.object({ requestId: z.string(), result: PlatformHostResolveResultSchema }),
});
export const PluginPlatformHostCallRequestSchema = z.object({
  type: z.literal("plugin.platform.host.call.request"),
  requestId: z.string(),
  input: PlatformHostCallSchema,
});
export const PluginPlatformHostCallResponseSchema = z.object({
  type: z.literal("plugin.platform.host.call.response"),
  payload: z.object({ requestId: z.string(), result: PlatformHostCallResultSchema }),
});
export const PluginPlatformHostReleaseRequestSchema = z.object({
  type: z.literal("plugin.platform.host.release.request"),
  requestId: z.string(),
  binding: PlatformBindingRefSchema,
});
export const PluginPlatformHostReleaseResponseSchema = z.object({
  type: z.literal("plugin.platform.host.release.response"),
  payload: z.object({ requestId: z.string(), result: PlatformHostReleaseResultSchema }),
});

export type PlatformError = z.infer<typeof PlatformErrorSchema>;
export type PlatformHostCapabilities = z.infer<typeof PlatformHostCapabilitiesSchema>;
export type PlatformBindingRef = z.infer<typeof PlatformBindingRefSchema>;
export type PlatformDaemonRuntime = z.infer<typeof PlatformDaemonRuntimeSchema>;
export type PlatformProviderStatus = z.infer<typeof PlatformProviderStatusSchema>;
export type PlatformHostBinding = z.infer<typeof PlatformHostBindingSchema>;
export type PlatformHostResolve = z.infer<typeof PlatformHostResolveSchema>;
export type PlatformHostCall = z.infer<typeof PlatformHostCallSchema>;
export type PlatformNestedResolve = z.infer<typeof PlatformNestedResolveSchema>;
export type PlatformEffectiveConfiguration = z.infer<typeof PlatformEffectiveConfigurationSchema>;
export type PlatformInvocationProjection = z.infer<typeof PlatformInvocationProjectionSchema>;
export type PlatformHostResolutionOne = z.infer<typeof PlatformHostResolutionOneSchema>;
export type PlatformHostResolutionMany = z.infer<typeof PlatformHostResolutionManySchema>;
export type PlatformHostResolveResult = z.infer<typeof PlatformHostResolveResultSchema>;
export type PlatformHostCallResult = z.infer<typeof PlatformHostCallResultSchema>;
export type PlatformHostReleaseResult = z.infer<typeof PlatformHostReleaseResultSchema>;
