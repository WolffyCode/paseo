import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 反向防线(董事长硬约束)：本期只建「配置真相源」，绝不接对话流消费。中转站配置模型层必须
// 物理上够不到 send/launch/composer——naughty-hyena 的死法正是「边建配置边接 send 没接通」。
// 不变量：这些纯模型只 import 协议类型(+ 同层相对模块)，没有任何通往运行时/发送/composer 的边。

const MODEL_FILES = [
  "./vendor-cascade-model.ts",
  "./vendor-draft-model.ts",
  "./host-config-text.ts",
];

function importSources(relativePath: string): string[] {
  const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
  const sources: string[] = [];
  const importRegex = /(?:import|export)[^"']*?from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(importRegex)) {
    if (match[1]) {
      sources.push(match[1]);
    }
  }
  return sources;
}

// 模型层允许的依赖：协议包 + 同层相对模块。其余一律视为越界(尤其任何运行时/发送/composer)。
function isAllowedModelImport(source: string): boolean {
  return source.startsWith("@getpaseo/protocol/") || source.startsWith("./");
}

// 剥掉注释再扫禁词——契约注释会善意提及「不接 composer」，那是说明而非引用，不该误判。
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

// send / launch / 消费层的禁词：任一出现在代码(非注释)里都意味着配置层开始接对话流——本期严禁。
const FORBIDDEN_TOKENS = [
  "vendor-env",
  "vendor-launch-resolver",
  "buildCodexCustomProviderConfig",
  "conversation-model-picker",
  "use-conversation-model-selection",
  "composer",
  "sendUserMessage",
  "createAgent",
  "host-runtime",
  "use-daemon-config",
];

describe("配置模型层未触达 send 路径(反向验证)", () => {
  it.each(MODEL_FILES)("%s 只依赖协议类型 + 同层模块(够不到 send/composer/runtime)", (file) => {
    for (const source of importSources(file)) {
      expect(isAllowedModelImport(source), `${file} 越界 import: ${source}`).toBe(true);
    }
  });

  it.each(MODEL_FILES)("%s 代码(去注释)不含 send/launch/消费层任何禁词", (file) => {
    const source = stripComments(
      readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8"),
    );
    for (const token of FORBIDDEN_TOKENS) {
      expect(source.includes(token), `${file} 含禁词: ${token}`).toBe(false);
    }
  });
});
