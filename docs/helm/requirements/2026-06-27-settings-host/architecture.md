# 架构 · Helm 设置 · 主机段（Settings · Host）

> 日期：2026-06-27 · 状态：草拟（待闸-2）· 关联：[requirement.md](./requirement.md) · [ui.html](./ui.html)
> 写 **HOW 的边界**，不写逐行实现（实现交 helm-developer）。遵循 [standards.md](../../standards.md)。
> **本期定性**：只建「主机段 UI 交互 + 主机配置协议」，**绝不接对话 / Agent 运行时联动**。所有 ui.html 橙虚线「对话接入·暂缓」角标 = 本文 §4 deferred 表逐项对应的 well-defined seam。

---

## 0. 边界总纲（最重要 · 董事长硬约束）

一句话切口：**本期把「中转站 / 模型 / 提供方启停 / relay / 当前·默认标记」的配置真相源完整建好——落盘、读回、按主机隔离、可单测；它被对话流『消费』的那一段接线全部不接。**

为什么这么切（落到代码证据）：被否的 `naughty-hyena` 分支同时做了 vendor 配置 **和** 运行时消费（`packages/server/src/server/agent/vendor-env.ts` 把 vendor 编译进子进程 env、`vendor-launch-resolver.ts` 在 agent 启动时解析、`packages/app/src/providers/conversation-model-picker.tsx`(967 行) 接 composer），死因正是「注入没接通真实 send 路径 + 级联没接 gate」。本期把**配置层**与**消费层**物理切开，配置层在隔离下完整建好、可评审、可单测，绕开上一版的死法。消费层留清晰 seam（§4），由后续对话项目接回。

---

## 1. 模块划分

按「协议层 / 服务层 / 客户端模型层 / 客户端 UI 层」四段切；每个新增模块单一职责，path 即名。**绝大部分是复用 + 扩展，新增集中在 vendor（中转站）配置这一条没人建过的链路。**

### 1.1 协议层（`packages/protocol/src`）
- **`provider-config.ts`（扩展，非重写）**：在现有 `ProviderOverrideSchema` 上**附加** vendor 子结构（§3.1）。这是本期协议的核心落点——把「中转站」从现在混在 `env` 里的隐式两层半，提成 `agents.providers.<id>` 下的一等实体。
- **`messages.ts`（扩展）**：① 给 `MutableDaemonProviderConfigSchema` 加 `vendors` 字段（让 GUI 改动经既有 `set_daemon_config` 落盘）；② 新增 4 个点号命名空间 RPC（§3.2：`host.config.read/write`、`host.vendor.diagnose`、`host.vendor.discover_models`，cc-switch 见 §4 可暂缓）；③ `server_info.features.*` 加能力位（§3.3）。

### 1.2 服务层（`packages/server/src/server`）
- **`persisted-config.ts`（复用，零改或微改）**：host config.json 的真相源已是 `PersistedConfigSchema` + 原子写 `savePersistedConfig`。vendor 经 `ProviderOverrideSchema` 自动随 `agents.providers` 落盘读回——**不另起存储**。
- **`host-config-file`（新增 · 单一职责 = cfg1 逃生舱的原始读写）**：服务 `host.config.read/write`：读 = 返回 config.json **原始文本** + revision（mtimeMs/size）；写 = 收原始文本 + expectedRevision，先 `PersistedConfigSchema` 校验、再原子写、再触发热读广播。**完全对标既有 `read/write_project_config` 的 revision + stale + 判别式 ok 联合**（§5 复用）。
- **`agent/vendor-models-fetcher`（新增 · 单一职责 = L3「拉取列表」）**：从某 vendor 的 base_url 拉模型清单。**纯配置期能力，不在 send 路径**。带 codepilot 纪律：AbortController 防竞态、`AbortSignal.timeout`、空集合不伪造、不探套餐型、endpoint 脱敏。`naughty-hyena` 已有同名文件可作参照（学其纪律，按本期 schema 重接）。
- **`agent/vendor-diagnose`（新增 · 单一职责 = 测速 / 测 key）**：对 vendor base_url + 各 endpoint 发探测，返回延迟 / 健康 / 401。
- **⚠️ 明确不建（deferred seam，§4）**：`vendor-env.ts`（vendor→env 编译）、`vendor-launch-resolver.ts`（启动期解析）、以及 `codex-app-server-agent.ts:2860 buildCodexCustomProviderConfig` / `claude/agent.ts` 对 vendor 的消费——本期**一行不接**。

### 1.3 客户端模型层（`packages/app/src`，store / selector / 纯函数）
- **`host-runtime`（复用）**：host 选择器、按主机隔离、连接态、`useHosts/useHostRuntimeSnapshot/useHostMutations` 已是主机级真相源。vendor 配置挂这台主机的 config 下，**隔离天然由它保证**（config.json 本就 per-host）。
- **`hooks/use-daemon-config`（复用 + 扩展）**：既有 `get/set_daemon_config` 封装即「GUI 即时落盘」通道；vendor CRUD = 给它的 patch 带上 `providers.<id>.vendors` 子树，**不另开写路径**。
- **`providers/vendor-cascade-model`（新增 · 纯逻辑，单一职责 = 三级级联状态机 + vendor 派生）**：selector 把 `PersistedConfig.agents.providers` + providers 快照派生成 L1/L2/L3 视图模型；reducer 管级联导航（drill path / 面包屑 / 切 host·切 section 栈重置）；纯函数管「当前 / 默认 / 放出」标记转移（§2）。**判据：不渲染即可测。**
- **`providers/vendor-draft-model`（新增 · 纯逻辑）**：L3 编辑缓冲（base_url/key/高级项的 draft + 校验 + dirty + 乐观落盘 + 写失败回滚）。参照 `naughty-hyena/use-vendor-draft.ts` 的形态，按本期 schema 重接。

### 1.4 客户端 UI 层（`packages/app/src/screens/settings`、`packages/app/src/providers`）
- **设置外壳 + host 选择器（复用）**：`app/settings/[section].tsx` + `host-page.tsx` 已是 master-detail + host 选择器；本期**换肤 + 接 vendor 级联**，不重写外壳。
- **B1 主机 + 守护进程卡（复用 + 换肤 + 补双 Modal）**：`host-page.tsx` 已接 `useDaemonStatus`/`LocalDaemonSection`/`startDesktopDaemon`/`stopDesktopDaemon`/`useDesktopSettings`/`PairDeviceModal`。守护卡的「日志 Modal / 完整状态 Modal」是小增量（§5）。
- **B2 提供方三级（扩展 `providers-section.tsx` + 新增 L2/L3 页）**：L1 复用 `providers-section`；L2/L3 vendor 详情为新增页（**只渲染 + dispatch**，逻辑全在 §1.3 模型层）。
- **B3 用量（复用 + 换肤，近乎零逻辑改）**：`provider-usage/*`（`list/card/balance-bar/window-bar/use-provider-usage/settings-section`）+ `provider.usage.list` RPC + `providerUsageList` 能力门**已整套存在**——本期只换肤 + 接进外壳。
- **B4 config.json 编辑器（新增组件）**：app 现无 Monaco/CodeMirror 类原始代码编辑器（`project-settings-screen` 是表单、`settings-textarea` 只是多行框）→ cfg1 需新建一个「JSON 编辑器」组件（行号 / 高亮 / 校验 / 格式化 / 查找），接 §1.2 `host.config.read/write`。桌面 only（§5 平台门）。

---

## 2. 模型与 UI 分离（状态归属）

铁律：**状态 / 派生 / 转移 / 路由进 store·纯函数·selector；组件只渲染 model 派生态 + dispatch action。判据：不渲染即可测。**

### 2.1 进 store / 纯函数 / selector（逻辑层）
| 归属 | 内容 | 测试方式 |
| --- | --- | --- |
| **selector（派生，不持副本）** | `PersistedConfig.agents.providers` + providers 快照 → L1 列表（提供方 + CLI 已装/未装 + 模型数 + enabled + 当前 vendor 名）/ L2（基础信息 + vendor 列表）/ L3（base_url/key/放出模型/默认）视图模型；daemon 状态 → 守护卡（运行中/PID/版本 + **版本不匹配派生**：app 版本 ≠ `daemon.get_status.version`）；usage 复用 `use-provider-usage` selector | 纯函数输入固定 config → 断言派生 |
| **reducer（级联导航状态机）** | drill path `{ level: "L1"\|"L2"\|"L3"; providerId?; vendorId? }`；进 L2/L3、面包屑返回、**切 host / 切 section → 栈重置回 L1**；Esc 同面包屑 | 状态机迁移表单测（§6 必测） |
| **纯函数（标记转移）** | `setCurrentVendor`（一个 provider 下唯一 current）/ `setDefaultModel`（一个 vendor 下唯一 default）/ `toggleExposedModel`（取消放出时若是 default 则清空/改派）/ `setProviderEnabled` | 输入旧 config → 输出新 config，断言不变量 |
| **纯函数（草稿 + 校验）** | vendor draft：base_url 协议校验、key 非空、JSON 高级项 parse、dirty 判定、乐观落盘后写失败回滚 | 不渲染断言 |
| **纯函数（config.json 校验）** | cfg1 文本 → `JSON.parse` + `PersistedConfigSchema.safeParse` → 有效/无效 + 错误定位 | 喂样本文本断言 badge |

### 2.2 UI 只做（渲染层）
- 按 reducer 的 drill path 渲染当前级联层；按 selector 渲染列表 / 卡片 / 状态徽章 / 守护卡 / 用量条。
- dispatch：进/退级联、CRUD（→ 调 §1.3 通道）、测速/测key/拉取列表（→ §3.2 RPC）、保存/格式化/恢复 cfg1。
- **组件内零业务逻辑**：无「哪个是 current」的计算、无版本比较、无校验分支——全读 selector。**两个真相源 = bug**：UI 不持有 vendor 列表副本，一律从 config selector 派生。

---

## 3. 配置协议（本期建 ②）

### 3.1 Zod schema —— 中转站提成一等实体（`packages/protocol/src/provider-config.ts`）

**决策：vendor 挂 `agents.providers.<id>.vendors[]`，不照抄 `naughty-hyena` 的顶层 `VendorsByCli{claude,codex}`。** 理由：① 新设计是 5 内置 + ACP 目录新增，每个 provider 都能挂 vendor，顶层只给 claude/codex 两键太窄；② 挂 provider 下天然随 `agents.providers` 走 config.json 落盘读回（cfg1 同源）+ 按主机隔离，零额外存储；③ 与 ui.html「中转站挂某提供方下」「删除提供方连带其 vendor」一致。

附加（**全部 `.optional()`，新增即兼容**）：

```
ProviderVendorSchema = {
  id: string,                 // 稳定 id
  label: string,
  baseUrl: string,            // 允许 "" 草稿态
  apiKey?: string,            // 主机本地加密存储（落盘脱敏由服务层负责）
  apiFormat: "anthropic" | "openai",   // 协议分发，非品牌名分发（借 codepilot 教训）
  authStyle?: "anthropic-auth-token" | "anthropic-api-key" | "openai-api-key",
  models?: { id: string, label?: string, source?: "fetched"|"manual"|"cc-switch" }[],  // 发现缓存
  exposedModelIds?: string[],          // 放出到对话选型（本期写，不被消费）
  defaultModelId?: string,             // 默认模型标记（本期写，不被消费）
  modelsFetchedAt?: string,
  source?: "official" | "manual" | "cc-switch",   // 来源（enable_source 保护用）
  order?: number,
  enabled?: boolean,
  advanced?: {                         // ui.html「高级折叠」：超时/重试/headers/限额/倍率/extra
    timeoutSec?: number, maxRetries?: number,
    headers?: Record<string,string>,
    dailyLimitUsd?: number, monthlyLimitUsd?: number, multiplier?: number,
    extra?: Record<string, unknown>,
  },
}

ProviderOverrideSchema += {
  vendors?: ProviderVendorSchema[],
  currentVendorId?: string,    // 「当前」标记 —— 本期持久化 + 设置内回显，NOT 被 composer 消费
}
```

**Back-compat 三铁律照办**：新字段一律 `.optional()`；不翻 optional→required、不删字段、不收窄类型。旧 config 无 vendors → 解析为 undefined，正常。**注意 Zod 默认 strip 未知键**：因此在不支持 vendor 的旧 daemon 上，vendor 会在 load+save 时被静默丢——这正是要靠能力门（§3.3）挡住 vendor 编辑、显「更新主机」的原因（不写降级路径）。

### 3.2 RPC —— 点号命名空间（遵 `docs/rpc-namespacing.md`，`.request` 配 `.response`）

**先复用、再新增；vendor CRUD 不新开 RPC。**

| 用途 | RPC | 复用/新增 | 说明 |
| --- | --- | --- | --- |
| L1 提供方列表 | `get_providers_snapshot` / `providers_snapshot_update` | 复用 | `ProviderSnapshotEntry`（status/enabled/models/label）已覆盖 L1 |
| GUI vendor CRUD / 启停 / 当前·默认 | `set_daemon_config`（既有）+ `daemon_config_changed` 广播 | 复用 + 扩展 payload | `MutableDaemonProviderConfigSchema` 加 `vendors`（additive）；**单一结构化写路径** + 广播驱动「GUI↔JSON 双向反映」 |
| B3 用量 | `provider.usage.list` | 复用 | `ProviderUsage`(windows/balances/details) + `providerUsageList` 门已存在 |
| 守护卡状态 / 配对 / 重启 | `daemon.get_status` / `daemon.get_pairing_offer` / `restart_server_request` | 复用 | 守护卡字段（pid/version/relay/providers）+ 配对 url/qr 现成 |
| **cfg1 整份 config.json 原始读写** | **`host.config.read` / `host.config.write`（新增）** | 新增 | read→原始文本 + revision；write→文本 + expectedRevision，服务端 `PersistedConfigSchema` 校验后原子写；判别式 `ok` 联合：`ok:true{text,revision}` / `ok:false{error: stale\|invalid\|write_failed}`。**对标 `read/write_project_config`** |
| **L3 vendor 测速 / 测 key** | **`host.vendor.diagnose`（新增）** | 新增 | 入参 vendor 子集（baseUrl/key/endpoints）→ 出参延迟/健康/401；不落盘、纯探测 |
| **L3「拉取列表」模型发现** | **`host.vendor.discover_models`（新增）** | 新增 | 从 base_url 拉模型；codepilot 纪律（abort/timeout/不伪造/脱敏）；配置期能力、**非 send 路径** |
| cc-switch 同步 | `host.vendor.import_ccswitch` | **可暂缓（§4）** | 只读导入源；缺则按钮显「需更新主机」能力门 |

> 既有 flat 名（`set_daemon_config` 等）按 CLAUDE.md「存量 flat 名逐步迁移、别新增 flat 名」——**扩展既有 payload 不算新增 RPC**；**新增的一律 dotted**。

### 3.3 能力门（`server_info.features.*`）+ COMPAT 清理标记

新增能力位（与既有 `providerUsageList`/`daemonStatusRpc` 同模式），客户端检测到则跑功能、否则显「更新主机」（无降级、无 fallback 散落）：

```
// COMPAT(hostProviderVendors): added in v0.1.X, drop the gate when floor >= v0.1.X.
hostProviderVendors?: boolean        // 中转站三级 CRUD（缺 → vendor UI 显「更新主机」）
// COMPAT(hostConfigFile): added in v0.1.X, drop the gate when floor >= v0.1.X.
hostConfigFile?: boolean             // cfg1 整份 config.json 读写
// COMPAT(vendorDiagnostics): added in v0.1.X, drop the gate when floor >= v0.1.X.
vendorDiagnostics?: boolean          // 测速 / 测 key / 拉取列表
```

「删除内置提供方」「agent CLI 一键安装/更新」「cc-switch 同步」缺底层能力时，统一走能力门弹层（ui.html mp1-ctx/mp5 已设计「需新主机能力」诚实门控，不假装能删/能装）——本期**只建门控 UI + 标 deferred**，不假装实现。

---

## 4. in-scope vs deferred 边界表（逐项对应 ui.html 橙虚线角标）

| # | 能力 | 本期 | 落点 / seam |
| --- | --- | --- | --- |
| 1 | 中转站 vendor schema（base_url/key/放出模型/默认/当前/高级）落盘读回 | **本期建** | §3.1 |
| 2 | 三级级联导航 + L1/L2/L3 UI（含全交互态） | **本期建** | §1.4 / §2 |
| 3 | vendor CRUD / 提供方启停 / 新增（目录）/ 删除（目录真实） | **本期建** | `set_daemon_config` 扩展 |
| 4 | 「设为当前 vendor」「设为默认模型」「放出模型」**写配置 + 设置内回显** | **本期建** | `currentVendorId`/`defaultModelId`/`exposedModelIds` 持久化 |
| 5 | L3 测速 / 测 key / 拉取模型列表 | **本期建** | §3.2 `host.vendor.diagnose` / `discover_models` |
| 6 | B1 守护进程卡（状态/PID/版本/警告/开停/保活/日志/完整状态双 Modal） | **本期建·真实** | 复用 desktop daemon infra；**不打暂缓** |
| 7 | relay 远程访问开关 / 配对 / 重启服务落盘读回 | **本期建** | 复用 daemon/pairing infra |
| 8 | B3 用量（余额/已用/额度条 + 目标态缺口 + 门控） | **本期建** | 复用 `provider-usage/*` |
| 9 | cfg1 整份 config.json 编辑（GUI↔JSON 双向反映） | **本期建** | §3.2 `host.config.read/write` |
| — | — | — | — |
| D1 | 「当前 vendor / 默认模型 / 放出模型」**驱动 home composer 发起对话** | **❌ deferred** | seam：选择已落 `currentVendorId` 等，**不接** `vendor-env.ts`/launch-resolver/`buildCodexCustomProviderConfig` 消费 |
| D2 | vendor → 子进程 env / Codex TOML 注入（真实生效） | **❌ deferred** | seam：`codex-app-server-agent.ts:2860`、`claude/agent.ts`——本期不碰 |
| D3 | composer「管理中转站…」深链**回写** / 跨模块联动 | **❌ deferred** | 深链入口本期可在（导航到 L2/L3），**回写联动不接** |
| D4 | 切 host 时 composer 中转站/模型跟随切换 | **❌ deferred** | 设置内切 host 重载配置 = 本期建；composer 跟随 = 不接 |
| D5 | 删除内置提供方 / agent CLI 一键装真实执行 / cc-switch 同步 | **❌ 能力门占位** | §3.3：建门控 UI、标「需新主机能力」，不假装 |

> 控件呈现规则（§5 of requirement）：D1–D4 涉及的控件（设为当前/设默认/深链入口）**照常出现、可操作、选择持久化回显**，仅不驱动对话流——ui.html 以橙虚线「接入暂缓」角标如实标注，不灰置（闸-1 开放项 6 待董事长确认是否加「将在更新后生效」提示）。

---

## 5. 复用点 / 禁止重造清单

**复用（直接接，禁止另起一套）：**
- 设置外壳 + host 选择器：`packages/app/src/app/settings/[section].tsx`、`screens/settings/host-page.tsx`、`utils/host-routes`。
- host 隔离 / 选择 / 连接态：`runtime/host-runtime`（`useHosts/useHostRuntimeSnapshot/useHostMutations/useHostRuntimeClient`）。
- 守护进程卡 / 状态 / 开停 / 保活：`desktop/components/desktop-updates-section`(`LocalDaemonSection`)、`desktop/hooks/use-daemon-status`、`desktop/daemon/desktop-daemon`、`desktop/settings/desktop-settings`（manageBuiltInDaemon / keepRunningAfterQuit）。
- 配对：`desktop/components/pair-device-modal` + `daemon.get_pairing_offer`。
- daemon 配置读写（GUI 即时落盘通道）：`hooks/use-daemon-config` + `get/set_daemon_config` + `daemon_config_changed`。
- **B3 用量整套**：`provider-usage/{list,card,balance-bar,window-bar,use-provider-usage,settings-section,format,tone,copy,types}` + `provider.usage.list` + `providerUsageList` 门。
- B2 L1 外壳：`screens/settings/providers-section.tsx`（扩展，不重写）。
- host config 真相源 + 原子写：`server/persisted-config.ts`（`PersistedConfigSchema`/`savePersistedConfig`）。
- cfg1 读写**契约样板**：`read/write_project_config` 的 revision + `stale_*` + 判别式 ok 联合（`messages.ts` + `utils/project-config-form.ts`）——`host.config.*` 照此形。
- provider override 持久化：`protocol/provider-config.ts`（在其上附加，非新建文件）。

**禁止重造（已有，别再写一遍）：**
- 别新建 host 选择器 / 设置外壳 / master-detail。
- 别新建用量卡 / 余额条 / 窗口条——`provider-usage/*` 已全。
- 别新建第二套 host 配置存储——一律 `agents.providers.<id>` 下 + `persisted-config`。
- 别新建第二条 GUI 写路径——结构化改动一律走 `set_daemon_config` patch（+ 广播）。
- 别照抄 `naughty-hyena` 的 `vendor-env.ts`/`vendor-launch-resolver.ts`/`conversation-model-picker.tsx`/`use-conversation-model-selection.ts`——那是被否的**消费层**，本期 deferred（§4）。
- 别引入 CodePilot 的 SQLite/`@ai-sdk/*` Native runtime / 40+ VENDOR_PRESETS 全量目录（codepilot-study §D）——借语义不借存储。

**新增（确有具体收益才建）：**
- `protocol`：vendor schema 附加（§3.1）、3 新 RPC + 3 能力位（§3.2/3.3）。
- `server`：`host-config-file`（cfg1 读写）、`agent/vendor-models-fetcher`（拉取列表）、`agent/vendor-diagnose`（测速/测key）。
- `app` 模型层：`providers/vendor-cascade-model`（级联状态机 + 派生）、`providers/vendor-draft-model`（L3 草稿）。
- `app` UI 层：L2/L3 vendor 页、cfg1「JSON 编辑器」组件（命名禁 `-utils/-helpers/-manager`）。

---

## 6. 测试策略（强制单测 · 不渲染即可测）

**必测纯函数 / store 逻辑（这是模型与 UI 分离的回报）：**
1. **schema 解析 back-compat（必测）**：① 旧 config（无 vendors）→ 解析成功、provider 不丢；② 新 config（带 vendors/currentVendorId）→ round-trip（parse→serialize→parse）字段不丢、不被收窄；③ vendor `apiFormat` 等枚举边界；④ 不支持 vendor 的旧 daemon 路径上 strip 行为 + 能力门挡住（断言 UI 走「更新主机」而非静默丢）。
2. **三级级联状态机（必测）**：L1→L2(providerId)→L3(vendorId)→面包屑逐级返回；**切 host / 切 section → 栈重置回 L1**；Esc 等价面包屑；非法 drill（providerId 不存在）落空态不崩。
3. **标记转移不变量（必测）**：`setCurrentVendor` 后该 provider 下唯一 current；`setDefaultModel` 后该 vendor 下唯一 default；`toggleExposedModel` 取消放出的是 default 时 default 被清/改派；删除 provider 连带其 vendors + 标记。
4. **vendor draft + 校验（必测）**：base_url 协议校验、key 非空、JSON 高级项非法挂起、写失败回滚到落盘值。
5. **cfg1 校验（必测）**：合法 JSON+schema→「有效」、保存可用；语法错→错误定位 + 保存禁用；schema 越界（strict 顶层未知键）→ 无效。
6. **RPC 往返（必测）**：`host.config.read/write` 的 revision 乐观并发（`stale` 命中）、`invalid` 拒写、`write_failed` 反馈；`host.vendor.diagnose` 401/超时/健康三态；`host.vendor.discover_models` 空集合不伪造、abort 旧请求不覆盖新结果。

**端到端验证点（对应 requirement §8 本期可验，不靠截图/text-grep）：**
- 在主机 A 配 vendor → 切主机 B 不串 → 切回 A 如实读回（按主机隔离）。
- GUI 改 vendor → cfg1 即时反映；cfg1 改 `agents.providers` → GUI 即时反映（同一真相源 + 广播）。
- 守护卡：版本不匹配显警告；开停/保活切换中 loading 禁用；日志/完整状态双 Modal 含加载/失败态。
- **deferred 反向验证**：选「设为当前/默认」**只**改配置 + 设置内回显，**确认未触达** composer / send 路径（本期不验对话接入，但要验「没接」——防 naughty-hyena 式半接通）。

---

## 7. 协议 / 平台门 + 风险取舍

### 7.1 协议 / 平台门
- **协议**：动（§3）。全程后向兼容（optional + 不收窄）+ 能力门 `server_info.features.*` + `COMPAT(name)` 注释标清理点（§3.3）。vendor CRUD 不新增 RPC（扩展既有 payload）；新增的一律 dotted。
- **平台门**：本期桌面 only。守护进程卡 = `getIsElectron()` + 仅当所选主机=本机桌面时显示（远程主机不适用，不堆死胡同）。cfg1「JSON 编辑器」走 web/electron；native 留 `.native` 占位（后续紧凑态统一适配）。平台判断只从 `@/constants/platform`，大分支用 `.web/.electron/.native` 文件而非运行时 `if`。

### 7.2 风险与取舍
1. **cfg1 编辑器选型（中风险）**：app 现无原始代码编辑器。Monaco 重、不跑 RN native；本期桌面 only 故 web/electron 可接受。架构只定**契约边界**（`host.config.read/write` + 客户端校验），具体 Monaco/CodeMirror/轻量高亮交开发裁量；**取舍**：宁可桌面先用成熟组件，也不自造编辑器内核（零复杂度预算）。
2. **单一写路径 vs 即时落盘粒度（已决）**：GUI 结构化改动走 `set_daemon_config` patch（既有 + 广播），cfg1 走 `host.config.write` 原始文本；二者都落同一 config.json、都触发热读广播 → 双向反映。**取舍**：不为「每控件一个细粒度 RPC」增协议面，复用既有结构化通道。
3. **cfg1 原始文本保真（低-中风险）**：`savePersistedConfig` 写的是 `PersistedConfigSchema.parse` 后的规范化结果（strip 未知顶层键 + 重排）。逃生舱期望尽量保真用户文本——**取舍**：服务端校验通过后**优先落用户原文本**（而非 re-serialize），未知顶层键由 strict schema 显式报错而非静默吞（实现细节交开发，架构标此约束）。
4. **deferred seam 接回成本（已规划）**：本期持久化的 `currentVendorId`/`defaultModelId`/`exposedModelIds` 字段形态即为消费层预留契约；后续对话项目接 `vendor-env`/launch-resolver 时**直接读这些字段**，无需用户重设（闸-1 开放项 3 待确认「接回是否直接生效」）。**取舍**：本期多写几个「暂时无人消费」的字段，换取接回时零返工——比 naughty-hyena 边建配置边接 composer 的耦合死法成本低得多。
5. **vendor 模型发现的网络纪律（中风险）**：`discover_models` 打 vendor base_url，易踩 codepilot 记录的坑（套餐型探出 SKU 白名单挤掉真模型、慢上游、旧响应覆盖新）。**取舍**：逐条抄 codepilot 纪律为 server helper + 单测，不盲探、不伪造空集合、abort 防竞态。
6. **术语 / 深色 / token 调和（依赖闸-1）**：中转站 vs relay vs 守护进程的术语区分、是否纳深色、GitHub-light token 单一源——均为 requirement §7 开放项，架构不擅自定，按闸-1 结论落 schema/UI 文案。
