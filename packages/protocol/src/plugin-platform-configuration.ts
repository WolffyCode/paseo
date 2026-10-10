import { z } from "zod";
import {
  PlatformIdSchema,
  PlatformInstallationRefSchema,
  PlatformJsonSchema,
  PlatformLocalIdSchema,
  PlatformProviderRefSchema,
  PlatformScopeSchema,
  PlatformSettingsFieldPathSchema,
} from "./plugin-platform.js";
import {
  PlatformEffectiveConfigurationSchema,
  PlatformHostFailureSchema,
} from "./plugin-platform-execution.js";

export const PLUGIN_PLATFORM_CONFIGURATION_FEATURE = "pluginPlatformConfigurationV1";

export const PlatformSettingsRefSchema = z
  .object({ installation: PlatformInstallationRefSchema, settingsId: PlatformLocalIdSchema })
  .strict();
export const PlatformConfigurationReadSchema = z
  .object({ settings: PlatformSettingsRefSchema, scope: PlatformScopeSchema })
  .strict();
/** Replaces the whole override layer of one scope. */
export const PlatformConfigurationWriteSchema = PlatformConfigurationReadSchema.extend({
  expectedRevision: PlatformIdSchema,
  values: PlatformJsonSchema,
}).strict();
/** Removes declared fields from the override layer of one scope. */
export const PlatformConfigurationClearSchema = PlatformConfigurationReadSchema.extend({
  expectedRevision: PlatformIdSchema,
  paths: z.array(PlatformSettingsFieldPathSchema).min(1),
}).strict();
export const PlatformConfigurationChangeSchema = z
  .object({
    revision: PlatformIdSchema,
    /** Providers that drained and restarted because the change touched restart-required fields. */
    restartedProviders: z.array(PlatformProviderRefSchema),
  })
  .strict();
export const PlatformConfigurationReadResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), value: PlatformEffectiveConfigurationSchema }).strict(),
  PlatformHostFailureSchema,
]);
export const PlatformConfigurationChangeResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), value: PlatformConfigurationChangeSchema }).strict(),
  PlatformHostFailureSchema,
]);

export const PluginPlatformConfigReadRequestSchema = z.object({
  type: z.literal("plugin.platform.config.read.request"),
  requestId: z.string(),
  input: PlatformConfigurationReadSchema,
});
export const PluginPlatformConfigReadResponseSchema = z.object({
  type: z.literal("plugin.platform.config.read.response"),
  payload: z.object({ requestId: z.string(), result: PlatformConfigurationReadResultSchema }),
});
export const PluginPlatformConfigWriteRequestSchema = z.object({
  type: z.literal("plugin.platform.config.write.request"),
  requestId: z.string(),
  input: PlatformConfigurationWriteSchema,
});
export const PluginPlatformConfigWriteResponseSchema = z.object({
  type: z.literal("plugin.platform.config.write.response"),
  payload: z.object({ requestId: z.string(), result: PlatformConfigurationChangeResultSchema }),
});
export const PluginPlatformConfigClearRequestSchema = z.object({
  type: z.literal("plugin.platform.config.clear.request"),
  requestId: z.string(),
  input: PlatformConfigurationClearSchema,
});
export const PluginPlatformConfigClearResponseSchema = z.object({
  type: z.literal("plugin.platform.config.clear.response"),
  payload: z.object({ requestId: z.string(), result: PlatformConfigurationChangeResultSchema }),
});

export type PlatformSettingsRef = z.infer<typeof PlatformSettingsRefSchema>;
export type PlatformConfigurationRead = z.infer<typeof PlatformConfigurationReadSchema>;
export type PlatformConfigurationWrite = z.infer<typeof PlatformConfigurationWriteSchema>;
export type PlatformConfigurationClear = z.infer<typeof PlatformConfigurationClearSchema>;
export type PlatformConfigurationChange = z.infer<typeof PlatformConfigurationChangeSchema>;
export type PlatformConfigurationReadResult = z.infer<typeof PlatformConfigurationReadResultSchema>;
export type PlatformConfigurationChangeResult = z.infer<
  typeof PlatformConfigurationChangeResultSchema
>;
