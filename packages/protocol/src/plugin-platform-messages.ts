import { z } from "zod";
import {
  PLUGIN_PLATFORM_API_VERSION,
  PlatformCatalogSchema,
  PlatformResolutionPlanSchema,
  PlatformResolvePlanInputSchema,
} from "./plugin-platform.js";

export const PluginPlatformDiscoverySchema = z.object({
  apiVersion: z.literal(PLUGIN_PLATFORM_API_VERSION),
  definitions: z.literal(true),
  resolutionPlans: z.literal(true),
});

export const PluginPlatformDescribeRequestSchema = z.object({
  type: z.literal("plugin.platform.discovery.describe.request"),
  requestId: z.string(),
});
export const PluginPlatformListRequestSchema = z.object({
  type: z.literal("plugin.platform.discovery.list.request"),
  requestId: z.string(),
});
export const PluginPlatformPlanRequestSchema = z.object({
  type: z.literal("plugin.platform.discovery.plan_resolution.request"),
  requestId: z.string(),
  ...PlatformResolvePlanInputSchema.shape,
});
export const PluginPlatformDescribeResponseSchema = z.object({
  type: z.literal("plugin.platform.discovery.describe.response"),
  payload: z.object({ requestId: z.string(), discovery: PluginPlatformDiscoverySchema }),
});
export const PluginPlatformListResponseSchema = z.object({
  type: z.literal("plugin.platform.discovery.list.response"),
  payload: z.object({ requestId: z.string(), catalog: PlatformCatalogSchema }),
});
export const PluginPlatformPlanResponseSchema = z.object({
  type: z.literal("plugin.platform.discovery.plan_resolution.response"),
  payload: z.object({ requestId: z.string(), plan: PlatformResolutionPlanSchema }),
});

export type PluginPlatformDiscovery = z.infer<typeof PluginPlatformDiscoverySchema>;
