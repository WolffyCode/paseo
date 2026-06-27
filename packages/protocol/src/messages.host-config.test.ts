import { describe, expect, test } from "vitest";
import {
  HostConfigReadRequestMessageSchema,
  HostConfigReadResponseMessageSchema,
  HostConfigWriteRequestMessageSchema,
  HostConfigWriteResponseMessageSchema,
  HostVendorDiagnoseRequestMessageSchema,
  HostVendorDiagnoseResponseMessageSchema,
  HostVendorDiscoverModelsRequestMessageSchema,
  HostVendorDiscoverModelsResponseMessageSchema,
  MutableDaemonConfigPatchSchema,
  ServerInfoStatusPayloadSchema,
} from "./messages.js";

// 3 个新点号 RPC(host.config.read/write、host.vendor.diagnose、host.vendor.discover_models)
// 的往返契约：请求/响应 schema 必须无损解析(parse→serialize→parse)，判别式 ok 联合的
// 成功态与失败态都覆盖。这是 §6「RPC 往返」必测的协议侧。
describe("host.config.* RPC 往返", () => {
  test("host.config.read 请求/成功响应(原始文本+revision)round-trip", () => {
    const req = HostConfigReadRequestMessageSchema.parse({
      type: "host.config.read.request",
      requestId: "r1",
    });
    expect(req.type).toBe("host.config.read.request");

    const ok = HostConfigReadResponseMessageSchema.parse({
      type: "host.config.read.response",
      payload: {
        requestId: "r1",
        ok: true,
        text: '{\n  "version": 1\n}\n',
        revision: { mtimeMs: 5, size: 12 },
      },
    });
    expect(ok.payload.ok).toBe(true);
    if (ok.payload.ok) {
      expect(ok.payload.text).toContain("version");
      expect(ok.payload.revision).toEqual({ mtimeMs: 5, size: 12 });
    }
  });

  test("host.config.write 失败响应 stale 携带 currentRevision", () => {
    const stale = HostConfigWriteResponseMessageSchema.parse({
      type: "host.config.write.response",
      payload: {
        requestId: "w1",
        ok: false,
        error: { code: "stale", currentRevision: { mtimeMs: 9, size: 30 } },
      },
    });
    expect(stale.payload.ok).toBe(false);
    if (!stale.payload.ok && stale.payload.error.code === "stale") {
      expect(stale.payload.error.currentRevision).toEqual({ mtimeMs: 9, size: 30 });
    }
  });

  test("host.config.write 请求携带 text + expectedRevision(可空)", () => {
    const req = HostConfigWriteRequestMessageSchema.parse({
      type: "host.config.write.request",
      requestId: "w2",
      text: "{}",
      expectedRevision: null,
    });
    expect(req.expectedRevision).toBeNull();
    expect(req.text).toBe("{}");
  });
});

describe("host.vendor.* RPC 往返", () => {
  test("diagnose 请求(目标+端点) + 响应三态(healthy/unauthorized/timeout)", () => {
    const req = HostVendorDiagnoseRequestMessageSchema.parse({
      type: "host.vendor.diagnose.request",
      requestId: "d1",
      target: {
        baseUrl: "https://x",
        apiKey: "k",
        apiFormat: "anthropic",
        endpoints: ["https://x/v1"],
      },
    });
    expect(req.target.endpoints).toEqual(["https://x/v1"]);

    const resp = HostVendorDiagnoseResponseMessageSchema.parse({
      type: "host.vendor.diagnose.response",
      payload: {
        requestId: "d1",
        results: [
          { url: "https://x/v1", health: "healthy", latencyMs: 42, httpStatus: 200 },
          { url: "https://x/v2", health: "unauthorized", httpStatus: 401 },
          { url: "https://x/v3", health: "timeout" },
        ],
      },
    });
    expect(resp.payload.results.map((r) => r.health)).toEqual([
      "healthy",
      "unauthorized",
      "timeout",
    ]);
  });

  test("discover_models 成功(空集合不伪造)与失败(unauthorized)都解析", () => {
    const empty = HostVendorDiscoverModelsResponseMessageSchema.parse({
      type: "host.vendor.discover_models.response",
      payload: { requestId: "m1", ok: true, models: [], fetchedAt: "2026-06-27T00:00:00.000Z" },
    });
    expect(empty.payload.ok).toBe(true);
    if (empty.payload.ok) {
      expect(empty.payload.models).toEqual([]);
    }

    const fail = HostVendorDiscoverModelsResponseMessageSchema.parse({
      type: "host.vendor.discover_models.response",
      payload: { requestId: "m1", ok: false, error: { code: "unauthorized" } },
    });
    expect(fail.payload.ok).toBe(false);

    const reqMsg = HostVendorDiscoverModelsRequestMessageSchema.parse({
      type: "host.vendor.discover_models.request",
      requestId: "m1",
      target: { baseUrl: "https://x", apiFormat: "openai" },
    });
    expect(reqMsg.target.apiFormat).toBe("openai");
  });
});

describe("vendor 配置随既有写路径", () => {
  test("set_daemon_config patch 携带 providers.<id>.vendors 子树(单一结构化写路径)", () => {
    const patch = MutableDaemonConfigPatchSchema.parse({
      providers: {
        claude: {
          enabled: true,
          currentVendorId: "v1",
          vendors: [
            {
              id: "v1",
              label: "R",
              baseUrl: "https://x",
              apiFormat: "anthropic",
              exposedModelIds: ["m1"],
            },
          ],
        },
      },
    });
    expect(patch.providers?.claude?.vendors?.[0]?.id).toBe("v1");
    expect(patch.providers?.claude?.currentVendorId).toBe("v1");
  });
});

describe("能力门 server_info.features", () => {
  test("3 个新能力位(hostProviderVendors/hostConfigFile/vendorDiagnostics)解析", () => {
    const info = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "s1",
      features: { hostProviderVendors: true, hostConfigFile: true, vendorDiagnostics: true },
    });
    expect(info.features?.hostProviderVendors).toBe(true);
    expect(info.features?.hostConfigFile).toBe(true);
    expect(info.features?.vendorDiagnostics).toBe(true);
  });
});
