import type { ProviderVendor, ProviderVendorAdvanced } from "@getpaseo/protocol/provider-config";

// L3 中转站编辑缓冲(纯逻辑)：草稿投影/校验/dirty、乐观落盘 + 写失败回滚到落盘值、
// 拉模型 latest-wins 竞态守卫。组件只持有 state + dispatch，逻辑全在此、不渲染即测。

export interface VendorDraft {
  label: string;
  baseUrl: string;
  apiKey: string;
  apiFormat: ProviderVendor["apiFormat"];
  authStyle?: ProviderVendor["authStyle"];
  advancedText: string;
}

// 把落盘 vendor 投影成可编辑草稿；advanced 折叠区以 JSON 文本编辑。
export function vendorToDraft(vendor: ProviderVendor): VendorDraft {
  return {
    label: vendor.label,
    baseUrl: vendor.baseUrl,
    apiKey: vendor.apiKey ?? "",
    apiFormat: vendor.apiFormat,
    authStyle: vendor.authStyle,
    advancedText: vendor.advanced ? JSON.stringify(vendor.advanced, null, 2) : "",
  };
}

export function updateDraft(draft: VendorDraft, patch: Partial<VendorDraft>): VendorDraft {
  return { ...draft, ...patch };
}

export interface DraftValidation {
  baseUrlError?: string;
  apiKeyError?: string;
  advancedError?: string;
  isValid: boolean;
}

// 校验三关：base_url 必须 http(s)、key 非空、高级 JSON 必须是合法对象。任一不过即不可保存。
export function validateDraft(draft: VendorDraft): DraftValidation {
  let baseUrlError: string | undefined;
  let apiKeyError: string | undefined;
  let advancedError: string | undefined;

  const baseUrl = draft.baseUrl.trim();
  if (baseUrl === "") {
    baseUrlError = "Base URL is required.";
  } else if (!/^https?:\/\//i.test(baseUrl)) {
    baseUrlError = "Base URL must start with http:// or https://.";
  }

  if (draft.apiKey.trim() === "") {
    apiKeyError = "API key is required.";
  }

  const advancedText = draft.advancedText.trim();
  if (advancedText !== "") {
    try {
      const parsed: unknown = JSON.parse(advancedText);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        advancedError = "Advanced settings must be a JSON object.";
      }
    } catch {
      advancedError = "Advanced settings must be valid JSON.";
    }
  }

  return {
    baseUrlError,
    apiKeyError,
    advancedError,
    isValid: !baseUrlError && !apiKeyError && !advancedError,
  };
}

// 与落盘值比对判 dirty(逐字段，避免对象引用误判)。
export function isDraftDirty(draft: VendorDraft, vendor: ProviderVendor): boolean {
  const baseline = vendorToDraft(vendor);
  return (
    draft.label !== baseline.label ||
    draft.baseUrl !== baseline.baseUrl ||
    draft.apiKey !== baseline.apiKey ||
    draft.apiFormat !== baseline.apiFormat ||
    draft.authStyle !== baseline.authStyle ||
    draft.advancedText !== baseline.advancedText
  );
}

// 把合法草稿应用回 vendor(解析 advanced JSON)。仅在 validateDraft().isValid 时调用。
export function applyDraftToVendor(draft: VendorDraft, vendor: ProviderVendor): ProviderVendor {
  const advancedText = draft.advancedText.trim();
  const advanced =
    advancedText === "" ? undefined : (JSON.parse(advancedText) as ProviderVendorAdvanced);
  return {
    ...vendor,
    label: draft.label,
    baseUrl: draft.baseUrl,
    apiKey: draft.apiKey === "" ? undefined : draft.apiKey,
    apiFormat: draft.apiFormat,
    authStyle: draft.authStyle,
    advanced,
  };
}

export interface VendorPersistState {
  committed: ProviderVendor; // 最后成功落盘的值，回滚锚点
  draft: VendorDraft;
  status: "idle" | "saving" | "error";
  error?: string;
}

export function initVendorPersist(committed: ProviderVendor): VendorPersistState {
  return { committed, draft: vendorToDraft(committed), status: "idle" };
}

// 乐观落盘：进入 saving 但保留草稿(界面不闪回)。
export function beginSave(state: VendorPersistState): VendorPersistState {
  return { ...state, status: "saving", error: undefined };
}

// 落盘成功：把 committed 推进到新值，草稿据此重投影(不脏)。
export function saveSucceeded(
  _state: VendorPersistState,
  committed: ProviderVendor,
): VendorPersistState {
  return { committed, draft: vendorToDraft(committed), status: "idle" };
}

// 落盘失败：草稿回滚到最后落盘值(committed)，标记 error——绝不留半截脏态。
export function saveFailed(state: VendorPersistState, error: string): VendorPersistState {
  return { ...state, draft: vendorToDraft(state.committed), status: "error", error };
}

// 拉模型 latest-wins 守卫：每次发起 issue 递增 token，只有最新 token 的响应才允许 apply，
// 旧请求(被 abort/慢上游)的迟到结果 isLatest=false → 丢弃，不覆盖新结果。
export function createRequestSequence(): {
  issue: () => number;
  isLatest: (token: number) => boolean;
} {
  let counter = 0;
  return {
    issue: () => {
      counter += 1;
      return counter;
    },
    isLatest: (token: number) => token === counter,
  };
}
