import type { VendorConnection } from "@getpaseo/protocol/messages";

// 把中转站的 key 按 authStyle(缺省由 apiFormat 推断)放进对应鉴权头：anthropic 用 x-api-key，
// 其余(openai / anthropic-auth-token)用 Authorization: Bearer。诊断与拉模型共用此一份。
export function vendorAuthHeaders(connection: VendorConnection): Record<string, string> {
  if (!connection.apiKey) {
    return {};
  }
  const style =
    connection.authStyle ??
    (connection.apiFormat === "anthropic" ? "anthropic-api-key" : "openai-api-key");
  if (style === "anthropic-api-key") {
    return { "x-api-key": connection.apiKey };
  }
  return { authorization: `Bearer ${connection.apiKey}` };
}
