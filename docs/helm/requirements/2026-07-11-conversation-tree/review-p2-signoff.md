# 签字复核 · P2 架构修订(左侧对话树)

> 复核对象:`architecture.md`(修订后,575 行;修订前 411 行,+164 行)
> 复核角色:架构专家评审团(代表 ①OOP/②Helm规范/③正确性 三视角联合签字复核)
> 复核方法:对抗性复核——文档实读全文(分 3 段完整读取,含 §0–§7 与处置表全部内容)+ 源码逐条核对(见下"源码核对清单",13 项关键断言逐一读源码验证,不采信文档自述)
> 日期:2026-07-11

---

## 签字结论

**通过 · 可提交呈闸 2**

三份评审共 27 条意见(阻断 5 · 重要/高 7 · 次要/中/低 15),逐条复核:**26 条有实质、源码可证的修正,与"处置表自称"一致**;**1 条(②F6)实质已被 ①B3 的修正连带解决,但缺一个显式交叉引用标签**,不构成阻断,建议顺手补标签(见"遗留项")。**未发现修订引入的新问题**;全文一致性扫描未发现残留矛盾表述。

---

## 逐条验收表(27 条全量)

### OOP 视角(review-p2-oop.md,9 条)

| #   | 严重度 | 议题                                                                                        | 修订位置                                                   | 核实结论                                                                                                                                                                                                 |
| --- | ------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | 阻断   | host-switcher/ 模型层缺席,离线重连状态归属未定义                                            | §0 L13(订正)、§1.2 L69、§3.10 L414–432(全新增)             | ✅ **真修**——见下方专项裁决                                                                                                                                                                              |
| B2  | 阻断   | 实时订阅无显式取消,切主机泄漏监听器                                                         | §3.3 L259–268(`dispose()`+`useEffect`配对范式)             | ✅ **真修**——源码核实与 `file-tree-region.tsx` 的 useMemo+useEffect 惯例同源,且比该惯例更直接地把构造与析构收进同一 useEffect(见源码核对清单 #4)                                                         |
| B3  | 阻断   | `deps.navigate(...)` 实参未定义却断言 no-op-safe                                            | §3.6 L340、§3.7 L351                                       | ✅ **真修**——订正为"conversation 分支本轮不调用",`navigate` 仅服务两个有具体路由的调用点                                                                                                                 |
| I1  | 重要   | `openSearch` 两条矛盾接线路径(Deps 字段 vs 组件 prop)                                       | §3.7 L369–386、§4.C L506                                   | ✅ **真修**——收敛为单一路径(Deps 字段),并拆出 `ConversationTreeHostDeps` 说明构造归属                                                                                                                    |
| I2  | 重要   | agent_update 增量策略未委托纯函数,违反 §0 自定原则                                          | §1.1 L45(新增 `apply-agent-update.ts`)、§3.3/§3.8、§6 L537 | ✅ **真修**——新纯函数文件 + 对应单测项                                                                                                                                                                   |
| I3  | 重要   | 写路径无失败反馈通道                                                                        | §3.4 表(新增"失败反馈"列)、§3.7 L356(`reportError`)        | ✅ **真修**——Deps 新增字段,重命名/移除两行都补了 reject 分支                                                                                                                                             |
| M1  | 次要   | `ConversationTreeController` 零消费者、提前建缝,且与文档自己拒绝同类模式(subagent→右栏)矛盾 | §3.5 L313–315                                              | ✅ **真删**——接口与工厂函数整段移除,`focusedRootId` 降级为普通只读字段,并明确写出"本轮改正判据不一致"的自我修正                                                                                          |
| M2  | 次要   | `activateNode(nodeId: string)` 丢弃 kind 信息,非法输入行为未定义                            | §3.6 L330–338                                              | ✅ **真修,且优于建议**——签名改为 `activateNode(node: SelectableNode)`,`SelectableNode = Extract<ConversationTreeNode, {kind:"conversation"\|"subagent"}>`,把"project 不可选中"钉进类型系统而非仅文档约定 |
| M3  | 次要   | `pins` 集合从未有字段名/类型/hydrate 声明                                                   | §2 表 L84                                                  | ✅ **真修**——补齐 `pins: readonly ConversationTreePinTarget[]` 字段声明                                                                                                                                  |

### Helm 规范视角(review-p2-standards.md,6 条)

| #   | 严重度 | 议题                                                                                                       | 修订位置                                                          | 核实结论                                                                                                                                                                                |
| --- | ------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | 阻断   | §4.1 处置清单漏列旧主机切换器                                                                              | §4.1 表 L445                                                      | ✅ **真修**——补行,处置口径("零 import,等价重写,随旧路由 cutover")与同表其它行一致                                                                                                       |
| F2  | 阻断   | §4.2 漏审 `desktop-open-targets.ts`,"在 Finder 中显示"照搬硬编码 `editorId:"finder"` 在非 macOS 会静默失效 | §3.7 L352、§4.2 表 L480、§4.A L491(新增 `model/reveal-target.ts`) | ✅ **真修,源码验证准确**——见源码核对清单 #7/#8                                                                                                                                          |
| F3  | 重要   | 置顶/折叠持久化新旧连续性未决策,存在"第二真相源"风险                                                       | §3.4 L309、§4.1 表 L443                                           | ✅ **真修**——明确决策(a):共享同一 AsyncStorage key `"sidebar-pins"`,判别式字面量对齐旧 `kind:"workspace"`(非上一版更顺口的 `"conversation"`),类型定义处(§3.1 L160)已同步落实,非口头承诺 |
| F4  | 中等   | hover card"等价重写"遗漏 `sidebar-agent-state` reconcile 逻辑与 `useHoverSafeZone` 归属判定                | §4.2 表 L475–476、§7 L570                                         | ✅ **真修**——两处分别处理:reconcile 规则诚实标注范围收缩(非静默简化),`useHoverSafeZone` 明确归类 (B) 拷贝而非 import,理由引用 `docs/floating-panels.md` 原文                            |
| F5  | 轻微   | §4.1 缺"合法性先说清"段落(比照 right-sidebar 格式基线)                                                     | §4.1 L436                                                         | ✅ **真修**——补段落,论证结构与引用的先例一致(两条并存活路由 + 本轮触碰面界定)                                                                                                           |
| F6  | 轻微   | `deps.navigate` 契约未说明无真实路由场景下传什么 `route` 值                                                | 无显式 `②F6` 标签                                                 | ⚠️ **实质解决,标签缺失**——见"遗留项"                                                                                                                                                    |

### 正确性视角(review-p2-correctness.md,12 条)

| #    | 严重度 | 议题                                                                                    | 修订位置                                        | 核实结论                                                                                             |
| ---- | ------ | --------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| P0#1 | 严重   | 数据流只订阅 `agent_update`,遗漏 `workspace_update`,复现"重命名不刷新"旧 bug            | §3.1 L130–136(`WorkspaceDetail`)、§3.3 L284–297 | ✅ **真修,源码验证准确**——见下方专项核实                                                             |
| #2   | 高     | hover 卡片四要素声称已确认,契约里却无字段承载                                           | §3.1/§3.3、§4.2 表 L474                         | ✅ **真修**——`workspaceDetails` Map 同时承接标题覆盖与 hover 四要素,一份数据两处消费,非两套逻辑      |
| #3   | 高     | `panelState` 把 `isOffline` 折进 store computed,复现 file-tree 注释明确记录的过期态陷阱 | §3.9 L400–411                                   | ✅ **真修,源码逐字核实一致**——见源码核对清单 #5/#6                                                   |
| #4   | 高     | 状态点优先级与 `deriveAgentStateBucket` 相反(`requiresAttention` 无条件盖过 `error`)    | §3.2 L239–256                                   | ✅ **真修,源码逐字核实一致**——见源码核对清单 #9/#10                                                  |
| #5   | 中     | "复制会话 ID"依赖字段不在契约里                                                         | §3.1 L120–121、§4.2 表 L478                     | ✅ **真修**——补 `sessionId` 字段                                                                     |
| #6   | 中     | `activeNodeId` 清理只判精确 id,不处理"祖先被移除、后代仍选中"                           | §3.8 表 L393                                    | ✅ **真修**——改为可达性判定(沿 `parentAgentId` 链上溯),`unreachableIds` 返回值设计合理               |
| #7   | 中     | 离线重连未点名真实调用点,可用方法不在允许清单内                                         | §3.10 L428、§4.A L495                           | ✅ **真修,源码验证准确**——`runProbeCycleNow` 确实存在且内部去重,已收入允许清单                       |
| #8   | 低     | `build-tree.ts` 无环护栏,需求明文"不设上限"排除小 maxDepth 兜底                         | §6 L533、§7 L564                                | ✅ **真修**——访问集合防环,§7 说明"结构性风险非次要瑕疵"的定性未被弱化                                |
| #9   | 低     | 高频 `agent_update` 重算成本未评估                                                      | §7 L566                                         | ✅ **真修**——给出具体量级判断("几百级别,几毫秒量级,可忽略")而非留白                                  |
| #10  | 低     | 搜索选中后"树滚动定位"无职责落点                                                        | §1.1 L55、§6 L550                               | ✅ **真修**——归入 `conversation-tree-panel.tsx` 职责,援引 file-tree 的 `scrollSelectedIntoView` 先例 |
| #11  | 低     | 主机切换两段式动画机制未讲清                                                            | §3.10 L426                                      | ✅ **真修**——明确裁定"不额外插入连接中动画,两阶段合并进同一 loading 骨架"                            |
| #12  | 低     | 错误态"重试"调用方法未点名                                                              | §3.9 L412                                       | ✅ **真修**——明确"= 重新调用 `store.load()`"                                                         |

**小计**:27 条中 26 条完整核实通过,1 条(F6)实质解决但标签缺失。

---

## 专项裁决:主机切换器"不建 MobX 类"偏离是否成立

**裁决:成立,批准。**

依据(源码逐条核实,见下"源码核对清单" #1–#3):

1. **`HostRuntimeConnectionStatus` 确实已含 `"connecting"`**——`packages/app/src/runtime/host-runtime.ts:48`:`"idle" | "connecting" | "online" | "offline" | "error"`,与架构 §0 L13 的引述逐字一致,不是转述失真。
2. **`runProbeCycleNow` 确实存在且内部去重**——`HostRuntimeStore.runProbeCycleNow(serverId?)`(`host-runtime.ts:1962`)委托给对应 `HostRuntimeController.runProbeCycleNow()`(`host-runtime.ts:734`),后者用 `probeCycleInFlight` 承诺缓存去重(`735–744` 行),与 §3.10 L428 的描述("内部有去重,重复点击不会并发探测两次")完全一致。
3. **§0 的自我订正是自洽的,不是空对空的免责声明**——修订前(据 oop 评审 B1 引述)在 §0 用一句话把 `ConversationTreeStore` 与 `HostSwitcher` 模型层并列断言"都照 MobX 类范式";修订后(§0 L11)这句话**只保留 `ConversationTreeStore`**,`HostSwitcher` 被移出这句泛化断言,另立 L13"订正"段独立论证。这不是文字游戏式的"降低承诺"——L13 给出的判据("有状态+转移才封装成类,不是逢模型必建类")与 §0 开篇的 OOP 立场原文("类只持状态+转移,每处派生/策略委托给同目录纯函数")在逻辑上是**同一条判据的两个推论**,不是新引入一条例外规则去豁免自己。
4. **B1 原始诉求的三个具体缺口都被堵上,不是回避**:(a)状态归属——连接态/主机列表本就是既有响应式 hook 产出,不需要新状态容器,这一点经源码核实为真,不是借口;(b)"点哪个方法"——`runProbeCycleNow(serverId)` 被指名道姓写进 §3.10 且补入 §4.A 允许清单(回应 ③#7,两条评审在此汇合、一次性解决);(c)退避参数——明确"复用 host-runtime 已有的模块级常量,不新增不重置"。

**结论**:这是一次"反过度抽象"的正确判断,不是"逢审必辩"的搪塞——判据本身站得住,三处具体缺口(状态归属、调用点、退避语义)也都给出了可核实的答案,与 §0 立场保持一致,不是选择性适用原则。批准以此方案呈闸 2。

---

## 源码核对清单(本次实际核实,非转述评审文档)

| #   | 断言                                                                                              | 源码位置                                                                                                                    | 核实结果                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | `HostRuntimeConnectionStatus` 含 5 态,含 `"connecting"`                                           | `packages/app/src/runtime/host-runtime.ts:48`                                                                               | ✅ 一致                                                                                                                    |
| 2   | `runProbeCycleNow(serverId?)` 存在,委托 controller                                                | `host-runtime.ts:1962-1968`                                                                                                 | ✅ 一致                                                                                                                    |
| 3   | controller 内部 `probeCycleInFlight` 承诺去重                                                     | `host-runtime.ts:580,734-746`                                                                                               | ✅ 一致                                                                                                                    |
| 4   | `file-tree-region.tsx` 用 `useMemo`(构造)+`useEffect`(注册+清理)双轨模式                          | `shell/components/file-tree-region.tsx:1,31,37-38`                                                                          | ✅ 一致;`ConversationTreeStore` 把构造也收进 `useEffect` 本身(比该先例更直接地保证构造析构成对),不违反"对齐既有惯例"的表述 |
| 5   | `FileTreeStore.panelState` 恰为四态,不含 offline                                                  | `shell/file-tree/model/file-tree-store.ts:213-225`                                                                          | ✅ 一致,逐字匹配架构 §3.9 引述                                                                                             |
| 6   | offline 由组件层三元表达式合成,`isOffline` 是 React prop                                          | `shell/file-tree/components/file-tree-panel.tsx:29,33,53`                                                                   | ✅ 一致(`const panelState = isOffline ? "offline" : store.panelState;`)                                                    |
| 7   | `desktop-open-targets.ts` 的 list→找 kind→用 id 解析方式                                          | `packages/app/src/workspace/desktop-open-targets.ts` 全文                                                                   | ✅ 一致,`DesktopOpenTargetKind = "editor" \| "file-manager"`                                                               |
| 8   | `"finder"` 仅注册于 `darwin`,`"explorer"`仅 `win32`,其余 `"file-manager"`                         | `packages/desktop/src/features/editor-targets.ts:71-98`                                                                     | ✅ 一致,逐条精确匹配(`platforms:["darwin"]`/`["win32"]`/`excludedPlatforms:["darwin","win32"]`)                            |
| 9   | `deriveAgentStateBucket` 优先级 `needs_input>failed>running>attention>done`                       | `packages/protocol/src/agent-state-bucket.ts:22-36`                                                                         | ✅ 一致                                                                                                                    |
| 10  | agent 进入 error 态同一瞬间置位 `requiresAttention:true, attentionReason:"error"`                 | `packages/server/src/server/agent/agent-manager.ts:3892,3920-3929`(`checkAndSetAttention`)                                  | ✅ 一致,`previousStatus !== "error" && currentStatus === "error"` 分支精确同时置位两个字段                                 |
| 11  | `agent_update`/`workspace_update` 是协议里两个独立事件类型                                        | `packages/protocol/src/messages.ts:2902,3014`;`packages/client/src/daemon-client.ts` `DaemonEvent` 联合类型(184-227 行区间) | ✅ 一致,`DaemonEvent` 判别联合里二者是不同分支,互不包含                                                                    |
| 12  | `WorkspaceDescriptorPayloadSchema` 含 title/workspaceDirectory 等字段,支持 hover 卡片数据来源声明 | `packages/protocol/src/messages.ts:2851-2876`                                                                               | ✅ 一致                                                                                                                    |
| 13  | `ProjectPlacementPayloadSchema` 含 `projectKey`/`projectName`,是 `agent_update` upsert 的可选字段 | `packages/protocol/src/messages.ts:2764-2769,2894`                                                                          | ✅ 一致,支撑 §3.3 "upsert 用 project 字段维护 store.projects" 的可行性                                                     |
| 14  | 旧 `render.tsx` 的历史 bug 注释("反馈: 对话重命名保存后名称不变"/"反馈 #48")                      | `packages/app/src/conversation-tree/render.tsx:143,195-196,205,216-217`                                                     | ✅ 一致,引用真实存在且行号基本对应                                                                                         |

---

## 抽查结果(5 条 P2/中/轻微级处置,验证文档真改而非仅打标签)

| 抽查项                   | 结论                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| M3(pins 字段声明)        | ✅ §2 表实际新增字段行,非仅在别处提及                                                           |
| F5(合法性先说清段落)     | ✅ §4.1 实际新增完整论证段落,结构对齐 right-sidebar 先例,非一句带过                             |
| ③#9(高频重算成本)        | ✅ §7 实际给出量级判断句("几百级别过滤/排序,几毫秒量级,可忽略,暂不需要节流"),非泛泛"性能可接受" |
| ③#11(两段式切换动画机制) | ✅ §3.10 实际给出明确裁定("不额外插入连接中动画"),消解了原评审指出的"机制未讲清"的歧义          |
| ③#12(重试按钮调用方法)   | ✅ §3.9 实际新增一句精确绑定("重试 = 重新调用 store.load()"),不是停留在"几乎可以肯定"           |

5/5 抽查项确认为实质文本修改,非仅补标签、不换实质。

---

## 全文一致性扫描

对 27 处编辑逐一检查交叉引用与残留矛盾表述,重点扫描项:

- **`ConversationTreeController`/`asConversationTreeController`**:全文仅剩 §3.5 一处引用,且是"本轮删除,不是改名,是真删"的自我说明性引用,不是遗留的实现引用——✅ 无残留矛盾。
- **`ConversationTreePinTarget` 判别式字面量**:全文两处出现(`§3.1` 类型定义用 `"workspace"`,`§3.6` `SelectableNode` 用 `"conversation"|"subagent"` 是另一个判别联合`ConversationTreeNodeKind`,非同一类型)——✅ 未见新旧字面量混用的矛盾。
- **旧版"仅 `useMemo` 换 key"表述**:全文两处提及,均以"非上一版的……"或"不能只用……"的对比句式出现,是有意保留的前后对比而非遗留的现行表述——✅ 无歧义。
- **旧版"`deps.navigate(...)` no-op-safe"表述**:全文仅 §3.6 一处,且明确是"上一版这里写……但……订正为"的对比句——✅ 无歧义。
- **旧版"`requiresAttention` 无条件优先"表述**:全文仅 §3.2 一处,同样是"订正:不再是……"的对比句——✅ 无歧义。
- **旧版"只订阅 `agent_update`"表述**:全文仅 §3.3 一处,同样是"上一版……现已订正"的对比句——✅ 无歧义。
- **§0/§1.2/§3.10 三处对 host-switcher 的描述**:立场(§0)→内部切法(§1.2)→具体实现(§3.10)三层逐级具体化,判据一致,无前后矛盾——✅ 通过。
- **章节编号与交叉引用**(如"见 §3.3/§3.8""见 §4.2"等):抽查约 15 处交叉引用,目标章节均存在且内容对应——✅ 未见断链引用。

**扫描结论**:未发现 27 处编辑之间的交叉引用、术语或节号冲突;所有"上一版如何、本轮如何"的对比表述都清晰区分历史与现状,不会被误读为当前仍然成立的设计。

---

## 遗留项(不阻断,建议顺手处理)

1. **②F6 缺显式标签**:`deps.navigate` 的"无真实路由场景下传什么值"这一问题,实质已因 ①B3 的修正而消解(conversation 分支本轮根本不调用 `deps.navigate`,该 deps 字段收窄到两个有具体路由字符串的调用点)——但全文搜索不到任何 `②F6` 或对应交叉引用标签。建议在 §3.6 或 §3.7 补一句"(连带回应闸 2 评审 ②F6)",纯粹是可追溯性的完善,不影响设计本身,不建议因此打回。
2. **(旁记,非本文档缺陷)** `review-p2-correctness.md` 自身的严重度汇总("发现 13 条:严重1/高3/中4/低5"=13)与其实际列出的 12 个编号发现(#1–#12,对应 1+3+3+5=12)有 1 条计数误差(P2 档实际 3 条而非 4 条)。这是评审文档自身的算术小误差,不影响本次复核结论(27 条总数按实际条目计算无误),仅记录供以后勘误参考。

---

## 复核范围说明

本次复核为"修订闭合验证",非重新展开的全量架构评审——三份评审文档中"已验证无问题项清单"/"复用点核真结果"/"零旧依赖审计核查表"里标记为✅通过、修订未触及的部分(如纯函数清单的 YAGNI 核查、`OpenTabRequest.kind` 现状核实、`shell-root.tsx:75` 占位等)本轮不重复核实,直接沿用原评审结论。
