import type {
  VendorConnection,
  VendorDiscoveredModel,
  VendorDiscoverModelsError,
} from "@getpaseo/protocol/messages";
import { vendorAuthHeaders } from "./vendor-auth.js";

// 中转站「拉取列表」：从 base_url 拉模型清单。codepilot 纪律——空集合不伪造、脏数据脱敏、
// AbortController/timeout 防慢上游、网络/鉴权/响应不合法分别归错。**纯配置期能力、非 send 路径**。
// 注入 fetch/now/signal 以便确定性单测 + 外部取消(旧请求 abort)。

const DEFAULT_TIMEOUT_MS = 12000;

export type DiscoverVendorModelsResult =
  | { ok: true; models: VendorDiscoveredModel[]; fetchedAt: string }
  | { ok: false; error: VendorDiscoverModelsError };

export interface DiscoverVendorModelsDeps {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  signal?: AbortSignal;
}

// 由 base_url 推出 models 端点：已以 /vN 结尾则补 /models，否则补 /v1/models。
function modelsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return /\/v\d+$/.test(base) ? `${base}/models` : `${base}/v1/models`;
}

// 把上游 data[] 脱敏成放心列表：丢空白/非串 id、按 id 去重、label 取 display_name/name。
function sanitizeModels(data: unknown[]): VendorDiscoveredModel[] {
  const seen = new Set<string>();
  const models: VendorDiscoveredModel[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const id = record.id;
    if (typeof id !== "string" || id.trim().length === 0 || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const labelRaw = record.display_name ?? record.name;
    const label = typeof labelRaw === "string" && labelRaw.length > 0 ? labelRaw : undefined;
    models.push(label ? { id, label } : { id });
  }
  return models;
}

export async function discoverVendorModels(
  connection: VendorConnection,
  deps: DiscoverVendorModelsDeps = {},
): Promise<DiscoverVendorModelsResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const fetchedAt = (deps.now?.() ?? new Date()).toISOString();
  try {
    const response = await fetchImpl(modelsUrl(connection.baseUrl), {
      method: "GET",
      headers: vendorAuthHeaders(connection),
      signal: deps.signal ?? AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: { code: "unauthorized" } };
    }
    if (!response.ok) {
      return { ok: false, error: { code: "invalid_response", message: `HTTP ${response.status}` } };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, error: { code: "invalid_response", message: "Response was not JSON." } };
    }
    const data = (body as { data?: unknown }).data;
    if (!Array.isArray(data)) {
      return { ok: false, error: { code: "invalid_response", message: "Missing data array." } };
    }
    return { ok: true, models: sanitizeModels(data), fetchedAt };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      return { ok: false, error: { code: "timeout" } };
    }
    return {
      ok: false,
      error: { code: "unreachable", message: error instanceof Error ? error.message : undefined },
    };
  }
}
