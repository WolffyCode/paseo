# 架构 · 首次启动 onboarding（连主机）

> 日期：2026-06-24（**2026-06-25 修订二：从「急切连接」反转为「延后连接」(Q)；补 重开自愈 / 连接中取消 边界**） · 状态：**修订二 · Q · 待闸 2 复审** · 关联：[requirement.md](./requirement.md)（修订二，验收 #12–14）· [ui.html](./ui.html)（已去 chip，主文案承担「当前主机+状态」）
> 写 **HOW 的边界**，不写逐行实现（实现交 helm-developer / Codex）。遵循 [standards.md](../../standards.md)、[coding-standards.md](../../../coding-standards.md)、[testing.md](../../../testing.md)、[i18n.md](../../../i18n.md)、根 [CLAUDE.md](../../../../CLAUDE.md)。

> **修订二一句话**：上一版选了「runBoot 急切探本机、onboarding 只读其结果」（旧 §0「走法 A」）——**这正是欢迎页被跳过的根因**（见 §0 根因）。本版反转连接时机为 **Q（延后连接）**：genuine 首跑在用户看过欢迎并点「开始使用」**之前不发起任何连接**；连接由「开始使用」触发；看过欢迎后恢复急切静默自愈连接。三态 `platformCapability`、`resolveOnboardingPhase` 派生、复用清单等**仍成立的部分原样保留**，本版只反转「连接时机」并补 重开自愈 / 取消 / 路由次序。
> **Helm 是未上线的 fork、无存量用户 → 不做任何老用户/迁移兼容逻辑**（董事长定论）。延后连接的「连不连」只看 `hasSeenWelcome` 单一输入；「已有保存主机者重开进主页」由启动路由现有 host 优先级（`:330`）天然保证，不是老用户兼容、不引入迁移。

---

## 0. 现状勘探结论 + 根因（设计前提，已逐个 Read 源码核实）

落到本需求的真实代码事实，决定了下面所有取舍。**带行号者均已在 `onboarding-impl` 分支当前代码核对。**

### 0.1 根因：为什么欢迎页被跳过（修订二要反转的核心）

链路：`_layout.tsx` 的 `HostRuntimeBootstrapProvider`（:309）在 mount effect 里**无条件**调 `startHostRuntimeBootstrap`（:313）→ `store.boot()` + `startDaemonIfGateAllows`。

- **web/native 急切探测**：`boot()`（`host-runtime.ts:1343`，`bootStarted` 幂等只跑一次）→ `runBoot()`（:1351）→ 先 `loadFromStorage()`（:1353，读 `REGISTRY_STORAGE_KEY`）→ 非 E2E、非桌面 → `bootstrapDefaultLocalhost()`（:1372）探 `localhost:6767`（或 `EXPO_PUBLIC_LOCAL_DAEMON` override）→ `probeAndUpsertConnection`（:1534）→ `upsertHostConnection`（:1702）→ **`persistHosts()`（:1729）把 host 写进 `REGISTRY_STORAGE_KEY`**，并把 host 推进 `this.hosts`。
- **桌面急切起 daemon**：`shouldStartDaemon: shouldStartBuiltInDaemon`（`_layout.tsx:301`）在 boot 时即起内建 daemon → online host。
- **截胡**：host 一进 `this.hosts` / 上线，`index.tsx` 的 `resolveReadyIndexStartupRoute`（`host-runtime-bootstrap.ts:309`）按 `anyOnlineHostServerId`（:326）→ `savedHostServerId = hosts[0]`（:330）的优先级**在欢迎闸（:335 `!hasSeenWelcome → /welcome`）之前**就重定向到主页。**于是欢迎页变死代码。**这与 MEMORY「onboarding 验收=FAIL（欢迎页被跳过）」一致：急切探测使 host 在欢迎闸前上线/持久化。

**修订二的修法**：genuine 首跑（`!hasSeenWelcome`）时，boot **不**急切探测（web/native）、**不**急切起 daemon（桌面）；先稳定停在欢迎页；连接由「开始使用」触发。这样欢迎闸前 `this.hosts` 恒空、无在线 host，:326/:330 都不命中，:335 自然导向 `/welcome`——无「上线即弹走」竞态。（Helm 无存量用户，首跑判据无需考虑「已有持久化 host」——见 §0.3。）

### 0.2 仍然成立、原样保留的事实（修订一已 land，本版不动）

- **三态 `platformCapability` 与 `resolveOnboardingPhase` 已正确 land**。`host-runtime-bootstrap.ts` 已有判别联合 `OnboardingPlatformCapability`（`desktop-local` | `local-candidate` | `remote-only`，:68）、`resolveOnboardingPhase`（:124）、`resolveOnboardingPlatformCapability`（:111）、`resolveOnboardingLocalConnectState`（:144），且 `host-runtime-bootstrap.test.ts` 已用 local-candidate 形态穷举覆盖（:198–:330）。**修订二不重做这套**——它们刻画的是「**用户已过欢迎闸、进入 onboarding-screen 之后**」的屏内分流，依旧正确。
- **「自动连本机 daemon」在 runtime 层对 web/native 本就存在**（`bootstrapDefaultLocalhost` 探 `localhost:6767`，:1407）。web 用普通 `WebSocket` 直连、**无「同源」概念**（`buildDaemonWebSocketUrl` 从 `host:port` 造绝对 url；daemon 不 serve web app）。修订二**不**新造 same-origin transport（零收益，见 §7 取舍 0 的「否 C」）。
- **`directPipe` 是桌面专属、但「本地可连」不是**：桌面 Electron 桥连内建 daemon，web/native 用 `directTcp`(ws) 连本机候选。三态 capability 区分这三种现实，差别只在 transport（已由 host-runtime 处理）与 S2 文案 / 失败兜底，不在 phase 主干。
- **启动路由全是纯函数**：`resolveStartupRoute` / `resolveStartupBlocker` / `shouldRunStartupGiveUpTimer` / `resolveOnboardingPhase` / `resolveOnboardingLocalConnectState` 全在 `host-runtime-bootstrap.ts`，已被 `.test.ts` 覆盖。修订二**在这里扩展判定**，不另起炉灶、不进组件。
- **S1–S4 视图齐全且已 i18n**：`screens/onboarding/` 的 `welcome-stage` / `connecting-stage` / `method-picker-stage` / `error-stage` 五件；复用件 `AddHostModal` / `PairLinkModal` / `pair-scan`（吃 `?source=onboarding`）齐全。`connecting-stage` 的 `onCancel` 已接到「切 picker」语义（`onboarding-screen.tsx:128`），**S2 取消→picker 已满足**，本版只需在文档与测试上固化它。
- **i18n 文案已去端口**（修订一已修，**纠正上一版 §3/§7 的过时描述**）：`en.onboarding.connecting.title = "Connecting to local daemon..."`、`en.onboarding.error.description = "Possible causes: daemon not running, the local port is in use, or the connection timed out."`（说「local port」但**不含具体端口号**），与 ui.html「不显端口」一致。`resources.test.ts:270–273` 已断言。**本版不再要求改文案去 port**——那已完成。

### 0.3 延后机制的硬约束（决定 §1/§3 的边界形状）

- `boot()` 的 `bootStarted`（:1344）幂等门让它**只能跑一次**；`runBoot` / `bootstrapDefaultLocalhost` 是 **private**。
- `_layout.tsx` 的 `retry`（:354）当前**只**调 `startDaemonIfGateAllows`（桌面 daemon），**对 web/native 本机探测什么都不做**。今天 web「重试本地」能凑合，仅因为 boot 已急切探过。**Q 延后后这条凑合路径断了**：首跑「开始使用」必须能触发 web/native 的本机候选探测（不能再依赖 boot 已探）。这是本版必须新立的边界（§3「连接触发入口」）。
- **Helm 是未上线的 fork、无存量用户 → 不做任何老用户/迁移兼容逻辑**（董事长定论）。「连不连」只由 `hasSeenWelcome` 单一输入决定，不读持久化注册表、不在水合时置位。「已有保存主机的用户重开直接进主页」这件事**由启动路由现有 host 优先级天然保证**（`resolveReadyIndexStartupRoute` 的 saved-host `:330` 在欢迎闸 `:335` 之前），那是**通用路由**（任何有主机的用户都进主页），不是老用户兼容——不需要、也不引入任何迁移读取/置位。

> 一句话定调（修订二）：**连接时机从「boot 急切」反转为「看过欢迎才连」。genuine 首跑（`!hasSeenWelcome`）停欢迎、不连接；「开始使用」触发本机连接；看过欢迎后恢复急切静默自愈连。判定单输入（`hasSeenWelcome`）、连接态单一真相源（host-runtime），不动协议、不做老用户兼容。三态 capability 与 phase 派生原样保留。**

---

## 1. 模块划分（修订二的改动面）

> 修订一已 land 三态 capability + phase 派生 + 五视图（见 §0.2）。**修订二只反转一件事：连接时机**——把「boot 急切探测/起 daemon」改为「genuine 首跑看过欢迎才连」，并补 重开自愈 / 取消 / 路由次序。改动收敛在 **3 处**（boot 门、连接触发入口、回归测试），**不新建文件、不动协议、不动视图结构、不重做三态 capability 与 phase、不做老用户兼容**。

### 改动（重构而非打补丁；同一改动里把「急切」路径删干净，不留 dead gate）

| 模块                                           | 改法（边界）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/_layout.tsx`（boot 门 + 触发入口）        | (a) **boot 门内联**：`HostRuntimeBootstrapProvider` mount 时取 `hasSeenWelcome`（onboarding-store），**`hasSeenWelcome ? 急切（探测 + daemon-start）: 延后（只载注册表、不探/不起 daemon）`**。判据只有一个布尔输入，不抽独立函数（见 §3「boot 门」的取舍）。(b) **暴露会话级「连接本机」入口 `connectLocal`（取代现有 `retry`）**：桌面 = `startDaemonIfGateAllows`；web/native = 触发本机候选探测（见 §3「连接触发入口」）。`startLocal` / `retryLocal` 改调它。`retry` 旧的「只起桌面 daemon」语义被 `connectLocal` 取代，**不保留两个入口**。 |
| `runtime/host-runtime.ts`（延后探测公开入口）  | 延后时 `runBoot` 不再探本机，故 web/native 需一个**幂等公开方法 `connectLocalCandidate()`**（复用 `bootstrapDefaultLocalhost` / `bootstrapConfiguredOverride` 既有逻辑，把它从「只在 runBoot 内私有调用」提为可被「开始使用」二次触发）。**不改探测算法本身**（endpoint 判据、超时、serverId 校验全沿用），只让它可延后触发且重复调用安全（已有 `registryHasConnection` 早退 + `configuredOverrideBootstrapInFlight` 去重为基础）。这是 §0.3「retry 对 web 什么都不做」缺口的唯一干净补法。                                                       |
| `app/host-runtime-bootstrap.test.ts`（回归闸） | **新增 boot 门穷举**（2 组：`hasSeenWelcome` true→急切 / false→延后；若内联则测「mount 后是否触发探测」的行为，或抽出最小可测谓词，见 §6）；**回归现有 `resolveStartupRoute` 的 `:584`（genuine 首跑→`/welcome`）/ `:573` / `:666`**（后两条 = 通用「有保存/在线 host → 主页」，与老用户无关，断言不动）。                                                                                                                                                                                                                                        |

> **不动的**（保留修订一成果）：三态 `OnboardingPlatformCapability` 与 `resolveOnboardingPlatformCapability`、`resolveOnboardingPhase`、`resolveOnboardingLocalConnectState` 及其屏内分流测试（§0.2）；`screens/onboarding/` 五视图结构；`welcome.tsx` 路由壳与 `WELCOME_ROUTE` 名；`index.tsx` 重定向链与**现有 host 优先级（`:330` saved-host 在 `:335` 欢迎闸之前——通用路由，非老用户兼容）**；`onboarding-store.ts` 的 `markWelcomeSeen` 契约；i18n 文案（已去端口）。`_layout.tsx` 的 give-up 计时器骨架（其输出仍作 §3 输入）。

### 明确不做（零复杂度预算）

- ❌ **不新建 same-origin / `window.location` transport**（§0.2：无此前提，零收益抽象）。
- ❌ **不在 onboarding 屏内 `router.replace` 主页**——落主页控制权留在 `index.tsx` + `resolveStartupRoute`（已删 `welcome-screen` 的违例）。
- ❌ **不引入第二个连接态真相源**——S2/S4/picker 的「连接中/失败」全派生自 host-runtime + daemonStartService（`resolveOnboardingLocalConnectState`）。
- ❌ **不为 `userRequestedRemote` 建 store / persist**——会话级组件态（董事长定，§7 取舍 1）。
- ❌ **不把「延后」判定散落多处**——boot 门只在 `_layout` 的 boot 编排**一处**判 `hasSeenWelcome`；其它地方读 phase / 调 `connectLocal`，不各自重判「该不该连」。
- ❌ **不做任何老用户/迁移/兼容逻辑**——Helm 无存量用户；不读持久化注册表来「补标」`hasSeenWelcome`，不加 `hasPersistedHost` 类输入。

---

## 2. 模型与 UI 分离

判据贯穿全节：**不渲染就能测的，必须在 store / 纯函数**。

### 状态归属

| 状态                                                    | 归属                                                                                                                                                                  | 说明                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 「已看过欢迎」`hasSeenWelcome`                          | **`onboarding-store.ts`（persist，key `@paseo:onboarding`）**                                                                                                         | 唯一真相源、唯一持久可变态。读：selector hook。写：`markWelcomeSeen()`（幂等，只由「开始使用 / 连接远程」触发；**无迁移路径**）。绝不在组件里 `useState` 镜像它。                                                                                                                 |
| **boot 连接时机**（急切 / 延后）【新·内联】             | **`_layout.tsx` boot 编排处直接判 `hasSeenWelcome`（不抽函数）**                                                                                                      | 修订二心脏：`hasSeenWelcome ? 急切（探+起 daemon）: 延后（只载注册表）`。单布尔输入，无独立可变态、无迁移输入。trivial 故内联（§3「boot 门」取舍）；判定仍只在这一处。                                                                                                            |
| 当前 onboarding 阶段（welcome/connecting/picker/error） | **`resolveOnboardingPhase()` 纯函数派生**（不是 store 字段，已 land）                                                                                                 | 阶段是「flag + 平台能力 + 本地连接态 + give-up」的纯函数，不是独立可变态。两个真相源就是 bug → 用派生，别存。**修订一已 land，原样保留。**                                                                                                                                        |
| 平台能力 `platformCapability`（三态）                   | **在 onboarding-screen 边界算好注入纯函数**（`resolveOnboardingPlatformCapability`，已 land）                                                                         | 由 `shouldUseDesktopDaemon()` + 「是否有本机候选 endpoint」（复用 `hasConfiguredLocalDaemonOverride()`；非桌面恒有 `localhost:6767` 候选 → `local-candidate`）组合。**修订一已 land，原样保留**；与 boot 连接时机正交（时机管「这次连不连」，capability 管「该走哪条连/兜底」）。 |
| 本地连接「连接中 / 失败 / 失败原因」                    | **复用既有 host-runtime 快照**（`connectionStatus`/`lastError`）+ `daemonStartService`（`isRunning`/`getLastError`）+ `resolveOnboardingLocalConnectState`（已 land） | 不为 onboarding 复制一份连接态。S2/S4/picker 读同一套 runtime 真相。**web 连接态同样来自这里**——「开始使用」触发 `connectLocalCandidate` 后 upsert 的 host，其 `connectionStatus` 即 web 的「连接中/在线/失败」。                                                                 |
| `userRequestedRemote`（会话级「连远程」意图）           | **onboarding-screen 组件内 `useState`**（不持久化）                                                                                                                   | 董事长定的轻量：连远程是会话意图、不跨重启（重开仍先重试本机）。喂给 `resolveOnboardingPhase`。判据：不跨重启、不需别处读 → 留组件（§7 取舍 1）。                                                                                                                                 |
| AddHost / PairLink / scan 弹窗的开/关                   | **onboarding-screen 组件内 `useState`**                                                                                                                               | 纯 UI 局部态（模态可见性），不进 store。判据：不影响路由/连接、不需别处读。                                                                                                                                                                                                       |

### UI 只做什么（修订二：触发入口从 retry 收敛为 connectLocal）

- **渲染**：把 `phase` + runtime 派生态映射到 S1/S2/S3/S4 子视图。
- **dispatch**：
  - 「开始使用」→ `markWelcomeSeen()` + **`connectLocal()`**（§3「连接触发入口」：桌面起 daemon / web·native 探本机候选），**不自己算下一屏**——下一屏由 phase 重新派生。
  - 「连接远程主机 / 改用其它连接方式」→ `setUserRequestedRemote(true)`（会话意图，不是路由跳转计算）。
  - 「取消」（S2）→ `setUserRequestedRemote(true)` 落 picker（不回欢迎；现 `connecting-stage` 的 `onCancel` 已接此语义，本版固化）。
  - 「重试 / 重试本地」→ **`connectLocal()`**（同一入口：桌面重起 daemon、web 重探候选）。
  - 「查看诊断」→ `router.push("/settings")`（唯一 UI 跳转，去既有路由，非状态机内转移）。
- **禁止**：组件内 `router.replace` 决定主页落点（已删 `welcome-screen` 的违例）。落主页的重定向**留在 `index.tsx` + `resolveStartupRoute`**——host 一上线，纯函数把 index 重定向到主页，onboarding 屏被卸载。

> 核心收益不变：**「连上→进主页」与「没连上→onboarding 哪一态」是同一套启动纯函数的两面**，都在 `host-runtime-bootstrap.ts`、都可单测。修订二的「连接何时发起」是 boot 编排里一处 `hasSeenWelcome` 判定（单布尔，trivial 内联），不另起状态机、不散在多个 effect。

---

## 3. 数据流与接口契约

### 事件 → 状态 → 渲染（端到端，延后连接 Q）

```
启动（mount）
  → _layout boot 编排：判 hasSeenWelcome（单布尔门，内联）
      ├─ !hasSeenWelcome（genuine 首跑）
      │     → boot store 但【不探本机、不起 daemon】；this.hosts 恒空、无在线 host
      └─ hasSeenWelcome（看过欢迎）
            → boot 即探本机候选(web·native) / 起 managed daemon(桌面)  ← 重开自愈
  → index.tsx 调 resolveStartupRoute(快照)   ← 落主页控制权只在这里（组件不 router.replace）
      次序：saved workspace(:319) → online host(:326) → saved host(:330) → !hasSeenWelcome→/welcome(:335) → give-up/error→/welcome → splash
      ├─ 有 saved workspace / 在线 host / saved host → redirect 主页（通用路由：任何有主机者进主页）
      │     · 首跑（延后）：这三者皆空（Q 没探、没 host）→ 必落欢迎闸，无「上线即弹走」竞态
      │     · 看过欢迎后：探出/起的 host 命中 → 主页（重开自愈）
      └─ 无上述 + !hasSeenWelcome → redirect /welcome（genuine 首跑唯一到达此处的世界）
  → onboarding 屏调 resolveOnboardingPhase(快照) 得 phase（已 land，不变）
      ├─ welcome    → S1（!hasSeenWelcome；点「开始使用」→ markWelcomeSeen()+connectLocal()）
      ├─ connecting → S2（connectLocal 已触发、正在连/待连；桌面与 web 同路）
      ├─ picker     → S3（用户选远程/取消 / local-candidate 探测 failed 兜底）
      └─ error      → S4（desktop-local + failed）
  → host 一上线 → runtime 快照变 → index 的 resolveStartupRoute 重新算 → redirect 主页
```

两条关键不变量：

1. **genuine 首跑（延后）在「开始使用」前 `this.hosts` 恒空、无在线 host** → `resolveReadyIndexStartupRoute` 的 :326/:330 不可能命中 → 必落 :335 欢迎闸。这堵死了根因（§0.1）：欢迎页不再被急切探出的 host 弹走。
2. **onboarding 屏内部不做「跳主页」**：它只在「无 host」的世界里切 S1↔S2↔S3↔S4；host 一上线（含 web 探到本机），控制权回到 `index.tsx` 的启动路由，自动落主页。

### boot 门：`hasSeenWelcome ? 急切 : 延后`（修订二心脏 · 内联进 `_layout.tsx`）

「本次 boot 是否急切连本机」**只看一个布尔输入 `hasSeenWelcome`**（Helm 无存量用户，无需 `hasPersistedHost` 等第二输入）：

- `hasSeenWelcome === true`（看过欢迎）→ 维持现行 boot 编排：`store.boot()` 内的探测 + `startDaemonIfGateAllows`（= 重开自愈）。
- `hasSeenWelcome === false`（genuine 首跑）→ 仍 `store.boot()`（要 `loadFromStorage` 把注册表读出来、`hostRegistryStatus` 置 `ready`，让 index 路由能判定），**但跳过 web/native probe 与桌面 daemon-start**。
- **【时序硬约束 · 必须】`hasSeenWelcome` 来自 onboarding-store 的异步水合**；现 `_layout` 的 boot effect 是 **mount 即跑**（`[]` deps，`:310`）。**若在水合前读 `hasSeenWelcome`，会读到默认 `false`，把「看过欢迎的 returning user」误判为首跑而延后**——桌面尤其致命（managed daemon 不启动 → 无 host → 卡死）。因此：**`store.boot()`（载注册表）可 mount 即跑；但「探测 / 起 daemon」的连接决定必须 gate 在 onboarding-store 水合之后**（`useOnboardingStoreHydrated()` 为真，或把连接决定放进依赖该 flag 的 effect）；`bootStarted` 幂等保证重入安全。这与下方走法 (B) 天然契合（boot 载注册表立即跑、`connectLocalCandidate` / daemon-start 在水合后触发）。**回归须含：桌面 returning user（`hasSeenWelcome=true`）水合后 boot 确实起 daemon。**

**取舍：内联而非抽 `resolveBootConnectPolicy` 纯函数。** 这个判定退化为「单布尔 → 两分支」，抽成函数是 standards §4 明令的 trivial indirection（「不为单行/一次性逻辑抽小函数」），且测试价值近零。故**内联进 `_layout` 的 boot 编排，配一句契约注释**（「首跑延后、看过即急切」）。判定仍只在这一处，不散落。

> 实现注记（边界，不写逐行；开发择一）：让延后生效的两条干净走法——(A) `boot()` 接 `{ connect: boolean }` 入参，首跑只 `loadFromStorage` 不 probe；(B) 拆 `boot()`（只载注册表）与 `connectLocalCandidate()`（探测），`_layout` 按 `hasSeenWelcome` 分别调。倾向 (B)：更显式，且 `connectLocalCandidate` 本就是下条要暴露的公开入口，一举两得。两者都不在 `runBoot` 内塞 `hasSeenWelcome`。

### 连接触发入口：会话级 `connectLocal`（`_layout.tsx` 暴露，取代 `retry`）

genuine 首跑 boot 没连，「开始使用 / 重试」必须能**二次触发**本机连接。统一一个入口，桌面/web·native 内部分流：

- 契约：`connectLocal(): void`（幂等、不抛；触发后由 runtime 快照驱动 phase，调用方不等待结果、不算下一屏）。
- 桌面：`startDaemonIfGateAllows({ daemonStartService, shouldStartDaemon: shouldStartBuiltInDaemon })`（即现 `retry` 体）。
- web/native：调 host-runtime 的**新公开方法 `connectLocalCandidate()`**（§1 第三行）——复用 `bootstrapDefaultLocalhost` / `bootstrapConfiguredOverride` 既有探测逻辑，从私有提为可被「开始使用」触发，幂等（`registryHasConnection` 早退 + in-flight 去重）。
- **删除旧 `retry` 的「只起桌面 daemon」语义**：`startLocal` / `retryLocal` / picker「重试本地」全改调 `connectLocal`。不保留两个并存入口（standards 不打补丁）。
  > 这是 §0.3 缺口（「retry 对 web 什么都不做」，今天靠 boot 已急切探测凑合）的唯一干净补法——延后后凑合路径断了，必须显式给 web 一个触发点。

### 为什么不需要老用户迁移（删整组逻辑的理由）

- **Helm 是未上线的 fork，没有存量用户**（董事长定论）——不存在「升级前已有 host 但无 `hasSeenWelcome` 标记」的人群，故**不写水合迁移、不读原始注册表补标、不加 `hasPersistedHost` 输入**。
- 「已有保存主机的用户重开进主页」仍正确，但**由启动路由现有 host 优先级天然给出**：`resolveReadyIndexStartupRoute` 的 saved-host `:330` 在欢迎闸 `:335` 之前——任何有保存主机的用户都直接进主页。这是**通用路由行为**（与「老用户」无关），本就存在、不改。
- 与延后连接的自洽：首跑 `!hasSeenWelcome` → boot 不探 → `:330` 无 host → 落欢迎；用户连过一次后 `hasSeenWelcome=true` 且有 saved host → 重开 `:330` 命中 → 主页。全程无需任何迁移代码。

### 命名的接口（对象 shape，不 inline · 修订一已 land，原样保留）

`resolveOnboardingPhase` 的输入与输出（放 `host-runtime-bootstrap.ts`，与 `ResolveStartupRouteInput` 同层风格）：

- **`OnboardingPlatformCapability`（三态判别联合，取代旧二元）：**
  - `{ kind: "desktop-local" }` —— 桌面 Electron，走内建 daemon 的 directPipe/socket（`shouldUseDesktopDaemon()` 为真）。
  - `{ kind: "local-candidate" }` —— **非桌面但有一个本机/已配置 daemon 候选可探**（web 浏览器、native，`localhost:6767` 或 `EXPO_PUBLIC_LOCAL_DAEMON`）。修订一新增、修订二保留；是 web「连本机」的载体。**注意（Q）**：候选探测的发起时机由 §「连接触发入口」决定（首跑「开始使用」触发 / 后续启动 boot 触发），而非 boot 无条件探。
  - `{ kind: "remote-only" }` —— **真无本机可连**：当前无任何平台落到这里（web/native 都有 `localhost:6767` 默认候选）。**保留它是为了语义完整与未来**（例如显式关闭本地探测、或确知无本地 daemon 的部署）；**当前实现里它只在「探测结束、候选确证连不上、用户未选远程」时由 phase 逻辑等效落 picker**，不需要平台直接产出它。
    > 用判别联合而非字符串枚举：让「桌面 vs 有候选 vs 真无」在类型上互斥，新增态不破坏 switch 穷举（standards「让不可能态不可能」）。`local-candidate` 与 `desktop-local` 在 phase 判定里**共享自动连分支**，差别只在 transport（已由 host-runtime 处理）和 S2 文案，不在 phase。
- 输入 `ResolveOnboardingPhaseInput`：
  - `hasSeenWelcome: boolean`
  - `platformCapability: OnboardingPlatformCapability` —— 在边界由「`shouldUseDesktopDaemon()` + 是否有本机候选」算好注入（纯函数不调平台门）。
  - `localConnect: OnboardingLocalConnectState`（见下）
  - `userRequestedRemote: boolean` —— 用户点过「连接远程主机 / 改用其它连接方式」（一个会话内 UI 意图，由屏组件持有并传入）
- `OnboardingLocalConnectState`（判别联合，**让不可能态不可能**，禁 `{isLoading;error?}` 袋）：
  - `{ kind: "idle" }` | `{ kind: "connecting" }` | `{ kind: "failed"; reason: string }`
  - 由 `resolveOnboardingLocalConnectState`（已 land）从 `daemonStartService` + host-runtime 快照映射而来（不新增连接态源）。**web 同样走这里**：`connectLocal` 触发 `connectLocalCandidate` 后 upsert 的 host 的 `connectionStatus` 直接喂进来。**首跑「开始使用」前 `localConnect` 恒为 `idle`（无 host、无 daemon-start）**——但此刻 phase 仍是 `welcome`（`!hasSeenWelcome`），不会误显 connecting。

- 输出 `OnboardingPhase`（判别联合，不变）：
  - `{ kind: "welcome" }` | `{ kind: "connecting" }` | `{ kind: "picker" }` | `{ kind: "error"; reason: string }`

判定语义（纯、可穷举单测）—— **核心修订点**：

- **第一闸（不分平台）**：`!hasSeenWelcome` → `welcome`。桌面 / web / native 首访都先过一次性品牌欢迎（点「开始使用」置 flag）。
- **第二闸**：`userRequestedRemote` → `picker`（用户主动连远程，压过本地自动连）。
- **自动连分支（`desktop-local` 与 `local-candidate` 共用）**：
  - `localConnect.kind === "connecting"` → `connecting`（S2）。
  - `localConnect.kind === "failed"`：
    - `kind === "local-candidate"`（web/native）：本机候选探测确证连不上 → **落 `picker`**（兜底：web 没有「重启内建 daemon」可做，最有用的是直接给连接方式选择器去连远程/直连）。这是「picker = 真没有本地可连时的兜底」的体现。
    - `kind === "desktop-local"`（桌面）：→ `error`（S4，可重启内建 daemon、查诊断），保持现状。
  - `localConnect.kind === "idle"`（已看过欢迎、未连中、未失败、未要远程）：→ `connecting`（触发/等待自动连的瞬态，避免空屏）。
- **`remote-only`**（若边界真产出它）：第一闸后直接 `picker`。
- 一句话差异：**旧逻辑「非桌面 → 永远 picker」被删；新逻辑「有本机候选就和桌面一样先自动连，连不上时 web 落 picker、桌面落 error」。**

> 失败时 web 落 picker 而非 error 的取舍：requirement 的 S4「重试/查诊断」对桌面（管理内建 daemon）才有意义；web 浏览器对本机 daemon 没有「重启」手段，连不上时最有价值的下一步是「选个连接方式（直连别的 host / 粘配对链接）」。所以 web 的失败兜底 = picker（picker 内仍含「重试本地」让用户在本机 daemon 起来后重连）。这与「picker 退为兜底」的需求一致。

`onboarding-store.ts` 对外契约（不变，已 land）：

- selector hook 读 `hasSeenWelcome`；action `markWelcomeSeen()`（幂等）；persist `partialize` 只挑 `hasSeenWelcome`。

### 显示当前主机 / 不显端口（修订二：主文案承担，无 chip）

董事长定：**当前主机标识 + 状态由各屏主文案本身承担，不另设状态药丸 chip、不显具体端口**（验收 #14）。

- 现状已对齐：`en.onboarding.connecting.title = "Connecting to local daemon..."`、`en.onboarding.error.description` 为合并说明且**不含具体端口号**（说「local port」非「port 7070」），`resources.test.ts:270–273` 已断言。ui.html S2/S4/S3 主文案/副标题已承担「当前主机+状态」。
- **本版不再要求改文案去 port**——修订一已完成；**上一版 §3/§7 里「写死 port 7070、需改」的描述已过时，作废**。
- 失败原因（S4，桌面）仍是合并文案：`error-stage` 渲染固定 i18n 说明，`reason`（runtime 原始串）作可选诊断细节、不翻译（i18n.md「raw runtime error 不译」）。
- 不新增「当前主机」状态字段：本机 = 文案「local daemon」、远程会话 = 文案写远程主机名（远程屏不在本需求范围，沿用既有）；无 chip、无第二状态源。

### 连接中取消 → picker（修订二固化）

- S2「取消」语义 = 落 picker（不回欢迎）。现 `connecting-stage` 的 `onCancel` 已接到 onboarding-screen 的「切 picker」（`onboarding-screen.tsx:128` 当前接 `chooseRemote`，本版语义不变，仅随 `connectLocal` 重构核对接线）。
- 取消落 picker 后，picker 仍含「重试本地」（`connectLocal`），用户可重连——与「picker 退为兜底」「重开自愈」一致。

---

## 4. 复用点 / 禁止重造

### 必须复用（列出，直接用，别包一层）

| 复用                                                                            | 用在                                                      | 契约                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AddHostModal`                                                                  | S3 直连主机                                               | `visible/onClose/onSaved`；`onSaved` 后**不自己跳主页**，靠启动路由                                                                                                                                                                    |
| `PairLinkModal`                                                                 | S3 粘贴配对链接                                           | 同上同形 `onSaved`                                                                                                                                                                                                                     |
| `pair-scan` 路由                                                                | S3 扫码（手机=相机，桌面=展码）                           | `router.push("/pair-scan?source=onboarding")`（已支持该 source）                                                                                                                                                                       |
| **`bootstrapDefaultLocalhost` / `bootstrapConfiguredOverride` 的探测逻辑**      | web/native「连本机 daemon」的算法                         | **探测算法（endpoint 判据 / 超时 / serverId 校验 / `registryHasConnection` 早退 / in-flight 去重）原样复用**；修订二只把它从 `runBoot` 内私有调用**提为可被「开始使用」触发的公开 `connectLocalCandidate()`**（§1 第三行），不改算法。 |
| **`hasConfiguredLocalDaemonOverride()`**（`host-runtime.ts` 已导出）            | 边界算 `platformCapability` 是否有候选                    | 复用既有 env 判据，不重写 `process.env.EXPO_PUBLIC_LOCAL_DAEMON` 读取                                                                                                                                                                  |
| host-runtime 快照 / `daemonStartService` / `resolveOnboardingLocalConnectState` | S2 连接中、S4 失败原因（桌面）、web 连接态                | 读既有 `connectionStatus`/`lastError`/`isRunning`/`getLastError`，不新建连接态                                                                                                                                                         |
| `startDaemonIfGateAllows` + `shouldStartBuiltInDaemon`                          | `connectLocal` 的桌面分支（重试 / 重开自愈起内建 daemon） | 既有桌面 daemon 起停入口；修订二把它包进统一的 `connectLocal`，web 分支走 `connectLocalCandidate`（不再是「retry 只起桌面 daemon」）。                                                                                                 |
| `resolveStartupRoute` / `index.tsx` 重定向                                      | 「连上→进主页」（**web 探到本机 daemon 上线也走这条**）   | onboarding 不重做落点逻辑                                                                                                                                                                                                              |
| `host-runtime-bootstrap.ts` 的纯函数风格 + 其 `.test.ts`                        | `resolveOnboardingPhase`                                  | 同文件、同测试套路                                                                                                                                                                                                                     |
| `onboarding.*` / `pairing.connectionMethods.*` i18n                             | 各屏文案                                                  | 复用既有 key，新增的补全六 locale                                                                                                                                                                                                      |
| zustand persist（`sidebar-view-store.ts` 为范本）                               | `onboarding-store.ts`                                     | 同 AsyncStorage + partialize 写法                                                                                                                                                                                                      |
| `PaseoLogo`、`Button`、`startup-splash-screen` 的 spinner/alert 视觉语汇        | S1/S2/S4                                                  | 视觉与既有 splash/错误页一致                                                                                                                                                                                                           |

### 禁止重造清单（已有，别再写一遍）

- ❌ **不要在 onboarding 屏/store 里写一份新的「探 `localhost:6767`」逻辑**——复用 `connectLocalCandidate()`（由 `bootstrapDefaultLocalhost` 提升而来），经 `connectLocal` 触发。onboarding 屏只 **dispatch `connectLocal` + 读 host 快照**，不自己 `probeAndUpsertConnection`（会造第二条探测路径 / 双重 upsert，§7 取舍 0）。
- ❌ **不要新建第二个探测算法**——`connectLocalCandidate` 是把现有私有探测提为公开的同一份逻辑，不是另写一个。
- ❌ **不要为 web 造 same-origin / `window.location` transport**——§0.2 已证无此前提（daemon 不 serve web app，`buildDaemonWebSocketUrl` 无同源概念），是零收益抽象。
- ❌ **不要把 `EXPO_PUBLIC_LOCAL_DAEMON` 的 env 读取在 onboarding 里重写一遍**——用 `hasConfiguredLocalDaemonOverride()`。
- ❌ 不要新写直连/粘链/扫码的表单或连接逻辑——三个弹窗 + pair-scan 已存在。
- ❌ 不要为 onboarding 复制一份「连接中/连接失败」状态机——host-runtime + daemonStartService 已是真相源。
- ❌ 不要新起一个 onboarding 专用路由路径/守卫——沿用 `/welcome` 路由名与 `Stack.Protected guard={storeReady}`（见 §7 取舍）。
- ❌ 不要在 onboarding 组件里 `router.replace` 主页——这正是已删的 `welcome-screen` 违例。
- ❌ 不要新建 `onboarding-utils.ts` / `-helpers.ts`——判定进 `host-runtime-bootstrap.ts` 纯函数，视图进 `screens/onboarding/`。
- ❌ 不要把 S4 做成第二个「诊断页」——诊断复用 `/settings` 诊断；S4 只是「本地连不上 + 三个动作」。

---

## 5. 协议 / 平台

### 协议：**不动**

纯客户端 UI + 路由 + 本地持久化。无新 RPC、无 `server_info.features.*`、无 schema 改动 → 无 `COMPAT()`。一次性欢迎 flag 存本地 AsyncStorage（per-install，不跨设备同步，符合 requirement「真·第一次安装」语义）。

> 自检（根 CLAUDE.md 协议契约）：6 个月前的 daemon 不受影响（没碰协议）；6 个月前的 client 也不受影响（这是 client 内部行为）。通过。

### 平台门策略（修订一已 land，修订二保留）

- **「本地可连」不 = 桌面**。`platformCapability` 三态在边界由两个已有门组合算出（`resolveOnboardingPlatformCapability`），注入纯函数：
  - `shouldUseDesktopDaemon()`（= `isElectronRuntime()`）为真 → `{ kind: "desktop-local" }`。
  - 否则（web / native）→ `{ kind: "local-candidate" }`（非桌面恒有 `localhost:6767` 候选；`hasConfiguredLocalDaemonOverride()` 只改探哪个 endpoint，不改「有候选」这一事实）。
  - `remote-only` 当前无边界产出路径（保留态，见 §3）。
    > capability 回答「该走哪条连 / 连不上落哪」，与 **修订二的 boot 门（`hasSeenWelcome` 判「这次连不连」）正交**：首跑 capability 仍是 `local-candidate`，但 boot 门判延后，让它在「开始使用」前不发起探测。两者不要混进同一个判定。
- 子视图内的平台差异（S5）= **内联 `isWeb`/`isNative`**：picker 在 web 去掉扫码项 + 直连为主；手机扫码为主 CTA。差异是「CTA 顺序数组 + 是否含一项」，属小内联分支 → **不拆 `.web`/`.native`/`.electron` 文件**。
- 平台门只从 `@/constants/platform` import（`isWeb`/`isNative`/`getIsElectron`），不本地 `Platform.OS === "web"`。`shouldUseDesktopDaemon()` 仍是判桌面的唯一门。
- 不用 `Platform.OS` 当布局代理；onboarding 的居中单列布局对所有平台一致，手机变体由 `isNative` 决定 CTA，不由屏宽。

---

## 6. 测试策略

### 必须单测的纯函数 / store（不渲染即可测）

写进 `host-runtime-bootstrap.test.ts`（已存在，加 describe 块）。**修订二的新闸用粗体标注；修订一已 land 的 phase 测试只回归、不重写。**

**【新·核心】boot 门「`hasSeenWelcome ? 急切 : 延后`」（2 组，验收 #12/#13）：**

- 门是单布尔判定、**内联进 `_layout` 不抽函数**（§3「boot 门」取舍），故按行为测，二选一：
  - 行为测（推荐）：mount `HostRuntimeBootstrapProvider`，`hasSeenWelcome=false` → 断言**未**触发 web/native 探测、**未**起 daemon（boot 仍跑、注册表 ready）；`hasSeenWelcome=true` → 断言触发探测/起 daemon。用 fake store/daemonStartService（同现有 `startHostRuntimeBootstrap` 测法 `:23–:122`）。
  - 或：若实现把门做成最小可测谓词（如 `shouldEagerlyConnectOnBoot(hasSeenWelcome)`，仅当它**不止单行**才值得），则 2 组穷举 true→true / false→false。**不为单布尔强抽函数。**

**【关键不变量】路由次序（`resolveStartupRoute` index，验收 #12）：**

- genuine 首跑（`hosts:[]`、`anyOnlineHostServerId:null`、`workspaceSelection:null`、`hasSeenWelcome:false`、未 give-up）→ `redirect /welcome`（现有 `:584` 已覆盖，**回归保留**）。**配合延后 boot 保证此刻 hosts 恒空，无 :326/:330 截胡。**
- **现有 `:573` / `:666`（有保存/在线 host → 主页）= 通用路由回归，断言不动、不改注释绑定**——这是「任何有主机者进主页」的普适行为，与老用户无关。看过欢迎后重开命中即走主页（重开自愈）。

**`resolveOnboardingPhase` —— 三态 capability（修订一已 land，仅回归，不改写）：**

- 现有 `:198–:330` 全套保留（desktop-local / local-candidate / remote-only × idle/connecting/failed/未看过/用户远程）。**注**：上一版 §6 说「必删 :264/:275 web→picker 旧断言」——核对当前代码该旧断言**已不存在**（测试已是 local-candidate 形态），此条作废。

**`onboarding-store.ts`（已 land）：**

- 初始 `hasSeenWelcome===false`；`markWelcomeSeen()` 后 true、幂等；persist partialize 只含 `hasSeenWelcome`。**无迁移路径**（无存量用户）。

> 全部「真实依赖优先、确定性、判别联合断言整体」（testing.md）；store 用真实 zustand（AsyncStorage 在 vitest.setup 已 stub），**不 mock 自己的模块**。`connectLocal` / `connectLocalCandidate` 含 I/O，单测覆盖纯判定（phase/路由/boot 门行为），连接副作用走 E2E。

### 端到端验证点（对应 requirement 验收 1–14）

走真实 app（Playwright，`packages/app/e2e/*.spec.ts`，遵 testing.md「E2E 即 E2E」），抽查覆盖。**修订二必须新增/重写的粗体：**

- 验收 1/9：全新（清 AsyncStorage）首启桌面 → 见 S1（logo+slogan+开始使用+连接远程+版本，**断言无 settings testID**）。
- **验收 12（延后连接·核心）：全新首启 → 停在 S1 期间，即便本机 daemon 已在跑，也【不连接、不被弹走】**——在欢迎页停留若干秒后断言仍在 S1（host 注册表为空、未 redirect 主页）。这是反转 bug 的回归闸：上一版急切探测会在此处把用户弹进主页。
- 验收 2/3：点开始使用 → 见 S2 → 本地连上 → 落主页（不停留 S1/S2）。
- **验收 13（重开自愈）：首跑「开始使用」→ 本机连不上 → 落 picker（桌面 S4）；关闭重开 →（daemon 已起）静默连上直接进主页 /（仍连不上）回 picker（桌面 S4），【不重弹欢迎】。**
- 验收 4：二次启动（flag 已置）→ 不见 S1，直接连/落主页。
- 验收 5：点连接远程 → S3 含 直连/粘链/扫码 + 重试本地。
- 验收 6（桌面）：本地连不上 → S4 含 重试 / 改用其它 / 查看诊断，三者各自生效（重试→S2、改用→S3、诊断→/settings）。
- 验收 7（web 首跑有 daemon）：开始使用进 S2 → 探到本机 daemon → 落主页；不停 picker、不手输 host。**在真实跑着 daemon 的 web 客户端做**（MEMORY「verify functional」：看到 S2 文字不算过，要确证真连上并落主页）。
- 验收 7b（web 兜底）：web 首跑无 daemon → 开始使用进 S2 → 探测失败 → 落 S3 picker（无扫码项）+ 重试本地。
- **取消（验收对应 §3/#12 流程，ui.html S2）：S2 点取消 → 落 picker（不回欢迎）。**
- 验收 8：手机首跑（无本机 daemon 可达）→ 自动连失败兜底进 picker，扫码为主 CTA。
- 验收 11：任一屏/平台全程不手输 host:port 即可连本机。
- 验收 10/14：抽查 S1 hover / S2 加载 spinner / S4 错误态与 ui.html 像素对齐；**断言无独立状态 chip**（当前主机+状态只由主文案承担），**不靠截图 text-grep 判过**。

---

## 7. 风险与取舍

### 取舍 0（修订二核心）：连接时机 = **延后（Q）**，而非急切（A）

- 上一版采纳的「走法 A：boot 急切探本机、onboarding 只读结果」**正是欢迎页被跳过的根因**（§0.1）：首跑 probe 把 host upsert+persist，使 index 路由在欢迎闸前命中 host 去主页。
- **本版采纳 Q（延后）**：genuine 首跑（`!hasSeenWelcome`）→ boot 门内联判定为「延后」→ boot **不探/不起 daemon**；连接由「开始使用」经 `connectLocal` 触发；看过欢迎后 = 急切（恢复静默自愈）。
- 为什么 Q 而非「继续 A + 在路由层挡欢迎」：若保留急切探测，就得在 `resolveReadyIndexStartupRoute` 里再加「首跑时无视 host」的特例去硬挡欢迎——那会和「有保存主机者该进主页」这条通用路由打架，制造一个脆弱的、依赖时序的特例（host 何时 upsert vs 路由何时算）。Q 从源头让首跑前根本没有 host，路由次序无需任何特例，**消除竞态而非和竞态赛跑**。
- 仍**否** B/C（与上一版一致）：onboarding 屏自己 `probeAndUpsertConnection` = 第二条探测路径/双重 upsert（§4 禁造）；web same-origin transport = 无前提的零收益抽象（§0.2）。Q 下「探测」仍是复用 `connectLocalCandidate`（由现有私有探测提升），不新写算法。
- **代价**：需把私有探测提为公开 `connectLocalCandidate` + 统一 `connectLocal` 入口（§3）。这是 §0.3「retry 对 web 什么都不做」缺口的必要补法，且只动「触发时机/可见性」，不动探测算法——可控。

### 取舍 0b：web 本机连不上时落 **picker** 而非 error（修订一已定，保留）

- 桌面 S4「重试/查诊断」围绕「管理内建 daemon」；web 对本机 daemon 无重启手段。
- 采纳：`local-candidate` + `failed` → `picker`（内含「重试本地」，现 `canRetryLocal = capability !== "remote-only"`，已 land）。正是需求「picker 退为兜底」的落点。
- **取舍**：不为 web 复制一套桌面 S4 错误页（第二个错误面 + 无意义「查诊断」）。重试本地经 `connectLocal`（修订二统一入口）重连。

### 取舍 1：阶段是「派生纯函数」而非「store 字段状态机」（已定）

- **走法 A（采纳）**：`OnboardingPhase` 由 `resolveOnboardingPhase` 从 flag+runtime 派生，不落 store。
- 走法 B（否）：onboarding 自带一个 `phase` 可变状态机（store 里存当前态 + transition）。
- 取舍：B 会和 host-runtime 真相源打架（连接态有两份），违反「两个真相源就是 bug」。A 让阶段永远是真相的纯函数，单测穷举即可，连上后无需手动「转移到主页」——index 路由自然接管。进 store 的持久可变态只有 `hasSeenWelcome`（独立持久事实，**仅「开始使用/连远程」写、无迁移路径**）；`userRequestedRemote` 是**董事长确认的会话级 UI 意图，留组件 `useState`、不持久化**（重开仍先重试本机，符合「连远程不跨重启」）。**风险**：未来若要「跨重启记住选了远程」需上提到 store——requirement 明确不要，YAGNI，留组件。修订二的 boot 门（`hasSeenWelcome` 单布尔）trivial 内联、不落 store、不抽函数（与「不为单行抽函数」一致）。

### 取舍 2：沿用 `/welcome` 路由名，不新起 `/onboarding`（已定）

- 采纳：路由文件仍是 `app/welcome.tsx`，内部换渲染 `OnboardingScreen`；`host-runtime-bootstrap.ts` 的 `WELCOME_ROUTE` 常量与两处出口、`_layout.tsx` 的 `Stack.Protected` 守卫**零改动**。
- 否决的走法：改路由名为 `/onboarding`——会牵动 `WELCOME_ROUTE`、两个 resolve 出口、`Stack` 注册、可能的深链，纯属命名洁癖换来的迁移面。**取舍**：路由名是实现细节，对用户不可见；省下的改动面 > 命名收益。（若董事长坚持语义命名，可作为独立小改，但不在本需求范围。）

### 取舍 3：S4 复用 splash error 视觉，但**不复用 splash error 屏本身**（已定）

- splash 的 error 模式绑死 `managed-daemon-error` blocker + 硬编码英文 + 拉 desktop daemon 日志。onboarding 的 S4 是「本地连不上 + 三动作（重试/改用/诊断）」，受众和动作都不同。
- 采纳：S4 是 `screens/onboarding/error-stage.tsx` 独立视图，**借用** splash 的 alert/Button 视觉语汇与「查看诊断→/settings」入口，但不 import 那个屏。**风险**：两处都有「错误页」视觉，需保证 design token 一致（accent/danger/spacing 来自同一 theme，天然一致）。这不是重造逻辑，是两个不同语义的错误面共享原子组件。

### 取舍 4：把判定塞进既有 `host-runtime-bootstrap.ts` 而非新文件（已定）

- 该文件已是「启动判定纯函数 + 测试」之家，`resolveOnboardingPhase` 与 `resolveStartupRoute` 是同一族判定。塞进去 = 同一处集中策略（standards「集中 policy」）。
- **风险**：文件变长。但它仍是单一职责（启动期的所有路由/阶段判定），未跨域；若日后超量，整族搬进 `app/startup/` 目录是干净的下一步。当前不预先抽（零复杂度预算）。

### 跨切风险（修订二）

- **【Q 特有·头号】延后不能把首跑卡在 splash**：延后 boot 跳过 probe/daemon-start，但仍须 `store.boot()` 跑 `loadFromStorage` 让 `hostRegistryStatus` 置 `ready`——否则 `resolveStartupRoute` 停在 `loading→splash`（:425/:415），欢迎页永不出现。边界：延后只省「探测/起 daemon」，**不省「载注册表」**。E2E 验收 #12 顺带覆盖（首启确实到 S1，非卡 splash）。
- **无老用户兼容是有意为之**：Helm 未上线、无存量用户，故不写迁移、不读注册表补标 `hasSeenWelcome`。若日后真有「带 host 但无 flag」的人群（不应发生），他们也只是首启多看一次欢迎、点「开始使用」即恢复——无数据损失、无连接错误（saved host 仍在注册表里，连上即用）。这是可接受的退化，不值得为不存在的用户群写迁移。
- **web 探不到本机 daemon**：非本机浏览器/本机没装 daemon → `connectLocalCandidate` 探 `localhost:6767` 失败。
  - 兜底：`local-candidate` + `failed` → `picker`（取舍 0b），用户在那里直连别的 host / 粘配对链接，不卡 S2。
  - 不无限转圈：`bootstrapDefaultLocalhost` 的 `DEFAULT_LOCALHOST_BOOTSTRAP_TIMEOUT_MS`（2.5s）+ `hasGivenUpWaitingForHost`（5s）把 `localConnect` 推成 `failed`（两闸已存在）。S2→picker ≤5s，可接受。
- **web 连到「错的」daemon**：`localhost:6767` 被非 Helm 服务占用 → 握手 serverId/协议不符 → `failed`→picker，不误连（`probeAndUpsertConnection` 校验 serverId）。
- **dev/prod 端口漂移**：dev（override 注入）/ prod=`localhost:6767`（默认）。**onboarding 不持有任何端口**——endpoint 全走 `connectLocalCandidate` 复用的既有判据；S2/S4 文案不显端口（已对齐，§3）。
- **`local-candidate` 恒成立**：非桌面恒有 `localhost:6767` 候选 → 恒 `local-candidate`（capability 与「这次连不连」无关，那是 boot 门的事）。E2E 模式（`@paseo:e2e`）`runBoot` 提前 return，但 E2E 不走真实 onboarding 路径，且与「首跑延后跳过 probe」不冲突。
- **空屏闪**：genuine 首跑 phase 恒为 `welcome`（`!hasSeenWelcome`），不会闪 connecting；点「开始使用」后 `markWelcomeSeen` 与 `connectLocal` 同帧 dispatch，`localConnect.idle→connecting` 瞬态直接渲染 `connecting`（已 land 的 phase 逻辑），无空屏。视图测盯住「开始使用后不闪回 welcome」。
- **回归闸**：`resolveStartupRoute` 路由名沿用 `/welcome`、出口语义不变；现有 `:573`/`:666`（有保存/在线 host→主页）是通用路由回归，**断言与定性都不动**（与老用户无关）。**修订二的硬回归是 boot 门行为测（首跑不探 / 看过即探）**（§6）；上一版说的「两条 web→picker 旧断言必改写」**已不适用**（核对当前代码该断言已是 local-candidate 形态）。
- **i18n**：修订二**不新增/不改文案**（去端口已由修订一完成，`resources.test.ts:270–273` 守着）；若 `connectLocal` 重构顺带动到任何 key，六 locale + parity 测试同步。
