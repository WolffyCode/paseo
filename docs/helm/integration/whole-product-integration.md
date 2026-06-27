# 整个产品串联架构 · Helm Whole-Product Integration

> 日期：2026-06-26 · 分支：`integration`（基于 develop） · 维护：项目经理(PM) · 上报：总监(main) → 董事长
> 目的：把 onboarding / home-shell 主壳 / settings 设置 三模块的**产品流 + 代码实现**串成端到端连贯整体，消除"设置这里好使、对话那里不好使"。
> 配套：本目录 [product-flow.md](./product-flow.md)（产品流程图/清单 · 产品经理产出） + [architecture-wiring.md](./architecture-wiring.md)（集成架构接线 · 架构师产出）。

---

## 0. 模块全景（现状·扎根真实代码）

| 模块 | 分支 / 状态 | 落地代码（真实路径） |
| --- | --- | --- |
| **onboarding** | 已合 develop | `packages/app/src/screens/onboarding/*`（welcome/method-picker/connecting/error）+ `stores/onboarding-store.ts` |
| **home-shell 主壳** | 分支 `home-shell`，P1 已 push（**未合 develop**） | 新建：`conversation-tree/{types,select,render}`、`components/sidebar/{host-switcher-pill,host-switcher-model,sidebar-window-chrome}`、`screens/workspace/{canvas-top-bar-chrome,canvas-top-bar-controls,right-panel-launcher}`、`stores/conversation-history-store`；**删除** `screens/onboarding/*` + `stores/onboarding-store`，**新增** `components/welcome-screen.tsx` |
| **settings 设置** | 分支 `settings-ui`，gate-1 已批（分支 delta **仅设计稿**；但 **develop 基线已有 host 级 settings 实体代码**） | develop 已有：`app/settings/hosts/[serverId]/*`、`screens/settings/{host-page,providers-section}.tsx`、`screens/settings/appearance/`、`provider-usage/`（用 `useDaemonConfig`+`useHosts`+`useProviderUsage`，`buildSettingsHostSectionRoute` 路由）。设计：`docs/helm/requirements/2026-06-26-settings/{requirement.md,ui.html}` |

> ⚠️ **架构师勘察修正(已 PM 核实)：** ① settings **不是零代码**——develop 已落地 host 级 settings(providers 启停/ACP 新增/用量能力门 `providerUsageList` 均已通)；settings 实现 = **重构既有**,否则必造双真相源。② onboarding 是**反向分叉**:develop 是**已修复版**(`connectLocalCandidate` 延后连接 + `resolveStartupRoute` gate + `hasSeenWelcome`)、home-shell 是**回退版**(急切 auto-connect + welcome-screen 见 online 即跳),后者正是历史"欢迎页被跳过"翻车同款根因。
>
> `integration` worktree 基于 develop——含 develop 全部实体代码,**不含** home-shell / settings-ui 分支的增量;本文以「develop 现状 + 两分支设计/已实现增量」交叉勘察为据。

---

## 1. 四条跨模块接缝（PM 勘察结论 · 扎根真实代码）

> 详细接线方案见 [architecture-wiring.md](./architecture-wiring.md)；详细产品流见 [product-flow.md](./product-flow.md)。本节是 PM 层的"接缝清单 + 真相源判定 + 能力缺口"。

### ① ★中转站(Vendor) 单一真相源 ↔ Composer 模型选择（董事长最强调）

**现状（真实代码）：**
- 现 model 真相源 = `provider-selection/provider-selection.ts`（`ProviderSelectorProvider{provider, modelSelection}`，模型来自 daemon `ProviderSnapshotEntry` / `AgentModelDefinition`，**按 provider 键，无 vendor 维**）+ `create-agent-preferences/preferences.ts`（`FormPreferences{provider, providerPreferences:Record<provider,{model}>, favoriteModels}`，客户端持久化的 per-provider 默认/收藏模型）。
- `combined-model-selector.tsx`（1009 行）= 现 provider→model 两级选择器；"设置 ⚙" 调 `useProviderSettingsStore().open({serverId,provider})` 打开 provider 设置 modal（`provider-settings-store.ts` 只是个 visible 开关，**非数据源**）。
- **中转站(vendor base_url+key) 层在 app 端完全不存在**（grep `vendor` 在 stores/components 零命中）。后端 `agents.providers`（`packages/server/src/server/persisted-config.ts` / `daemon-config-store.ts`）是其落点。
- home-shell 架构 §6② 已为此预留：`CascadeSelection{provider, vendor:null, model}`，**本轮 vendor 恒 null、只预留 shape**。

**结论(含架构师定方案)：** 中转站真相源是**唯一真正的新增**,但**不新建独立 store**——真相源 = daemon `agents.providers[id].vendors`(新增 schema)经**已存在的 `useDaemonConfig(serverId)` 通道**读写;另建一个 `vendor-selection` **纯选择器层**(镜像现有 `provider-selection.ts`),被 settings L3 与 composer 两个消费方共用。composer 填 home-shell 预留的 `CascadeSelection.vendor`(现 `vendor:null`)、删占位。"管理中转站…" 深链复用 `buildSettingsHostSectionRoute(serverId,"providers")` + provider/vendorId 参数。**能力门**:vendor 结构化读写需新 daemon 能力 `features.providerVendors` + `COMPAT()`(缺口 G1,见 §3)。→ 详 [architecture-wiring.md §1]。

### ② host 单一真相源（设置 ↔ 主壳 ↔ 用量，切 host 全跟随）

**现状（真实代码）：**
- host 真相源 = `runtime/host-runtime.ts`（`HostRuntimeStore` 按 serverId 管 `HostRuntimeController` + hooks `useHosts/useHostRuntimeSnapshot/useHostRuntimeConnectionStatus/useHostMutations/useHostRegistryStatus`）。
- **active host = 路由派生**：`utils/active-host.ts::resolveActiveHost` 从 pathname 解析 serverId（`parseServerIdFromPathname`）——**没有独立 active-host store**，已是单真相源范式。
- 切 host = 导航到 host root route → 路由子树重挂 → `WorkspaceDeck` 加载新 serverId 数据。home-shell `host-switcher-pill.tsx` + `host-switcher-model.ts` 已封装此读取与切换。

**结论：** host 真相源**已统一**。集成 = settings host 选择器**复用同一 host-runtime + 同一导航切换**，绝不另起 active-host store；切 host 时 settings 右详情 + 主壳树/中区/右面板 + 用量**全部按 serverId 重载**。→ 详 [architecture-wiring.md §2]。

### ③ onboarding → 主壳 → 设置 导航/状态连贯

**现状（真实代码 · ⚠️冲突）：**
- onboarding（develop）= `screens/onboarding/*` + `stores/onboarding-store.ts`。
- **home-shell 分支删了整个 `screens/onboarding/*` + `onboarding-store`，新增 `components/welcome-screen.tsx`（338 行）**，且改了 `host-runtime.ts`（welcome-gate 前不 auto-connect，对应 `connectLocalCandidate` 延后）。
- 这与历史教训"[Helm onboarding 验收=FAIL 欢迎页被跳过]"同源：home-shell 重做了 onboarding 落地路径。

**结论(产品+架构双方收敛)：** 这是**反向分叉**——develop 是已修复版、home-shell 是回退版(会复发"欢迎页被跳过")。裁决 = **保留 develop 的连接真相源 + 路由 gate**(`connectLocalOnBoot`→`connectLocalCandidate` + `resolveStartupRoute` + `onboarding-store.hasSeenWelcome`),**丢弃 home-shell 的回退**(同批删其 redirect-on-online + 急切 auto-connect)。**唯一留给产品/董事长的选择** = welcome 屏 UI 形态(develop 多阶段 `OnboardingScreen` vs home-shell 单屏 `WelcomeScreen`),两套都必须挂同一 gate。链路:onboarding 连接成功 →【唯一落点=主壳空态 s1】→ 左下"设置"入口 → settings(默认当前主机)→ Esc 回主壳,无断点、无重复连接。→ 详 [architecture-wiring.md §3] + [product-flow.md 流程3]。

### ④ 消除潜在双真相源

**PM 勘察出的候选双真相源（待架构逐条定性 + 给归并方案）：**
1. **模型默认值**：`create-agent-preferences`（客户端 per-provider 默认模型）↔ settings "设为当前中转站/模型"（写 daemon config）——**谁是真相源？** 倾向：vendor/模型默认归 daemon config 真相源，客户端 preferences 降级为 UI 记忆或废弃。
2. **onboarding 连接逻辑**：onboarding-store ↔ welcome-screen ↔ host-runtime `connectLocalCandidate`——三处不能各连各的。
3. **provider 启停/列表**：settings L1（启停 provider）↔ composer provider 列表（`provider-selection`）——同读 daemon provider 快照。
4. **左栏宽度**：home-shell R1 已决 per-workspace（从 panel-store 全局 `sidebarWidth` 迁移）——确保 settings 不引入第二套宽度态。

→ 逐条归并方案详 [architecture-wiring.md §4]。

---

## 2. 集成实施计划（架构师定 · 依赖顺序）

> 完整数据流图 / shape 契约 / 测试策略见 [architecture-wiring.md §5]。

**接缝依赖顺序（先接哪条）：**

| 步 | 内容 | 依赖 | 并行 |
| --- | --- | --- | --- |
| **I0** | **vendor schema 扩展**（daemon `agents.providers[].vendors` + `features.providerVendors` 门 + `COMPAT()`；协议改动**最先落**，测后向兼容 + `currentVendor→env` 映射） | — | 协议先行 |
| **I1** | `vendor-selection` 纯选择器层（镜像 `provider-selection.ts`，三纯函数，settings L3 + composer 共用） | I0 | — |
| **I2** | settings **重构** L3 中转站详情（base_url+key+测速+放出模型+设默认+设当前，写 daemon config） | I0+I1 | 与 I3 并行 |
| **I3** | composer 接 vendor（填 `CascadeSelection.vendor`、删 `vendor:null` 占位）= home-shell **P9 单胶囊三层级联** | I0+I1 | 与 I2 并行 |
| #2 host / #3 onboarding | **不依赖 I0**，可独立先行（host 已统一；onboarding = 丢回退保 develop gate） | — | ✅ 独立 |

**合并次序（谁先合 develop · onboarding 冲突在哪步解）：**
1. **home-shell 先 rebase develop** —— **onboarding 反向分叉冲突在这一步一次解清**（丢 home-shell 回退、保 develop gate、welcome 屏 UI 二选一）；composer 的 `vendor:null` 占位**保留不接**。
2. home-shell 合 develop（主壳骨架 + 已实现 P1 落地）。
3. settings 落 I0+I1+I2 合 develop（重构既有 host settings，新增 vendor L3）。
4. composer 接 vendor（I3 / P9）+ 删占位 合 develop。
5. 守护 PM（第 3 PM）regression 回归 develop 对 canonical。

**与 home-shell P2+ / settings 实现衔接点：** vendor 真相源（I0+I1）是 settings L3 与 composer P9 的**共同前置**——必须先落，否则两边各造一套 = 双真相源。host(#2)/onboarding(#3) 与 vendor 解耦,可在 vendor 之前并行推进。

**验证点：** I0 测协议后向兼容；I1 测三纯选择器；端到端 = 「settings L3 改 ↔ composer 跟随」「切 host 全跟随」「首启 welcome 不跳过」。**只跑改动文件 `npx vitest run <file> --bail=1`,禁全量。**

---

## 3. 需董事长定夺项（PM + 产品 + 架构汇总 · 送闸）

> 标 ★ = 最需拍板 / 阻塞集成。

| # | 定夺项 | 来源 | PM 倾向 |
| --- | --- | --- | --- |
| **★O1** | **onboarding 单一落地路径**：保留 develop 已修复 gate（连接真相源 + `resolveStartupRoute` + `hasSeenWelcome`），**丢弃 home-shell 回退**——产品/架构已收敛。**唯一留给董事长** = welcome 屏 UI 形态（develop 多阶段 `OnboardingScreen` vs home-shell 单屏 `WelcomeScreen`，两套都挂同一 gate）。 | 产品 O1 + 架构 #3/1 | **保 develop gate**；welcome UI 倾向单屏但须董事长拍 + 同批删旧 |
| **★O2** | **vendor schema 后端能力**（缺口 G1）：`agents.providers[].vendors` 结构化 base_url+key+放模型+当前 = 需新 daemon 能力 `features.providerVendors`，本轮做后端还是先门控占位？ | 架构 G1 | 本轮做（是 seam #1 前置，不做则 composer 跟随无真源） |
| **★O3** | **vendor key 脱敏/回传策略**：影响 shape `apiKey` 是否 write-only（密码态读不回） | 架构 #3 | write-only（安全优先） |
| **★O4** | **config.json(JSON 编辑器)作用域**：缩到 `MutableDaemonConfig` 子集 还是新增 `features.rawConfigFile` 全量 raw 读写？（缺口 G4） | 架构 #2/G4 | 待架构细化后定 |
| **O5** | **模型默认归属**：默认收敛到 daemon 权威后，客户端 `create-agent-preferences.model` 降级为 UI 记忆还是废弃？（favorites 保留） | 产品 O2 + 架构 #4① | 降级为 UI 记忆 |
| **O6** | **删除内置 provider / 一键装 agent CLI** 后端能力（缺口 G2/G3）排期：本轮做还是门控占位回落安装指引？ | 产品 O3 + 架构 #4 | 门控占位（诚实标注，不假装能用） |
| **O7** | **composer 切中转站语义**：写 host 级 `currentVendorId`（倾向）vs per-draft 覆盖 | 架构 #6 | host 级 currentVendorId |
| **O8** | `provider-settings-store`（visible 开关）去留：改深链后倾向废弃 | 架构 #5 | 废弃（深链取代） |
| **O9** | **用量三缺口**（时间切换/估算金额/按模型）：目标态克制呈现 vs 移出默认视图 | 产品能力缺口 | 目标态克制（已门控 `providerUsageList`） |

---

## 附：勘察证据索引（真实文件）

- host 真相源：`packages/app/src/runtime/host-runtime.ts`（hooks 在文件尾 L2099+）、`utils/active-host.ts`（`resolveActiveHost` 路由派生）
- 现 model 真相源：`packages/app/src/provider-selection/provider-selection.ts`、`create-agent-preferences/preferences.ts`、`components/combined-model-selector.tsx`、`stores/provider-settings-store.ts`（仅 visible 开关）
- **develop 已有 settings 实体（settings 实现=重构此处）**：`packages/app/src/app/settings/hosts/[serverId]/*`、`screens/settings/{host-page,providers-section,settings-section}.tsx`、`screens/settings/appearance/`、`provider-usage/use-provider-usage.ts`（能力门 `serverInfo.features.providerUsageList`）、`utils/host-routes.ts`（`buildSettingsHostSectionRoute`）；config 通道 `useDaemonConfig`
- vendor 后端落点（待新增 `vendors` schema + `features.providerVendors` 门）：`packages/server/src/server/persisted-config.ts`、`daemon-config-store.ts`（`agents.providers`）
- home-shell 已实现：`_rescue/home-shell/packages/app/src/{conversation-tree,components/sidebar/host-switcher-*,screens/workspace/canvas-top-bar-*,stores/conversation-history-store}`
- home-shell 设计：`_rescue/home-shell/docs/helm/requirements/2026-06-25-home-shell/{requirement,ui.html,architecture}.md`
- settings 设计：`_rescue/settings-ui/docs/helm/requirements/2026-06-26-settings/{requirement,ui.html}.md`
</content>
