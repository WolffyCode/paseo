# 评审 · P2 架构 · 面向对象设计 / 高内聚低耦合 / 领域建模质量

> **评审人视角**：架构专家评审团 成员① —— OOP 设计 / 高内聚低耦合 / 领域建模质量
> **日期**：2026-07-11
> **评审对象**：`docs/helm/requirements/2026-07-11-conversation-tree/architecture.md`（未 commit，工作区草稿，411 行）
> **评审基准**：`docs/helm/requirements/2026-07-11-conversation-tree/{requirement.md, ui.html}`（契约）+ `docs/helm/requirements/2026-07-07-right-sidebar/architecture.md`（先例基准）+ 底座代码 `shell/model/shell-model.ts`、`shell/file-tree/model/file-tree-store.ts`、`shell/right-panel/model/{workbench-model,tab-content}.ts`、`shell/file-tree/model/file-tree-public.ts`、`shell/components/{file-tree-region,right-panel-region,shell-root}.tsx`、`runtime/host-runtime.ts`、`components/sidebar/host-switcher-{model,pill}.tsx`、`conversation-tree/*`（旧）、`hooks/use-command-center.ts`、`stores/keyboard-shortcuts-store.ts`
> **Verdict：需大改**（有边界——见下方"范围说明"；不是推倒重来，是"host-switcher/ 模型层需要真正补一版设计" + "conversation-tree/ 内 3 处阻断级具体缺陷需要修"）

## 范围说明（避免"需大改"被误读）

`conversation-tree/` 子模块本体的设计扎实：MobX 类 + 9 个纯函数的切法逐一核对无 YAGNI 空函数、无单行透传；`conversation-tree/` 与 `host-switcher/` 两个模块之间零数据耦合是真实的高内聚低耦合，不是贴标签式的伪聚合。**"需大改"的判断主要来自**：① `host-switcher/` 作为文档承诺的两个平级模块之一，其模型层设计事实上缺席（详见 B1）；② 3 处阻断级具体缺陷（B1–B3）分布在"新行为的状态归属"这一类问题上，不是措辞问题，是发给 helm-developer 会直接卡住或埋雷的空白点。conversation-tree/ 的树形/菜单/置顶纯函数层不需要重做。

---

## 发现清单（按严重度排序）

### 阻断

#### B1. `host-switcher/` 没有真正的模型层设计，"离线重连"这一本轮唯一的新行为的状态归属完全未定义

**位置**：§0 line 11（"本需求新增的 ConversationTreeStore 与 HostSwitcher 模型层照此范式，不发明新风格"）；§1 line 31（host-switcher/ 模块表行）；§2 line 77（"主机连接态/切换/重连"表格行）；§4.C line 351（onAddHost 表格行）。**全文没有 §1.1 那样的 host-switcher/ 内部文件表，没有类似 `ConversationTreeStoreDeps` 的 Deps 接口，没有任何字段/方法清单。**

**问题**：§0 明确断言 host-switcher 的模型层"照此范式"——即和 `ConversationTreeStore` 一样是一个持状态+转移的 MobX 类。但通读全文，host-switcher/ 唯一具体点名的"模型层"产物是 `model/connection-tone.ts`——我读了这个文件的现状等价物 `components/sidebar/host-switcher-model.ts`，确认它是一个 24 行的纯函数（`selectHostConnectionTone`），**不持有任何状态**。除此之外 §4.C 只给了 host-switcher UI 组件一个 `onAddHost: () => void` prop 的绑定描述。**"显示当前主机/连接态、切主机、发起离线重连、添加主机入口"这四项职责（§1 line 31）里，只有"添加主机"和"显示"有落点，"切主机"和"发起离线重连"的状态机完全没有设计**：

- "点击一台离线主机行 → 不直接切换,原地发起重连尝试(退避重试);成功后可再次点击真正切换"（requirement.md §2.H / §8 开放问题①，董事长闸1已确认是**相对现状的行为修正**）——我读了现状 `host-switcher-pill.tsx` 的 `handleSelectHost`，确认现状对任何 host 行点击（不分在线/离线）都是无条件 `router.navigate(buildHostRootRoute(serverId))`，**没有分支**。这意味着"重连中/重连失败"这个新状态从零设计，但architecture.md 里连"这个状态放在哪个对象上"都没说——是每行一个局部 `useState`？还是要在某处新增一个 `reconnectingServerIds: Set<string>` 这样的集合态（如果是，它属于谁：`HostSwitcher` 有名无实的"模型层"，还是干脆是 host-runtime 已有基础设施的一部分）？
- 我读了 `runtime/host-runtime.ts`（`HostRuntimeController`/`HostRuntimeStore`，>2200 行），确认已有一套自动探测退避机制（`PROBE_TICK_MS`/`PROBE_MAX_BACKOFF_MS`/`runProbeCycleNow()` 等），**但架构文档从未指出"点击离线行"具体调用这套机制里的哪个方法**，也没说清是否需要在 host-runtime 层新增一个"针对单台 host 立即触发一次探测"的入口。这正是评审被要求专门核对的"主机切换器…的注入端口"，但文档没有给出可核对的端口设计。

**违反原则**：standards.md 对 P2 架构的最低要求是"写 HOW 的边界"——host-switcher/ 作为文档自己列出的两个一级模块之一，其最具产品显著性的新行为（董事长闸1特别确认过的行为修正）在 HOW 层面是空白。这不是"细节留给开发"，是"整个模型层的存在与否都没确定"。

**建议**：比照 §1.1 给 conversation-tree/ 做的深度，为 host-switcher/ 单独补一节，至少回答：(a) 是否需要一个持状态的类，还是纯 hooks 组件已经够用——如果是后者，§0"HostSwitcher 模型层照此范式"这句需要改写，不能笼统宣称走 MobX 类范式却拿不出一个类；(b)"发起离线重连"具体调用 host-runtime 现有的哪个方法、重试中/失败状态放在哪个对象上展示、退避参数是复用 host-runtime 已有的 `PROBE_*` 常量还是要新增。

---

#### B2. `ConversationTreeStore` 的实时订阅在切主机时没有显式取消订阅机制，与代码库已确立的挂载点惯例矛盾，会在每次切主机后泄漏监听器

**位置**：§3.3 line 187（"data.onAgentUpdate(handler) 订阅"）；§3.8 line 275（"切主机…`[serverId]` 换值 → `useMemo` 重新 `createConversationTreeStoreForServer`…旧 store 实例连同其 in-flight 状态一并被丢弃卸载"）。

**问题**：`ConversationTreeStore` 是这个 MobX 类家族里**第一个持有真正推送订阅**（`data.onAgentUpdate`）的成员——`FileTreeStore` 和 `WorkbenchModel` 都没有这种常驻订阅，都是请求/响应式 IO，所以"先例"在这一点上根本没有可比对象。文档给出的唯一生命周期机制是"`useMemo` 换 key 重新构造"，并断言旧实例"被丢弃卸载"。但 `useMemo` 单独换 key **不会自动调用任何清理函数**——旧的 `data.onAgentUpdate(handler)` 订阅如果没有显式 unsubscribe，会在旧 store 已经"被丢弃"之后继续存活并触发（闭包持有 handler 引用），每次切主机泄漏一个监听器。

我核对了本仓库同级的两个挂载点（`shell/components/file-tree-region.tsx`、`shell/components/right-panel-region.tsx`），两者对任何需要跨渲染清理的动作，一致采用"`useMemo` 只管构造对象，另配一个 `useEffect(() => registerXxx(...), [deps])` 来注册+清理"的模式（例如 `useEffect(() => registerFileTreeAccess(...), [serverId, workspaceId, store])`）——这是本代码库对"有生命周期含义的副作用"的既定惯例。`left-region.tsx`（本需求新挂载点）如果只依 §3.8 描述的"`useMemo` 重新构造"来处理 store 切换，就是这个已确立惯例里唯一被跳过 `useEffect`+清理配对的一处，而且恰好是唯一一个真正需要清理（取消订阅）的场景。

**违反原则**：对象生命周期管理不完整——资源获取（订阅）没有对应的资源释放（取消订阅）设计，是高内聚设计里"类的构造与析构应该配对"的基本要求；也和 §0 强调的"类只持状态+转移"精神冲突——如果状态的取得依赖一个订阅，转移里就该包含"停止这个订阅"这个转移。

**建议**：给 `ConversationTreeStore` 补一个 `dispose(): void`（内部调用 `data.onAgentUpdate` 返回的 unsubscribe），并在 §3.3/§3.8 明确挂载点必须是 `useEffect(() => { const store = createConversationTreeStoreForServer(serverId); return () => store.dispose(); }, [serverId])` 这种显式配对写法，而不是让 `useMemo` 单独承担生命周期语义。

---

#### B3. `deps.navigate(...)` 的实参未定义，却断言"no-op-safe"，而其生产绑定是真实的 `expo-router` `router.navigate`——点击根对话（验收标准 22 的核心交互）有实际触发错误导航的风险

**位置**：§3.6 line 239（"kind === 'conversation'…调 `deps.navigate(...)`(占位导航，§3.5 已说明当前无真实路由消费方，此调用当前是 no-op-safe 的前瞻缝，不阻塞验收)"）；§3.7 line 250（"navigate: (route: string) => void; // expo-router 的 router.navigate，注入以隔离测试"）。

**问题**：这是全文**唯一一处**用省略号代替具体值的方法调用（`deps.navigate(...)`），出现在一份对其它一切函数签名、字段类型、映射表都精确到字符的文档里，本身就是异常信号。更关键的是：§3.7 明确说这个 deps 字段在生产环境绑定的是**真实的** `expo-router` `router.navigate`——不是一个占位/桩函数。`router.navigate` 是一个有真实副作用的系统级 API：给它传一个不对应任何已注册路由的字符串，行为取决于 expo-router 版本，可能是无操作、可能是抛错、也可能真的把当前页面导航掉（例如落到 404 页或错误边界）。文档在 §3.5 已经自己承认"新壳当前没有真实的按对话路由"，即**这个调用此刻找不到任何合法的目标路由字符串可传**——但 §3.6 仍然把"调用它"写进本轮 `activateNode` 的行为清单，并断言这个调用"no-op-safe"，却从未证明或说明凭什么安全。如果 helm-developer 照字面实现，每次点击一个根对话（对应验收标准 22，这是全需求最核心的交互之一）都会真实调用 `router.navigate` 并传入一个未定义/临时拼凑的字符串，存在把用户导航到错误页面的真实回归风险。

**违反原则**：这不是"选择不实现"的问题（那样反而是诚实的、文档里其它多处都在做的事，例如 §3.5 明确说"承接侧…尚未接线"），而是"在没有已知安全实参的情况下,仍然调用一个绑定了真实副作用 API 的端口,并声称结果安全"——断言未经证明。

**建议**：二选一，不要用"no-op-safe"带过：(a) 把 `deps.navigate` 的实参公式写清楚并证明它是幂等/无害的（例如传入当前不变的 workspaceKey），或者 (b) 明确本轮 `activateNode` 的 conversation 分支**不调用** `deps.navigate`（该 deps 字段只声明、留给未来 conversation-page 落地时再接线），把"占位缝"和"占位缝的当前调用状态"分开说清楚。

---

### 重要

#### I1. `openSearch` 端口的绑定路径在文档内部自相矛盾——一半说是 store Deps 字段，一半说是绕过 store 的组件 prop

**位置**：§3.7 line 255（`readonly openSearch: () => void; // 宿主注入点，见 §4.C`，作为 `ConversationTreeStoreDeps` 字段）；§4.C line 350（"`tree-toolbar.tsx` 的『搜索』行只暴露 `onOpenSearch: () => void` prop（模块内零 import 旧 store）；在 `left-region.tsx`…绑定"）。

**问题**：这是同一个功能（点击顶部"搜索"唤出 ⌘K）的两条不同接线描述。§3.7 把它列进 `ConversationTreeStoreDeps`，暗示的路径是"`tree-toolbar.tsx` 调用 store 上某个方法 → store 内部调 `deps.openSearch()`"；§4.C 却说 `tree-toolbar.tsx` 自己有一个独立于 store 的 `onOpenSearch` prop，直接从 `left-region.tsx` 逐层下钻传入，**完全不经过 store**。这两条路径本质不同：前者让"搜索"这个交互和置顶/重命名一样统一走 store 的意图方法+注入端口；后者让它成为一条平行于 store 的、纯 UI props 传递通道。对比 host-switcher 的 `onAddHost`（全文只描述成组件 prop，没有对应的 Deps 字段）——同一份文档对结构相同的"挂起旧组件树"类宿主注入点，一个给了两条并存的线，一个只给了一条，且没有解释为什么不一致。

**违反原则**：端口设计的"缝画得干净"首先要求同一个端口只有一条权威路径；两条描述并存会让实现者无所适从，实际落地时大概率会出现"Deps 字段声明了但从未被调用"的死字段。

**建议**：二选一并让 §3.7 与 §4.C 保持一致：要么 `openSearch` 走 store（`tree-toolbar.tsx` 调用 store 暴露的同名方法，store 内部调 `deps.openSearch()`），要么走纯组件 prop（此时从 `ConversationTreeStoreDeps` 里删掉这一行，与 `onAddHost` 保持同一模式）。

---

#### I2. `agent_update` 的增量应用与竞态清理是非平凡策略逻辑，却未委托给纯函数，直接违反文档自己在 §0 定下的"类只持状态+转移，派生/策略一律委托纯函数"原则

**位置**：§0 line 11（"类只持状态 + 转移，每处派生/策略委托给同目录的纯函数模块"）；§3.3 line 187-191（upsert/remove 分支判定：过滤 `closed`/`archivedAt`、命中过滤条件转 remove 分支）；§3.8 line 272（"一致性清理规则"：被移除节点 id 命中 `editing`/`activeNodeId`/`focusedRootId` 三者之一时的清空规则，"三条判定在同一个 action 内做完"）。

**问题**：§1.1 给出的 9 个纯函数文件（`build-tree`/`flatten-rows`/`partition-pinned`/`group-projects`/`status-dot`/`project-menu`/`conversation-menu`/`pin-state`/`rename-state`）我逐个核对过，都不是单行透传，都有真实分支逻辑，符合"策略委托给纯函数"的自我要求。**但 §3.3/§3.8 描述的另外两处策略——"一条 agent_update 该 upsert 还是判定为 remove"、"移除后哪些字段要连带清空"——是同等复杂度（甚至 §3.8 的三字段联动清空比 `status-dot.ts` 的五分支映射更复杂）的决策逻辑，却完全没有对应的纯函数文件，直接以 store 内部方法体的方式描述**。§6 测试策略也印证了这一点：这部分逻辑只出现在"必测的模型逻辑（注入 fake deps）"里，作为要通过整个 store + fake deps 才能验证的行为，而不是像其它 9 个纯函数那样可以"不挂载任何东西、传参数、断言返回值"式独立单测。

**违反原则**：这正是评审被要求专门核对的"树模型类会不会 god object"的具体落点——不是说这个类因为大就是 god object（`FileTreeStore` 本身也有 1100+ 行，是同一体系下公认的先例），而是这个类开始吸收本该被委托出去的**策略判定**，而文档自己的设计原则（§0）明确说这类判定不该留在类里。

**建议**：比照 `build-tree.ts` 的先例，新增一个纯函数（如 `model/apply-agent-update.ts`），签名类似 `applyAgentUpdate(input: {agents, projects, editingTargetId, activeNodeId, focusedRootId}, event) → {nextAgents, nextProjects, clearEditing, clearActive, clearFocused}`，store 的 handler 只做"调用这个函数 + `runInAction` 写回"，让 §3.3/§3.8 描述的策略可以独立单测，不必经过 fake deps + 整个 store。

---

#### I3. 重命名/移除项目等 RPC 写路径完全未设计失败反馈通道；`ConversationTreeStoreDeps` 没有错误呈现端口，而这是旧代码已验证过的真实需求

**位置**：§3.4 line 201-203（置顶/重命名/移除三行写路径表，均只描述成功路径）；§3.7 line 247-257（`ConversationTreeStoreDeps` 全部 9 个字段：`data`/`openRightPanel`/`navigate`/`openInFinder`/`openInNewWindow`/`copyToClipboard`/`confirmDestructive`/`openSearch`/`getContext`——没有任何错误呈现端口）。

**问题**：我读了旧代码 `conversation-tree/use-project-row-actions.ts` 与 `use-conversation-row-actions.ts`，两者的 `onSubmitRename`/`onRemove`/`onReveal` 全部显式处理 RPC 失败：host 断连时 `toast.error(t("...hostDisconnected"))`，删除失败时 `toast.error(...removeFailed)`，reveal 失败时 `toast.error(...)`。这证明"RPC 写失败需要用户可见反馈"不是我臆测的边界情况，是这个产品域已经踩过、已经解决过的真实需求。**新架构的写路径表（§3.4）对"重命名"只写到"→ 真实 RPC：`client.renameProject(...)`"就结束，对"移除"只写到"确认后 `data.removeProject` → `client.removeProject(projectKey)`"——两处都没有下一句"如果这个 RPC reject 了会发生什么"。`ConversationTreeStoreDeps` 的 9 个字段里也没有任何 toast/错误呈现端口。** 对比：`FileTreeStore` 对等价的写操作（rename/delete/paste）全部有 `catch (error) { this.nodeError = withSet(...) }` 这样的显式失败态处理并反映到树上的错误提示；`FileDocumentModel`（right-panel）的保存失败也有专门的 `"failed"` 态。唯独这份文档的写路径，完全没有对应设计。

**违反原则**："移除项目"是文档自己标注为"破坏性(经二次确认)"的操作——一个用户主动确认要执行的破坏性操作，点击后 RPC 静默失败、项目却没有任何反馈地留在原地（或者更糟，UI 已经乐观移除但服务端其实没删），是真实的、会被验收阶段发现的功能缺陷,不是可以留到实现阶段"顺手"补的细节。

**建议**：给 `ConversationTreeStoreDeps` 补一个类似 `reportError: (input: {action: "rename" | "remove" | "pin"; message: string}) => void` 的端口（对位旧 hook 里 `toast.error` 已验证的真实需要），并在 §3.4 的"重命名"/"移除"两行各补一句失败分支的落地描述。

---

### 次要

#### M1. `ConversationTreeController`/`asConversationTreeController` 是为一个当前不存在、形态未定的未来消费者预建的窄接口，今天零调用方——且文档自己在别处明确拒绝了同类型的"提前建缝"，未解释这处不一致

**位置**：§3.5 line 207-217（`ConversationTreeController` 接口定义 + `asConversationTreeController` 工厂函数）。

**问题**：我对照了这个模式的直接先例 `shell/file-tree/model/file-tree-public.ts` 的 `FileTreeController`——它的两个方法 `showDirectory`/`revealFile` **今天就有真实调用方**（`revealFile` 被 right-panel 的 `FileDocumentModel.onActivated()` 实际调用，这是我读 right-sidebar architecture.md 确认过的现状实现，非早期设计稿）。而 `ConversationTreeController.focusedRootId` 我通读全文没有找到**任何**读取方——连树自己的行选中态派生（`isRowSelected`，§3.6）都是直接读 `store.focusedRootId`，不经过这层收窄接口。也就是说这层接口从内到外都没有消费者，纯粹是为一个"conversation-page 落地后可能会这样读"的假设预先搭的壳，而文档自己也承认这个假设并不确定（§3.5："将来切换点…读方将从『树自己重渲染』迁移为『conversation-page 读 `ConversationTreeController.focusedRootId`』**或**『迁移为路由参数』"——两个互斥的可能性都留着，说明连作者自己都不确定这层接口会不会是最终形态）。

更值得注意的是：**文档自己在 §3.5 的另一处（subagent → 右栏那条）明确拒绝了同类型的"提前建缝"**——原话"bridge 文件对位的是『已有接收方、只差接线』的场景…这里接收方本身不存在，提前建 bridge 只是形式主义"，并因此**没有**新建 `conversation-tab-bridge.ts`。这个判断标准（"接收方不存在就不提前建缝"）如果适用于 subagent→右栏，理应同样适用于 `focusedRootId` 的对外收窄面——conversation-page 这个接收方同样不存在。文档对两个结构相同的处境给出了相反的处理，没有说明为什么。

**违反原则**：YAGNI——为不存在、形态不确定的未来调用方预建一层公共接口，是"预留参数"类问题在接口粒度上的版本。

**建议**：本轮删除 `conversation-tree-public.ts` / `ConversationTreeController` / `asConversationTreeController` 三者，把 `focusedRootId` 作为 store 的普通 `readonly` 字段暴露即可；等 conversation-page 真正落地、明确了它到底要"收窄面"还是"路由参数"时，再决定要不要建这层。

---

#### M2. `activateNode(nodeId: string)` 丢弃调用方已有的 kind 信息，需要内部反查节点类型，对"project id 传入"这一被文档自身声明的非法输入没有定义运行时行为

**位置**：§3.6 line 232-242（`activateNode` 精确语义）。

**问题**：调用方（tree-row.tsx 一类的行组件）在派发点击时手上拿着的是完整的 `ConversationTreeRow`（含 `node.kind`），但 `activateNode` 的签名只收一个裸 `nodeId: string`，意味着 store 内部必须重新从 `agents`/`projects` 两个 Map 反查这个 id 对应的 kind（project 不在 `agents` 里；conversation vs subagent 靠 `parentAgentId` 是否为 null 判断）——这个反查过程文档从未描述，调用方已有的信息被直接丢弃又在别处重新计算。更关键的是：§3.6 用一句"kind === 'project'：不调用此方法"来声明契约，但这只是文档里的一句话，不是类型系统能强制的约束——如果调用方违反这个契约传入一个 project 的 id，方法内部会发生什么（静默 no-op？取到 undefined 后抛错？）完全没有定义。

对比同一体系里 `FileTreeStore` 的先例：`select()`（纯选中，无副作用，服务 reveal 场景）与 `activateFile()`（选中+开右栏，只服务用户主动点击）被显式拆成两个方法，代码注释直接写明原因（"bound to the deliberate click, not to select()…so arrow/reveal navigation never spuriously opens tabs"）。`activateNode` 把"设置选中态"和"触发 navigate/openRightPanel 副作用"揉进同一个方法、同一次调用，没有对是否需要类似拆分做出取舍说明。

**违反原则**：coding-standards 强调的"让不可能态不可表达"——project 不可选中是一个真实的领域不变量，理应体现在类型签名（例如接收已经过滤过 kind 的节点，或拆成两个方法）而不是纯文档约定。

**建议**：把签名改成接收已知 kind 的调用形态（例如 `activateNode(node: ConversationTreeNode)`，调用方本就手握完整节点），或至少在方法体描述里补一句 project id 传入时的确定性行为。

---

#### M3. `pins` 持久化集合从未被赋予字段名、类型与 hydrate 生命周期说明——文档其余每一处状态都有对应的清晰字段声明，这是唯一的不对称疏漏

**位置**：§1.1 line 47（`model/pin-state.ts` 行）；§3.4 line 201（"togglePin(target) → pin-state.ts 纯转移 → 本地持久化写(AsyncStorage…)"）；对比 §2 表格（line 67-79）里 agents/projects/collapsedProjectKeys/expandedNodeIds/focusedRootId/activeNodeId/editing 均有明确的字段名 + 归属声明。

**问题**：`partition-pinned.ts` 的输入需要一个 `pins: readonly ConversationTreePinTarget[]` 集合（§3.1 已定义 `ConversationTreePinTarget` 类型），这个集合显然要作为 `ConversationTreeStore` 的一个字段存在，供 `tree` computed 读取——但文档从未在任何状态字段清单里出现过它。§3.4 只说 `togglePin` 会"本地持久化写(AsyncStorage)"，没有说清这次写入是否同时更新一个同名的内存字段（如果不更新，`partition-pinned.ts` 在下一次 `tree` computed 求值时就读不到最新置顶结果，除非有另一条隐藏的重新读取路径）。这是文档对其它每一处状态都做到了、唯独这里缺失的字段级描述。

**违反原则**：状态归属不完整——一个被纯函数消费、由用户操作直接改变、需要驱动 UI 重渲染的集合，理应和 `expandedNodeIds` 一样有明确的字段声明 + hydrate 时机描述。

**建议**：在 §2 表格 / §3.1 类型区补一行明确的 `pins: readonly ConversationTreePinTarget[]` 字段声明 + hydrate 时机（对齐 `collapsedProjectKeys` 已有的持久化标注方式）。

---

## 已验证无问题项清单（证明查过什么，不是没查到）

- **OOP 立场是否落地为真封装、而非贫血容器**：逐个核对 `ConversationTreeStore` 描述的意图方法（`togglePin`/`beginRename`/`commitRename`/`requestRemoveProject`/`activateNode`/`toggleExpand`/`toggleProjectCollapse`）——都是承载真实状态转移的方法，不是简单 getter/setter 包装，判定为**非贫血容器**。唯一的反向问题是 I2（策略型逻辑该往外委托却没委托），这是"过度吸收"而不是"过度空洞"，两者是不同的问题，已分别记录。
- **conversation-tree/ 与 host-switcher/ 的模块切分是否是伪聚合**：核对两者状态与数据来源——对话树关心 `agents`/`projects`/置顶/展开，主机切换器关心连接态/host 列表，两者在 §3.1-§3.9 全文找不到任何交叉读写，是真实的零耦合切分，不是"因为都画在左栏顶部就凑一起"的形式主义。
- **纯函数清单逐个质问存在理由**：`build-tree.ts`/`flatten-rows.ts`/`partition-pinned.ts`/`group-projects.ts`/`status-dot.ts`/`project-menu.ts`/`conversation-menu.ts`/`pin-state.ts`/`rename-state.ts` 九个文件逐一核对——没有一个是单行透传，没有一个带着"当前用不到、为未来预留"的多余参数；`status-dot.ts` 虽只有五行映射但携带非平凡的优先级判定（`requiresAttention` 优先于 `status`），够格独立成文件并独立测试。
- **工厂缝（TabContentFactory 式间接层）不引入的判断**：核对 requirement.md §5——`subagent-native-tree`（评审中）明确会复用同一个 "subagent" kind 承载只读节点，不会新增第四种 kind；`ConversationTreeNodeKind` 是真闭合的判别联合，直接 `switch` 不建工厂是合理判断，不是偷懒。
- **`openRightPanel: () => void` 端口设计**：核对 `shell/model/shell-model.ts` 的 `openRight()` 实现——确认是幂等操作（`_setOpen("rightOpen", true)`），且该端口只做"确保右栏展开"这一件事，没有携带多余载荷或间接层，是全文里设计最干净的一个端口。
- **"不新建 `conversation-tab-bridge.ts`"的判断（§3.5）**：核对 right-panel 现状 `tab-content.ts` 的 `OpenTabRequest`——`kind: "file"` 目前确实是单一字面量（非判别联合），佐证了"接收方本身不存在，建 bridge 是形式主义"这一判断成立；文档在这一点上展现了正确的克制（与 M1 形成对照）。
- **对旧代码事实性描述的抽查（5 处，全部准确）**：① `conversation-tree/select.ts` 的 `buildConversationTree` 确认只过滤 `archivedAt`，不含 `status==="closed"`——与文档"过滤条件比旧版多一项"的行为升级声明一致；② `use-project-row-actions.ts` 的 `onCreateWorktree` 确认是纯 `router.navigate(buildHostNewWorkspaceRoute(...))`，无 RPC；③ `use-command-center.ts` 的 `isMatch`（line 30-36）确认只匹配 `title`/`cwd`，不含消息内容,与文档"现状与 requirement 原文有出入"的记录一致；④ `host-switcher-model.ts` 确认是文档所称的 24 行纯函数 `selectHostConnectionTone`；⑤ `shell-root.tsx:75` 确认是左区 `RegionPlaceholder`。
- **§7 风险①（数据订阅层是否是过大新代码面）的独立核验**：与 file-tree 的历史取舍同构，`ConversationTreeRpcClient` 确系对已存在稳定 RPC 的结构类型包装，非重新发明协议，认可这一判断成立。
- **§7 风险②（subagent 点击只展开右栏是否价值不足）的独立核验**：直接核对 `shell/right-panel/model/tab-content.ts` 源码——`OpenTabRequest.kind` 现状确为单一字面量 `"file"`，证实"任何模块本轮都无法真正开出对话类型 tab"为真实约束而非借口，认可这一判断成立。

---

## 预答裁决

作者在文档内对多处质疑做了预先作答，逐条独立裁决如下（不因为作者已经论证过就采信，重新核验依据）：

1. **§1"工厂缝不适用，本轮不引入"** —— **认可**。独立核验 `ConversationTreeNodeKind` 确为闭合三态判别联合，且 requirement.md 已确认未来的 `subagent-native-tree` 复用同一个 "subagent" kind、不新增第四态，工厂缝确实是不必要的间接层。

2. **§3.5"`ConversationTreeController`/`focusedRootId` 不是臆造的占位字段"** —— **不认可**，见 M1。作者的论证是"它是需求 §2.G 的唯一真相源"，这点成立（`focusedRootId` 字段本身该存在），但被质疑的从来不是字段本身，是**为它单独包一层收窄接口** `ConversationTreeController`——这层接口今天零消费者，作者自己在 §3.5 对"将来读方是谁"给出了两个互斥猜测，说明这层接口的形状本身就不确定，不该在此刻固化。

3. **§3.6"`deps.navigate(...)` 是 no-op-safe 的前瞻缝"** —— **不认可**，见 B3。生产绑定是真实 `router.navigate`，"no-op-safe"这个判断没有给出实参依据，属于未经证明的断言，且发生在验收标准 22 覆盖的核心交互路径上。

4. **§3.5"不新建 `conversation-tab-bridge.ts`，提前建缝是形式主义"** —— **认可**，且独立核验了判断依据（`OpenTabRequest.kind` 现状单一字面量）成立。这一判断本身是文档里最好的 YAGNI 范例，恰恰因此让 M1 的不一致更值得指出——同一份文档对结构相同的"接收方不存在"处境做出了相反选择。

5. **§7 风险①②③ 三条"评审最可能挑战"**：①②如"已验证无问题项清单"所述，独立核验后认可；③（"⌘K/添加主机走回调 prop+挂载点豁免而非统一 bridge 模式"）——**原则认可，应用不一致**。作者给出的判据（"能否用一个纯函数调用表达"）本身合理，但把这条判据落到文档实处时出现了两个不一致：一是 `openSearch` 同时出现在 Deps 字段与组件 prop 两条描述里（I1），二是 host-switcher 除了 `onAddHost` 之外的"切主机"/"发起重连"两项职责根本没有端口设计可供核对（B1）。判据本身站得住，落地不完整。

---

## 返回总监摘要

**Verdict：需大改**（范围有边界：conversation-tree/ 主体设计可保留，问题集中在 host-switcher/ 模型层缺席 + 3 处具体阻断缺陷）

**发现条数**：阻断 3、重要 3、次要 3（共 9），另有 9 项独立核验通过的正向确认。

**最重要 3 条**：

1. `host-switcher/` 被 §0 承诺"和 ConversationTreeStore 一样走 MobX 类范式"，但全文找不到它的类定义、字段、或 Deps 接口——董事长闸1特批的"离线主机点击改为原地重连"这个唯一的新行为，状态归属和调用哪个 host-runtime 方法完全没有设计。
2. `ConversationTreeStore` 是这个类家族里第一个持有实时推送订阅（`agent_update`）的成员，但架构只写了"`useMemo` 换 key 重建"来处理切主机，没有配对的取消订阅设计——这和代码库里两个同级挂载点（file-tree-region.tsx / right-panel-region.tsx）已确立的"useEffect + 清理函数"惯例矛盾，字面实现会在每次切主机后泄漏一个监听器。
3. 点击根对话（验收标准 22 的核心交互）会调用真实的 `router.navigate(...)`，但实参从未定义，文档只用一句未经证明的"no-op-safe"带过，存在触发错误导航的真实回归风险。
