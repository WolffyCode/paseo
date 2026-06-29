# 架构 · 主界面整体布局（CodePilot 主壳骨架）

> 日期：2026-06-27 · 状态：草拟（gate-2 待审）· 关联：[requirement.md](./requirement.md) · [ui.html](./ui.html)
> 写 **HOW 的边界**，不写逐行实现（实现交 helm-developer）。遵循 [standards.md](../../standards.md)。
> 本期 = **整体骨架替换**（统一顶栏 + 4 区 + 3 toggle + 拖拽改宽 + codePilot 主题）。**各面板内部一律 slot 化包裹现有内容、不重画**。

---

## 0. 分阶段边界表（本期 in-scope vs 后续 deferred）——最重要

董事长打法：**先按骨架整体换掉主壳，之后再挨个换每个面板内部**。本期把现有 app 桌面主壳**整体替换**为新骨架，4 区各开一个**内容 slot**，slot 里**原样塞现有面板内容**；后续每个面板内部各自独立成阶段再换。

| 维度 | 本期 in-scope（骨架，必须完整交付） | 后续 deferred（各面板内部细节，本期只留 slot 不动） |
|---|---|---|
| **统一顶栏** | 一条贯穿整宽 h40 顶栏；承载窗口控制安全区 + 左/目录树/右 三 toggle + 标题/项目/分支/··· **槽位**（位置 + 显隐 + 活跃态） | ··· 菜单**项内容与行为**、分支点击跳转、环境信息/置顶 popover、打开位置列表、命令面板/搜索浮层 |
| **左栏（①）** | 卡片外壳 + 位置 + 默认 240 + 拖 180–300 + codePilot 皮肤；**slot = 现有 `LeftSidebar` 内胆原样**（主机切换器 / 新对话 / 搜索 / 对话树 / 设置） | 对话树语义（项目→对话→subagent 嵌套、状态点、右键、内联重命名、拖排序）、主机切换器全流程、搜索面板 ——**含"对话状态点挪到对话图标前"这类微调** |
| **中区（②）** | 卡片外壳 + flex 填充 + 始终在场 + 空态占位容器；**slot = 现有对话画布内容原样** | 消息流形态、Composer 全态（命令 token / @ / 队列 / 附件 / 模型选择器） |
| **右栏（③）** | 卡片外壳 + 位置 + 默认 480 + 拖 320–800 + 独立 toggle；**slot = 现有右工具面板内容原样**（审查/终端/浏览器 tab 壳） | 多页签新建/关闭/调序、启动器列表、**放大/缩小（maximize）**、各 tab 内部 |
| **目录树（④）** | 升格为**独立第 4 区**卡片 + 位置（最外侧）+ 默认 280 + 拖 220–500 + 独立 toggle；**slot = 现有 `FileExplorerPane` 原样** | 文件树展开/选中/预览、排序/隐藏文件、右键菜单 |
| **3 toggle** | 三个独立显隐开关（additive 非互斥）+ 顶栏活跃态反映各自面板 | 拖拽**视觉效果态**（手柄高亮样式/宽度气泡/到 min-max 阻力反馈） |
| **拖拽改宽** | 三侧区可拖、min/max/默认已定、**按工作区记忆宽** | （同上视觉效果态后续） |
| **codePilot 主题** | 浅 + 深两套**令牌齐全且正确呈现**、全局单一来源、设为默认 | 用户**切换浅/深的入口/跟随系统**机制（属设置模块） |
| **平台** | **桌面 only**：新骨架是桌面分支；移动/紧凑态**保持现有壳不动** | 紧凑/手机态后续由桌面统一适配（顶栏右控件折叠、4 卡改抽屉叠层） |

**"每期都完整"的判据**：本期末态，桌面壳是**新骨架完全替代旧壳**——旧的三处分散 chrome（根 TrafficLights 摆位 / 左栏 `SidebarWindowChrome` 顶条 / workspace 屏自带顶栏）**全部归并进统一顶栏并删除旧件**，无 dead gate、无"顶栏与旧 header 并存"。后续每个面板内部替换时，只动该 slot 内部，骨架不再返工。

---

## 1. 模块划分

新骨架是**组合层 + 状态层 + 主题层**三块，内容层全部复用现有组件（slot）。

### 1.1 新增（骨架本体）
- `screens/home-shell/`（新目录，桌面主壳）
  - `home-shell.tsx` — 组合：统一顶栏 + 内容行 `[左卡 | gutter | 中卡 | gutter | 右卡 | gutter | 目录树卡]`，把 4 区与各自 slot 绑定。**替换** `app/_layout.tsx` 中 `AppContainer` 现有的 `row(LeftSidebar | children)` 桌面组合。
  - `unified-top-bar.tsx` — 顶栏；只渲染槽位 + dispatch（toggle / 标题 / ··· / 分支）。**吸收并替换** `SidebarWindowChrome` 顶条与 workspace 屏自带 header。
  - `region-frame.tsx` — 单区卡片外壳（圆角/1px 边框/轻投影/vibrancy 材质分层），纯展示，按 region 类型取样式。
  - `region-gutter.tsx` — 相邻卡间 8px 拖拽手柄；包 `resize-handle` 交互，按 **px** 改宽并 dispatch。
- `stores/shell-layout-store.ts`（新，zustand persist）— **桌面 3 区显隐 + 3 区宽度**的单一权威 + 持久化（按工作区记忆宽）。
- `stores/shell-regions.ts`（新，纯函数/selector/常量）— region 常量（min/max/default）、`clampRegionWidth`、`resolveRegionWidthFromDrag`、`selectVisibleRegions`、`selectTopBarModel`。**不渲染即可测**。

### 1.2 改动（主题 + 接入点）
- `styles/theme.ts` — 新增 `codePilotLight` / `codePilotDark` 两套主题对象（github.json 取值，见 §5）+ 新令牌；`ThemeName` / `THEME_TO_UNISTYLES` / `THEME_SWATCHES` 各加一项。
- `styles/unistyles.ts` — 注册两个新主题键。
- `app/_layout.tsx` — `AppContainer` 桌面分支改为渲染 `HomeShell`；移动分支**保持现状**（`MobileGestureWrapper` + 抽屉式 `LeftSidebar` 不动）。
- `components/left-sidebar.tsx` — **去掉** `SidebarWindowChrome` 顶条（其职责上移顶栏）；桌面显隐/宽度改读 `shell-layout-store`。**内胆（对话树等）不动**。
- `screens/workspace/workspace-screen.tsx` — **拆头不拆胆**：移除自带 header（标题/···/工具面板 toggle/maximize），其职责迁入统一顶栏；中区只渲染**主对话 pane**进 `children`（中卡 slot）；右工具面板内容交由右卡 slot 渲染。**tab 内部与对话流不动。**

### 1.3 切分理由
- 组合/状态/主题三层**单一职责**：`home-shell` 只摆位、`shell-layout-store`+`shell-regions` 只管显隐与宽度、`theme` 只给令牌。
- 内容层（左栏内胆 / 对话画布 / 右工具 tab / 文件树）是**别的需求的领地**，本期一律以 slot 包裹，绝不进其内部——这是分阶段不返工的关键。

---

## 2. 模型与 UI 分离

### 2.1 状态归属（全进 store / 纯函数 / selector）
- **3 toggle 显隐 + 3 区宽度** → `shell-layout-store`（桌面权威，persist）。字段：`leftOpen` / `rightOpen` / `fileTreeOpen`（默认 `true/false/false`，对应 s1）；`widthByRegion`（左/右/目录树，按 workspaceKey 记忆）。
- **派生** → `shell-regions.ts` 纯函数：
  - `selectVisibleRegions(state, route)` → 当前应渲染哪些区 + 各自宽（中区恒在场、无独立宽）。
  - `selectTopBarModel({route, conversation, branch, regionState})` → 顶栏各槽位的标题/项目/分支文本 + 三 toggle 的 `active`（= 对应面板已展开）。
  - `clampRegionWidth(region, px)` → 按 region 的 min/max 夹紧（左 180/300 · 右 320/800 · 目录树 220/500）。
  - `resolveRegionWidthFromDrag({region, startWidth, deltaPx})` → 纯拖拽算宽（夹紧后输出）。
- **判据**：以上全部**不渲染即可单测**（3 toggle 独立性、8 组合、宽度夹紧、拖拽算宽、顶栏槽位派生）。

### 2.2 UI 只渲染 + dispatch
- `home-shell` / `unified-top-bar` / `region-gutter`：读 selector 派生态渲染；点击 toggle → `store.toggleRegion(region)`；拖动 gutter → `store.setRegionWidth(workspaceKey, region, resolveRegionWidthFromDrag(...))`。组件内**无业务分支、无宽度计算**。
- `region-frame`：纯样式包裹，零状态。
- **不持有副本**：顶栏的"标题/分支/项目"来自现有 session/git 真相源经 selector 派生，顶栏不另存一份。

---

## 3. 数据流与接口契约

### 3.1 事件 → 状态 → 渲染
```
点顶栏 toggle ─▶ shell-layout-store.toggleRegion(region)
                 └▶ selectVisibleRegions ─▶ home-shell 渲染/卸载该区卡片；中卡 flex 自适应
拖 gutter ─▶ resolveRegionWidthFromDrag ─▶ store.setRegionWidth(workspaceKey,…) ─▶ 该区卡片宽
切主题 ─▶ settings.theme=codePilotLight/Dark ─▶ UnistylesRuntime.setTheme ─▶ 全局令牌（含 slot 内现有组件）
```

### 3.2 跨模块接口（命名 shape，不 inline）
- `ShellRegion = "left" | "right" | "fileTree"`（中区不是可 toggle 的 region）。
- `ShellRegionConstraints = { min: number; max: number; default: number }`（三区各一份常量）。
- `ShellLayoutState = { leftOpen: boolean; rightOpen: boolean; fileTreeOpen: boolean; widthByRegion: Record<string, Record<ShellRegion, number>> }`（外层 key = workspaceKey）。
- `RegionSlots = { left: ReactNode; main: ReactNode; right: ReactNode; fileTree: ReactNode }` — `home-shell` 的 slot 注入契约；本期由现有组件填充（见 §4）。
- `TopBarModel = { title; projectName; branch; left/right/fileTree: { active: boolean } }` — `selectTopBarModel` 输出。
- **slot 供给方式**：中卡 slot = 路由 `children`（workspace 屏渲主对话 pane）；右卡/目录树卡 slot 由 `home-shell` 按路由活跃 workspace 直接渲染（复用现有右工具/文件树组件）。非 workspace 路由（设置/onboarding）只占中卡，左/右/目录树 toggle 不可用。

### 3.3 纯函数签名（输入→输出）
- `clampRegionWidth(region, px) → number`（夹到 min/max）。
- `resolveRegionWidthFromDrag({region, startWidth, deltaPx}) → number`（拖拽改宽、夹紧、到界即止）。
- `selectVisibleRegions(state, route) → { left?:w; right?:w; fileTree?:w; main:true }`。
- `selectTopBarModel(input) → TopBarModel`。

---

## 4. 复用点 / 禁止重造

### 4.1 复用清单（slot 内容 + 骨架零件，原样接入）
| 用途 | 复用现有 | 接入方式 |
|---|---|---|
| 左栏内胆（对话树/主机切换/新对话/搜索/设置） | `components/left-sidebar.tsx` + `conversation-tree/render.tsx` + `components/sidebar/host-switcher-pill` + `sidebar-header-row` + `sidebar-workspace-list` | 填左卡 slot（去顶条、改读 shell store） |
| 中区对话画布 | workspace 屏主对话 pane | 填中卡 slot（= 路由 children） |
| 右栏工作面板 | 现有右工具面板 + `workspace-layout-store`（tab/split 内胆） | 填右卡 slot（**内部 tab 模型不动**） |
| 目录树 | `components/file-explorer-pane.tsx`（现 `panels/files-panel.tsx` 包它） | 升格填目录树卡 slot |
| ··· 菜单条目 / 环境信息 / 打开位置 | `WorkspaceHeaderMenu` · `canvas-top-bar-controls.tsx` | 顶栏复用其条目（菜单内容本期 deferred） |
| toggle 按钮形态 | `components/headers/header-toggle-button` · `menu-header`(SidebarMenuToggle) | 顶栏三 toggle 复用 |
| 拖拽手柄交互 | `components/resize-handle.tsx` + `resize-handle-sizes.ts` | gutter 复用交互；**新增 px 夹紧纯函数**（现有是 normalized 比例，契约不同，作兄弟函数不强塞） |
| 窗口控制安全区 | `components/desktop/traffic-lights` · `titlebar-drag-region` · `utils/desktop-window`(useWindowControlsPadding) | 顶栏左侧安全区复用 |
| 主题引擎 | Unistyles `styles/theme.ts` + `unistyles.ts` | 加 codePilot 键，不另起引擎 |
| 文件展开态 / 移动壳 | `panel-store`（expandedPaths / mobileView） | 保留（移动壳与文件树内部用） |

### 4.2 禁止重造
- ❌ 不再写第二个侧边栏/对话树/文件树/tab 系统/拖拽原语/主题引擎。
- ❌ 不为左栏显隐建**第二个真相源**——桌面统一进 `shell-layout-store`（旧 `panel-store.desktop.agentListOpen` 桌面位 + `sidebarWidth` 在同次改动里**迁移并删除**，移动 `mobileView` 留 `panel-store`）。
- ❌ 不在 slot 内部改任何内胆逻辑（对话树/Composer/文件树/tab CRUD 全留给后续）。

### 4.3 同次必删（refactor-not-patch，不留考古层）
- `SidebarWindowChrome` 顶条（职责并入顶栏）。
- workspace 屏自带 header（标题/···/工具面板 toggle/maximize）→ 顶栏。
- `canvas-top-bar-chrome.ts` 的 empty/in-use 选择器 → 由 `selectTopBarModel` 取代。
- `workspace-layout-store` 的**外层"中区|右栏"split 尺寸 + `rightToolPanelCollapsed` + maximize**（右区显隐/宽度改由壳掌管；放大缩小 deferred）。**右工具内部 tab/split 模型保留**。
- light 主题绿 accent 默认 → codePilot。

---

## 5. 协议 / 平台

### 5.1 协议
- **不动协议**：3 toggle 显隐 / 宽度 / 主题全是**客户端 prefs**（zustand persist + settings）。无 `server_info.features.*`、无 RPC、无 `COMPAT()`。
- **无老用户兼容**（fork 未上线）：`shell-layout-store` 是全新 persist store；被取代字段（`panel-store.sidebarWidth`、workspace 外层 split/collapse/maximize）直接删、不写迁移 shim；persist `version` 顺手 bump，本地旧 dev 态干净丢弃。**协议后向兼容铁律不受影响**（本期根本没碰协议）。

### 5.2 主题接入（单一来源，github.json 原值）
- 令牌来自 codepilot-layout `ui.html` 的 `:root`(浅) / `.dark`(深) 唯一源，映射到现有语义令牌契约：`surface0=#fff` · `foreground=#1f2328` · `border=#d1d9e0` · `accent/primary=#0969da`(GitHub 蓝，仅按钮/链接/focus) · **选中态 = `#eaeef2`+字`#3d444d`**（映射到现有 selection/sidebar-hover 令牌，绝非黑底白字）。
- **新增令牌**（壳骨架需要、现契约没有）：窗口磨砂背景层(vibrancy) / 内容卡 16px 圆角 / 卡片轻投影 / 半透左栏 surface。
- **浅+深双套齐全**设为默认（`codePilotLight`）；slot 内现有组件读同一套令牌→**自动全局适配**，不自带冲突配色。**切换浅/深的入口 deferred**（设置模块）。

### 5.3 平台门
- **桌面 only**：`home-shell` 在 `!useIsCompactFormFactor()` 时渲染；紧凑/移动走**现有壳**（不破移动、非半迁移，是已定的两形态分支）。
- **拖拽手柄 web-only**：沿用 `resize-handle` 的 DOM 指针事件，`isWeb` 门（桌面 = web/electron）。
- **vibrancy 材质**：真 macOS vibrancy 属 electron 能力，`.electron`/`isWeb` 分层；纯 web 用半透磨砂兜底（与设计稿模拟一致）。

---

## 6. 测试策略

### 6.1 必测纯函数 / store（不渲染即测，对应验收）
- **3 toggle 状态机**（验收 8–12）：任一 toggle 只翻自己、不连带；8 种组合成立；默认 = 左开/右关/目录树关；中区恒在场。
- **宽度夹紧 + 拖拽**（验收 13）：每区夹到各自 min/max；拖过界即止；中区无独立宽。
- **按工作区记忆**（验收 13）：`widthByRegion[workspaceKey]` 持久化往返；切工作区取各自宽。
- **顶栏槽位派生**（验收 2、25）：`selectTopBarModel` 在空态/对话态给对的标题/分支/三 toggle active；项目/分支为 ghost（无选中/强调色，是渲染契约，配合 6.2 端到端）。
- **主题令牌完整性**（验收 14–19）：codePilot 浅/深 key 集合 = 契约全集、无缺；选中令牌 = `#eaeef2`（非黑/非 primary）；默认 = codePilot。

### 6.2 端到端验证点（真生效，非截图/grep）
- 4 区渲**真实现有内容**（左=对话树、中=对话画布、右=工具 tab、目录树=文件树），slot 不丢内容（验收 4、20、21）。
- 三 toggle 真显隐、中区真伸缩；三侧区真拖拽、宽度真持久（验收 5、8–13）。
- 旧三处 chrome 已不再各自独立、统一进顶栏（验收 3、24）；目录树是独立第 4 区非右栏 tab（验收 6）。
- 浅/深主题全局适配、首页/对话页/设置同皮（验收 17、18）。
- 像素对照 s1/s2/s3/s4（验收 23）。

---

## 7. 风险与取舍

- **R1（核心风险）· 拆 workspace 屏的"中区|右栏"融合**：现 `workspace-screen.tsx`（4342 行）把中区主 pane 与右工具面板**融在同一 split 树 + 自带 header**。要呈现为 4 个并排同级卡片，必须把**外层 main|right 摆位权**从 `workspace-layout-store` 上移到壳，并把 header 迁入顶栏。
  取舍：**拆头不拆胆**——只动"谁掌管中/右的显隐与宽度 + header"（骨架层），**右工具内部 tab/split 模型原样保留**（deferred）。这把改动锁在边界层、内胆零改，既满足"整体换骨架"又不返工内部。**这是 gate-2 最该盯的一处**。
- **R2 · 左栏显隐双真相**：左栏已有 `panel-store.agentListOpen`（且驱动移动抽屉）。取舍：桌面统一进 `shell-layout-store` 并在同次删旧桌面位，移动位留 `panel-store`——一个形态一个权威，不并存两份桌面真相。
- **R3 · 拖拽契约不一致**：现有 `resize-handle` 按 normalized 比例（split 内），新壳侧区是**绝对 px + 各自 min/max**。取舍：复用其 DOM 交互、**新增 px 夹紧纯函数**作兄弟件，不硬塞进 normalized 契约（避免 indirection）。
- **R4 · 主题作用域**：把默认主题翻成 codePilot 会**全局**改色。取舍：正是"单一来源全局适配"的设计意图；slot 内现有组件读共享令牌即自动适配，无需逐页改。新令牌（vibrancy/16px 卡）只壳消费，旧页不受其影响。切换入口 deferred 不阻断本期。
- **R5 · 桌面新壳 + 移动旧壳并存**：非半迁移——需求明确桌面 only、移动 deferred，是两条合法形态分支；移动保持现状确保"app 仍可用"。后续移动适配是独立完整阶段。
- **取舍总纲**：本期只画 **HOW 的边界**——4 区/slot/顶栏/3 toggle/拖拽/主题归属说死，**所有 slot 内部一律 deferred**。零复杂度预算：不为后续可能性预埋抽象（如多主题切换器、移动抽屉），用时再加。
