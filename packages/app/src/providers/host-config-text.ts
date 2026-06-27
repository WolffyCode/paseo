// cfg1(config.json)编辑器的客户端校验(纯函数)：只判 JSON 语法 + 顶层是对象，并尽力定位
// 错误行列。完整 schema 校验交服务端权威(host.config.write 返回 invalid)——客户端不复制
// PersistedConfigSchema，避免两个真相源。组件按 status 渲染 badge、按 isValid 决定保存可用。

export interface HostConfigTextError {
  message: string;
  line?: number;
  column?: number;
}

export interface HostConfigTextValidation {
  status: "valid" | "invalid";
  error?: HostConfigTextError;
}

// 从 V8 的 JSON 报错文本里抽行列：优先 "(line L column C)"，否则 "position N" 反算行列。
function locateSyntaxError(
  text: string,
  message: string,
): {
  line?: number;
  column?: number;
} {
  const lineColumn = message.match(/line (\d+) column (\d+)/i);
  if (lineColumn) {
    return { line: Number(lineColumn[1]), column: Number(lineColumn[2]) };
  }
  const position = message.match(/position (\d+)/i);
  if (position) {
    const offset = Number(position[1]);
    const upto = text.slice(0, offset);
    return { line: upto.split("\n").length, column: offset - upto.lastIndexOf("\n") };
  }
  return {};
}

export function validateHostConfigText(text: string): HostConfigTextValidation {
  if (text.trim() === "") {
    return { status: "invalid", error: { message: "Configuration cannot be empty." } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON.";
    return { status: "invalid", error: { message, ...locateSyntaxError(text, message) } };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      status: "invalid",
      error: { message: "Top-level configuration must be a JSON object." },
    };
  }

  return { status: "valid" };
}
