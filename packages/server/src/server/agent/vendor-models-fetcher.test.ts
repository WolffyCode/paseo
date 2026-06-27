import { describe, expect, test } from "vitest";
import { discoverVendorModels } from "./vendor-models-fetcher.js";

// 中转站「拉取列表」纪律(借 codepilot 教训)：空集合不伪造(空 data → ok+models:[])、脏数据脱敏
// (丢空/非串 id、去重)、网络/鉴权/响应不合法分别归错、abort/timeout 归 timeout。纯配置期能力、
// **非 send 路径**。注入 fetch + now 确定性。§6 RPC 往返(discover 空集合不伪造)。

function jsonFetch(body: unknown, status = 200): typeof fetch {
  return (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as typeof fetch;
}
const fixedNow = () => new Date("2026-06-27T12:00:00.000Z");

describe("discoverVendorModels", () => {
  test("data[].id 列表 → ok，带 fetchedAt", async () => {
    const result = await discoverVendorModels(
      { baseUrl: "https://api.x/v1", apiFormat: "openai" },
      { fetchImpl: jsonFetch({ data: [{ id: "m1" }, { id: "m2" }] }), now: fixedNow },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.models.map((m) => m.id)).toEqual(["m1", "m2"]);
      expect(result.fetchedAt).toBe("2026-06-27T12:00:00.000Z");
    }
  });

  test("anthropic display_name → label", async () => {
    const result = await discoverVendorModels(
      { baseUrl: "https://api.x", apiFormat: "anthropic" },
      { fetchImpl: jsonFetch({ data: [{ id: "m1", display_name: "Big" }] }) },
    );
    expect(result.ok && result.models[0]).toEqual({ id: "m1", label: "Big" });
  });

  test("空 data → ok + models:[]（不伪造）", async () => {
    const result = await discoverVendorModels(
      { baseUrl: "https://api.x", apiFormat: "openai" },
      { fetchImpl: jsonFetch({ data: [] }) },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.models).toEqual([]);
    }
  });

  test("脏数据脱敏：丢空/空白/非串 id，按 id 去重", async () => {
    const result = await discoverVendorModels(
      { baseUrl: "https://api.x", apiFormat: "openai" },
      {
        fetchImpl: jsonFetch({
          data: [{ id: "m1" }, { id: "" }, { id: "  " }, { notId: true }, { id: 7 }, { id: "m1" }],
        }),
      },
    );
    expect(result.ok && result.models.map((m) => m.id)).toEqual(["m1"]);
  });

  test("401 → unauthorized", async () => {
    const result = await discoverVendorModels(
      { baseUrl: "https://api.x", apiFormat: "openai" },
      { fetchImpl: jsonFetch({ error: "no" }, 401) },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unauthorized");
    }
  });

  test("无 data 数组 / 响应不是 JSON → invalid_response", async () => {
    const noData = await discoverVendorModels(
      { baseUrl: "https://api.x", apiFormat: "openai" },
      { fetchImpl: jsonFetch({ nope: true }) },
    );
    expect(noData.ok).toBe(false);
    if (!noData.ok) {
      expect(noData.error.code).toBe("invalid_response");
    }

    const notJson = await discoverVendorModels(
      { baseUrl: "https://api.x", apiFormat: "openai" },
      {
        fetchImpl: (() => Promise.resolve(new Response("<html>", { status: 200 }))) as typeof fetch,
      },
    );
    expect(notJson.ok).toBe(false);
    if (!notJson.ok) {
      expect(notJson.error.code).toBe("invalid_response");
    }
  });

  test("网络错误 → unreachable；AbortError/TimeoutError → timeout", async () => {
    const dead = await discoverVendorModels(
      { baseUrl: "https://dead", apiFormat: "openai" },
      { fetchImpl: (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch },
    );
    expect(!dead.ok && dead.error.code).toBe("unreachable");

    const aborted = await discoverVendorModels(
      { baseUrl: "https://slow", apiFormat: "openai" },
      {
        fetchImpl: (() =>
          Promise.reject(
            Object.assign(new Error("aborted"), { name: "AbortError" }),
          )) as typeof fetch,
      },
    );
    expect(!aborted.ok && aborted.error.code).toBe("timeout");
  });
});
