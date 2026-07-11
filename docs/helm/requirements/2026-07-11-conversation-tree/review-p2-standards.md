# 评审 · P2 架构 · 左侧对话树(成员② · Helm 规范 / 零旧依赖 / 删旧账 / WHAT-HOW 边界)

> 评审对象:`docs/helm/requirements/2026-07-11-conversation-tree/architecture.md`(未 commit,董事长闸 2 评审中)
> 评审角色:架构专家评审团 成员②,对抗性评审,只评不改
> 日期:2026-07-11

## Verdict

**REQUEST CHANGES —— 不建议以当前稿直接过闸 2。**

核心设计方向(三层 model/data/components 同构 file-tree、`ConversationTreeStoreDeps` 注入契约、`focusedRootId`/`activeNodeId` 双态共存语义、状态点新设计的技术论证)站得住,且**绝大多数复用点声称都经过了真实源码核对**(逐条实核见下方两张核查表,通过率高)。但按董事长硬规则「§4.2 审计表漏一处都算」「处置清单逐件写明,不用退役措辞误导」的字面标准,发现 **2 处阻断级遗漏 + 1 处重要级未决策 + 2 处中 / 轻微级**,需要先补全再过闸。

**发现条数:阻断级 2 · 重要 1 · 中等 1 · 轻微 2(共 6 条)**

## 评审方法

逐字读:目标 architecture.md、同目录 requirement.md/ui.html、`standards.md`、`coding-standards.md`、先例 `2026-07-07-right-sidebar/architecture.md`(§4.1/§4.2 范式来源)、`2026-06-30-file-tree/architecture.md`(§4/§9,三分类框架与"standards §8"编号的原始出处)。逐一实核架构文档点名的旧代码现状:`packages/app/src/conversation-tree/*`(8 文件全读)、`use-project-row-actions.ts`/`use-conversation-row-actions.ts`/`project-action-availability.ts`、`sidebar-pins-store`/`sidebar-collapsed-sections-store`、`rename-modal.tsx`、`workspace-hover-card.tsx`、`use-sidebar-workspaces-list.ts`、`workspace-identity.ts`、`workspace-structure.ts`、`navigate-to-agent/{index,resolve}.ts`、`host-switcher-model.ts`/`host-switcher-pill.tsx`、`use-command-center.ts`、`desktop/host.ts`/`desktop/electron/host.ts`、`workspace/desktop-open-targets.ts`、`shell/file-tree/*`(`file-tree-context.wiring.ts`/`reveal.ts`)、`shell/right-panel/*`(`tab-content.ts`/`tab-kind-policy.ts`/`content-actions.ts`)、`shell-root.tsx`、`home.tsx`、`packages/client/src/daemon-client.ts`、`packages/protocol/src/{agent-state-bucket,agent-labels}.ts`、`packages/desktop/src/features/editor-targets.ts`(桌面主进程侧,用于核实跨平台声明)。

---

## 发现清单

### F1〔阻断级〕处置清单(§4.1)完全遗漏「旧主机切换器」的处置条目

- **位置**:架构.md §4.1「A. 旧件」表(第 287–293 行),应补未补。
- **违反**:董事长硬规则「旧树 / 旧切换器 / 旧⌘K 的下场逐件写明」+ coding-standards《Refactor, don't patch》的处置义务。
- **证据**:§4.2(第 324 行)明确审计了 `@/components/sidebar/host-switcher-pill.tsx` + `host-switcher-model.ts` → 新等价落点 `shell/host-switcher/components/host-switcher.tsx` + `model/connection-tone.ts`,承认这是一次**功能性替代**(旧主机切换 UI 被新模块取代,服务新壳)。但 §4.1"处置清单"表只有 3 行(`conversation-tree/*`、两个 sidebar store、`rename-modal`+`workspace-hover-card`),**完全没有 host-switcher-pill.tsx / host-switcher-model.ts 的处置条目**——不删?何时删?活在哪个旧挂载点?一概未答。对照同表里性质完全相同的另外两类("旧 UI 被新模块等价替代"):`conversation-tree/*` 和 `rename-modal`/`workspace-hover-card` 都各有一行写明"活在哪 / 本轮处置 / 何时删",host-switcher 理应同等处理却被漏掉,属于典型的"审计表覆盖了被替代的对象,但处置清单没跟上"的两本账不一致。
- **建议**:在 §4.1「A. 旧件」表补一行,例如:`@/components/sidebar/host-switcher-pill.tsx` + `host-switcher-model.ts` | 现挂载于旧侧栏底部(紧邻设置)| 不删;本需求零 import,仅作行为参考 | 随旧路由 cutover。

### F2〔阻断级〕§4.2 审计表遗漏"在 Finder 中显示"的真实旧依赖,且照搬的替代方案是未声明的跨平台行为回退

- **位置**:架构.md §4.2 表尾(第 325 行)、§4.A(第 335 行)。
- **违反**:「§4.2 审计表覆盖了它实际提到的每一处旧能力吗?漏一处都算」+「等价重写声明的等价性:差异须显式声明」。
- **证据**:
  1. 实核 `use-project-row-actions.ts:62-74` 与 `use-conversation-row-actions.ts:89-100`——当前"在 Finder 中显示"走的是 `hasDesktopOpenTargetsBridge()` / `listDesktopOpenTargets()` / `openDesktopTarget()`(定义于 `packages/app/src/workspace/desktop-open-targets.ts`,一个旧 app 目录文件),逻辑是"先异步列出全部桌面可用目标,找 `kind === "file-manager"` 的那一个,取它的 `id` 去 open"。
  2. 这个文件在整份架构.md 里**从未被提及**——不在 §4.2 审计表任何一行,不在 §4.A「允许直连」清单,也不在 §4.1 处置清单,是一处完整的"漏审"。
  3. §4.2 表尾 / §4.A 把"在 Finder 中显示"和"在新窗口打开"一并归为"直连 `window.paseoDesktop.*`",照搬 file-tree/right-panel 先例(`shell/file-tree/util/reveal.ts`、`shell/right-panel/file-tab/data/content-actions.ts`)**硬编码 `editorId: "finder"`**。
  4. 实核 `packages/desktop/src/features/editor-targets.ts:71-98`——"finder" 这个 id **仅在 `platforms: ["darwin"]` 下注册**;Windows 下注册的是 `id: "explorer"`(`platforms: ["win32"]`),Linux/其它平台下是 `id: "file-manager"`(`excludedPlatforms: ["darwin", "win32"]`)。硬编码 `"finder"` 在非 macOS 桌面构建上会因目标 id 不匹配而**静默失效**(reveal 无响应)。
  5. 反观 OLD `conversation-tree` 现状代码(`desktop-open-targets.ts` 的 list→按 `kind` 找 target→用其 `id`)是跨平台正确的——本架构选择照搬的"精简"模式,实际上是把一个**当前正确的跨平台行为**替换成一个**已知只在 macOS 生效**的模式,而且全程未审计这个旧依赖、未核实等价性、未声明这个差异。
  6. 这不是"这份文档凭空引入的新 bug"——file-tree/right-panel 的既有实现已经这样硬编码,本文档只是第三次原样复制。但正因为如此,"§4.2 逐条审计等价性"这道工序本该在这里第一次被触发(因为 conversation-tree 是第一个同时拥有"旧行为跨平台正确"对照组的场景),而它没有触发。
- **建议**:§4.2 补一行审计 `@/workspace/desktop-open-targets.ts`;wiring 层照抄其"list → 按 kind 找 target → 用其 id"的解析方式而非硬编码 `editorId`,或至少显式声明"本轮仅保证 macOS 行为等价,Windows/Linux 桌面构建的差异是已知且接受的既有欠账"。

### F3〔重要〕置顶(pins)与项目折叠(collapsed sections)持久化的新旧连续性未被决策或提及,存在"同一用户数据新旧两处管"的真实风险

- **位置**:架构.md §4.2(第 319–320 行)、§3.4(第 201 行)。
- **违反**:「处置清单 / §2 重构非打补丁——有没有制造第二真相源(同一状态新旧两处管)?」
- **证据**:
  1. 实核 `stores/sidebar-pins-store/index.ts:29` — 旧 pin 持久化用 AsyncStorage key `"sidebar-pins"`;`stores/sidebar-collapsed-sections-store/index.ts:36` — key `"sidebar-collapsed-sections"`。这是**用户主动产生、长期有意义的数据**(用户置顶了哪些项目 / 对话),不是像 tab 开合态那种可以随路由切换自然重置的临时态。
  2. 架构 §4.2 对这两个 store 的处置是"新模块另起等价持久化(对位 `ShellModel` 自己的 `partializeShellState`/`hydrate` 范式)"——即套用 `ShellModel` 自己那套持久化模式,大概率落在**另一个 AsyncStorage key**,而非复用 `"sidebar-pins"`/`"sidebar-collapsed-sections"` 这两个既有 key。
  3. 全文没有一处讨论:新旧路由在 cutover 完成前会长期共存(参照 right-sidebar §4.1"新旧路由是两条并存的活路由"的既有论证),用户完全可能今天在旧侧栏置顶了项目 A,明天在新树里看不到这个置顶(或反过来)——因为两边读写的是两个不同的 storage key,谁都不知道对方的存在。
  4. 更具体的证据:即便决定共享同一个 AsyncStorage key,新架构 §3.1 定义的 `ConversationTreePinTarget` 判别式用的是 `kind: "conversation"`(第 130 行),而旧 `stores/sidebar-pins-store/state.ts:8` 用的是 `kind: "workspace"`——两者判别字面量不同,即使共享同一个 key,新代码写出的 JSON 也无法被旧代码识别为"已置顶"(反之亦然)。这说明"是否要与旧数据保持连续"这个问题在本文档里完全没有被考虑过,不是"两个方案里选了一个"的情形,而是"没有被提出过"。
  5. (旁证,非独立 finding)`sidebar-collapsed-sections-store` 实际持有 `collapsedProjectKeys` **与** `collapsedStatusGroupKeys` 两个字段;已核实后者只服务另一个不相关的现状视图(`components/sidebar/sidebar-status-list.tsx`),与 `conversation-tree/render.tsx` 无关,故架构只搬运 `collapsedProjectKeys` 是正确裁剪、非遗漏——但这更说明架构作者对这个 store 的内部结构是读过的,唯独没有多问一句"持久化 key 要不要延续"。
- **建议**:架构应显式决策并写明三选一之一:(a) 新旧共享同一 AsyncStorage key + 把新判别式的字面量对齐旧 `kind: "workspace"`,做到真正数据连续;(b) 明确接受"cutover 前置顶态不互通,一次性体验断档",并说明为何可接受(如:pins 数量通常很少、cutover 窗口短);(c) 提供一次性迁移读取(新 store 首次 hydrate 时也读一次旧 key 并 merge)。当前文档的沉默等于隐性选择了最差的选项而未声明。

### F4〔中等〕"workspace-hover-card 等价重写"的范围被低估:遗漏至少一个真实旧依赖,且未参照仓库唯一相关先例文档

- **位置**:架构.md §4.2(第 322 行)、§7(hover card 风险段落)。
- **违反**:「等价重写声明的等价性:声称等价重写的领域小工具,对照旧代码核实行为是否真等价」。
- **证据**:
  1. 架构在 §7 声明"核心四要素(标题 / 分支 / 目录 / 最近变更)数据源已确认(本模块已拉取的 workspace 快照),可直接等价重写"。
  2. 实核 `hooks/use-sidebar-workspaces-list.ts:44-73` 的 `createSidebarWorkspaceEntry`(正是 `conversation-tree/render.tsx:221` 今天真实用来喂 `WorkspaceHoverCard` 的函数)——"最近变更时间"字段**并非 workspace 快照的裸字段**,而是 `deriveEffectiveWorkspaceStatus`(第 82–110 行)算出来的:当 `workspace.status === "done"` 时,会去看有没有 pending create attempt、有没有仍在跑的根 agent(经 `@/utils/sidebar-agent-state` 的 `deriveSidebarStateBucket`),取更晚的时间点作为"最近变更"。`render.tsx:221` 把真实的 `agents` Map 传了进去,证明这条 reconcile 逻辑今天确实在生产环境里跑着,不是死代码。
  3. `@/utils/sidebar-agent-state` 全文没有在 §4.2 出现过,也没有被列为需要等价重写或直连的依赖——如果新模块的 hover card 只读"本模块已拉取的 workspace 快照"的裸 `statusEnteredAt`,会在"workspace 已完成但根 agent 仍在收尾 / 有新对话正在创建"这类场景下,比旧行为多显示一段时间的过期时间戳。
  4. 另,`workspace-hover-card.tsx` 是仓库 `docs/floating-panels.md` 明确点名的四个"canonical files"之一(该文档原话:"There is no shared 'floating panel' primitive yet — when a fifth use case shows up we can revisit; until then prefer copying the closest file and trimming")。整份架构从未引用这份文档,也没有对 `workspace-hover-card.tsx` 依赖的 `useHoverSafeZone`(`@/hooks/use-hover-safe-zone.ts`,一个既不在 `shell/` 也不在 `@/components/ui/` 下的旧目录 hook)做三分类归属判定——按三分类字面定义它属于 (B)(旧 app 目录、非 shell,须零 import、等价重写),但其内容是纯交互几何计算(安全区域 hover 判定),不绑定任何业务数据,是否可比照 `@/components/ui/*` 直连,文档没有回答。
- **建议**:§4.2 审计表补一行 `@/utils/sidebar-agent-state`(是否需要等价重写"最近变更时间"的 reconcile 逻辑,还是接受简化为裸字段读取并把这一点作为显式的范围收缩写进 §7,而非隐藏在"数据源已确认"这句话背后);对 `useHoverSafeZone` 给出明确的三分类归属结论。

### F5〔轻微〕§4.1 处置清单缺少先例(right-sidebar §4.1)已确立的"合法性说明"段落

- **位置**:架构.md §4.1 开头(第 285–286 行之间,表格前)。
- **违反**:未直接违反某条硬规则,但未达到先例已确立的"处置清单"文档格式基线,董事长本轮明确要求核对"别用退役措辞误导"。
- **证据**:对照 `2026-07-07-right-sidebar/architecture.md` §4.1 开头整段"**合法性先说清**(避免 §0/§4 的「退役」措辞被误读,M2)"论证——把"新旧路由是两条并存的活路由""本轮触碰的子系统 = 新壳该区、旧路由不在本轮触碰面"这两点显式写出,从而把"本轮不删"严格钉死为 coding-standards《Refactor, don't patch》里"untouched legacy 可以不动"的例外情形,而非"打补丁留旧"。目标文档 §4.1 直接进表格,没有这段显式论证。核实结论:实质站得住(旧 `workspace/[workspaceId]` 路由确实完全没被这次改动触碰,§4.2 也证明新目录零 import 旧实现),但文档没有像先例一样把论证摆出来,给评审 / 未来读者留了一个"这是不是在打补丁"的隐含问题需要自己重新推导一遍(本次评审就重新推导了一遍才确认站得住)。
- **建议**:参照 right-sidebar §4.1 补一段等价论证,统一"契约三件套"家族内的处置清单格式。

### F6〔轻微〕`ConversationTreeStoreDeps.navigate` 接口契约未说明"当前无真实路由"场景下 `activateNode` 实际传什么 `route` 值

- **位置**:架构.md §3.6(第 239 行)、§3.7(第 250 行)。
- **违反**:WHAT-HOW 边界里"接口契约要具体到可实现"的一侧(此处不够具体)。
- **证据**:§3.5 已核实(对照 `home.tsx:23`)当前 `ShellContext.workspaceKey` 仍是硬编码占位串 `${serverId}:__home__`,没有真实的按对话路由;§3.6 说"conversation"分支会调 `deps.navigate(...)` 作为"no-op-safe 的前瞻缝"。但 `navigate` 的类型是 `(route: string) => void`,文档从未说明这次调用实际构造 / 传入的 `route` 字符串是什么——实现者需要自己猜测(传空串?传占位 key?根本不调用?)。
- **建议**:明确注明本轮 `activateNode` 是否真的调用 `deps.navigate`(尤其在占位阶段,更干净的做法可能是本轮不调用,而不是调用一个没人处理、内容不明的字符串)。

---

## 零旧依赖审计核查表(架构声称 vs 我的实核)

| #   | 旧依赖 / 能力                                                                                                                                                  | 架构声称的新落点 / 方式                                                    | 我的实核                                                                                                                                                                                                                                                                                                                                            | 结论                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | `conversation-tree/select.ts` 的 `buildConversationTree`/`flattenConversationTreeRows`/`partitionPinnedNodes`                                                  | `model/build-tree.ts` + `flatten-rows.ts` + `partition-pinned.ts`,等价重写 | 已读 `select.ts` 全文(280 行):分组(按 `parentAgentId` 递归建树)/`createdAt` 升序 / `subagentCount` = 全部后代 / 去重逻辑核对一致。新 `ConversationTreePinTarget` 去掉了旧代码 `kind: "agent"` 分支——已核实 `select.test.ts:332`("ignores agent-kind pins")+ `partitionPinnedNodes` 本就没处理这个分支,是**当前就未接线的死判别项**,裁剪无害、非遗漏 | ✅ 通过                                                |
| 2   | `@/utils/workspace-identity` 的 `normalizeWorkspaceOpaqueId`                                                                                                   | `model/types.ts` 旁小归一函数                                              | 已读全文:`trim` + 空串→`null`,描述准确                                                                                                                                                                                                                                                                                                              | ✅ 通过                                                |
| 3   | `@/projects/workspace-structure.ts` 的 `buildWorkspaceStructureProjects`                                                                                       | `model/group-projects.ts`                                                  | 已读全文:按 `projectId` 分组 + 空项目合并,描述准确                                                                                                                                                                                                                                                                                                  | ✅ 通过                                                |
| 4   | `@/stores/sidebar-pins-store`                                                                                                                                  | `model/pin-state.ts` + 组合根小型 AsyncStorage 持久化                      | 转移算法本身核对一致;但持久化 key/序列化字面量的新旧连续性完全未讨论                                                                                                                                                                                                                                                                                | ⚠️ 需补充(见 F3)                                       |
| 5   | `@/stores/sidebar-collapsed-sections-store`                                                                                                                    | `conversation-tree-store.ts` 的 `collapsedProjectKeys` 字段                | 该 store 实际有两个字段;`collapsedStatusGroupKeys` 经查证只服务 `sidebar-status-list.tsx`(与 conversation-tree 无关),只搬 `collapsedProjectKeys` 正确、非遗漏。持久化连续性问题同 #4                                                                                                                                                                | ✅ 结构通过 / ⚠️ 持久化需补充(F3)                      |
| 6   | `@/components/rename-modal`(`AdaptiveRenameModal`)                                                                                                             | 新内联重命名取代                                                           | 已读全文:现状确系 `AdaptiveModalSheet` 弹窗式,"模态改内联"定性准确                                                                                                                                                                                                                                                                                  | ✅ 通过                                                |
| 7   | `@/components/workspace-hover-card` + `use-sidebar-workspaces-list` 的 `createSidebarWorkspaceEntry`                                                           | `components/workspace-hover-card.tsx` 等价重写核心四要素                   | 标题 / 分支 / 目录三项数据源准确;"最近变更时间"的 reconcile 逻辑(`@/utils/sidebar-agent-state`)遗漏;`docs/floating-panels.md`/`useHoverSafeZone` 未提及                                                                                                                                                                                             | ⚠️ 需补充(见 F4)                                       |
| 8   | `@/utils/navigate-to-agent`(`navigateToAgent`/`resolveNavigateToAgent`)                                                                                        | `activateNode` + `focusedRootId`/`openRightPanel()`,定性为"重新设计非重写" | 已读 `index.ts`+`resolve.ts` 全文:`surface` 字段真实存在;确认其深度绑定旧 `workspace-tabs`/`TabSurface`/`navigateToPreparedWorkspaceTab` 体系,"新壳没有这个体系"定性准确;`restoreArchivedWorkspace`(归档态 worktree 自愈)分支在新树里天然不需要(新树过滤掉全部归档/关闭 agent,用户点不到)                                                           | ✅ 通过                                                |
| 9   | `@/components/sidebar/host-switcher-pill.tsx` + `host-switcher-model.ts`                                                                                       | `shell/host-switcher/*`(`host-switcher.tsx` + `connection-tone.ts`)        | 已读 `host-switcher-model.ts` 全文:5→3 态折叠描述准确(实际 23 行,"24 行"基本准确);已核实 `host-switcher-pill.tsx` 用 3 个局部 `useState` 条件渲染 `AddHostMethodModal`/`AddHostModal`/`PairLinkModal`,与 §4.C 描述一致                                                                                                                              | ✅ 算法/UI 通过 / 🛑 **§4.1 处置清单遗漏**(见 F1)      |
| 10  | `@/desktop/host.ts` 的 `getDesktopHost()`                                                                                                                      | 绕过,直连 `window.paseoDesktop.*`                                          | 已读 `desktop/host.ts`+`desktop/electron/host.ts` 全文:`getElectronHost()` 只是"`typeof window === "undefined"` → `null`,否则读 `window.paseoDesktop`"的极薄层;已核实 `shell/file-tree/util/reveal.ts`、`shell/right-panel/file-tab/data/content-actions.ts` 均照此模式直连(`isWeb`+`getIsElectron()` 双重门控),先例真实、非杜撰                    | ✅ 通过(但见 #11,"在 Finder 中显示"这半没被这条覆盖到) |
| 11  | `@/workspace/desktop-open-targets.ts`(`hasDesktopOpenTargetsBridge`/`listDesktopOpenTargets`/`openDesktopTarget`)                                              | **架构文档全文未提及**                                                     | 这是当前"在 Finder 中显示"的真实实现,且其 list→按 `kind` 找 target 的方式是跨平台正确的做法(参照 `packages/desktop/src/features/editor-targets.ts` 的 darwin/win32/其它三态 id 注册)                                                                                                                                                                | 🛑 **审计遗漏 + 未声明回归**(见 F2)                    |
| 12  | `@/utils/sidebar-agent-state` 的 `deriveSidebarStateBucket`                                                                                                    | **架构文档全文未提及**                                                     | 见 #7 / F4——hover card "最近变更时间"字段的隐藏依赖                                                                                                                                                                                                                                                                                                 | ⚠️ **审计遗漏**(见 F4)                                 |
| 13  | `@getpaseo/protocol` 的 `AgentLifecycleStatus`/`AgentSnapshotPayload`/`PARENT_AGENT_ID_LABEL`,`agent-state-bucket.ts`/`agent-labels.ts`/`terminal-activity.ts` | 直连不重写,新写五态映射表而非复用 `deriveAgentStateBucket`                 | 已读 `agent-state-bucket.ts` 全文:`deriveAgentStateBucket` 确实把 idle/initializing/closed 未命中其它分支的情况全部落到 `"done"` 分支,"该函数无法区分空闲与初始化中,故不复用"论证站得住;`agent-labels.ts` 的 `PARENT_AGENT_ID_LABEL`/`getParentAgentIdFromLabels` 真实存在                                                                          | ✅ 通过                                                |
| 14  | `packages/client` 的 `fetchAgents`/`fetchWorkspaces`/`renameProject`/`removeProject`/`setWorkspaceTitle`/`agent_update` 订阅                                   | 直连,无需新 RPC,无能力门                                                   | 已在 `daemon-client.ts` 核实全部方法存在;旧调用点(`use-project-row-actions.ts`/`use-conversation-row-actions.ts`)均无 `server_info.features.*` 前置门控,"不动协议"结论可信                                                                                                                                                                          | ✅ 通过                                                |
| 15  | `shell/file-tree` 组合根读老 `session-store`/`host-runtime` 取 live client 的先例(§0 第三类接触点)+"standards §8"编号失效说法                                  | `data/conversation-tree-context.wiring.ts` 效仿同一模式                    | 已读 `shell/file-tree/data/file-tree-context.wiring.ts` 全文,确认其确实读老 `session-store`+`host-runtime` 取 client/context,注释与 `2026-06-30-file-tree/architecture.md` 原文一致;后者确实多处写"standards §8",与现行 `standards.md`(7 节、无 §8)对不上,架构改引两份姊妹 architecture 作先例的处理方式合理                                        | ✅ 通过                                                |
| 16  | shell 挂载点豁免(`shell/components/*-region.tsx` 可自由 import 老 `runtime`/`session-store`)                                                                   | `left-region.tsx` 援引同一豁免                                             | 已核实 `file-tree-region.tsx` 确实同时直接 import `useHostRuntimeConnectionStatus` 与 `useSessionStore`,`right-panel-region.tsx` 直接 import `useHostRuntimeConnectionStatus`;与 `2026-06-30-file-tree/architecture.md` 原文("属新壳 shell/…不算接缝")逐字一致                                                                                      | ✅ 通过                                                |

**通过率**:16 项中 11 项完全通过、3 项"结构/算法通过但有独立维度需补充"(#4/#5/#7,分别指向 F3/F4)、2 项审计遗漏(#11/#12,分别是 F2/F4 的证据来源),另有 1 项("处置清单遗漏"归属于 #9)。

---

## 处置清单核查表(§4.1 声称 vs 实核)

| 旧件                                                                                    | §4.1 是否列出处置            | 我的核实                                                                                                                                                                                                                                                                                                                                             | 结论                                 |
| --------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `packages/app/src/conversation-tree/*`(8 文件)                                          | 是(第 1 行)                  | 已核实 `components/left-sidebar.tsx:18,655` 确实 import + 挂载 `ConversationTree`,服务旧 `workspace/[workspaceId]` 路由;"8 个文件"清单(`render.tsx`/`select.ts`/`select.test.ts`/`types.ts`/`use-conversation-row-actions.ts`/`use-project-row-actions.ts`/`use-project-row-actions.test.ts`/`project-action-availability.ts`)与目录实际内容完全一致 | ✅ 准确                              |
| `@/stores/sidebar-pins-store`、`@/stores/sidebar-collapsed-sections-store`              | 是(第 2 行)                  | 两 store 均存在,均为 Zustand + AsyncStorage persist;"新模块另起等价持久化"未说明与旧 AsyncStorage key 的连续性关系                                                                                                                                                                                                                                   | ⚠️ 条目本身准确,但遗漏关键维度(F3)   |
| `@/components/rename-modal`(`AdaptiveRenameModal`)、`@/components/workspace-hover-card` | 是(第 3 行)                  | 均核实存在;"内联重命名取代模态"定性准确;hover-card"等价重写"范围有遗漏                                                                                                                                                                                                                                                                               | ⚠️ 条目本身准确,等价性描述需补充(F4) |
| `@/components/sidebar/host-switcher-pill.tsx`、`host-switcher-model.ts`                 | **否——§4.1 完全未列出此项**  | 已核实两文件存在、现挂载于旧侧栏底部,且 §4.2 明确将其判定为"需等价重写"的旧依赖                                                                                                                                                                                                                                                                      | 🛑 **缺失(F1)**                      |
| `use-command-center.ts`/`command-center.tsx`/`keyboard-shortcuts-store.ts`(⌘K)          | 否(§4.1 未列)                | 已核实这不是"被替代"而是"被复用"——⌘K 本身不重写、不建第二份实现,只新增一个新触发点(§4.C),没有旧件需要处置/退役,§4.1 不列出是**正确**的、非遗漏                                                                                                                                                                                                       | ✅ 无需处置条目(正确)                |
| `@/utils/navigate-to-agent`                                                             | 否(§4.1 未列,只在 §4.2 出现) | 已核实其与旧 `workspace-tabs` 深度绑定,新模块是重新设计而非取代;但该文件仍被其它十余处旧调用点(`command-center.tsx`/`workspace-setup-dialog.tsx` 等)持续使用,并非专为对话树而生,不属于"因本需求被替代的旧 UI/模块",不强制要求处置条目                                                                                                                | ✅ 可不强制(非独立 finding)          |

---

## 结论

站得住的部分(状态点五态论证、`activateNode`/双态选中语义、`ConversationTreeStoreDeps` 注入契约、"零接缝 + 两处宿主注入点"的分类、行派生 / 菜单派生的算法等价性)证据扎实、可放心过闸。但 F1/F2 两处阻断级问题都命中了本轮董事长明确要检查的硬规则原文("旧切换器的下场""§4.2 漏一处都算"),F3 是一个更结构性的、影响真实用户数据的连续性缺口——三者建议在过闸 2 前由 helm-architect 补齐,其余三条(F4/F5/F6)可与补齐一并处理或作为开发阶段(P3)的强制核对项写入交接。
