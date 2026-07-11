# P2 架构评审 · 视角③正确性 / 数据流端到端完整性 / 复用真实性

> 评审对象：`docs/helm/requirements/2026-07-11-conversation-tree/architecture.md`（草拟，未 commit，闸2 待审）
> 评审人：架构专家评审团 成员③（正确性 / 数据流端到端完整性 / 复用真实性）
> 方法：逐字读架构 + 对照同目录 `requirement.md`（41 条验收）/ `ui.html`（sCT1–sCT7）+ **实读**引用的复用底座源码（非仅信任文档转述），把每条验收/每屏态在架构里走一遍，标出断链。只评不改。

---

## Verdict：**打回（不通过），存在阻断级数据流缺口**

发现 **13** 条：**严重 1 条（P0）／高 3 条（P1）／中 4 条（P2）／低 5 条（P3）**。

最核心的问题：架构 §3.3 描述的实时数据流**只订阅了 `agent_update`，完全没有订阅 `workspace_update`**。但协议里"重命名对话"改的是 workspace 的 title、"重命名项目"改的是 project 归属，这两类改动都通过 `workspace_update`（或 `agent_update` upsert 里附带的 `project` 字段，见 #1）广播，不经过 `agent_update` 主通道。旧代码 `render.tsx` 里为此专门订阅了一路 live `workspacesMap`，源码注释直接写着"**反馈: 对话重命名保存后名称不变**"——这是一个真实发生过、已经修过一次的用户反馈 bug。架构把这一路数据源直接漏掉了，等于把这个 bug 原样带回来，而且是重命名这个**验收标准明确要求、核心可见的写路径**，不是边缘场景。hover 卡片核心字段缺数据落点（#2）、离线态计算方式复现 file-tree 自己踩过并写进注释的过期态 bug（#3），都是同一类"文档转述了'已核实复用'但没有把数据契约实际接上"的问题。

建议：先补上 §3.3 的 workspace_update 订阅路径（连带项目归属增量更新、hover 卡片数据源），修正 §3.9 的 panelState 设计使其不把 isOffline 折进 store computed，再进入闸2 复审；其余中低优先级建议一并处理，但不构成阻断。

---

## 验收标准 ↔ 架构落点覆盖表（只列含糊 / 缺失项）

| #       | 验收标准（requirement §6）                                           | 架构声称落点                                             | 状态     | 缺口                                                                                                                                                                                                                                                    |
| ------- | -------------------------------------------------------------------- | -------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12 / 19 | 双击 / 菜单重命名对话、项目内新对话预填工作目录                      | §3.4 写路径表：`commitRename()→client.setWorkspaceTitle` | **缺失** | 提交后树不刷新（见 #1）——写路径本身"发得出去"，但读路径收不到回声                                                                                                                                                                                       |
| 14      | 项目行右键"重命名项目"                                               | §3.4 同上，`client.renameProject`                        | **缺失** | 同 #1，项目改名同样收不到回声                                                                                                                                                                                                                           |
| 2       | 项目→对话(根)→subagent 递归嵌套，新建的对话/项目应正确入组           | §3.3 data flow only `agent_update`                       | **含糊** | `agent_update` upsert 明确带 `project` 字段（架构原文写"upsert 含 project 归属"），但 §3.3 描述的 handler 只做 `Map.set(id, agent)`，从未使用这个字段维护 `store.projects`——新对话若属于一个初始快照时不存在的新项目，会被误分类进"游离对话"组（见 #1） |
| 7       | 状态点五态"至少区分"，与既有活动词汇同源                             | §3.2 五态映射表                                          | **含糊** | `requiresAttention` 无条件盖过 `status`（含 `error`），与协议侧唯一处理过同一输入组合的既有函数 `deriveAgentStateBucket`（needs_input>failed>running>attention）优先级相反，架构未察觉/未讨论这个具体冲突（见 #4）                                      |
| 10      | hover 工作区卡片核心四要素（标题/分支/目录/最近变更）                | §4.2 表："数据取自本模块已拉取的 workspace 快照"         | **缺失** | §2 状态表 / §3.1 类型契约里没有任何字段或 Map 能提供分支/目录/最近变更；旧代码为此专门订阅 live workspace 描述符，注释写"反馈 #48"（见 #2）                                                                                                             |
| 15      | 复制会话 ID（现状语义：provider 原生 session id，无则回退 agent id） | §3.1 `ConversationTreeAgent` 契约                        | **缺失** | 契约没有 `runtimeInfo`/`persistence` 字段，无法取到 provider 原生 session id（见 #5）                                                                                                                                                                   |
| 21      | 从搜索选中候选后"树滚动到该对话并选中"                               | 未提及                                                   | **缺失** | 姊妹模块 file-tree 有现成先例 `scrollSelectedIntoView`，架构组件清单（`tree-row.tsx`/`conversation-tree-panel.tsx`）未提及滚动定位职责（见 #10）                                                                                                        |
| 24      | 选中态准确反映"祖先被移除"等场景下不留悬空引用                       | §3.8 竞态表"一致性清理规则"                              | **含糊** | 清理规则只匹配"被移除 id 精确等于 activeNodeId/focusedRootId"，不处理"被移除的是祖先、当前选中的是其后代"的情形（见 #6）                                                                                                                                |
| 28      | 离线主机点击=原地重连，成功后转在线                                  | §2 表"派发 switch/reconnect/addHost"；§4.A 允许清单      | **含糊** | §4.A 列出的三个 hook（`useHosts`/`useHostRuntimeConnectionStatus`/`useHostMutations`）里没有一个能触发重连；真实可用的 `runProbeCycleNow(serverId)` 不在这份允许清单内、全文未点名（见 #7）                                                             |
| 34      | 离线态：树冻结为断连前最后已知状态，恢复后按最新数据刷新             | §3.9 panelState computed                                 | **含糊** | 设计把 `isOffline` 折进 store 自己的 MobX computed，而这正是 file-tree 源码注释明确记录、并在组件层特意绕开的过期态陷阱（见 #3）                                                                                                                        |
| 6       | 深层嵌套不设人为上限，仍可继续展开操作                               | §3.1 `buildConversationTree`/`flattenTreeRows`           | **含糊** | 建树阶段（`build-tree.ts`）本身无环护栏/深度上限，`maxDepth` 只在 flatten 阶段生效，晚于建树；需求明确要求"无限递归"，把风险边界留在原地而非消除（见 #8）                                                                                               |

---

## 发现清单（严重度降序）

### [P0-严重] #1 数据流只订阅 `agent_update`，遗漏 `workspace_update`：重命名/项目改名/新项目归属提交后树不刷新——复现已修过的旧 bug

- **位置**：架构 §3.3（"端到端数据流：实时流→树增量更新→渲染"，约 L177–195）、§3.4（写路径表，约 L197–205）、§3.1 `ConversationTreeAgent`/`ConversationTreeProject` 类型契约（约 L94–119）。
- **实核证据**：
  - `packages/protocol/src/messages.ts:2901-2914` `AgentUpdateMessageSchema` 只有 `upsert`(agent+project)/`remove` 两种。**重命名走的是** `packages/protocol/src/messages.ts:823-829` `WorkspaceTitleSetRequestSchema`（`workspace.title.set.request`），其结果广播用的是 `messages.ts:3014` 的 `"workspace_update"` **独立事件**（`daemon-client.ts:190-194` `DaemonEvent` 联合类型里 `agent_update` 与 `workspace_update` 是两个不同分支）——不是 `agent_update`。
  - 旧代码 `packages/app/src/conversation-tree/render.tsx:141-143`：
    > "Live workspace descriptors — the sidebar `projects` snapshot revalidates async, so a rename (setWorkspaceTitle) wouldn't surface there for a while; the live store updates immediately (same source the title bar uses). **反馈: 对话重命名保存后名称不变。**"
    > 以及 L185-204 的 `workspaceDisplayById`（"Override with the LIVE descriptor title so a rename reflects instantly（反馈: 保存不生效）"）——这是一条**明确记录过的真实用户反馈 bug** 与它的修复机制：一路对 `workspacesMap`（live、增量更新）的持续订阅。
  - 架构 §3.1 的 `ConversationTreeAgent`/`ConversationTreeProject`/`buildConversationTree(input:{agents, projects})` 签名里**没有**任何等价于旧 `workspaceDisplayById` 的入参或字段；§3.3 唯一的增量订阅只有 `data.onAgentUpdate(handler)`，handler 描述只做 `Map.set(id, agent)`，agent 的 `title` 字段本身不会因为 workspace 改名而改变（workspace 改名不产生新的 `agent_update`）。
  - 项目改名同理：`project.rename.request`（`messages.ts:809-815`）改的是 project，广播机制协议里**没有 `project_update` 事件**（grep 全库确认）；唯一能感知项目归属/名称变化的增量信号是 `agent_update` upsert 自带的 `project: ProjectPlacementPayloadSchema`（`messages.ts:2764-2769`，含 `projectKey`/`projectName`）——但架构 §3.3 的 handler 描述明确只写了 `Map.set(id, agent)`，从未提及用这个字段维护/新增 `store.projects`。架构原文本身承认这个字段存在（"upsert 含 project 归属"），却没有处理它。
- **失败场景**：
  1. 用户双击树上一个对话行改名并回车 → `client.setWorkspaceTitle` 成功 → 树上该行标题**原样不变**，直到下次整店重载（切主机/刷新）才会更新——100% 可复现，不是竞态或小概率场景。
  2. 用户右键重命名一个项目 → `client.renameProject` 成功 → 项目行标题不变，同上。
  3. 用户在一个此前未知的新项目下新建对话（如新建一个 worktree）→ 该对话的 `agent_update` upsert 带着正确的 `project` 字段到达，但由于 handler 不使用它、`store.projects` 从未被增量更新，该对话会被 `build-tree.ts` 误判为"游离对话"，出现在"对话"分组而非其真实所属的"项目"分组下，直到下次整店重载。
- **建议**：§3.3 增补 `data.onWorkspaceUpdate(handler)` 订阅路径（更新一个 workspace 标题/元数据 Map，供标题解析与 hover 卡片共用，见 #2），并在 `agent_update` upsert 的 handler 里使用其 `project` 字段维护/新增 `store.projects` 条目；`ConversationTreeAgent`/`buildConversationTree` 契约相应补上标题解析所需的输入。

---

### [P1-高] #2 hover 工作区卡片"核心四要素"声称已确认，但架构自己的类型契约里没有任何字段能提供——同源于 #1，且复现另一条已修过的 bug

- **位置**：架构 §4.2 表（约 L322 行，"workspace-hover-card.tsx" 一行）："等价重写核心四要素（标题/分支/目录/最近变更，**数据取自本模块已拉取的 workspace 快照**）"；§7"hover 工作区卡片的范围收缩"（约 L407）只承认 diffstat/PR/CI 未核实，未承认核心四要素本身也没有落点。
- **实核证据**：
  - §2 状态表（"关注点→归属"）与 §3.1 类型契约里，唯二两个数据结构是 `ConversationTreeAgent`（id/title/workspaceId/parentAgentId/status/requiresAttention/archivedAt/createdAt）与 `ConversationTreeProject`（projectKey/name/**workspaceIds: string[]** —— 只是 id 数组）。两者都**不含**分支名、目录路径、最近变更时间、diffStat。
  - 协议侧这些字段确实存在（`packages/protocol/src/messages.ts:2851` `WorkspaceDescriptorPayloadSchema` 含 `workspaceDirectory`/`gitRuntime`/`githubRuntime`/`diffStat`/`activityAt`），`data.fetchWorkspaces()` 拿得到——但架构里这份数据只被消费进 `groupWorkspacesIntoProjects`（只取 id 分组），原始描述符本身**没有任何 Map/字段被保留**供 `workspace-hover-card.tsx` 使用。
  - 旧代码 `render.tsx:205-226` 的 `workspaceEntryById` 专门为此建了一个 live Map，注释："Override with a LIVE entry built from the descriptor so the card shows fresh 标题/目录/分支/最后更改时间 —— the projects snapshot lags（**反馈 #48**）"——同样是一条真实记录过的历史 bug 修复，且与 #1 同一份数据源（live workspace 描述符）。
- **失败场景**：即便按架构字面实现，hover 到一个对话行时，卡片组件拿不到分支/目录/最近变更——不是"数据没刷新"，是**根本没有字段可读**，功能直接空着或需要实现者自行绕过契约去别处取数据（进而可能违反 §4 的硬隔离审计）。
- **建议**：与 #1 一并解决——store 增加一个 `workspaceDetails: Map<workspaceId, {directory, branch, lastChangeAt, diffStat, ...}>`（由 `fetchWorkspaces()` 初始快照 + `workspace_update` 增量共同维护），`ConversationTreeProject`/hover 卡片改读这个 Map，而不是笼统写"数据取自已拉取的 workspace 快照"。

---

### [P1-高] #3 `panelState` 把 `isOffline` 折进 store 自己的 MobX computed，复现 file-tree 源码注释明确记录、并在组件层刻意绕开的"过期态"陷阱

- **位置**：架构 §3.9（约 L277–279）。
- **架构原文**：
  > `panelState: "loading" | "empty" | "error" | "offline" | "ready"` 是 computed，优先级 offline > error > loading > empty > ready（**对位 `FileTreeStore.panelState` 的既定优先级法**）。`isOffline` **不是** store 自己的 computed 输入——运行时连接态非 MobX 可观测量，store 算出来会 stale，这是 file-tree 已踩过并记录的教训（§7 复述）；由 `left-region.tsx` 挂载层把 `useHostRuntimeConnectionStatus(serverId)` 的结果作为 React prop 合成进 `getContext().isOffline`，store 侧只读它。
- **实核证据（`FileTreeStore.panelState` 的真实实现与架构描述不符）**：
  - `packages/app/src/shell/file-tree/model/file-tree-store.ts:213` 的 `panelState` 真实签名是 `"loading" | "empty" | "error" | "ready"`——**只有四个分支，不含 offline**。紧邻的源码注释（L210-212）：
    > "The tree-owned panel state (sFT6) by priority: error > loading > empty > ready. **Host offline is composed in the React mount from the live runtime hook; it is not a MobX observable, so reading it here would let computed caching keep the panel stuck in a stale offline state after reconnect.**"
  - 真实的 offline 合成发生在**组件层**、以**纯 JS 三元表达式**完成：`packages/app/src/shell/file-tree/components/file-tree-panel.tsx:53`：`const panelState = isOffline ? "offline" : store.panelState;`——`isOffline` 是组件的 React prop（`useHostRuntimeConnectionStatus` 直接产出，React 原生响应式），从未进入 `store.panelState` 这个 MobX computed 内部。
  - 架构描述的机制则相反：`panelState` computed **自身**声称有五个分支、offline 优先级最高，且通过 `this.deps.getContext().isOffline` 在 computed 内部读取——`getContext()` 是一个纯注入回调（§3.7 `ConversationTreeStoreDeps.getContext: () => ConversationTreeContext`），不是像 `ShellModel.workspaceKey`/`showsShell` 那样由 `setContext()` action 写入的真 observable 字段。若照此实现，`panelState` computed 内部读取的 `isOffline` 大概率**不会被 MobX 追踪为依赖**（因为它来自一个不触碰任何 `@observable` 的普通闭包调用），会精确复现 file-tree 注释里描述的"computed 缓存导致离线态卡死/延迟刷新"问题——即架构转述了正确的教训，但给出的具体机制恰恰是那个教训要避免的做法，且与它自称"对位"的真实实现（四分支+组件层合成）在结构上并不一致。
- **失败场景**：主机断线时，树可能不能可靠地在下一次心跳内进入离线冻结态（继续显示"已过期但看起来正常"的树，操作项未及时置灰）；恢复在线后，也可能不能可靠地立刻退出离线态（除非同时有另一个真正的 observable 变化顺带触发了这个 computed 重算）——这两者都直接对应验收标准 34。是否 100% 复现取决于实现者具体怎么接线 `getContext`，但架构给出的设计描述本身就是反例做法，不是"实现时注意一下"能兜底的，应该在架构层面改正设计（比照 file-tree：`panelState` 只保留四态，offline 在挂载组件层与 `store.panelState` 做纯 JS 合并，不进 computed）。
- **建议**：`ConversationTreeStore.panelState` 改为四态（loading/empty/error/ready，不含 offline），`left-region.tsx`/`conversation-tree-panel.tsx` 在渲染层用 `isOffline ? "offline" : store.panelState` 合成，与 file-tree 的真实做法保持结构一致，而不只是语言上"对位"。

---

### [P1-高] #4 状态点优先级：`requiresAttention` 无条件盖过 `status`（含 `error`），与协议里唯一处理过同一输入组合的既有函数优先级相反

- **位置**：架构 §3.2（约 L163–175）。
- **架构原文**："`requiresAttention === true` **优先于** `status` 判定（idle 态也可能 `requiresAttention`，回合结束等待用户输入正是这种形状）→ `needsAttention`；否则 `running`→`running`……`error`→`error`……"——括号里的例子只举了 `idle+requiresAttention`，没有讨论 `error+requiresAttention` 这个同样真实、同样常见的组合。
- **实核证据**：
  - `packages/server/src/server/agent/agent-manager.ts:3892-3929` `checkAndSetAttention`：agent 从非 error 转入 `status==="error"` 时，**精确地**同时置位 `requiresAttention=true, attentionReason:"error"`（L3920-3929）。也就是说，**几乎每一次 agent 出错，都会在出错的同一瞬间进入"error 且 requiresAttention"这个组合**，直到用户查看该对话触发 `clearAgentAttention`（`packages/app/src/hooks/use-agent-attention-clear.ts`——挂在对话页面，不挂在树上，树本身从不清除 attention）。
  - 协议侧唯一处理过"`status` 与 `requiresAttention` 同时存在时该判谁优先"这个问题的既有函数 `packages/protocol/src/agent-state-bucket.ts:22-36` `deriveAgentStateBucket` 给出的优先级是 `needs_input(0) > failed/error(1) > running(2) > attention(3) > done(4)`——**error 明确排在 attention 之前**。架构引用的另一个"同一先例"`terminal-activity.ts` 的 `TerminalActivityAttentionReason` 只有 `"finished"|"needs_input"` 两种，**根本不存在"error"这个 attention 原因**，所以它并不构成"error vs attention 该谁赢"这个问题的先例——架构 §3.2 拿它做支撑并不成立。
  - 也就是说，真正有过这个具体决策的既有代码（`deriveAgentStateBucket`）选择了与本架构相反的优先级。
- **失败场景**：一个正在运行的 subagent 出错 → 立刻同时具备 `status="error"` 与 `requiresAttention=true, attentionReason:"error"` → 按架构映射规则，树上显示的是**琥珀色"需关注"**而非**红色"出错"**，直到用户点开它（清 attention）后才会显出红点。此时若用户在几十个 agent 里巡视，试图靠颜色快速分辨"哪些卡在等我输入"和"哪些真的坏了"，两者视觉上完全一样，与验收标准 7"至少区分五态"的可辨识意图相悖，也与需求 §1"谁出错、谁需要我"的产品诉求部分冲突。
- **建议**：这不一定是错误决策（"需要你看"作为最高优先级信号也是合理产品选择），但架构应该**明确讨论并裁决**这个具体冲突（`attentionReason==="error"` 时到底显红还是显琥珀），而不是只用一个 idle 的例子带过、并且误用一个不适用的先例（terminal-activity）来支撑"这是延续既有做法"的结论。若维持现设计，至少应在文档里承认这是**对现有 `deriveAgentStateBucket` 优先级的有意偏离**，而不是"复用同一套词汇体系"的自然结果。

---

### [P2-中] #5 "复制会话 ID"依赖的 `runtimeInfo.sessionId`/`persistence.sessionId` 不在 `ConversationTreeAgent` 契约里

- **位置**：架构 §3.1 `ConversationTreeAgent`（约 L94–103）；§4.A 只写"`expo-clipboard`：复制会话 ID / 复制路径"（约 L336），未交代数据来源。
- **实核证据**：旧代码 `packages/app/src/conversation-tree/use-conversation-row-actions.ts:104-109`：
  ```ts
  const onCopyConversationId = useCallback(() => {
    const agent = useSessionStore.getState().sessions[serverId]?.agents.get(agentId);
    const sessionId = agent?.runtimeInfo?.sessionId ?? agent?.persistence?.sessionId ?? agentId;
    ...
  ```
  依赖 `runtimeInfo`/`persistence` 两个字段（协议 `AgentSnapshotPayloadSchema` 里确实有，`messages.ts:692-693`）。架构 §3.1 的 `ConversationTreeAgent` 只有 8 个字段，两者都不在其中。
- **失败场景**：不是崩溃级问题（`agentId` 兜底始终可用，满足验收标准 15 字面要求"始终可用"），但会**静默降级**为永远复制 `agentId`、丢失"provider 原生 session id"这个现状语义（两份文档的 ui.html 注解都写明是"复制 provider 原生 session id，无则回退 agent id"）——属于对"忠实还原基线"承诺的一处未声明的偏离。
- **建议**：`ConversationTreeAgent` 补 `runtimeInfo`/`persistence`（或至少一个派生的 `sessionId` 字段），或者在架构里明确写清楚"本轮有意简化为始终复制 agentId"并请董事长过目这个范围收缩。

---

### [P2-中] #6 `activeNodeId` 一致性清理规则只匹配"精确等于被移除 id"，不处理"祖先被移除、当前选中的是其后代"

- **位置**：架构 §3.8 竞态表第二行（约 L272）。
- **架构原文**："若被移除的 id 等于 `editing.targetId`，`cancelEdit()`；若等于 `activeNodeId`，清 `activeNodeId`；若等于 `focusedRootId`，清 `focusedRootId`……本模块只负责不留悬空引用。"
- **逻辑推演（对照 §3.3/§3.6 已定义的机制）**：
  1. 用户点击根对话 R 下的 subagent S（`activateNode(S)`）→ 按 §3.6，`activeNodeId=S`，`focusedRootId` 保持指向 R（不变）。
  2. 远端把 R 归档/关闭 → `agent_update` remove 分支只删除 `agents.delete(R)`，**不触碰 S 的 Map 条目**（S 自己没有被归档）。
  3. 清理规则检查"被移除的 id"（= R）是否等于 `activeNodeId`（= S）——不相等，`activeNodeId` **不会被清空**。
  4. 但 `build-tree.ts` 的递归建树从 `parentAgentId===null` 的 roots 出发，R 已从 `agents` Map 消失，S 虽然还在 Map 里，却再也没有任何一条从 root 出发、途经存活祖先链的路径能到达它——**S 从渲染出的树里彻底消失**，`activeNodeId` 却仍然指向它。
- **失败场景**：今天的直接影响很小（`activeNodeId` 目前只驱动 `isRowSelected` 这一处纯派生，行既然不渲染就没有可见异常），但：(a) 这与文档自己声称的"不留悬空引用"这一具体断言不符，`§6` 计划的单测描述（"被移除节点若正是 editing/activeNodeId/focusedRootId"）同样只覆盖"精确匹配"这一种情形，这个盲区不会被计划中的测试捕获；(b) §3.5 明确写了"将来切换点"——一旦 `openRightPanel` 升级为 `openConversationTab({agentId, ...})`，`activeNodeId` 这类悬空 id 就可能被传入未来的右栏开 tab 逻辑，从"无影响"变成"真实错误"。
- **建议**：清理规则改为"被移除 id 等于 activeNodeId，**或** activeNodeId 已不在重新计算出的树中可达"，而不是只做精确 id 比对；§6 测试用例相应补一条"祖先被归档、子孙节点原为 activeNodeId"的场景。

---

### [P2-中] #7 离线主机"原地重连"没有点名任何一个真实存在的调用点，且真正可用的方法不在 §4.A 允许清单内

- **位置**：架构 §1 模块表（约 L31）、§2 状态表（约 L77，"派发 switch/reconnect/addHost"）、§4.A 允许清单（约 L339）。全文对"重连"机制的着墨仅此两处，均未点名具体方法。
- **实核证据**：
  - `packages/app/src/runtime/host-runtime.ts:2182-2211` `HostMutations` 接口（架构 §4.A 明确列为允许直连的三个 hook 之一）只有 `upsertDirectConnection`/`probeAndUpsertDirectConnection`/`upsertRelayConnection`/`upsertConnectionFromOffer(Url)`/`renameHost`/`removeHost`/`removeConnection`——**没有任何"重连一个已配置、当前离线的主机"的方法**。
  - 当前真实的 `packages/app/src/components/sidebar/host-switcher-pill.tsx:80-83` `handleSelectHost` 对**所有**主机行（不分在线/离线）统一走 `router.navigate(buildHostRootRoute(serverId))`——这正是需求 §8 开放问题①里说的"现状离线主机行点击与在线行一样直接尝试切换"的真实代码证据，但也说明"点击触发独立重连（不切换）"这个新行为在现状代码里**没有先例可抄**，是真正意义上的新写逻辑，架构却把它写得和其它"复用现状"的条目一样轻描淡写。
  - 真正可能承载"对指定 serverId 立即触发一次重连尝试"的方法是 `packages/app/src/runtime/host-runtime.ts:1962-1968` `HostRuntimeStore.runProbeCycleNow(serverId?: string)`（内部有探测/退避机制，`probeIntervalForConnection` 附近可见完整的 backoff 逻辑）——这个方法**存在且大概率就是答案**，但它挂在 `getHostRuntimeStore()` 这个底层单例上，不在架构 §4.A 列出的三个"允许直连"hook 里，全文没有一处点名它或任何等价方案。
- **失败场景**：不是不能实现（真实方法存在），而是架构没有把"点了之后到底调用什么"钉死——按 §4.A 的判据（"对 shell/host-switcher/** 跑一次依赖检查，应零命中除允许清单外的 import"），实现者要么发现 `useHostMutations()` 没有对应能力后被迫扩大允许清单（未登记的变更），要么绕开 §4.A 直接 import `getHostRuntimeStore()`（形式上仍在"允许清单"里因为它是 `@/runtime/host-runtime` 的导出，但文档没有说清楚这属于被允许的部分）。这恰恰是本次需求里**唯一一处闸1明确批准的、非"现状照搬"的行为修正\*\*（其余写路径都是"读源码确认现状已有"），最需要把机制钉死的地方，反而是文档里论证最单薄的一处，与 §3.4 对话树写路径"每个动作精确映射到一个具名 RPC/方法"的严谨度形成明显反差。
- **建议**：§4.A 明确把 `runProbeCycleNow`（或封装后的等价方法）列入允许清单，并在类似 §3.4 的写路径表里补一行"离线重连"，写清楚调用哪个具名方法、是否重置 backoff 计时。

---

### [P3-低] #8 `build-tree.ts` 递归建树本身无环 / 深度护栏，`maxDepth` 只在渲染阶段生效——继承自旧代码，但需求明确要求"无限递归"，风险边界没有被消除

- **位置**：架构 §3.1 `buildConversationTree`/`flattenTreeRows` 签名（约 L134–145）。
- **实核证据**：`packages/app/src/conversation-tree/select.ts:122-151` `buildAgentNode` 的递归（`buildConversationTree` 等价重写的对象）没有任何深度计数器或"已访问集合"防环——如果 `parentAgentId` 链路因为数据问题出现环（服务端数据损坏）或极端深度，会在**建树阶段**（早于 `flatten-rows.ts` 的 `maxDepth` 生效点）无限递归或产生极深调用栈。这是旧代码就有的形状，不是本架构新引入的回归，但：(a) 需求 §2.A"递归、**不设人为层数上限**"（验收标准 2）是明文产品要求，不能靠"设一个小 maxDepth 常量兜底"这种方式规避，风险因此是结构性的、长期存在的；(b) 架构全文没有一处讨论这个场景，§6 测试计划里"≥5 层验证不设上限"也只验证了"正常深链路能展开"，没有反向验证"异常输入不会拖垮建树"。
- **失败场景**：一旦服务端因为某个 bug 产生了 `parentAgentId` 自环或双向指向（理论上可能，例如并发写导致的数据竞争），客户端树构建会直接死循环/栈溢出，整个左栏（进而可能整个页面，取决于是否发生在渲染线程）卡死，且没有任何降级路径——这是"唯一导航起点"（需求 §1 原话）挂掉的最坏情形。
- **建议**：`build-tree.ts` 递归加一个访问集合（`Set<agentId>`）防环，或至少一个远高于实际使用场景的硬上限（如 500）并在命中时截断+记录，而不是无条件信任 `parentAgentId` 链路的拓扑合法性。

---

### [P3-低] #9 高频 `agent_update` 场景下 `build-tree.ts` 的全量重算成本未做任何评估

- **位置**：架构 §7"大树虚拟化"（约 L403）。
- **说明**：该节只讨论了**渲染**层的虚拟化（`FlatList`，经核实 `packages/app/src/shell/file-tree/components/file-tree-panel.tsx:4,143` 确实使用），但 `tree` computed 依赖的是 `store.agents`（一个 MobX observable Map），任何单个 `agent_update`（哪怕只改了一个叶子 subagent 的状态点）都会让 `panelState`/`tree`/`visibleRows` 这一串 computed 因为 Map 内容变化而整体失效重算——`build-tree.ts`/`flatten-rows.ts` 都是"整表重扫"的纯函数（过滤+建 Map+分组+递归+排序），没有增量 diff。对"几百个 agent、其中若干正在跑（高频状态推送）"这一需求 §1 明确写出的产品场景，架构完全没有评估这个重算频率/量级是否可接受，也没有讨论节流/去抖。
- **说明（非新回归）**：这与旧代码同构（`select.ts` 同样是整表重扫函数），不是本架构引入的新问题，本轮量级评估的缺失更多是"该补一句结论"而非"设计错误"。
- **建议**：在 §7 补一句量级判断（比如"单次重算 O(几百) 级别的过滤/排序，现代设备下可忽略，暂不需要节流"），或者如果不确定，标注为需要 `helm-developer` 实现后用真实数据量做一次简单 profiling 的验证点——不留空白。

---

### [P3-低] #10 搜索选中候选后"树自动滚动到该对话"在架构里没有职责落点

- **位置**：需求 §3 流程"搜索"一节（"选中一项 → 关闭搜索、**树滚动到该对话并选中**"）与验收标准 21；架构 §1.1 组件清单 `tree-row.tsx`/`conversation-tree-panel.tsx` 均未提及。
- **实核证据**：姊妹模块已有现成先例 `packages/app/src/shell/file-tree/components/file-tree-panel.tsx:109,174` `scrollSelectedIntoView`（含"revealed row past virtualization window"的近似滚动处理）。架构全文没有引用这个函数或讨论等价机制，`FlatList` 虚拟化本身也让"滚动到一个可能尚未测量高度的行"不是零成本的事（file-tree 的注释也说明了这点："A revealed row past the virtualization window isn't measured yet — approximate-scroll near it…"）。
- **建议**：`conversation-tree-panel.tsx` 补一条"响应 `focusedRootId`/`activeNodeId` 变化时滚动定位"的职责，可直接援引 file-tree 的 `scrollSelectedIntoView` 做法。

---

### [P3-低] #11 主机切换"①连接中过场→②整工作区重载"两段式动画，机制上如何产生未讲清

- **位置**：架构 §7"主机切换重载边界"（约 L405）："切换主机触发 ConversationTreeStore/HostSwitcher 相关数据全量重建……不需要额外的'切换中'状态机。"
- **说明**：ui.html sCT5 明确画了两个**先后独立**的过场：①"连接 XX 主机…"（此时旧主机的窗口/数据大概率还在，只是叠了一个连接中提示）；②"重载工作区…"（这时已经导航到新 serverId，各区域走各自的 loading 骨架）。架构给出的机制是"`router.navigate` → `[serverId]` 换值 → 各区域各自 `useMemo` 重建 → 天然进入各自的 loading"——这个机制能自然产生阶段②，但阶段①（导航发生**之前**、留在旧主机画面上的"连接中"提示）由谁负责、什么时候触发导航，架构没有交代（是 `HostSwitcher` 组件在调用 `router.navigate` 前自己先等一次 `runProbeCycleNow`/连接确认？还是直接导航、把"连接中"也并入阶段②的骨架态？）。两种做法用户观感不同，验收标准 27 字面上只要求"经过切换中过场后重载"，不算硬性阻断，但容易在实现时产生和设计稿不一致的效果。
- **建议**：§3.4 或 §7 补一句选择："胶囊点击在线主机行 → 直接 `router.navigate`（阶段①/②合并成同一个 loading 骨架，不单独实现连接中动画）"或者反过来明确要先等连接确认再跳转——二选一写清楚，不要让实现者自己猜。

---

### [P3-低] #12 错误态"重试"具体调用的 store 方法未点名

- **位置**：架构 §2 状态表"面板级态"行（约 L79）、§3.9。验收标准 33。
- **说明**：`store.load()` 只在 §3.3 初始加载流程里出现过一次，架构没有明确"点击重试"是否就是再调一次 `store.load()`，还是有独立的 `retry()` action（比如需要区分"首次加载失败"与"切主机加载失败"两种上下文）。影响很小（几乎可以肯定就是复用 `load()`），但既然 §3.4 对其它写路径都给了精确到方法名的映射，这里也应该同等对待。
- **建议**：§3.9 补一句"错误态'重试' = 重新调用 `store.load()`"。

---

## 复用点核真结果

逐项对照架构 §0/§4 引用的"已 Read 核对"复用底座，实际重读源码后的结论：

| 架构声称的复用点                                                                                                                   | 核真结果                                      | 备注                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_update` upsert/remove 的 shape（§3.3）                                                                                      | ✅ 属实                                       | `messages.ts:2901-2914`，discriminatedUnion 精确匹配架构描述                                                                                        |
| `AgentLifecycleStatus`/`requiresAttention`/`archivedAt` 字段来自协议（§3.1/3.2）                                                   | ✅ 属实                                       | `agent-lifecycle.ts`、`messages.ts:675-709` 逐字段核对一致                                                                                          |
| `parentAgentId` 解自 `labels["paseo.parent-agent-id"]`（§3.1）                                                                     | ✅ 属实                                       | `agent-labels.ts` 精确匹配                                                                                                                          |
| 旧 `select.ts` 的 `buildConversationTree`/`flattenConversationTreeRows`/`partitionPinnedNodes` 算法（分组/递归/排序/去重）（§4.2） | ✅ 属实                                       | 逐行核对 `select.ts:43-279`，架构对算法的转述准确；**唯一遗漏**是旧函数的第三个入参 `workspaceDisplayById`（见 #1），架构的新签名把它丢了           |
| 旧 `select.ts` 只过滤 `archivedAt`，新 `build-tree.ts` 需多过滤 `status==="closed"`（§4.1 行为升级说明）                           | ✅ 属实                                       | 核对 `select.ts:44`，旧代码确实只有 `!agent.archivedAt` 一个条件                                                                                    |
| ⌘K 现状搜索只匹配标题+目录、不含消息内容（§4.2"旧依赖澄清"）                                                                       | ✅ 属实，且这是本次核真里**做得最扎实**的一处 | `use-command-center.ts:30-36` `isMatch` 逐字核对，架构的引用行号精确到具体函数                                                                      |
| `commandCenterOpen`/`setCommandCenterOpen`（§4.C 宿主注入点）                                                                      | ✅ 属实                                       | `keyboard-shortcuts-store.ts` 确认存在                                                                                                              |
| `ShellModel.openRight()`（§3.5/§4.A）                                                                                              | ✅ 属实                                       | `shell-model.ts:222-224`；`right-tab-bridge.wiring.ts:19` 确认同一方法已被姊妹模块以同样方式调用，先例成立                                          |
| `OpenTabRequest.kind` 目前单一字面量 `"file"`，`TAB_KIND_POLICY.conversation.enabled===false`（§3.5）                              | ✅ 属实                                       | `tab-content.ts:25-33`、`tab-kind-policy.test.ts:16` 精确核对                                                                                       |
| `home.tsx` 的 `workspaceKey` 硬编码占位 `${serverId}:__home__`（§3.5）                                                             | ✅ 属实，行为原文一字不差                     | 核对 `home.tsx` 源码注释与实现                                                                                                                      |
| `shell-root.tsx:75` 的左区 `RegionPlaceholder`（§0 引用）                                                                          | ✅ 属实，行号精确                             | 逐行核对                                                                                                                                            |
| `use-project-row-actions.ts` 的"创建工作树"是纯 `router.navigate`、无 RPC（§3.4）                                                  | ✅ 属实                                       | 核对 `use-project-row-actions.ts:76-84`                                                                                                             |
| `hasWorkspace`/`canReveal`/`canOpenInNewWindow`/`canCreateWorktree` 现状条件（§4.2/§6 测试点）                                     | ✅ 属实                                       | 核对 `use-conversation-row-actions.ts`/`project-action-availability.ts`，条件表达式与架构转述一致                                                   |
| file-tree 的"组合根读老 session-store/host-runtime 取 client"先例（§0/§4.2）、`FlatList` 虚拟化先例（§7）                          | ✅ 属实                                       | `2026-06-30-file-tree/architecture.md §9`、`file-tree-panel.tsx:4,143` 确认                                                                         |
| `FileTreeStore.panelState` 的"既定优先级法"可直接对位（§3.9）                                                                      | ❌ **不属实**                                 | 见发现 #3——真实实现是四态 + 组件层合成 offline，不是五态单一 computed；架构的"对位"论证与被引用对象的真实结构不符                                   |
| "workspace-hover-card 核心四要素…数据取自本模块已拉取的 workspace 快照"（§4.2）                                                    | ❌ **不属实**                                 | 见发现 #2——契约里没有任何字段/Map 能提供这四要素中的三项（分支/目录/最近变更）                                                                      |
| 主机切换器"完整闭环、能力本身原样复用"（需求 §2.H/§8③，架构 §1/§2 呼应）                                                           | ⚠️ **部分不实**                               | "切换"部分复用属实（`router.navigate` 现状机制），但"离线重连"是需求里唯一的非现状新行为，架构没有给出真实可核的实现落点（见 #7），不能算"原样复用" |
| "复制会话 ID"的数据来源（隐含在 §3.4/§4.A，未显式声称但实际需要）                                                                  | ❌ **不属实**                                 | 见发现 #5                                                                                                                                           |

**核真结论**：架构作者确有大量"真读源码"的扎实工作（⌘K 匹配逻辑、`shell-root.tsx:75`、`OpenTabRequest` 现状、`workspaceKey` 占位串等多处行号级精确核对，明显不是凭空转述），这提高了文档整体可信度；但**唯独"树内容如何随后台变化保持新鲜"这条主线（workspace_update 订阅、hover 卡片数据源、offline computed 设计）存在系统性遗漏**，且遗漏的三处刚好互相印证（同一份缺失的 live workspace 数据源），不是三个孤立的小问题，是一类问题。建议 gate-2 复审前优先补齐 §3.3 的数据流设计。
