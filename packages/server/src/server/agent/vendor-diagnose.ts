import type { VendorDiagnosis, VendorProbeTarget } from "@getpaseo/protocol/messages";
import { vendorAuthHeaders } from "./vendor-auth.js";

// 中转站测速/测 key：对 base_url 或每个指定端点发一次带鉴权头的探测，把 HTTP 结果归一成
// health 五态 + 延迟 + httpStatus。纯配置期诊断能力，**不在 send 路径**——只读探测、不落盘、
// 不接 agent 启动。注入 fetch/now 以便确定性单测。

const DEFAULT_TIMEOUT_MS = 8000;

export interface VendorDiagnoseDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

function classifyStatus(status: number): VendorDiagnosis["health"] {
  if (status >= 200 && status < 300) {
    return "healthy";
  }
  if (status === 401 || status === 403) {
    return "unauthorized";
  }
  return "error";
}

// 单端点探测：成功按状态码归类；abort/timeout 归 timeout，其余抛错(DNS/连接)归 unreachable。
async function probeEndpoint(
  url: string,
  target: VendorProbeTarget,
  deps: VendorDiagnoseDeps,
): Promise<VendorDiagnosis> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: vendorAuthHeaders(target),
      signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    return {
      url,
      health: classifyStatus(response.status),
      latencyMs: now() - startedAt,
      httpStatus: response.status,
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const timedOut = name === "TimeoutError" || name === "AbortError";
    return {
      url,
      health: timedOut ? "timeout" : "unreachable",
      latencyMs: now() - startedAt,
      message: error instanceof Error ? error.message : undefined,
    };
  }
}

// 探测目标的全部端点(无端点则回落 base_url 本身)，并行发出、按输入顺序返回逐端点诊断。
export function diagnoseVendor(
  target: VendorProbeTarget,
  deps: VendorDiagnoseDeps = {},
): Promise<VendorDiagnosis[]> {
  const urls =
    target.endpoints && target.endpoints.length > 0 ? target.endpoints : [target.baseUrl];
  return Promise.all(urls.map((url) => probeEndpoint(url, target, deps)));
}
