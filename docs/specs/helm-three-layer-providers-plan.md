# 三层提供方（Providers → Vendors → Models）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务执行。步骤用 `- [ ]` 复选框跟踪。

**Goal:** 给 Helm 加"CLI 提供方 → 模型供应商(url+key) → 具体模型"三层：vendor 一等实体 + 配置界面 + cc-switch 一键同步 + 对话内 model-driven 级联选择器。

**Architecture:** Approach C —— 新增 `agents.vendors` 实体，启动时编译进现有 `createProviderEnv` 注入；vendor CRUD 走既有 `patchConfig`/`savePersistedConfig`（vendor 即配置）；仅"拉模型 / 读 cc-switch.db"两个动作走新 RPC。`AgentSessionConfig.vendorId` 可选（协议后向兼容）。新代码 MVVM。

**Tech Stack:** TypeScript + Zod（协议/服务端）、React Native/Expo + unistyles（app）、WebSocket RPC、`node:sqlite`（读 cc-switch.db）、vitest。

设计文档：`docs/specs/helm-three-layer-providers.md`。已批准的预览图：`/tmp/helm-design-board.png` 及 `.superpowers/brainstorm/18179-1782099144/content/{providers-final,vendor-edit-v3,sync-preview,usage-below}.html`。

## Global Constraints

- **协议后向兼容**：新字段一律 `.optional()`；不改既有字段类型；旧端必须能解析新消息。`AgentSessionConfig.vendorId?: string`。
- **提供方只 `claude` + `codex`**：UI 层1 固定两项，不支持新增/删除；其余 CLI 隐藏。
- **新 RPC 用点号命名空间 + 方向后缀**（见 `docs/rpc-namespacing.md`）：`providers.vendor.models.fetch.request/response`、`providers.ccswitch.sync.request/response`。
- **能力门** `server_info.features.threeLayerVendors`，注释 `// COMPAT(threeLayerVendors): added in v0.1.X`；旧 daemon 提示"升级 host"，无降级路径。
- **MVVM**：新代码模型/UI 分离、UI 由 view-model 驱动；改既有代码可保留原写法。
- **测试纪律**：只跑改动到的单文件 `npx vitest run <file> --bail=1`，绝不跑全量。每次提交前 `npm run format:files -- <files>`，提交走 lefthook（会跑全量 typecheck）。
- **密钥**：`apiKey` 存进 config.json，依赖既有 `writePrivateFileAtomicSync`（0600 私有目录），勿明文 log。

---

## Phase 1 — 协议 + 服务端基座（vendor 数据模型 + 启动落地）

可独立验收：能在 config.json 配 vendor，并用 CLI/RPC 启动一个走该 vendor(url+key+model) 的 agent。

### Task 1.1: vendor Zod 模型

**Files:**

- Modify: `packages/protocol/src/provider-config.ts`（在 `ProviderProfileModelSchema` 之后追加）
- Test: `packages/protocol/src/provider-config.test.ts`（若无则 Create）

**Interfaces — Produces:**

- `VendorModelSchema` = `{ id: string; label?: string; source?: "fetched"|"manual"|"cc-switch"; family?: string }`
- `VendorSchema` = `{ id: string; name: string; notes?: string; websiteUrl?: string; baseUrl: string; apiKey?: string; apiFormat: "anthropic"|"openai"; authStyle: "anthropic-auth-token"|"anthropic-api-key"|"openai-api-key"; fallbackModel?: string; configJson?: Record<string,unknown>; models?: VendorModel[]; exposedModelIds?: string[]; defaultModelId?: string; modelsFetchedAt?: string; source?: { kind: "cc-switch"; id: string }; order?: number; enabled?: boolean }`
- `VendorsByCliSchema` = `z.record(z.enum(["claude","codex"]), z.array(VendorSchema))`
- `VendorCommonConfigSchema` = `z.record(z.enum(["claude","codex"]), z.record(z.string(), z.unknown()))`
- types: `VendorModel`, `Vendor`, `VendorsByCli`, `VendorCommonConfig` via `z.infer`

- [ ] **Step 1: 写失败测试**

```ts
// packages/protocol/src/provider-config.test.ts
import { describe, it, expect } from "vitest";
import { VendorSchema, VendorsByCliSchema } from "./provider-config.js";

describe("VendorSchema", () => {
  it("accepts a minimal claude vendor", () => {
    const v = VendorSchema.parse({
      id: "vnd_1",
      name: "质谱glm5.0",
      baseUrl: "https://api.z.ai/api/anthropic",
      apiKey: "k",
      apiFormat: "anthropic",
      authStyle: "anthropic-auth-token",
    });
    expect(v.name).toBe("质谱glm5.0");
    expect(v.enabled).toBeUndefined();
  });
  it("rejects missing baseUrl", () => {
    expect(() =>
      VendorSchema.parse({
        id: "x",
        name: "n",
        apiFormat: "anthropic",
        authStyle: "openai-api-key",
      }),
    ).toThrow();
  });
  it("keys vendors by cli", () => {
    const m = VendorsByCliSchema.parse({ claude: [], codex: [] });
    expect(Object.keys(m)).toEqual(["claude", "codex"]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `npx vitest run packages/protocol/src/provider-config.test.ts --bail=1`，预期 FAIL（`VendorSchema` 未导出）。

- [ ] **Step 3: 实现 schema**（加到 `provider-config.ts`）

```ts
export const VendorModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  source: z.enum(["fetched", "manual", "cc-switch"]).optional(),
  family: z.string().optional(),
});
export const VendorApiFormatSchema = z.enum(["anthropic", "openai"]);
export const VendorAuthStyleSchema = z.enum([
  "anthropic-auth-token",
  "anthropic-api-key",
  "openai-api-key",
]);
export const VendorCliSchema = z.enum(["claude", "codex"]);
export const VendorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  notes: z.string().optional(),
  websiteUrl: z.string().optional(),
  baseUrl: z.string().min(1),
  apiKey: z.string().optional(),
  apiFormat: VendorApiFormatSchema,
  authStyle: VendorAuthStyleSchema,
  fallbackModel: z.string().optional(),
  configJson: z.record(z.string(), z.unknown()).optional(),
  models: z.array(VendorModelSchema).optional(),
  exposedModelIds: z.array(z.string()).optional(),
  defaultModelId: z.string().optional(),
  modelsFetchedAt: z.string().optional(),
  source: z.object({ kind: z.literal("cc-switch"), id: z.string() }).optional(),
  order: z.number().optional(),
  enabled: z.boolean().optional(),
});
export const VendorsByCliSchema = z.record(VendorCliSchema, z.array(VendorSchema));
export const VendorCommonConfigSchema = z.record(
  VendorCliSchema,
  z.record(z.string(), z.unknown()),
);
export type VendorModel = z.infer<typeof VendorModelSchema>;
export type Vendor = z.infer<typeof VendorSchema>;
export type VendorsByCli = z.infer<typeof VendorsByCliSchema>;
export type VendorCommonConfig = z.infer<typeof VendorCommonConfigSchema>;
```

- [ ] **Step 4: 跑测试确认通过** — 同命令，预期 PASS。
- [ ] **Step 5: 提交** — `npm run format:files -- packages/protocol/src/provider-config.ts packages/protocol/src/provider-config.test.ts` → `git add` 两文件 → `git commit -m "feat(protocol): vendor schema for three-layer providers"`。

### Task 1.2: 接入 PersistedConfigSchema

**Files:**

- Modify: `packages/server/src/server/persisted-config.ts:274-280`（`agents` 对象加 `vendors` + `vendorCommonConfig`）
- Modify: `packages/server/src/server/persisted-config.ts:295-299`（`PersistedConfig` 类型补 vendors 字段）
- Test: `packages/server/src/server/persisted-config.test.ts`（已存在）

**Interfaces — Consumes:** `VendorsByCliSchema`, `VendorCommonConfigSchema`（Task 1.1，经 `provider-launch-config.js` re-export，见下）。
**Produces:** `loadPersistedConfig().agents.vendors / .vendorCommonConfig`。

- [ ] **Step 1:** 失败测试：写一个含 `agents.vendors.claude[0]` 的 config 到临时 home，`loadPersistedConfig` 应原样读回（断言 `cfg.agents?.vendors?.claude?.[0]?.baseUrl`）。
- [ ] **Step 2:** 跑 `npx vitest run packages/server/src/server/persisted-config.test.ts --bail=1` → FAIL（strict schema 拒绝未知 `vendors`）。
- [ ] **Step 3:** 实现：
  - 在 `provider-launch-config.ts`（既有 re-export 点）补 `export { VendorsByCliSchema, VendorCommonConfigSchema } from "@getpaseo/protocol/provider-config"` 及类型。
  - `persisted-config.ts` 顶部 import 之；`agents` 对象加 `vendors: VendorsByCliSchema.optional()`、`vendorCommonConfig: VendorCommonConfigSchema.optional()`；`PersistedConfig` 类型的 `agents` 分支补这两字段（保留既有 `providers` 覆写）。
- [ ] **Step 4:** 跑测试 → PASS。
- [ ] **Step 5:** 提交 `feat(server): persist agents.vendors + vendorCommonConfig`。

### Task 1.3: `AgentSessionConfig.vendorId`（可选）

**Files:**

- Modify: `packages/protocol/src/messages.ts:319-340`（`AgentSessionConfigSchema` 加 `vendorId: z.string().optional()`）
- Test: `packages/protocol/src/messages.test.ts`（已存在或 Create）

**Interfaces — Produces:** `AgentSessionConfig.vendorId?: string`。

- [ ] **Step 1:** 失败测试：① `AgentSessionConfigSchema.parse({provider:"claude",cwd:"/x",vendorId:"vnd_1"}).vendorId === "vnd_1"`；② **后向兼容**：不带 `vendorId` 的旧消息照样 parse 成功，`vendorId` 为 `undefined`。
- [ ] **Step 2:** 跑该测试 → FAIL。
- [ ] **Step 3:** `AgentSessionConfigSchema` 加 `vendorId: z.string().optional(),`（紧挨 `model` 字段）。
- [ ] **Step 4:** PASS。
- [ ] **Step 5:** 提交 `feat(protocol): AgentSessionConfig.vendorId (optional, back-compat)`。

### Task 1.4: vendor → env 编译

**Files:**

- Create: `packages/server/src/server/agent/vendor-env.ts`
- Test: `packages/server/src/server/agent/vendor-env.test.ts`

**Interfaces — Consumes:** `Vendor`, `VendorCommonConfig`（Task 1.1）。
**Produces:** `compileVendorEnv(input: { cli: "claude"|"codex"; vendor: Vendor; commonConfig?: Record<string,unknown>; model?: string }): { env: Record<string,string>; disallowedTools?: string[] }`。

- [ ] **Step 1:** 失败测试覆盖：
  - claude + `authStyle:"anthropic-auth-token"` → `env.ANTHROPIC_BASE_URL===vendor.baseUrl`、`env.ANTHROPIC_AUTH_TOKEN===vendor.apiKey`，并并入 `configJson.env`；`model` 入 `env.ANTHROPIC_MODEL`；非官方域名默认 `disallowedTools` 含 `"WebSearch"`。
  - `authStyle:"anthropic-api-key"` → 走 `ANTHROPIC_API_KEY`。
  - codex + `authStyle:"openai-api-key"` → `env.OPENAI_BASE_URL`/`OPENAI_API_KEY`（model_providers TOML 在 Task 1.5 注入点处理，这里只产 env）。
- [ ] **Step 2:** 跑 `npx vitest run packages/server/src/server/agent/vendor-env.test.ts --bail=1` → FAIL。
- [ ] **Step 3:** 实现 `compileVendorEnv`：按 `cli`/`authStyle` 映射 key→env 名；合并顺序 `commonConfig.env` < `configJson.env` < 显式(baseUrl/key/model)；返回 `disallowedTools`（claude 第三方端点补 WebSearch，复用既有判定逻辑/常量）。
- [ ] **Step 4:** PASS。
- [ ] **Step 5:** 提交 `feat(server): compile vendor (url+key+config) into provider env`。

### Task 1.5: 启动注入接线

**Files:**

- Modify: agent spawn 处（查 `createProviderEnv` 调用点：`packages/server/src/server/agent/provider-launch-config.ts` 周边 + `agent-manager.ts` 组装 launch 的位置；用 `rg "createProviderEnv\(" packages/server/src` 定位）
- Test: 相邻既有 launch/env 测试文件，新增一条 case

**Interfaces — Consumes:** `compileVendorEnv`（1.4）、`AgentSessionConfig.vendorId`（1.3）、`loadPersistedConfig().agents.vendors`（1.2）。

- [ ] **Step 1:** 失败测试：给定 config 有 vendor `vnd_1` 且 session `{provider:"claude", vendorId:"vnd_1", model:"glm-5.1"}`，断言传给子进程的 env 含 `ANTHROPIC_BASE_URL` = 该 vendor baseUrl；`vendorId` 缺省时 env 不含这些（行为同今天）。
- [ ] **Step 2:** 跑该测试 → FAIL。
- [ ] **Step 3:** 在组装 `createProviderEnv({ overlays })` 处：若 `config.vendorId` 命中 `agents.vendors[provider]`，调 `compileVendorEnv` 把结果 env 作为一个 overlay 传入；`disallowedTools` 并入既有 runtimeSettings 逻辑。codex 家族额外触发既有 `model_providers` TOML 注入（复用 docs/custom-providers.md 描述的现有路径，传 vendor 的 baseUrl/key/model）。
- [ ] **Step 4:** PASS。
- [ ] **Step 5:** 提交 `feat(server): launch agent through selected vendor`。

### Task 1.6: 能力门

**Files:** Modify daemon `server_info`/features 装配处（`rg "features" packages/server/src/server/bootstrap.ts` 或 server-info 组装点）。

- [ ] 加 `features.threeLayerVendors = true`，附 `// COMPAT(threeLayerVendors): added in v0.1.X` 注释。补一条断言 `server_info.features.threeLayerVendors === true` 的测试。提交 `feat(server): threeLayerVendors capability flag`。

---

## Phase 2 — 模型拉取 + cc-switch 同步（服务端 RPC）

可独立验收：RPC 能从一个 vendor 拉模型列表；能读 cc-switch.db 产出导入预览并应用。

### Task 2.1: vendor 拉模型

- **Files:** Create `packages/server/src/server/agent/vendor-models-fetcher.ts` + test；协议加 `providers.vendor.models.fetch.request/response`（`messages.ts`，参照既有 `*.request/response` 对）；handler 注册在既有 RPC 路由处（`rg "\.request\"" packages/server/src/server` 找注册模式）。
- **Interfaces — Produces:** `fetchVendorModels(vendor: Vendor): Promise<VendorModel[]>` —— `apiFormat:"openai"` → `GET {baseUrl}/v1/models` + `Authorization: Bearer`；`anthropic` → `GET {baseUrl}/v1/models` + `x-api-key`；解析出 `{id}[]`。失败抛带原因的 typed error，前端退回手填。
- **测试:** mock `fetch`（注入 fetch 依赖）覆盖 openai/anthropic/失败三态。
- TDD 5 步 + 提交 `feat(server): fetch vendor models via /v1/models`。

### Task 2.2: cc-switch.db 同步

- **Files:** Create `packages/server/src/server/integrations/cc-switch-import.ts` + test（含 fixture `.db`）；协议加 `providers.ccswitch.sync.request/response`（参数 `{ cli?: "claude"|"codex"; apply?: boolean; selectedIds?: string[] }`，返回 `{ items: { ccSwitchId, name, baseUrl, status: "new"|"update"|"same", model count }[] }`）；handler 注册。
- **Interfaces — Produces:** `readCcSwitchVendors(dbPath: string, cli): VendorCandidate[]`（用 `node:sqlite` 只读打开 `~/.cc-switch/cc-switch.db`，`SELECT ... FROM providers WHERE app_type=?`，从 `settings_config` JSON 抽 baseUrl/apiKey、`configJson=settings_config`、`source.id=providers.id`、模型种子从 `ANTHROPIC_*_MODEL` 去重）；`diffAgainstExisting(candidates, existingVendors): items[]`（按 `source.id` 关联：new/update/same，不覆盖本地改动、不删非 cc-switch 项）；apply 时写 `agents.vendors`（走 `savePersistedConfig`）。
- **测试:** 用一个最小 fixture `cc-switch.db`（建表 + 插 2 行）只读读取 → 断言映射 + diff 计数；apply 幂等（重复同步不重复加）。
- TDD 5 步 + 提交 `feat(server): one-click cc-switch sync (read-only)`。

---

## Phase 3 — 配置界面（app）

可独立验收：设置 › 提供方 子页能管理 vendor + 模型 + 同步，全部经 RPC/patchConfig 落到 daemon（真机连真 host 验证）。MVVM：界面读 view-model/store，不内联业务。

### Task 3.1: ProvidersSection 重做（层1 仅 Claude+Codex + vendor 列表）

- **Files:** Modify `packages/app/src/screens/settings/providers-section.tsx`；新增 `packages/app/src/providers/use-vendors.ts`（view-model：从 daemon config 读 `agents.vendors`，暴露 CRUD = `patchConfig`）。
- **设计:** 还原 `providers-final.html`（左 Claude Code/Codex 固定两项；右 vendor 卡片 + 直连默认 + 「＋新增供应商」+「⟳一键同步」）。
- **Interfaces — Consumes:** 既有 `useDaemonConfig().patchConfig`（写 `agents.vendors`）、Task 2 的 RPC。
- 验收：真机连 7070 dev host（参考记忆 `nexus-verify-real-host`：先用 mock provider 造真数据），截图核对设计。提交 `feat(app): providers settings — vendors under Claude/Codex`。

### Task 3.2: vendor 编辑弹窗

- **Files:** Create `packages/app/src/providers/vendor-edit-modal.tsx` + JSON 编辑子组件。
- **设计:** 还原 `vendor-edit-v3.html`：名称/备注/官网/key(👁)/请求地址 · 高级(API格式↓·认证字段↓·默认兜底) · 配置JSON(快捷开关 + 行号编辑器 + 写入/编辑通用配置 + 格式化) · 模型多选(⤓获取模型列表[Task 2.1] + 勾选 exposedModelIds + ＋手动添加 + 设默认)。便捷字段 ↔ `configJson` 双向同步。
- 保存 = `patchConfig({...vendors})`。提交 `feat(app): vendor edit modal (config JSON + model multiselect)`。

### Task 3.3: cc-switch 同步预览弹窗

- **Files:** Create `packages/app/src/providers/ccswitch-sync-modal.tsx`。
- **设计:** 还原 `sync-preview.html`：按 CLI 分 tab、new/update 区分、勾选、「导入所选」→ `providers.ccswitch.sync`(apply)。提交 `feat(app): cc-switch sync preview modal`。

---

## Phase 4 — 对话选择器（app · model-driven）

可独立验收：对话框下方独立一行的级联选择器，切 vendor/model 生效到下一条消息；提供方锁定；对话框功能按钮随所选模型能力变化。

### Task 4.1: 选择 view-model + draft 接线

- **Files:** Create `packages/app/src/providers/use-conversation-model-selection.ts`（view-model：当前 `(provider 锁定, vendorId, modelId)`，来源 = active agent/draft）；Modify `packages/app/src/screens/workspace/workspace-draft-agent-config.ts`（`buildWorkspaceDraftAgentConfig` 加 `vendorId` 透传到 `AgentSessionConfig`）。
- 测试：draft → config 含 vendorId/model；切 vendor 时 model 候选刷新成该 vendor 的 `exposedModelIds`。提交 `feat(app): conversation vendor+model selection view-model`。

### Task 4.2: B 级联选择器（放对话框下方）

- **Files:** Create `packages/app/src/providers/conversation-model-picker.tsx`；Modify composer 容器把它挂到输入框**下方独立一行**（非工具行）。
- **设计:** 还原 `usage-below.html`：胶囊 `🔒{CLI}·{vendor}·{model} ▾` → 级联(①提供方锁顶 → ②中转站 `›` → ③该 vendor exposed 模型子菜单) + 「⚙管理供应商…」跳设置。提供方禁用切换。提交 `feat(app): cascade vendor/model picker below composer`。

### Task 4.3: model-driven 功能按钮

- **Files:** Create `packages/app/src/providers/model-capabilities.ts`（纯函数：`(provider, vendor, model) → { webSearch, thinking, attachments, ... }`）；Modify composer 工具行按该能力显示/隐藏按钮。
- 测试：纯函数 case（不同 model → 不同能力集）。提交 `feat(app): model-driven composer capability buttons`。

---

## Self-Review（覆盖检查）

- spec §4 数据模型 → Task 1.1/1.2 ✓；§4.3 vendorId → 1.3 ✓；§5 启动落地 → 1.4/1.5 ✓；§6 模型来源 → 2.1 + 3.2(手动/多选) ✓；§7 cc-switch 同步 → 2.2 + 3.3 ✓；§8.1 配置界面 → 3.1/3.2 ✓；§8.2 对话选择器 → 4.1/4.2 ✓ + 功能按钮 model-driven → 4.3 ✓；§9 MVVM → 各 app 任务用 view-model；§10 能力门 → 1.6 ✓。
- 待执行时细化（just-in-time）：Phase 2/3/4 的每任务 bite-sized 子步骤与 RN 具体代码，在进入该任务时按既有组件补全（设计已在 mockup 锁定）。
- 已知 spec §12 开放点：角色映射收进 JSON（不做槽位表）；旧会话无 vendorId 按直连；测速/多端点延后；Codex `/models` 端点实现时定。

## 附：Helm 改名遗留（独立于本功能）

`packages/server/src/server/persisted-config.ts:305` `DEFAULT_PERSISTED_CONFIG.daemon.listen` 仍是 `127.0.0.1:6767`——packaged Helm 首次写 config 会落 6767。建议改 `7070`（dev 不受影响）。单独一个 commit 修。
