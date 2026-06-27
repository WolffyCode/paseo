import { describe, expect, it } from "vitest";
import type { ProviderVendor } from "@getpaseo/protocol/provider-config";
import {
  applyDraftToVendor,
  beginSave,
  createRequestSequence,
  initVendorPersist,
  isDraftDirty,
  saveFailed,
  saveSucceeded,
  updateDraft,
  validateDraft,
  vendorToDraft,
} from "./vendor-draft-model.js";

// L3 编辑缓冲是纯逻辑：草稿校验(base_url 协议/key 非空/高级 JSON parse)、dirty 判定、
// 乐观落盘 + 写失败回滚到落盘值、拉模型 abort 旧请求不覆盖新结果。§6 必测 4 + RPC 往返(abort)。

const committed: ProviderVendor = {
  id: "v1",
  label: "Relay-A",
  baseUrl: "https://api.example.com",
  apiKey: "sk-old",
  apiFormat: "anthropic",
  advanced: { timeoutSec: 30 },
};

describe("草稿投影 + dirty", () => {
  it("vendorToDraft 把 advanced 投成 JSON 文本，round-trip 不脏", () => {
    const draft = vendorToDraft(committed);
    expect(draft.baseUrl).toBe("https://api.example.com");
    expect(JSON.parse(draft.advancedText)).toEqual({ timeoutSec: 30 });
    expect(isDraftDirty(draft, committed)).toBe(false);
  });

  it("改 baseUrl → dirty", () => {
    const draft = updateDraft(vendorToDraft(committed), { baseUrl: "https://api.new.com" });
    expect(isDraftDirty(draft, committed)).toBe(true);
  });
});

describe("草稿校验 validateDraft", () => {
  it("baseUrl 必须 http(s)：空 / 非协议 → 报错", () => {
    expect(
      validateDraft(updateDraft(vendorToDraft(committed), { baseUrl: "" })).baseUrlError,
    ).toBeTruthy();
    expect(
      validateDraft(updateDraft(vendorToDraft(committed), { baseUrl: "ftp://x" })).baseUrlError,
    ).toBeTruthy();
    expect(validateDraft(vendorToDraft(committed)).baseUrlError).toBeUndefined();
  });

  it("key 非空", () => {
    expect(
      validateDraft(updateDraft(vendorToDraft(committed), { apiKey: "" })).apiKeyError,
    ).toBeTruthy();
  });

  it("高级 JSON 非法 → advancedError(挂起，不让保存)", () => {
    const bad = updateDraft(vendorToDraft(committed), { advancedText: "{ not json" });
    const result = validateDraft(bad);
    expect(result.advancedError).toBeTruthy();
    expect(result.isValid).toBe(false);
  });

  it("全部合法 → isValid，applyDraftToVendor 产出新 vendor(解析 advanced)", () => {
    const draft = updateDraft(vendorToDraft(committed), {
      baseUrl: "https://api.new.com",
      apiKey: "sk-new",
      advancedText: '{"timeoutSec": 60}',
    });
    expect(validateDraft(draft).isValid).toBe(true);
    const next = applyDraftToVendor(draft, committed);
    expect(next.baseUrl).toBe("https://api.new.com");
    expect(next.apiKey).toBe("sk-new");
    expect(next.advanced).toEqual({ timeoutSec: 60 });
    expect(next.id).toBe("v1");
  });
});

describe("乐观落盘 + 写失败回滚", () => {
  it("beginSave 保留草稿(乐观)，saveFailed 回滚草稿到落盘值", () => {
    const edited = updateDraft(initVendorPersist(committed).draft, {
      baseUrl: "https://api.new.com",
    });
    const saving = beginSave({ ...initVendorPersist(committed), draft: edited });
    expect(saving.status).toBe("saving");
    expect(saving.draft.baseUrl).toBe("https://api.new.com");

    const failed = saveFailed(saving, "network down");
    expect(failed.status).toBe("error");
    expect(failed.error).toBe("network down");
    // 回滚：草稿恢复成最后落盘值
    expect(failed.draft.baseUrl).toBe("https://api.example.com");
    expect(isDraftDirty(failed.draft, failed.committed)).toBe(false);
  });

  it("saveSucceeded 把 committed 推进到新值，草稿不脏", () => {
    const newCommitted: ProviderVendor = { ...committed, baseUrl: "https://api.new.com" };
    const done = saveSucceeded(beginSave(initVendorPersist(committed)), newCommitted);
    expect(done.status).toBe("idle");
    expect(done.committed.baseUrl).toBe("https://api.new.com");
    expect(isDraftDirty(done.draft, done.committed)).toBe(false);
  });
});

describe("拉模型 latest-wins 竞态守卫", () => {
  it("旧 token 不是 latest，新 token 才是(abort 旧请求不覆盖新结果)", () => {
    const seq = createRequestSequence();
    const first = seq.issue();
    const second = seq.issue();
    expect(seq.isLatest(first)).toBe(false);
    expect(seq.isLatest(second)).toBe(true);
  });
});
