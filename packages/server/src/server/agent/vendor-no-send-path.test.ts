import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 反向防线(董事长硬约束)：vendor 诊断/拉模型/cfg1 读写是纯配置期能力，绝不接 agent 启动 /
// 子进程 env 注入 / Codex TOML 注入 / 对话发送——naughty-hyena 死在「vendor-env 编译进子进程 env +
// launch-resolver 启动期解析」。这些模块必须够不到那条消费链。

const CONFIG_FILES = [
  "../host-config-file.ts",
  "./vendor-diagnose.ts",
  "./vendor-models-fetcher.ts",
  "./vendor-auth.ts",
];

// 消费层禁词：vendor→env 编译、启动期解析、Codex 自定义 provider 注入、agent 启动/子进程。
const FORBIDDEN_TOKENS = [
  "vendor-env",
  "vendor-launch-resolver",
  "buildCodexCustomProviderConfig",
  "codex-app-server-agent",
  "child_process",
  "spawnAgent",
  "launchAgent",
  "createAgent",
];

// 剥掉注释再扫——契约注释会善意提及「不接 agent 启动」，那是说明而非引用。
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("vendor 配置层未触达 send / launch 路径(反向验证)", () => {
  it.each(CONFIG_FILES)("%s 代码(去注释)不含 agent 启动 / env 注入 / 消费层禁词", (file) => {
    const source = stripComments(
      readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8"),
    );
    for (const token of FORBIDDEN_TOKENS) {
      expect(source.includes(token), `${file} 含禁词: ${token}`).toBe(false);
    }
  });
});
