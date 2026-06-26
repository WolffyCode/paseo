# 架构 · 首次启动 onboarding（连主机）

> 日期：2026-06-24 · 状态：草拟（待闸 2） · 关联：[requirement.md](./requirement.md) · [ui.html](./ui.html)
> 写 **HOW 的边界**，不写逐行实现（实现交 helm-developer / Codex）。遵循 [standards.md](../../standards.md)、[coding-standards.md](../../../coding-standards.md)、[testing.md](../../../testing.md)、[i18n.md](../../../i18n.md)、根 [CLAUDE.md](../../../../CLAUDE.md)。

---

## 0. 现状勘探结论（设计前提，已亲自核实）

落到本需求的真实代码事实，决定了下面所有取舍：

- **本地 daemon 只存在于桌面**。`shouldUseDesktopDaemon() === isElectronRuntime()`（`desktop/daemon/desktop-daemon.ts:113`）。Web 浏览器 / 手机 native 永远没有本地 daemon。→ 「本地自动连」是**桌面专属主路径**，不是一个新平台门，而是已有判据。
- **没有任何「已看过欢迎」状态**。全仓 grep `seenWelcome / firstRun / onboardingComplete` 为空。→ 一次性欢迎闸是**净新增**。
- **启动路由已经是纯函数**。`resolveStartupRoute` / `resolveStartupBlocker` / `shouldRunStartupGiveUpTimer` 在 `app/host-runtime-bootstrap.ts`，已被 `host-runtime-bootstrap.test.ts` 覆盖。今天的「去 welcome」判据是：`hasGivenUpWaitingForHost`（`_layout.tsx` 里一个 5s 定时器）+ 无任何 host。→ 一次性闸**应在这里扩展**，不另起炉灶。
- **今天 welcome 不分态**。`components/welcome-screen.tsx` 是「选择器 + 设置入口 + 版本号」单屏，并且**组件内自己 `router.replace`**（`useAnyHostOnline` → effect 跳转）——这是模型/UI 分离的违例。需求要的 S1/S2/S3/S4 四态今天**不存在**。
- **S4「错误态」今天借住在 splash**。`screens/startup-splash-screen.tsx` 的 error 模式只绑 `managed-daemon-error` 这个 blocker，按钮文案是硬编码英文（"Copy logs"/"Retry"），是「桌面 managed daemon 起不来」的诊断页，**不是** onboarding 的「本地连不上」错误态。
- **复用件齐全且已 i18n**：`AddHostModal`（`onSaved({profile,serverId,hostname,isNewHost})`）、`PairLinkModal`（同形 `onSaved`）、`pair-scan` 路由（吃 `?source=onboarding`）。三方式文案在 `pairing.connectionMethods.*`。

> 一句话定调：**本需求 = 把「无 host 时的落点」从『一块平的 welcome 屏』重构成『一个有限状态机（欢迎/连接中/选择器/错误）』，状态机的判定进纯函数、一次性 flag 进 store，UI 只渲染。不动协议。**

---

## 1. 模块划分

按职责切，path 即名。**新增 3 个、改动 4 个、删除 1 段**。

### 新增

| 模块 | path | 单一职责 |
| --- | --- | --- |
| onboarding flag store | `packages/app/src/stores/onboarding-store.ts` | 持久化「已看过欢迎」这一个一次性布尔。zustand+persist（照 `sidebar-view-store.ts` 模式）。只存 + 读 + 置位，无路由、无连接逻辑。 |
| onboarding 阶段纯函数 | 扩展进 `packages/app/src/app/host-runtime-bootstrap.ts`（**不新建文件**） | 把「首跑该显示欢迎 / 自动连本地 / 进选择器」的判定，加成 `resolveStartupRoute` 同层的纯函数 `resolveOnboardingPhase(...)`。输入快照 → 输出一个 `OnboardingPhase` 判别联合。 |
| onboarding 屏（状态机视图） | `packages/app/src/screens/onboarding/`（目录即模块） | 渲染 S1/S2/S3/S4 的视图。读 store + 纯函数派生的 phase，dispatch action。**不算转移、不 `router.replace`**。 |

`screens/onboarding/` 目录内的拆分（一个 public surface，内部文件内部）：
- `onboarding-screen.tsx` —— 唯一对外入口；按 phase 选子视图；持有「打开 AddHost/PairLink/scan」的本地 UI 开关（这是纯 UI 态，可留组件内，见 §2）。
- `welcome-stage.tsx`（S1）、`connecting-stage.tsx`（S2）、`method-picker-stage.tsx`（S3）、`error-stage.tsx`（S4）—— 四个**纯展示**子视图，props 进、事件回调出，零业务逻辑。
- 平台差异（S5）用**子视图内联 `isWeb`/`isNative` 选 CTA 顺序 + 是否含扫码项**，不拆 `.web`/`.native` 文件（差异只是「数组顺序 + 去掉一项 + 主路径有无」，属小内联分支，拆文件是过度切分——见 §5）。

> 为什么是「screens/onboarding/ 目录」而不是继续堆 `welcome-screen.tsx`：单屏已经做了太多事（选择器+设置+版本+自跳转）。四态状态机 + 三方式 + 平台变体塞一个文件就是「这文件做太多了」。给它一个目录家门（standards §「新功能先有家」）。

### 改动

| 模块 | 改法（边界） |
| --- | --- |
| `app/host-runtime-bootstrap.ts` | 新增 `OnboardingPhase` 类型 + `resolveOnboardingPhase()`；把「给路由决定去 welcome」的出口从「裸 `WELCOME_ROUTE`」改为「去 onboarding 路由」。`resolveReadyIndexStartupRoute` / `resolveReadyHostStartupRoute` 里 `WELCOME_ROUTE` 的两处出口指向 onboarding 屏（路由名沿用 `/welcome` 即可，见 §3 取舍）。 |
| `app/welcome.tsx` | 路由壳：渲染 `OnboardingScreen` 取代 `WelcomeScreen`。 |
| `app/_layout.tsx` | `hasGivenUpWaitingForHost` 这套「give up 计时器」语义保留（它是「等本地 daemon 多久算放弃」），但把它喂给 `resolveOnboardingPhase` 作为「桌面本地探测是否已结束」的输入之一；不再让它直接等价于「显示 welcome」。 |
| `app/index.tsx` | 继续只做 `resolveStartupRoute` 的渲染/重定向分流，无新增逻辑（onboarding 的内部分态在 onboarding 屏里，不在 index）。 |

### 删除（重构而非打补丁，同一改动里删干净）

- `components/welcome-screen.tsx` **整文件删除**：其设置入口（`handleOpenSettings` + `welcome-open-settings` testID）、组件内 `router.replace`（`useAnyHostOnline` effect）、`onboarding.actions.settings` i18n key、`paseo.sh` 外链块——全部不迁移、不留。它的复用价值（开 AddHost/PairLink/scan、版本号、三方式数组）由新的 `method-picker-stage.tsx` 重新承载（复用的是**那几个弹窗组件**，不是这个屏）。
- 末态应读起来像「onboarding 一开始就是状态机」——无 `welcome-screen.tsx` 考古层。

---

## 2. 模型与 UI 分离

判据贯穿全节：**不渲染就能测的，必须在 store / 纯函数**。

### 状态归属

| 状态 | 归属 | 说明 |
| --- | --- | --- |
| 「已看过欢迎」`hasSeenWelcome` | **`onboarding-store.ts`（persist）** | 唯一真相源。读：selector hook。写：一个 `markWelcomeSeen()` action（幂等）。绝不在组件里 `useState` 镜像它。 |
| 当前 onboarding 阶段（welcome/connecting/picker/error） | **`resolveOnboardingPhase()` 纯函数派生**（不是 store 字段） | 阶段是「flag + 平台 + 本地探测结果 + give-up」的纯函数，不是独立可变态。两个真相源就是 bug → 用派生，别存。 |
| 本地连接「连接中 / 失败 / 失败原因」 | **复用既有 host-runtime 快照**（`connectionStatus`/`lastError`）+ `daemonStartService`（`isRunning`/`getLastError`） | 不为 onboarding 复制一份连接态。S2/S4 读的是同一套 runtime 真相。 |
| AddHost / PairLink / scan 弹窗的开/关 | **可留 onboarding-screen 组件内 `useState`** | 这是纯 UI 局部态（模态可见性），不进 store。判据：它不影响路由、不影响连接、不需被别处读。符合「optionality 在真实边界」。 |

### UI 只做什么

- **渲染**：把 `phase` + runtime 派生态映射到 S1/S2/S3/S4 子视图。
- **dispatch**：
  - 「开始使用」→ 调 `markWelcomeSeen()` + 触发本地连接（复用既有 retry/daemonStart 入口），**不自己算下一屏**——下一屏由 phase 重新派生。
  - 「连接远程主机 / 改用其它连接方式」→ 仅切到 picker 视图（一个意图，不是路由跳转计算）。
  - 「重试」→ 复用 `_layout.tsx` 已有的 `retry`（`startDaemonIfGateAllows`）/ runtime 重探入口。
  - 「查看诊断」→ `router.push("/settings")` 到诊断（唯一 UI 跳转，且是去既有路由，不是状态机内转移）。
- **禁止**：组件内 `router.replace` 决定主页落点（今天 `welcome-screen` 的违例）。落主页的重定向**留在 `index.tsx` + `resolveStartupRoute`**——host 一上线，纯函数自然把 index 重定向到主页，onboarding 屏被卸载。onboarding 屏不负责「连上后去哪」。

> 这是本设计的核心收益：**「连上→进主页」与「没连上→onboarding 哪一态」是同一套启动纯函数的两面**，都在 `host-runtime-bootstrap.ts`，都可单测；onboarding 组件退化成「给定 phase 画对应屏 + 把按钮接到既有 action」。

---

## 3. 数据流与接口契约

### 事件 → 状态 → 渲染（端到端）

```
启动
  → _layout 跑既有 bootstrap（boot store / 桌面起 managed daemon）
  → index.tsx 调 resolveStartupRoute(快照)
      ├─ 有 host / 在线 / 有 saved workspace → redirect 主页（既有逻辑，不变）
      └─ 无 host 且启动判定「该 onboarding」→ redirect onboarding 路由
  → onboarding 屏调 resolveOnboardingPhase(快照) 得 phase
      ├─ phase=welcome     → S1（仅当 !hasSeenWelcome 且桌面）
      ├─ phase=connecting  → S2（桌面 + 正在连本地）
      ├─ phase=picker      → S3（无本地能力 / 用户选远程 / 已看过欢迎且无 host）
      └─ phase=error       → S4（桌面 + 本地连接 failed）
  → 用户操作 → dispatch（见 §2）→ 改 flag / 触发连接 / 切 picker
  → host 一上线 → 既有 runtime 快照变 → index 的 resolveStartupRoute 重新算 → redirect 主页
```

关键：**onboarding 屏内部不做「跳主页」**；它只在「无 host」的世界里切 S1↔S2↔S3↔S4。一旦有 host，控制权回到 `index.tsx` 的启动路由。

### 命名的接口（对象 shape，不 inline）

`resolveOnboardingPhase` 的输入与输出（放 `host-runtime-bootstrap.ts`，与 `ResolveStartupRouteInput` 同层风格）：

- 输入 `ResolveOnboardingPhaseInput`：
  - `hasSeenWelcome: boolean`
  - `platformCapability: "desktop-local" | "remote-only"` —— 由 `shouldUseDesktopDaemon()` 在边界算好后传入（**纯函数不直接调平台门**，保持可测；与现有 `isDesktopRuntime` 注入风格一致）
  - `localConnect: OnboardingLocalConnectState` （见下）
  - `userRequestedRemote: boolean` —— 用户点过「连接远程主机 / 改用其它连接方式」（一个会话内 UI 意图，由屏组件持有并传入）
- `OnboardingLocalConnectState`（判别联合，**让不可能态不可能**，禁 `{isLoading;error?}` 袋）：
  - `{ kind: "idle" }` | `{ kind: "connecting" }` | `{ kind: "failed"; reason: string }`
  - 由边界从 `daemonStartService` + host-runtime 快照映射而来（不新增连接态源）。
- 输出 `OnboardingPhase`（判别联合）：
  - `{ kind: "welcome" }` | `{ kind: "connecting" }` | `{ kind: "picker" }` | `{ kind: "error"; reason: string }`

判定语义（纯、可穷举单测）：
- `remote-only` 平台 → 永远 `picker`（S5：Web/手机无本地）。但**首访仍先过一次性欢迎**：`remote-only && !hasSeenWelcome` → `welcome`（点「开始使用」置 flag 后转 `picker`）。
- `desktop-local`：`!hasSeenWelcome && !userRequestedRemote` → `welcome`；`userRequestedRemote` → `picker`；`localConnect.kind==="connecting"` → `connecting`；`"failed"` → `error`；`"idle"`（已看过、未连中、未失败、未要远程）→ 触发连接的瞬态，渲染 `connecting`（避免空屏）。

`onboarding-store.ts` 对外契约：
- selector hook：读 `hasSeenWelcome`。
- action：`markWelcomeSeen()`（幂等置 true）。
- persist：`name: "onboarding"`, `partialize` 只挑 `hasSeenWelcome`（照 sidebar store）。

### 失败原因映射（S4 文案）

S4 的「daemon 未运行 / 端口被占 / 超时」是**合并文案**（requirement §6.6 + ui S4 注解：三类合一）。→ 不解析底层错误分类，`error-stage` 渲染一条固定合并说明（i18n），把 `reason`（runtime 原始串）作为可选诊断细节，不翻译（遵 i18n.md「raw runtime error 不译」）。

---

## 4. 复用点 / 禁止重造

### 必须复用（列出，直接用，别包一层）

| 复用 | 用在 | 契约 |
| --- | --- | --- |
| `AddHostModal` | S3 直连主机 | `visible/onClose/onSaved`；`onSaved` 后**不自己跳主页**，靠启动路由 |
| `PairLinkModal` | S3 粘贴配对链接 | 同上同形 `onSaved` |
| `pair-scan` 路由 | S3 扫码（手机=相机，桌面=展码） | `router.push("/pair-scan?source=onboarding")`（已支持该 source） |
| host-runtime 快照 / `daemonStartService` | S2 连接中、S4 失败原因 | 读既有 `connectionStatus`/`lastError`/`isRunning`/`getLastError`，不新建连接态 |
| `_layout.tsx` 的 `retry` + `startDaemonIfGateAllows` | S2 取消后重连、S4 重试、S3 重试本地 | 既有桌面 daemon 重启入口 |
| `resolveStartupRoute` / `index.tsx` 重定向 | 「连上→进主页」 | onboarding 不重做落点逻辑 |
| `host-runtime-bootstrap.ts` 的纯函数风格 + 其 `.test.ts` | `resolveOnboardingPhase` | 同文件、同测试套路 |
| `onboarding.*` / `pairing.connectionMethods.*` i18n | 各屏文案 | 复用既有 key，新增的补全六 locale |
| zustand persist（`sidebar-view-store.ts` 为范本） | `onboarding-store.ts` | 同 AsyncStorage + partialize 写法 |
| `PaseoLogo`、`Button`、`startup-splash-screen` 的 spinner/alert 视觉语汇 | S1/S2/S4 | 视觉与既有 splash/错误页一致 |

### 禁止重造清单（已有，别再写一遍）

- ❌ 不要新写直连/粘链/扫码的表单或连接逻辑——三个弹窗 + pair-scan 已存在。
- ❌ 不要为 onboarding 复制一份「连接中/连接失败」状态机——host-runtime + daemonStartService 已是真相源。
- ❌ 不要新起一个 onboarding 专用路由路径/守卫——沿用 `/welcome` 路由名与 `Stack.Protected guard={storeReady}`（见 §7 取舍）。
- ❌ 不要在 onboarding 组件里 `router.replace` 主页——这正是要删的 `welcome-screen` 违例。
- ❌ 不要新建 `onboarding-utils.ts` / `-helpers.ts`——判定进 `host-runtime-bootstrap.ts` 纯函数，视图进 `screens/onboarding/`。
- ❌ 不要把 S4 做成第二个「诊断页」——诊断复用 `/settings` 诊断；S4 只是「本地连不上 + 三个动作」。

---

## 5. 协议 / 平台

### 协议：**不动**

纯客户端 UI + 路由 + 本地持久化。无新 RPC、无 `server_info.features.*`、无 schema 改动 → 无 `COMPAT()`。一次性欢迎 flag 存本地 AsyncStorage（per-install，不跨设备同步，符合 requirement「真·第一次安装」语义）。

> 自检（根 CLAUDE.md 协议契约）：6 个月前的 daemon 不受影响（没碰协议）；6 个月前的 client 也不受影响（这是 client 内部行为）。通过。

### 平台门策略

- 「本地自动连」= **`shouldUseDesktopDaemon()` 既有门**（Electron only）。在边界算成 `platformCapability` 注入纯函数，纯函数本身平台无关、可测。
- 子视图内的平台差异（S5）= **内联 `isWeb`/`isNative`**：Web 选择器去掉扫码项 + 直连为主；手机扫码为主 CTA。差异是「CTA 顺序数组 + 是否含一项」，属小内联分支 → **不拆 `.web`/`.native`/`.electron` 文件**（拆文件留给「实现根本不同」的场景；这里拆是过度切分，违反零复杂度预算）。
- 平台门只从 `@/constants/platform` import（`isWeb`/`isNative`/`getIsElectron`），不本地 `Platform.OS === "web"`。
- 不用 `Platform.OS` 当布局代理；onboarding 的居中单列布局对所有平台一致，手机变体由 `isNative` 决定 CTA，不由屏宽。

---

## 6. 测试策略

### 必须单测的纯函数 / store（不渲染即可测）

写进 `host-runtime-bootstrap.test.ts`（已存在，加 describe 块）：

**`resolveOnboardingPhase` —— 穷举 requirement 验收的分支：**
- 桌面 + 未看过欢迎 + 未要远程 → `welcome`（验收 1）。
- 桌面 + 已看过 + idle → `connecting`（验收 2、4：不再显欢迎、静默连）。
- 桌面 + connecting → `connecting`（验收 2）。
- 桌面 + failed(reason) → `error`，且 reason 透传（验收 6）。
- 桌面 + 用户点过远程 → `picker`（验收 5）。
- remote-only(Web) + 未看过 → `welcome`；置 flag 后 → `picker`，且 picker 不含扫码由视图保证（验收 7：phase 给 picker，扫码项缺席在视图测）。
- remote-only(手机) → `welcome`/`picker`，扫码为主由视图保证（验收 8）。

**启动路由出口（扩展现有 `resolveStartupRoute` 测试）：**
- 无 host 且判定 onboarding → redirect 到 onboarding 路由（替换今天「→ /welcome」断言的语义，确认仍指向 onboarding 屏）。
- 有 host / 在线 → 仍 redirect 主页（回归：onboarding 不该截胡）。

**`onboarding-store.ts`：**
- 初始 `hasSeenWelcome === false`。
- `markWelcomeSeen()` 后 `true`；幂等（再调不抖动）。
- persist：partialize 只含 `hasSeenWelcome`（按既有 store 测法）。

> 上述全部是「真实依赖优先、确定性、判别联合断言整体」（testing.md）；store 用真实 zustand（AsyncStorage 在 app vitest.setup 已 stub），**不 mock 自己的模块**。

### 端到端验证点（对应 requirement 10 条验收）

走真实 app（Playwright，`packages/app/e2e/*.spec.ts`，遵 testing.md「E2E 即 E2E」），抽查覆盖：
- 验收 1/9：全新（清 AsyncStorage）首启桌面 → 见 S1（logo+slogan+开始使用+连接远程+版本，**断言无 settings testID**）。
- 验收 2/3：点开始使用 → 见 S2 → 本地连上 → 落主页（不停留 S1/S2）。
- 验收 4：二次启动（flag 已置）→ 不见 S1，直接连/落主页。
- 验收 5：点连接远程 → S3 含 直连/粘链/扫码 + 重试本地。
- 验收 6：本地连不上 → S4 含 重试 / 改用其它 / 查看诊断，三者各自生效（重试→S2、改用→S3、诊断→/settings）。
- 验收 7：Web 首跑 → 开始使用进 S3 且**无扫码项**。
- 验收 8：手机首跑 → 扫码为主 CTA。
- 验收 10：抽查 S1 hover / S2 加载 spinner / S4 错误态与 ui.html 像素对齐（**不靠截图 text-grep 判过**，按 verify 教训端到端看真生效）。

---

## 7. 风险与取舍

### 取舍 1：阶段是「派生纯函数」而非「store 字段状态机」（已定）

- **走法 A（采纳）**：`OnboardingPhase` 由 `resolveOnboardingPhase` 从 flag+runtime 派生，不落 store。
- 走法 B（否）：onboarding 自带一个 `phase` 可变状态机（store 里存当前态 + transition）。
- 取舍：B 会和 host-runtime 真相源打架（连接态有两份），违反「两个真相源就是 bug」。A 让阶段永远是真相的纯函数，单测穷举即可，连上后无需手动「转移到主页」——index 路由自然接管。唯一进 store 的可变态是 `hasSeenWelcome`（它确实是独立持久事实）和 `userRequestedRemote`（会话级 UI 意图，留组件）。**风险**：`userRequestedRemote` 是组件态，若未来要「跨重启记住用户选了远程」需上提到 store——但 requirement 没要求，YAGNI，先留组件。

### 取舍 2：沿用 `/welcome` 路由名，不新起 `/onboarding`（已定）

- 采纳：路由文件仍是 `app/welcome.tsx`，内部换渲染 `OnboardingScreen`；`host-runtime-bootstrap.ts` 的 `WELCOME_ROUTE` 常量与两处出口、`_layout.tsx` 的 `Stack.Protected` 守卫**零改动**。
- 否决的走法：改路由名为 `/onboarding`——会牵动 `WELCOME_ROUTE`、两个 resolve 出口、`Stack` 注册、可能的深链，纯属命名洁癖换来的迁移面。**取舍**：路由名是实现细节，对用户不可见；省下的改动面 > 命名收益。（若董事长坚持语义命名，可作为独立小改，但不在本需求范围。）

### 取舍 3：S4 复用 splash error 视觉，但**不复用 splash error 屏本身**（已定）

- splash 的 error 模式绑死 `managed-daemon-error` blocker + 硬编码英文 + 拉 desktop daemon 日志。onboarding 的 S4 是「本地连不上 + 三动作（重试/改用/诊断）」，受众和动作都不同。
- 采纳：S4 是 `screens/onboarding/error-stage.tsx` 独立视图，**借用** splash 的 alert/Button 视觉语汇与「查看诊断→/settings」入口，但不 import 那个屏。**风险**：两处都有「错误页」视觉，需保证 design token 一致（accent/danger/spacing 来自同一 theme，天然一致）。这不是重造逻辑，是两个不同语义的错误面共享原子组件。

### 取舍 4：把判定塞进既有 `host-runtime-bootstrap.ts` 而非新文件（已定）

- 该文件已是「启动判定纯函数 + 测试」之家，`resolveOnboardingPhase` 与 `resolveStartupRoute` 是同一族判定。塞进去 = 同一处集中策略（standards「集中 policy」）。
- **风险**：文件变长。但它仍是单一职责（启动期的所有路由/阶段判定），未跨域；若日后超量，整族搬进 `app/startup/` 目录是干净的下一步。当前不预先抽（零复杂度预算）。

### 跨切风险

- **空屏闪**：phase 从 `idle`→`connecting` 的瞬态若渲染空，会闪。设计上 `idle`（桌面已看过、待触发连接）直接渲染 `connecting`，消除闪屏。需在视图测里盯住。
- **回归**：删 `welcome-screen.tsx` 牵动其唯一 import 点（`app/welcome.tsx`）——已确认仅此一处。`resolveStartupRoute` 现有测试里「→ /welcome」断言语义不变（路由名沿用），只新增 onboarding phase 断言，回归面小。
- **i18n 漏译**：新增 onboarding 文案（S2 连接中、S4 合并错误、S1 双 CTA）必须六 locale 齐全，`resources.test.ts` parity 会拦；删除的 `onboarding.actions.settings` 同步从六 locale 移除。
