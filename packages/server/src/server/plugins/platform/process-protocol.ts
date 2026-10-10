import { z } from "zod";
import {
  PluginPlatformManifestSchema,
  PlatformDiagnosticSchema,
  PlatformInstallationRefSchema,
  PlatformLocalIdSchema,
} from "@getpaseo/protocol/plugin-platform";
import {
  PlatformBindingRefSchema,
  PlatformDaemonRuntimeSchema,
  PlatformEffectiveConfigurationSchema,
  PlatformHostCallSchema,
  PlatformHostCallResultSchema,
  PlatformHostResolveResultSchema,
  PlatformInvocationProjectionSchema,
  PlatformNestedResolveSchema,
} from "@getpaseo/protocol/plugin-platform-execution";

export const PlatformWorkerInitializationSchema = z
  .object({
    manifest: PluginPlatformManifestSchema,
    installation: PlatformInstallationRefSchema,
    runtime: PlatformDaemonRuntimeSchema,
  })
  .strict();
export const PlatformWorkerRequestSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("platform.activate"),
      requestId: z.string(),
      providesId: PlatformLocalIdSchema,
      generation: z.string(),
      methods: z.array(z.string()),
      config: PlatformEffectiveConfigurationSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("platform.deactivate"),
      requestId: z.string(),
      providesId: PlatformLocalIdSchema,
      generation: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("platform.invoke"),
      requestId: z.string(),
      invocationHandle: z.string(),
      providesId: PlatformLocalIdSchema,
      generation: z.string(),
      method: z.string(),
      input: z.record(z.string(), z.unknown()),
      context: PlatformInvocationProjectionSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("platform.cancel"),
      invocationHandle: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("platform.resolved"),
      requestId: z.string(),
      result: PlatformHostResolveResultSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("platform.called"),
      requestId: z.string(),
      result: PlatformHostCallResultSchema,
    })
    .strict(),
]);
export const PlatformWorkerMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("platform.resolve"),
      requestId: z.string(),
      invocationHandle: z.string(),
      input: PlatformNestedResolveSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("platform.call"),
      requestId: z.string(),
      invocationHandle: z.string(),
      input: PlatformHostCallSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("platform.release"),
      invocationHandle: z.string(),
      binding: PlatformBindingRefSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("platform.error"),
      requestId: z.string(),
      error: PlatformDiagnosticSchema,
      outcomeKnown: z.boolean(),
    })
    .strict(),
]);
export type PlatformWorkerInitialization = z.infer<typeof PlatformWorkerInitializationSchema>;
export type PlatformWorkerRequest = z.infer<typeof PlatformWorkerRequestSchema>;
export type PlatformWorkerMessage = z.infer<typeof PlatformWorkerMessageSchema>;
export type PlatformNestedMessage = Exclude<PlatformWorkerMessage, { type: "platform.error" }>;
