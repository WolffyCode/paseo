import { z } from "zod";

export const PLUGIN_PLATFORM_API_VERSION = "1.0.0";
export const PlatformIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[^\p{Cc}]+$/u);
export const PlatformLocalIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
export const PlatformQualifiedIdSchema = z
  .string()
  .max(192)
  .regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/);
export const PlatformVersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
export const PlatformRangeSchema = z.string().min(1);
export const PlatformPathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*[\\:#?\p{Cc}])(?!.*\/\/)(?!.*\/$).+$/u);
export const PlatformRuntimeSchema = z.enum(["client", "daemon", "desktop"]);
export const PlatformScopeKindSchema = z.enum(["host", "project", "conversation", "client"]);
export const PlatformPermissionsSchema = z.array(PlatformQualifiedIdSchema).min(1);
// JSON files and transport decoding own JSON-value validation; recursive z.json breaks AOT generation.
export const PlatformJsonSchema = z.record(z.string(), z.unknown());

export const PlatformScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("host"), serverId: PlatformIdSchema }).strict(),
  z
    .object({ kind: z.literal("project"), serverId: PlatformIdSchema, projectId: PlatformIdSchema })
    .strict(),
  z
    .object({
      kind: z.literal("conversation"),
      serverId: PlatformIdSchema,
      conversationId: PlatformIdSchema,
      projectId: PlatformIdSchema.optional(),
    })
    .strict(),
  z.object({ kind: z.literal("client"), clientId: PlatformIdSchema }).strict(),
]);
export const PlatformInstallationRefSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("host"),
      serverId: PlatformIdSchema,
      installationId: PlatformIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("client"),
      clientId: PlatformIdSchema,
      installationId: PlatformIdSchema,
    })
    .strict(),
]);
export const PlatformProviderRefSchema = z
  .object({ installation: PlatformInstallationRefSchema, providesId: PlatformLocalIdSchema })
  .strict();
export const PlatformConsumerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("runtime"), runtime: z.enum(["client", "daemon"]) }).strict(),
  z.object({ kind: z.literal("provider"), id: PlatformLocalIdSchema }).strict(),
  z.object({ kind: z.literal("contribution"), id: PlatformLocalIdSchema }).strict(),
]);
export const PlatformDependencySchema = z
  .object({
    bindingKey: PlatformLocalIdSchema,
    serviceId: PlatformQualifiedIdSchema,
    range: PlatformRangeSchema,
    optional: z.boolean(),
    runtime: PlatformRuntimeSchema,
    scope: PlatformScopeKindSchema,
    consumer: PlatformConsumerSchema,
    activation: z.enum(["eager", "contextual"]),
  })
  .strict();
export const PlatformProviderSchema = z
  .object({
    id: PlatformLocalIdSchema,
    serviceId: PlatformQualifiedIdSchema,
    apiVersion: PlatformVersionSchema,
    runtime: PlatformRuntimeSchema,
    scopes: z.array(PlatformScopeKindSchema).min(1),
    selectionKey: PlatformIdSchema.optional(),
    settingsId: PlatformLocalIdSchema.optional(),
    stateId: PlatformLocalIdSchema.optional(),
    stopPolicy: z.enum(["drain", "handoff", "restart-required", "terminate-with-confirmation"]),
  })
  .strict();
export const PlatformContributionSchema = z
  .object({
    id: PlatformLocalIdSchema,
    extensionPoint: z
      .object({ id: PlatformQualifiedIdSchema, range: PlatformRangeSchema })
      .strict(),
    runtime: z.enum(["client", "daemon", "desktop", "installation"]),
    settingsId: PlatformLocalIdSchema.optional(),
    stateId: PlatformLocalIdSchema.optional(),
    data: PlatformJsonSchema,
  })
  .strict();
const TransitionSchema = z
  .object({
    from: z.number().int().positive(),
    to: z.number().int().positive(),
    handler: PlatformLocalIdSchema,
  })
  .strict();
export const PlatformSettingsSchema = z
  .object({
    id: PlatformLocalIdSchema,
    schemaVersion: z.number().int().positive(),
    schema: PlatformPathSchema,
    migrationRuntime: z.enum(["client", "daemon"]),
    allowedScopes: z.array(PlatformScopeKindSchema).min(1),
    fields: z
      .array(
        z
          .object({
            path: z.string().regex(/^(?:\/(?:[^~/]|~0|~1)*)+$/),
            allowedScopes: z.array(PlatformScopeKindSchema).min(1),
            application: z.enum(["provider", "invocation", "view"]),
            restartRequired: z.boolean(),
          })
          .strict(),
      )
      .min(1),
    transitions: z.array(TransitionSchema),
  })
  .strict();
export const PlatformStateSchema = z
  .object({
    id: PlatformLocalIdSchema,
    runtime: z.enum(["client", "daemon"]),
    owner: z.enum(["installation", "provider", "instance", "view"]),
    schemaVersion: z.number().int().positive(),
    schema: PlatformPathSchema,
    readableVersions: z.array(z.number().int().positive()).min(1),
    transitions: z.array(TransitionSchema),
  })
  .strict();
export const PluginPlatformManifestSchema = z
  .object({
    manifestVersion: z.literal(1),
    packageId: z
      .string()
      .max(128)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/),
    id: PlatformLocalIdSchema,
    name: z.string().min(1).max(100),
    description: z.string().max(1000).optional(),
    icon: PlatformPathSchema.optional(),
    requirements: z
      .object({
        paseo: PlatformRangeSchema,
        helmPlatform: PlatformRangeSchema,
        features: z.array(PlatformIdSchema).optional(),
      })
      .strict(),
    kind: z.enum(["code", "resource"]),
    runtimes: z
      .object({
        client: z
          .object({
            entry: z.enum(["index.client.ts", "index.client.tsx"]),
            platforms: z.array(z.enum(["electron", "web", "ios", "android"])).min(1),
            execution: z.enum(["trusted", "isolated"]),
          })
          .strict()
          .optional(),
        daemon: z
          .object({
            entry: z.enum(["index.server.ts", "index.server.tsx"]),
            execution: z.enum(["trusted", "isolated"]),
          })
          .strict()
          .optional(),
      })
      .strict(),
    contracts: z.array(
      z
        .object({
          serviceId: PlatformQualifiedIdSchema,
          apiVersion: PlatformVersionSchema,
          schema: PlatformPathSchema,
        })
        .strict(),
    ),
    extensionPoints: z.array(
      z
        .object({
          id: PlatformQualifiedIdSchema,
          apiVersion: PlatformVersionSchema,
          schema: PlatformPathSchema,
        })
        .strict(),
    ),
    provides: z.array(PlatformProviderSchema),
    requires: z.array(PlatformDependencySchema),
    contributions: z.array(PlatformContributionSchema),
    settings: z.array(PlatformSettingsSchema),
    states: z.array(PlatformStateSchema),
    build: z
      .array(z.array(z.string().min(1)).min(1))
      .min(1)
      .optional(),
  })
  .strict();

export const PlatformMethodSchema = z
  .object({
    mode: z.enum(["query", "command", "presentation"]),
    runtime: PlatformRuntimeSchema,
    targets: z.array(z.enum(["service", "resource", "instance"])).min(1),
    resourceKinds: z.array(PlatformIdSchema).min(1).optional(),
    permissions: PlatformPermissionsSchema,
    observationPermissions: PlatformPermissionsSchema.optional(),
    retry: z.enum(["read", "durable", "no-replay"]),
    cancellation: z.enum(["cooperative", "before-start", "none"]),
    requiredEnvelopeFields: z.array(z.enum(["contextRevision", "expectedRevision"])).optional(),
    input: PlatformJsonSchema,
    output: PlatformJsonSchema,
  })
  .strict();
const eventProperties = {
  runtime: PlatformRuntimeSchema,
  permissions: PlatformPermissionsSchema,
  targets: z.array(z.enum(["service", "resource", "instance"])).min(1),
  resourceKinds: z.array(PlatformIdSchema).min(1).optional(),
};
export const PlatformEventSchema = z.discriminatedUnion("delivery", [
  z
    .object({
      ...eventProperties,
      delivery: z.literal("snapshot"),
      snapshotSchema: PlatformJsonSchema,
      deltaSchema: PlatformJsonSchema.optional(),
    })
    .strict(),
  z
    .object({ ...eventProperties, delivery: z.literal("durable"), payload: PlatformJsonSchema })
    .strict(),
  z
    .object({ ...eventProperties, delivery: z.literal("ephemeral"), payload: PlatformJsonSchema })
    .strict(),
]);
const serviceProperties = {
  schemaVersion: z.literal(1),
  serviceId: PlatformQualifiedIdSchema,
  apiVersion: PlatformVersionSchema,
  ownerNamespace: PlatformLocalIdSchema,
  inspectPermissions: PlatformPermissionsSchema,
  methods: z.record(z.string().regex(/^[a-z][a-zA-Z0-9]*$/), PlatformMethodSchema),
  events: z.record(z.string().regex(/^[a-z][a-zA-Z0-9]*$/), PlatformEventSchema),
  interceptors: z.record(
    z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
    z
      .object({
        input: PlatformJsonSchema,
        output: PlatformJsonSchema,
        permissions: PlatformPermissionsSchema,
        runtime: PlatformRuntimeSchema,
        order: z.number().int(),
        timeoutMs: z.number().int().min(1).max(120000),
      })
      .strict(),
  ),
};
export const PlatformServiceSchema = z.discriminatedUnion("cardinality", [
  z.object({ ...serviceProperties, cardinality: z.literal("single") }).strict(),
  z
    .object({
      ...serviceProperties,
      cardinality: z.literal("set"),
      selectionPolicy: z
        .object({
          keyDescription: z.string().min(1),
          duplicate: z.literal("reject"),
          order: z.literal("selectionKey-then-providerRef"),
        })
        .strict(),
    })
    .strict(),
]);
const extensionProperties = {
  extensionPointId: PlatformQualifiedIdSchema,
  apiVersion: PlatformVersionSchema,
  dataSchema: PlatformJsonSchema,
  hostService: z
    .object({ serviceId: PlatformQualifiedIdSchema, range: PlatformRangeSchema })
    .strict(),
  hostRuntime: z.enum(["client", "daemon", "desktop", "any"]),
  activation: z.enum(["installation", "runtime", "instance"]),
};
export const PlatformExtensionPointSchema = z.discriminatedUnion("registration", [
  z.object({ ...extensionProperties, registration: z.literal("data") }).strict(),
  z
    .object({
      ...extensionProperties,
      registration: z.literal("implementation"),
      implementationContract: PlatformIdSchema,
    })
    .strict(),
]);
export const PlatformDiagnosticSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
    message: z.string(),
    installationId: PlatformIdSchema.optional(),
    nodeId: z.string().optional(),
    path: z.array(z.string()).optional(),
  })
  .strict();
export const PlatformCatalogEntrySchema = z
  .object({
    package: z.object({ name: z.string().min(1), version: PlatformVersionSchema }).nullable(),
    installation: PlatformInstallationRefSchema,
    origin: z.enum(["builtin", "configured"]),
    enabled: z.boolean(),
    manifest: PluginPlatformManifestSchema.nullable(),
    services: z.array(
      z
        .object({
          definition: PlatformServiceSchema,
          schemaDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
        })
        .strict(),
    ),
    extensionPoints: z.array(
      z
        .object({
          definition: PlatformExtensionPointSchema,
          schemaDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
        })
        .strict(),
    ),
    diagnostics: z.array(PlatformDiagnosticSchema),
  })
  .strict();
export const PlatformCatalogSchema = z
  .object({
    serverId: PlatformIdSchema,
    apiVersion: z.literal(PLUGIN_PLATFORM_API_VERSION),
    revision: z.string(),
    entries: z.array(PlatformCatalogEntrySchema),
  })
  .strict();
export const PlatformResolvePlanInputSchema = z
  .object({
    mode: z.enum(["one", "many"]),
    serviceId: PlatformQualifiedIdSchema,
    range: PlatformRangeSchema,
    runtime: PlatformRuntimeSchema,
    providerScope: PlatformScopeKindSchema,
    scope: PlatformScopeSchema,
    provider: PlatformProviderRefSchema.optional(),
    selectionKey: PlatformIdSchema.optional(),
    expectedCatalogRevision: PlatformIdSchema.optional(),
  })
  .strict();
export const PlatformProviderCandidateSchema = z
  .object({
    provider: PlatformProviderRefSchema,
    serviceId: PlatformQualifiedIdSchema,
    apiVersion: PlatformVersionSchema,
    schemaDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    runtime: PlatformRuntimeSchema,
    providerScope: PlatformScopeKindSchema,
    selectionKey: PlatformIdSchema.optional(),
  })
  .strict();
export const PlatformResolutionPlanSchema = z
  .object({
    catalogRevision: z.string(),
    mode: z.enum(["one", "many"]),
    candidates: z.array(PlatformProviderCandidateSchema),
    nodes: z.array(
      z
        .object({
          nodeId: z.string(),
          state: z.enum(["resolved", "configuring", "blocked"]),
          dependencies: z.array(z.string()),
          absentDependencies: z.array(z.string()),
          diagnostics: z.array(PlatformDiagnosticSchema),
        })
        .strict(),
    ),
    diagnostics: z.array(PlatformDiagnosticSchema),
  })
  .strict();

export type PluginPlatformManifest = z.infer<typeof PluginPlatformManifestSchema>;
export type PlatformService = z.infer<typeof PlatformServiceSchema>;
export type PlatformExtensionPoint = z.infer<typeof PlatformExtensionPointSchema>;
export type PlatformDiagnostic = z.infer<typeof PlatformDiagnosticSchema>;
export type PlatformScope = z.infer<typeof PlatformScopeSchema>;
export type PlatformConsumer = z.infer<typeof PlatformConsumerSchema>;
export type PlatformDependency = z.infer<typeof PlatformDependencySchema>;
export type PlatformProvider = z.infer<typeof PlatformProviderSchema>;
export type PlatformProviderRef = z.infer<typeof PlatformProviderRefSchema>;
export type PlatformCatalog = z.infer<typeof PlatformCatalogSchema>;
export type PlatformCatalogEntry = z.infer<typeof PlatformCatalogEntrySchema>;
export type PlatformResolvePlanInput = z.infer<typeof PlatformResolvePlanInputSchema>;
export type PlatformProviderCandidate = z.infer<typeof PlatformProviderCandidateSchema>;
export type PlatformResolutionPlan = z.infer<typeof PlatformResolutionPlanSchema>;
