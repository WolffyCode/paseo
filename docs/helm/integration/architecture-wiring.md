# 集成架构接线 · Helm Whole-Product Integration Wiring

> 日期：2026-06-26 · 分支：`integration`（基于 develop） · 状态：草拟（待闸 2） · 产出：架构师
> 配套：[whole-product-integration.md](./whole-product-integration.md)（PM 接缝清单）+ [product-flow.md](./product-flow.md)（产品流）
> 写 **HOW 的边界**，不写逐行实现。遵循 [standards.md](../standards.md)：模型/UI 分离、refactor-don't-patch、单一真相源、无 dead gate、协议后向兼容 + 能力门 + `COMPAT()`。
> 本文扎根 `integration` worktree 真实代码（= develop 现状）+ `_rescue/home-shell`、`_rescue/settings-ui` 两模块交叉勘察。

---

## 0. 集成全景与真相源总账

### 0.1 一句话结论

整套产品**不需要新建第二套外壳**，也**不需要新建 active-host / settings 两个独立 store**。四条接缝里：

- **seam #2 host**、**seam #3 onboarding** 在 develop 已是单真相源范式，集成 = **裁掉 home-shell 的回退、复用 develop 的真相源**；
- **seam #4 双真相源** 的 4 个候选里 3 个已有归属、只需「不要引入第二套」；
- **唯一真正的新增能力 = seam #1 中转站(Vendor)**：它是一份**新增的 daemon 配置结构**，经**已存在的 `useDaemonConfig(serverId)` React-Query 通道**读写，settings L3 与 composer 同读同写一份。

### 0.2 ★最重要的勘察修正：settings 不是「零代码」，是「重构既有」

骨架记的「settings 仅设计稿、零代码」**与真实代码不符**。develop **已落地一套 host 级 settings**，集成与 settings 实现都必须以「重构既有」为前提，禁止当成空白新建（否则必然制造双真相源）：

| 既有真实落点（develop） | 内容 | 对 settings redesign 的意义 |
| --- | --- | --- |
| `app/settings/hosts/[serverId]/[hostSection].tsx` + `screens/settings-screen.tsx`（`SettingsView` 联合类型） | settings 外壳 + master-detail + host 段路由 | **复用外壳**；redesign = 收敛 section，不是重画 |
| `utils/host-routes.ts`：`buildSettingsHostSectionRoute(serverId, section)`、`HOST_SECTION_SLUGS`、`normalizeHostSectionSlug` | settings 深链路由构造器 + slug 归一 + legacy 映射 | **复用路由契约**；「管理中转站…」深链直接用它 |
| `screens/settings/host-page.tsx` | host 段页面，已用 `useDaemonConfig` + `useHosts` + `useHostRuntimeSnapshot` + `useProviderUsage` | **复用**；host 选择器已是 `useHosts()` 派生，无独立 store |
| `screens/settings/providers-section.tsx` | provider L1：启停（`patchConfig({providers:{[id]:{enabled}}})`）、从目录新增 ACP（`patchConfig(buildAcpProviderConfigPatch)`）、CLI 检测 | **复用**；vendor(L3) 是其下新增层 |
| `provider-usage/*`（`use-provider-usage.ts`、`card/list/balance-bar/settings-section`） | 用量 tab + 能力门 `serverInfo.features.providerUsageList` | **复用整块**；用量能力门**已存在、非缺口** |
| `hooks/use-daemon-config.ts` | `useDaemonConfig(serverId) → {config, isLoading, patchConfig}`，React-Query keyed by serverId + `daemon_config_changed` 推送 | **vendor 真相源的承载通道**，见 §1 |

> 既有 host 段有 7 个 slug（`connections/agents/workspaces/providers/usage/terminals/host`）。settings redesign 的「主机/模型与提供方/用量」3 tab 直接映射到 `host`(或 `connections`)/`providers`/`usage`；`agents/workspaces/terminals` 按 requirement「删除 tab」**真删**（refactor-don't-patch，不留死路由），其能力主壳/​config.json 已覆盖。

### 0.3 真相源总账（四接缝 × 归属 × 通道）

| 真相源 | 住哪（权威） | 客户端通道（缓存/订阅） | 写入口 | 读出口 |
| --- | --- | --- | --- | --- |
| **host 注册表 / 连接态** | `HostRuntimeStore`（`runtime/host-runtime.ts`，单例 + serverId 分片） | `useHosts` / `useHostRuntimeSnapshot` / `useHostRuntimeConnectionStatus` | `useHostMutations` | 同左 hooks |
| **active host** | **路由 pathname**（无独立 store） | `utils/active-host.ts::resolveActiveHost` + `parseServerIdFromPathname` | `router.navigate(buildHostRootRoute(serverId))` | `resolveActiveHost` |
| **provider 启停/列表** | daemon config `agents.providers[id].enabled` | 写：`useDaemonConfig.patchConfig`；读：`use-providers-snapshot`（daemon 重算的快照） | `providers-section.tsx` → `patchConfig` | composer = `provider-selection.ts::buildSelectableProviderSelectorProviders(snapshot)` |
| **★中转站(vendor) base_url+key+放出模型+当前** | daemon config `agents.providers[id].vendors`（**新增 schema**） | `useDaemonConfig(serverId)`（已存在，keyed by serverId） | settings L3 + composer 切换 → `patchConfig` | `vendor-selection` 纯选择器（**新建**，见 §1.3） |
| **onboarding 连接触发 + 路由 gate** | `host-runtime-bootstrap.ts` 纯函数 + `onboarding-store.hasSeenWelcome` + `host-runtime.connectLocalCandidate`（延后探测） | `resolveStartupRoute` / `connectLocalOnBoot` | `_layout.tsx` `connectLocalOnBoot` | `index.tsx` / `welcome.tsx` 经 `resolveStartupRoute` |
| **左栏宽度** | home-shell R1 已决 per-workspace（从 `panel-store.sidebarWidth` 迁移） | per-workspace store（home-shell P3 建） | 拖拽手柄 | per-workspace selector |
| **模型默认 / 收藏（UI 记忆）** | `create-agent-preferences`（客户端持久化，**降级为 UI 记忆**） | `use-form-preferences` | composer | composer（仅作 last-used / favorites 覆盖，**非权威默认**） |

---

## 1. ★中转站(Vendor) 单一真相源 ↔ Composer（seam #1）

### 1.1 真相源住哪：判定

候选三选一 → **判定 B/C 合一**：

- **A. 客户端 zustand store** —— ✗ 否决。base_url+key 是**主机级机密 + 须持久化 + 须跨 settings/composer/切 host 一致**；放客户端 store 必然与 daemon 配置分叉，造第二真相源，违反单一真相源铁律。
- **B. daemon `agents.providers` 配置（经 daemon config RPC 读写）** —— ✓ 采纳为**权威真相源**。
- **C. React Query keyed by serverId** —— 这不是「另一个候选」，而是 **B 的客户端缓存/订阅层**：`hooks/use-daemon-config.ts` 的 `useDaemonConfig(serverId)` **正是** React-Query keyed by serverId、`staleTime: Infinity`、并订阅 `daemon_config_changed` 推送回填。

**结论：vendor 真相源 = daemon `agents.providers[providerId].vendors`（新增 schema）；客户端唯一访问通道 = 既有 `useDaemonConfig(serverId)`；不新建 zustand store、不新增独立 vendor RPC（复用既有 `getDaemonConfig`/`patchDaemonConfig`）。**

> 现状缺口（诚实标注）：`provider-config.ts::ProviderOverrideSchema`（持久化）字段为 `extends/label/command/env/params/models/additionalModels/enabled/order`，**无 base_url/api_key/vendors 结构**；`messages.ts::MutableDaemonProviderConfigSchema`（客户端可改面）只有 `{enabled?, additionalModels?}`+passthrough。今天的「单一供应商路由」只能靠 `env`（`ANTHROPIC_BASE_URL`/`ANTHROPIC_API_KEY`）塞——**多中转站 + 放出模型 + 当前中转站是纯新增结构**，须扩 schema（见 §1.5）。

### 1.2 数据 shape（命名契约，不 inline）

附在 `agents.providers[providerId]` 之下（持久化 `ProviderOverrideSchema` 与可改面 `MutableDaemonProviderConfigSchema` **同步新增**，否则 `applyMutableProviderConfigToOverrides` 的 `.strip()` 会把 vendors 丢掉）：

```ts
// 中转站（API 供应商）—— provider 之下的第二层
interface ProviderVendor {
  id: string;                  // 稳定主键（增删改用）
  label: string;               // 显示名（官方直连 / 第三方转发…）
  baseUrl: string;             // API base_url
  apiKey: string;              // key（密码态；落盘/脱敏策略见 §7 能力门 & 风险）
  releasedModelIds: string[];  // 放出的模型（L3 多选）
  defaultModelId?: string;     // 该中转站默认模型（L3 设默认）
  // 高级（折叠/入 config.json）：spendLimit / multiplier / failover —— 本层不结构化
}

// provider 级中转站配置
interface ProviderVendorConfig {
  vendors: ProviderVendor[];
  currentVendorId?: string;    // 「当前」中转站 = composer 默认 vendor
}
```

`MutableDaemonConfig.providers[id]` 增 `vendors`/`currentVendorId`；服务端把 `currentVendorId` 对应 vendor 的 `baseUrl/apiKey` 解析进 agent 启动 env（今天 `env` 的位置）。

### 1.3 模型/UI 分离：vendor-selection 纯选择器层（新建，有具体收益）

**禁止** composer / settings UI 直接 reach into `config.providers[id].vendors` 原始 shape（UI 耦合配置结构 → 不可测）。新建一个**纯选择器模块** `provider-selection/vendor-selection.ts`（或 `vendor-selection/`），镜像既有 `provider-selection.ts` 的形态：

```ts
// 输入：daemon config 的 provider 切片 + provider 快照；输出：级联可选项 —— 纯函数、不渲染即可测
function selectVendorOptions(input: {
  providerConfig: ProviderVendorConfig | undefined;
  providerLabel: string;
}): VendorSelectorEntry[];               // 中转站下拉行

function resolveCurrentVendor(config: ProviderVendorConfig | undefined): ProviderVendor | null;

function resolveEffectiveVendorModelId(input: {  // composer 有效默认模型（vendor 维）
  vendor: ProviderVendor | null;
  sessionPick?: string;                 // 本次会话显式选择
  uiMemoryModelId?: string;             // create-agent-preferences 的 last-used（UI 记忆，弱优先）
}): string;
```

**收益具体**：被 **settings L3** 与 **composer 胶囊** 两个消费方共用、纯函数、单测覆盖、与 `provider-selection.ts` 同构 —— 抽象当下即兑现，非投机。

- **UI 只做**：settings L3 渲染 vendor 列表 + 表单，dispatch `patchConfig`；composer 胶囊渲染三段（提供方🔒·中转站·模型）、下拉两级菜单，dispatch「切当前中转站」。
- **逻辑全在**：`vendor-selection` 纯选择器 + `useDaemonConfig` 缓存。

### 1.4 settings L3（写）↔ composer（读 + 切下条）同读同写一份

```
settings L3 表单改 base_url/key/放出模型/设默认/设当前
   └─ patchConfig({ providers: { [id]: { vendors, currentVendorId } } })   // useDaemonConfig
         └─ daemon 落盘 agents.providers + 推 daemon_config_changed
               └─ 所有 useDaemonConfig(serverId) 订阅者（含 composer）缓存回填
                     └─ vendor-selection 重算 → composer 胶囊「当前中转站/默认模型」即时跟随

composer 胶囊「切下条中转站」
   └─ patchConfig({ providers: { [id]: { currentVendorId: next } } })       // 同一通道，同一份
         └─ （回到上面同一条数据流）
```

- **composer 删 `vendor:null` 占位接真源**：home-shell `CascadeSelection{provider, vendor:null, model}`（架构 §6②）的 `vendor` 段，由 `resolveCurrentVendor(config.providers[provider])` 填充；vendor 段下拉数据 = `selectVendorOptions(...)`。home-shell 已就位「胶囊三段 + drill-down 两级菜单」结构（`combined-model-selector.tsx`），**只接数据源，不重画**。
- **「切下条」语义**：写 `currentVendorId`（host 级默认），与「当前中转站 = composer 默认 vendor」一致；**本轮不做 per-draft 临时覆盖**（避免第二份会话态；如需，后续在 composer draft store 加 ephemeral override，不污染 daemon 真相源）。

### 1.5 「管理中转站…」深链路由契约

composer 级联「管理中转站…」→ 复用既有路由构造器，**不新增路由层**：

```
router.navigate(buildSettingsHostSectionRoute(serverId, "providers")
                + 携带 provider + vendorId（query/param）)
```

- `serverId` = `resolveActiveHost` 当前主机；`section = "providers"`（既有 slug）；`provider` + `vendorId` 作为深链参数，settings 进入后定位 L2(provider) → L3(vendor)。
- settings 侧 `SettingsView` 已是 `{kind:"host", serverId, section}`；redesign 时把 L2/L3 的定位参数纳入该 view 的 `section` 子态或 query（**扩既有 view，不另起导航 store**）。

### 1.6 能力门（诚实标注：缺口 vs 已有）

| 能力 | 状态 | 门控位置 |
| --- | --- | --- |
| **vendor 结构化读写（vendors/currentVendorId）** | **缺口（新增 daemon 能力）** | 扩 `ProviderOverrideSchema` + `MutableDaemonProviderConfigSchema`；服务端解析 currentVendor→env；新增 `server_info.features.providerVendors` + `// COMPAT(providerVendors): added in v0.1.X, drop gate when floor >= v0.1.X` |
| **从目录新增 ACP 提供方** | **已有**（`providers-section.tsx` `patchConfig(buildAcpProviderConfigPatch)`） | 无需新能力 |
| **provider 启停 / additionalModels** | **已有**（`MutableDaemonProviderConfigSchema.enabled`） | 无需新能力 |
| **删除内置 provider（可恢复）** | **缺口** | 新增 daemon 能力 + `features.builtinProviderRemoval`；UI 给入口但门控「更新主机后可删」，**不假装能删**；目录新增删除=真实（`patchConfig` 移除）无需新能力 |
| **一键装/更新 agent CLI** | **缺口** | 新增 daemon 能力 + `features.agentCliInstall`；缺则按钮回落「安装指引」外链（真实兜底）。Helm CLI 安装+指引今天真实可用 |
| **providerUsageList（用量）** | **已有**（`serverInfo.features.providerUsageList`，`use-provider-usage.ts` 已门控） | 无需新能力 |
| **config.json 全量 raw 读写（JSON 编辑器）** | **缺口/待定** | 既有 `getDaemonConfig`/`patchDaemonConfig` = `MutableDaemonConfig`（curated 投影 + passthrough），**非 1:1 文件镜像**；要么 JSON 编辑器作用域=MutableDaemonConfig，要么新增 `features.rawConfigFile` + raw 读写。见 §7 + §10 待定 |

---

## 2. host 单一真相源（seam #2）

### 2.1 判定：已统一，集成 = 复用 + 禁止新 store

- **host 注册表/连接态** = `HostRuntimeStore`（单例，serverId 分片，hooks `useHosts/useHostRuntimeSnapshot/useHostRuntimeConnectionStatus/useHostMutations/useHostRegistryStatus`）。
- **active host = 路由派生**：`resolveActiveHost({hosts, pathname})` + `parseServerIdFromPathname` —— 无独立 store，已是单真相源范式。

**结论：settings host 选择器、主壳 `HostSwitcherPill`、用量、composer 全部读同一 `HostRuntimeStore` + 用同一导航切换（`router.navigate(buildHostRootRoute(serverId))`）。严禁新建 active-host store。** settings 已合规（`host-page.tsx::useHostProfile` = `useHosts().find(...)` 派生，非新 store）。

### 2.2 切 host 数据流（serverId 贯穿）

```
触发：主壳 HostSwitcherPill 选行  ──┐
      settings host 选择器选行   ──┤→ router.navigate(buildHostRootRoute(nextServerId))
                                    │
   ┌────────────────────────────────┘
   ▼ 路由 pathname 变 → serverId 变（单一真相源切换）
   ├─ 主壳：app/h/[serverId]/_layout 子树重挂 → WorkspaceDeck 按 serverId 重载（对话树/中区/右面板）
   ├─ settings：SettingsView.serverId 变 → host/providers/usage 三 tab 右详情按 serverId 重载
   ├─ composer：useDaemonConfig(serverId) + use-providers-snapshot(serverId) 重取 → vendor/provider/模型跟随
   └─ 用量：useProviderUsage(serverId) 重取
```

- 所有按 serverId 键的查询（`daemonConfigQueryKey`、`providersSnapshotQueryKey`、usage）天然随 serverId 失效重取 —— **serverId 是贯穿全产品的唯一切换轴**。
- **复用**：home-shell `HostSwitcherPill`（已 `router.navigate(buildHostRootRoute)`）+ `host-switcher-model.ts::selectHostConnectionTone`（5 态→3 态纯函数）。settings host 选择器**复用 `selectHostConnectionTone`**，不再造在线态映射。

---

## 3. onboarding → 主壳 → 设置 连贯（seam #3 · 解真实代码冲突）

### 3.1 冲突定性：develop 是「已修复版」，home-shell 是「回退版」

这不是导航问题，是**两分支在同组文件上反向分叉**。逐文件勘察：

| 文件 | develop（integration worktree）= 修复版 | home-shell = 回退版 |
| --- | --- | --- |
| `runtime/host-runtime.ts` | `runBoot()` 只 `loadFromStorage()`；**`connectLocalCandidate()` 延后探测**（welcome gate 先跑） | 把探测并回 `runBoot()` = **急切 auto-connect**，删 `connectLocalCandidate` |
| `app/host-runtime-bootstrap.ts`（436 行纯函数策略） | `resolveStartupRoute`(index/host/welcome) + `connectLocalOnBoot({hasSeenWelcome})` + `resolveOnboardingPhase` 等 | **-214 行**，挖掉 `connectLocalOnBoot`/`resolveOnboardingPhase`/hasSeenWelcome 接线 |
| `app/_layout.tsx` | `connectLocalOnBoot({hasSeenWelcome, connectLocal})` 延后连接 | 删 `connectLocalOnBoot`、`connectLocal`→`retry`、boot 即急切连 |
| `app/index.tsx` | 传 `hasSeenWelcome` 给 `resolveStartupRoute` | 删 `hasSeenWelcome` 接线 |
| onboarding UI | `screens/onboarding/*` 多阶段（welcome/picker/connecting/error）+ `onboarding-store` | **删整个 `screens/onboarding/*` + `onboarding-store`**，新增单屏 `components/welcome-screen.tsx`（自带 `useEffect` 见 host online 即 `router.replace`） |

home-shell 的「急切 auto-connect + welcome-screen 见 online 即跳」**正是历史教训 [Helm onboarding 验收=FAIL 欢迎页被跳过] 的同款根因**。develop 之后采纳了「延后连接（Q 方案）+ `resolveStartupRoute` gate」修复。

### 3.2 裁决：连接触发 + 路由 gate 的单一真相源 = develop

**铁律级裁决（不可商量）：**

1. **连接触发真相源 = develop 的 `host-runtime.connectLocalCandidate`（延后）+ `_layout.tsx::connectLocalOnBoot({hasSeenWelcome})`。** home-shell 对 `host-runtime.ts`、`_layout.tsx`、`host-runtime-bootstrap.ts` 的回退**全部丢弃**，不得带入 develop。
2. **路由 gate 真相源 = develop 的 `resolveStartupRoute` + `onboarding-store.hasSeenWelcome`。** `index.tsx`/`welcome.tsx` 经它派生落点。home-shell 删 `onboarding-store`、删 `hasSeenWelcome` 接线的改动**丢弃**。
3. `/welcome` 路由两边已**收敛同名**（develop `app/welcome.tsx` + home-shell `app/welcome.tsx`，`WELCOME_ROUTE="/welcome"`）—— gate 不变，只换里面挂什么 UI。

### 3.3 唯一留给产品/UI 的决定：welcome 屏用哪套（不阻塞架构）

`/welcome` 渲染什么是**产品/UI 选择**，两套都能挂在 develop 的 gate 后：

- **选项 W1（develop 现状）**：多阶段 `OnboardingScreen`（`resolveOnboardingPhase` 驱动 welcome/picker/connecting/error）。
- **选项 W2（home-shell 新 UI）**：单屏 `WelcomeScreen`（连接方式 inline + 左下「设置」入口 + 版本）。

**架构约束（无论选哪个）：**

- 桌面 managed-daemon 的「启动中/失败重试」态由 `StartupSplashScreen` + `resolveStartupBlocker` 承担（与 `/welcome` 解耦，`index.tsx` 已 `<StartupSplashScreen bootstrapState={isDesktop?...}>`）—— W2 若中选，**须确认桌面 daemon 恢复态仍由 splash 覆盖**，不要把它丢进单屏。
- W2 若中选：**删除其内部 `useEffect(anyOnlineServerId → router.replace)`**（落点归 `resolveReadyWelcomeStartupRoute` 独占，避免两处算落点）；**保留 `onboarding-store.hasSeenWelcome`**；按 refactor-don't-patch **同批删除** `resolveOnboardingPhase`/`resolveOnboardingLocalConnectState`/`screens/onboarding/*` 及其单测（被 W2 取代即成 dead code，不留）。
- **「设置」入口**：W2 已有 `router.push("/settings")` → 落 `buildSettingsRoute()`（既有）→ 默认当前主机「主机」tab；与 §1.5 深链共用一套路由。

### 3.4 端到端连贯链（无断点、无重复连接）

```
首次启动：boot 只载注册表（不连）→ resolveStartupRoute(!hasSeenWelcome) → /welcome
  → 用户配对/连本机成功 → 标 hasSeenWelcome → connectLocalOnBoot 触发 connectLocalCandidate
  → host online → resolveReadyWelcomeStartupRoute 跳 buildHostRootRoute(serverId)
  → 主壳空态 → 左下「设置」→ buildSettingsRoute → 当前主机「主机」tab
  → 「模型与提供方」配通中转站（§1）→ 返回主壳 composer 跟随
回访启动：boot 载注册表 → hasSeenWelcome=true → connectLocalOnBoot 自愈连本机 → 直落上次工作区/host root
```

连接逻辑**只一处**（`connectLocalOnBoot`→`connectLocalCandidate`），welcome-screen 不自连、不自算落点。

---

## 4. 消除双真相源（seam #4 · 逐条定性 + 归并）

> 一律 refactor-don't-patch：归并即「废弃旧的 / 降级旧的」，不留 dead gate、不留半迁移。

### 4.1 模型默认值 —— daemon 权威，客户端降级为 UI 记忆

- **真相源 = daemon**：vendor `defaultModelId` + `currentVendorId`（§1）是 composer 的**权威默认**。
- **`create-agent-preferences.providerPreferences[provider].model` 降级**为「last-used UI 记忆」(弱优先覆盖)；**不再是竞争性默认**。`favoriteModels` 是**独立 UI 功能**（快速访问），保留。
- **composer 有效模型解析顺序**（`resolveEffectiveVendorModelId`，单一处）：本会话显式选择 > create-agent-preferences last-used（UI 记忆）> daemon vendor.defaultModelId > 快照 `isDefault` > 首个。**只有一个「权威默认」= daemon**，UI 记忆只是覆盖提示。
- **执行**：vendor 落地后，审查 `mergeCreateAgentSelectionPreferences` 的 `model` 写入语义 —— 若 vendor.defaultModelId 完全覆盖其职责，则 `providerPreferences.model` 收敛为 last-used hint 或删除（择一，不两存）。

### 4.2 onboarding 连接逻辑 —— 见 §3.2，单一处 `connectLocalOnBoot`

onboarding-store / welcome-screen / host-runtime **不各连各的**：连接只在 `_layout.tsx::connectLocalOnBoot → host-runtime.connectLocalCandidate`。welcome-screen 不持连接逻辑。home-shell 回退丢弃。

### 4.3 provider 启停/列表 —— 写 daemon config，读 provider 快照，单源

- **写** = settings L1 `patchConfig({providers:{[id]:{enabled}}})`（`useDaemonConfig`）。
- **读** = `use-providers-snapshot`（daemon 依配置重算的 `ProviderSnapshotEntry[]`）；composer 经 `provider-selection.ts::buildSelectableProviderSelectorProviders(snapshot)` 取启用列表。
- **单源**：daemon config 是写端、provider 快照是读端投影，daemon 重算保证一致。settings 与 composer **同读快照**，**禁止**任一方维护第二份 provider 列表。`stores/provider-settings-store.ts` 只是 modal visible 开关（**非数据源**，确认）—— settings redesign 改用 `buildSettingsHostSectionRoute` 深链页后，该开关 store 是否还需要见 §10。

### 4.4 左栏宽度 —— per-workspace 单套，settings 不得引入第二套

- **真相源 = home-shell R1 per-workspace 宽度 store**（从 `panel-store.sidebarWidth` 全局迁移，home-shell P3 前置）。
- **settings 外壳的 master-detail 左导航宽度**是**settings 自身布局态**，与主壳左栏宽度**无关**：要么固定，要么 settings 局部记忆，**严禁复用/分叉 `panel-store.sidebarWidth`** 或主壳 per-workspace 宽度 store。
- **迁移纪律**：home-shell 把 `panel-store.sidebarWidth` 迁 per-workspace 时，**同批删除**全局 `sidebarWidth` 的写入点（`setSidebarWidth`），不留两处宽度态。`clampSidebarWidth`/`MIN/MAX_SIDEBAR_WIDTH` 约束**复用**。

---

## 5. ★集成实施计划（依赖顺序 · 衔接 · 验证 · 合并次序）

### 5.1 依赖顺序：vendor schema/通道是 settings 与 composer 的共同前置

```
[I0 前置·协议] vendor schema 扩展（ProviderOverrideSchema + MutableDaemonProviderConfigSchema
              + 服务端 currentVendor→env 解析 + features.providerVendors + COMPAT）
        │  ← settings L3 与 composer vendor 段的共同硬前置；必须最先落
        ├──────────────┬──────────────────────────┐
        ▼              ▼                          ▼
[I1] vendor-selection  [I2] settings 重构        [I3] composer 接 vendor
     纯选择器层          (3 tab 收敛 + L3 写 +      (填 CascadeSelection.vendor
     (§1.3，单测先行)    JSON 编辑器 + 删旧 tab)     + 切当前 + 管理中转站深链)
        │              （依赖 I0+I1）             （依赖 I0+I1，与 I2 并行）
        ▼
   I2、I3 同读同写 useDaemonConfig + vendor-selection（同一份）
```

**可并行**：I2(settings) 与 I3(composer) 在 I0+I1 完成后**可并行**（同读 `useDaemonConfig`+`vendor-selection`，互不阻塞）。host(seam#2) 与 onboarding(seam#3) **不依赖 I0**，可独立先行。

### 5.2 与 home-shell P2+ / settings 实现的衔接点

| 阶段 | 谁建 | 依赖 | 衔接说明 |
| --- | --- | --- | --- |
| **I0 vendor schema** | settings 团队（属其 L3 核心） | 无 | 协议改动须最先，home-shell P9 与 settings L3 都等它 |
| **I1 vendor-selection 纯层** | settings 团队 | I0 | 与 `provider-selection.ts` 同构；home-shell composer 复用 |
| **home-shell P9 单胶囊三层级联** | home-shell | I0+I1 | home-shell §6② 的 `vendor:null` 占位 → I1 落地后**填真源**；P9 在 I1 后才接真数据（之前保持 null 占位，不写半成品） |
| **home-shell P7 composer 彩色 token** | home-shell | 无（独立） | 与 vendor 无关，可任意时序 |
| **settings L1/L2/用量** | settings 团队 | 无（复用既有 providers-section/provider-usage） | 可在 I0 前先重构（收敛 tab、复用既有） |
| **settings L3 中转站** | settings 团队 | I0+I1 | vendor 真正落地处 |
| **JSON 编辑器** | settings 团队 | 看 §10 raw-config 决议 | 作用域待定后再实现 |

### 5.3 每步验证点

| 步 | typecheck/lint | 单测 | 端到端 |
| --- | --- | --- | --- |
| I0 schema | 协议包 `npm run build:client` 后跨包 typecheck | schema 解析 + 后向兼容（旧 client 解析新 daemon 配置 / 反向） | daemon 落盘 vendors 不丢、currentVendor→env 生效 |
| I1 vendor-selection | ✓ | **必须**：`selectVendorOptions`/`resolveCurrentVendor`/`resolveEffectiveVendorModelId` 纯函数单测（不渲染即测） | — |
| I2 settings L3 | ✓ | L3 写→patchConfig 形状测 | settings L3 改 base_url/key/放模型/设当前 → 落盘 → `daemon_config_changed` 回填 |
| I3 composer | ✓ | CascadeSelection 派生测 | settings L3 改 → composer 胶囊「当前中转站/默认模型」即时跟随；composer 切当前 → settings 反映；「管理中转站…」深链回 L2/L3 |
| seam#2 host | ✓ | `selectHostConnectionTone` 已测；切 host 派生测 | 切 host → 主壳+settings 三 tab+用量+composer 全按 serverId 重载 |
| seam#3 onboarding | ✓ | `resolveStartupRoute`/`connectLocalOnBoot` 已有单测（`host-runtime-bootstrap.test.ts`）须保持绿 | 首启 welcome 不被跳过 + 回访自愈 + 设置入口链路 |

> 测试纪律：只跑改动文件 `npx vitest run <file> --bail=1`，禁跑全量；别人报绿的不重跑。

### 5.4 合并次序建议（onboarding 冲突在哪一步解）

```
1) home-shell 先 rebase 到最新 develop
   └─ ★onboarding 冲突在此步解：丢弃 home-shell 对 host-runtime.ts / _layout.tsx /
      host-runtime-bootstrap.ts / index.tsx 的回退，保留 develop 的 gate；
      welcome UI 二选一（W1/W2，§3.3）；W2 则同批删 resolveOnboardingPhase + screens/onboarding/*。
2) home-shell（P1 已 push + 解冲突后）先合 develop
   └─ 主壳骨架先就位；此时 composer vendor 段保持 null 占位（I0 未落，不写半成品）。
3) settings 落 I0(schema)+I1(vendor-selection)+I2(settings 3tab/L3) → 合 develop
   └─ vendor 真相源 + settings L3 就位。
4) composer 接 vendor（I3 / home-shell P9）→ 填 CascadeSelection.vendor + 删 null 占位 → 合 develop
   └─ 跨模块真相源闭环：settings L3 ↔ composer 同读同写。
5) develop 守护 PM 回归：四接缝端到端（切 host 全跟随 / 中转站跨模块 / onboarding 不跳 / 无双真相源）。
```

**为何 home-shell 先合**：它是主壳骨架（左栏/中区/右面板/host 胶囊/composer 容器），settings 深链与 composer vendor 段都挂在它上；且 onboarding 冲突必须在 home-shell 入 develop 这步一次解清，越往后越难。**为何 vendor schema 紧随**：它是 settings L3 与 composer P9 的共同前置，越早落，两条线越早并行。

---

## 6. 复用点 / 禁止重造清单

**复用（禁止重造）：**

| 既有资产 | 路径 | 集成用途 |
| --- | --- | --- |
| host 真相源 + hooks | `runtime/host-runtime.ts` | 全产品 host 唯一源；settings/composer/用量/主壳同读 |
| active host 派生 | `utils/active-host.ts::resolveActiveHost` | 切 host 唯一轴；**禁建 active-host store** |
| host 在线态 5→3 映射 | `components/sidebar/host-switcher-model.ts::selectHostConnectionTone`(home-shell) | settings host 选择器复用 |
| daemon config 通道 | `hooks/use-daemon-config.ts` | vendor + provider 启停的读写通道；**禁建 vendor zustand store** |
| provider 快照 | `hooks/use-providers-snapshot.ts` + `provider-selection/provider-selection.ts` | provider 列表唯一读端 |
| settings 外壳/路由 | `screens/settings-screen.tsx`、`utils/host-routes.ts`(`buildSettingsHostSectionRoute` 等) | settings redesign 复用，深链复用 |
| provider L1/启停/ACP 新增 | `screens/settings/providers-section.tsx` | L1 复用 |
| 用量 + 能力门 | `provider-usage/*`（含 `features.providerUsageList`） | 用量 tab 整块复用 |
| onboarding gate 纯函数 | `app/host-runtime-bootstrap.ts`、`stores/onboarding-store.ts` | 连接/路由真相源，**禁止 home-shell 回退覆盖** |
| 左栏宽约束 | `panel-store::clampSidebarWidth/MIN/MAX_SIDEBAR_WIDTH` | per-workspace 迁移复用约束 |
| composer 全家 | `composer/*`、`combined-model-selector.tsx`（drill-down 两级菜单） | vendor 段只接数据，**禁重画胶囊** |

**禁止重造清单（硬）：** active-host store ✗ ｜ vendor zustand store ✗ ｜ 第二份 provider 列表 ✗ ｜ settings 自己的 host 在线态映射 ✗ ｜ 第二套左栏宽度态 ✗ ｜ welcome-screen 自带连接/落点逻辑 ✗ ｜ 新 settings 深链路由层（已有 `buildSettingsHostSectionRoute`）✗。

---

## 7. 协议 / 平台门 + 能力缺口清单

### 7.1 协议（后向兼容 + 能力门 + COMPAT）

- **vendor schema 扩展**（I0）：`ProviderOverrideSchema`/`MutableDaemonProviderConfigSchema` 新增 `vendors`/`currentVendorId` —— 新字段 `.optional()`、旧 client 解析新 daemon 配置不破、反向亦然（passthrough 已在）；能力门 `server_info.features.providerVendors` + `// COMPAT(providerVendors): added in v0.1.X, drop gate when floor >= v0.1.X`。
- **删除内置 provider** `features.builtinProviderRemoval`、**一键装 agent CLI** `features.agentCliInstall`：各自 COMPAT 注释 + 缺则门控回落（不假装能删 / 回落安装指引）。
- **JSON 编辑器 raw config**：若走新能力 → `features.rawConfigFile` + raw 读写 RPC（dotted 命名 `config.raw.read.request`/`.response`、`config.raw.write.request`/`.response`，遵循 rpc-namespacing）。否则作用域=`MutableDaemonConfig`（无新协议）。见 §10 待定。
- **既有 RPC 复用**：vendor 读写**不新增 RPC**，复用 `get_daemon_config`/`set_daemon_config`(patch) + `daemon_config_changed` 推送（schema 扩展即可）。

### 7.2 能力缺口清单（诚实标注：缺口 / 已有）

| # | 能力 | 缺口? | 兜底 |
| --- | --- | --- | --- |
| G1 | vendor 结构化 base_url+key+放模型+当前 | **缺口** | I0 新增；门控 `providerVendors` |
| G2 | 删除内置 provider（可恢复） | **缺口** | 门控；目录新增删除=真实 |
| G3 | 一键装/更新 agent CLI | **缺口** | 门控；回落安装指引外链（真实） |
| G4 | config.json 全量 raw 读写 | **缺口/待定** | 作用域=MutableDaemonConfig 或 G4 新能力（§10） |
| — | 从目录新增 ACP | 已有 | `buildAcpProviderConfigPatch` |
| — | provider 启停 / additionalModels | 已有 | `MutableDaemonProviderConfigSchema` |
| — | providerUsageList 用量 | 已有 | `features.providerUsageList` 已门控 |
| — | host 切换 / 注册表 / 连接态 | 已有 | host-runtime |
| — | onboarding gate / 延后连接 | 已有 | host-runtime-bootstrap |
| — | settings 深链路由 | 已有 | `buildSettingsHostSectionRoute` |

### 7.3 平台门

- 本集成 settings/composer/onboarding 均**桌面优先**（requirement 桌面 only）；hover-to-show 用 `isHovered || isNative || isCompact`。
- vendor / daemon config / host 切换是**跨平台数据流**，不需平台门；JSON 编辑器组件（Monaco/CodeMirror 类）是 web DOM 组件 → `.web`/`.electron` 文件扩展或 `isWeb` 门（桌面 only 时简单）。
- onboarding welcome：W2 已用 `isWeb`/`isNative` 分连接方式（direct/paste vs scan）。

---

## 8. 测试策略

**必须单测的纯函数 / store 逻辑（不渲染即可测）：**

- `vendor-selection`：`selectVendorOptions` / `resolveCurrentVendor` / `resolveEffectiveVendorModelId`（含 UI-记忆 vs daemon-默认 的优先级）。
- vendor schema：解析 + 后向兼容（旧↔新）+ `applyMutableProviderConfigToOverrides` 不丢 vendors。
- 模型默认归并（§4.1）：解析顺序唯一、无双默认。
- 既有须保持绿：`host-runtime-bootstrap.test.ts`（`resolveStartupRoute`/`connectLocalOnBoot`/`resolveOnboardingPhase`）、`provider-selection.test.ts`、`providers-snapshot-query.test.ts`、`active-host.test.ts`、`host-routes.test.ts`。

**端到端验证点（对应 requirement 验收）：**

1. settings L3 改中转站/设当前 → composer 中转站/模型跟随；composer 切当前 → settings 反映；「管理中转站…」深链回 L2/L3（seam#1）。
2. 切 host → 主壳树/中区/右面板 + settings 三 tab + 用量 + composer 全按 serverId 重载（seam#2）。
3. 首启 welcome 不被跳过 + 回访自愈直落 + 左下设置入口连贯（seam#3）。
4. 四类双真相源各只剩一处写、一处权威读（seam#4）。

---

## 9. 风险与取舍

| 风险 | 取舍 / 缓解 |
| --- | --- |
| **R1 onboarding 反向分叉合并** | home-shell rebase 时丢弃其回退、保 develop gate（§3.2）。取舍：home-shell 该模块改动**作废重来**，因 develop 是已验证修复版、不可被回退覆盖。这是合并最高风险点，置于合并第 1 步一次解清。 |
| **R2 vendor schema 是协议改动** | 新字段 optional + 能力门 + COMPAT；I0 最先落、独立验后向兼容。取舍：宁可多花一轮协议测，不让 settings/composer 各自塞 env 造私有结构。 |
| **R3 settings 被误当「零代码新建」** | §0.2 已纠：是重构既有 7-section host settings。取舍：redesign 必须删旧 tab（refactor-don't-patch），不在旧结构上叠加。 |
| **R4 JSON 编辑器作用域** | `MutableDaemonConfig`(curated) ≠ 真实 config.json 全量；要么缩作用域、要么新增 raw 能力。送 §10 定夺，**不擅自当 1:1 文件镜像实现**（会误导用户改了「全部」）。 |
| **R5 base_url/key 机密落盘/脱敏** | key 落 daemon config（主机本地），客户端 `useDaemonConfig` 缓存含明文 → 显示密码态、日志脱敏；是否在协议层 redact 读回（写后不回传明文）送 §10。 |
| **R6 模型默认双源残留** | §4.1 明确降级 create-agent-preferences.model，须同批清写入点，不留半迁移 dead 默认。 |
| **R7 composer vendor 段半成品** | I0/I1 未落前 home-shell 保持 `vendor:null` 占位（只 shape 不逻辑），落地后一次性接真源 + 删占位，禁 `vendor && ...` 永假分支。 |

---

## 10. 需董事长定夺的架构项

1. **★welcome 屏 UI 二选一**：W1 develop 多阶段 `OnboardingScreen` vs W2 home-shell 单屏 `WelcomeScreen`（§3.3）。架构不阻塞（都挂 develop gate），但选 W2 须同批删 `resolveOnboardingPhase`+`screens/onboarding/*`、确认桌面 daemon 恢复态仍由 splash 覆盖。建议 W2（更简、含设置入口），但须董事长拍 UI。
2. **★JSON 编辑器作用域**（G4）：作用域 = 既有 `MutableDaemonConfig`（无新协议、但非文件 1:1）vs 新增 `features.rawConfigFile` + raw 读写 RPC（真·全量 config.json）。决定后才实现 B4。
3. **★vendor key 脱敏/回传策略**（R5）：写后是否回传明文、客户端缓存/日志如何脱敏、是否协议层 redact。影响 §1.2 shape（`apiKey` 是否分 write-only）。
4. **删除内置 provider / 一键装 agent CLI 后端能力排期**（G2/G3）：本轮门控占位、回落兜底；新能力何时做、是否仅限本地主机。
5. **`stores/provider-settings-store.ts` 去留**：settings redesign 改 `buildSettingsHostSectionRoute` 深链页后，旧 provider-settings modal 开关 store + `combined-model-selector.tsx` 里 `useProviderSettingsStore().open` 调用是否整体废弃（refactor-don't-patch，倾向废弃改深链）。
6. **composer 切中转站语义**：写 host 级 `currentVendorId`（默认源，§1.4，倾向）vs per-draft 临时覆盖（需新会话态）。倾向前者保单一真相源。

---

## 附：勘察证据索引（真实文件 · 已逐个 Read）

- host 真相源：`runtime/host-runtime.ts`（L1303 Store / L1360 connectLocalCandidate / L2099+ hooks）、`utils/active-host.ts`
- onboarding gate：`app/host-runtime-bootstrap.ts`（436 行纯函数）、`app/index.tsx`、`app/welcome.tsx`、`app/_layout.tsx`（L354 connectLocal / L374 connectLocalOnBoot）、`stores/onboarding-store.ts`；home-shell 反向 diff（host-runtime.ts/_layout.tsx/host-runtime-bootstrap.ts/index.tsx + `components/welcome-screen.tsx`）
- vendor 后端：`protocol/src/provider-config.ts::ProviderOverrideSchema`（无 vendor）、`protocol/src/messages.ts`（`MutableDaemonProviderConfigSchema` L99 / `MutableDaemonConfigSchema` L132 / `server_info.features` L2296 / get·set·changed daemon config RPC）、`server/agent/provider-launch-config.ts`、`server/daemon-config-store.ts::applyMutableProviderConfigToOverrides`
- vendor 通道/读端：`hooks/use-daemon-config.ts`、`hooks/use-providers-snapshot.ts`、`provider-selection/provider-selection.ts`、`create-agent-preferences/preferences.ts`、`stores/provider-settings-store.ts`
- 既有 settings：`app/settings/hosts/[serverId]/[hostSection].tsx`、`screens/settings-screen.tsx`（`SettingsView`）、`screens/settings/host-page.tsx`、`screens/settings/providers-section.tsx`、`provider-usage/use-provider-usage.ts`、`utils/host-routes.ts`（`buildSettingsHostSectionRoute`/`HOST_SECTION_SLUGS`）
- home-shell 已实现：`components/sidebar/host-switcher-pill.tsx`、`host-switcher-model.ts`、设计 `docs/helm/requirements/2026-06-25-home-shell/architecture.md`（§6② CascadeSelection / §14 / R1）
- settings 设计：`docs/helm/requirements/2026-06-26-settings/requirement.md`（§B2 三级 / §跨模块依赖 / §7 / §8 能力门）
</content>
</invoke>
