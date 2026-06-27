import { describe, expect, it } from "vitest";
import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";
import type { ProviderVendor } from "@getpaseo/protocol/provider-config";
import {
  addVendor,
  cascadeReducer,
  initialCascadeState,
  removeProvider,
  removeVendor,
  selectL1Rows,
  selectL2View,
  selectL3View,
  setCurrentVendor,
  setProviderEnabled,
  setVendorDefaultModel,
  toggleVendorExposedModel,
} from "./vendor-cascade-model.js";

// 三级级联是「模型与 UI 分离」的核心回报：导航是纯状态机、标记转移是纯 config→config、
// L1/L2/L3 视图是纯 selector——全部不渲染即测。§6 必测 2(状态机)+3(标记不变量)+selector 落空不崩。

const vendor = (over: Partial<ProviderVendor> & { id: string }): ProviderVendor => ({
  label: over.id,
  baseUrl: "https://api.example.com",
  apiFormat: "anthropic",
  ...over,
});

const baseConfig = (): MutableDaemonConfig =>
  ({
    mcp: { injectIntoAgents: false },
    providers: {
      claude: {
        enabled: true,
        currentVendorId: "v1",
        vendors: [
          vendor({
            id: "v1",
            label: "Relay-A",
            exposedModelIds: ["m1", "m2"],
            defaultModelId: "m1",
          }),
          vendor({ id: "v2", label: "Relay-B", order: 1 }),
        ],
      },
    },
    metadataGeneration: { providers: [] },
    autoArchiveAfterMerge: false,
    enableTerminalAgentHooks: false,
    appendSystemPrompt: "",
  }) as unknown as MutableDaemonConfig;

describe("级联导航状态机 cascadeReducer", () => {
  it("初始落 L1；drill 到 provider→L2、到 vendor→L3", () => {
    expect(initialCascadeState).toEqual({ level: "L1" });
    const l2 = cascadeReducer(initialCascadeState, {
      type: "drillToProvider",
      providerId: "claude",
    });
    expect(l2).toEqual({ level: "L2", providerId: "claude" });
    const l3 = cascadeReducer(l2, { type: "drillToVendor", vendorId: "v1" });
    expect(l3).toEqual({ level: "L3", providerId: "claude", vendorId: "v1" });
  });

  it("面包屑逐级返回 L3→L2→L1；Esc 等价 back", () => {
    const l3 = { level: "L3", providerId: "claude", vendorId: "v1" } as const;
    const l2 = cascadeReducer(l3, { type: "back" });
    expect(l2).toEqual({ level: "L2", providerId: "claude" });
    expect(cascadeReducer(l3, { type: "escape" })).toEqual(l2);
    const l1 = cascadeReducer(l2, { type: "back" });
    expect(l1).toEqual({ level: "L1" });
    expect(cascadeReducer(l1, { type: "back" })).toEqual({ level: "L1" });
  });

  it("切 host / 切 section → reset 回 L1", () => {
    const l3 = { level: "L3", providerId: "claude", vendorId: "v1" } as const;
    expect(cascadeReducer(l3, { type: "reset" })).toEqual({ level: "L1" });
  });

  it("深链直达 L3(providerId+vendorId)；只给 providerId 直达 L2", () => {
    expect(
      cascadeReducer(initialCascadeState, {
        type: "deepLink",
        providerId: "claude",
        vendorId: "v2",
      }),
    ).toEqual({
      level: "L3",
      providerId: "claude",
      vendorId: "v2",
    });
    expect(cascadeReducer(initialCascadeState, { type: "deepLink", providerId: "claude" })).toEqual(
      {
        level: "L2",
        providerId: "claude",
      },
    );
  });

  it("从 L1 非法 drillToVendor 被忽略(无 providerId 上下文不崩)", () => {
    expect(cascadeReducer(initialCascadeState, { type: "drillToVendor", vendorId: "v1" })).toEqual({
      level: "L1",
    });
  });
});

describe("标记转移不变量(纯 config→config)", () => {
  it("setCurrentVendor 替换而非追加，provider 下唯一 current", () => {
    const next = setCurrentVendor(baseConfig().providers.claude, "v2");
    expect(next.currentVendorId).toBe("v2");
  });

  it("setVendorDefaultModel 设该 vendor 唯一 default", () => {
    const next = setVendorDefaultModel(baseConfig().providers.claude, "v1", "m2");
    expect(next.vendors?.find((v) => v.id === "v1")?.defaultModelId).toBe("m2");
  });

  it("toggleVendorExposedModel：取消放出的正是 default 时，default 被清空", () => {
    const next = toggleVendorExposedModel(baseConfig().providers.claude, "v1", "m1");
    const v1 = next.vendors?.find((v) => v.id === "v1");
    expect(v1?.exposedModelIds).toEqual(["m2"]);
    expect(v1?.defaultModelId).toBeUndefined();
  });

  it("toggleVendorExposedModel：再次切换可重新放出(幂等可逆)", () => {
    const once = toggleVendorExposedModel(baseConfig().providers.claude, "v1", "m3");
    expect(once.vendors?.find((v) => v.id === "v1")?.exposedModelIds).toEqual(["m1", "m2", "m3"]);
  });

  it("removeVendor 连带清掉指向它的 currentVendorId", () => {
    const next = removeVendor(baseConfig().providers.claude, "v1");
    expect(next.vendors?.map((v) => v.id)).toEqual(["v2"]);
    expect(next.currentVendorId).toBeUndefined();
  });

  it("addVendor 追加到列表尾", () => {
    const next = addVendor(baseConfig().providers.claude, vendor({ id: "v3", label: "Relay-C" }));
    expect(next.vendors?.map((v) => v.id)).toEqual(["v1", "v2", "v3"]);
  });

  it("setProviderEnabled 切换 enabled 不动其它字段", () => {
    const next = setProviderEnabled(baseConfig().providers.claude, false);
    expect(next.enabled).toBe(false);
    expect(next.vendors?.length).toBe(2);
  });

  it("removeProvider 连带删除其 vendors + 标记(整个 key 移除)", () => {
    const next = removeProvider(baseConfig().providers, "claude");
    expect(next.claude).toBeUndefined();
  });
});

describe("派生 selector(落空态不崩)", () => {
  const snapshot = [
    {
      provider: "claude" as const,
      status: "ready" as const,
      enabled: true,
      label: "Claude Code",
      models: [{ provider: "claude" as const, id: "m1", label: "M1" }],
    },
    { provider: "codex" as const, status: "unavailable" as const, enabled: true, label: "Codex" },
  ];

  it("L1 行：合并 snapshot + config(已装/启停/模型数/当前 vendor)", () => {
    const rows = selectL1Rows(baseConfig(), snapshot);
    const claude = rows.find((r) => r.providerId === "claude");
    expect(claude?.installed).toBe(true);
    expect(claude?.vendorCount).toBe(2);
    expect(claude?.currentVendorLabel).toBe("Relay-A");
    const codex = rows.find((r) => r.providerId === "codex");
    expect(codex?.installed).toBe(false);
    expect(codex?.vendorCount).toBe(0);
  });

  it("L2：provider 不存在 → null(不崩)", () => {
    expect(selectL2View(baseConfig(), snapshot, "ghost")).toBeNull();
    const view = selectL2View(baseConfig(), snapshot, "claude");
    expect(view?.vendors.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(view?.vendors.find((v) => v.id === "v1")?.isCurrent).toBe(true);
  });

  it("L3：vendor 不存在 → null(不崩)；存在则带 isCurrent", () => {
    expect(selectL3View(baseConfig(), "claude", "ghost")).toBeNull();
    const view = selectL3View(baseConfig(), "claude", "v1");
    expect(view?.vendor.label).toBe("Relay-A");
    expect(view?.isCurrent).toBe(true);
  });
});
