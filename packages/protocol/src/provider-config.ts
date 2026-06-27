import { z } from "zod";
import type { AgentProvider } from "./agent-types.js";
import { AgentProviderSchema } from "./provider-manifest.js";

const ProviderCommandDefaultSchema = z.object({
  mode: z.literal("default"),
});

const ProviderCommandAppendSchema = z.object({
  mode: z.literal("append"),
  args: z.array(z.string()).optional(),
});

const ProviderCommandReplaceSchema = z.object({
  mode: z.literal("replace"),
  argv: z.array(z.string().min(1)).min(1),
});

export const ProviderCommandSchema = z.discriminatedUnion("mode", [
  ProviderCommandDefaultSchema,
  ProviderCommandAppendSchema,
  ProviderCommandReplaceSchema,
]);

export const ProviderRuntimeSettingsSchema = z.object({
  command: ProviderCommandSchema.optional(),
  env: z.record(z.string(), z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
});

const ProviderProfileThinkingOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export const ProviderProfileModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  thinkingOptions: z.array(ProviderProfileThinkingOptionSchema).optional(),
});

// 中转站(vendor) 放出的单个模型的发现缓存项：`source` 记录它来自在线拉取 / 手填 /
// cc-switch 导入，供 UI 区分「拉取列表」与「手动添加」，不参与运行时消费。
export const ProviderVendorModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  source: z.enum(["fetched", "manual", "cc-switch"]).optional(),
});

// 中转站的「高级折叠」配置：超时 / 重试 / 自定义 headers / 限额 / 倍率 / 透传 extra。
// 全部可选，`extra` 用 record<unknown> 原样保真用户写入(逃生舱兜底)，不收窄。
export const ProviderVendorAdvancedSchema = z.object({
  timeoutSec: z.number().optional(),
  maxRetries: z.number().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  dailyLimitUsd: z.number().optional(),
  monthlyLimitUsd: z.number().optional(),
  multiplier: z.number().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

// 中转站(Vendor) = 挂在某提供方下的 API 供应商(base_url + key)。本期把它提成
// `agents.providers.<id>.vendors[]` 一等实体：随 config.json 落盘读回、按主机隔离。
// `apiFormat` 按协议(anthropic/openai)分发而非品牌名(借 codepilot 教训)。`baseUrl`
// 允许 "" 草稿态；`exposedModelIds`/`defaultModelId` 本期持久化但不被对话流消费(deferred)。
export const ProviderVendorSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  baseUrl: z.string(),
  apiKey: z.string().optional(),
  apiFormat: z.enum(["anthropic", "openai"]),
  authStyle: z.enum(["anthropic-auth-token", "anthropic-api-key", "openai-api-key"]).optional(),
  models: z.array(ProviderVendorModelSchema).optional(),
  exposedModelIds: z.array(z.string()).optional(),
  defaultModelId: z.string().optional(),
  modelsFetchedAt: z.string().optional(),
  source: z.enum(["official", "manual", "cc-switch"]).optional(),
  order: z.number().optional(),
  enabled: z.boolean().optional(),
  advanced: ProviderVendorAdvancedSchema.optional(),
});

export const ProviderOverrideSchema = z.object({
  extends: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  command: z.array(z.string().min(1)).min(1).optional(),
  env: z.record(z.string(), z.string()).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  models: z.array(ProviderProfileModelSchema).optional(),
  additionalModels: z.array(ProviderProfileModelSchema).optional(),
  disallowedTools: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  order: z.number().optional(),
  // 中转站子树 + 「当前 vendor」标记：均 .optional() 后向兼容(旧 config 无此键照常解析)。
  // currentVendorId 本期写入并在设置内回显，NOT 被 composer 消费(deferred seam)。
  vendors: z.array(ProviderVendorSchema).optional(),
  currentVendorId: z.string().optional(),
});

const BUILTIN_PROVIDER_IDS = ["claude", "codex", "copilot", "opencode", "pi", "omp"] as const;
const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export const ProviderOverridesSchema = z
  .record(z.string(), ProviderOverrideSchema)
  .superRefine((providers, ctx) => {
    const builtinProviderIdSet = new Set<string>(BUILTIN_PROVIDER_IDS);
    const validExtendsValues = new Set<string>([...BUILTIN_PROVIDER_IDS, "acp"]);

    for (const [providerId, provider] of Object.entries(providers)) {
      if (!PROVIDER_ID_PATTERN.test(providerId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [providerId],
          message: `Provider ID "${providerId}" must match ${PROVIDER_ID_PATTERN}.`,
        });
      }

      const isBuiltinProvider = builtinProviderIdSet.has(providerId);
      if (!isBuiltinProvider && !provider.extends) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [providerId, "extends"],
          message: `Custom provider "${providerId}" must declare extends.`,
        });
      }

      if (!isBuiltinProvider && !provider.label) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [providerId, "label"],
          message: `Custom provider "${providerId}" must declare label.`,
        });
      }

      if (provider.extends && !validExtendsValues.has(provider.extends)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [providerId, "extends"],
          message: `Provider "${providerId}" extends unknown provider "${provider.extends}".`,
        });
      }

      if (provider.extends === "acp" && !provider.command) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [providerId, "command"],
          message: `Provider "${providerId}" extending "acp" must declare command.`,
        });
      }
    }
  });

export const AgentProviderRuntimeSettingsMapSchema = z
  .record(z.string(), ProviderRuntimeSettingsSchema)
  .superRefine((providers, ctx) => {
    for (const providerId of Object.keys(providers)) {
      const parsedProviderId = AgentProviderSchema.safeParse(providerId);
      if (!parsedProviderId.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [providerId],
          message: `Invalid agent provider "${providerId}".`,
        });
      }
    }
  });

export type ProviderCommand = z.infer<typeof ProviderCommandSchema>;
export type ProviderRuntimeSettings = z.infer<typeof ProviderRuntimeSettingsSchema>;
export type ProviderProfileModel = z.infer<typeof ProviderProfileModelSchema>;
export type ProviderVendorModel = z.infer<typeof ProviderVendorModelSchema>;
export type ProviderVendorAdvanced = z.infer<typeof ProviderVendorAdvancedSchema>;
export type ProviderVendor = z.infer<typeof ProviderVendorSchema>;
export type ProviderOverride = z.infer<typeof ProviderOverrideSchema>;
export type ProviderOverrides = z.infer<typeof ProviderOverridesSchema>;
export type AgentProviderRuntimeSettingsMap = Partial<
  Record<AgentProvider, ProviderRuntimeSettings>
>;
