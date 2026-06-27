import { describe, expect, test } from "vitest";
import {
  ProviderOverrideSchema,
  ProviderOverridesSchema,
  ProviderVendorSchema,
} from "./provider-config.js";

// 中转站(vendor) schema 的后向兼容契约：vendors 是 ProviderOverride 上的可选附加字段，
// 旧 config(无 vendors) 必须照常解析、provider 不丢；新 config 带 vendors 必须 round-trip
// 不丢字段、不被收窄。这是协议三铁律(不翻 required/不删字段/不收窄)的回归防线。
describe("ProviderVendorSchema · 后向兼容", () => {
  test("旧 ProviderOverride(无 vendors) 解析成功且 provider 信息不丢", () => {
    const legacy = { label: "Claude", enabled: true, order: 1 };
    const parsed = ProviderOverrideSchema.parse(legacy);
    expect(parsed.label).toBe("Claude");
    expect(parsed.enabled).toBe(true);
    expect(parsed.vendors).toBeUndefined();
    expect(parsed.currentVendorId).toBeUndefined();
  });

  test("带 vendors + currentVendorId 的 override round-trip(parse→serialize→parse) 字段不丢", () => {
    const override = {
      label: "Claude",
      enabled: true,
      currentVendorId: "v1",
      vendors: [
        {
          id: "v1",
          label: "OfficialRelay",
          baseUrl: "https://api.example.com",
          apiKey: "sk-secret",
          apiFormat: "anthropic" as const,
          authStyle: "anthropic-auth-token" as const,
          models: [
            { id: "m1", label: "Big", source: "fetched" as const },
            { id: "m2", source: "manual" as const },
          ],
          exposedModelIds: ["m1"],
          defaultModelId: "m1",
          modelsFetchedAt: "2026-06-27T00:00:00.000Z",
          source: "manual" as const,
          order: 0,
          enabled: true,
          advanced: {
            timeoutSec: 30,
            maxRetries: 2,
            headers: { "x-api": "1" },
            dailyLimitUsd: 5,
            monthlyLimitUsd: 100,
            multiplier: 1.5,
            extra: { nested: { deep: true } },
          },
        },
      ],
    };
    const once = ProviderOverrideSchema.parse(override);
    const twice = ProviderOverrideSchema.parse(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
    expect(twice.vendors?.[0]?.advanced?.extra).toEqual({ nested: { deep: true } });
    expect(twice.vendors?.[0]?.exposedModelIds).toEqual(["m1"]);
    expect(twice.currentVendorId).toBe("v1");
  });

  test("apiFormat 只接受 anthropic|openai，越界值被拒(枚举边界)", () => {
    const base = { id: "v1", label: "R", baseUrl: "" };
    expect(ProviderVendorSchema.safeParse({ ...base, apiFormat: "anthropic" }).success).toBe(true);
    expect(ProviderVendorSchema.safeParse({ ...base, apiFormat: "openai" }).success).toBe(true);
    expect(ProviderVendorSchema.safeParse({ ...base, apiFormat: "grpc" }).success).toBe(false);
  });

  test("baseUrl 允许空串(草稿态)，但 id 必须非空", () => {
    expect(
      ProviderVendorSchema.safeParse({ id: "v1", label: "R", baseUrl: "", apiFormat: "anthropic" })
        .success,
    ).toBe(true);
    expect(
      ProviderVendorSchema.safeParse({ id: "", label: "R", baseUrl: "x", apiFormat: "anthropic" })
        .success,
    ).toBe(false);
  });

  test("vendor 未知子字段被 strip，已知字段保留(向前兼容 = 旧 client 解析新 daemon 不崩)", () => {
    const withUnknown = {
      id: "v1",
      label: "R",
      baseUrl: "https://x",
      apiFormat: "openai" as const,
      futureField: "ignored-by-old-client",
    };
    const parsed = ProviderVendorSchema.parse(withUnknown);
    expect(parsed.id).toBe("v1");
    expect((parsed as Record<string, unknown>).futureField).toBeUndefined();
  });

  test("内置 provider 携带 vendors 时 ProviderOverridesSchema(record + superRefine) 仍校验通过", () => {
    const parsed = ProviderOverridesSchema.parse({
      claude: {
        enabled: true,
        currentVendorId: "v1",
        vendors: [{ id: "v1", label: "R", baseUrl: "https://x", apiFormat: "anthropic" }],
      },
    });
    expect(parsed.claude?.vendors?.[0]?.id).toBe("v1");
  });
});
