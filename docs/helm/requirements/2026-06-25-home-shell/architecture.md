# 架构 · 主页面（Codex 式主壳 · 三区结构）

> 日期：2026-06-25 · 状态：草拟（待闸 2） · 关联：[requirement.md](./requirement.md) · [ui.html](./ui.html)
> 写 **HOW 的边界**，不写逐行实现（实现交 helm-developer）。遵循 [standards.md](../../standards.md) + [docs/coding-standards.md](../../../coding-standards.md)。
> 核心判断：本轮**不是新建一个主壳**。三区主壳的骨架（左栏 pinned / 中区 children / 右面板 docked-pane）**已存在于 `app/_layout.tsx` + `workspace-screen.tsx`**。本轮 = **在既有骨架上重构 chrome + 新建对话树 selector 层 + 补齐缺失态**，严守 refactor-don't-patch。

---

## 0. 总纲：三区映射到现有架构（先对齐心智模型）

现有运行时的三区分布（已勘察确认）：

| 设计的区 | 现有承载 | 现状 |
| --- | --- | --- |
| **ZONE 1 左栏（全高列）** | `app/_layout.tsx` 内 `<LeftSidebar>`（桌面 pinned · `components/left-sidebar.tsx`），跨路由共享、host 级 | 现展示「**工作区列表按项目分组**」（`SidebarWorkspaceList` + `use-sidebar-workspaces-list`），**不是对话树** |
| **ZONE 2 中区（自带 canvas 顶栏）** | 路由屏 `WorkspaceScreen`（`screens/workspace/workspace-screen.tsx`）的 center column；顶栏当前作为 **MAIN pane 的 header** 渲染在 `SplitContainer` 内（统一顶栏） | header 左含 `SidebarMenuToggle`，右含右面板开关/放大；**含横跨整窗意味的统一顶栏** |
| **ZONE 3 右栏（自带 tab 头）** | `SplitContainer` 内的特殊 pane `RIGHT_PANEL_PANE_ID`（`workspace-tabs/tab-surface.ts`） | 折叠/放大/每工作区宽度、tab 系统、四类 panel 内容**已全部存在** |

→ 本轮把「设计的三区独立 chrome」**重构进这三处既有承载**，而不是另起炉灶。这是整份架构的地基，下面每章都围绕它。

---

## 1. 现状映射（逐子系统：现有什么 → UI/model 分离度 → 本轮处置）

> 处置 = **复用**（直接用，禁止重造）/ **重构**（实现新设计 + 同批删旧，不留 dead gate）/ **新建**（确实没有）。

| # | 子系统 | 现有文件 / store / 契约 | 现 UI/model 分离度 | 本轮处置 |
| --- | --- | --- | --- | --- |
| 1 | **三区 host 容器** | `app/_layout.tsx`（`AppWithSidebar` → `LeftSidebar` + children）、`app/h/[serverId]/_layout.tsx`、`workspace/[workspaceId]/index.tsx`（`WorkspaceDeck` 多工作区保活） | 中（布局散在组件） | **复用**容器 + **重构**左栏/中区 chrome 注入点 |
| 2 | **左栏外壳** | `components/left-sidebar.tsx`（792 行，桌面/紧凑双形态）、`components/sidebar/sidebar-header-row.tsx` | 中 | **重构**：加窗口 chrome 细条 + host 胶囊 + 对话树替换工作区列表 |
| 3 | **左栏：项目/工作区列表** | `components/sidebar-workspace-list.tsx`、`hooks/use-sidebar-workspaces-list.ts`、`hooks/use-sidebar-shortcut-model.ts` | 中（list selector 已抽 hook） | **重构为对话树**：复用「项目分组 + 折叠 + 内联重命名 + 右键 + 拖拽」机制，节点模型换成 agent 树 |
| 4 | **左栏宽 / 开合** | `stores/panel-store/`（`sidebarWidth` 默认 320 / `MIN_SIDEBAR_WIDTH 200` / `MAX 600`、`desktop.agentListOpen`、`focusModeEnabled`、`clampSidebarWidth`） | **好**（store + selector） | **复用**开合；左栏宽**改 per-workspace 每工作区记忆**（R1 已决，从全局 `sidebarWidth` 迁移；见 §10 R1） |
| 5 | **左栏排序/置顶/折叠** | `stores/sidebar-order-store.ts`、`stores/sidebar-pins-store/`、`stores/sidebar-collapsed-sections-store/`、`stores/sidebar-view-store.ts` | **好** | **复用**（树节点展开/收起/排序/置顶直接接这些 store） |
| 6 | **中区屏 + 统一顶栏** | `screens/workspace/workspace-screen.tsx`（4471 行：`WorkspaceScreenContent`、`WorkspaceHeaderTitleBar`、`WorkspaceHeaderMenu`、`headerLeft`/`headerRight`、`renderSplitPaneHeader`） | 中（巨型组件，逻辑与渲染耦合多） | **重构**：拆出 canvas 顶栏；`SidebarMenuToggle`/前进后退**移出**到左栏窗口细条；空态精简（同批删旧 headerLeft 的侧栏开关） |
| 7 | **分屏/pane 系统** | `components/split-container.tsx`、`workspace-tabs/tab-surface.ts`（`MAIN_PANE_ID`/`RIGHT_PANEL_PANE_ID`） | **好**（SplitNode/SplitPane/SplitGroup 纯数据） | **复用** |
| 8 | **布局 store（宽/折叠/放大/tab/split）** | `stores/workspace-layout-store.ts`（`layoutByWorkspace`、`splitSizesByWorkspace`、`rightToolPanelCollapsedByWorkspace`、`rightToolPanelMaximizedByWorkspace`、`openRightToolPanel`/`closeRightToolPanel`/`setRightToolPanelMaximized`/`clearRightToolPanel`/`reorderTabsInPane`/`resizeSplit`）、`stores/workspace-layout-actions.ts`（`keepOnlyRightToolPanelInLayout`、`removeRightToolPanelFromLayout`、`ensureRightToolPaneInLayout`、`isRightToolPanelOpen`、`getRightToolPane`、`MAX_TREE_DEPTH=4`） | **优**（纯函数 + 单测齐全） | **复用**（右面板折叠/放大/宽度/调序**已全在此**，禁止重造） |
| 9 | **右面板 tab 内容（panel 注册表）** | `panels/panel-registry.ts`（`PanelRegistration{kind,component,useDescriptor,confirmClose}`）、`panels/register-panels.ts`（draft/agent/setup/terminal/browser/file/review/files）、`stores/workspace-tabs-store/`、`workspace-tabs/identity.ts` | **优** | **复用**；新选项卡 +、启动器默认态、固定审查 tab 为**新增表现层** |
| 10 | **右面板 tab 头 UI** | `screens/workspace/workspace-desktop-tabs-row.tsx`（`WorkspaceDesktopTabsRow`、`WorkspaceToolPicker`，含悬浮✕/拖拽调序/新选项卡菜单） | 中 | **复用 + 重构**：tab 头形态贴 Codex；接入「**全部页签可关（含审查，R6 已决）** + 启动器回退」 |
| 11 | **审查 / 终端 / 浏览器 / 文件** | `review/`、`terminal/`、`browser/`、`file-explorer/`、`panels/{review,terminal,browser,file,files}-panel.tsx`、`components/{diff-viewer,diff-stat,diff-scroll,file-pane,browser-pane.*}` | **优** | **复用**（内容形态本轮不重做，反馈 J） |
| 12 | **Composer** | `composer/index.tsx`（`Composer`、`runClientSlashCommand`、`useAgentAutocomplete`、`resolveClientSlashCommand`）、`composer/input/input.tsx`、`composer/agent-controls/`、`composer/attachments/`、`composer/draft/`、`composer/submit.ts` | **优**（draft/submit/attachments 都有 store + 纯函数 + 单测） | **复用** + **重构 input 渲染层**：/ 与 @ 渲染为**彩色 token**（反馈 K，唯一实质改动） |
| 13 | **斜杠/提及自动补全** | `components/ui/autocomplete-popover.tsx`、`hooks/use-agent-autocomplete.ts`、`client-slash-commands/` | **优** | **复用**（菜单已有；token 着色是 input 渲染层的事） |
| 14 | **三层级联选择器** | `components/combined-model-selector.tsx`（1009 行，`ComboboxTrigger` + drill-down 提供方/模型）、`provider-selection/`、`create-agent-preferences/`、`stores/provider-settings-store.ts` | 中 | **重构为单胶囊**（提供方🔒·中转站·模型）；**中转站层本轮只预留**（见 §6） |
| 15 | **⌘K 命令面板** | `components/command-center.tsx`、`hooks/use-command-center.ts`、`hooks/use-aggregated-agents.ts`（跨主机聚合） | **优** | **复用** + 加「快速切中转站」分组（上下文感知） |
| 16 | **对话父子语义** | `subagents/select.ts`（`selectSubagentsForParent` by `parentAgentId`）、`subagents/detach-subagent.ts`、`subagents/archive-subagent.ts`、`subagents/close-tab-policy.ts`（`resolveCloseAgentTabPolicy`）、`subagents/auto-open-tab-policy.ts`、`subagents/policies.ts`、`subagents/track.tsx` | **优**（纯函数 + 单测） | **复用**（detach/级联归档/关页签非对称**已全部实现**，对话树右键直接接，禁止重造语义） |
| 17 | **git / 环境信息数据** | `git/use-status-query.ts`、`git/use-pr-status-query.ts`、`git/checkout-status-cache.ts`、`git/query-keys.ts`（`checkoutStatusQueryKey`）、`git/workspace-actions.tsx`、`git/actions-store.ts`、`components/branch-switcher.tsx`、`git/diff-pane.tsx` | **优**（React Query keyed by `(serverId,cwd)`） | **复用**；环境信息 popover 是**新 chrome 套在既有数据上** |
| 18 | **打开位置（外部 app）** | `workspace/open-target-planner.ts`（`planWorkspaceOpenTargets`、`PlannedDesktopOpenTarget`）、`workspace/desktop-open-targets.ts`（`useDesktopOpenTargets`、`DesktopOpenTarget{editor\|file-manager}`、`hasDesktopOpenTargetsBridge`）、`workspace/editor-targets.ts`、`screens/workspace/workspace-open-in-editor-button.tsx`、`hooks/open-project.ts` | **优** | **复用** + 扩展为「真实 app 图标下拉 + 添加应用」表现层 |
| 19 | **主机切换 / runtime** | `runtime/host-runtime.ts`（`useHosts`、`useHostRuntimeSnapshot`、`useHostRuntimeConnectionStatus`、`useHostRuntimeIsConnected`、`useHostMutations`、`useHostRegistryStatus`）、`utils/active-host.ts`、`app/host-runtime-bootstrap.ts`（`resolveStartupRoute`）、`components/{add-host-modal,add-host-method-modal}.tsx` | **优** | **复用**（host 数据/连接/重连全在此）；host 切换器胶囊 + 下拉是**新 UI**，切换走既有路由 |
| 20 | **会话/agent 真相源** | `stores/session-store.ts`（`Agent{id,status:AgentLifecycleStatus,workspaceId?,parentAgentId,title,requiresAttention}`）、`stores/navigation-active-workspace-store/`、`stores/session-store-hooks` | **优** | **复用**（对话树就是这份 agent 数据的新派生视图） |
| 21 | **导航 / 路由工具** | `utils/navigate-to-agent.ts`、`utils/host-routes.ts`、`utils/workspace-navigation.ts`（`prepareWorkspaceTab`）、`utils/workspace-identity.ts` | **优** | **复用**（点对话节点 = `navigateToAgent`） |
| 22 | **浮层基建** | `components/ui/{combobox,tooltip,dropdown-menu,context-menu,autocomplete-popover}.tsx`、`components/workspace-hover-card.tsx`、`components/ui/floating-panel-portal`（`FloatingPanelPortalHost(NameProvider)`、`measureFloatingPanelPortalHost`） | **优** | **复用**（所有锚定浮层按 floating-panels.md 范式复制最近文件再裁剪，**不造第五种 primitive**） |
| 23 | **窗口 chrome / 桌面门** | `components/desktop/titlebar-drag-region.tsx`、`utils/desktop-window`（`useWindowControlsPadding`）、`constants/platform`、`constants/layout`（`useIsCompactFormFactor`、`WORKSPACE_SECONDARY_HEADER_HEIGHT`） | **优** | **复用**（交通灯拖拽区/窗口控制留白已有） |

**一句话结论**：约 **80% 复用**（布局/tab/panel/composer/subagents/git/host/⌘K/浮层全部既有），**主要重构 3 处 chrome**（左栏窗口细条 + 中区 canvas 顶栏 + 右面板 tab 头），**真新建 2 块**（对话树 selector 层 + Composer 彩色 token 渲染）。

---

## 2. 目标架构（模块划分 + store 归属 + selector 边界）

### 2.1 ZONE 1 左栏（`components/left-sidebar.tsx` 重构）

左栏自上而下，组件树与 chrome：

```
LeftSidebar (root-layout pinned)
├─ <SidebarWindowChrome>            ← 新建（窗口细条，sb-lights）
│   ├─ <TitlebarDragRegion>(复用) + 交通灯留白(useWindowControlsPadding)
│   ├─ 侧栏开关 ▣        → panel-store toggleDesktopSidebars(复用)
│   ├─ 前进/后退 ‹ ›     → 新建 conversation-history 导航（见 §10 R4）
│   └─ [收起态多出] ✎ 新对话
├─ <HostSwitcherPill>               ← 新建（host 胶囊 + 锚定下拉，全栏宽）
├─ <SidebarPrimaryActions>          ← 复用现有「新对话 / 搜索」行
├─ <ConversationTree>               ← 新建（项目 → 对话 → subagent 单层渲染）
│   └─ <ConversationTreeNode>（递归节点，本轮渲染单层，模型支持 children）
├─ <SidebarSpacer/>
└─ <SidebarSettingsEntry>           ← 复用现有「设置」行（buildSettingsRoute）
```

**store 归属**：
- 窗口细条按钮态 = 无业务态（纯 dispatch panel-store / 导航）。
- host 胶囊**显示态** = selector over `host-runtime`（当前 host + 连接点）；下拉**开合态** = 组件局部 `useReducer`（UI-only，不入 store）。
- 对话树**数据** = 新纯 selector `conversation-tree/select.ts`（见 §5）；**展开/收起/排序/置顶** = 复用 sidebar-collapsed-sections/order/pins store；**选中** = 路由派生（`navigation-active-workspace-store` + active agent），**不另存选中态**（避免两个真相源）。

### 2.2 ZONE 2 中区 canvas（`workspace-screen.tsx` 重构）

```
中区 center column
├─ <CanvasTopBar>                   ← 重构自现 headerLeft/headerRight
│   ├─ 左：对话标题 + ··· 更多       ← 复用 WorkspaceHeaderTitleBar/WorkspaceHeaderMenu（去掉 SidebarMenuToggle）
│   └─ 右：打开位置▾ · 环境信息☰ · 右面板开关(仅收起时)
│       ├─ <OpenLocationDropdown>   ← 新建 chrome over open-target-planner(复用)
│       ├─ <EnvInfoPopover>         ← 新建 chrome over git status/branch/PR(复用)
│       └─ <RightPanelToggle>       ← 复用 WorkspaceToolPanelToggle
├─ [空态] <EmptyCanvas>：居中标题 + 居中 Composer（顶栏精简——仅右面板开关）
└─ [使用中] <SplitContainer>(复用)：消息流(agent-panel 复用) + 贴底 Composer
```

**refactor-don't-patch 明确点**（同一批删旧）：
- 现 `headerLeft` 里的 `<SidebarMenuToggle />` 与前进后退**移到左栏窗口细条**后，`workspace-screen.tsx` 内 `headerLeft` 的对应渲染/handler 一并删除，不留「两处都能切侧栏」的半迁移。
- 「统一顶栏 = MAIN pane header」**保留** `renderSplitPaneHeader` 注入路径作为「中区 canvas 顶栏」的实现（顶栏只占 MAIN pane 宽度、不横跨右栏 = 三区独立的物理保证），内容改由纯 selector `selectCanvasTopBarChrome` 驱动。**这是有意决策（总监已采纳）**：物理把顶栏提到 `SplitContainer` 外会横跨右面板、破坏「右栏自带 tab 头」的三区独立，因此重构 chrome 内容但**不做物理剥离**；`SidebarMenuToggle` 仍从 `headerLeft` 删除（移到左栏窗口细条），左栏收起态时细条在 `headerLeft` 渲染（复用现有 header-role 交通灯留白）。
- 空态精简 = 由「当前 tab 是空草稿」派生控件可见性（纯函数 `selectCanvasTopBarControls(tab)`），**不是**加一个 `shown && ...` 门。

**store 归属**：
- canvas 顶栏控件**可见性** = 纯 selector `selectCanvasTopBarChrome({activeTab, isGitCheckout, rightPanelCollapsed})`（判据：不渲染就能测）。
- 打开位置下拉 / 环境信息 popover **开合** = 组件局部 UI 态；其**数据** = React Query（git status/PR）+ `useDesktopOpenTargets`（复用），不入新 store。

### 2.3 ZONE 3 右面板（复用 `RIGHT_PANEL_PANE_ID` + 表现层增强）

```
右面板 (SplitContainer 内 RIGHT_PANEL_PANE_ID)
├─ <RightPanelTabStrip>             ← 重构 WorkspaceDesktopTabsRow
│   ├─ 已开页签(审查/终端/浏览器/文件,**全部可关** R6) + 新选项卡+ + ⤢放大 + ▯收起
│   └─ 悬浮✕ / 拖拽调序(复用 reorderTabsInPane) / 左缘拖宽(复用 resizeSplit)
├─ [pane 无 tab] <RightPanelLauncher>  ← 新建（审查/终端/浏览器/文件 竖排启动器）
└─ [选中 tab] panel-registry 渲染(复用 review/terminal/browser/file panel)
```

**store 归属**：全部复用 `workspace-layout-store`：
- 折叠 = `rightToolPanelCollapsedByWorkspace` + `openRightToolPanel`/`closeRightToolPanel`。
- 放大 = `rightToolPanelMaximizedByWorkspace` + `setRightToolPanelMaximized`（s13 占满中区已是此语义）。
- 宽度 = `splitSizesByWorkspace`（已 per-workspace）。
- tab 调序 = `reorderTabsInPane`；启动器默认态 = **派生**（`getRightToolPane(layout)?.tabIds.length === 0`），新纯函数 `selectRightPanelMode(layout)` 返回 `"launcher" | "tabs"`。
- 页签关闭策略 `canCloseRightPanelTab(tab)` = **全部可关（含审查，R6 已决）**；关掉的从启动器/新选项卡重新加回（启动器本就列审查/终端/浏览器/文件）。**无「审查固定第一」特殊处理**（不写 `orderRightPanelTabs` 置顶）。

---

## 3. 数据流与状态归属（事件 → 状态 → 渲染）

| 状态域 | 归属 | 派生 selector / action（契约名） | 备注 |
| --- | --- | --- | --- |
| **三区宽度 · 左栏** | **per-workspace store**（R1 已决：每工作区记忆；从 panel-store 全局 `sidebarWidth` 迁移） | `clampSidebarWidth`（复用约束） | 迁移作 P3 前置，见 §10 R1 |
| **三区宽度 · 右栏** | `workspace-layout-store.splitSizesByWorkspace` | `resizeSplit(wsKey,groupId,sizes)` | 已 per-workspace |
| **左栏开合** | `panel-store.desktop.agentListOpen` | `selectIsAgentListOpen`、`toggleDesktopSidebars` | 复用 |
| **右面板 折叠/放大** | `workspace-layout-store` per-workspace | `openRightToolPanel`/`setRightToolPanelMaximized`/`clearRightToolPanel`、`isRightToolPanelOpen` | 复用 |
| **对话树态** | 数据=session-store；展开/排序/置顶=sidebar-* store；选中=路由 | `conversation-tree/select.ts::buildConversationTree(state,{serverId})` → `ConversationTreeNode[]` | 选中不另存 |
| **右面板 tab 集合/聚焦** | `workspace-tabs-store` + `workspace-layout-store` | `openTabFocused`/`closeTab`/`reorderTabsInPane`、`selectRightPanelMode` | 复用 |
| **Composer 态** | `composer/draft`·`composer/attachments`·`composer/submit`（已有 store/纯函数） | `runClientSlashCommand`、`useAgentAutocomplete` | 复用；token 渲染见 §8 |
| **主机切换态** | `host-runtime` + 路由 | `useHostRuntimeConnectionStatus`、`useHostMutations`、`navigateTo(host root)` | 切换=路由重挂，过场=既有 bootstrap gate |
| **popover/下拉浮层开合** | **组件局部 UI 态**（`useReducer`/`useState`） | — | 不入 store（UI-only，无需跨组件） |

**关键数据流示例**：
- **发首条消息（s1→s2）**：空态 Composer 输入 → `composer/submit` 创建 draft→agent（`convertDraftToAgent`，复用）→ session-store 新增 agent → 对话树 selector 重算（新根对话出现并选中）→ canvas 顶栏控件可见性 selector 翻为「使用中」。
- **切主机（s7）**：点 host 行 → `navigate(host root route)` → 路由子树重挂 → `WorkspaceDeck` 加载新 serverId 数据 → 既有 `resolveStartupRoute`/bootstrap 提供「切换中/重载」过场。离线行 → `useHostMutations` 重连（退避），**不导航**。

**跨模块接口契约（命名 shape，不 inline）**：
```ts
// conversation-tree/types.ts  ── 新建，节点抽象「先支持递归、本轮只渲一层」
interface ConversationTreeNode {
  kind: "project" | "conversation" | "subagent";
  id: string;                       // project: projectKey; 其余: agentId
  title: string;
  serverId: string;
  workspaceId: string | null;
  status: AgentLifecycleStatus | null;   // project 节点为 null
  requiresAttention: boolean;
  subagentCount: number;            // 角标数（聚合 children 数，本轮不渲 children）
  children: ConversationTreeNode[]; // 预留递归；本轮渲染层只读第一层
}
```

---

## 4. 锚定浮层（按 `docs/floating-panels.md` 范式）

本轮浮层逐个定方案（**复制最近的 canonical 文件再裁剪，不发明第五种 primitive**）：

| 浮层 | 锚点 | 范式来源 | 关键约束 |
| --- | --- | --- | --- |
| **主机下拉** | host 胶囊 | `combobox.tsx`（自带列表，无输入也可裁成纯锚定） | **与胶囊同宽**（`left:0/right:0` 等价 → 测 anchor 宽 + host 宽，反馈 I 死规则）、锚正下方、绝不全宽 |
| **环境信息 popover** | canvas 顶栏 ☰ | `workspace-hover-card.tsx`（桌面 measure+Portal） | 浮层非停靠面板；`isPaneFocused` 门控 visible；250px 固定宽（Gotcha 5 可走 bottom-anchored 省 contentSize） |
| **打开位置下拉** | canvas 顶栏 打开位置▾ | `dropdown-menu.tsx` | 真实 app 图标行；尾部「添加应用」 |
| **新选项卡 + 菜单** | 右面板 tab 头 + | `dropdown-menu.tsx`（现 `WorkspaceToolPicker` 已是） | 复用现有 |
| **⌘K / 搜索浮层** | 居中蒙层 | `command-center.tsx`（已 Modal 居中） | 复用；搜索浮层 = ⌘K 的搜索模式（无独立界面） |
| **斜杠/@ 自动补全** | Composer 输入 | `autocomplete-popover.tsx`（Portal 保 IME） | 复用；输入框必须保持聚焦 → Portal 非 Modal |
| **节点右键菜单** | 树节点 | `context-menu.tsx` | 三套菜单按节点类型（§5） |

桌面 only：浮层都走 Portal/measure 路径（`FloatingPanelPortalHost` 已在 workspace 内挂好，host name = `workspace-floating-panels:{serverId}:{workspaceId}`）。`useUnistyles()` 禁用——浮层定位用 `inlineUnistylesStyle` 走高频几何逃逸（unistyles.md）。

---

## 5. 对话树语义（对齐 `docs/agent-lifecycle.md`）

**数据模型**：树根 = session-store 的 agents（`parentAgentId` 形成边）。`buildConversationTree` 纯函数：
- **项目节点** = agents 按其 `workspaceId`→项目目录分组（复用 `use-sidebar-workspaces-list` 的项目分组逻辑）。
- **对话（根）节点** = `parentAgentId === null` 的 agent。
- **subagent 节点** = `parentAgentId` 指向某对话；递归来自 `selectSubagentsForParent`（复用，已 by parentAgentId）。

**本轮单层 + 后续嵌套预留（董事长锁定 ①）**：
- `ConversationTreeNode.children` 字段**现在就建**（递归结构完整），`buildConversationTree` **现在就递归填充** children（含 subagentCount 聚合）。
- **渲染层** `ConversationTree` 本轮**只渲染到 subagent 第一层**（对话根下的直接 subagent），不画 sub-subagent 递归；角标数显总 subagent 数。
- 后续接嵌套 = 只改渲染层（深度递归 + 缩进），**数据/selector 不动**。预留点写死在 `conversation-tree/render.tsx` 的 `MAX_RENDER_DEPTH` 常量（本轮=2：对话+subagent 一层）。

**真实语义直接接既有纯函数（禁止重造）**：
| 树操作 | 接入既有 | 语义（对齐 agent-lifecycle.md） |
| --- | --- | --- |
| 剥离 detach | `subagents/detach-subagent.ts` | 仅清 `paseo.parent-agent-id`，子升根，不停/不归档/不移 |
| 归档（根级联） | `subagents/archive-subagent.ts`（级联递归已实现） | 父归档级联归档全部子代理 |
| 关页签非对称 | `subagents/close-tab-policy.ts`（`resolveCloseAgentTabPolicy`） | 关根=归档（运行先确认）；关 subagent=仅布局 |
| 运行态聚合 | `docs/architecture.md` workspace activity（按父 `workspaceId`） | 运行 subagent 把「运行」贡献给父对话所属工作区 |
| 内联重命名/拖拽排序 | 复用 `use-workspace-tab-rename` + sidebar-order-store | — |

**三套右键菜单**（`context-menu.tsx`，逐项见 ui.html s6）：对话根（重命名/复制/移动到目录/归档/Finder/删除）· subagent（重命名/跳父/剥离/归档-从父轨道/删除）· 目录（在此新建/重命名/Finder/移出侧栏）。菜单项→action 全部映射到上表既有纯函数。

---

## 6. 两个暂缓项的接口预留（董事长锁定 · 接口预留好、渲染暂不接）

### ① subagent 多级嵌套（暂缓）
- **预留点**：`ConversationTreeNode.children`（已建）+ `buildConversationTree` 递归填充（已实现）+ `render.tsx::MAX_RENDER_DEPTH=2`。
- **后续接法**：把 `MAX_RENDER_DEPTH` 解除 + 渲染层改深度递归缩进；**零数据层改动、零 selector 改动**。

### ② 对话内中转站选择（暂缓，依赖设置模块）
- **预留点**：单胶囊 selector 的 shape **三层都建**：
```ts
// combined-model-selector 重构后的胶囊模型（契约）
interface CascadeSelection {
  provider: AgentProvider;          // 锁定（仅新对话选一次）
  vendor: VendorRef | null;         // 中转站层 —— 本轮恒为 null（不渲列表/不切换）
  model: ModelRef;
}
```
- **本轮**：胶囊**显示**三段（提供方🔒 · 中转站 · 模型），但中转站段渲染为占位/直连，**不拉中转站列表、不实现切换**（依赖未来设置模块的中转站配置 store）。
- **后续接法**：填充 `vendor` 列表 selector + 切换 action，胶囊结构与下拉两级菜单**已就位**，只接数据源。`combined-model-selector.tsx` 现有 drill-down 即此两级菜单的基础。

> 两预留项均**只预留 shape/结构，不写半成品逻辑**（无 dead gate、无 `vendor && ...` 永假分支）。

---

## 7. 平台门（桌面 only · 断点不用平台判定做布局）

- **布局分界用断点**：`useIsCompactFormFactor()`（`@/constants/layout`），**不用** `Platform.OS`。本轮三区为桌面态；紧凑/手机态（s15）**暂缓**——保留现有 `left-sidebar.tsx` 的紧凑分支（覆盖式）**不动**，新三区 chrome 只在 `!isCompact` 分支生效。
- **桌面专属能力门**：打开位置（外部 app）走 `getIsElectron()` + `hasDesktopOpenTargetsBridge()`（已有）；交通灯/窗口控制留白 = `useWindowControlsPadding`（已有）。
- **平台文件门 vs 运行时 if**：
  - 浏览器 panel 已用 `browser-pane.electron.tsx`/`.web.tsx`/`.tsx`（复用，不动）。
  - 新组件默认跨平台单文件 + 小范围 `isWeb`/`getIsElectron()` 内联；**不**为本轮新增大块 `.web/.native` 分裂（三区是桌面态，紧凑分支用断点而非文件门）。
  - DOM 直用（measure/拖拽）必须 `isWeb` 守卫；`onPointerEnter/Leave` 禁用，hover 用 `isHovered || isNative || isCompact`。
- **协议**：本轮**不动协议**（host/agent/git/timeline RPC 全部既有，无新增 daemon 能力）。若后续中转站/打开位置加 app 需新 RPC，再按 `server_info.features.*` + `COMPAT()` 门控——**本轮不涉及**。

---

## 8. 分批计划（关键 · 每批可独立验证）

### P1 · 骨架批（必须先出可运行骨架，像素对齐设计的「形」）

目标：**能跑、能渲染、能开合、三区像素对齐**。范围：

| 任务 | 依赖 | 可并行 | 主要文件 |
| --- | --- | --- | --- |
| P1-a 左栏窗口 chrome 细条（交通灯+侧栏开关+‹›+收起态✎） | panel-store(有) | ✅ 独立 | `left-sidebar.tsx` 新 `<SidebarWindowChrome>` |
| P1-b host 切换器胶囊 + 锚定下拉（同宽，反馈 I） | host-runtime(有) | ✅ 独立 | 新 `<HostSwitcherPill>` + combobox 范式 |
| P1-c 对话树**单层**（项目→对话根，subagent 一层；状态点/选中/展开收起） | session-store + sidebar-* store(有) | ⚠️ 依赖 selector | `conversation-tree/{types,select,render}.ts(x)` |
| P1-d 中区 canvas 顶栏重构（移出侧栏开关/前进后退；空态精简） | 无 | ⚠️ 与 P1-a 协调侧栏开关归属 | `workspace-screen.tsx` headerLeft 重构 |
| P1-e 中区空态（居中标题 + 居中 Composer 复用） | composer(有) | ✅ | `<EmptyCanvas>` |
| P1-f 右面板：启动器默认态 + 四 tab 壳（**全部可关·无审查固定** R6 已决） | workspace-layout-store(有) | ✅ 独立 | `<RightPanelLauncher>` + `selectRightPanelMode` + tab 头 + `canCloseRightPanelTab`(全 true) |

**P1 并行建议**：a/b/e/f 四路可同时派 developer（彼此独立）；c/d 需先定 selector 契约（`ConversationTreeNode` shape + 侧栏开关归属），由架构/PM 先钉死接口，再并行。

**P1 验收**：三区独立 chrome、无横跨整窗标题栏、左栏开合、右面板开合、对话树单层选中跳转、空态可打字 → 像素对齐 s1/s3。

### P2+ · 增量批（每批独立验证，标注依赖/并行/风险）

| 批 | 内容 | 依赖 | 并行 | 风险 |
| --- | --- | --- | --- | --- |
| **P2 使用中态 + 右面板内容** | canvas 顶栏全控件接数据（标题/···/打开位置/环境信息）；右面板四 tab 内容接既有 panel | P1 | 顶栏/右面板两路并行 | 低（数据全复用） |
| **P3 拖拽改宽 + 效果态（s12）** | 左栏右缘 + 右栏左缘手柄（高亮/宽度气泡/min-max）；右栏复用 resizeSplit；**左栏宽迁 per-workspace（R1 已决）作前置** | P1 | ✅ | 左栏宽 global→per-workspace 迁移 |
| **P4 放大/缩小（s13）** | 右面板⤢占满中区（复用 maximize）+ 单页签放大 | P1 | ✅ | 单页签放大为新增 |
| **P5 主机切换全流程（s7）** | 切换过场 + 整工作区重载 + 离线重连 | host-runtime | 与 P3/P4 并行 | 中（过场态接 bootstrap gate） |
| **P6 锚定浮层** | 环境信息 popover / 打开位置下拉 / 主机下拉细节态 | P2 | ✅ | floating-panels Gotcha |
| **P7 Composer 彩色 token（反馈 K）** | / 与 @ 渲染为带色 token；队列/附件/工具行贴 Codex | composer(有) | ✅ 独立 | token 颜色开放项① |
| **P8 ⌘K + 搜索浮层** | 加「快速切中转站」分组 + 搜索高亮 | command-center(有) | ✅ | 低 |
| **P9 单胶囊三层级联** | 提供方🔒·中转站(预留)·模型 重构 | combined-model-selector | ✅ | §6② 中转站预留 |
| **P10 全交互态 + 右键菜单 + Toast/Alert/callout** | 逐屏对齐 s1–s14 全态；三套节点右键菜单 | 各批 | 收尾 | 量大，逐屏抽查 |

> 每批结束 = typecheck + lint + 该批纯函数/selector 单测 green + 对应屏像素抽查。

---

## 9. 怎么把 dev 跑起来给董事长看（P1 骨架完成后）

> 铁律：**绝不重启 6767 主 daemon**（那是 prod Paseo）。Helm dev 用 **7070** 端口（`package.json` 已配 `PASEO_LISTEN=127.0.0.1:7070`），状态隔离在本 checkout `.dev/paseo-home`。

```bash
# 终端 1：Helm dev daemon（7070，隔离 .dev/paseo-home）
npm run dev:server        # = PASEO_LISTEN=127.0.0.1:7070
# 终端 2：Expo（8081，连 7070）
npm run dev:app           # 浏览器开 http://localhost:8081
# 或桌面壳（自带 Electron-flavored Expo，自有端口 8082-8089）
npm run dev:desktop
```

**先检后跑**：若已有 7070 daemon 在管 agent，先 `npm run cli -- daemon status` 确认，**不要贸然杀**（同 6767 原则，避免杀掉运行中 agent）；优先 `npm run dev:desktop`（自起隔离实例）。

**董事长看 P1 三区主壳的路径**：
1. 启动后落地到 onboarding/欢迎 → 连本机 host → 落主页空态（route：`/h/[serverId]/workspace/[workspaceId]`，即 `WorkspaceScreen`）。
2. 桌面浏览器/Electron 下即见三区：左栏（窗口细条+host 胶囊+对话树）/ 中区（canvas 顶栏+居中 Composer）/ 右面板（点开关→启动器）。
3. 验证：开合左栏、开合右面板、点对话节点跳转、空态打字。

**改动后必跑**：`npm run typecheck` + `npm run lint`（改协议/跨包才 `npm run build:client`，本轮一般不需要）。**绝不跑全量测试套件**（只跑改动文件 `npx vitest run <file> --bail=1`）。

---

## 10. 风险与未决（实现期风险 + 需董事长/PM 定夺）

| # | 风险/未决 | 倾向 | 需谁定 |
| --- | --- | --- | --- |
| **R1 ✅已决** | 左栏宽 = **per-workspace 每工作区记忆**（董事长拍板，守设计 s12，否决 global 倾向）。需把宽度从 panel-store 全局 `sidebarWidth` 迁到 per-workspace store + 引入 active-workspace 上下文。 | **per-workspace**；迁移作 P3 拖拽前置（P1 不新增 global 宽度逻辑、沿用既有读，迁移在 P3-prep）。 | 董事长已决 |
| **R2** | 前进/后退 ‹ ›（对话浏览历史）现有代码**无**对话级 navigation history。需新建一个轻量历史栈（route 历史）。 | 倾向新建小 `conversation-history` store（route 栈），桌面 only。 | 架构内决，**PM 知会** |
| **R3** | `workspace-screen.tsx` 4471 行巨型组件，canvas 顶栏重构牵动多。 | 按 §2.2 拆 selector + 同批删旧，**不在巨组件里加分支**。 | 实现纪律 |
| **R4** | 「对话」节点点击 = 加载到中区，但现路由是 workspace 级。需确认「对话(根 agent) → workspace 路由 + 聚焦其 tab」映射（`navigateToAgent` 已支持）。 | 复用 `navigateToAgent`；对话树节点选中态由路由派生。 | 架构内决 |
| **R5 ✅已决** | **/命令 token 颜色 = accent 绿 `#20744A`**（董事长拍板）。 | 绿 `#20744A`（P7 实现） | 董事长已决 |
| **R6 ✅已决** | **右面板页签全部可关（含审查）+ 可从启动器/新选项卡重新加回**（董事长拍板，去掉审查固定第一）。 | 全部可关；`canCloseRightPanelTab` 恒 true | 董事长已决 |
| **R7 ✅已决** | **环境信息 popover 动作 = 入口级**（董事长拍板）。 | 入口级；底层 commit/push 属后续 | 董事长已决 |
| **R8** | 对话树「项目」分组 = agents 按 workspace→目录聚合；同 cwd 多 workspace 的归并需对齐 `docs/architecture.md` 的 directory-backed vs workspace-owned 边界。 | 项目节点按目录聚合、对话节点按 workspaceId/agentId，不混淆。 | 架构内决 |
| **R9** | Composer 彩色 token 需改 input 渲染层（现为纯文本 TextInput）。富文本 token 在 RN TextInput 内渲染有平台坑（桌面 web 可控）。 | 桌面 only，先 web 富渲染；保持 `useAgentAutocomplete`/`resolveClientSlashCommand` 逻辑不动。 | 实现期验证 |

---

## 附：复用清单 / 禁止重造（硬约束）

**禁止重造（已有，直接用）**：
- 布局/折叠/放大/宽度/调序 → `workspace-layout-store` + `workspace-layout-actions`（**不要新写一套布局态**）。
- 右面板 tab 内容 → `panel-registry` + `register-panels`（review/terminal/browser/file 全在）。
- 对话父子语义（detach/级联归档/关页签非对称/运行聚合）→ `subagents/*`（**不要重写语义**）。
- Composer（draft/submit/attachments/slash/mention）→ `composer/*` + `autocomplete-popover` + `client-slash-commands`。
- git/env 数据 → `git/*`（`checkoutStatusQueryKey`、`branch-switcher`、`workspace-actions`）。
- 打开位置 → `workspace/open-target-planner` + `desktop-open-targets`。
- host 切换/重连 → `runtime/host-runtime`（**不要重写连接态**）。
- ⌘K → `command-center` + `use-aggregated-agents`。
- 浮层 → `components/ui/{combobox,dropdown-menu,context-menu,autocomplete-popover,tooltip}` + `floating-panel-portal`（**不造第五种 primitive**）。
- 侧栏排序/置顶/折叠 → `sidebar-order/pins/collapsed-sections store`。
- 导航 → `navigate-to-agent` + `host-routes` + `prepareWorkspaceTab`。

**真新建（确认没有）**：
- `conversation-tree/{types,select,render}`（对话树 selector + 单层渲染，节点模型递归预留）。
- 左栏 `<SidebarWindowChrome>`（窗口细条）、`<HostSwitcherPill>`、右面板 `<RightPanelLauncher>`。
- 中区 `<CanvasTopBar>` chrome 组合（`<OpenLocationDropdown>`/`<EnvInfoPopover>` 套既有数据）。
- `conversation-history`（前进/后退栈，R2）。
- Composer 彩色 token 的 input 渲染层（P7）。

---

## 测试策略（对应 standards §5 · 必写单测）

**必单测的纯函数 / store 逻辑**（不渲染即可测）：
- `conversation-tree/select.ts::buildConversationTree`（项目分组、根/子分类、subagentCount 聚合、递归 children 填充、单层渲染裁剪 `MAX_RENDER_DEPTH`）。
- `selectRightPanelMode(layout)`（launcher vs tabs 派生）、`canCloseRightPanelTab`（**全部可关含审查**，R6 已决）。
- `selectCanvasTopBarChrome`（空态精简 vs 使用中控件可见性）。
- 三区宽度 clamp / min-max 触限（P3，复用 `clampSidebarWidth` + 新右栏 clamp）。
- 对话树右键 action 映射（detach/archive/close-tab）**断言调用既有纯函数**（subagents/* 已有单测，新测只验「树菜单→正确语义函数」的接线）。
- conversation-history 栈（前进/后退可用性、禁用态）。

**端到端验证点**（对应 requirement 验收 §6，逐屏抽查，不靠截图/text-grep）：
- 反馈 B/反馈 1：三区独立、侧栏开关在窗口细条不在 canvas 顶栏（s3）。
- 反馈 F：对话树单层 + 角标 + 选中跳转 + 三套右键（s6）。
- 反馈 C/H/D/E：tab 悬浮✕/调序/新选项卡、右面板放大、拖宽效果态（s4/s12/s13）。
- 反馈 I：主机下拉与胶囊同宽锚正下（s7）。
- 反馈 ②③①：右面板启动器默认态、打开位置 app 图标、环境信息 popover（s4/s2）。
