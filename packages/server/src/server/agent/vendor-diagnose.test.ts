import { describe, expect, test, vi } from "vitest";
import { diagnoseVendor } from "./vendor-diagnose.js";

// 中转站测速/测 key 的探测纪律：把每个端点的 HTTP 结果归一成 health 五态
// (healthy/unauthorized/timeout/unreachable/error) + 延迟 + httpStatus，纯配置期能力、不在
// send 路径。注入 fetch 保证确定性(真实 Response 对象，不打真网络)。§6 RPC 往返(诊断三态)。

function fakeFetch(byUrl: Record<string, () => Promise<Response>>): typeof fetch {
  return ((input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const handler = byUrl[url];
    if (!handler) {
      throw new Error(`unexpected url ${url}`);
    }
    return handler();
  }) as typeof fetch;
}

const monotonicNow = () => {
  let t = 1000;
  return () => {
    t += 25;
    return t;
  };
};

describe("diagnoseVendor", () => {
  test("2xx → healthy，带延迟与 httpStatus", async () => {
    const results = await diagnoseVendor(
      {
        baseUrl: "https://api.x",
        apiKey: "k",
        apiFormat: "anthropic",
        endpoints: ["https://api.x/v1"],
      },
      {
        fetchImpl: fakeFetch({
          "https://api.x/v1": () => Promise.resolve(new Response(null, { status: 200 })),
        }),
        now: monotonicNow(),
      },
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.health).toBe("healthy");
    expect(results[0]?.httpStatus).toBe(200);
    expect(results[0]?.latencyMs).toBe(25);
  });

  test("401 → unauthorized", async () => {
    const results = await diagnoseVendor(
      {
        baseUrl: "https://api.x",
        apiKey: "bad",
        apiFormat: "openai",
        endpoints: ["https://api.x/v1"],
      },
      {
        fetchImpl: fakeFetch({
          "https://api.x/v1": () => Promise.resolve(new Response(null, { status: 401 })),
        }),
      },
    );
    expect(results[0]?.health).toBe("unauthorized");
    expect(results[0]?.httpStatus).toBe(401);
  });

  test("AbortError/TimeoutError → timeout", async () => {
    const results = await diagnoseVendor(
      { baseUrl: "https://slow", apiFormat: "anthropic", endpoints: ["https://slow/v1"] },
      {
        fetchImpl: fakeFetch({
          "https://slow/v1": () =>
            Promise.reject(Object.assign(new Error("timed out"), { name: "TimeoutError" })),
        }),
      },
    );
    expect(results[0]?.health).toBe("timeout");
  });

  test("网络错误(TypeError) → unreachable", async () => {
    const results = await diagnoseVendor(
      { baseUrl: "https://dead", apiFormat: "anthropic", endpoints: ["https://dead/v1"] },
      {
        fetchImpl: fakeFetch({
          "https://dead/v1": () => Promise.reject(new TypeError("fetch failed")),
        }),
      },
    );
    expect(results[0]?.health).toBe("unreachable");
  });

  test("无 endpoints 时探测 baseUrl；多端点按序返回", async () => {
    const results = await diagnoseVendor(
      {
        baseUrl: "https://api.x",
        apiFormat: "anthropic",
        endpoints: ["https://api.x/a", "https://api.x/b"],
      },
      {
        fetchImpl: fakeFetch({
          "https://api.x/a": () => Promise.resolve(new Response(null, { status: 200 })),
          "https://api.x/b": () => Promise.resolve(new Response(null, { status: 500 })),
        }),
      },
    );
    expect(results.map((r) => `${r.url}:${r.health}`)).toEqual([
      "https://api.x/a:healthy",
      "https://api.x/b:error",
    ]);
  });

  test("anthropic-api-key 风格把 key 放进 x-api-key 头(测 key 真发出去)", async () => {
    const seen: Record<string, string> = {};
    const capturing = ((input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.forEach((v, k) => {
        seen[k] = v;
      });
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;
    await diagnoseVendor(
      {
        baseUrl: "https://api.x",
        apiKey: "sk-secret",
        apiFormat: "anthropic",
        authStyle: "anthropic-api-key",
        endpoints: ["https://api.x/v1"],
      },
      { fetchImpl: capturing },
    );
    expect(seen["x-api-key"]).toBe("sk-secret");
  });

  test("无 endpoints 时回落探测 baseUrl 本身", async () => {
    const spy = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
    const results = await diagnoseVendor(
      { baseUrl: "https://only-base", apiFormat: "anthropic" },
      { fetchImpl: spy as unknown as typeof fetch },
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://only-base");
  });
});
