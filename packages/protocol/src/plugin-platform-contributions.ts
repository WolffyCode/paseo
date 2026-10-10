import { z } from "zod";
import {
  PlatformIdSchema,
  PlatformLocalIdSchema,
  PlatformPathSchema,
  PlatformPermissionsSchema,
  PlatformQualifiedIdSchema,
  PlatformRangeSchema,
  PlatformScopeKindSchema,
  type PlatformExtensionPoint,
} from "./plugin-platform.js";

export const PLATFORM_PERMISSION_EXTENSION_POINT = "helm.auth.permission";

const display = { title: z.string().min(1), icon: z.string().regex(/^[A-Z][a-zA-Z0-9]+$/) };
const projection = {
  bindingKey: PlatformLocalIdSchema,
  serviceId: PlatformQualifiedIdSchema,
  range: PlatformRangeSchema,
  method: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
};
const schemas = {
  "helm.ui.card": z
    .object({
      ...display,
      supportedPlatforms: z.array(z.enum(["electron", "web", "ios", "android"])).min(1),
      requiredServices: z.array(PlatformLocalIdSchema),
      configurationSchema: PlatformPathSchema,
      requiredContext: z.array(
        z.enum(["serverId", "projectId", "workspaceId", "conversationId", "directory"]),
      ),
      instancePolicy: z.enum(["multiple", "one-per-host", "one-per-resource", "one-per-window"]),
      viewStateId: PlatformLocalIdSchema,
      inspectPermissions: PlatformPermissionsSchema,
      closePolicy: z.enum(["release-view", "guarded"]),
    })
    .strict(),
  "helm.ui.settings": z.object({ ...display, settingsId: PlatformLocalIdSchema }).strict(),
  "helm.ui.navigation": z
    .object({ ...display, order: z.number().int(), cardContributionId: PlatformLocalIdSchema })
    .strict(),
  "helm.ui.command": z.object({ ...display, ...projection }).strict(),
  "helm.ui.theme": z.object({ title: z.string().min(1), tokens: PlatformPathSchema }).strict(),
  "helm.agent.tool": z
    .object({
      ...projection,
      title: z.string().min(1),
      description: z.string().optional(),
      scopes: z.array(PlatformScopeKindSchema).min(1),
    })
    .strict(),
  "helm.agent.skill": z
    .object({
      path: PlatformPathSchema,
      requiresContributions: z.array(PlatformLocalIdSchema).optional(),
      requiredServices: z.array(PlatformLocalIdSchema).optional(),
      scopes: z.array(z.enum(["host", "project", "conversation"])).min(1),
    })
    .strict(),
  "helm.agent.provider": z
    .object({
      providerId: PlatformQualifiedIdSchema,
      label: z.string().min(1),
      implementationApi: z.literal("paseo-provider-0.11.1"),
    })
    .strict(),
  "helm.timeline.renderer": z
    .object({
      kind: PlatformQualifiedIdSchema,
      itemVersion: z.number().int().positive(),
      itemSchema: PlatformPathSchema,
    })
    .strict(),
  "helm.attachments.source": z
    .object({ ...display, ...projection, resultApi: z.literal("paseo-attachment-0.11.1") })
    .strict(),
  "helm.automation.handler": z.object({ ...projection, title: z.string().min(1) }).strict(),
  [PLATFORM_PERMISSION_EXTENSION_POINT]: z
    .object({
      id: PlatformQualifiedIdSchema,
      basePermissions: PlatformPermissionsSchema,
      methods: z.array(PlatformIdSchema).min(1),
      description: z.string().min(1),
    })
    .strict(),
};

export const PlatformPermissionDefinitionSchema = schemas[PLATFORM_PERMISSION_EXTENSION_POINT];

interface StandardExtension {
  id: keyof typeof schemas;
  host: string;
  runtime: PlatformExtensionPoint["hostRuntime"];
  activation: PlatformExtensionPoint["activation"];
  implementation?: string;
}
const extensions: StandardExtension[] = [
  {
    id: "helm.ui.card",
    host: "helm.views",
    runtime: "client",
    activation: "instance",
    implementation: "CardImplementation",
  },
  {
    id: "helm.ui.settings",
    host: "helm.settings.ui",
    runtime: "client",
    activation: "runtime",
    implementation: "SettingsImplementation",
  },
  { id: "helm.ui.navigation", host: "helm.workbench", runtime: "client", activation: "runtime" },
  { id: "helm.ui.command", host: "helm.commands", runtime: "client", activation: "runtime" },
  { id: "helm.ui.theme", host: "helm.themes", runtime: "client", activation: "installation" },
  { id: "helm.agent.tool", host: "helm.agent.tools", runtime: "any", activation: "installation" },
  { id: "helm.agent.skill", host: "helm.agent.skills", runtime: "any", activation: "installation" },
  {
    id: "helm.agent.provider",
    host: "helm.agent.providers",
    runtime: "daemon",
    activation: "runtime",
    implementation: "ProviderImplementation",
  },
  {
    id: "helm.timeline.renderer",
    host: "helm.conversation.timeline.ui",
    runtime: "client",
    activation: "runtime",
    implementation: "TimelineImplementation",
  },
  {
    id: "helm.attachments.source",
    host: "helm.attachments",
    runtime: "any",
    activation: "installation",
  },
  {
    id: "helm.automation.handler",
    host: "helm.schedules",
    runtime: "daemon",
    activation: "installation",
  },
  {
    id: PLATFORM_PERMISSION_EXTENSION_POINT,
    host: "helm.platform.authorization",
    runtime: "any",
    activation: "installation",
  },
];

function defineExtension(extension: StandardExtension): PlatformExtensionPoint {
  const definition = {
    extensionPointId: extension.id,
    apiVersion: "1.0.0",
    dataSchema: z.toJSONSchema(schemas[extension.id]),
    hostService: { serviceId: extension.host, range: "^1.0.0" },
    hostRuntime: extension.runtime,
    activation: extension.activation,
  };
  if (extension.implementation)
    return {
      ...definition,
      registration: "implementation",
      implementationContract: extension.implementation,
    };
  return { ...definition, registration: "data" };
}

export const STANDARD_PLATFORM_EXTENSION_POINTS: readonly PlatformExtensionPoint[] =
  extensions.map(defineExtension);
