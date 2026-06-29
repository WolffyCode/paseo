# 架构 · Claude 主子孙 subagent 对话树（原生树）

> 日期：2026-06-27 · 状态：草拟（R1 FAIL → R2 PASS → R3 收 seam A–E + W2，待复审 + 闸 2） · 关联：[requirement.md](./requirement.md) · [ui.html](./ui.html) · canonical：docs/helm/product.md + docs/helm/ui.html
> 写 **HOW 的边界**，不写逐行实现（实现交 helm-developer）。遵循 [standards.md](../../standards.md) + [docs/coding-standards.md](../../../coding-standards.md) + [docs/rpc-namespacing.md](../../../rpc-namespacing.md)。
> 地基 = PM 实测 brief（A 段 ground truth）+ 红队 R1 复核（已逐条核实并采纳，见 §9）。本需求 **几乎全在服务端**：把 provider 内部 subagent 的「任意层节点 + 每节点完整只读 timeline」从原生落盘读出，统一汇进客户端**既有**对话树（客户端已支持深层渲染，近零改动）。

---

## 0. 核心判断 + 三条不变量（地基，下面每章靠它闭合）

### 0.1 一句话定位（已据红队 P2-2 修正）
- **不新建树、不新建只读视图、不新建父子语义、不解除渲染深度。** 实读确认：客户端 `conversation-tree/select.ts::buildConversationTree` 已按 `parentAgentId` **无限递归**建树；`render.tsx` 的 `MAX_RENDER_DEPTH=64`（注释自陈「set high so 主子孙 agents nest effectively without limit」）**已渲染任意层**（`select.ts` L165「本轮卡单层」是 home-shell 陈旧注释，实际传 64）。observed 只读视图、`observed` flag、`subagents/*` 可控语义全既有。
- **本需求 = 服务端把原生 `subagents/agent-*.jsonl` 读成 observed agent（节点 + 只读 timeline），客户端只补能力门提示 + 清一句陈旧注释。** 深层节点进 `agents` map 带正确 `parentAgentId`，既有树自动正确。**`MAX_RENDER_DEPTH=64` 病态递归护栏保留，禁止删。**

### 0.2 天然汇聚点（统一两来源、统一三 provider 的唯一地方）
> 客户端 `sessions[serverId].agents`（Map）+ 每 agent 的 `parentAgentId`（来自 `labels[PARENT_AGENT_ID_LABEL]`，`normalizeAgentSnapshot` 已解析）。
- 直接子、深层、paseo-run 子 **最终都表现为「`agents` map 里一个带 `parentAgentId` 的 agent」**，`buildConversationTree` 不分来源按 `parentAgentId` 归并。**这就是统一发生的那一层，不在别处再造合并器。**

### 0.3 三条不变量（红队按此审矛盾）
1. **File = 唯一持久真相。** Claude 原生 `<projectDir>/<rootSessionId>/subagents/agent-<agentId>.jsonl` + `.meta.json` 是 subagent 对话与父子关系的唯一权威落盘（brief A2）。**不自造存储/镜像**。
2. **内存 observed 记录 = 可重建缓存。** daemon `observedAgents` 随时可由「扫 `subagents/` + meta」整体重建（restart / 历史打开 / runtime-gone 重载都靠它）。**丢内存不丢数据** —— restart 与 drop 都安全的根因。
3. **NODE 通道与 TIMELINE 通道分离（R2 承重墙，dedup 命门由此结构性消失）。**
   - **TIMELINE 通道：每个节点的只读对话有且仅有一个来源 —— 它自己的 `agent-<agentId>.jsonl`**（所有深度一律 file，含直接子）。⇒ **任一 timeline 永不存在两个 writer**，无需 item 去重、无需 handoff、无需 epoch-replace。
   - **NODE 通道：节点「存在 + 标题 + 状态 + 父指针」可由 live 与 file 两路供给，按单一 id `observed:<toolUseId>` 幂等 upsert 到同一条扁平记录**（last-writer-wins + 状态单调，§4·1）。直接子靠 live `sub_agent_observation` **即时**冒出节点（满足 brief B2「直接子即时」），深层靠 file watcher 冒出；两路同 id ⇒ 永远一个节点。
   - **Live 流角色收窄为：① 直接子节点的即时出现；② 直接子的 `task_notification` 落定（§4·4）；③ file watcher 的 bootstrap 触发器。它不再供给任何节点的 timeline 对话项。**

> **dedup 决策（headline）**：采 **「TIMELINE 单源（file-only）+ NODE 记录幂等 upsert」**。节点级去重靠单 id 空间（`observed:<toolUseId>`，live `callId` ≡ file `meta.toolUseId`）结构消除；item 级去重**根本不存在问题**——没有任一 timeline 有两个源。**原 R1 的「LIVE/FILE authority + handoff replace + epoch-bump」整体退役**（红队 P1-1 指出它会抑制直接子文件读取→孙挂错父/卡 running；分离 NODE/TIMELINE 通道后该机制连同脆点一起消失）。forwardSubagentText 保留（喂父对话里 Task 工具卡的子动作摘要，brief B5），但**不**用其转出物当子节点 timeline。

---

## 1. 模块划分（现状映射表 → 新增/改动模块）

### 1.1 现状映射（现有什么 → UI/model 分离度 → 处置）
> 处置 = **复用** / **重构**（实现新设计 + 同批删旧，无 dead gate）/ **新建** / **退役**。

| # | 子系统 | 现有文件 / 契约 | 分离度 | 处置 |
| --- | --- | --- | --- | --- |
| 1 | **客户端对话树（数据）** | `app/conversation-tree/select.ts::buildConversationTree`（已无限递归 + subagentCount 聚合） | 优 | **复用**，零改动 |
| 2 | **客户端对话树（渲染深度）** | `render.tsx::MAX_RENDER_DEPTH=64`（已渲染任意层）、`flattenConversationTreeRows({maxDepth})`、`MAX_INDENT_DEPTH=8` | 优 | **复用**（保留 64 护栏）；仅 **清** `select.ts` L165 陈旧注释 + 确认深层缩进态。**红队 P2-2：不解除 cap、不删护栏** |
| 3 | **observed 只读视图** | `panels/agent-panel.tsx`（`if(observed)→ObservedAgentReadOnlyBar`） | 优 | **复用**，深层同样命中 |
| 4 | **observed id/status/title 纯函数** | `agent/observed-sub-agents.ts`（注释自陈「sub_agent tool-call detail 是两 provider 唯一共享抽象」） | 优 | **重构**：`observedSubAgentId` 改 **toolUseId 单键**（§4·5）；`observedSubAgentStatus` 留 live 事件路 |
| 5 | **observed 直接子 live 合成** | `claude/sidechain-tracker.ts`、`agent-manager.ts::applyObservedSubAgent` | 中 | **重构 + 部分退役**：留「node 级观察事件 + 父 Task 摘要」；**退役**子 timeline 项镜像（`extractObservedChildItems` 及携 `item` 的观察事件）—— timeline 走 file 单源（§5） |
| 6 | **observed 重启重载** | `agent-loading.ts` L51（`record.observed→loadObservedSubAgentFromStorage`，用 persistence.sessionId 读历史） | 中 | **退役旧路 + 重构**：深层从未持久化、Claude persistence.sessionId 恒空（读历史本就返空）。改「扫 subagents/ 重建全树」为权威，registry 同 id 收敛（§4·6、§5、P2-5） |
| 7 | **observed 只读 timeline 读取（Claude）** | `claude/agent.ts::loadObservedSubAgentHistory→loadObservedChildHistory(sessionId)`（从**根**过滤 `isSidechain`，~L4192） | — | **退役 + 重写**：旧 isSidechain-from-root 对新 SDK 实测返空（brief A4），**删**，改读子自身 `agent-<agentId>.jsonl`（复用 `convertClaudeHistoryEntry`）。无 dead fallback |
| 8 | **任务生命周期信号** | `claude/task-notification-tool-call.ts`（解析 `task_notification`：`task_id`/`status`，`mapTaskNotification*` 一族）、`agent.ts:3397`（路由 system/task_notification） | 中 | **复用 + 扩展（seam D）**：前台 settle 主权威=owner Task `tool_result`（tool_use_id 必有）；`task_notification` 补后台子；解析器**扩展提取** tool_use_id / `task_id→toolUseId` 关联（SDK `task_*.tool_use_id` 是 optional）（§4·4） |
| 9 | **后代生命周期清理** | `agent-manager.ts::settleObservedSubAgents`(L3656-3673)、`dropObservedSubAgents`(L3678-3690) | — | **退役 + 重构**：二者**都**按 `parentAgentId===rootId` 单层过滤（只直接子）。status 移到 task_notification **单节点**驱动后，subtree settle 无调用点 ⇒ **`settleObservedSubAgents` 整体退役**；**`dropObservedSubAgents` 改递归整子树**（修深层内存泄漏）+ archive 级联递归（§4·4 / §4·8，红队 P1-2 补正） |
| 10 | **原生路径编码 / transcript→timeline 解析** | `claude/project-dir.ts::claudeProjectDirSync`、`agent.ts::convertClaudeHistoryEntry`（uuid→messageId 已具备） | 优 | **复用**，禁止重写 |
| 11 | **timeline store（epoch/reset/游标）** | `agent-timeline-store.ts`（`epoch`/`reset:true`/cursor epoch-mismatch L204）、客户端 `AgentTimelineCursorState` | 优 | **复用**（深层 timeline 走既有 initialize/append；单源故**不需** epoch-replace） |
| 12 | **paseo-run 子树 + 策略** | `app/subagents/*`（`selectSubagentsForParent`/级联 `archive-subagent`/`detach`/`close-tab-policy`） | 优 | **复用**，语义不动 |
| 13 | **协议承载** | `AgentSnapshotPayload`（`observed?`+`labels` 加性可选）、`ServerInfoStatusPayload.features`（布尔能力门集，`providersSnapshot`/`workspaceMultiplicity` 先例）、`agent-labels.ts` | 优 | **复用 + 加 1 个 features bool**（§6，红队 P2-3） |

**一句话结论**：约 **88% 复用**；**重构 5 处服务端**（id 单键化、restore 改 file-scan、isSidechain 退役改 per-file、sidechain item 镜像退役、settle 退役 + drop/archive 改递归），**真新建 1 块**（file watcher + 纯函数树核 + 公共 API 二方法）。**客户端近零改动。**

### 1.2 新增 / 改动模块（path 即名）

**服务端（本需求主体）**
- 新建 `claude/observed-tree.ts` —— **纯函数树核（无 fs）**：`buildToolUseOwnerIndex`、`resolveObservedNode`、`deriveObservedNodeStatus`、`deriveObservedDepth`、`collectObservedDescendants`、`mergeObservedNodeRecord`、`incrementalTailSlice`。**不渲染、不碰盘即可测。**
- 新建 `claude/observed-tree-watcher.ts` —— **Claude 兼容层（fs 边界）**：bootstrap（§4·8）+ watch 单 `subagents/` 目录 + offset 增量 tail + 调纯核 + 发 `ObservedTreeEvent` + 持有该根全节点集（供 drop/archive 递归 + 重建）。实现 `loadObservedSubAgentTree`/`watchObservedSubAgentTree`。
- 改 `observed-sub-agents.ts` —— `observedSubAgentId(toolUseId)` 单键化。
- 改 `agent-sdk-types.ts` —— AgentClient 新增 2 方法 + shape；`ObservedSubAgentHistoryParams` 改 nativeRef。
- 改 `agent-manager.ts` —— **Model 收口**：node 幂等 upsert（live+file 同 id）、状态单调、status 改 **单节点信号（owner tool_result 主 + task_notification 补后台）**驱动、**退役 `settleObservedSubAgents`（turn_completed）**、**`dropObservedSubAgents` 改递归整树（修泄漏）+ archive 级联递归**、restart 扫描重建、退役携 item observation 消费 + 旧 per-record restore history 读。
- 改 `claude/agent.ts` —— `loadObservedSubAgentHistory` 重写读子文件；**删** `loadObservedChildHistory`。
- 改 `claude/sidechain-tracker.ts` —— 退役 `extractObservedChildItems` + 携 `item` 观察事件（留 node 观察 + 父 Task 摘要）。

**协议** `protocol/messages.ts` —— `ServerInfoStatusPayload.features` 加 `observedSubagentTree?: boolean`（COMPAT）。

**客户端（极小）**
- 清 `conversation-tree/select.ts` L165 陈旧注释；确认深层缩进态。
- 能力门接入点 —— 新纯 selector `selectObservedTreeCapability(serverInfo)` 读 `features.observedSubagentTree`，关则「升级主机」提示。

---

## 2. 模型与 UI 分离

| 状态域 | 归属层 | 载体 / 契约名 | 判据 |
| --- | --- | --- | --- |
| toolUseId→owner 索引、父子归属、节点状态、depth | **服务端纯函数** `observed-tree.ts` | `buildToolUseOwnerIndex`/`resolveObservedNode`/`deriveObservedNodeStatus` | 喂记录数组即出，无 fs/网络 → 单测 |
| 节点 id / title | **服务端纯函数** `observed-sub-agents.ts` | `observedSubAgentId/Title` | 纯输入→输出 |
| node 记录幂等收敛（live+file 同 id） | **服务端纯函数** | `mergeObservedNodeRecord(prev,next)`（状态单调、字段 last-writer-wins） | 纯函数 → 单测 |
| 后代集合（drop/archive 递归域 + 重建） | **服务端纯函数** | `collectObservedDescendants(rootAgentId, allRecords)` | 纯函数 → 单测 |
| observed 快照 + 只读 timeline 缓存 | **服务端 Model** `agent-manager`（`observedAgents`+`timelineStore`） | 既有 `dispatch(agent_state)` + 既有 timeline 通道 | — |
| 客户端 agent 真相（含深层） | **客户端 store** `session-store.agents` | `normalizeAgentSnapshot`（labels→parentAgentId、payload→observed） | 既有 |
| 对话树派生（含深层） | **客户端纯 selector** `conversation-tree/select.ts` | `buildConversationTree`/`flattenConversationTreeRows` | 既有单测 |
| 是否启用深层树 / 升级提示 | **客户端纯 selector** | `selectObservedTreeCapability(serverInfo)` | 纯函数判 `features.*` |
| 展开/收起·选中·右键语义 | sidebar-* store + 路由派生 + `subagents/*` | 既有 | 不另存选中态 |

**UI 只做**：渲染（深层缩进/状态点/角标、`ObservedAgentReadOnlyBar`+消息流、升级条）；dispatch（展开/收起、`navigateToAgent`、打开节点=既有 timeline fetch）。**UI 内无父子计算、无来源合并、无状态机** —— 全在服务端纯函数 + 客户端 selector。

---

## 3. 数据流与接口契约

### 3.1 事件 → 状态 → 渲染（NODE 通道 + TIMELINE 通道分离）

**NODE 通道（存在/标题/状态/父指针）—— live + file 双供给，同 id 幂等收敛**
```
直接子: SDK live → sidechain-tracker → sub_agent_observation(callId, type, desc)         [即时, 仅 node]
深层:   fs.watch('rename' 新文件) → 读 meta.json → owner 索引解析 → node 快照            [~200ms]
两路 → agent-manager: id=observedSubAgentId(toolUseId), mergeObservedNodeRecord(幂等, 状态单调),
   parentAgentId 标签 = 真实根 id(直接子) | observed:<ownerToolUseId>(更深), nativeRef 进 labels
 → dispatch(agent_state) → 客户端 agents map → buildConversationTree → 树
```

**TIMELINE 通道（每节点完整只读对话）—— 单源 = 该节点自己的文件**
```
打开任意层节点 → 既有 navigateToAgent + 既有 timeline fetch
 → [seam A gate] nativeRef 未到位(live 半节点, ~200ms 窗口) → 只读视图显「加载/解析中」(非空、非 error)
 → nativeRef 到位 → loadObservedSubAgentHistory({nativeRef,cwd}) → 读 agent-<agentId>.jsonl
   → convertClaudeHistoryEntry → AgentTimelineItem[] → timelineStore.initialize → 推送
 → 该节点被 watch 时: fs.watch('change') → incrementalTailSlice(offset) → 新行 convert → append 推送
 任一 timeline 永远只有这一个 writer ⇒ 无去重、无 handoff、无 epoch-replace
```

**STATUS（backgrounding-robust，判据顺序据 seam D 重排 —— SDK `task_*.tool_use_id` 是 optional，前台不赌它）**
```
本节点键 = toolUseId(=owner Task tool_use 的 id, 必在):
  ① 前台主权威: owner 的 Task tool_result(必落盘、tool_use_id 必有, 结构读必吃) → errored→error 否则 idle
  ② 后台补充: task_notification(completed/failed/stopped); 缺 tool_use_id 时经 toolUseByTaskId(task_id→toolUseId)回关联
  ③ "running in the background" tool_result / is_backgrounded → 非终态, 维持 running, 继续 tail
  ④ 无任何终态: rootIsActive ? running : idle  (rootIsActive=根活跃/正在 resume, 扫描时即知; ④的 idle 非 sticky, seam B)
  sticky: 仅 ①/② 真终态永久; ④的静态 idle 可被随后活跃迹象 revise 回 running
  根 runtime-gone/archive → collectObservedDescendants 递归整子树 drop / 级联归档, 不靠"文件静默"
```

### 3.2 跨模块接口契约（命名 shape，不 inline）

```ts
// agent-sdk-types.ts —— provider 无关「公共 API」(分层铁律脊柱; 加 provider=加兼容层, 此签名不动)
interface ObservedSubtreeRef { rootSessionId: string; cwd: string; rootAgentId: string }
interface ObservedNativeRef { rootSessionId: string; agentId: string }   // 文件定位, 进 labels, 不进 persistence

interface ObservedNodeSnapshot {
  id: string;                       // observedSubAgentId(toolUseId) = "observed:<toolUseId>"
  parentAgentId: string;            // 真实根 id(直接子) | "observed:<ownerToolUseId>"(更深)
  title: string;
  status: "running" | "idle" | "error";
  nativeRef?: ObservedNativeRef;    // seam A: live「半节点」刚冒时无 agentId, ~200ms 后由 file 补; 缺则 timeline-open 显「加载/解析中」
}
type ObservedTreeEvent =
  | { kind: "node"; node: ObservedNodeSnapshot }
  | { kind: "status"; nodeId: string; status: "running"|"idle"|"error" }
  | { kind: "timeline_item"; nodeId: string; item: AgentTimelineItem };  // 仅对「已打开」节点的近实时增长
type ObservedTreeUnsubscribe = () => void;

interface AgentClient {
  loadObservedSubAgentTree?(ref: ObservedSubtreeRef): Promise<ObservedNodeSnapshot[]>;     // 一次性扫(初次/restart/历史)
  watchObservedSubAgentTree?(ref: ObservedSubtreeRef, onEvent: (e: ObservedTreeEvent) => void): ObservedTreeUnsubscribe;
  loadObservedSubAgentHistory?(params: { nativeRef: ObservedNativeRef; cwd: string }): Promise<AgentTimelineItem[]>; // 重写; 仅 nativeRef 到位后可调(seam A)
}
```

```ts
// observed-tree.ts —— 纯函数树核(必测, §7)
interface SubagentMeta { agentType?: string; description?: string; toolUseId: string; spawnDepth?: number }
interface ToolUseOwnership {
  ownerAgentId: string | "<root>";
  // 前台终态主权威 = owner 的 Task tool_result(可靠: tool_use_id 必有、必落盘); bg 的 "running in the background"/is_backgrounded 非终态
  terminal: "running" | "idle" | "error";
}

// 结构读: 无条件摄入每个 agent-*.jsonl + 根文件的 tool_use / tool_result / task_*(notification/started/progress),
// 与 timeline 发射无关(P1-1)。同遍建两索引(seam D —— SDK: task_*.tool_use_id 是 optional, 不可当唯一键):
//   owners(toolUseId→ownership, 前台终态来自 owner Task tool_result) +
//   toolUseByTaskId(task_id→toolUseId, 从带 tool_use_id 的 task_started/progress 机会式收集), 供缺 tool_use_id 的后台 task_notification 回关联。
function buildToolUseOwnerIndex(input: {
  rootRecords: Iterable<Record<string, unknown>>;
  agentRecordsByAgentId: ReadonlyMap<string, Iterable<Record<string, unknown>>>;
}): { owners: Map<string /*toolUseId*/, ToolUseOwnership>; toolUseByTaskId: Map<string /*task_id*/, string /*toolUseId*/> };

function resolveObservedNode(input: {
  agentId: string; meta: SubagentMeta;
  ownerIndex: ReadonlyMap<string, ToolUseOwnership>;
  metaByAgentId: ReadonlyMap<string, SubagentMeta>;   // ownerAgentId Y → metaByAgentId[Y].toolUseId → observed id
  rootAgentId: string;
}): ObservedNodeSnapshot;

// 状态判据顺序(seam D, 据实重排; 前台走必在的 owner tool_result, 不赌 optional 字段):
//  ① 前台主权威 = owner Task tool_result(非 bg-ack): errored→error 否则 idle;
//  ② 后台 = task_notification(completed/failed/stopped, 缺 tool_use_id 时经 toolUseByTaskId 回关联);
//  ③ bg-ack tool_result 在、无 notification → running;
//  ④ 无任何终态: rootIsActive ? running : idle(静态展示默认, seam B —— 非 sticky)。
function deriveObservedNodeStatus(signals: {
  ownerToolResultErrored?: boolean;          // ① owner Task tool_result(前台终态主权威)
  ownerToolResultIsBackgroundAck?: boolean;  // ③ "running in the background"
  taskNotificationStatus?: "completed" | "failed" | "stopped";  // ② 后台终态(经 task_id 索引回关联)
  rootIsActive: boolean;                      // ④ 根活跃/正在 resume —— 扫描时即知, 非 watcher 物理 attach(seam B)
}): "running" | "idle" | "error";

function deriveObservedDepth(agentId: string, metaByAgentId: ReadonlyMap<string, SubagentMeta>,
  ownerIndex: ReadonlyMap<string, ToolUseOwnership>): number;

// 幂等收敛 live(node-only) 与 file 同 id 记录。sticky 仅对「真终态」(①owner tool_result 终态 / ②task_notification 终态)生效;
// ④的「静态 idle」非 sticky, 可被随后 live/file 的活跃迹象 revise 回 running(seam B: 防重启时在跑节点被永久钉 idle)。
function mergeObservedNodeRecord(prev: ObservedNodeSnapshot | null, next: ObservedNodeSnapshot): ObservedNodeSnapshot;

// drop/archive 的递归域: 沿 observed 父链 observed:<ownerToolUseId> 收根下所有后代(任意深度)。
function collectObservedDescendants(
  rootAgentId: string,
  records: Iterable<{ id: string; parentAgentId: string }>,
): Set<string /*observed id*/>;

function incrementalTailSlice(prevOffset: number, chunk: string): { lines: string[]; nextOffset: number }; // 只取完整行
```

```ts
// observed-sub-agents.ts —— 重构(单键化)
function observedSubAgentId(toolUseId: string): string;  // "observed:<toolUseId>"
// 客户端: 无新 type; 仅新增
function selectObservedTreeCapability(serverInfo: ServerInfoStatusPayload | null): boolean; // 读 features.observedSubagentTree
```

### 3.3 labels 承载 nativeRef（不新增协议字段、不撞父 session）
- observed 节点 `labels`：`paseo.parent-agent-id`（既有）+ `paseo.observed.root-session-id` + `paseo.observed.agent-id`（新，仅服务端读）。
- **nativeRef 不进 `persistence`**：Claude subagent 与根 **共享 sessionId**（brief A2），放 `persistence.sessionId` 会与根 agent 句柄相撞（§4·5b）。observed Claude 节点 `persistence=null`（无独立 session、永不可 resume），文件靠 nativeRef 标签定位。

---

## 4. 闭合点逐条（进入 / 退出 / 边界）—— 红队按此审

> **P1 三条（对应 D1/D4/D8）写到无懈可击。**

### 1) 两来源统一成一棵树 + 每节点一份 timeline 【dedup 命门 · 据红队 P1-1 重写】
- **统一在哪层**：客户端 `agents` map（§0.2）。
- **NODE 通道（节点级去重，结构性）**：直接子 live `sub_agent_observation` 与深层/重建的 file 扫描，**两路都产 `observed:<toolUseId>`**（live `callId` ≡ file `meta.toolUseId`，实测两源都带：SDK `parent_tool_use_id` / meta.toolUseId）。`mergeObservedNodeRecord` 幂等 upsert 到同一条扁平记录 ⇒ **永远一个节点**。收敛只在标量字段（id/title/status/parentRef/nativeRef），**不碰 timeline**；**nativeRef 在 live 半节点上可缺、由 file 补（seam A）**；**sticky 仅真终态、静态 idle 可 revise（seam B）** 防 live/file 抖动。
- **TIMELINE 通道（item 级去重，结构性消失）**：**每节点 timeline 单源 = 它自己的 `agent-<agentId>.jsonl`**（直接子也如此）。⇒ **任一 timeline 任一时刻只有一个 writer**，从根上无 item 重复。
  - **进入**：节点被打开 → **nativeRef 到位才读**（seam A：live 半节点 ~200ms 窗口内 nativeRef 未到 → 显「加载/解析中」，非空非 error；file 补上 nativeRef 后自动加载）→ `loadObservedSubAgentHistory` 整读其文件；其后该文件 `change` → `incrementalTailSlice` 续 append。
  - **退出**：节点终态后文件不再增长，timeline 冻结。
  - **边界**：live 流**绝不**发任一节点 timeline 项（`sidechain-tracker` 子 item 镜像退役，§5）。⇒ 红队 P1-1 的「抑制直接子文件读取致孙挂错父」**不会发生**：结构读（owner 索引）**无条件**吃直接子文件的 tool_use/tool_result/task_notification（§4·2），与 timeline 无关。
- **三问**：① 无 live→file 切换（原 handoff 退役）：直接子 timeline 一开始就 file，live 只供 node 出现/状态；② 重启恢复：扫 `subagents/` 重建全 node（§4·6），timeline 各读各文件；③ 并存重复？**无** —— node 同 id 收敛成一个、timeline 单源永不双写。**结构性闭合，不依赖任何运行时不变量。**
- **退役原 LIVE/FILE authority + epoch-replace 的理由**：分离 NODE/TIMELINE 后 timeline 天然单源，authority/handoff/epoch-replace 全无必要且引入红队 P1-1 脆点，**整体删除**（refactor-not-patch，无 dead gate）。

### 2) 树重建（父子归属）【据红队 P1-1 解绑结构读】
- **进入**：`buildToolUseOwnerIndex` **无条件**扫根 `<sessionId>.jsonl` + 每个 `agent-*.jsonl` 的结构记录（`tool_use`/`tool_result`/`task_notification`）——**与该节点 timeline 是否发射无关**。每 subagent 的父 = 含其 `meta.toolUseId` 的 owner（brief A3 实测 63/63 resolved，可组合任意深度）。
- **退出（同遍出终态，seam D 重排）**：同遍把每个 toolUseId 的 **owner Task `tool_result`（前台主权威，tool_use_id 必有）** 收进 `ToolUseOwnership.terminal`，并建 `toolUseByTaskId(task_id→toolUseId)` 供缺 tool_use_id 的后台 `task_notification` 回关联 ⇒ 一次扫拿「父子 + 终态」。
- **paseo-run 子 与 内部子并进同一棵树**：paseo-run 子=真实 agent（`parentAgentId` 指真实父）；内部子=observed（指真实根 id 或 `observed:<ownerToolUseId>`）。都进 `agents` map 同等归并；`observed:` 前缀与真实 UUID/paseo id 永不撞。paseo-run 真实 agent 内跑 Claude ⇒ 它是自己 subagents 树的根，watch per 真实 Claude agent，组合天然成立。
- **边界（unresolved 兜底）**：meta.toolUseId 在根+已扫 agent 文件都查不到 → ① 判「owner 记录尚未 tail 到」→ 下一 tick 重解；② 根 runtime-gone 仍 unresolved → **挂根** + warn，**绝不丢节点**。

### 3) 加载分流（公共 API → 兼容层）【分层铁律 · 对齐 PM 收窄的 P2-4】
- **链路**：纯 UI（model 驱动）→ **Model**(`agent-manager`) → **公共 API**(§3.2 三方法) → **provider 兼容层** → 各读各真相。
- **每兼容层**：
  - **Claude（本需求主交付，任意层）**：`observed-tree-watcher` + `observed-tree`（纯）+ 复用 `convertClaudeHistoryEntry`/`claudeProjectDirSync`，读原生 `subagents/`。
  - **Codex（契约对齐，PM 已裁 P2-4）**：沿用**今天的只读直接子行为**，经**同一公共 API** 暴露（`loadObservedSubAgentHistory` 读其 thread）；**Codex 更深层不在本需求硬验收**（未来加兼容层）。措辞与 requirement §5 一致。
  - **paseo-run**：无 observed 兼容层 —— 真实 agent 走既有 live 通道，不经此 API。
- **加新 provider = 加一个兼容层**，**UI/Model/公共 API 签名不动**。支点：`observed-sub-agents.ts` 注释自陈的共享抽象。

### 4) 生命周期 / 状态机【据 P1-2 + 补正 + seam B/D 重排：tool_result 主权威·task_notification 补后台·settle 退役·drop/archive 递归】
- **节点出现（进入 running）**：直接子=live `sub_agent_observation` 首达（即时）；深层=`fs.watch('rename')` 见新文件→读 meta→resolve（~200ms）。
- **running → idle / error（确定判据，seam D 据实重排 —— SDK `task_*.tool_use_id` 是 optional，前台不赌它）**：
  - **① 前台主权威 = owner 的 Task `tool_result`**（可靠：`tool_use_id` 必有、必落盘、结构读必吃）：`is_error`→error，否则 idle。直接子 tool_result 在 **ROOT 文件 / live 流**，深层在 **owner agent 文件**。**取代原 turn_completed settle**。
  - **② 后台补充 = `task_notification`**（`completed`→idle/`failed`→error/`stopped`→idle）：仅后台子需要（其 tool_result 是「running in the background」非终态）。`task_notification.tool_use_id` **缺**时经 `toolUseByTaskId(task_id→toolUseId)` 回关联（索引由带 tool_use_id 的 `task_started`/`task_progress` 机会式建）。支点 `task-notification-tool-call.ts`（**复用 + 扩展提取关联**，§5）。
  - **③ `"running in the background"` tool_result / `is_backgrounded`**：**显式判非终态**，维持 running，继续 tail（后台子可在根 turn 后长跑；已证伪「断言 Paseo 不 backgrounding」——`daemon-e2e/claude-autonomous-wake.real.e2e.test.ts` 专测后台自主唤醒）。
  - **④ 无任何终态**：`rootIsActive ? running : idle`。`rootIsActive`=根活跃/正在 resume，**扫描时即知**（非 watcher 物理 attach 时点，seam B）⇒ 重启 scan 时在跑节点判 running。
  - **sticky 边界（seam B）**：仅 ①/② 真终态永久 sticky；④的「静态 idle」**非 sticky**，可被随后 live/file 活跃迹象 revise 回 running ⇒ **#8（跑一半重启续到完成）不被永久钉死**。
  - ⇒ **不靠「文件多久没动」猜完成**；不靠「根 turn ⇒ 后代终止」（同步嵌套不变量被 backgrounding 推翻，**弃**，不在 turn_completed settle）。
- **后代清理（红队 P1-2 + PM 补正：settle 与 drop **都**只扫直接子）**：
  - 实测 `settleObservedSubAgents`(L3656-3673) **和** `dropObservedSubAgents`(L3678-3690) **都**按 `labels[PARENT_AGENT_ID_LABEL]===rootId` **单层过滤=只直接子**。修父子后孙 parent=`observed:<...>`：settle 漏扫→状态卡转；drop 漏扫→**根 runtime-gone 时深层 observed 节点泄漏内存**。
  - **修法（settle 退役、drop/archive 递归）**：status 已移到 **单节点信号（owner tool_result 主 + task_notification 补后台）**驱动（上一条，按 tool_use_id 落定单个节点，非 subtree 扫描）⇒ **subtree settle-to-idle 已无调用点，`settleObservedSubAgents` 整体退役**。仍需递归的是：**`dropObservedSubAgents`（runtime-gone 删整子树，修内存泄漏）** 与 **archive 级联（标整子树 archivedAt）**——用 `collectObservedDescendants(rootAgentId)`（沿 observed 父链收所有后代，任意深度）/「该根 watcher 全节点集」，**不再单层过滤**。
- **父归档（退出，keep 历史）**：复用 `subagents/archive-subagent.ts` 级联，**递归**标整 observed 子树 `archivedAt`（保留节点、进归档视图、停 watch）→ `buildConversationTree` 过滤 → 退出活跃树（#11）。
- **runtime-gone（根 closed 非 archive，退出 remove）**：`dropObservedSubAgents` **递归**删整子树内存节点（安全：File 真相，下次加载重扫即回，不变量 0.3-2）。**与归档区分**：archive=keep+mark；close=remove。
- **W2 已知残留（后台子 crash · 决策②画像 · seam W2）**：后台子崩溃→既无 `task_notification` 又无终态 `tool_result` → 节点维持 running（只读）。**accepted 残留**：不永久泄漏——**窗口被根生命周期封顶**，根 runtime-gone/archive 时随 `collectObservedDescendants` 递归 drop/归档清除，重载为静态 idle。登记上浮闸 2（与「settle 退役」同属决策②完整画像）。
- **daemon 重启**：§4·6。

### 5) 身份 / id 方案（n 层组合规则）
- **派生 id**：`observedSubAgentId(toolUseId) = "observed:<toolUseId>"`，**扁平、单键**。
  - **(a) 不撞真实 agent id**：`observed:` 前缀（真实 agent 是 UUID/paseo id）。
  - **(b) 不撞父 session**：observed 节点 `persistence=null`，nativeRef 进 labels、**不进 persistence** ⇒ 不与根 session 句柄相撞。
  - **(c) 同一 subagent 每次解析同一 record**：id 仅由 toolUseId 决定，toolUseId 全局唯一（`toolu_*`）且 live/file 同值 ⇒ 幂等。
  - **(d) 深层父指针自洽**：直接子 parent=真实根 id（meta.toolUseId 命中 ROOT）；深层 parent=`observed:<ownerToolUseId>`。扁平不嵌套、长度有界。
- **客户端 `agents` map 里内部 subagent 的 id/parentAgentId**：id=`observed:<toolUseId>`；parentAgentId=真实根 id 或 `observed:<ownerToolUseId>`。
- **边界（refactor-not-patch）**：`observedSubAgentId` 双段→单段**整体替换**（live + restore + scan 三处同改）；Helm 无存量用户/老数据 ⇒ 无双 scheme 期、无 dead fallback。
- **唯一性兜底（备选，默认不启用）**：疑 toolUseId 跨 session 撞，可 `observed:<rootSessionId>:<toolUseId>`（两源仍同值）。当前以 `toolu_*` 全局唯一为据保持扁平。

### 6) 重启【据红队 P2-5 定双 restore 优先级】
- **进入（全树重建，权威 = 扫描）**：根 Claude agent resume / 历史加载 → `loadObservedSubAgentTree(ref)`：扫 `<projectDir>/<rootSessionId>/subagents/` 全部 `agent-*.jsonl`+meta → `buildToolUseOwnerIndex`（读根+各 agent 文件）→ `resolveObservedNode` 批量 → upsert 全节点（含从未持久化的深层）。
- **双 restore 收敛（P2-5）**：`agent-loading.ts` L51 `loadObservedSubAgentFromStorage` 的 **history 读路** 退役（Claude persistence.sessionId 恒空、且走的正是要删的 isSidechain 路）。**扫描为唯一权威**；registry 持久化的（直接子）记录按**同 id** 被扫描结果**收敛覆盖**（或仅作 node 预热，不读 history）。**不留两条 restore 路**（§5）。
- **正在 tail 的文件怎么续**：watcher 每文件记 **byte offset**；restart 后初扫整读（offset=末），其后 `change` 从 offset 增量（`incrementalTailSlice` 只取完整行）。**不丢**（整读补齐）+ **不重**（offset 单调 + timeline 单源）。
- **跑一半重启**：根 resume → watcher 重启（初扫=重建）→ 继续近实时 tail 到完成（含后台子，靠 task_notification 落定 §4·4）。
- **退出**：根 runtime-gone/archive → 停 watch（§4·8）。

### 7) 只读
- **Model**：内部子=`observed:true`+`OBSERVED_AGENT_CAPABILITIES`（既有只读 caps），`persistence=null`（不可 resume）。
- **UI**：`agent-panel` 既有 `if(observed)→ObservedAgentReadOnlyBar` 对深层同样命中 ⇒ 无输入框、无中断；右键写操作按 `observed` 隐藏/禁用。
- **paseo-run 子**：`observed=false` ⇒ 正常可发可中断、保留既有右键。
- **边界**：observed（只读）与 paseo-run（可控）由 `observed` flag 区分，同棵树共存（#12）。

### 8) watch 机制【据红队 P1-3 定 bootstrap + PM 补正 drop 递归】
- **watch 哪**：每个**活跃** Claude 根 session 的**单个** `subagents/` 目录（brief A2 所有深度平铺同目录 ⇒ **1 个非递归 watcher** 覆盖整树，跨 OS 可移植）。
- **bootstrap（P1-3：目录首子前不存在，禁 fs.watch 缺失目录）**：
  - **live 路（活跃根）**：在**首个 `sub_agent_observation`** 到达时**惰性 attach**（此刻第一个直接子已派生 ⇒ `subagents/` 必已被 SDK 创建）。首子前无 subagent、无可 watch，事件驱动零轮询。**attach 前显式 existence/try guard（seam C）**：目录缺失（竞态）则不 watch、不抛 ENOENT，等下一次 observation 重试。
  - **restart/历史路**：加载根时**先判存在**——存在则 `loadObservedSubAgentTree` 扫描 +（活跃则）attach；不存在则该根无子树，不 watch、不报错。
  - 边界：**绝不 mkdir、绝不 watch 缺失目录、绝不轮询 stat**。
- **增量（两级 tail，seam E —— 杜绝「只在打开时 tail」致未打开深层节点状态冻结）**：**结构 tail**（提取 tool_use/tool_result/task_* 喂 owner 索引 + 状态）对该根 `subagents/` 下**所有活跃文件**进行，**与节点是否被打开无关**（未打开深层节点的父子/状态照常更新）；**timeline 整读 + 逐项 append** 仅对**已打开**节点。per-file byte offset；一棵树数十文件 = 1 watcher + 按需小读（#9）。
- **何时停（退出，两态都递归，PM 补正）**：
  - **runtime-gone（根 close）**：退订 watcher + `dropObservedSubAgents` **递归**删该根全节点集（用 watcher 节点集 / `collectObservedDescendants`）→ **无深层泄漏**。
  - **archive**：退订 watcher + 级联 archivedAt **递归**整子树（keep 历史）。
  - **根 idle 但 session 活**：保持 watch（下一 turn 可能再派子）。**历史/归档根被打开**：只一次性 `loadObservedSubAgentTree`，不 attach watcher。

### 9) 接口契约【据红队 P2-3 改 features.* + P2-1 说明无需 epoch-replace】
- **公共 API**：§3.2 三方法。
- **协议**：
  - **数据通道复用**：深层 observed 节点走既有 `agent_state`；只读 timeline 走既有 timeline fetch/append 推送（observed 已对全局订阅者可见，agent-manager L753）。**不新增 client-facing 数据 RPC**（避免与既有通道重复=patch）。
  - **timeline 单源 ⇒ 不需 epoch-replace handoff**（P2-1 顾虑随 handoff 退役消失）。深层 timeline 用既有 `timelineStore.initialize/append`，客户端既有游标/`hasOlder` 正常工作，**不 bump epoch**。
  - **唯一协议新增 = 能力门 bool**（红队 P2-3）：`ServerInfoStatusPayload.features.observedSubagentTree?: boolean`（与 `providersSnapshot`/`workspaceMultiplicity` 同处，对齐 CLAUDE.md「Capability flags live in `server_info.features.*`」）。带 `// COMPAT(observedSubagentTree): added in v0.1.X, drop the gate when floor >= v0.1.X`。
  - **未来约束流量**扩展点 `agent.observed.subscribe_tree.request/.response`（点号命名空间），本需求**不引入**。
- **back-compat**：仅加性可选（features bool + labels 新键），不翻 optional→required、不删字段、不窄化。

### 10) 能力门 UI【features.*】
- **单点检测**：`selectObservedTreeCapability(serverInfo)` 读 `features.observedSubagentTree`。
- **关（旧 daemon）**：树只显主机能力内层级（直接子 live node 仍在），深层不拉；给「升级主机以查看深层 subagent」提示（`#upgrade-hint`）。**不降级模拟、不崩溃、不假装显示**。
- **边界**：检测只此一处，下游读干净布尔，无散落 `if(cap)`。

### 11) 主对话归档 → 内部子树只读历史（#11）
- **进入**：复用 `subagents/archive-subagent.ts` 级联，**递归**标整 observed 子树 `archivedAt`（与根一起进归档视图）+ 停 watch。
- **退出/边界**：已是只读、不可再变；活跃树经 `buildConversationTree` 过滤 archivedAt 自动隐藏整子树。File 仍是真相，归档只停 live 更新，不删文件。

---

## 5. 复用点 / 禁止重造 / 退役

**禁止重造（直接接）**：对话树数据/递归/角标/深度护栏(64) `conversation-tree/select.ts`+`render.tsx`；只读视图 `ObservedAgentReadOnlyBar`+`agent-panel`；observed 纯函数 `observed-sub-agents.ts`（仅 id 单键化）；解析器 `convertClaudeHistoryEntry`；路径编码 `claudeProjectDirSync`；任务信号 `task-notification-tool-call.ts`（**复用 + 扩展提取 tool_use_id/task_id 关联**，seam D）；timeline store `agent-timeline-store.ts`（initialize/append）；paseo-run 子树/级联/剥离 `app/subagents/*`；协议承载 `AgentSnapshotPayload.observed/labels`+`ServerInfoStatusPayload.features`+`agent-labels.ts`。

**真新建（确认没有）**：`claude/observed-tree.ts`（纯核）+ `claude/observed-tree-watcher.ts`（fs 兼容层）；AgentClient 二新方法 + shape；`features.observedSubagentTree` + 客户端 `selectObservedTreeCapability`。

**退役 / 重构（refactor-not-patch，同批删旧，无 dead fallback）**：
- `claude/agent.ts::loadObservedChildHistory`（从根过滤 `isSidechain`）—— 新 SDK 实测返空（brief A4），**删除**，唯一调用方改读 per-agent 文件。
- `sidechain-tracker.ts::extractObservedChildItems` + 携 `item` 的 `sub_agent_observation`（子 timeline 镜像）—— timeline 改 file 单源，**删除**（保留 node 观察 + 父 Task 摘要）。
- `agent-loading.ts` L51 `loadObservedSubAgentFromStorage` 的 **history 读路**（persistence.sessionId→loadObservedChildHistory）—— 退役，扫描权威、registry 同 id 收敛（P2-5）。
- `observedSubAgentId` 旧双段签名 —— 整体替换。
- `settleObservedSubAgents`（turn_completed 触发的单层 settle）—— **整体退役**：status 改 task_notification **单节点**驱动（按 tool_use_id），新设计无 subtree settle-to-idle 调用点（P1-2）。
- `dropObservedSubAgents`（单层过滤）—— **改递归整子树**（`collectObservedDescendants`，修深层内存泄漏，PM 补正）；archive 级联同改递归。
- 原 R1 的 LIVE/FILE authority flag + handoff replace + epoch-bump —— **整体删除**（NODE/TIMELINE 分离后无必要 + 红队 P1-1 脆点）。

**SDK API 不用之说明（红队 P2-6）**：SDK 有 `listSubagents(sessionId)`/`getSubagentMessages(sessionId, agentId)`（`sdk.d.ts` L949/L736），返 **pre-parsed `SessionMessage[]`**。本设计 **hand-roll 文件读** 有意：① 需 **byte-offset 增量 tail**（SDK 只整取、无 offset 增量）；② owner 索引需 **原始 `tool_use`/`tool_result`/`task_notification`/`parentUuid`/`isSidechain` 记录**，SDK 预解析后拿不到；③ 复用 `convertClaudeHistoryEntry` 要原始 record。开发者勿「发现」该 API 以为漏读。

---

## 6. 协议 / 平台

### 6.1 协议（动一处，后向兼容 + 能力门 + COMPAT，红队 P2-3）
- `ServerInfoStatusPayload.features`（布尔能力门集，`providersSnapshot` 等先例）加：
  ```ts
  // COMPAT(observedSubagentTree): added in v0.1.X, drop the gate when floor >= v0.1.X
  observedSubagentTree: z.boolean().optional()
  ```
- `AgentSnapshotPayload.labels` 加 `paseo.observed.*` 键（record 已加性可选）。
- **不动**：`AgentStreamEvent.sub_agent_observation` schema（仍承直接子 node 观察；服务端**不再产出**携 item 的变体——schema 兼容、行为收窄）、timeline/agent_state 通道。
- back-compat 自检：6 个月前客户端仍能 parse（新增全可选）；6 个月前 daemon 缺 `features.observedSubagentTree` → 新客户端走升级提示（非崩溃）。

### 6.2 平台门
- **服务端**：daemon=Node only，无平台门。`fs.watch` 用**非递归单目录**（brief A2 平铺）规避 Linux 递归不可靠；offset tail 用标准 `fs`。
- **客户端**：本需求改动（能力门提示 + 清注释 + 深层缩进确认）**跨平台无分叉**，不新增 `.web/.native/.electron`，不引平台判定做布局，hover 沿用 `isHovered||isNative||isCompact`。

---

## 7. 测试策略（standards §5：必写单测 + 端到端真验证）

### 7.1 必单测的纯函数（不渲染即可测）
| 纯函数 / 逻辑 | 覆盖场景（含红队修复点） |
| --- | --- |
| `buildToolUseOwnerIndex` | depth 1/2/3 混合：每 toolUseId 正确 owner + 终态(owner tool_result 主权威)；**同遍建 `toolUseByTaskId`（seam D）**；**结构读无条件吃直接子文件**的 tool_use/tool_result/task_*（P1-1）；含 brief A3「63 全 resolved」形态 |
| `resolveObservedNode` | 父指针：直接子→真实根 id；深层→`observed:<ownerToolUseId>`；unresolved→挂根兜底 |
| `deriveObservedNodeStatus` | **①owner tool_result 前台主权威**(is_error→error/否则 idle)；**②task_notification 补后台**(缺 tool_use_id 经 task_id 回关联)；**③"running in the background"/is_backgrounded→running 非终态**；**④无终态: rootIsActive?running:idle**（seam B/D） |
| `collectObservedDescendants` | **drop/archive 递归域**：孙/曾孙沿 `observed:<ownerToolUseId>` 链全收（防 drop 漏扫泄漏，PM 补正） |
| `observedSubAgentId`（单键） | live callId 与 file meta.toolUseId 同值→同 id（节点级去重基石）；`observed:` 前缀防撞 |
| `mergeObservedNodeRecord` | live(node-only)+file 同 id 幂等收敛；**nativeRef 由 file 补（seam A）**；**sticky 仅真终态、④静态 idle 可 revise 回 running（seam B：防重启在跑节点钉死 #8）** |
| `deriveObservedDepth` | owner 链计深；spawnDepth 缺失仍对；存在时交叉一致 |
| `incrementalTailSlice` | (旧 offset, 新内容)→完整行 + 新 offset；半行不误切；不重不漏 |
| `selectObservedTreeCapability` | `features.observedSubagentTree` true→启用；缺失/false→升级提示 |
| 客户端 `flattenConversationTreeRows` | **既有 64 cap 下** depth≥3 渲染 + 缩进；**测保留 64、不删护栏**（P2-2） |
| nativeRef-late open（seam A） | live 半节点(nativeRef 缺)打开→「加载/解析中」非空非 error；file 补 nativeRef 后加载成功 |
| 重启在跑节点不钉 idle（seam B） | rootIsActive=true 扫描无终态→running(非 idle)；④静态 idle 非 sticky 可 revise；#8 续到完成 |

> `loadObservedSubAgentHistory` 重写：改造 `observed-history.test.ts` 为 per-agent 文件读断言；旧 isSidechain 用例随死路删。drop/archive 新增「递归整树、非单层」用例 + status 改 单节点信号（owner tool_result 主 + task_notification 补后台）驱动用例（P1-2 + PM 补正）。

### 7.2 端到端验证点（对应 requirement §6，逐条「能/否」，不靠截图）
- #1/#2 ≥3 层嵌套 + 孙挂对的子 ← owner 索引 + `resolveObservedNode` 真树样本 + 客户端树。
- #3 任意层完整对话无缺漏 ← per-file 整读 via `convertClaudeHistoryEntry`。
- #4 直接子不重复 ← **timeline 单源（结构性，无 writer 竞争）**。
- #5 近实时（新节点/状态/增长）← watcher tail（~200ms）+ task_notification；**含后台子长跑**。
- #6 内部子只读、paseo-run 可控 ← `observed` flag 端到端。
- #7/#8 重启完整重建 + 跑一半（含后台子）续到完成 ← `loadObservedSubAgentTree` 重建 + offset 续 tail + task_notification 落定。
- #9 数十文件无卡顿 ← 1 watcher + 按需读。
- #10 旧 daemon 升级提示不崩 ← `features.*` 单点门。
- #11 归档后子树只读历史 ← **递归**级联 archive + 过滤。
- #12 共存 ← observed/paseo-run 同树 flag 区分。
- **泄漏回归**：根 close 后内存无残留深层 observed 节点（drop 递归，PM 补正）。

---

## 8. 风险与取舍

| # | 风险 / 取舍 | 决策与理由 |
| --- | --- | --- |
| **R1 dedup 路线（迭代后）** | 原 LIVE/FILE authority+handoff（R1）被红队 P1-1 证脆 | **改 NODE/TIMELINE 通道分离**：timeline 单源（file），dedup 命门结构性消失。比原方案更闭合、更简。 |
| **R2 直接子 prose 延迟** | timeline 走 file ⇒ 直接子对话 ~200ms（非 live 即时） | 取闭合优先：node 即时（live）满足 B2「直接子即时」；prose ~200ms 在 #5「秒级内」内。**forwardSubagentText 保留**（喂父 Task 摘要，B5）。若日后要 live-instant prose，可作 pre-terminal 加速器重引入（既有 timeline-store reset 支持），**当前不建**。**此为对 B2/B5 的有意细化，请闸 2 拍板。** |
| **R3 backgrounding（P1-2 + 补正 + seam D）** | SDK `backgroundTasks`/Ctrl+B 后台化；**Paseo 已支持且测过**（`claude-autonomous-wake.real.e2e.test.ts`）；且 `task_*.tool_use_id` 是 **optional** | **不走「断言不 backgrounding」捷径**。**前台 settle 主权威=owner Task tool_result**（tool_use_id 必有），**task_notification 补后台**（缺 tool_use_id 经 `task_id→toolUseId` 回关联）；bg-ack/静态 idle/runtime-gone 递归兜底；**弃同步嵌套死不变量**。 |
| **R4 settle/drop 漏扫深层（红队 P1-2 + PM 补正）** | 二者**都**只按 parentAgentId===rootId 单层过滤；修父子后 settle 卡状态、**drop 泄漏深层内存** | status 移 单节点信号（owner tool_result 主 + task_notification 补后台） ⇒ **settle 退役**；**drop/archive 改 `collectObservedDescendants` 递归**（/ watcher 全节点集）；新增泄漏回归测。 |
| **R5 watcher bootstrap（红队 P1-3）** | `subagents/` 首子前不存在，fs.watch 缺失目录 ENOENT | 惰性 attach（首个 sub_agent_observation）/ 加载先判存在；**绝不 watch 缺失目录、绝不轮询/mkdir**。 |
| **R6 双 restore（红队 P2-5）** | scan 与 agent-loading L51 registry 两条 | scan 权威、registry 同 id 收敛、L51 history 读退役；不留两路。 |
| **R7 unresolved meta.toolUseId** | 子文件先于 owner 记录 / 脏数据 | 下一 tick 重解；runtime-gone 仍 unresolved→挂根+warn，不丢节点。 |
| **R8 toolUseId 全局唯一假设** | 跨 session 撞键极小概率 | 以 `toolu_*` 全局唯一为据保持扁平单键；留命名空间化备选（§4·5），零复杂度预算不预先复杂化。 |
| **R9 fs.watch 跨平台 / 抖动** | Linux 递归不可靠、编辑半行 | 单目录非递归（A2 平铺）；`incrementalTailSlice` 只取完整行；`change` 去抖合并。 |
| **R10 Codex 深层（PM 已裁 P2-4）** | Codex 更深层完整度 | 公共 API provider 无关；Codex 对齐 params、沿用今天只读直接子，**深层不在本需求硬验收**（requirement §5）。 |
| **R11 seam A/B 时序（R2 复审）** | nativeRef ~200ms 后到；重启 scan 早于 watcher attach | A: nativeRef optional + timeline-open gate「加载中」；B: rootIsActive 驱动 + sticky 仅真终态、静态 idle 可 revise。 |
| **R12 后台子 crash 残留（W2 · 决策②画像）** | 后台子崩溃无 notification 无 tool_result | **accepted**：维持 running(只读)，**窗口被根生命周期封顶**，runtime-gone 递归 drop 清除、重载静态 idle；上浮闸 2。 |

---

## 9. 迭代记录（R1 FAIL → R2 PASS → R3 收 seam，供复审）

| 红队条目 | 已核实 | 修复落点 |
| --- | --- | --- |
| **P1-1** LIVE 抑制直接子 file-tail 致孙挂错父/卡 running | 是（设计自证） | **NODE/TIMELINE 通道分离**：结构读无条件吃所有 agent 文件；timeline 单源 file；authority/handoff/epoch 整体退役。§0.3 / §4·1 / §4·2 |
| **P1-2** backgrounding 推翻「tool_result=终态」「根 turn⇒后代终止」；settle **与 drop** 只扫直接子（drop 泄漏深层内存） | 是（`sdk.d.ts` L2466-2474/L2822/L4193；`task-notification-tool-call.ts`；`claude-autonomous-wake.real.e2e.test.ts`；L3656-3673 + **L3678-3690** 双单层过滤；L2673 drop 调用） | 状态主权威改 `task_notification`（单节点 by tool_use_id）、bg 非终态、静态加载 idle、弃同步嵌套；**settle 退役**（无 subtree 调用点）、**drop 改递归修泄漏 + archive 递归级联**（`collectObservedDescendants`）。§4·4 / §4·8 / §3.1 STATUS |
| **P1-3** watcher bootstrap 未定义（ENOENT） | 是（目录惰创建） | 惰性 attach / 加载先判存在 / 禁 watch 缺失目录。§4·8 |
| **P2-1** handoff REPLACE 未接 epoch/游标 | 是（`agent-timeline-store.ts` epoch/reset/L204） | handoff 退役 ⇒ 无需 epoch-replace；深层 timeline 走既有 initialize/append、不 bump epoch。§4·9 |
| **P2-2** MAX_RENDER_DEPTH 现状描述错（实为 64 已渲深层） | 是（`render.tsx` L65=64、L61-64 注释） | 改「客户端近零改动、保留 64 护栏、仅清陈旧注释」。§0.1 / §1.1-row2 / §1.2 |
| **P2-3** 能力门应在 `features.*` 非 `capabilities` | 是（`features.providersSnapshot/workspaceMultiplicity`；CLAUDE.md L111） | 改 `features.observedSubagentTree`。§3.2 / §6.1 / §4·9-10 |
| **P2-4** Codex 收窄为契约对齐 | PM 裁定 | §4·3 / R10 对齐 requirement §5。 |
| **P2-5** 双 restore 未定优先级 | 是（`agent-loading.ts` L51） | scan 权威、registry 同 id 收敛、L51 history 读退役。§4·6 / §5 |
| **P2-6** 未说明为何不用 SDK listSubagents/getSubagentMessages | 是（L949/L736 返 pre-parsed） | §5 加显式说明。 |
| **〔R2 复审〕seam A** nativeRef 必填 vs live 拿不到 agentId（~200ms 窗口点开读空/报错） | 是（live 半节点无 agentId） | `nativeRef` 改 optional + timeline-open gate 显「加载/解析中」。§3.2 / §3.1 / §4·1 |
| **〔R2〕seam B** sticky × 重启 scan 时序 → 在跑节点永久钉 idle（#8 挂） | 是 | `rootIsActive`(扫描时即知)驱动 ④；sticky 仅真终态、静态 idle 可 revise。§3.2 / §4·4 / §7 |
| **〔R2〕seam D** task_*.tool_use_id 是 optional，不可当唯一键 | 是（`sdk.d.ts` L4120/4138/4160） | 前台 tool_result 主权威 + task_notification 补后台(经 `task_id→toolUseId` 索引)；解析器复用+扩展。§3.1 / §4·4 / §1.1-row8 / §5 |
| **〔R2〕seam C** bootstrap ENOENT guard | 是 | attach 前显式 existence/try guard，缺失不 watch 不报错。§4·8 |
| **〔R2〕seam E** 两级 tail 未讲清（恐只在打开时 tail） | 是 | 结构 tail 对所有活跃文件(与打开无关) + timeline 仅打开节点。§4·8 |
| **〔R2〕W2** 后台子 crash 残留 | accepted | 维持 running、根生命周期封顶 + 递归 drop 清除；上浮闸 2。§4·4 / §8 R12 / 附录 |

---

## 附：闭合性自检（对照 brief §D + 红队 P1，逐条「有入有出无矛盾」）

1. **统一/dedup**：客户端 agents map 统一；**NODE 同 id 幂等收敛、TIMELINE 单源 file** ⇒ 节点级与 item 级去重均结构性成立，**不依赖任何运行时不变量**，无 handoff/authority/epoch-replace。**nativeRef 在 live 半节点上 optional、由 file 补，到位前 timeline-open 显「加载中」（seam A）。**
2. **树重建**：owner 索引**无条件**吃所有 agent 文件结构记录（解绑 timeline 发射，P1-1），一遍出父子+终态；paseo-run 与内部子同 map 归并、前缀隔离；unresolved 挂根。
3. **分层**：UI→Model→公共 API(3 方法)→兼容层（Claude file / Codex thread-对齐 / paseo-run 不经此）；加 provider 仅加兼容层。
4. **生命周期**：出现=live 事件/文件 rename；running→idle/error **①owner tool_result 主权威 ②task_notification 补后台（经 task_id 回关联，因 tool_use_id optional，seam D）③bg-ack 非终态 ④rootIsActive?running:idle（静态 idle 非 sticky，seam B）**；**settle 退役、drop 递归修泄漏、archive 递归级联**（弃同步嵌套）；后台子 crash=accepted 残留(W2)。
5. **id**：`observed:<toolUseId>` 扁平单键，前缀防撞真实 id、persistence=null 防撞父 session、toolUseId 全局唯一+两源同值保幂等、深层父自洽。
6. **重启**：扫 subagents/+meta 为权威重建全树（深层从未持久化）；registry 同 id 收敛、旧 history 读退役（P2-5）；offset 续 tail 不丢不重。
7. **只读**：复用 `observed` flag/caps/只读条；写操作隐禁；paseo-run 可控；同树共存。
8. **watch**：per 活跃根 1 非递归 watcher（平铺目录）；**惰性 attach + 显式 ENOENT guard（seam C）/ 先判存在，禁 watch 缺失目录（P1-3）**；**两级 tail：结构 tail 对所有活跃文件(与打开无关)、timeline 仅打开节点（seam E）**；活跃启；**停时 runtime-gone 递归 drop（修泄漏）/ archive 递归级联**；历史根只扫不 watch。
9. **接口**：公共 API 3 方法 + 复用 agent_state/timeline（单源故无需 epoch-replace，P2-1）+ 仅加 `features.observedSubagentTree`（COMPAT，P2-3）；back-compat 全加性。
10. **能力门**：单点 `selectObservedTreeCapability` 读 `features.*`，旧 daemon→升级提示，不降级/不崩/不假装，无散落分支。
