# Helm · 三层提供方（Providers → Vendors → Models）设计文档

- **状态**: 设计评审通过，待写实现计划（writing-plans）
- **日期**: 2026-06-22
- **预览图**: `/tmp/helm-design-board.png`（源：`.superpowers/brainstorm/18179-1782099144/content/board.html`，及各分屏 `providers-final.html` / `vendor-edit-v3.html` / `sync-preview.html` / `usage-below.html`）
- **前置**: 本仓库已从 Paseo 改名为 **Helm** 并做运行时隔离（端口 7070 / `~/.helm` / `helm://`），见 `docs`/记忆 `helm-rename-isolation`。

---

## 1. 目标与术语

把目前的**两层**「提供方 + 模型」重构为**三层**：

| 层  | 中文                | 英文/代码        | 含义                                                                                                                                  |
| --- | ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| ①   | 提供方              | `provider` (CLI) | 本机 CLI agent 工具。**本期只放 Claude Code + Codex**，其余隐藏。                                                                     |
| ②   | 模型供应商 / 中转站 | `vendor`         | 一个「请求地址(base_url) + key(+config)」的端点。**每个 CLI 可挂多个**，可切换。                                                      |
| ③   | 具体模型            | `model`          | 发给该 vendor 的具体模型 ID（如 `glm-5.2[1M]`、`claude-opus-4-8`）。从 vendor 的 `/v1/models` 拉取 + 手动维护，**多选"放出来哪些"**。 |

> 术语固定：层2 用 **vendor**（避免与层1 `provider` 撞名），中文统一「供应商 / 中转站」。

**核心交互规则**：对话创建时选定**提供方(①)**后**锁定不可换**；对话进行中 **vendor(②) + model(③) 可随时切换**。

---

## 2. 范围

**做（本期）**

- vendor 一等数据实体 + 配置界面（设置子页）+ 对话内的三层选择器。
- vendor 模型自动拉取（`/v1/models`）+ 手动添加 + 多选放出来。
- 一键同步 cc switch（`~/.cc-switch/cc-switch.db`）→ vendors，按 CLI（claude / codex）。
- 每 CLI 一份「通用/公共配置」（settings 文件）。

**不做 / 延后**

- 层1 仅 Claude Code + Codex；**不支持新增/删除提供方**（其余 CLI 隐藏）。
- cc switch 的多端点测速 / 故障转移（`provider_endpoints`）、内置代理、用量统计 —— 延后。
- 移动端形态本设计以桌面为准（RN 组件跨端，但交互按桌面定）。

---

## 3. 现状（要复用的既有机制）

- `agents.providers.<id>`（`ProviderOverrideSchema`，`packages/protocol/src/provider-config.ts`）已能用 `extends` + `env{ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN}` + `models[]` 把一个 CLI 指到中转站——但它把 **CLI + vendor + 模型**揉成一条扁平记录，且**只能手改 config.json，无 UI**。
- 启动注入：`createProviderEnv`（`packages/server/src/server/agent/provider-launch-config.ts`）把 `env` 合进子进程环境；Codex 走 `model_providers` TOML（见 `docs/custom-providers.md`）。
- 选择：`AgentSessionConfig`（`packages/protocol/src/messages.ts`）的 `provider` + `model` 字段；UI 为 `combined-model-selector.tsx` + `providers-section.tsx`。

**结论**：三层重构 = 在既有注入/快照管线之上，加一个**干净的 vendor 实体 + 管理 UI + cc switch 导入 + 自动拉模型**。启动路径不重造。

---

## 4. 数据模型（Approach C：一等 vendor 实体，编译到现有注入）

新增配置区 `agents.vendors`，与既有 `agents.providers` 并存：

```jsonc
// $HELM_HOME/config.json
"agents": {
  "vendors": {
    "claude": [                     // key = CLI id（层1，仅 "claude" | "codex"）
      {
        "id": "vnd_a1b2",
        "name": "质谱glm5.0",
        "notes": "公司版",
        "websiteUrl": "https://z.ai",
        "baseUrl": "https://api.z.ai/api/anthropic",
        "apiKey": "***",            // 密文，存于 0600 私有目录（同既有 env key 做法）
        "apiFormat": "anthropic",   // anthropic | openai —— 决定注入哪个 env + 拉模型端点
        "authStyle": "anthropic-auth-token", // 决定 key 写入 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY / OPENAI_API_KEY
        "fallbackModel": "glm-5.1", // 默认兜底模型
        "configJson": { /* 完整嵌套 config，见 §4.1 */ },
        "models": [                 // 拉取/手动维护的"可用"全集
          { "id": "glm-5.2[1M]", "label": "GLM 5.2 1M", "source": "fetched" },
          { "id": "glm-5.1", "source": "fetched" },
          { "id": "claude-opus-4-8", "source": "fetched", "family": "claude" }
        ],
        "exposedModelIds": ["glm-5.2[1M]", "glm-5.1", "glm-5.2"], // ③层"放出来"的子集
        "defaultModelId": "glm-5.2[1M]",
        "modelsFetchedAt": "2026-06-22T...",
        "source": { "kind": "cc-switch", "id": "<ccswitch行id>" }, // 重复同步关联
        "order": 1, "enabled": true
      }
    ],
    "codex": [ /* baseUrl/apiKey → OPENAI_*；configJson 落 model_providers TOML */ ]
  },
  "vendorCommonConfig": {           // §4.2 每 CLI 一份公共 settings
    "claude": { /* 合并进 ~/.helm 下的 settings；= cc switch common config */ },
    "codex": { /* ... */ }
  }
}
```

### 4.1 `configJson`（嵌套，对齐 cc switch `settings_config`）

vendor 的完整配置以 **JSON** 存（非扁平 key-value，便于维护嵌套）。形如：

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "***",
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5.2[1M]",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-5.2",
    "ANTHROPIC_MODEL": "glm-5.1",
    "API_TIMEOUT_MS": "3000000"
  },
  "model": "glm-5.1",
  "enabledPlugins": { "claude-hud@claude-hud": true },
  "skipDangerousModePermissionPrompt": true
}
```

- `name/baseUrl/apiKey/apiFormat/authStyle/fallbackModel` 是从 `configJson` 抽出的**便捷字段**，与 JSON **双向同步**。
- **角色映射**（Opus/Sonnet/Haiku→具体模型，即 `ANTHROPIC_DEFAULT_*_MODEL`）**收在 `configJson`里**，UI 不单独做槽位表——用户面只见具体模型。高级用户在 JSON 编辑器里改。
- 快捷开关（隐藏 AI 署名 / Teammates / 启用 Tool Search / 最大强度思考 / 禁用自动升级）= 对 `configJson` 内若干布尔字段的双向绑定。

### 4.2 通用/公共配置（settings 文件）

每个 CLI 一份共享配置（= cc switch `settings.common_config_<app>` / Claude `~/.claude/settings.json` 的角色）。vendor 可勾选「写入通用配置」让其 config 合并进公共层；「编辑通用配置」直接编公共 JSON。存于 `agents.vendorCommonConfig[cli]`，落盘到 `~/.helm/settings/<cli>.json`。

### 4.3 选择字段（协议后向兼容）

`AgentSessionConfig` 增加**可选** `vendorId?: string`（`packages/protocol/src/messages.ts`）。

- 旧端忽略该字段（`.optional()`，符合协议后向兼容铁律）。
- `vendorId` 缺省 = 行为同今天（直连/默认登录）。`model` 字段沿用。

---

## 5. 启动落地（复用 `createProviderEnv`）

agent spawn 时若带 `vendorId`：查 `agents.vendors[provider]` 命中 vendor → 按 CLI 家族编译 env：

- **claude 家族** → `ANTHROPIC_BASE_URL = vendor.baseUrl`，`authStyle` 对应的 `ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY = vendor.apiKey`，再并入 `configJson.env`（含角色映射、`API_TIMEOUT_MS` 等）。第三方端点默认补 `disallowedTools:["WebSearch"]`（见既有 gotcha）。
- **codex 家族** → `OPENAI_BASE_URL/OPENAI_API_KEY` + 既有的 `model_providers` TOML 注入。
- **层3** → `AgentSessionConfig.model`（用户选的具体模型）→ `ANTHROPIC_MODEL` / `--model` / Codex model。
- 全部交给现有 `createProviderEnv` / Codex provider-config 路径，不新建注入机制。

---

## 6. 模型来源（§③层）

1. **自动拉取（默认）**：用 vendor 的 `baseUrl + apiKey`，按 `apiFormat` 选端点拉模型——
   - `openai`：`GET {baseUrl}/v1/models`，`Authorization: Bearer {key}`。
   - `anthropic`：`GET {baseUrl}/v1/models`（Anthropic 兼容端点多数支持），`x-api-key`/`authorization`。
   - 结果写入 `vendor.models`（标 `source:"fetched"`）。
2. **手动添加**（必备）：拉取不到时手填模型 ID（标 `source:"manual"`），不依赖端点是否暴露 `/models`。
3. **多选"放出来"**：`models` 是全集，用户勾选 `exposedModelIds` 子集——只有勾选的进对话选择器。理由：单个中转可能同时支持 claude + glm 等很多模型，用户只放想要的。

---

## 7. 一键同步 cc switch

- 源：`~/.cc-switch/cc-switch.db`（SQLite，**只读**）。关键表 `providers(app_type, name, settings_config(JSON), website_url, icon, ...)`、`settings.common_config_<app>`、可选 `model_pricing`（取显示名）。
- 映射：`app_type` → CLI（`claude`→claude，`codex`→codex；其余跳过/本期不导）。每行 `providers` → 一个 vendor：`name/notes/websiteUrl/icon` 直取；`baseUrl/apiKey` 从 `settings_config.env` 抽；`configJson = settings_config`；`source.id = providers.id`。
- 模型种子：从 `settings_config.env` 的 `ANTHROPIC_*_MODEL` 去重出初始 `models`，导入后可再自动拉取。
- 冲突：按 `source.id` 关联——**已存在则更新 url/key/config，但不覆盖用户本地改过的**（标"更新·逐项确认"）；新行标"新增"；cc switch 里没有的本地 vendor **保留不动**（单向导入，不删）。
- UI：导入预览弹窗（按 CLI 分 tab）→ 列出 新增/更新 → 勾选 → 「导入所选」。见预览图 ③。

---

## 8. UI

### 8.1 配置界面（设置子页：主机 › 提供方）

- 嵌在既有设置框架（左 320 边栏 → 内容区），即 `HostProvidersPage` → 重做的 `ProvidersSection`。
- **层1 列**：只 Claude Code + Codex（固定两项，无 ➕/🗑）。右上「⟳ 一键同步 cc switch」。
- **层2/3 区**：vendor 卡片列表（含「直连·官方」默认项 + 各 vendor，cc switch 来源标）。卡片 ✎编辑/🗑删除/展开看模型。「＋新增供应商」。
- **vendor 编辑表单**（对齐 cc switch，见预览图 ②）：名称/备注 · 官网 · API Key(👁) · 请求地址(完整 URL 开关 + 管理与测速[延后]) · **高级选项**(API 格式↓、认证字段↓、默认兜底模型、User-Agent) · **配置 config JSON**(快捷开关 + 带行号语法高亮 JSON 编辑器 + 写入通用配置/编辑通用配置 + 格式化) · **模型 · 放出来哪些**(获取模型列表 + 多选 + 手动添加 + 设默认)。

### 8.2 对话使用界面（模型选择器）

- 形态 **B：单个级联下拉**，**放在对话框下方独立一行**（对话框那行留给 附件/模式/联网/🎤/发送，避免挤）。
- 胶囊 `🔒 {CLI} · {vendor} · {model} ▾`，点开级联：① 提供方（锁定，顶部灰显）→ ② 中转站列表（每个 `›`）→ ③ 该 vendor 的 exposed 模型子菜单。底部「⚙ 管理供应商…」跳配置页。
- **提供方🔒锁定**，vendor + model 可切；切换对下一条消息生效。
- **对话框功能按钮随所选模型能力变化**（model-driven）：联网/思考档/附件等按当前 `(provider, vendor, model)` 的能力显示/隐藏。

---

## 9. 架构铁律 · MVVM

- **新代码一律模型/UI 分离，所有 UI 由 view-model（模型）驱动**。UI 是状态的纯函数；如对话框功能按钮 = 当前 `(provider, vendor, model)` 能力的纯函数；选择器 = vendor/model store 的投影。
- **改既有代码可保留原写法**（不为风格统一去翻已存在的实现，转换成本小才顺手做）。
- 边界清晰、单一职责、可独立测试；文件过大即拆。

---

## 10. 协议 / 兼容 / 能力门

- `AgentSessionConfig.vendorId` 为 `.optional()`，旧端忽略；不改既有字段类型。
- 新 RPC 用点号命名空间 + 方向后缀（见 `docs/rpc-namespacing.md`）：如 `providers.vendors.list.request/response`、`providers.vendors.upsert.*`、`providers.vendors.models.fetch.*`、`providers.ccswitch.sync.*`。
- 能力门 `server_info.features.threeLayerVendors`（`// COMPAT(threeLayerVendors): added in v0.1.X`）；旧 daemon 不支持时客户端提示"升级 host"。无降级路径。

---

## 11. 测试

- **数据/编译**：vendor → env 编译（claude/codex 各一）、`vendorId` 缺省回退、`configJson` ↔ 便捷字段同步、exposed 子集生效。
- **拉模型**：anthropic/openai 端点各一（mock HTTP）、失败回退手动。
- **同步**：用真实 `cc-switch.db` 只读读取 → 映射快照（新增/更新/跳过计数）；`source.id` 关联不覆盖本地改动；不删非 cc switch 项。
- **协议**：旧端解析带 `vendorId` 的消息不报错；旧 daemon 下能力门提示。
- 遵循仓库测试纪律：只跑改动到的单文件，不跑全量。

---

## 12. 待确认 / 开放点

1. vendor 编辑表单是否需要保留 cc switch 的「角色映射表」可视化（当前定为收进 JSON）。
2. `model` 字段与 `vendorId` 的历史会话迁移（旧会话无 vendorId，按直连处理）。
3. 「管理与测速 / 多端点」是否本期做（当前延后）。
4. Codex 的 model 列表拉取端点细节（OpenAI Responses vs chat completions 的 `/models`）。

---

## 13. 参考

- 现状架构：`packages/protocol/src/provider-config.ts`、`packages/protocol/src/messages.ts`、`packages/server/src/server/agent/provider-launch-config.ts`、`packages/app/src/screens/settings/providers-section.tsx`、`packages/app/src/screens/settings-screen.tsx`、`packages/app/src/components/combined-model-selector.tsx`。
- 自定义 provider 现状：`docs/custom-providers.md`、`docs/providers.md`。
- cc switch 参考界面：用户实拍「编辑供应商」截图（名称/备注/官网/key/请求地址/高级:API格式·认证字段·模型映射·默认兜底·UA/配置JSON+通用配置）。
