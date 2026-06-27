import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readHostConfigForEdit, writeHostConfigForEdit } from "./host-config-file.js";

// host.config.* 的真相源行为：cfg1 逃生舱按「原始文本 + revision」读写，乐观并发(stale)、
// JSON/schema 校验(invalid)、落盘失败(write_failed) 三类错误判别。写入保真用户原文本
// (不 re-serialize)，顶层未知键由 strict schema 显式报 invalid 而非静默吞。§6 RPC 往返(服务侧)。

let home: string;
const configPath = () => join(home, "config.json");

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "helm-host-config-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const VALID_COMPACT = '{"version":1,"daemon":{"listen":"127.0.0.1:7070"}}';

describe("readHostConfigForEdit", () => {
  test("配置文件缺失时返回 ok + text=null + revision=null", () => {
    const result = readHostConfigForEdit(home);
    expect(result).toEqual({ ok: true, text: null, revision: null });
  });

  test("存在时返回磁盘原始文本 + revision(mtimeMs/size)", () => {
    writeFileSync(configPath(), VALID_COMPACT);
    const result = readHostConfigForEdit(home);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe(VALID_COMPACT);
      expect(result.revision).not.toBeNull();
      expect(result.revision?.size).toBe(Buffer.byteLength(VALID_COMPACT));
    }
  });

  test("读不校验 schema：磁盘上的破损/越界配置原样返回(逃生舱可打开修复)", () => {
    const broken = '{"version":1,"unknownTop":true}';
    writeFileSync(configPath(), broken);
    const result = readHostConfigForEdit(home);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe(broken);
    }
  });
});

describe("writeHostConfigForEdit", () => {
  test("合法配置 + 匹配 revision → 落盘成功，re-read 原样读回(文本保真)", () => {
    writeFileSync(configPath(), VALID_COMPACT);
    const current = readHostConfigForEdit(home);
    const expectedRevision = current.ok ? current.revision : null;

    const next = '{"version":1,"daemon":{"listen":"0.0.0.0:7070"}}';
    const result = writeHostConfigForEdit({ paseoHome: home, text: next, expectedRevision });
    expect(result.ok).toBe(true);
    // 落盘的是用户原文本(紧凑)，不是 schema re-serialize 后的 pretty 版
    expect(readFileSync(configPath(), "utf8")).toBe(next);
    if (result.ok) {
      expect(result.text).toBe(next);
      expect(result.revision.size).toBe(Buffer.byteLength(next));
    }
  });

  test("expectedRevision 过期 → stale，携带 currentRevision，且不覆盖磁盘", () => {
    writeFileSync(configPath(), VALID_COMPACT);
    const onDisk = readHostConfigForEdit(home);
    const realRevision = onDisk.ok ? onDisk.revision : null;
    const staleRevision = { mtimeMs: 1, size: 1 };
    expect(staleRevision).not.toEqual(realRevision);

    const result = writeHostConfigForEdit({
      paseoHome: home,
      text: '{"version":1}',
      expectedRevision: staleRevision,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("stale");
      if (result.error.code === "stale") {
        expect(result.error.currentRevision).toEqual(realRevision);
      }
    }
    expect(readFileSync(configPath(), "utf8")).toBe(VALID_COMPACT);
  });

  test("JSON 语法错 → invalid，不落盘", () => {
    writeFileSync(configPath(), VALID_COMPACT);
    const current = readHostConfigForEdit(home);
    const result = writeHostConfigForEdit({
      paseoHome: home,
      text: "{ not json",
      expectedRevision: current.ok ? current.revision : null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid");
    }
    expect(readFileSync(configPath(), "utf8")).toBe(VALID_COMPACT);
  });

  test("schema 越界(strict 顶层未知键) → invalid，不落盘", () => {
    writeFileSync(configPath(), VALID_COMPACT);
    const current = readHostConfigForEdit(home);
    const result = writeHostConfigForEdit({
      paseoHome: home,
      text: '{"version":1,"bogusTopLevel":true}',
      expectedRevision: current.ok ? current.revision : null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid");
    }
    expect(readFileSync(configPath(), "utf8")).toBe(VALID_COMPACT);
  });

  test("写入新文件(磁盘无配置，expectedRevision=null) → 成功创建", () => {
    const result = writeHostConfigForEdit({
      paseoHome: home,
      text: VALID_COMPACT,
      expectedRevision: null,
    });
    expect(result.ok).toBe(true);
    expect(readFileSync(configPath(), "utf8")).toBe(VALID_COMPACT);
  });
});
