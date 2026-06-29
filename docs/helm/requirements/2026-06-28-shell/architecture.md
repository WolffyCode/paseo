# 架构 · 壳子（layout shell · 纯骨架）

> 日期：2026-06-28 · 状态：草拟（gate-2 待审）· 关联：[requirement.md](./requirement.md) · [ui.html](./ui.html)
> 写 **HOW 的边界**，不写逐行实现。遵循 [standards.md](../../standards.md) + [frontend-architecture.md](../../frontend-architecture.md)（模型驱动 UI = 铁律）。
> 一句话：壳 = **一个 Zustand 模型 + 一层纯 selector + 一个 facade + 一组空容器视图**；模型管「划区/摆位/改宽/显隐/切页/返回」，视图只渲染 + dispatch，内容一律是 slot。

---

## 0. 架构走法比选（先定大方向）

落地前比选三条走法，避免拍脑袋：

| 走法                                                  | 描述                                                                                                                                                             | 取舍                                                                                                                              | 结论              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **A. 一个壳模型（store）+ 纯 selector 层 + facade**   | page 模式 / 三 toggle / settings toggle / 宽度 全收进**一个** `shell-store`；派生 `selectVisibleRegions`/`selectTopBar` 为纯函数；对外只暴露 `useShell()` facade | 状态是**一个事务性整体**（切页/返回要跨 slice 原子改）；selector 一次读一份快照出一份形状                                         | ✅ **采用**       |
| B. 三个 store（布局/页面导航/宽度各一）               | 按「概念」拆三个 Zustand store                                                                                                                                   | `openSettings/closeSettings` 要跨 store 事务（页面 store 改 page、布局 store 要被快照/恢复）→ 反而引入跨 store 协调复杂度；零收益 | ❌ 否（过度拆分） |
| C. 保留旧 `shell-layout-store` 打补丁加 page/settings | 在既有 store 上加 `currentPage`/`settingsLeftOpen`，旧 `selectTopBarModel` 留 title/project/branch                                                               | 违反 standards §2「重构而非打补丁」；旧 selector 仍掺内容（title/project/branch）= gate-1 否的「壳子太满」                        | ❌ 否（留考古层） |

**模型个数 = 1（壳模型 store）**，理由钉死：`frontend-architecture.md §三`「每个壳/域一个模型」，壳是**一个域**；切页/返回是**跨 slice 的原子事务**，拆 store 只会制造跨 store 协调。store 内部按职责分**三个状态切片**（页面导航 / 区域显隐 / 区域几何），但它们同属一个真相源、一份快照。宽度的**数学**是纯函数（进 selector 层），宽度的**状态**是 store 的一个切片——math 与 state 分层，不混。

> **关键洞见（决定整套设计的简洁度）**：设置是**壳内页面模式**（in-shell state），不是路由跳转；且设置页有自己独立的 `settingsLeftOpen`，**设置态永不改动对话页的任何 flag**。⟹ §6.18「返回恢复对话页布局」是**靠状态隔离白拿的**，不需要任何 `_preSettingsSnapshot` 快照/恢复机制。比选时考虑过显式快照恢复，**否决**（零复杂度预算：隔离即恢复）。

---

## 1. 模块划分与目录结构

新增**一个独立模块** `packages/app/src/shell/`，单一职责 = 公共壳骨架；**不 import 任何区内内容**（对话树/消息/Composer/工作面板/文件树/设置导航/设置详情一律不碰）。

```
packages/app/src/shell/
├── model/
│   ├── shell-store.ts          # 壳模型：state（3 切片）+ public actions + private helper + persist
│   └── shell-store.test.ts     # action 改 state 的断言（不渲染可测）
├── selectors/
│   ├── regions.ts              # 纯派生层：常量 + clamp/drag 数学 + selectVisibleRegions/selectTopBar + 所有共享类型
│   └── regions.test.ts         # 纯函数断言（8 组合 / 两页 / 到限）
├── api/
│   └── use-shell.ts            # 唯一 facade：actions 对象 + 精准订阅 selector hooks + 组合方法 pattern 锚点
├── components/                 # 视图层：只渲染 selector 派生 + dispatch facade action，零业务逻辑
│   ├── shell-root.tsx          # 路由级装配：读 ctx → useShell → 摆顶栏 + region 行 + slot
│   ├── top-bar.tsx             # 唯一顶栏（交通灯安全区 + 返回钮 + 三 toggle + 中央空 slot）
│   ├── region-frame.tsx        # 单区浮卡几何（宽/边框/半透明白 surface），内含 children slot
│   ├── region-gutter.tsx       # 8px ResizeGutter（hover/拖拽/到限/双击复位）
│   ├── region-placeholder.tsx  # 统一「虚线空占位 + 区域名」（本期各区交付物）
│   ├── settings-entry.tsx      # 左栏底「设置」入口按钮（壳层唯一保留的左栏内控件 → openSettings）
│   └── back-button.tsx         # 设置页顶栏左上「← 返回」（→ closeSettings）
└── theme/
    └── shell-tokens.ts         # 语义 token 映射到既有 codePilot 主题（不自创色值，见 §8）
```

**依赖 DAG（单向，禁环）**：

```
components ──→ api(use-shell) ──→ model(shell-store) ──→ selectors(regions, 纯)
     │                                                        ↑
     └──────────── 也 import selectors 的类型 + 调 selector ────┘
components ──→ theme(shell-tokens) ──→ @/styles/theme（既有 codePilot）
```

`selectors/` 是依赖汇（sink）：不 import store、不 import React、不碰 DOM——纯 TS，处处可单测。

**路由归属**：壳挂在**新路由** `app/h/[serverId]/home.tsx`，渲染 `<ShellRoot/>`。详见 §4。

---

## 2. 模型类设计（壳 store · 董事长点名块 ①）

**`packages/app/src/shell/model/shell-store.ts`** —— 唯一壳模型。下表「公私 × 属性/方法」逐项定契约（每个 action/纯函数顶部要带一行契约注释，standards §3）。

### 2.1 公共属性（public state · 经 selector 暴露、只读 · UI 不能直接 set）

| 属性               | 类型                                                             | 切片     | 契约                                                                                                    |
| ------------------ | ---------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `currentPage`      | `ShellPage = "conversation" \| "settings"`                       | 页面导航 | 当前主体页面模式；二者互斥，同一时刻只其一                                                              |
| `leftOpen`         | `boolean`                                                        | 区域显隐 | **对话页**左栏展开态（默认 `true`，对应 s1）                                                            |
| `rightOpen`        | `boolean`                                                        | 区域显隐 | **对话页**右栏展开态（默认 `false`）                                                                    |
| `fileTreeOpen`     | `boolean`                                                        | 区域显隐 | **对话页**目录树展开态（默认 `false`）                                                                  |
| `settingsLeftOpen` | `boolean`                                                        | 区域显隐 | **设置页**左导航展开态（默认 `true`，对应 s5a）；**与 `leftOpen` 独立**——这是「返回白拿恢复」的结构前提 |
| `leftWidth`        | `number`                                                         | 区域几何 | 左栏/设置导航**共享的全局**宽度（px，已 clamp 到 180–300，默认 240）；全局非按工作区——进出对话不移动它  |
| `widthByRegion`    | `Record<WorkspaceKey, Partial<Record<WorkspaceRegion, number>>>` | 区域几何 | 右栏/目录树**按工作区**记忆宽度（已 clamp）；左栏不入此表（它走全局 `leftWidth`）                       |

> `WorkspaceKey = serverId:workspaceId`（沿用全仓既有约定）；`WorkspaceRegion = "right" \| "fileTree"`。
> **持久化**：`persist`（AsyncStorage）只存上面除 `currentPage` 外的全部——`currentPage` **不持久化**，重载永远落「对话页默认态」（§3 落地态）。

### 2.2 私有属性（`_` 前缀 · 不进 facade · 组件碰不到）

| 属性        | 类型      | 契约                                                                           |
| ----------- | --------- | ------------------------------------------------------------------------------ |
| `_hydrated` | `boolean` | persist 回灌完成标记；首帧用它压住宽度闪烁（rehydrate 前别按默认宽画一帧再跳） |

> **刻意不设** `_preSettingsSnapshot`：返回恢复靠状态隔离白拿（§0 洞见），无快照。
> **刻意不进 store** 的：拖拽手势的瞬时锚点（`startX`/`startWidth`）——它是单次手势的 ephemeral，selector 永不读、跨渲染不存活，留在 gutter 组件的 ref（判据：「selector 会读它吗？」否 ⟹ 不进模型，见 §6）。

### 2.3 公共方法（public actions = UI 唯一入口 · 动词命名 · 每个一个明确意图）

| Action               | 签名                                                               | 切片     | 契约（做什么/为什么）                                                                     |
| -------------------- | ------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------- |
| `openSettings`       | `() => void`                                                       | 页面导航 | 切 `currentPage="settings"`；**不动**任何对话页 flag/宽度（隔离 ⟹ 返回白拿恢复）          |
| `closeSettings`      | `() => void`                                                       | 页面导航 | 即「← 返回」：切 `currentPage="conversation"`；对话页切片本就没被动过，自动复原           |
| `toggleLeft`         | `() => void`                                                       | 区域显隐 | 翻转 `leftOpen`（对话页左栏）；additive，不连带 right/fileTree                            |
| `toggleRight`        | `() => void`                                                       | 区域显隐 | 翻转 `rightOpen`；顶栏右栏 toggle 按钮用（按钮不算 `rightOpen?close:open`，转移在模型里） |
| `toggleFileTree`     | `() => void`                                                       | 区域显隐 | 翻转 `fileTreeOpen`；独立、可与 right 同开                                                |
| `toggleSettingsLeft` | `() => void`                                                       | 区域显隐 | 翻转 `settingsLeftOpen`（设置页左导航）；机制同 `toggleLeft`，但作用于设置切片            |
| `openRight`          | `() => void`                                                       | 区域显隐 | **幂等**置 `rightOpen=true`；给组合方法用（无论当前态都「确保展开」，见 §3.3）            |
| `closeRight`         | `() => void`                                                       | 区域显隐 | **幂等**置 `rightOpen=false`；组合/对称用                                                 |
| `setLeftWidth`       | `(px: number) => void`                                             | 区域几何 | 写全局 `leftWidth`（经 `clampRegionWidth("left", px)`）；左栏拖拽落点                     |
| `setRegionWidth`     | `(key: WorkspaceKey, region: WorkspaceRegion, px: number) => void` | 区域几何 | 写某工作区某工具宽度（经 clamp）；不碰别的工作区/别的工具                                 |
| `resetRegionWidth`   | `(region: ShellRegion, key?: WorkspaceKey) => void`                | 区域几何 | 复位到该区 `default`（gutter 双击复位用）；left 写全局、right/fileTree 写该 key           |

### 2.4 私有方法（`_` 前缀 helper · 组件调不到）

| Helper     | 签名                                        | 契约                                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_setOpen` | `(field: OpenField, open: boolean) => void` | 区域显隐的唯一内部原语；`toggleLeft/toggleRight/toggleFileTree/toggleSettingsLeft/openRight/closeRight` 全delegate 到它（**复用**justify 抽取，非单行 indirection）。`OpenField = "leftOpen"\|"rightOpen"\|"fileTreeOpen"\|"settingsLeftOpen"` |

> 不再抽别的私有 helper——clamp/drag 数学在 selector 层（纯函数），不在 store 里重造（抽函数克制，standards §4）。

---

## 3. API 设计（facade · 董事长点名块 ②）

**`packages/app/src/shell/api/use-shell.ts`** —— 壳对外**唯一**入口。组件**只能** import 这里，碰不到 store 内部 → 真正的公私分离（frontend-architecture §三）。

### 3.1 派生类型（命名 shape，定义在 `selectors/regions.ts`，不 inline）

```text
ShellPage         = "conversation" | "settings"
ShellRegion       = "left" | "right" | "fileTree"
WorkspaceRegion   = "right" | "fileTree"

ShellContext      = { workspaceKey: string | null; showsShell: boolean }
   // 路由提供模型不知道的两件事：当前工作区身份(键宽度记忆) + 是否显示壳(连接前为 false)。
   // page 不在 ctx 里——page 是模型自己的 state（snapshot.currentPage）。

VisibleRegions    = { main: true; left?: number; right?: number; fileTree?: number }
   // 某 side 键存在 = 渲染它，值 = 解析后的宽度；main 恒 true 且无宽（flex-1）。
   // 设置页时 left = 设置导航宽度（同左栏几何），right/fileTree 永不出现。

ToggleModel       = { active: boolean; enabled: boolean }
TopBarModel       = { showBack: boolean; left: ToggleModel; right: ToggleModel | null; fileTree: ToggleModel | null }
   // 无 title/project/branch——那是 deferred 内容(§7 a)，壳顶栏中部只一个静态空 slot。
```

### 3.2 公共 actions + selectors（facade 暴露面 · 完整签名 + 契约）

**Actions**（稳定对象，import 不触发订阅）：

```text
useShellActions(): ShellActions
   // 返回 §2.3 全部 11 个 action 的稳定引用；组件事件直接调，零组合逻辑。
```

**Selector hooks**（精准订阅 · 只订相关切片 · 派生不持副本）：

```text
useShellPage(): ShellPage                              // 订 currentPage
useVisibleRegions(ctx: ShellContext): VisibleRegions   // = selectVisibleRegions(snapshot, ctx)
useTopBar(ctx: ShellContext): TopBarModel              // = selectTopBar(snapshot, ctx)
useShell(ctx: ShellContext): { page; visible; topBar; actions }
   // ShellRoot 用的便利 facade，一次拿齐；叶子组件用上面的细粒度 hook 精准订阅。
```

**底层纯 selector**（`selectors/regions.ts` · 单测直接喂快照）：

```text
clampRegionWidth(region: ShellRegion, px: number): number
   // 夹到该区 [min,max]；非有限输入 → default（脏存储值永不致坏布局）。【复用既有，不重写】

resolveRegionWidthFromDrag(i: { region; startWidth; deltaPx }): number
   // 拖拽 delta → 新宽 = clamp(startWidth + deltaPx)；越界即停在界。【复用既有，不重写】

selectVisibleRegions(snapshot, ctx): VisibleRegions
   // 决定哪些卡渲染 + 各 side 宽。main 恒在；
   //   conversation 页：leftOpen→left(=leftWidth)；workspaceKey 在且 rightOpen→right(按工作区宽)；fileTreeOpen→fileTree(按工作区宽)
   //   settings 页：settingsLeftOpen→left(=leftWidth, 设置导航同左栏几何)；right/fileTree 永不出现
   //   showsShell=false（连接前）：只 { main:true }

selectTopBar(snapshot, ctx): TopBarModel
   // 派生顶栏：
   //   conversation 页：showBack=false；left/right/fileTree 三 toggle，active=各 flag，right/fileTree.enabled 需 workspaceKey
   //   settings 页：showBack=true；left.active=settingsLeftOpen；right=fileTree=null（设置页无此二 toggle）
```

### 3.3 组合方法 pattern（壳暴露**可组合 API 面**，内容 deferred 但 pattern 立住）

壳只提供**原子壳行为**；复杂交互由原子**组合**而成，**壳不新增布局原语**（requirement §6.17）。组合方法**归内容层**，但用壳的原子 + 本文档钉死的 pattern：

```text
// —— 后续内容里程碑示意，壳本期不实现，只立 pattern 锚点 ——
openSubConversation(id):                       // 点左栏子对话 → 展右栏 + 建侧边聊天
   = useShellActions().openRight()             //   ← 壳原子（本期已交付）
   + sideChatStore.create(id)                  //   ← 内容动作（§7 deferred）

openReviewForDiff(path):                       // 打开审查工具看某 diff
   = useShellActions().openRight()             //   ← 壳原子
   + workspaceTabsStore.openTab("review", …)   //   ← 内容动作（§7 deferred）
```

**铁律**：组件**只调组合方法**，**绝不**在组件里手写 `openRight() + create()` 这串——否则组合逻辑散进 UI，违反单向数据流（frontend-architecture §四）。壳本期交付的就是 `openRight/closeRight/toggle*/openSettings/closeSettings` 这组**可被组合的原子**。

---

## 4. 模型关系 / 联动（董事长点名块 ③）

### 4.1 壳模型 ↔ 新路由 `/h/[serverId]/home`

- **新增路由** `app/h/[serverId]/home.tsx` → 渲染 `<ShellRoot/>`，是连上主机后的**对话页落地点**（requirement §3「连上主机进入主体区」、§5「onboarding 连接成功落点不变」）。
- **改向** `app/h/[serverId]/index.tsx`：`Redirect` 目标从 `buildHostOpenProjectRoute` 改为新增的 `buildHostHomeRoute(serverId)`（`utils/host-routes.ts` 加一个 builder）。`/home` 成为连接态唯一落地。
- **ShellRoot 喂 ctx**：`showsShell` 取自既有 `chromeEnabled`（连接门）；`workspaceKey` 取自既有 `useActiveWorkspaceSelection()`（无选择时为 null / 骨架期可给稳定占位键）。`page` 不进 ctx——它是模型 state。
- **设置不再是路由**：旧 `/h/[serverId]/settings.tsx` + 全局 `/settings/*` 的「跳走」语义，**收敛**为 `currentPage` 壳内切换（requirement §5）。骨架期设置区是空容器；旧设置路由内容属 §7 deferred。**deep-link/快捷键进设置**今后改为 dispatch `openSettings()` 而非导航到设置路由（§10 风险列出）。

### 4.2 page 切换怎么驱动 `selectVisibleRegions`（联动主线）

```
设置入口(左栏底) 按下 → openSettings() → currentPage="settings"
   → selectVisibleRegions 走 settings 分支：{ main, left? = settingsLeftOpen?leftWidth }，right/fileTree 强制不出
   → selectTopBar 走 settings 分支：showBack=true、right/fileTree=null
   → ShellRoot 重渲染：顶栏出「← 返回」、主体变 [设置导航 | 设置内容]

顶栏「← 返回」按下 → closeSettings() → currentPage="conversation"
   → selectVisibleRegions 走 conversation 分支：读回 leftOpen/rightOpen/fileTreeOpen + 各宽度
   → 因为 settings 期间这些 flag/宽度从没被改过 → 布局/宽度/选中原样复原（白拿恢复）
```

**「当前选中」恢复**同理：选中态是**内容 state**（session-store / navigation-active-workspace-store），设置是壳内 page 切换**不是路由跳转**，故内容 store 全程未动 → 返回即在。壳**不持有**选中态副本（不造第二真相源，standards §1）。

### 4.3 切片之间 / 跨区联动（组件零耦合）

- 三个 toggle **additive 独立**：`_setOpen` 只改自己那个 field，互不连带 → 8 种组合天然合法（s3 矩阵），无需任何「互斥」协调代码。
- 左栏在两页**共享同一个区**：同一份 `leftWidth`、同一几何、顶栏同一个左 toggle 按钮位 = requirement §6.13「共享为同一个、非两份副本」；而**展开态**按页各记（`leftOpen` vs `settingsLeftOpen`）→ 既满足「同一个」又满足返回隔离恢复。
- 跨区复杂行为（展右栏 + 建侧聊）= 调各模型**公共 API 组合**（§3.3），组件之间**零直接耦合**。

---

## 5. 数据流（严格单向）

```
UI 事件                         模型(public action)            selector(纯)              渲染
─────────                       ───────────────────            ──────────                ────
顶栏 toggle 点击     ───────→   toggleLeft/Right/FileTree  ─→  selectTopBar          ─→  TopBar 重画(active/enabled)
设置入口点击         ───────→   openSettings               ─→  selectVisibleRegions  ─→  ShellRoot 换 [nav|content]
顶栏 ← 返回点击       ───────→   closeSettings              ─→  selectVisibleRegions  ─→  ShellRoot 回对话布局
设置导航 toggle       ───────→   toggleSettingsLeft         ─→  (两 selector)         ─→  设置导航卡显/隐
gutter 拖拽(每帧)     ───────→   setLeftWidth/setRegionWidth ─→ selectVisibleRegions  ─→  相邻卡改宽 + 中区自适应
gutter 双击          ───────→   resetRegionWidth           ─→  selectVisibleRegions  ─→  复位默认宽
```

- **严禁**：组件间直接操作彼此 / 组件里写转移或分支策略 / 绕过模型改 UI（frontend-architecture §四）。
- gutter 拖拽中：手势锚点在组件 ref（ephemeral），每帧用纯 `resolveRegionWidthFromDrag` 算新宽 → 调 `setRegionWidth`/`setLeftWidth` 提交（clamp+persist 在 action 里）。视觉效果态（气泡/到限阻力）属后续，本期只要「能拖+受限+记忆」。

---

## 6. 模型与 UI 分离（判据：不渲染就能测）

| 落在哪层               | 内容                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **model（store）**     | `currentPage`/四个 open flag/`leftWidth`/`widthByRegion` 这些 state；11 个 action 的转移；persist。**全部不渲染可测**。                                                                                                                                 |
| **selector（纯函数）** | `selectVisibleRegions`/`selectTopBar`/`clampRegionWidth`/`resolveRegionWidthFromDrag`——`state → UI 形状`，无副作用、不碰 React/DOM。                                                                                                                    |
| **view（组件）**       | `ShellRoot`/`TopBar`/`RegionFrame`/`RegionGutter`/`RegionPlaceholder`/`SettingsEntry`/`BackButton`：**只**用 hook 读 selector + 事件调 action。**零业务 useState**（hover/拖拽锚点这类纯交互瞬时态可留组件本地——它们 selector 永不读、不是 app 真相）。 |

- 不持有 model 已知数据的 UI 副本（选中态/宽度都 selector 派生），**两个真相源就是 bug**。
- 新行为先落 store action / 纯函数，组件调之；判据反复用：**「这段不渲染能不能测？」能 ⟹ 放对了**。

---

## 7. 复用点 / 禁止重造

### 复用（直接用，禁重写）

- **宽度数学** `clampRegionWidth` / `resolveRegionWidthFromDrag` / `REGION_CONSTRAINTS`（left 180/300/240、right 320/800/480、fileTree 220/500/280）：从旧 `stores/shell-regions.ts` **搬进** `shell/selectors/regions.ts`，数值与 UI s3 完全一致，**不许改值/重算**。
- **既有主题 token**：`surfaceShell`/`surfaceSidebar`/`sidebarTranslucent`/`secondary`/`surfaceSidebarHover`/`border`/`foreground`/`foregroundMuted`（`styles/theme.ts` 的 `codePilot` 块）+ 半透明白卡模型 `styles/card-surface.ts`（`--platform-surface-*`）。壳 `theme/shell-tokens.ts` 只做**语义映射**，**禁自创色值**（§8）。
- **交通灯安全区** `useWindowControlsPadding("sidebar")` + `TitlebarDragRegion`（`components/desktop/*`）：顶栏左侧预留位直接复用。
- **vibrancy 窗口机制** `packages/desktop/src/window/window-manager.ts`（已实现 transparent+vibrancy，§8）：复用，**禁在 app 层重造窗口 chrome**。
- **图标** lucide `PanelLeft`/`PanelRight`/`FolderTree`/`Settings`/`ChevronLeft` + `withUnistyles` 着色 pattern。
- **平台门** `@/constants/platform` 的 `isWeb`/`isNative`、`useIsCompactFormFactor`（紧凑态 deferred 用）。
- **hover 范式** `docs/hover.md`：gutter = 纯 View + `onPointerEnter/Leave`；toggle = Pressable + `onHoverIn/Out`（沿用旧 gutter/top-bar 写法）。

### 禁止重造（已有的别再写一遍）

- ❌ 不另造主题/调色板；不引入 charcoal 等冲突配色（唯一色源 = codePilot github.json）。
- ❌ 不重写 clamp/drag/min-max（上面已有）。
- ❌ 不重造交通灯 padding、不重造 vibrancy 窗口配置。
- ❌ **不把内容拖进壳**：`LeftSidebar`/`SettingsSidebar`/`FileExplorerPane`/`workspace-layout-store`/对话树/Composer 一律**不 import**——各区是 `RegionPlaceholder` 空容器；右栏 toggle **不再**驱动 `workspace-layout-store`（旧 home-shell 的内容耦合，删）。
- ❌ 顶栏**不画** title/project/branch/···/分支（§7 deferred 内容）。

### 删除（重构而非打补丁，standards §2 · 同一改动里删旧、不留 dead gate）

- 删 `stores/shell-layout-store.ts`(+test) → 被 `shell/model/shell-store.ts` 取代。
- 删 `stores/shell-regions.ts`(+test) → 纯函数搬入 `shell/selectors/regions.ts`，**剔除** `selectTopBarModel` 里的 title/project/branch。
- 删 `screens/home-shell/*`（home-shell / region-frame / region-gutter / unified-top-bar）→ 内容耦合版，被 `shell/components/*` 纯骨架版取代。
- 改 `app/_layout.tsx`：移除 `HomeShell` 持久包裹 + 其对 `shell-layout-store` 的引用（`toggleShellRegion` 等）；壳改由 `/home` 路由自渲染（§10 风险①给迁移边界）。

---

## 8. 协议 / 平台 / 主题与窗口（背景方案 = 董事长定的 C）

### 8.1 协议 / 平台门

- **不动协议**：纯前端结构 + 壳行为重写，无 schema/RPC/`server_info.features.*` 变更，无 `COMPAT()`。
- **桌面 only**：model/selectors/api **平台无关**（纯 TS，不碰 DOM）→ 跨端余地天然留好（API-first）。
- gutter 指针拖拽 **web-only**：沿用旧法内联 `isWeb` 守卫（小分支）；若日后 native 实现分叉，再拆 `region-gutter.web.tsx` / `.native.tsx`，**位先留**。
- **紧凑/移动态 deferred**：在 ShellRoot 之上由既有 `useIsCompactFormFactor()` 选「骨架 vs 移动抽屉」——本期只留这道门的缝，移动实现后续统一做（桌面优先备忘）。

### 8.2 主题与窗口（Approach C：透明窗 + vibrancy + 淡蓝兜底 + 半透明白卡）

**机制背景**：codePilot 源码整体背景是纯白 `#ffffff`，那层蓝**来自 macOS vibrancy**（NSVisualEffectView 透过窗口）。Helm 用四层复刻这套质感，**分层owner 钉死**：

| 层                         | 归谁 / 哪个文件                                                                                             | 做什么                                                                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **① vibrancy 窗口（mac）** | **desktop window-manager** `packages/desktop/src/window/window-manager.ts`（Electron main）                 | mac 上 `transparent:true` + `vibrancy:"menu"` + `visualEffectState:"followWindow"` + alpha-0 backgroundColor，并在每次 loadURL 后**重挂** vibrancy 面。**已实现** → 复用，app 层不碰窗口 chrome。 |
| **② 淡蓝 CSS 兜底**        | **shell theme** `shell/theme/shell-tokens.ts` 的 `surfaceShell` token + ShellRoot 根 View / web body 背景   | 无 vibrancy 时（**非 mac** 的 Electron 走 window-manager 的 solid 不透明窗、以及**纯浏览器 web**）也有一层**很淡的固定浅蓝**，保「白卡 + 蓝底」永远成立。                                         |
| **③ 半透明白 surface**     | **既有 platform-surface 模型** `styles/card-surface.ts` + `sidebarTranslucent`（`rgba(255,255,255,~0.58)`） | 各区卡用**半透明白**叠在 vibrancy/兜底之上 → mac 透出 vibrancy 蓝、非 mac 透出 ② 的淡蓝，观感统一。复用，禁重造。                                                                                 |
| **④ 卡片提升**             | `styles/card-surface.ts`（轻投影 + 1px inset 白环）                                                         | 把白卡从背景**抬起**，gutter 透出底层。复用。                                                                                                                                                     |

> **必须 reconcile 的一处冲突（refactor 不留考古）**：`styles/theme.ts` 现有 `surfaceShell: "rgb(188, 209, 225)"` 注释写「solid 不透明、各区**不是**白卡」——这套「实心蓝底 + 非白卡」模型与 Approach C **相反**。开发须把该 token + 注释**改成** Approach C 语义（淡蓝兜底，各区**是**半透明白卡），**不得**两套背景模型并存留矛盾注释。主题**数值拥有权**仍属 codepilot-layout，本壳需求只**消费** platform-surface + 淡蓝兜底 token，并点名这一处需归一。

- **壳模型与窗口/vibrancy 零关系**：vibrancy/透明窗是**平台×主题的纯呈现层**，完全在壳 model/selector 之外——壳模型**永不读** vibrancy 态。这保证 §2–§4 的模型/API/联动主线不被平台细节污染。

---

## 9. 测试策略（必测纯函数 / store · 对齐验收标准）

### 9.1 `model/shell-store.test.ts`（action 改 state · 不渲染）

- 初始态 = s1：`currentPage="conversation"`、`leftOpen=true`、`rightOpen=false`、`fileTreeOpen=false`、`settingsLeftOpen=true`、`leftWidth=240`。【验收 3、4】
- `toggleLeft/toggleRight/toggleFileTree` 各只翻自己那个 flag，**另两个不变**（additive 独立）。【验收 5、6】
- `openRight/closeRight` **幂等**置真/假（重复调不抖）。
- `setLeftWidth(px)` clamp 到 [180,300]；`setRegionWidth(k,"right",px)` clamp 到 [320,800] 且**只**改 `k` 这一工作区、不碰别的 key/别的工具。【验收 7】
- `resetRegionWidth("left")` 回 240；`resetRegionWidth("right", k)` 回 480。
- **`openSettings()` 隔离断言（核心）**：调用后 `leftOpen/rightOpen/fileTreeOpen/leftWidth/widthByRegion` **逐项不变**，只 `currentPage` 变。【支撑验收 12 返回恢复】
- **`closeSettings()` 恢复断言**：`openSettings()` → 任意 `toggleSettingsLeft()` → `closeSettings()` 后，对话页五项与进入前**全等**。【验收 12】
- `toggleSettingsLeft()` 只翻 `settingsLeftOpen`，**永不**碰 `leftOpen`。【验收 11、13】
- persist `partialize` **不含** `currentPage`（重载落对话页）。

### 9.2 `selectors/regions.test.ts`（纯函数断言）

- `clampRegionWidth`：边界夹紧 + 非有限 → default。
- `resolveRegionWidthFromDrag`：add-then-clamp，越界停界。
- `selectVisibleRegions` conversation：**枚举 8 种 toggle 组合** → `main` 恒在、各 side presence/宽度正确；`right/fileTree` 缺 `workspaceKey` 时即便 flag=true 也不出。【验收 5、6】
- `selectVisibleRegions` settings：只 `main` + (`settingsLeftOpen`?`left`)；**即便 `rightOpen=true` 也绝不出 right/fileTree**。【验收 9】
- `selectVisibleRegions` `showsShell=false`：只 `{ main:true }`。
- `selectTopBar` conversation：`showBack=false`；三 toggle `active` 映射各 flag；`right/fileTree.enabled` 仅在有 `workspaceKey` 时真。【验收 8、10】
- `selectTopBar` settings：`showBack=true`；`left.active=settingsLeftOpen`；`right=fileTree=null`。【验收 9、10】

### 9.3 端到端验收点（对应 requirement §8，功能真生效、不靠截图）

- 唯一顶栏贯穿整宽、四区卡序 `左→中→右→目录树`、中区恒在自适应【1–4】；三 toggle 独立 + 8 组合【5、6】；三侧区拖拽受限 + 按工作区记忆【7】；设置入口（左栏底）→ 设置页、返回钮（顶栏左上）→ 对话页且布局/宽度/选中复原【8–13】；各区空容器但开/关/拖/切页/返回当场可用【14】；§7 内容清单逐条仍标 deferred、壳里无任何区内业务内容【15】；全态交互齐【16】；浅/深 + vibrancy/兜底双适配观感一致【18、19】。

---

## 10. 风险与取舍

1. **解除持久 chrome 包裹的爆炸半径**：旧 `HomeShell` 包整个 RootStack，删它后遗留内容路由（new/sessions/workspace/agent）会暂时失去 chrome。**取舍**：本期壳是**纯骨架、内容 deferred**，把 `/home` 设为连接态落地、遗留内容路由划入 deferred 内容（首个内容里程碑 = 把对话内容搬进中区 slot）。**这样换来壳的纯净**（refactor-not-patch，旧壳整删无 dead gate）。迁移边界：开发保留遗留路由可达，但默认落 `/home`；不为「同时养两套壳」写兼容分支。
2. **设置改 in-shell state 后的 deep-link/快捷键**：原先导航到设置路由的入口（URL、⌘ 快捷键）需改为 dispatch `openSettings()`。骨架期设置区空容器，reconcile deep-link 属内容衔接（§7 g 32）。风险登记，本期只立壳内切换骨架。
3. **骨架期 `workspaceKey` 占位**：尚无真实对话选择时，右栏/目录树的「按工作区记忆」用路由给的占位键。**取舍**：宽度记忆暂挂占位键，真实工作区身份由对话内容里程碑接入即生效；不提前为「无工作区」造特例分支（零复杂度预算）。
4. **一个 store vs 三个**：已在 §0 定 1 个并给理由（事务性内聚）；**触发重审的信号**：某切片长出独立生命周期（如宽度要独立持久化策略）时再拆——现在拆是过度设计。
5. **返回恢复依赖「设置永不改对话 flag」**：这条隐性不变量是「白拿恢复」的地基。若日后某设置内功能反向改对话态，恢复假设破裂。**护栏**：§9.1 的 `openSettings()` 隔离单测把它钉成回归红线，任何违背即测试失败。
6. **`surfaceShell` 双背景模型并存**：§8.2 已点名——实心蓝底模型与 Approach C 半透明白卡模型冲突，须在本期归一（改 token+注释），否则留矛盾考古层。取舍：归一到 C，主题数值改动最小、只动这一处语义。
