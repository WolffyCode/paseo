import type { MutableDaemonConfig, MutableDaemonProviderConfig } from "@getpaseo/protocol/messages";
import type { ProviderVendor } from "@getpaseo/protocol/provider-config";

// 中转站三级级联的「模型层」：导航状态机 + 标记转移纯函数 + L1/L2/L3 派生 selector。
// 全部不渲染即可测——UI 只按 drill path 渲染当前级、按 selector 渲染列表、dispatch action。
// 本期写「当前/默认/放出」标记 = 持久化 + 设置内回显，NOT 接 composer 消费(deferred seam)。

// ----------------------------------------------------------------------------
// 级联导航状态机
// ----------------------------------------------------------------------------

export type CascadeState =
  | { level: "L1" }
  | { level: "L2"; providerId: string }
  | { level: "L3"; providerId: string; vendorId: string };

export type CascadeAction =
  | { type: "drillToProvider"; providerId: string }
  | { type: "drillToVendor"; vendorId: string }
  | { type: "deepLink"; providerId: string; vendorId?: string }
  | { type: "back" }
  | { type: "escape" }
  | { type: "reset" };

export const initialCascadeState: CascadeState = { level: "L1" };

// 纯导航迁移：drill 进栈、back/escape 逐级出栈、reset(切 host/section)回 L1、deepLink 直达。
// drillToVendor 只在 L2 有效(无 provider 上下文时忽略，不崩)。不持有任何 config 数据。
export function cascadeReducer(state: CascadeState, action: CascadeAction): CascadeState {
  switch (action.type) {
    case "drillToProvider":
      return { level: "L2", providerId: action.providerId };
    case "drillToVendor":
      if (state.level !== "L2") {
        return state;
      }
      return { level: "L3", providerId: state.providerId, vendorId: action.vendorId };
    case "deepLink":
      return action.vendorId
        ? { level: "L3", providerId: action.providerId, vendorId: action.vendorId }
        : { level: "L2", providerId: action.providerId };
    case "back":
    case "escape":
      if (state.level === "L3") {
        return { level: "L2", providerId: state.providerId };
      }
      return { level: "L1" };
    case "reset":
      return { level: "L1" };
  }
}

// ----------------------------------------------------------------------------
// 标记转移(纯 config→config，输入旧 → 输出新，断言不变量)
// ----------------------------------------------------------------------------

// 在 provider 的 vendors 里就地替换一个 vendor，返回新 provider config(不可变)。
function mapVendor(
  provider: MutableDaemonProviderConfig,
  vendorId: string,
  update: (vendor: ProviderVendor) => ProviderVendor,
): MutableDaemonProviderConfig {
  return {
    ...provider,
    vendors: (provider.vendors ?? []).map((vendor) =>
      vendor.id === vendorId ? update(vendor) : vendor,
    ),
  };
}

// 启停某提供方(顶部一处开关)。
export function setProviderEnabled(
  provider: MutableDaemonProviderConfig,
  enabled: boolean,
): MutableDaemonProviderConfig {
  return { ...provider, enabled };
}

// 设「当前 vendor」——单标量字段，天然唯一(替换而非追加)。
export function setCurrentVendor(
  provider: MutableDaemonProviderConfig,
  vendorId: string,
): MutableDaemonProviderConfig {
  return { ...provider, currentVendorId: vendorId };
}

export function addVendor(
  provider: MutableDaemonProviderConfig,
  vendorToAdd: ProviderVendor,
): MutableDaemonProviderConfig {
  return { ...provider, vendors: [...(provider.vendors ?? []), vendorToAdd] };
}

// 删除中转站，并清掉指向它的 currentVendorId(标记连带清理)。
export function removeVendor(
  provider: MutableDaemonProviderConfig,
  vendorId: string,
): MutableDaemonProviderConfig {
  return {
    ...provider,
    vendors: (provider.vendors ?? []).filter((vendor) => vendor.id !== vendorId),
    currentVendorId: provider.currentVendorId === vendorId ? undefined : provider.currentVendorId,
  };
}

export function updateVendor(
  provider: MutableDaemonProviderConfig,
  vendorId: string,
  patch: Partial<ProviderVendor>,
): MutableDaemonProviderConfig {
  return mapVendor(provider, vendorId, (vendor) => ({ ...vendor, ...patch }));
}

// 设某 vendor 的默认模型——单标量，唯一。
export function setVendorDefaultModel(
  provider: MutableDaemonProviderConfig,
  vendorId: string,
  modelId: string,
): MutableDaemonProviderConfig {
  return mapVendor(provider, vendorId, (vendor) => ({ ...vendor, defaultModelId: modelId }));
}

// 放出/收回某模型；收回的若正是默认模型，连带清空 defaultModelId(不变量：default ⊆ exposed)。
export function toggleVendorExposedModel(
  provider: MutableDaemonProviderConfig,
  vendorId: string,
  modelId: string,
): MutableDaemonProviderConfig {
  return mapVendor(provider, vendorId, (vendor) => {
    const exposed = vendor.exposedModelIds ?? [];
    const isExposed = exposed.includes(modelId);
    const nextExposed = isExposed ? exposed.filter((id) => id !== modelId) : [...exposed, modelId];
    const clearsDefault = isExposed && vendor.defaultModelId === modelId;
    return {
      ...vendor,
      exposedModelIds: nextExposed,
      defaultModelId: clearsDefault ? undefined : vendor.defaultModelId,
    };
  });
}

// 删除某提供方：整 key 移除，连带其 vendors + 标记一起消失。
export function removeProvider(
  providers: MutableDaemonConfig["providers"],
  providerId: string,
): MutableDaemonConfig["providers"] {
  const { [providerId]: _removed, ...rest } = providers;
  return rest;
}

// ----------------------------------------------------------------------------
// 派生 selector(L1/L2/L3 视图模型，落空态返回 null/空，不崩)
// ----------------------------------------------------------------------------

// providers 快照的结构子集——selector 只读这几个字段，真实 ProviderSnapshotEntry 结构兼容。
export interface ProviderSnapshotLike {
  provider: string;
  status: string;
  enabled?: boolean;
  label?: string;
  models?: { id: string }[];
}

export interface L1ProviderRow {
  providerId: string;
  label: string;
  installed: boolean;
  enabled: boolean;
  modelCount: number;
  vendorCount: number;
  currentVendorId?: string;
  currentVendorLabel?: string;
}

export interface VendorSummary {
  id: string;
  label: string;
  baseUrl: string;
  modelCount: number;
  isCurrent: boolean;
  enabled: boolean;
}

export interface L2ProviderView {
  providerId: string;
  label: string;
  vendors: VendorSummary[];
}

export interface L3VendorView {
  providerId: string;
  vendorId: string;
  vendor: ProviderVendor;
  isCurrent: boolean;
}

function providerConfig(
  config: MutableDaemonConfig,
  providerId: string,
): MutableDaemonProviderConfig | undefined {
  return config.providers?.[providerId];
}

// L1 = 以 providers 快照为准的提供方列表，叠加 config 覆盖(启停/中转站/当前标记)。
export function selectL1Rows(
  config: MutableDaemonConfig,
  snapshot: ProviderSnapshotLike[],
): L1ProviderRow[] {
  return snapshot.map((entry) => {
    const override = providerConfig(config, entry.provider);
    const vendors = override?.vendors ?? [];
    const currentVendorId = override?.currentVendorId;
    return {
      providerId: entry.provider,
      label: entry.label ?? entry.provider,
      installed: entry.status !== "unavailable",
      enabled: override?.enabled ?? entry.enabled ?? true,
      modelCount: entry.models?.length ?? 0,
      vendorCount: vendors.length,
      currentVendorId,
      currentVendorLabel: vendors.find((vendor) => vendor.id === currentVendorId)?.label,
    };
  });
}

function toVendorSummary(
  vendor: ProviderVendor,
  currentVendorId: string | undefined,
): VendorSummary {
  return {
    id: vendor.id,
    label: vendor.label,
    baseUrl: vendor.baseUrl,
    modelCount: vendor.exposedModelIds?.length ?? vendor.models?.length ?? 0,
    isCurrent: vendor.id === currentVendorId,
    enabled: vendor.enabled ?? true,
  };
}

// L2 = 某提供方的基础信息 + 中转站列表(按 order 排序)。provider 不存在 → null。
export function selectL2View(
  config: MutableDaemonConfig,
  snapshot: ProviderSnapshotLike[],
  providerId: string,
): L2ProviderView | null {
  const entry = snapshot.find((snap) => snap.provider === providerId);
  const override = providerConfig(config, providerId);
  if (!entry && !override) {
    return null;
  }
  const currentVendorId = override?.currentVendorId;
  const vendors = [...(override?.vendors ?? [])]
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .map((vendor) => toVendorSummary(vendor, currentVendorId));
  return { providerId, label: entry?.label ?? providerId, vendors };
}

// L3 = 单个中转站详情。vendor 不存在 → null。
export function selectL3View(
  config: MutableDaemonConfig,
  providerId: string,
  vendorId: string,
): L3VendorView | null {
  const override = providerConfig(config, providerId);
  const vendor = override?.vendors?.find((candidate) => candidate.id === vendorId);
  if (!vendor) {
    return null;
  }
  return { providerId, vendorId, vendor, isCurrent: override?.currentVendorId === vendorId };
}
