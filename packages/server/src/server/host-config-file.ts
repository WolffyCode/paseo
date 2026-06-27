import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { HostConfigRevision, HostConfigRpcError } from "@getpaseo/protocol/messages";
import { PersistedConfigSchema } from "./persisted-config.js";
import { writePrivateFileAtomicSync } from "./private-files.js";

// cfg1 逃生舱的原始读写：把当前主机的 config.json 当「原始文本 + revision」对待，
// 而非结构化对象——读不校验(可打开破损文件去修)、写才校验，且落盘保真用户原文本。
// 对标 read/write_project_config 的 revision + 判别式 ok 联合，但主机配置物理自有一份。

const CONFIG_FILENAME = "config.json";

export type ReadHostConfigForEditResult =
  | { ok: true; text: string | null; revision: HostConfigRevision | null }
  | { ok: false; error: HostConfigRpcError };

export type WriteHostConfigForEditResult =
  | { ok: true; text: string; revision: HostConfigRevision }
  | { ok: false; error: HostConfigRpcError };

export interface WriteHostConfigForEditInput {
  paseoHome: string;
  text: string;
  expectedRevision: HostConfigRevision | null;
}

function hostConfigPath(paseoHome: string): string {
  return join(paseoHome, CONFIG_FILENAME);
}

// config.json 的乐观并发版本(mtimeMs/size)；文件缺失返回 null。
function statHostConfig(paseoHome: string): HostConfigRevision | null {
  const path = hostConfigPath(paseoHome);
  if (!existsSync(path)) {
    return null;
  }
  const stats = statSync(path);
  return { mtimeMs: stats.mtimeMs, size: stats.size };
}

function revisionsEqual(
  left: HostConfigRevision | null,
  right: HostConfigRevision | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.mtimeMs === right.mtimeMs && left.size === right.size;
}

// 读：返回磁盘上的原始字节 + revision，不解析、不校验——逃生舱要能打开并修复无效配置。
export function readHostConfigForEdit(paseoHome: string): ReadHostConfigForEditResult {
  const path = hostConfigPath(paseoHome);
  if (!existsSync(path)) {
    return { ok: true, text: null, revision: null };
  }
  try {
    return { ok: true, text: readFileSync(path, "utf8"), revision: statHostConfig(paseoHome) };
  } catch {
    return { ok: false, error: { code: "invalid" } };
  }
}

// 写：先 JSON 语法 + PersistedConfigSchema(strict 顶层) 校验 → invalid；再比对 revision →
// stale；通过后原子落盘用户原文本(text fidelity，不 re-serialize) → 失败 write_failed。
export function writeHostConfigForEdit(
  input: WriteHostConfigForEditInput,
): WriteHostConfigForEditResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.text);
  } catch {
    return { ok: false, error: { code: "invalid", message: "Invalid JSON syntax." } };
  }

  const schemaResult = PersistedConfigSchema.safeParse(parsed);
  if (!schemaResult.success) {
    return {
      ok: false,
      error: { code: "invalid", message: schemaResult.error.issues[0]?.message },
    };
  }

  const currentRevision = statHostConfig(input.paseoHome);
  if (!revisionsEqual(currentRevision, input.expectedRevision)) {
    return { ok: false, error: { code: "stale", currentRevision } };
  }

  try {
    writePrivateFileAtomicSync(hostConfigPath(input.paseoHome), input.text);
  } catch {
    return { ok: false, error: { code: "write_failed" } };
  }

  const revision = statHostConfig(input.paseoHome);
  if (!revision) {
    return { ok: false, error: { code: "write_failed" } };
  }
  return { ok: true, text: input.text, revision };
}
