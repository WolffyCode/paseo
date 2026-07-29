# 架构 · 左侧对话树（项目 → 对话 → subagent 无限嵌套 · 主机切换器 · 桌面 only）

> 日期：2026-07-11 · 状态：闸 2 已过（P2）；**2026-07-23 增补 §8「信息架构三轮修正 · 架构结论」（闸 2 增补材料，对应 requirement §8 开放问题 7/8/11/12 + 混合行高评估）** · 关联：[requirement.md](./requirement.md)（闸 1 + 2026-07-23 两轮修正）· [ui.html](./ui.html)
> 写 **HOW 的边界**，不写逐行实现（实现交 Codex / helm-developer）。遵循 [standards.md](../../standards.md) + [coding-standards.md](../../../coding-standards.md)。
> 本文接进的既有底座（已 Read 核对，非臆造）：`packages/app/src/conversation-tree/*`（旧树**行为底账**：`render.tsx`/`select.ts`/`use-conversation-row-actions.ts`/`use-project-row-actions.ts`/`project-action-availability.ts`，逐条右键菜单/分组排序/双击重命名/选中判定已读源码核对）、`shell/file-tree/*`（class+纯函数范式、`FileTreeStoreDeps` 注入范式、`file-tree-data.ts` 数据层范式、`file-tree-context.wiring.ts` 组合根范式、`FileTreeController` 收窄范式）、`shell/right-panel/*`（`WorkbenchModel`/`RightPanelController`/`TabContentFactory`/`OpenTabRequest` **现状真实实现**，非早期设计稿）、`shell/model/shell-model.ts` + `selectors/regions.ts`、`shell/components/shell-root.tsx`（左区当前 `RegionPlaceholder`，:75）、`@/runtime/host-runtime.ts`（`useHosts`/`useHostRuntimeConnectionStatus`/`useHostMutations`，**已有 shell/ 精度**：`file-tree-region.tsx`/`right-panel-region.tsx` 已直接 import）、`@/hooks/use-command-center.ts` + `@/components/command-center.tsx` + `@/stores/keyboard-shortcuts-store.ts`（⌘K 现状实现）、`@/components/sidebar/host-switcher-pill.tsx`（主机切换器现状 UI）、`@/utils/navigate-to-agent/{index,resolve}.ts`（点击联动现状真实机制，`surface` 字段已读源码验证真实存在）、`docs/helm/requirements/2026-06-30-file-tree/architecture.md`（§4/§9，新旧硬隔离三分类框架与「组合根读老 store 取 live client」先例的来源）、`docs/helm/requirements/2026-06-28-shell/architecture.md`（壳几何/`ShellContext`/组合方法 pattern 源）、`docs/agent-lifecycle.md` + `docs/terminal-activity.md` + `packages/protocol/src/{messages.ts,agent-state-bucket.ts,agent-labels.ts}`（协议侧数据/状态）。

---

## 0. 立场先行：OOP 与三分类复用框架（沿用已定立场，不重新论证）

**OOP 立场**：与 [2026-07-07-right-sidebar/architecture.md §0](../2026-07-07-right-sidebar/architecture.md) 完全同一立场，不重新推导——`shell/` 下每个功能域的领域模型 = 一个 `makeAutoObservable` 的 **MobX 类**（`ShellModel`/`FileTreeStore`/`WorkbenchModel` 已是既定范式），类只持**状态 + 转移**，每处**派生/策略**委托给同目录的**纯函数**模块；`observer` 组件 = 模型的纯渲染 + 派发。本需求新增的 `ConversationTreeStore` 照此范式。

**订正（闸 2 评审 ①B1 后收窄）**：`host-switcher/` **不是**第二个 MobX 类——已读 `@/runtime/host-runtime.ts` 核实 `HostRuntimeConnectionStatus`（`"idle"|"connecting"|"online"|"offline"|"error"`）与主机列表本就是 `useHosts()`/`useHostRuntimeConnectionStatus()` 产出的响应式数据，`host-switcher/` 没有一处需要自己持有、自己转移的状态——OOP 立场的意义是"有状态+转移就封装成类"，不是"逢模型必建类"；没有状态却硬造一个空类，才是违反同一条立场。`host-switcher/` 的模型层因此只有：一个纯函数 `connection-tone.ts`（态→色调映射）+ 直接方法调用（`runProbeCycleNow(serverId)`，见 §3.10），不建类。这一处上一版的表述是过度套用范式，本轮订正。

**新旧硬隔离三分类框架**：沿用 [2026-06-30-file-tree/architecture.md §4/§9](../2026-06-30-file-tree/architecture.md) 已确立、被 right-sidebar 复用过一次的框架（该文档称"standards §8"，但现行 `standards.md` 已改版至 7 节、无该编号——**本文档不再引用这个失效编号，直接引用两份已落地的姊妹 architecture 作为先例**，避免引证一个不存在的条款）：

- **(A) 允许直连**：共享包（`@getpaseo/client`、`@getpaseo/protocol`）、`@/constants/platform`、`@/components/ui/*`（设计系统原语）、npm 包、Electron 预加载全局桥、`shell/` 自有模块（`ShellModel` 等）。
- **(B) 必须在新目录等价重写**：旧 `packages/app/src/` 下 `shell/` 以外的功能模块（hooks / stores / utils 里绑定旧数据形状的部分），禁止 import 旧实现，允许肉眼参考旧代码找思路。
- **(C) 唯一接缝 = bridge**：如确有需要触碰旧业务模块（如 file-tree 触老 composer / 老 workspace-layout），只能收口在显式命名的 `*-bridge.ts`（纯工厂，零旧 import）+ `*-bridge.wiring.ts`（唯一 import 旧模块的文件）两文件对，登记在案、注明将来切换点。
- **额外一条已确立先例（file-tree §9③）**：**组合根/wiring 文件**允许读老 `session-store`/`runtime/host-runtime` **仅为取出 live `DaemonClient` 引用与连接上下文**（`features`/`isOffline` 等），这是与 (C) 不同的、单独登记的第三类接触点——数据层本身仍对旧 store 零 import（结构类型注入）。**壳层挂载点**（`shell/components/*-region.tsx`，注意是 `shell/components/`，不是被隔离的功能目录本身）**明确不算接缝**，可自由 import 老 `runtime`/`session-store` 做响应式订阅（file-tree §9 原话："属新壳 shell/…不在硬隔离范围内、不算接缝"）。

**本需求对这四类的落地结论（§4 详述，此处先给结论）**：(A)(B) 都用得上；**(C) 零接缝**——本需求没有任何"往老业务模块塞内容"的需要（不像 file-tree 要触老 composer/老右栏 tab）；但新增**第五类**——**宿主注入点**（区别于 bridge，见 §4.C）：两处交互（⌘K 搜索、添加主机）需要**挂起旧 App 的 React 组件树**（弹窗/全局面板），这不是"调一个函数"能表达的接缝，只有**壳层挂载点**（本就豁免硬隔离）能承接；本模块自身零旧 import，回调的构造方式（搜索走 Deps 字段、添加主机走组件 prop——各自形状见 §4.C）由挂载点分别绑定。

---

## 1. 模块划分

新增两个平级模块 + 一个壳层挂载点，**不共用一个目录**——对话树与主机切换器是两个零交集的领域（对话树关心 agent/project 数据；主机切换器关心连接/连接态），塞进一个目录会让"高内聚"变成"因为都画在左栏顶部就凑一起"的伪聚合，故拆开（`docs/coding-standards.md`《Structure and modules》：目录是模块不是命名空间）。

| 路径                                        | 职责（单一）                                                                                                                                     | 为什么这么切                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/app/src/shell/conversation-tree/` | 对话树全部内容：数据订阅、分组/嵌套/去重、行派生、菜单派生、置顶/重命名/移除的写路径、点击联动的树侧半场                                         | 与旧目录同名（`conversation-tree`），刻意延续——语义连续，未来 grep/迁移心智负担最小；内容是**全新实现**，不 import 旧目录一行代码                              |
| `packages/app/src/shell/host-switcher/`     | 主机切换胶囊 + 下拉：显示当前主机/连接态、切主机、发起离线重连、"添加主机…"入口                                                                  | 独立能力，未来可能被其它壳位置（如设置页、未来的统一顶栏）复用；与对话树零数据耦合，拆开才是真正的高内聚低耦合，不是形式上贴标签                               |
| `shell/components/left-region.tsx`（新增）  | 壳左区挂载点：按 `serverId` 组装 `HostSwitcher` + `ConversationTreePanel`，把 `shell-root.tsx` 左区当前的 `RegionPlaceholder`（:75）换成真实内容 | 对位既有 `file-tree-region.tsx`/`right-panel-region.tsx` 的挂载范式；**明确豁免硬隔离**（file-tree §9 先例），是本需求两处"宿主注入点"回调的唯一绑定处（§4.C） |

### 1.1 `conversation-tree/` 内部切法

| 路径                                       | 职责（单一）                                                                                                                                                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model/conversation-tree-store.ts`         | **唯一真相源**（MobX 类，对齐 `FileTreeStore` 风格）：`agents`/`projects`/`workspaceDetails` 快照态、展开/置顶/选中/编辑态、面板态；只持状态 + 转移，派生/策略全外包                                                                                     |
| `model/build-tree.ts`                      | **纯函数**：`{agents, projects, workspaceDetails}` → `ConversationTreeNode[]`（分组/嵌套/排序/去重/标题解析，等价重写旧 `select.ts` 的 `buildConversationTree`，见 §4.2）                                                                                |
| `model/flatten-rows.ts`                    | **纯函数**：节点树 → 扁平行（`depth`/`canExpand`/`isExpanded`），等价重写旧 `flattenConversationTreeRows`                                                                                                                                                |
| `model/partition-pinned.ts`                | **纯函数**：节点 + 置顶目标 → `{pinned, projects, loose}` 三组，等价重写旧 `partitionPinnedNodes`                                                                                                                                                        |
| `model/group-projects.ts`                  | **纯函数**：workspace 列表 + 空项目列表 → `ConversationTreeProject[]`，等价重写旧 `buildWorkspaceStructureProjects`                                                                                                                                      |
| `model/apply-agent-update.ts`              | **纯函数**：当前 `agents`/`projects` + 一条 `agent_update` 事件 → 下一状态 + 悬空引用清理指令（**新增，回应闸 2 评审 ①I2/③#1/③#6**，见 §3.3/§3.8）                                                                                                       |
| `model/apply-workspace-update.ts`          | **纯函数**：当前 `workspaceDetails` + 一条 `workspace_update` 事件（或初始快照的一条 `WorkspaceDescriptorPayload`）→ 下一 `workspaceDetails`（**新增，回应闸 2 评审 ③#1/#2**，见 §3.3）                                                                  |
| `model/status-dot.ts`                      | **纯函数**：`{status, requiresAttention, pendingPermissionCount, attentionReason}` → 五态状态点（**全新设计，逐支对齐 `deriveAgentStateBucket`**，见 §3.2；**2026-07-23 更名 `run-status.ts` 并扩展文案派生，见 §8.6**）                                 |
| `model/project-menu.ts`                    | **纯函数 selector**：项目行右键菜单派生（对位 file-tree 的 `context-menu-items.ts` 范式）                                                                                                                                                                |
| `model/conversation-menu.ts`               | **纯函数 selector**：对话/subagent 行共用菜单派生                                                                                                                                                                                                        |
| `model/pin-state.ts`                       | **纯函数**：置顶集合转移（`togglePin`/`isPinned`），对位 `clipboard-state.ts`                                                                                                                                                                            |
| `model/rename-state.ts`                    | **纯函数 + 态类型**：内联重命名校验 + `Editing` 判别联合，对位 `inline-edit.ts`（见 §3.5）                                                                                                                                                               |
| `model/types.ts`                           | 本模块自有类型（`ConversationTreeNode`/`ConversationTreeAgent`/`ConversationTreeProject`/`WorkspaceDetail`/…）                                                                                                                                           |
| `data/conversation-tree-data.ts`           | 数据层：注入的 `ConversationTreeRpcClient` 结构接口 → 本模块词汇的 `ConversationTreeData`（对位 `file-tree-data.ts`）                                                                                                                                    |
| `data/conversation-tree-context.wiring.ts` | 组合根：`createConversationTreeStoreForServer(serverId)`——读 live `DaemonClient` + 连接上下文注入 store（对位 `file-tree-context.wiring.ts`，是 §0 所述"第三类接触点"）                                                                                  |
| `components/conversation-tree-panel.tsx`   | 根容器（observer）：顶部工具条 + 三段分组 + 全态切换，只渲染 + 派发；响应 `focusedRootId`/`activeNodeId` 变化滚动定位到该行（`FlatList.scrollToIndex`，对位 file-tree `scrollSelectedIntoView`，回应闸 2 评审 ③#10，覆盖需求 §3"搜索"流程与验收标准 33） |
| `components/tree-toolbar.tsx`              | "新对话" + "搜索" 两个顶部入口行                                                                                                                                                                                                                         |
| `components/tree-row.tsx`                  | 单行（observer）：按 `node.kind` 渲染图标/缩进/状态点/角标/hover 态                                                                                                                                                                                      |
| `components/tree-context-menu.tsx`         | 菜单渲染壳：直连共享地基 `@/components/ui/context-menu.tsx`，喂 selector 产出的项列表                                                                                                                                                                    |
| `components/workspace-hover-card.tsx`      | 对话行 hover 工作区卡片（等价重写，见 §4.2 与 §7 的范围收缩说明）                                                                                                                                                                                        |
| `components/tree-states.tsx`               | 空/加载/错误/离线四态展示，每态带出口动作                                                                                                                                                                                                                |

### 1.2 `host-switcher/` 内部切法

| 路径                           | 职责（单一）                                                                                                                                                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model/connection-tone.ts`     | **纯函数**：`HostRuntimeConnectionStatus`（`@/runtime/host-runtime` 既有的 5 态：`idle`/`connecting`/`online`/`offline`/`error`）→ 胶囊/下拉用的三态色调，等价重写旧 `host-switcher-model.ts` 的 `selectHostConnectionTone`                                          |
| `components/host-switcher.tsx` | 胶囊 + 下拉：普通函数组件（非 observer——本模块无 MobX 状态，见下）；直读 `@/runtime/host-runtime` 的 `useHosts()`/`useHostRuntimeConnectionStatus()`（§4.A 既有精度）；本地 `useState` 管下拉开合；`onSwitchHost`/`onReconnect`/`onAddHost` 三个 prop 是全部对外动作 |

**没有 `model/host-switcher-store.ts`**——这是本节的核心结论，直接回应闸 2 评审 ①B1。表里也没有第二个纯函数承载"重连中"状态，因为已读源码核实 `useHostRuntimeConnectionStatus(serverId)` 本身就会在探测周期开始时反映 `"connecting"`（`runtime/host-runtime.ts` 的探测/连接状态机在 `runProbeCycleNow`/`switchToConnection` 路径上驱动 `connectionStatus` 经过 `"connecting"` 再落定 `"online"`/`"offline"`——这是既有基础设施的既有产出，不是本模块新增的状态）。"点击离线行 → 该行显示重连中 → 成功后转在线"这条视觉链路只需**调用一次既有方法 + 读同一个已有的响应式 hook**，不需要另建状态。具体调用点见 §3.10。

**为什么这样切**：与 file-tree 完全同构的三层——`model/`（类 + 纯函数，零渲染依赖）、`data/`（连服务器）、`components/`（纯渲染）——判据"不渲染就能测"贯穿 `model/` 全部文件。行派生（`build-tree`/`flatten-rows`）与菜单派生（`project-menu`/`conversation-menu`）刻意分成不同文件而非塞进 store：前者是"数据 → 树形状"的结构问题，后者是"当前态 → 可见菜单项"的策略问题，两者变化原因不同（新增一个菜单项不该碰分组逻辑，反之亦然），符合"单一职责"而非过度拆分——每个文件都有真实、当下就需要的独立调用者与独立测试意图。

**工厂缝（框架不 import 具体类型）是否适用**：**不适用，本轮不引入**。`WorkbenchModel`/`TabContentFactory` 需要工厂缝，是因为右侧面板要在**运行时按 `TabKind` 分派**到互不相同、未来还会再增加的具体类型（file/conversation/browser/review/terminal）。本模块的节点类型（project/conversation/subagent）是一个**已闭合、不会再增加第四种**的判别联合，直接在纯函数里 `switch (node.kind)` 分支即可——引入工厂只是给三个固定分支包一层无意义的间接层（YAGNI）。

---

## 2. 模型与 UI 分离

| 关注点                                              | 归属（模型层，不渲染即可测）                                                                                                                                   | UI 只做                                                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| agents/projects/workspaceDetails 原始快照、增量更新 | `ConversationTreeStore`（`agents: Map`/`projects: Map`/`workspaceDetails: Map`），`data/` 层负责 RPC/订阅（`agent_update` + `workspace_update` 两路，见 §3.3） | 无——UI 从不直接摸这三个 Map                                                                                                       |
| 树形状（分组/嵌套/排序/去重/深度封顶/标题解析）     | `build-tree.ts` + `flatten-rows.ts`（store 的 `visibleRows` computed 委托）                                                                                    | 遍历渲染 `visibleRows`，逐行读 `depth`/`canExpand`/`isExpanded`                                                                   |
| 增量应用与悬空引用清理                              | `apply-agent-update.ts`/`apply-workspace-update.ts`（纯函数，store 只调用 + `runInAction` 写回，不内联判定，见 §3.3/§3.8）                                     | 无                                                                                                                                |
| 置顶分组                                            | store `pins: readonly ConversationTreePinTarget[]` 字段（持久化，回应闸 2 评审 ①M3——补齐字段声明）+ `partition-pinned.ts`/`pin-state.ts` 转移                  | 渲染三段（置顶/项目/对话），派发 `togglePin`                                                                                      |
| 状态点五态                                          | `status-dot.ts`（纯派生，无状态）                                                                                                                              | 按返回值渲染对应色 + 是否脉冲动画（动画本身是渲染层的视觉实现，非模型态）                                                         |
| 展开/收起（项目持久化 · 对话/subagent 会话内）      | store 两个字段：`collapsedProjectKeys`（持久化）/`expandedNodeIds`（会话内），转移走 `toggleProjectCollapse`/`toggleExpand`                                    | 渲染箭头方向，派发 toggle                                                                                                         |
| 选中态（根对话聚焦 + 当前激活行）                   | store `focusedRootId`/`activeNodeId`，转移走 `activateNode`（§3.6 精确语义）                                                                                   | 渲染两档灰阶，无判定分支                                                                                                          |
| 内联重命名                                          | `rename-state.ts` + store `editing` 字段，转移走 `beginRename`/`setDraftName`/`commitRename`/`cancelRename`                                                    | 渲染输入框 + 聚焦态边框，回车/blur/Esc 映射到对应 action（映射规则来自纯函数，非组件分支，对位 file-tree `inline-exit.ts` 范式）  |
| 右键菜单项列表                                      | `project-menu.ts`/`conversation-menu.ts`（live 现算，不入 store）                                                                                              | 打开菜单时调 selector，渲染结果                                                                                                   |
| RPC 写失败反馈                                      | store 写路径 action 的 `catch` 分支调 `deps.reportError(...)`（§3.4/§3.7，新增，回应闸 2 评审 ①I3）                                                            | 渲染 toast/行内错误（呈现形态由组件层决定，模型只决定"要不要报错 + 报什么"）                                                      |
| hover 工作区卡片数据                                | `workspaceDetails` Map 的对应条目（`WorkspaceDetail`，§3.1，新增，回应闸 2 评审 ③#2）                                                                          | 渲染标题/分支/目录/最近变更；diffstat/PR/CI 摘要范围收缩说明见 §7                                                                 |
| 主机连接态/切换/重连                                | `HostSwitcher` 无状态模型层：`connection-tone.ts`（纯函数）+ 直读 `@/runtime/host-runtime` 的响应式 hook（§4.A 允许直连，§0/§1.2 已订正不建类）                | 渲染胶囊 + 下拉，按当前色调把点击路由到 `onSwitchHost`/`onReconnect`（纯派生，§3.10）                                             |
| 下拉开合（纯瞬时 UI 态）                            | **组件本地 `useState`**——selector 永不读、跨渲染不存活（对位 shell 架构 §2.2 "拖拽锚点不进模型"的判据）                                                        | 本地态                                                                                                                            |
| 面板级态（空/加载/错误/ready）                      | store computed `panelState`（**四态，不含 offline**，见 §3.9，回应闸 2 评审 ③#3）                                                                              | **组件层**用 `isOffline ? "offline" : store.panelState` 合成第五态（对位 `file-tree-panel.tsx:53` 的真实实现，非 store 内部计算） |

判据与 file-tree/right-panel 一致：任一格若发现"组件里在算转移/分支策略"，即放错层。

---

## 3. 数据流与接口契约

### 3.1 命名对象 shape（跨模块契约，不 inline）

> **2026-07-23 增补**：本节 shape 是 P2 过闸基线；信息架构三轮修正带来的字段增量（`provider`/`updatedAt`/`projectId`/`workspaceKind`/project 节点 `branch`+`diffStat`）与 `statusDot → runStatus` 更名，以 §8.6/§8.7 的增量表为准，本节原文不重排。

```ts
// model/types.ts —— 本模块自有类型，结构对齐协议 payload，但不 import 旧 conversation-tree/types.ts
type ConversationTreeNodeKind = "project" | "conversation" | "subagent";
type ConversationStatusDot = "running" | "needsAttention" | "idle" | "error" | "initializing";

interface ConversationTreeAgent {
  readonly id: string;
  readonly title: string | null;
  readonly workspaceId: string | null;
  readonly parentAgentId: string | null; // 解自 labels["paseo.parent-agent-id"]，data 层完成解码
  readonly status: AgentLifecycleStatus; // @getpaseo/protocol，直连不重写
  readonly requiresAttention: boolean;
  readonly attentionReason: "finished" | "error" | "permission" | null; // 状态点优先级判定用，见 §3.2
  readonly pendingPermissionCount: number; // 同上；两字段合起来是 deriveAgentStateBucket 判 needs_input 的同一组输入
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly sessionId: string | null; // provider 原生 session id（旧 runtimeInfo/persistence 的等价字段，见 §4.2），复制会话 ID 用
}

interface ConversationTreeProject {
  readonly projectKey: string;
  readonly name: string;
  readonly workspaceIds: readonly string[];
}

// hover 卡片 + 对话标题实时解析共用同一份数据，见 §3.3/§7
interface WorkspaceDetail {
  readonly title: string | null; // 对话节点标题的实时覆盖源，优先于 agent.title（等价重写旧 workspaceDisplayById，见 §3.3）
  readonly directory: string;
  readonly branch: string | null;
  readonly lastChangeAt: string | null;
  readonly diffStat: { readonly added: number; readonly removed: number } | null; // 数据源未在本轮核实，见 §7 范围收缩说明
}

interface ConversationTreeNode {
  readonly kind: ConversationTreeNodeKind;
  readonly id: string; // project 节点 = projectKey；其余 = agentId
  readonly title: string;
  readonly workspaceId: string | null;
  readonly statusDot: ConversationStatusDot | null; // project 节点恒 null
  readonly subagentCount: number; // 全部后代数（非直接子节点数），project 节点恒 0（用 children.length 另算）
  readonly children: readonly ConversationTreeNode[];
}

interface ConversationTreeRow {
  readonly node: ConversationTreeNode;
  readonly depth: number;
  readonly canExpand: boolean;
  readonly isExpanded: boolean;
}

// kind 字面量刻意对齐旧 `stores/sidebar-pins-store/state.ts:8` 的 "workspace"（非本模块概念上更顺口的
// "conversation"）——本轮决策与旧 store 共享同一份 AsyncStorage 数据、同一套判别式，见 §3.4/§4.2（回应
// 闸 2 评审 ②F3：新旧置顶数据连续，不断档）。
type ConversationTreePinTarget =
  | { readonly kind: "project"; readonly projectKey: string }
  | { readonly kind: "workspace"; readonly workspaceId: string };
```

```ts
// model/build-tree.ts —— 递归内部带访问集合防环护栏（回应闸 2 评审 ③#8，见 §7）
function buildConversationTree(input: {
  agents: readonly ConversationTreeAgent[];
  projects: readonly ConversationTreeProject[];
  workspaceDetails: ReadonlyMap<string, WorkspaceDetail>; // 对话节点标题解析用（§3.3），新增字段
}): ConversationTreeNode[];

// model/flatten-rows.ts
function flattenTreeRows(
  nodes: readonly ConversationTreeNode[],
  options: { isCollapsed: (node: ConversationTreeNode) => boolean; maxDepth: number },
): ConversationTreeRow[];

// model/partition-pinned.ts
function partitionPinnedNodes(input: {
  nodes: readonly ConversationTreeNode[];
  pins: readonly ConversationTreePinTarget[];
}): {
  pinned: ConversationTreeNode[];
  projects: ConversationTreeNode[];
  loose: ConversationTreeNode[];
};

// model/group-projects.ts —— 等价重写旧 buildWorkspaceStructureProjects
function groupWorkspacesIntoProjects(input: {
  workspaces: readonly WorkspaceDescriptorPayload[]; // @getpaseo/protocol
  emptyProjects: readonly WorkspaceProjectDescriptorPayload[];
}): ConversationTreeProject[];
```

```ts
// model/apply-agent-update.ts —— 新增，回应闸 2 评审 ①I2（策略委托给纯函数）+ ③#1（project 字段增量）+
// ③#6（悬空引用清理需按可达性而非精确 id），详细行为见 §3.3/§3.8
type AgentUpdateEvent =
  | {
      readonly kind: "upsert";
      readonly agent: ConversationTreeAgent;
      readonly projectKey: string | null;
    }
  | { readonly kind: "remove"; readonly agentId: string };

interface ApplyAgentUpdateResult {
  readonly agents: ReadonlyMap<string, ConversationTreeAgent>;
  readonly projects: ReadonlyMap<string, ConversationTreeProject>;
  // 三个字段各自独立：调用方（store）逐一核对是否命中当前的 editing/activeNodeId/focusedRootId 并清空。
  readonly unreachableIds: ReadonlySet<string>;
}

function applyAgentUpdate(
  state: {
    agents: ReadonlyMap<string, ConversationTreeAgent>;
    projects: ReadonlyMap<string, ConversationTreeProject>;
  },
  event: AgentUpdateEvent,
): ApplyAgentUpdateResult;

// model/apply-workspace-update.ts —— 新增，回应闸 2 评审 ③#1/#2（workspace_update 订阅面 + hover 卡片数据）
function applyWorkspaceUpdate(
  details: ReadonlyMap<string, WorkspaceDetail>,
  workspace: WorkspaceDescriptorPayload, // @getpaseo/protocol，来自初始快照的一条或增量推送
): ReadonlyMap<string, WorkspaceDetail>;
```

### 3.2 状态点五态派生（全新设计，逐支对齐 `deriveAgentStateBucket`）

> **2026-07-23 增补**：五分支判定顺序不变；文件/类型/字段随「对话(根)行改文字标签、subagent 留圆点」的视觉分道**更名为语义词**（`run-status.ts`/`ConversationRunStatus`/`runStatus`），并新增 attention 拆因与状态标签文案两个纯派生，见 §8.6。

```ts
// model/status-dot.ts
function deriveConversationStatusDot(input: {
  status: AgentLifecycleStatus; // "initializing" | "idle" | "running" | "error" | "closed"
  requiresAttention: boolean;
  attentionReason: "finished" | "error" | "permission" | null;
  pendingPermissionCount: number;
}): ConversationStatusDot;
```

**判定顺序（订正：回应闸 2 评审 ③#4，不再是"requiresAttention 无条件优先"）**：

```ts
if (input.pendingPermissionCount > 0 || input.attentionReason === "permission")
  return "needsAttention";
if (input.status === "error" || input.attentionReason === "error") return "error";
if (input.status === "running") return "running";
if (input.requiresAttention) return "needsAttention"; // 剩下的情形只会是 attentionReason === "finished"
if (input.status === "initializing") return "initializing";
return "idle";
```

`closed` 不会进入这个函数（上游 `build-tree.ts` 已把 `status === "closed"` 的 agent 连同 `archivedAt` 一起过滤掉，见 §4.2 表格底部的行为修正说明）。

**为什么不直接复用 `packages/protocol/src/agent-state-bucket.ts` 的 `deriveAgentStateBucket`**：该函数的输出 `WorkspaceStateBucket` 是**按工作区**聚合语义（`needs_input`/`failed`/`running`/`attention`/`done`），`done` 把 idle/initializing/closed 合三为一——本需求要求"空闲"与"初始化中"是两个**可视觉区分**的独立态（验收标准 7），直接复用会丢失这个区分，削足适履。**复用的是同一套原始字段与词汇精神**（`AgentLifecycleStatus`/`requiresAttention` 均来自 `@getpaseo/protocol`，共享包直连不重写），**新写的只是一个五分支映射**——这与 `packages/protocol/src/terminal-activity.ts` 已经示范的模式一致：同一产品下，终端活动有自己的 `deriveTerminalActivityStatusBucket`，工作区聚合有自己的 `deriveAgentStateBucket`，**每个消费粒度各自一个薄组合函数、共享底层词汇**，不是"一个函数服务所有粒度"。

**判定顺序订正的具体依据（闸 2 评审 ③#4，已读源码核实）**：上一版把 `requiresAttention` 放在最优先，理由只举了"idle 态也可能 requiresAttention"这一个例子，没考虑 `error` 与 `requiresAttention` 同时为真的组合——但读 `packages/server/src/server/agent/agent-manager.ts` 的 `checkAndSetAttention`（约 L3892-3929）确认：agent **进入 error 状态的同一瞬间**，daemon 会**同时**置位 `requiresAttention:true, attentionReason:"error"`，这是绝大多数出错场景的真实形状，不是边缘情形。协议侧**唯一**处理过"`status` 与 `requiresAttention` 同时存在时该判谁优先"这个问题的既有函数 `deriveAgentStateBucket`，给出的优先级是 `needs_input(0) > failed(1) > running(2) > attention(3) > done(4)`——**error 明确排在 attention 之前**。本函数的判定顺序**逐支对齐这个既有权威判定**（含此前遗漏的 `pendingPermissionCount`/`attentionReason:"permission"` 输入——`use-command-center.ts` 的 `sortAgents` 也把这两个字段当独立信号处理，不是总与 `requiresAttention` 同步），**仅在其 `done` 分支处分裂出 initializing/idle 两态**——这是唯一必要的分歧点（上一段落已论证），其余优先级顺序原样复用，不再自创。词汇体系统一（running/needsAttention/idle/error/initializing 与运行/待输入/空闲/出错 同源），组合函数按粒度各自一份，是符合既有先例的正常设计，不是抄近路。

### 3.3 端到端数据流：实时流 → 树增量更新 → 渲染

**生命周期：构造 ↔ 析构必须配对（回应闸 2 评审 ①B2）**：`ConversationTreeStore` 是这个 MobX 类家族里**第一个**持有常驻推送订阅的成员——`FileTreeStore`/`WorkbenchModel` 都是请求/响应式 IO，没有这个先例可比。订阅的获取必须有对应释放，挂载点**不能只用 `useMemo` 换 key**（那样只管构造，不产生任何清理；旧订阅若不显式 unsubscribe，会在旧 store "被丢弃"后仍存活并触发，每次切主机泄漏一个监听器）。落地范式：

```ts
useEffect(() => {
  const store = createConversationTreeStoreForServer(serverId, hostDeps);
  return () => store.dispose();
}, [serverId]);
```

对齐 `file-tree-region.tsx`/`right-panel-region.tsx` 已确立的"`useEffect` 配对清理"惯例（如 `useEffect(() => registerFileTreeAccess(...), [...])`——两者都是本代码库对"有生命周期含义的副作用"的既定写法），不是本需求发明的新模式。`ConversationTreeStore.dispose(): void` 内部调用 `data.onAgentUpdate`/`data.onWorkspaceUpdate` 各自返回的 unsubscribe 函数；`left-region.tsx` 用这个 `useEffect` 而非 `useMemo` 承接 store 的生命周期。

```
壳挂载 conversation-tree 区（serverId 变化 = 换主机，useEffect 依赖数组换值 → 先跑上一次清理再构造新的）
  → data/conversation-tree-context.wiring.ts: createConversationTreeStoreForServer(serverId, hostDeps)
      读 live DaemonClient（同 file-tree §9③ 先例：组合根读 session-store 取 client 引用，零渲染依赖）
      构造 data 层（结构类型注入，data 层零 import 旧 store）
  → store.load()：
      data.fetchAgents({includeArchived:false}) + data.fetchWorkspaces()  // 并行首拉快照
      → store.agents / store.projects 填充；fetchWorkspaces 返回的每条 WorkspaceDescriptorPayload 经
        applyWorkspaceUpdate 逐条折进 store.workspaceDetails（初始快照与增量走同一条纯函数，非两套逻辑）
      → tree computed 首次求值（读 agents + projects + workspaceDetails）→ 渲染 sCT1 默认态
  → data.onAgentUpdate(handler) 订阅：DaemonClient 的 agent_update 推送（upsert 含 project 归属 / remove）
      → handler 只做：调 applyAgentUpdate(state, event) → runInAction 写回 agents/projects
        + 按返回的 unreachableIds 清理 editing/activeNodeId/focusedRootId（策略在纯函数里，见 §3.8）
      → tree computed 重算（MobX 自动依赖追踪，非手写差量 diff）→ 受影响行重渲染
  → data.onWorkspaceUpdate(handler) 订阅（新增，回应闸 2 评审 ③#1）：DaemonClient 的 workspace_update 推送
      → handler 只做：调 applyWorkspaceUpdate(store.workspaceDetails, event.workspace) → runInAction 写回
      → tree computed 因 workspaceDetails 变化重算（对话节点标题跟着刷新）；hover 卡片直接读同一个 Map
```

**为什么必须订阅 `workspace_update`（回应闸 2 评审 ③P0#1，这是本轮"数据保鲜主线"的核心缺口）**：重命名对话改的是 workspace 的 title，走 `WorkspaceTitleSetRequestSchema`（`workspace.title.set.request`，`messages.ts:823`），协议侧广播用**独立的** `workspace_update` 事件（`messages.ts:3014`；`daemon-client.ts` 的 `DaemonEvent` 联合类型里 `agent_update` 与 `workspace_update` 是两个不同分支，已读源码核实）——**不经过** `agent_update` 主通道，`ConversationTreeAgent.title` 本身也不会因为 workspace 改名而改变。已读旧代码 `conversation-tree/render.tsx:141-143` 的原始注释：

> "Live workspace descriptors — the sidebar `projects` snapshot revalidates async, so a rename (setWorkspaceTitle) wouldn't surface there for a while... **反馈: 对话重命名保存后名称不变。**"

这是一条真实发生过、已经修过一次的用户反馈 bug；旧代码的修复机制是一路对 live `workspacesMap` 的持续订阅（`workspaceDisplayById` 用它覆盖 title）。本文档上一版的数据流**只订阅了 `agent_update`**，等于把这个已知 bug 原样带回来——现已订正：`workspaceDetails` Map 承接同一路数据，`build-tree.ts` 对 `kind==="conversation"` 节点的标题解析优先读 `workspaceDetails.get(workspaceId)?.title`，读不到才落回 `agent.title`（`kind==="subagent"` 节点没有这层覆盖，恒用 `agent.title`——与旧 `select.ts` 的既有区分一致，非本次新引入）。

项目改名同理：`project.rename.request` 改的是 project，协议里**没有 `project_update` 事件**（已全库 grep 确认）；唯一能感知项目归属/名称变化的增量信号是 `agent_update` upsert 自带的 `project` 字段（`ProjectPlacementPayloadSchema`，含 `projectKey`/`projectName`）——上一版的 handler 描述承认这个字段存在（"upsert 含 project 归属"）却从未使用它，`applyAgentUpdate` 的 upsert 分支现在用这个字段维护/新增 `store.projects` 条目，用户在一个此前未知的新项目下新建对话时，该对话不会被误判为"游离对话"。

**去重/身份轴**：单一——`ConversationTreeAgent.id`（agent 主键）。项目身份轴 = `projectKey`。workspace 详情身份轴 = `workspaceId`。不存在交叉身份判定（不像 file-tree 需要区分 path 与行号两个轴，本模块每类数据天然只有一个稳定 id）。

### 3.4 写路径：置顶 / 重命名 / 移除

| 动作                    | 触发                                           | 落地                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 失败反馈（新增，回应闸 2 评审 ①I3）                                                                                                                                   |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 置顶 / 取消置顶         | 菜单项点击                                     | `store.togglePin(target)` → `pin-state.ts` 纯转移 → **本地持久化写**（AsyncStorage，key/判别式对齐旧 `sidebar-pins-store`，见下方"置顶数据连续性"与 §4.2）——**不发 RPC**，与旧行为一致（置顶本就是纯前端态，非后端概念，Read `select.ts`/`sidebar-pins-store` 已核实）                                                                                                                                                                                                                                                                                                                                        | 纯本地写入，无网络失败态                                                                                                                                              |
| 重命名项目 / 重命名对话 | 双击（对话行，需已绑定工作目录）或菜单"重命名" | `store.beginRename(kind, id)` → 内联输入 → `commitRename()` → `data.renameProject`/`data.renameConversation` → **真实 RPC**：`client.renameProject(projectKey, name)` / `client.setWorkspaceTitle(workspaceId, title)`（`packages/client` 直连，非旧 hook）；对话重命名成功后由 §3.3 新增的 `workspace_update` 订阅自然回流显示，**不需要**额外的本地补丁；项目重命名**没有** `project_update` 事件，成功后 `commitRename()` 自己把返回的新名字 patch 进 `store.projects.get(projectKey)`（显式的、RPC 成功之后才做的本地更新，不是乐观更新）                                                                 | reject → `catch` 调 `deps.reportError({action:"rename", message})`；`editing` 态**保留**（不清空、不静默丢弃用户已敲的文字），用户可重试提交或 Esc 取消               |
| 移除项目                | 菜单"移除"（破坏性）                           | `store.requestRemoveProject(projectKey)` → 经注入 `confirmDestructive` 端口二次确认（对位 `FileTreeStoreDeps.confirmDestructive`）→ 确认后 `data.removeProject` → `client.removeProject(projectKey)`；确认后**仅从侧栏移除该分组**，不碰磁盘（与需求 §2.D 一致，RPC 本身语义如此，非本模块编造）；同项目重命名，**没有** `project_update` 事件，成功后 store 显式 `projects.delete(projectKey)`（RPC 成功之后才做，非乐观）——该项目原有 `workspaceIds` 对应的对话在下一次 `tree` computed 求值时，因不再命中任何已知 `projectKey`，被 `build-tree.ts` 既有的"未映射→游离对话"分桶逻辑自然接住，不需要额外代码 | reject → `catch` 调 `deps.reportError({action:"remove", message})`；项目行**保留在原处**（因为是 RPC 成功后才删除，失败时压根没删），无需"删除后再加回来"这种回滚逻辑 |
| 新建对话（全局/项目内） | 顶部"新对话"行 / 项目行 hover 图标             | **纯路由导航**，见 §3.5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 路由导航无网络失败态                                                                                                                                                  |
| 创建工作树              | 项目菜单                                       | **纯路由导航**（读旧代码核实：现状 `use-project-row-actions.ts` 本就是 `router.navigate(buildHostNewWorkspaceRoute(...))`，无 RPC），见 §4.2                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 同上                                                                                                                                                                  |

**置顶数据连续性（回应闸 2 评审 ②F3）**：旧 `sidebar-pins-store` 用 AsyncStorage key `"sidebar-pins"`、判别式 `{kind:"project"|"workspace", ...}`。新旧路由在 cutover 完成前长期并存（同 right-sidebar §4.1 的既有论证），置顶是**用户主动产生、长期有意义的数据**，不是可随路由切换自然重置的临时态——若新模块另起一个 AsyncStorage key 或换一个判别式字面量，用户今天在旧侧栏置顶的项目，明天在新树里就看不到（反之亦然）。**决策：新模块与旧 store 共享同一个 AsyncStorage key `"sidebar-pins"`，`ConversationTreePinTarget` 的判别式字面量对齐为 `"workspace"`（已在 §3.1 落实，不再是上一版的 `"conversation"`）**——两边读写同一份数据、同一套 shape，是真正的连续，不是"两处各管一半"。取舍：牺牲了"conversation"这个在本模块内部更顺口的命名，换来零迁移成本的数据连续性；不选"一次性迁移读取"（方案 c）是因为共享 key 本来就不需要迁移这一步，更简单。

### 3.5 两个 deferred 端口的命名契约（点对话 → 中区 · subagent → 右栏）

**点根对话 → 中区（树侧自持的普通字段，不再包一层收窄接口，回应闸 2 评审 ①M1）**：读 `packages/app/src/app/h/[serverId]/home.tsx` 已确认——新壳当前**没有真实的按对话路由**，`ShellContext.workspaceKey` 是硬编码占位串 `${serverId}:__home__`（注释原话："real workspace identity arrives with the conversation-content milestone"）。这意味着"中区当前呈现哪个对话"这个概念，此刻**在新壳里无处寄存**——不是 `ShellModel` 没暴露，是这个概念本身还不存在。故本轮由 `ConversationTreeStore` 暂代持有一个普通 `readonly focusedRootId: string | null` 字段，点击根对话行 → `store.activateNode(node)` 置 `focusedRootId = node.id`（见 §3.6 精确规则，签名已订正为接收完整节点而非裸 id）。

**上一版这里另外包了一层 `ConversationTreeController`/`asConversationTreeController`（对位 `FileTreeController`）——本轮删除，不是改名，是真删**：`FileTreeController` 的先例之所以成立，是因为它的方法（`showDirectory`/`revealFile`）**今天就有真实调用方**（`revealFile` 被 right-panel 的 `FileDocumentModel.onActivated()` 实际调用）；而 `focusedRootId` 通读全文找不到任何读取方——连树自己的 `isRowSelected` 派生都是直接读 `store.focusedRootId`，不经过这层收窄接口。本文档在 §3.5（subagent → 右栏那条，见下）已经明确拒绝了同类型的"提前建缝"（"接收方本身不存在，提前建 bridge 只是形式主义"）——`focusedRootId` 的对外收窄面是同一处境（conversation-page 这个接收方同样不存在），却在上一版被区别对待，是本文档自己的判据没有一以贯之，本轮改正：**`focusedRootId` 就是 store 的一个只读字段，不建 `ConversationTreeController`**。等 conversation-page 真正落地、明确了它到底要"读树的字段"还是"读路由参数"时，再决定要不要在这个字段外面包一层——现在包，包的形状大概率是错的（上一版自己也承认"两种可能性都留着"，说明连作者都不确定）。

**subagent → 右栏（注入 deps 方法，非完整 bridge）**：

```ts
// ConversationTreeStoreDeps（见 §3.7）的一个字段
readonly openRightPanel: () => void;
```

点击 subagent 行 → `store.activateNode(node)` 内部对 `node.kind === "subagent"` 分支额外调 `deps.openRightPanel()`（wiring 绑定到 `shellModel.openRight()`，**属 shell 自有能力，不算旧依赖接缝**，对位 file-tree 的"`right-tab-bridge` 内调 shell `openRight()` 不算接缝"先例）。**读代码已确认止步于此的原因**：`shell/right-panel/model/tab-content.ts` 的 `OpenTabRequest.kind` 目前是**单一字面量 `"file"`**（非判别联合），`TAB_KIND_POLICY.conversation` 明确 `{enabled:false, comingSoon:true}`——右侧栏module 现在**没有任何**方式构造出一个"对话"类型的 tab，无论调用方是谁。故本轮**只留命名端口 + 唯一诚实可做的动作（展开右栏）**，不佯装已经把 tab 开出来了；**不新建 `conversation-tab-bridge.ts`**——bridge 文件对位的是"已有接收方、只差接线"的场景（如 file-tree 的 `right-tab-bridge`），这里接收方本身不存在，提前建 bridge 只是形式主义。**将来切换点**：待 `2026-07-07-right-sidebar` 给 `OpenTabRequest` 加 `conversation` 分支 + `TabContentFactory` 加对应 `create` 分支后，`openRightPanel` 升级为真正的 `openConversationTab({agentId, title}): void`，**只改 wiring 与这一个 deps 字段的调用点**，`activateNode` 的分支逻辑不用改。

这两个端口的验收边界与需求 §2.G / §5 完全对齐——**发起侧本轮完整可验**（`focusedRootId` 真实置位可测；`openRight()` 真实调用、右栏确实展开可验），**承接侧**（conversation-page 渲染消息流 / 右栏渲染"对话"类型内容）均在各自里程碑范围内，本模块不越界实现、不空喊已完成。

### 3.6 `activateNode` 精确语义（选中态双态共存的实现依据 · 回应闸 2 评审 ①B3/②F6）

**签名订正（回应闸 2 评审 ①M2）**：上一版签名是 `activateNode(nodeId: string): void`——调用方（`tree-row.tsx`）派发点击时手上明明拿着完整的 `ConversationTreeRow`（含 `node.kind`），却被要求只传一个裸 id，store 内部还要反查一次 kind（project 不在 `agents` 里；conversation vs subagent 靠 `parentAgentId` 是否为 null）；而"project 不可选中"这条领域不变量只在文档里用一句话声明，TypeScript 并不强制。改为接收已经过滤过 kind 的节点，把不可能态钉进类型系统：

```ts
type SelectableNode = Extract<ConversationTreeNode, { kind: "conversation" | "subagent" }>;

activateNode(node: SelectableNode): void
```

调用方（`tree-row.tsx`）本就持有完整节点，`kind === "project"` 的行在渲染层根本不会构造出 `SelectableNode`（那一支走独立的 `toggleProjectCollapse`），"传一个 project 节点进来"在类型层面就不可表达，不需要再讨论"运行时收到非法输入怎么办"。

- `node.kind === "conversation"`（根）：`activeNodeId = node.id`；`focusedRootId = node.id`。**本轮不调用 `deps.navigate`**（回应闸 2 评审 ①B3：上一版这里写"调 `deps.navigate(...)`……no-op-safe"，但 §3.7 明确 `navigate` 生产环境绑定的是真实 `expo-router` `router.navigate`，而 §3.5 已证明此刻没有任何已知安全的路由字符串可传——"no-op-safe"是未经证明的断言，字面实现会在点击验收标准 34 的核心交互时对一个未定义目标发起真实导航，有导航到错误页面的回归风险。订正为**明确不调**，`focusedRootId` 字段本身已经是"中区应呈现哪个对话"的唯一真相源，不需要用一次导航去佐证它；`deps.navigate` 继续保留在 `ConversationTreeStoreDeps`（§3.7），但只服务"新建对话"/"创建工作树"两个**有具体、已核实路由字符串**的调用点（`buildHostOpenProjectRoute`/`buildHostNewWorkspaceRoute`，§3.4/§4.2），不服务 `activateNode`。
- `node.kind === "subagent"`：`activeNodeId = node.id`；`focusedRootId` **原样不变**；额外调 `deps.openRightPanel()`。

`isRowSelected(node) = node.id === focusedRootId || node.id === activeNodeId` 是**纯派生**（不入 store），驱动两档灰阶。这精确满足需求 §2.G 的表述——点击某 subagent 时，其**所属根对话行**只要仍等于 `focusedRootId`（该 subagent 是当前聚焦对话下的子节点，这是树内点击的绝大多数场景）就保持原有选中标识；`activeNodeId` 另外让该 subagent 行自己也可视为"当前激活"。

### 3.7 `ConversationTreeStoreDeps`（注入契约，对位 `FileTreeStoreDeps` · navigate 实参契约回应闸 2 评审 ①B3/②F6）

```ts
interface ConversationTreeStoreDeps {
  readonly data: ConversationTreeData;
  readonly openRightPanel: () => void; // shellModel.openRight()，见 §3.5
  readonly navigate: (route: string) => void; // expo-router 的 router.navigate；仅服务新对话/创建工作树两个有具体路由的调用点，见 §3.6
  readonly openInFinder: (absolutePath: string) => Promise<void>; // 等价重写 desktop-open-targets.ts 的 list→找 kind:"file-manager"→用其 id，见 §4.2/§4.A（订正：非硬编码 editorId，回应闸 2 评审 ②F2）
  readonly openInNewWindow: (absolutePath: string) => void; // 直连 Electron 预加载全局，见 §4.A
  readonly copyToClipboard: (text: string) => void; // expo-clipboard 薄封装
  readonly confirmDestructive: (input: { title: string; body: string }) => Promise<boolean>; // @/utils/confirm-dialog，对位 file-tree 先例
  readonly reportError: (input: { action: "rename" | "remove" | "pin"; message: string }) => void; // 新增，回应闸 2 评审 ①I3，见 §3.4
  readonly openSearch: () => void; // 宿主注入点，构造方式见下方"两层 Deps"与 §4.C
  readonly getContext: () => ConversationTreeContext;
}
interface ConversationTreeContext {
  readonly serverId: string;
  readonly isElectron: boolean;
  readonly isOffline: boolean;
}
```

**为什么连"允许直连"的能力也要注入**（如 `navigate`/`openInFinder`）：与 `FileTreeStoreDeps.pickDirectory` 同一理由——这些调用会触发**真实系统副作用**（路由跳转、系统弹窗），store 单测需要能用 `vi.fn()` 替身而不产生真实副作用；"允许直连"回答的是"哪个目录允许 import 这个模块"，不等于"store 内部要不要注入它"，二者是正交问题。

**两层 Deps：`ConversationTreeStoreDeps` 谁构造（回应闸 2 评审 ①I1，openSearch 不再有两条矛盾路径）**：上一版 `openSearch` 同时出现在这份 Deps 接口里、又出现在 §4.C 描述成"`tree-toolbar.tsx` 自己的 `onOpenSearch` 组件 prop，绕过 store"——两条路径并存，实现者会无所适从。订正为**只有一条路径：`openSearch` 是 Deps 字段，不是组件 prop**（`tree-toolbar.tsx` 调 `store.openSearch()`，store 内部调 `deps.openSearch()`，与置顶/重命名等其它动作同一形状）。但 `deps.openSearch` 的**具体实现**必须 `setCommandCenterOpen(true)`（旧 `@/stores/keyboard-shortcuts-store`），这一步只有豁免硬隔离的 `left-region.tsx` 能做——`data/conversation-tree-context.wiring.ts` 自己不能做（它在被隔离的 `shell/conversation-tree/` 内部，不享有豁免）。故把 Deps 拆成两层：

```ts
// 只能由 shell/components/left-region.tsx（豁免硬隔离的挂载点）构造的那一小片 Deps
interface ConversationTreeHostDeps {
  readonly openSearch: () => void; // 绑定 useKeyboardShortcutsStore.getState().setCommandCenterOpen(true)
}

// data/conversation-tree-context.wiring.ts —— 组合根自己能构造其余全部字段（data/openRightPanel/
// navigate/openInFinder/openInNewWindow/copyToClipboard/confirmDestructive/reportError/getContext，
// 均属 §4.A 允许直连或 shell 自有能力），只有 hostDeps 这一小片必须由调用方带进来
function createConversationTreeStoreForServer(
  serverId: string,
  hostDeps: ConversationTreeHostDeps,
): ConversationTreeStore;
```

`left-region.tsx` 调用 `createConversationTreeStoreForServer(serverId, { openSearch: () => useKeyboardShortcutsStore.getState().setCommandCenterOpen(true) })`——旧 store 的 import 只出现在 `left-region.tsx` 这一处，`shell/conversation-tree/**` 全程零 import。

### 3.8 竞态：实时流更新 vs 用户操作

| 场景                                                                                                                           | 处理规则                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 正在内联重命名某节点时，该节点的 `agent_update` 推送到达（如另一端也在改标题）                                                 | **不打断编辑**——`editing.draftName` 是独立于 `agents` Map 的本地缓冲，upsert 只更新 Map，不触碰 `editing`；用户提交时以自己的 `draftName` 发 RPC，天然是"最后提交者生效"，与其它任何两个客户端并发改名的语义一致，不额外发明合并逻辑                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 当前 `editing`/`activeNodeId`/`focusedRootId` 指向的节点被远端归档/关闭（`agent_update` 的过滤结果导致其从 `agents` Map 消失） | **一致性清理规则（订正：按可达性而非精确 id 匹配，回应闸 2 评审 ③#6）**——上一版只判"被移除 id 精确等于 editing/activeNodeId/focusedRootId"，漏了"被移除的是祖先，当前选中的是其存活的后代"这种情形：例如点了根对话 R 下的 subagent S（`activeNodeId=S`，`focusedRootId` 仍指向 R），随后 R 被远端归档——`agent_update` 的 remove 只删 `agents.delete(R)`，S 自己没有被归档、仍在 Map 里，但 S 已经没有任何一条从存活 root 出发的路径能到达它。`apply-agent-update.ts` 因此不做"精确 id 比对"，而是在每次 upsert/remove 应用完后，对 `editing.targetId`/`activeNodeId`/`focusedRootId` 三者各自沿 `parentAgentId` 链条向上追溯，一旦追到某一环不在新的 `agents` Map 里（含自身就不在），就判定为不可达、计入返回值的 `unreachableIds`；store 的 handler 逐一核对三个字段是否落在 `unreachableIds` 里，命中则清空（`editing` 命中 → `cancelEdit()`；`activeNodeId`/`focusedRootId` 命中 → 置 `null`，中区回到"无对话选中"，由 conversation-page 未来自行处理这个态）。三条判定在同一个 action 内做完，避免连续三次独立 re-render；可达性判定与清理策略都在纯函数里，store 只消费返回值（回应闸 2 评审 ①I2） |
| `expanded`/`collapsedProjectKeys` 集合里残留已消失节点的 id                                                                    | **无需清理**——`flatten-rows.ts` 只遍历 `agents`/`projects` 现存节点，Set 里的死 id 不产生任何渲染或逻辑效果，主动清理是无收益的额外代码（YAGNI）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 两条 `agent_update`（或 `workspace_update`）乱序到达同一 id                                                                    | **不做序号守卫**——`AgentSnapshotPayload`/`WorkspaceDescriptorPayload` 本身不带版本号/序号字段（协议侧确认），现状 `session-store` 对这两条流本就是"后到覆盖"语义，本模块继承同一特征，不引入本流其它消费方都没有的新保证（不为一个模块单独超纲设计）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 用户操作与"切主机"并发（如正点着置顶，同时点了主机切换器切到另一台）                                                           | **不需要特殊处理**——切主机触发 `[serverId]` 换值，§3.3 已订正为 `useEffect` 依赖数组换值（先跑上一次的 `store.dispose()` 清理再构造新 store，非上一版的"仅 `useMemo` 换 key"），旧 store 实例连同其订阅、其 in-flight 状态一并被显式释放，不存在跨实例串扰                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### 3.9 面板级态

**订正：`panelState` 只有四态，不含 offline（回应闸 2 评审 ③#3——上一版描述的机制，恰好是 file-tree 源码注释明确写着要避免的写法）**：

```ts
get panelState(): "loading" | "empty" | "error" | "ready" {
  // 优先级：error > loading > empty > ready
}
```

上一版把 offline 也算进这个 computed，声称"由 `getContext().isOffline` 合成进去"——但 `getContext()` 是一个纯注入回调，不是像 `ShellModel.workspaceKey` 那样由 `setContext()` action 写入的真 observable 字段；computed 内部读一个不触碰任何 `@observable` 的普通闭包调用，大概率**不会**被 MobX 追踪为依赖，会精确复现 file-tree 自己注释里明文记录的问题：computed 缓存会让面板在断线/恢复后卡在过期态。也就是说上一版**转述了正确的教训，却给出了那个教训要避免的具体机制**——已读源码核实 `FileTreeStore.panelState`（`file-tree-store.ts:213`）真实实现就是四态，紧邻注释原话："Host offline is composed in the React mount from the live runtime hook; it is not a MobX observable, so reading it here would let computed caching keep the panel stuck in a stale offline state after reconnect."合成发生在**组件层**、一句纯 JS 三元表达式（`file-tree-panel.tsx:53`）：`const panelState = isOffline ? "offline" : store.panelState;`——`isOffline` 是组件的 React prop（`useHostRuntimeConnectionStatus` 直接产出，React 原生响应式），从未进入 MobX computed 内部。

本模块订正为与 file-tree **结构一致**，不只是语言上"对位"：`ConversationTreeStore.panelState` 只算 loading/empty/error/ready 四态，不读 `getContext().isOffline`（`getContext()` 的 `isOffline` 字段仍保留在 `ConversationTreeContext` 里，只是不喂给 `panelState`）；`conversation-tree-panel.tsx` 用与 file-tree 完全相同的合成写法：`const panelState = isOffline ? "offline" : store.panelState;`，`isOffline` 来自组件自己订阅的 `useHostRuntimeConnectionStatus(serverId)`。

**"重试"就是重新调用 `store.load()`（回应闸 2 评审 ③#12）**：错误态点"重试"不建独立的 `retry()` action——首次加载失败与切主机后加载失败是同一个 `load()` 入口（切主机本身经 §3.3 的 `useEffect` 依赖数组重建整个 store，新 store 构造后天然重新 `load()`），没有需要额外区分的两种上下文，`store.load()` 是唯一入口，幂等（重复调用不产生副作用叠加）。

### 3.10 主机切换器：切换与离线重连（董事长闸 1 特批的唯一新行为，回应闸 2 评审 ①B1）

```ts
// host-switcher/components/host-switcher.tsx
interface HostSwitcherProps {
  readonly activeServerId: string | null;
  readonly onSwitchHost: (serverId: string) => void;
  readonly onReconnect: (serverId: string) => void;
  readonly onAddHost: () => void;
}
```

**在线主机行点击（现状行为，原样复用）**：分派到 `onSwitchHost(serverId)` → `left-region.tsx` 绑定为 `router.navigate(buildHostRootRoute(serverId))`——已读源码核实与现状 `host-switcher-pill.tsx` 的 `handleSelectHost` 逐字一致（现状对**所有**行都是这一句，无分支）。`[serverId]` 换值触发 `ShellRoot` 树下各区域（`ConversationTreeStore`/`WorkbenchModel`/`FileTreeStore`）按各自既有的构造/清理范式重建，天然进入各自 loading 骨架——这就是 requirement §2.H"整工作区经过切换中过场后重载"的机制来源。**裁定（回应闸 2 评审 ③#11）：不额外插入一段独立的"连接中"动画**——在线主机本就在线，点击后没有需要等待的连接步骤；ui.html sCT5 描绘的"过场"观感由导航后各区域的 loading 骨架态自然构成，是同一个机制的一个阶段，不是两个独立机制。

**离线主机行点击（唯一新行为，本轮真正设计的部分）**：分派到 `onReconnect(serverId)` → `left-region.tsx` 绑定为 `getHostRuntimeStore().runProbeCycleNow(serverId)`（已读源码核实：`runtime/host-runtime.ts:1962` 的 `HostRuntimeStore.runProbeCycleNow(serverId?: string): Promise<void>`，委托给该 host 的 `HostRuntimeController.runProbeCycleNow()`；后者内部用 `probeCycleInFlight` 去重，重复点击不会并发探测两次）——**不直接调 `onSwitchHost`**，与在线行点击的唯一差异就是分派到了不同的 prop。退避参数（`PROBE_TICK_MS`/`PROBE_MAX_BACKOFF_MS`）复用 host-runtime 已有的模块级常量，本模块不新增、不重置退避计时——手动触发只是"现在就跑一次探测周期"，不影响后续自动探测的既有节奏。

**点击路由到哪个 prop，是纯派生，不是持久状态**：`host-switcher.tsx` 的行点击处理器按 `connection-tone.ts` 对该行当前状态的判定做一次内联分支——`tone === "off" ? onReconnect(serverId) : onSwitchHost(serverId)`——单行三元不值得再抽一个纯函数文件（`docs/coding-standards.md`《抽函数克制》）。

**状态展示：无需新状态**——探测开始后 `useHostRuntimeConnectionStatus(serverId)` 本就会经过 `"connecting"`（已读源码核实，见 §1.2），`connection-tone.ts` 把它映到与其它行相同的"连接中"色调；失败则该 hook 落回 `"offline"`，行保持可再次点击（幂等，不设"已尝试过"这种额外拦截态）；成功则落 `"online"`，此时该行的点击分派自然转到 `onSwitchHost`——用户"再次点击同一行"才真正切换过去，与需求 §2.H/§8① 的行为修正逐字对齐。

### 4.1 处置清单 / 迁移点清单

**合法性先说清（回应闸 2 评审 ②F5，比照 right-sidebar §4.1 的既有格式基线）**：新壳 `home.tsx → ShellRoot` 与旧 `workspace/[workspaceId] → WorkspaceScreen` 是**两条并存的活路由**；本轮触碰的子系统 = 新壳左区这一块，旧路由不在本轮触碰面——这是 coding-standards《Refactor, don't patch》里"untouched legacy 可以不动"的例外情形，不是"打补丁留旧"。更关键的是：新 shell **不复用**下表这些旧件的代码——需要的能力已按最新模型方式等价重写进新目录（§4.2 审计表逐条对应）。故旧件对新 shell = 零依赖，留在旧路由、随旧路由 cutover 一并删除，对新 shell 零影响。

**A. 旧件——本轮不删，随旧路由 cutover 统一删**：

| 旧件                                                                                                                                            | 活在哪                                                                           | 本轮处置                                                                                                                       | 何时删           |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| `packages/app/src/conversation-tree/*`（8 个文件，`render.tsx`/`select.ts`/`use-*-row-actions.ts`/`project-action-availability.ts`/`types.ts`） | 旧 `components/left-sidebar.tsx:655` 挂载，服务旧 `workspace/[workspaceId]` 路由 | 不删；本需求**零 import**，仅作行为参考（已逐条读源码，见 §4.2 及各节引用）                                                    | 随旧路由 cutover |
| `@/stores/sidebar-pins-store`、`@/stores/sidebar-collapsed-sections-store`                                                                      | 同上                                                                             | 不删；新模块另起等价持久化，**置顶数据与旧 store 共享同一 AsyncStorage key**（§3.4/§4.2，回应闸 2 评审 ②F3）                   | 随旧路由 cutover |
| `@/components/rename-modal`（`AdaptiveRenameModal`）、`@/components/workspace-hover-card`                                                       | 同上                                                                             | 不删；新模块用**内联重命名**（对位 file-tree 范式，见下）与**新写 hover 卡片**取代，不是同一套 UI 的搬运                       | 随旧路由 cutover |
| `@/components/sidebar/host-switcher-pill.tsx` + `host-switcher-model.ts`（**新增，回应闸 2 评审 ②F1——上一版遗漏此行**）                         | 旧侧栏底部（紧邻设置），旧 `components/left-sidebar.tsx` 挂载                    | 不删；本需求**零 import**，`shell/host-switcher/` 等价重写（§4.2）——与上两行是完全同类的"旧 UI 被新模块等价替代"，本该同表处理 | 随旧路由 cutover |

**行为升级说明（非本模块臆造，均有文本/代码依据）**：

- **重命名从模态改内联**：旧树用 `AdaptiveRenameModal`（弹窗+确定/取消按钮）；本需求 UI 定稿明确"行内变为输入框+聚焦态边框，回车提交、Esc 取消"（requirement §2.C）——这与 file-tree 已经落地的内联编辑范式一致，本需求是**采纳更新的既有范式**，不是发明新交互。
- **归档态过滤新增 `status==="closed"`**：旧 `select.ts` 只过滤 `archivedAt` 一个条件；requirement §2.B 明文"已归档 / **已关闭**的对话及其 subagent 不出现在树中"——`build-tree.ts` 的过滤条件因此比旧 `select.ts` 多一项，是需求文本要求的行为差异，非本文档自行加戏。

**B. 迁移点清单（新入口的连通性）**：

| 发起点                        | 位置                             | 本轮                                 | 端到端可验？                                                                     |
| ----------------------------- | -------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| 树内点根对话行                | `shell/conversation-tree/`（新） | `activateNode` 置 `focusedRootId`    | ✅ 树侧完整（中区渲染消息流由 conversation-page 独立验收，§3.5）                 |
| 树内点 subagent 行            | 同上                             | `activateNode` 调 `openRightPanel()` | ✅ 展开右栏这一半（右栏渲染"对话"内容由 right-sidebar 后续里程碑独立验收，§3.5） |
| 顶部"新对话" / 项目行"新对话" | 同上                             | 路由导航（§4.2）                     | ✅ 全通——路由是既有能力，与承接页面是否翻新无关                                  |
| 顶部"搜索"                    | 同上                             | 宿主注入点 `openSearch()`（§4.C）    | ✅ 全通——绑定的是现状真实可用的 ⌘K                                               |
| 主机切换器"添加主机…"         | `shell/host-switcher/`（新）     | 宿主注入点 `onAddHost()`（§4.C）     | ✅ 全通——绑定的是现状真实可用的三步添加主机流程                                  |

（本需求没有"旧发起点换线到新落点"的条目——不像 file-tree 的 `right-tab-bridge` 要把一座**既有**桥的接线目标从旧改到新；对话树在新壳里是**从零填充**的空容器，新入口天然只指向新实现，没有旧引用需要摘除。）

### 4.2 旧依赖 → 新目录等价落点审计表

| 旧 app 依赖（禁引）                                                                                                                                                    | 原用途                                                                                                                                                                                                                                                                                         | 新目录等价落点                                                                                                                                                           | 方式                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversation-tree/select.ts` 的 `buildConversationTree`/`flattenConversationTreeRows`/`partitionPinnedNodes`                                                          | 树分组/嵌套/扁平化/置顶分区                                                                                                                                                                                                                                                                    | `model/build-tree.ts`/`flatten-rows.ts`/`partition-pinned.ts`                                                                                                            | 等价重写（算法照搬已读源码逻辑：按 `parentAgentId` 递归建树、`createdAt` 升序、`subagentCount`=全部后代、深度封顶只影响 `canExpand` 不影响计数——见 §3.1 引用点，逐条对齐 §6 测试用例）                                                                                                                                                                                                                                            |
| `@/utils/workspace-identity` 的 `normalizeWorkspaceOpaqueId`                                                                                                           | workspace id 归一                                                                                                                                                                                                                                                                              | `model/types.ts` 旁的小归一函数（新写，逻辑等价：trim + 空串→null）                                                                                                      | 重写（单行逻辑，等价重写成本近零，优于跨目录引用）                                                                                                                                                                                                                                                                                                                                                                                |
| `@/projects/workspace-structure.ts` 的 `buildWorkspaceStructureProjects`                                                                                               | workspace 列表 → 项目分组                                                                                                                                                                                                                                                                      | `model/group-projects.ts`                                                                                                                                                | 等价重写（按 `projectId` 分组 + 拼入 `emptyProjects`）                                                                                                                                                                                                                                                                                                                                                                            |
| `@/stores/sidebar-pins-store`                                                                                                                                          | 置顶集合（Zustand + AsyncStorage persist，keyed by serverId）                                                                                                                                                                                                                                  | `model/pin-state.ts`（纯转移）+ 组合根层的小型 AsyncStorage 持久化（对位 `ShellModel` 自己的 `partializeShellState`/`hydrate` 范式，非新发明一套持久化机制）             | 等价重写                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `@/stores/sidebar-collapsed-sections-store`                                                                                                                            | 项目展开/收起持久化                                                                                                                                                                                                                                                                            | `conversation-tree-store.ts` 的 `collapsedProjectKeys` 字段 + 同上小型持久化                                                                                             | 等价重写                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `@/components/rename-modal`（`AdaptiveRenameModal`）                                                                                                                   | 重命名 UI                                                                                                                                                                                                                                                                                      | `components/tree-row.tsx` 内联输入态（`rename-state.ts` 驱动）                                                                                                           | 不是重写同一形态，是**采纳已有的更新范式**（inline-edit，见 §4.1 行为升级说明）                                                                                                                                                                                                                                                                                                                                                   |
| `@/components/workspace-hover-card` + `@/hooks/use-sidebar-workspaces-list` 的 `createSidebarWorkspaceEntry`                                                           | 对话行 hover 卡片（标题/分支/目录/最近变更 + 可选 diffstat/PR/CI）                                                                                                                                                                                                                             | `components/workspace-hover-card.tsx`，数据源改读 `store.workspaceDetails`（§3.1/§3.3，新增字段）                                                                        | 等价重写核心四要素（标题/分支/目录/最近变更，数据取自 `workspaceDetails` Map，见 §3.3）；diffstat/PR/CI 摘要**数据源未在本轮核实**，见 §7 风险条目，给出诚实的范围收缩路径                                                                                                                                                                                                                                                        |
| `@/utils/sidebar-agent-state` 的 `deriveSidebarStateBucket`（**新增，回应闸 2 评审 ②F4——上一版遗漏**）                                                                 | 旧 `createSidebarWorkspaceEntry` 用它把"最近变更时间"与根 agent 完成态 reconcile（workspace 已标记完成但根 agent 仍在收尾/有新对话正在创建时，取更晚的时间点）                                                                                                                                 | 本轮**不等价重写这条 reconcile 规则**——`workspaceDetails.lastChangeAt` 是 `workspace_update` 裸时间戳，范围收窄声明见 §7                                                 | 范围收窄（诚实声明，非静默遗漏）：若验收发现"最近变更时间"在这类场景下可感知地滞后于旧行为，后续把 reconcile 规则等价重写进 `apply-workspace-update.ts`，不动其它部分                                                                                                                                                                                                                                                             |
| `@/hooks/use-hover-safe-zone.ts`（`useHoverSafeZone`，**新增，回应闸 2 评审 ②F4**）                                                                                    | hover 卡片的出现/消失安全区域判定（纯交互几何，不绑定业务数据）                                                                                                                                                                                                                                | `components/workspace-hover-card.tsx` 内联等价拷贝                                                                                                                       | **拷贝而非 import**——按 `docs/floating-panels.md` 的既有指引（该文档原话："prefer copying the closest file and trimming"，未把它列进 `@/components/ui/*` 这类共享地基），归类 (B)：几何计算虽不绑定业务数据，但落点不在 `shell/` 也不在共享地基，仍需拷贝进本模块裁剪                                                                                                                                                             |
| `@/utils/navigate-to-agent`（`navigateToAgent`/`resolveNavigateToAgent`）                                                                                              | 点击联动导航                                                                                                                                                                                                                                                                                   | `model/conversation-tree-store.ts` 的 `activateNode` + `focusedRootId`/`openRightPanel()`（§3.5/§3.6）                                                                   | **不是重写同一实现**——旧函数导航到的是旧 `workspace-tabs` 体系，新壳根本没有这个体系；新模块是按新壳当前真实具备的能力（`focusedRootId` 自持 + `shellModel.openRight()`）重新设计的等价**行为**，不是代码搬运                                                                                                                                                                                                                     |
| `use-conversation-row-actions.ts` 的 `agent.runtimeInfo?.sessionId ?? agent.persistence?.sessionId ?? agentId`（**新增，回应闸 2 评审 ③#5**）                          | 复制会话 ID = provider 原生 session id，无则回退 agent id                                                                                                                                                                                                                                      | `ConversationTreeAgent.sessionId`（§3.1，`data` 层解析同一 fallback 链）                                                                                                 | 等价重写——补上这两个字段，"复制会话 ID"不再静默降级为永远复制 `agentId`                                                                                                                                                                                                                                                                                                                                                           |
| `@/components/sidebar/host-switcher-pill.tsx` + `host-switcher-model.ts`                                                                                               | 主机切换器 UI + 色调派生                                                                                                                                                                                                                                                                       | `shell/host-switcher/components/host-switcher.tsx` + `model/connection-tone.ts`                                                                                          | UI 全新重写；`connection-tone.ts` 的纯派生逻辑等价重写（旧版本身已是 24 行纯函数，逻辑照搬）                                                                                                                                                                                                                                                                                                                                      |
| `@/workspace/desktop-open-targets.ts`（`hasDesktopOpenTargetsBridge`/`listDesktopOpenTargets`/`openDesktopTarget`，**新增，回应闸 2 评审 ②F2——上一版完整遗漏此依赖**） | "在 Finder 中显示"的真实实现：先 `listTargets()` 列出全部桌面可用目标、找 `kind==="file-manager"` 的那一个、取其 `id` 去 `openTarget`——**跨平台正确**（`packages/desktop/src/features/editor-targets.ts` 确认 `"finder"` 仅注册于 `darwin`，Windows 是 `"explorer"`，其余是 `"file-manager"`） | `model/reveal-target.ts`（新增小模块）：等价重写同一条 list→找 kind→用 id 的解析，直连 Electron 预加载全局（不经 `@/desktop/host.ts`，同下一行"在新窗口打开"的绕过方式） | **订正**：上一版把"在 Finder 中显示"与"在新窗口打开"一并归为"直连 `window.paseoDesktop.*`"，照搬 file-tree/right-panel 硬编码 `editorId:"finder"` 的先例——但那两个先例本身就是**已知只在 macOS 生效**的简化，本模块若第三次照搬，会在非 macOS 桌面构建上把一个**当前正确**（旧 `desktop-open-targets.ts` 的 list→找 kind 方式）的跨平台行为换成一个**已知失效**的模式。本模块不重复这个简化，等价重写旧的 list→找 kind→用 id 逻辑 |
| `@/desktop/host.ts` 的 `getDesktopHost()` 包装层                                                                                                                       | 在新窗口打开（**仅此一项，不再与 Finder 显示合并描述**）                                                                                                                                                                                                                                       | 直连 Electron 预加载全局（`window.paseoDesktop.*`），**绕过 `@/desktop/host.ts` 这层包装**                                                                               | 不重写包装层本身——"在新窗口打开"本身不需要 list→找 target 这一步（不是"哪个文件管理器"这类选择题），直连预加载全局的 window 能力即可，不新建包装、也不引旧包装（§4.A）                                                                                                                                                                                                                                                            |

**旧依赖澄清（避免过度声明）**：⌘K 现状搜索经核实（读 `use-command-center.ts:30-36` 的 `isMatch`）**只按标题 + 工作目录子串匹配，不含消息内容**——requirement §2.F/§8④原文"标题+消息内容+目录"与现状代码有出入。这不改变本需求的接入决策（仍是"接现有 ⌘K、不重造"，§4.C），只是本文档核实后如实记录，供后续需求校正参考，不在本轮回改 requirement.md。

### 4.A 允许直接 import 的共享地基 / 包

- **传输层包 `@getpaseo/client`**：agent 列表/订阅、project 与 workspace 的 rename/remove/setTitle 方法——`data/conversation-tree-data.ts` 直连。
- **协议包 `@getpaseo/protocol`**：`AgentLifecycleStatus`、`AgentSnapshotPayload` 等类型、`PARENT_AGENT_ID_LABEL` 常量——`model/`、`data/` 直连。
- **`@/constants/platform`**：`getIsElectron()`/`isWeb`——菜单启用判定、预加载桥调用点门控。
- **`@/components/ui/*`**：`context-menu.tsx`（三套菜单浮层，不新造 Portal/Modal）。
- **Electron 预加载全局 `window.paseoDesktop.*`**（非 `@/desktop/host.ts` 包装层，见 §4.2）：在新窗口打开直连；在 Finder 中显示经 `model/reveal-target.ts`（等价重写 `desktop-open-targets.ts` 的 list→找 kind→用 id，见 §4.2 订正行）间接直连，同样不经 `@/desktop/host.ts`。
- **`expo-clipboard`**：复制会话 ID / 复制路径。
- **`expo-router`**：`router.navigate`——新对话、创建工作树两个有具体路由的调用点（§3.6）；搜索**不**走路由，是宿主注入点（§4.C）。
- **`@/utils/confirm-dialog`**：移除项目的破坏性二次确认（对位 file-tree `confirmDestructive` 先例，组合根层读取）。
- **`@/runtime/host-runtime`**：`useHosts`/`useHostRuntimeConnectionStatus`/`useHostMutations`/`getHostRuntimeStore().runProbeCycleNow(serverId)`（**新增，回应闸 2 评审 ③#7**——离线主机重连唯一调用点，见 §3.10）——**已有 shell/ 精度**（`file-tree-region.tsx`/`right-panel-region.tsx` 已直接 import），本模块的 `host-switcher/` 与 `left-region.tsx` 同样直连，不算新开的口子。
- **`shell/` 自有**：`ShellModel.openRight()`（对话树触发展开右栏）；壳几何/可见性沿用不改。

### 4.C 唯一接缝 = 零；宿主注入点 = 两处（区别于接缝，另立一类）

**本模块 (C) 类接缝为零**，原因：file-tree 需要 (C) 类接缝，是因为它要把内容**塞进已有的旧业务模块**（老 composer 草稿、老右栏 tab 系统）——那是"调一个函数就能表达"的耦合，故用 `*-bridge.ts`+`*-bridge.wiring.ts` 收口。本模块没有这类需要：写路径全部落在共享包 RPC 或纯前端持久化（§3.4），点击联动落在树自持状态 + shell 自有能力（§3.5），不触碰任何旧业务模块的内部状态或 API。

**但有两处需要"挂起旧 App 的整棵 React 组件树"，这不是函数调用能表达的接缝，另立一类**：

| 交互                    | 现状真实实现                                                                                                                                    | 为什么不能用 bridge 模式                                                                                                                                                                        | 本模块的做法                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 点顶部"搜索"            | 全局 ⌘K（`components/command-center.tsx`，由 `keyboard-shortcuts-store.ts` 的 `commandCenterOpen` 布尔驱动，挂载于 `app/_layout.tsx` 根层）     | `*-bridge.ts` 的纯工厂只能返回一个"调用即产生某个副作用"的函数；打开 ⌘K 需要的是**让已挂载在别处的一整棵弹层组件树可见**，其触发机制是"翻一个全局态"，但那个态活在被禁止 import 的 `@/stores/*` | `tree-toolbar.tsx` 调 `store.openSearch()` → store 内部调 `deps.openSearch()`（与置顶/重命名等其它动作同一形状的 Deps 字段，不是绕过 store 的组件 prop，§3.7 已订正 ①I1）；`deps.openSearch` 属于只能由 `left-region.tsx`（豁免硬隔离的挂载点）构造的 `ConversationTreeHostDeps`，绑定为 `useKeyboardShortcutsStore.getState().setCommandCenterOpen(true)` |
| 点主机切换器"添加主机…" | 三个模态组件（`AddHostMethodModal`/`AddHostModal`/`PairLinkModal`），以 `host-switcher-pill.tsx` 内的**局部** `useState` 条件渲染（并非全局态） | 同上，且更进一步——连"翻一个全局态"都不成立，触发方式本身就是"渲染一段 JSX"，只有一个持有 `useState` 的 React 组件能做到                                                                         | `shell/host-switcher/components/host-switcher.tsx` 只暴露 `onAddHost: () => void` prop；**在 `left-region.tsx` 绑定**——该文件持有自己的 `useState<boolean>`（是否显示添加主机流程）并按需 import 三个旧模态组件条件渲染                                                                                                                                    |

**这个豁免的合法性**：与 file-tree §9 收尾原话完全同一先例——"壳层挂载点…属新壳 `shell/`（非 `shell/file-tree/`），可自由 import 老 `runtime`/`session-store` 做 reactive 订阅，不在硬隔离范围内、不算接缝"。`left-region.tsx` 与 `file-tree-region.tsx`/`right-panel-region.tsx` 是**同级的壳层挂载点**，适用同一条豁免；本条只是把豁免的适用对象从"读老 store 做订阅"扩展到"按需渲染老组件"，性质相同（都是"挂载点承接旧世界的具体形态，内部模块保持零 import"），不是新开一个例外类别。**验收判据**：对 `shell/conversation-tree/**` 与 `shell/host-switcher/**` 各跑一次依赖检查（如 `rg 'from "@/(stores|components|workspace|screens|conversation-tree)/' shell/conversation-tree shell/host-switcher`），**应零命中**；`shell/components/left-region.tsx` 不受此约束。

### 禁止重造清单

- **不新建搜索 UI**：⌘K 是既有独立能力，本需求只接入口（宿主注入点），不做"只按名称过滤"的轻量搜索框——requirement §8④已裁定"维持现状，不新造"。
- **不新建新建对话/创建工作树的流程内部**：两者都是路由导航，落地页面是既有能力。
- **不重造置顶态的后端持久化**：置顶本就是纯前端概念（现状已验证），不额外发明服务端存储。
- **不重造右侧栏 tab 框架**：`openRightPanel` 止步于展开面板，不逾越 right-sidebar 模块的边界去构造 `OpenTabRequest`。
- **不重造状态点底层数据**：`AgentLifecycleStatus`/`requiresAttention` 直接来自协议，只新写一个五行映射表（§3.2）。

---

## 5. 协议 / 平台

**不动协议**：requirement §5 明文"不涉及协议/RPC/能力标志点名"，本文档核实后确认成立——本模块消费的 RPC（agent 快照/订阅、workspace 快照、`project.rename`/`project.remove`/`workspace.title.set`）均为已存在、无 `server_info.features.*` 门控的既有能力（读源码未发现任何一处旧调用点带能力检测），故**不新增能力标志**，不需要 `COMPAT()` 注释。若目标主机确实缺失某项能力（理论上限于极旧主机），走需求 §5 已声明的既有"升级主机"通用提示，本模块不新增专属的能力探测分支。

**平台门**：桌面 only（与 shell/file-tree/right-panel 一致）。本模块**没有**需要 `.web`/`.native`/`.electron` 文件级拆分的场景——菜单里的少数 Electron 专属项（在 Finder 中显示、在新窗口打开、创建工作树的桌面判定）用小范围 `getIsElectron()` 内联判定即可（对位 file-tree 对"reveal-in-finder"的处理方式，未大到需要拆文件）。移动/紧凑态沿用壳既定的 deferred 安排，本模块不新增任何紧凑态分支。

---

## 6. 测试策略

**必单测的纯函数**：

- `build-tree.ts`：分组（置顶前项目/游离对话分桶）、递归嵌套（≥5 层验证不设上限）、`subagentCount` = 全部后代非直接子节点、`createdAt` 升序排序、**过滤条件同时覆盖 `archivedAt` 与 `status==="closed"`**（对齐 §4.1 的行为升级）、空项目仍产出节点、`workspaceDetails` 命中时标题覆盖 `agent.title`（仅 `conversation` 节点，`subagent` 节点不受影响）、**防环护栏**（构造一条自环/双向指向的 `parentAgentId` 数据，断言不死循环/不栈溢出而是安全截断，回应闸 2 评审 ③#8）。
- `flatten-rows.ts`：`canExpand` 的项目态（零子节点仍可展开显示"还没有对话"）与对话/subagent 态（零子节点即不可展开）区分；深度封顶只影响 `canExpand` 不影响 `subagentCount`。
- `partition-pinned.ts`：置顶项目整棵进入置顶组；置顶对话从项目/游离两种来源都能正确提升；未置顶对象的对象引用不变（渲染稳定性）。
- `group-projects.ts`：按 `projectId` 分组 + 空项目并入。
- `apply-agent-update.ts`（**新增，回应闸 2 评审 ①I2**）：upsert/remove 对 `agents`/`projects` 的增量正确性；upsert 的 `projectKey` 字段维护/新增 `store.projects`（回应③#1）；`unreachableIds` 的可达性判定——**精确命中**（被移除 id 本身是 editing/activeNodeId/focusedRootId）与**祖先命中**（被移除的是祖先，某存活后代因此不可达，回应③#6）两类场景都覆盖。
- `apply-workspace-update.ts`（**新增，回应闸 2 评审 ③#1/#2**）：单条 `WorkspaceDescriptorPayload` 正确折进 `workspaceDetails`；初始快照批量折入与单条增量走同一条函数、结果一致。
- `status-dot.ts`：五态映射全分支，**判定顺序逐支对齐 `deriveAgentStateBucket`**（`pendingPermissionCount`/`attentionReason:"permission"` 优先 → `status==="error"`/`attentionReason:"error"` 次优先 → `running` → 剩余 `requiresAttention`（即 `attentionReason:"finished"`）→ `initializing` → `idle`，回应闸 2 评审 ③#4，**必须覆盖 `status==="error"` 且 `requiresAttention===true` 同时为真的组合，断言结果是 `"error"` 不是 `"needsAttention"`**）。
- `project-menu.ts`/`conversation-menu.ts`：六项/十一项菜单的可见性与启用条件全分支（对照 §4.2 已核实的现状条件表——`canReveal`/`canCreateWorktree`/`hasWorkspace`/`canOpenInNewWindow` 各自的真假组合）。
- `pin-state.ts`：`togglePin`/`isPinned` 的项目与对话（`kind:"workspace"`）两种 target 各自转移正确。
- `rename-state.ts`：空名/合法名的校验分支，`Editing` 判别联合的构造与清空。
- `model/reveal-target.ts`（**新增，回应闸 2 评审 ②F2**）：list→找 `kind==="file-manager"`→取其 `id` 的解析逻辑，覆盖"未找到匹配 target"（返回 null，调用方不发起 reveal）分支。

**必测的模型逻辑（不渲染即测，注入 fake `ConversationTreeStoreDeps`）**：

- `ConversationTreeStore`：`agent_update`/`workspace_update` 增量正确反映到 `tree` computed（含对话标题因 `workspace_update` 实时刷新，回应③P0#1）；**§3.8 竞态清理规则按可达性而非精确 id**（回应③#6，用例见上）；`activateNode` 对 `conversation`/`subagent` 两种 kind 的分支行为（`focusedRootId` 在 subagent 分支保持不变、`openRightPanel` 恰好且仅在 subagent 分支被调用一次、**conversation 分支不调用 `deps.navigate`**，回应①B3）；重命名进行中收到同节点的 `agent_update`/`workspace_update` 不清空 `editing.draftName`；`dispose()` 调用后 `data.onAgentUpdate`/`onWorkspaceUpdate` 的 unsubscribe 各被调用一次（回应①B2，断言 dispose 后再触发一次假事件不会导致 store 状态变化或抛错）；写路径 RPC reject 时 `deps.reportError` 被调用、`editing`/项目行状态保留不回滚（回应①I3）。
- `HostSwitcher`：`connection-tone.ts` 三态映射；`host-switcher.tsx` 的点击路由分支——离线态点击调 `onReconnect` 不调 `onSwitchHost`，在线态相反（组件测试，非"零渲染"纯函数测，因为路由判定内联在组件里，见 §3.10）；下拉展开态是组件本地态，不在此列（判据"selector 不读它"）。

**端到端验证点（对应 requirement §6 验收标准；编号按 2026-07-23 信息架构修正后的 54 条版逐条重排——原 41 条版编号已整体错位，本段是唯一权威对照，不留旧编号）**：树结构与嵌套（1-6）、五态语义 · 视觉分道 · 两行结构 · 标签行 · 最近说话时间 · 项目行分支/diff · closed 过滤（7-18、20——其中 14/15 已按 §8.1/§8.2 结论由「暂不作为强制」转为**强制**；19 是文档披露项，不入端到端）、行交互两档灰阶与内联重命名（21、24，另含 hover 工作区卡片 22 与行尾浮出操作 23）、右键菜单两套（26-29）、新对话与搜索入口（30-33，含搜索选中后树滚动定位，回应③#10）、点击联动的树侧半场（34-36，中区/右栏承接内容由各自模块独立验收）、主机切换器完整闭环含离线重连（37-42，回应①B1）、全态（43-47）、写路径失败的用户可见反馈（回应①I3，非验收标准逐条点名但属"功能真生效"的应有之义）。不靠截图/文本 grep 判过，走 [[verify]] 端到端真生效。

---

## 7. 风险与取舍

**评审最可能挑战①：从零重建 agent 数据订阅层，是否是给一个"UI 内容填充"需求背了一个过大的新代码面？** 取舍：这与 file-tree 当初的取舍完全同构（§4.2 已引用其 §7"新 store vs 复用旧 explorer 态"的结论）——CLAUDE.md 的零旧依赖硬规则不留第二条路；新增的表面是**有界的**——`ConversationTreeRpcClient` 只是对已经存在、稳定的共享包能力（`fetchAgents`/`agent_update`/`fetchWorkspaces`/三个 RPC 方法）做一层结构类型包装，不是重新发明协议或重写 daemon 端逻辑，形状上就是把 `FileTreeStore.dirCache` 的模式换一套数据种类而已。

**评审最可能挑战②：subagent 点击只展开右栏、不开出真正的对话内容，是否发起侧价值不足？** 取舍：读代码已确认 `shell/right-panel/model/tab-content.ts` 的 `OpenTabRequest.kind` 现在是单一字面量 `"file"`、`TAB_KIND_POLICY.conversation.enabled === false`——**任何模块**，无论是新树还是假设中的其它调用方，本轮都无法真正开出"对话"类型 tab。这不是本模块保守，是右侧栏模块自己的既有边界；requirement §2.G/验收标准 35 明确把这条线划在"发起侧完整可验、承接侧不在本需求验收范围"，本设计精确匹配这条线，没有多做也没有少做。

**评审最可能挑战③：⌘K/添加主机的宿主注入点，一个走 Deps 字段一个走组件 prop，是否规则不一致？** 取舍：判据是"能不能用一个纯函数调用表达"——重命名/置顶/移除/展开右栏都能（一次 RPC 或一次方法调用），故走 §3.7 的 `ConversationTreeStoreDeps` 注入，`openSearch` 也在此列（§3.7 已订正——不再是脱离 store 的组件 prop）；**唯独**"挂起一整棵旧 React 组件树（弹层/全局面板）"这件事，本质是渲染而非调用，只有持有 `useState`/能 import 组件的 React 组件能做到——`*-bridge.ts` 是纯 TS 工厂文件，天然做不到这件事，这是"添加主机"停留在组件 prop（而非 Deps 字段）这一层的唯一原因（`host-switcher.tsx` 没有 store 可注入，只有组件本身）。"搜索"虽然最终也要挂起旧组件树，但它的**触发**是"翻一个全局态"（`setCommandCenterOpen(true)`），这一步能被 `ConversationTreeHostDeps` 这个函数值封装、再注入 store；"添加主机"的触发是"渲染一段 JSX"，函数值封装不了渲染，只能留在组件层。两者机制不同，处理方式因此不同，是诚实反映各自约束，不是规则打折。

**大树虚拟化**：不新开问题——`shell/file-tree/components/file-tree-panel.tsx` 已经用 `FlatList`（RN 虚拟化列表）承载潜在的大量节点，本模块 `conversation-tree-panel.tsx` 直接沿用同一选型（稳定 `id` 作 `key`，不用数组下标），性能风险已被 file-tree 蹚过一次，不是本需求首次面对。

**`build-tree.ts` 的防环护栏是结构性风险，不是旧代码遗留的次要瑕疵（回应闸 2 评审 ③#8）**：旧 `select.ts` 的递归建树本就没有环检测，本模块等价重写会天然继承同一形状——但 requirement §2.A/验收标准 2 明文"递归、不设人为层数上限"，这条产品要求排除了"设一个小 `maxDepth` 兜底"这种规避方式，风险因此是结构性、长期存在的：一旦服务端因并发写等原因产生 `parentAgentId` 环路或异常深链路，客户端建树会在**建树阶段**（早于 `flatten-rows.ts` 的展示层深度封顶生效）无限递归或深栈溢出，而树是需求 §1 原话"唯一导航起点"——建树挂掉等于整个左栏、进而可能整个页面卡死，且没有降级路径。**取舍**：`build-tree.ts` 内部维护一个访问集合（`Set<agentId>`）防环，命中环路即截断该分支并停止递归（不是静默吞掉，正常情形下这个分支永远不触发，属于纯防御性护栏，不影响任何正常数据形状的行为，因此不违反"不为不存在的场景买单"的 YAGNI 精神——环路是数据完整性问题而非产品特性）。

**高频 `agent_update` 下的重算量级（回应闸 2 评审 ③#9）**：`tree`/`visibleRows` 等 computed 依赖的是 `store.agents`（一个 MobX observable Map），任何一条 `agent_update`（哪怕只改了一个叶子 subagent 的状态点）都会让这串 computed 因 Map 内容变化而整体失效重算——`build-tree.ts`/`flatten-rows.ts` 都是"整表重扫"的纯函数，没有增量 diff，这与旧 `select.ts` 同构，不是本架构新引入的问题。**量级判断**：单次重算是对现存 agent/project 全集做一趟 O(n) 过滤 + 建 Map + 递归建树 + 排序，需求 §1 描述的产品场景（用户同时盯着"几个到几十个" agent，不是几千个）下是几百级别的操作，现代设备上单次几毫秒量级，可忽略，暂不需要节流/去抖。若实测（helm-developer 用真实数据量跑一次简单 profiling）发现高频推送下有可感知卡顿，再按需给 `agent_update` 的 handler 加一层节流（如 100ms 合并窗口），本轮不预先引入这层复杂度（YAGNI）。

**主机切换重载边界**：切换主机触发 `ConversationTreeStore` 的完整重建（`[serverId]` 变化 → §3.3 的 `useEffect` 依赖数组重建，先 `dispose()` 旧实例再构造新实例）——`HostSwitcher` 本身**没有数据要重建**（§0/§1.2 已订正它不持状态，`useHosts`/`useHostRuntimeConnectionStatus` 是全局响应式 hook，不随 `serverId` 变化重新构造）。这与 requirement §2.H"整个工作区经过切换中过场后重载"的要求天然一致——过场期间的骨架态由 §3.9 的 `panelState:"loading"` 承接；在线主机点击不额外插入独立的"连接中"动画（§3.10 已裁定），不需要额外的"切换中"状态机。

**hover 工作区卡片的范围收缩**：`workspace-hover-card.tsx` 的核心四要素（标题/分支/目录/最近变更）现已有明确落点——`store.workspaceDetails` Map（§3.1/§3.3，由初始快照 + `workspace_update` 增量共同维护），不再是上一版含糊的"数据取自本模块已拉取的 workspace 快照"（读者当时确实拿这句话追问不出具体字段，闸 2 评审 ③#2 已指出）。**仍然诚实收窄的两处**：① diffstat/PR/CI 摘要的数据源（很可能与 right-sidebar 的"directory-backed surface"共享同一套 git/PR 状态订阅）**本轮未完整核实**；② `@/utils/sidebar-agent-state` 的 reconcile 规则（"最近变更时间"在 workspace 已完成但根 agent 仍在收尾等场景下的时间点修正）**本轮不等价重写**，`workspaceDetails.lastChangeAt` 是裸时间戳（§4.2 已登记）。两处都不是本文档遗漏——是诚实标注需要 helm-developer 在实现前补一次小范围调查/或按需后补的点：若数据源/reconcile 改造成本超出预期，允许诚实缩小交付范围、把摘要与 reconcile 标 deferred，**不允许**为了凑齐这两处而静默 import 旧 `workspace-hover-card.tsx`、`use-sidebar-workspaces-list.ts` 或 `sidebar-agent-state.ts`。

**⌘K 现状范围的文本澄清**：requirement 原文描述现状搜索覆盖"标题+消息内容+目录"，读代码核实（`use-command-center.ts:30-36`）现状只匹配标题与工作目录，不含消息内容——不影响本架构的接入决策（§4.C 结论不变：接入口、不重造），仅记录供 PM 侧后续校正文本用词。

**账本自查**：对 `shell/conversation-tree/**`、`shell/host-switcher/**` 两目录，除 §4.A 允许直连清单与 `left-region.tsx`（挂载点豁免）外，不应出现指向 `packages/app/src/`（`shell/` 以外）的 import；(C) 类接缝清单为空，无需登记切换点（若未来确有需要新增，须先在本节登记，否则视为违反硬隔离）。**2026-07-23 增补**：§8.2 为 CLI 类型标签登记了五个纯 SVG 图标组件（`@/components/icons/{claude,codex,copilot,opencode,pi}-icon`）为 §4.A 同类直连，账本自查的 rg 模式需将 `@/components/icons/` 列入白名单；旧 `@/components/provider-icons.ts` 聚合层仍属禁引。

---

## 8. 信息架构三轮修正 · 架构结论（2026-07-23 · 闸 2 增补材料）

> 对应 requirement 2026-07-23「信息架构三轮修正」（§2·A/§2·B）与 §8 开放问题 **7 / 8 / 11 / 12**，另含总监指派的混合行高评估。以下每条证据均为本轮**重新读源码核实**，标注到文件行号；不转述任何前轮或产品侧的初步判断。P2 已过闸正文不重排，受影响原节（§1.1/§3.1/§3.2/§6/§7）已就地落指针，shape 与派生的演进以本节为准。
>
> **四问结论先行**：
>
> | requirement §8           | 结论                                            | 一句话依据                                                                                                          |
> | ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
> | 7 最近说话时间（阻塞性） | **能接，本轮做**                                | 协议 `AgentSnapshotPayload.updatedAt` 必填字段、已在本模块既有 `agent_update` 订阅通道内，decode 补一行即得（§8.1） |
> | 8 CLI 类型标签           | **能接，本轮做**                                | `AgentSnapshotPayload.provider` 必填字段；label 走协议包内置映射 + 原样 id 兜底，零新增订阅（§8.2）                 |
> | 11 分支/diff 行内常显    | **无性能代价，不需要节流/缓存/可视区裁剪**      | 计算全在 daemon（watcher+debounce），订阅与重算全是 §3.3 既有形状，常显只新增可视行内两个文本节点（§8.3）           |
> | 12 项目行分支取哪个目录  | **按「项目主目录自身分支」定稿，UI 稿假设成立** | `workspaceKind === "local_checkout"` 可精确识别主目录（server 判定源已核实）；主目录缺失 → 「暂无分支」兜底（§8.4） |

### 8.1 问题 7：最近说话时间 —— 用 `updatedAt`，本轮接入，阻塞解除

**协议证据（`packages/protocol/src/messages.ts:675` `AgentSnapshotPayloadSchema`，两个候选字段均为必填、无新旧版本兼容问题）**：

- `updatedAt: z.string()`（:685）。server 侧语义已读 `packages/server/src/server/agent/agent-manager.ts` 核实：私有 `touchUpdatedAt`（:716）在**每一个 live 流事件**入口被调用（:3009-3011，注释原话 "Only update timestamp for live events, not history replay"——历史回放不污染时间戳），另覆盖全部生命周期转移、attention 变化、模式/配置变更等 20+ 调用点。语义 = **「该对话最近一次活动」，双向覆盖用户消息与 agent 输出**。
- `lastUserMessageAt: z.string().nullable()`（:686）。server 侧仅在 timeline `user_message` 到达时写入（agent-manager.ts:3231-3234）。语义 = **仅用户侧最后一次发言**，agent 连续输出一小时该字段纹丝不动。

**裁定：用 `updatedAt`，不用 `lastUserMessageAt`。** requirement §2·B 的措辞是「最近一次消息**往来**」——双向语义。`lastUserMessageAt` 在长任务场景（agent 跑数小时、用户零介入）会显示与同行「运行中」标签直接矛盾的陈旧时间，是字面错误；`updatedAt` 额外涵盖的少量非消息活动（改名、切模式）同属「这个对话有动静」的用户直觉，对「3 分钟前」粒度的展示无语义损害。

**新鲜度边界（诚实声明，非风险遮掩）**：`updatedAt` 到达客户端靠 `agent_update` 推送（本模块 §3.3 既有订阅）；纯 timeline 输出走 `agent_stream` 通道、不必然伴随一条 `agent_update`——**运行中**的行，树上时间戳可能滞后于最后一条真实输出。这不构成产品问题：运行中的行第二行同时挂「运行中」标签，用户对"正在说话"的判断不靠时间戳；而真正依赖时间戳的两个读数——「空闲了多久」「等你回复多久了」——所处的状态转移（→idle、→needsAttention）必然伴随 `emitState` → `agent_update`，时间戳在这些时点是新鲜的。**明确不做**：不为把运行中行的时间戳做成实时而接入 `agent_stream` 全量流——为一个次要读数背一路高频通道，复杂度不成比例。

**接入边界**：

- `data/conversation-tree-data.ts` `decodeConversationTreeAgent`：补解 `updatedAt: snapshot.updatedAt`（一行，必填字段无 fallback 分支）。
- `model/types.ts`：`ConversationTreeAgent` 与 `ConversationTreeConversationNode` 各加 `readonly updatedAt: string`（ISO 串——**模型层只存时间戳，不存格式化文案**）。subagent 节点不带（需求只给对话(根)行第一行行尾）。
- `model/build-tree.ts`：conversation 节点透传。
- **相对时间格式化是渲染层关注点**：`formatRelative(iso: string, nowMs: number): string` 纯函数（分档可单测）；`nowMs` 由组件层**一个共享的分钟级 tick** 提供（面板级单一 interval，**严禁每行一个 timer**）。`now` 不进 store、不进 `build-tree` 输入——进了就等于每分钟整树重算，拿一趟 O(n) 建树换一个文案刷新，层放错了。
- **顺带收敛既有重复（重构不打补丁）**：`components/workspace-hover-card.tsx` 的私有 `formatLastChange`（:374-394）与本函数同一语义，收敛为 `model/relative-time.ts` 单一纯函数，卡片改用之、删私有副本。

**requirement 联动**：验收标准 **15** 由「暂不作为强制验收项」转为**强制**；对话(根)行第一行行尾不留白，产品无需另定替代内容。

### 8.2 问题 8：CLI 类型标签 —— `provider` 字段本轮接入，label 解析零新增订阅

**协议证据**：`AgentSnapshotPayloadSchema.provider`（messages.ts:677）**必填**；`AgentProviderSchema = z.string()`（`provider-manifest.ts:260`）是**开放字符串**——内置 id（claude/codex/copilot/opencode/pi/omp，`AGENT_PROVIDER_DEFINITIONS`，provider-manifest.ts:165-223，每条带 `label`）之外还存在自定义 provider（`provider-config.ts:132-136` 强制自定义 provider 声明自己的 label，但该 label 活在 daemon 配置里）。requirement §8 开放问题 8 的核实结论**属实**：`decodeConversationTreeAgent` 现未解此字段，协议层数据完备，补一行即得。

**label 解析两条路，裁定走 (a)**：

- **(a) 协议包静态映射 + 原样 id 兜底（采用）**：内置 6 个 id → label 直接查 `AGENT_PROVIDER_DEFINITIONS`（§4.A 共享包直连）；查不到（自定义 provider）**显示原始 id**。零新 RPC、零新订阅、零新状态。注意**不得**使用同文件的 `getAgentProviderDefinition`——它对未知 id 直接 `throw`（provider-manifest.ts:252），展示路径必须是 lookup-with-fallback。先例对齐：旧 app `resolveProviderLabel`（`utils/provider-definitions.ts:36-41`）正是同一 `?? provider` 兜底形状。
- **(b) `DaemonClient.getProvidersSnapshot()` + `providers_snapshot_update` 订阅（否决）**：能解析出自定义 provider 的用户自定义 label，但代价是给 store 再开一路数据订阅 + 一块快照状态，只服务「自定义 provider 标签从 id 变成好听的名字」这一处措辞升级；自定义 provider 的 id 本就是用户自己起的（custom-providers 配置键），原样展示可读。**将来若确要精确 label，升级点收敛在 `model/provider-label.ts` 一个纯函数的输入端，渲染不动。**

**图标（ui.html v3 注解要求内置 provider 标签带图标）**：图标组件 `@/components/icons/{claude,codex,copilot,opencode,pi}-icon` 是**纯 SVG 视觉资产**（零业务态、零旧 store 触碰），按 §4.A「设计系统原语」同一精神**登记直连**（登记已同步进上方「账本自查」段；拷贝 SVG path 进本模块会造成图标资产双源、日后改版两处不同步——比一次跨目录 import 更坏的重复）。**不得 import** 旧 `@/components/provider-icons.ts` 聚合层——它拖着 ACP catalog、SvgXml 动态构造、Bot 兜底等一整套业务策略，属 (B) 类禁引；树内自建 `model/provider-label.ts` 查表纯函数：`resolveProviderBadge(providerId): { label: string; icon: ProviderIconKey | null }`——内置 6 个命中 label（图标 5 个，omp 无树内图标按 null 处理），未知 id 落 `{ label: providerId, icon: null }`，无图标时标签只渲染文字。

**shape**：conversation 节点加 `readonly providerId: string`（查表输入）；label/icon 由查表纯函数派生，不冗余进节点。

**requirement 联动**：验收标准 **14** 转为**强制**；requirement §8 开放问题 8 预留的「先只显示状态标签、CLI 延后」备选方案**不需要启用**。

### 8.3 问题 11：分支/diff 行内常显 —— 无需新机制，三层成本逐层归零

**结论先行：不需要节流、不需要缓存、不需要仅可视区域计算——这三样各自对应的成本在现有架构里已不存在。** 逐层核实：

1. **计算层（git 命令）——零新增。** 分支/diffStat 全部由 daemon 计算：`packages/server/src/server/workspace-git-service.ts` 的文件系统 watcher（1s debounce，:43）+ working-tree watch 失效时的 5s fallback 刷新（:46）+ facts 复用 TTL 1s（:55）+ shell-out 最小间隔 2s 护栏（:50）。客户端从不发起 git 操作；**显示与否不改变 daemon 行为**——hover 卡片时代它也在算、在推，常显不会让 daemon 多跑一条命令。
2. **传输/状态层（订阅与重算）——零新增。** `workspace_update` 订阅是 §3.3 已为「重命名保鲜」建立的既有通道，`store.workspaceDetails` 已承接同一份 `gitRuntime.currentBranch`/`diffStat`（`apply-workspace-update.ts:9-21` 已折入）；常显不增加一条推送、不增加一次重算。每条 `workspace_update` 触发的整树 computed 重算量级已在 §7「高频 `agent_update` 下的重算量级」按同一形状论证（几百节点 O(n) 单趟，现代设备毫秒级），同一结论覆盖本路。
3. **渲染层——新增量 = 每个可视项目行两个 Text + 一个 GitBranch 图标。** FlatList 虚拟化（§7「大树虚拟化」）只渲染可视行，几十个项目也只有可视子集在画；没有任何按行的 timer/订阅/异步。分支/diff 是静态文本渲染，不参与 §8.1 的分钟级 tick。

**唯一的禁令（防实现走样）**：分支/diff 数据**一律经 `store.workspaceDetails` 单源读取**（project 节点字段由 `build-tree.ts` 派生，见 §8.4），禁止行组件自行发起任何拉取/订阅/轮询。**后手（与 §7 既有后手同一条，不新发明）**：若 helm-developer 实测高频 `workspace_update`（多 workspace 同时被 agent 写文件，最坏每 workspace 每 1-2s 一条）下有可感知卡顿，在 handler 上加 §7 已为 `agent_update` 预留的同一层 100ms 合并窗口，两路共用一个方案；本轮不预先引入（YAGNI，判据同 §7）。

### 8.4 问题 12：项目行「当前分支」= 项目主目录自身分支 —— 技术侧支持 UI 稿假设，附兜底口径

**数据可得性（已读源码）**：`WorkspaceDescriptorPayload.workspaceKind`（messages.ts:2865）枚举 `"directory" | "local_checkout" | "checkout" | "worktree"`；server 侧判定源 `workspace-registry-model.ts:162`：`checkout.mainRepoRoot ? "worktree" : "local_checkout"`——**「项目主目录」在既有数据里可精确识别**：该项目（`projectId === projectKey`）下 `workspaceKind === "local_checkout"`（或 legacy `"directory"`，非 git 目录场景）的 workspace 即主目录，取其 `gitRuntime.currentBranch` + `diffStat` 即为项目行第二行。

**裁定：按 UI 稿假设定稿——项目行第二行 = 主目录分支 + 主目录 diff；各工作树自己的分支由其对话行 hover 工作区卡片单独展示（现状已具备，§2·C）。** 备选「多个工作树时显示分支数量而非具体分支名」**否决**，理由：① worktree 分支已有 hover 卡片这个既有出口，项目行再聚合一遍是重复信息；② diff 统计无法"数量化"——若分支显数量、diff 显主目录，第二行两个信息取自不同口径，语义分裂；③ 聚合去重计数是纯新增逻辑，无当下收益。

**兜底口径（回答 requirement §8 开放问题 12 的两个追问，供产品回写 §2·B 收口）**：主目录不存在（项目仅剩 worktree、或空项目）→ 该行显示「暂无分支」，与「主目录存在但 `currentBranch` 为 null」共用同一兜底文案，**不新造第三种态**；多工作树分支不一致不做任何行内提示（上段已论证）。

**接入边界**：

- `model/types.ts`：`WorkspaceDetail` 加 `readonly projectId: string` + `readonly workspaceKind`（payload 同名枚举）；`ConversationTreeProjectNode` 加 `readonly branch: string | null` + `readonly diffStat: WorkspaceDiffStat | null`。
- `model/apply-workspace-update.ts`：折入两字段（两行改动）。
- `model/build-tree.ts`：建一次 `projectId → 主目录 WorkspaceDetail` 索引（O(n) 单趟，与既有 `projectKeyByWorkspaceId` 分桶同一循环风格），project 节点派生 `branch`/`diffStat`。**主目录选取是模型层策略**（判据「不渲染就能测」），渲染层零判定。
- 数据来路单源的顺带说明：`applyAgentUpdate` 经 `ProjectPlacementPayload` 增量新建的 project 条目不带 workspace 明细——主目录索引只依赖 `workspaceDetails`（单源 `workspace_update` + 初始快照），不依赖 project 条目的来路，两路增量不会分叉出两套"主目录"判定。

### 8.5 混合行高与虚拟化 —— 现有固定行高假设是字面已错的真实问题，前缀和查表解决

**现状实锤**：`components/conversation-tree-panel.tsx:21` `ITEM_HEIGHT = 30` + `getItemLayout`（:287-289）向 FlatList 报告**全列表等高 30px** 的偏移；`components/tree-row.tsx` styles `height: 30`（:444）。三种行高（subagent 单行 30 / 对话(根)两行 ≈48 / 项目两行 ≈48，精确值以 UI 定稿为准）落地后，等高假设**字面失效**——`scrollToIndex`（搜索定位与选中滚动的既有机制，§1.1）会按错误偏移滚动，FlatList 可视区估算错位造成滚动跳动。不是"可能有问题"，是必然出错。

**裁定：保留 `getItemLayout`，改为前缀和查表；不退化为动态测量。**

- `PanelItem` 的高度由 `kind`（section 头 / empty 提示 / row）+ row 的 `node.kind` **静态完全决定**，没有任何一行需要运行时测量——这正是 `getItemLayout` 的适用前提；放弃它转投动态测量 + `onScrollToIndexFailed` 的两段式滚动，是无谓的体验退化。
- `buildPanelItems`（已是 O(n)）同步产出 `offsets: number[]` 前缀和；`getItemLayout` 查表 O(1)。总成本一次 O(n) 加法，几百行量级可忽略。
- **高度单源**：新建 `components/row-metrics.ts` 承载每类 item 的高度常量与 `itemHeight(item): number` 纯函数，行样式与 `getItemLayout` **共用同一份**——"报告高度 ≠ 渲染高度"是这类 bug 的唯一来源，单源钉死。`ITEM_HEIGHT` 常量**删除**，不留旧值、不留兼容读法。
- `scrollToIndex` 的 `viewPosition: 0.5` 与 `onScrollToIndexFailed` 兜底保留（后者降级为护栏，不再是主路径）。

### 8.6 `statusDot` 更名为语义词 —— 视觉分道后的一次改对

对话(根)行改文字标签、subagent 行留圆点后，「五态语义」不再等于「点」——模型层继续叫 `statusDot`/`ConversationStatusDot`/`status-dot.ts` 就成了绑定过时视觉的错名。**裁定：模型层全量更名为语义词**——`model/run-status.ts`（改名自 `status-dot.ts`）、`ConversationRunStatus`（改名自 `ConversationStatusDot`）、节点字段 `runStatus`（改名自 `statusDot`）；§3.2 的五分支判定顺序**一字不动**。同文件内新增两个纯派生（与五态判定变化原因相同，不拆文件）：

- `deriveAttentionKind(input): "permission" | "reply" | null`——needsAttention 内部按 `pendingPermissionCount > 0 || attentionReason === "permission"` 二分（判据与 §3.2 首支同源，不另造条件）；
- `conversationStatusLabelText(runStatus, attentionKind): string`——产出验收标准 13 的全部文案（「运行中」「等待权限确认」「等待你的回复」「空闲」「出错」「初始化中…」），文案落模型层可单测。

**渲染分道**：subagent 行按 `runStatus` 渲染小号纯色实心点（呼吸动效规则不变）；对话(根)行按 `runStatus`（配色 + 标签内嵌小点的呼吸）+ label 文案渲染状态标签（视觉沿 ui.html `.stag` 图例与既有 StatusBadge 规范）。conversation 节点带 `runStatus` + `attentionKind` 两个语义字段，标签文案由纯函数在渲染前派生。**更名是全量替换：不留 `statusDot` 别名、不留兼容导出、既有测试随迁改名。**

### 8.7 改动面与测试补充（增量清单，§1.1/§6 原文不重排）

| 文件                                          | 边界级改动                                                                                                                                                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model/types.ts`                              | `ConversationTreeAgent` + `provider`/`updatedAt`；`WorkspaceDetail` + `projectId`/`workspaceKind`；conversation 节点 + `updatedAt`/`providerId`/`attentionKind`，`statusDot → runStatus` 更名；project 节点 + `branch`/`diffStat`；subagent 节点仅随更名 |
| `data/conversation-tree-data.ts`              | `decodeConversationTreeAgent` 补解 `provider`/`updatedAt` 两字段                                                                                                                                                                                         |
| `model/run-status.ts`（改名自 status-dot.ts） | 判定顺序不动；新增 `deriveAttentionKind`/`conversationStatusLabelText` 两纯函数（§8.6）                                                                                                                                                                  |
| `model/relative-time.ts`（新）                | `formatRelative` 纯函数；hover 卡片 `formatLastChange` 收敛于此（§8.1）                                                                                                                                                                                  |
| `model/provider-label.ts`（新）               | `resolveProviderBadge` 查表纯函数（§8.2）                                                                                                                                                                                                                |
| `model/build-tree.ts`                         | conversation 节点透传 `updatedAt`/`providerId`/`attentionKind`；project 主目录索引 + `branch`/`diffStat` 派生（§8.4）                                                                                                                                    |
| `model/apply-workspace-update.ts`             | 折入 `projectId`/`workspaceKind`（§8.4）                                                                                                                                                                                                                 |
| `components/tree-row.tsx`                     | conversation/project 分支改两行渲染（第一行标题+相对时间 / 标签行；第一行图标+标题 / 分支+diff）；subagent 分支不动；对话(根)分支去除残留的 `Bot` 图标与状态点渲染、去除 subagent 计数角标（requirement §2·B 拍板，角标仅 subagent 行保留）              |
| `components/row-metrics.ts`（新）             | 每类 item 高度常量 + `itemHeight` 纯函数，样式与 `getItemLayout` 单源（§8.5）                                                                                                                                                                            |
| `components/conversation-tree-panel.tsx`      | 删 `ITEM_HEIGHT`；`buildPanelItems` 同步产出 offsets 前缀和；`getItemLayout` 查表（§8.5）                                                                                                                                                                |
| `components/workspace-hover-card.tsx`         | 删私有 `formatLastChange`，改用 `model/relative-time.ts`（§8.1）                                                                                                                                                                                         |

**测试补充（并入 §6「必单测」清单执行）**：

- `run-status.ts`：既有五态全分支测试随更名迁移；`deriveAttentionKind` 二分（permission 触发 vs 其余 needsAttention）；`conversationStatusLabelText` 覆盖验收标准 13 的全部文案（含 closed → 「空闲」，经 §4.1 既有的 closed 保留显示路径）。
- `relative-time.ts`：刚刚 / 分钟 / 小时 / 天四档边界。
- `provider-label.ts`：内置 6 id 命中 label；未知 id 兜底 `{label: id, icon: null}`；无图标内置（omp）label 命中 + icon null。
- `build-tree.ts`：conversation 节点 `updatedAt`/`providerId` 透传；project 主目录选取四态——`local_checkout` 命中、legacy `directory` 命中、仅 worktree → branch/diff 均 null、空项目 → 均 null；主目录有 branch 无 diff / 有 branch 有 diff 两种派生。
- `apply-workspace-update.ts`：`projectId`/`workspaceKind` 正确折入。
- `row-metrics` + offsets：各 item 类型高度与前缀和一致、offsets 严格单调递增（`scrollToIndex` 定位正确性的模型侧验证）。
- 组件层：对话(根)行两行后 hover/选中/双击仍覆盖整行为单一交互单元（验收 11）；subagent 行不受两行化影响（验收 17）；共享分钟 tick 全面板仅存在一个 interval。

**requirement 验收标准状态更新（供 PM/测试同步）**：14、15 由「暂不作为强制」转为**强制**（§8.1/§8.2 结论落地）；18 的「当前分支」口径按 §8.4 裁定执行，其中「主目录缺失 → 暂无分支」兜底两句待产品回写 requirement §2·B 后，requirement §8 开放问题 12 可关闭。requirement §8 开放问题 9（角标去留）、10（subagent 视觉不统一）是产品/董事长取舍，不在本节裁定，本节改动面按当前拍板（角标去除、subagent 不动）执行。

### 8.8 2026-07-28 单行与悬浮信息修正（覆盖 §8.1–§8.7 的行内呈现）

本次只调整渲染与悬浮信息编排，不回退已经接入的 `updatedAt`、`providerId`、`branch`、`diffStat` 数据，也不修改协议、订阅或五态派生。项目、根对话、subagent 的静态高度统一为 36px，`row-metrics.ts` 仍是 FlatList 偏移与真实行高的单源；项目和根对话由两行改为单行后，前缀和自然退化为等步长，但不另造第二套布局算法。

- `tree-row.tsx`：项目行渲染文件夹图标 + 标题；根对话渲染纯标题；两类行都居中对齐。原行内 branch/diff、相对时间、provider 与状态标签删除；subagent 分支保持不变。面板级分钟 tick 随行内相对时间一并删除，hover 卡片在打开时按当前时间格式化，不再触发整面板每分钟刷新。根对话的审核中、报错、进行中等状态判断与视觉暂缓，底层 `runStatus` 数据继续保留供后续设计使用。
- `project-workspace.ts`：项目 hover 优先按 `projectId` 解析 `local_checkout` / legacy `directory`，避免误取第一个对话 worktree；没有主目录时回退到该项目任一已知 workspace，仅用于提供可检查的目录路径。
- `workspace-hover-card.tsx`：共享同一套 portal 定位、safe zone 与复制交互，内容改为判别联合。项目卡片显示标题、文件路径、Git 分支、Git diff；对话卡片显示对话名称、操作目录、最后一次使用时间、提供方。项目 branch/diff 使用项目节点已派生的主目录口径；对话时间使用节点 `updatedAt`，provider 继续经 `resolveProviderBadge` 解析。
- 测试：行渲染断言三类节点均为 36px，项目 / 根对话行内只有标题；补项目主目录优先解析测试；浏览器测试继续覆盖 hover safe-zone，真实页面验收覆盖两类卡片字段与定位。

### 8.9 2026-07-28 行内操作右键化修正（覆盖 §8.8 的 subagent 与尾部动作）

本次不改树模型、状态派生、workspace 数据源或右键浮层基础设施，只收敛行级渲染与操作入口。

- `tree-row.tsx`：subagent 与根对话统一为纯标题，删除状态点和后代数量渲染；删除项目尾部新建、对话 / subagent 尾部更多及其 hover disclosure。项目、根对话、subagent 仍共享整行点击、hover、双击与 `contextmenu` 分发；根对话和 subagent 点击继续写入选中状态。
- `row-hover-css.ts`：只保留行背景与分组标题动作的 hover CSS，删除尾部动作、角标让位和状态点呼吸规则。
- `project-menu.ts` / `tree-context-menu.tsx`：项目菜单增加 `new-conversation`。有 workspace 时直接按项目目录发起新对话；workspace 不可解析时退回项目选择流程。对话与 subagent 继续使用原菜单，不新增第三套菜单。
- `workspace-hover-card.tsx` 的内容合同与触发范围不变：项目显示标题 / 文件路径 / Git 分支 / Git diff，根对话显示名称 / 操作目录 / 最后一次使用时间 / 提供方；subagent 本轮只有行 hover，不伪造信息卡字段。
- 测试：模型测试断言项目菜单包含 `new-conversation`；浏览器组件测试断言三类行都无状态点、数量与尾部动作，根对话 / subagent 点击产生选中态，项目 / subagent 的 `contextmenu` 都分发正确目标。

### 8.10 2026-07-28 subagent 信息卡修正

subagent hover 卡沿用根对话的内容组件和定位 / safe-zone 交互，但元数据必须归属 subagent 自身。树模型为 subagent 保留自己的 `updatedAt` 与 `providerId`，并额外携带只供目录展示解析的 `contextWorkspaceId`。

- `build-tree.ts`：根对话以自己的 `workspaceId` 建立目录上下文；递归构建时，subagent 有独立 workspace 则覆盖上下文，否则继承父级上下文。subagent 自己的 `workspaceId` 保持原值，不用继承值覆盖。
- `tree-row.tsx`：项目仍解析项目卡；根对话按实际 workspace 解析对话卡；subagent 按 `contextWorkspaceId` 解析操作目录，并使用自己的标题、更新时间和 provider 生成对话卡。
- 能力边界：`contextWorkspaceId` 只服务 hover 卡的目录展示。右键菜单、置顶、重命名、Finder 与其它能力判断继续读取节点真实 `workspaceId`，不得把继承目录解释成 subagent 拥有独立 workspace。
- 测试：模型测试断言子节点保留自身时间与 provider，同时在无独立 workspace 时继承父级目录上下文；定向树模型测试覆盖新增字段，浏览器实测核对卡片标题、目录、时间与提供方。
