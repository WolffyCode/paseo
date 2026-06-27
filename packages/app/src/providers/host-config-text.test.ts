import { describe, expect, it } from "vitest";
import { validateHostConfigText } from "./host-config-text.js";

// cfg1 编辑器的客户端校验(纯函数)：JSON 语法 + 顶层结构 + 错误定位(行列)，喂样本文本断言 badge。
// 完整 schema 校验是服务端权威(host.config.write 返回 invalid)，客户端不复制 PersistedConfigSchema
// (避免两个真相源)。§6 必测 5(合法→有效/语法错→定位+禁存/越界结构→无效)。

describe("validateHostConfigText", () => {
  it("合法对象 → valid", () => {
    expect(validateHostConfigText("{}").status).toBe("valid");
    expect(validateHostConfigText('{"version":1,"daemon":{"listen":"x"}}').status).toBe("valid");
  });

  it("语法错 → invalid + 错误定位(行/列)，保存应禁用", () => {
    const result = validateHostConfigText('{\n  "a": 1\n  "b": 2\n}');
    expect(result.status).toBe("invalid");
    expect(result.error?.message).toBeTruthy();
    expect(result.error?.line).toBe(3);
  });

  it("顶层不是对象(数组/原始值) → invalid", () => {
    expect(validateHostConfigText("[]").status).toBe("invalid");
    expect(validateHostConfigText("42").status).toBe("invalid");
    expect(validateHostConfigText('"x"').status).toBe("invalid");
  });

  it("空文本 → invalid(不能保存空)", () => {
    expect(validateHostConfigText("").status).toBe("invalid");
    expect(validateHostConfigText("   \n  ").status).toBe("invalid");
  });

  it("首行语法错定位在第 1 行", () => {
    const result = validateHostConfigText("{ broken");
    expect(result.status).toBe("invalid");
    expect(result.error?.line).toBe(1);
  });
});
