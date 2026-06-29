# CodePilot 借鉴研究 ② —— Harness 三层 + 跨 runtime 统一

> 研究对象:CodePilot(`/Users/wangbingkun/Desktop/coding/person/WolffyCode/CodePilot-main`)把三种异构 agent 框架(Claude Code SDK / CodePilot Native = 自研 AI-SDK agent loop / Codex app-server)缝进同一套 session/permission/tool/event UI,并让自家注入的工具(Memory/Widget/Tasks/Media/Dashboard/CLI)跨这三种 runtime 都被 agent 感知调用的那一层。
> 服务对象:Helm(`/Users/wangbingkun/Desktop/coding/person/WolffyCode/paseo-main`,Paseo fork),将来同样要把 Claude Code / Codex / Copilot / OpenCode / Pi 统一进一套 UI。
> 引用格式:`文件:行号`。所有路径相对各自仓库根。只读研究,未改动 CodePilot 任何文件。

---

## A. CodePilot 怎么做的

### A.0 一句话总览

CodePilot 把"接一个新 agent"明确拆成三条互不串味的轴,并用一句口诀钉死边界:

> **Provider 只决定模型从哪里来;Runtime 决定 Agent 协议怎么跑;Harness 决定能力怎么被看见、调用、回传、渲染。**

(口诀见 `docs/exec-plans/completed/phase-5e-runtime-harness-architecture.md`,核心原则段。)它把 Codex 接了三天的痛,归因为"以为 Runtime 重构已完成三层解耦,实则三层在代码里仍交叉",于是补上一套**契约 + 纯函数编译器 + 漂移测试**来强制解耦。

### A.1 三层边界:Shell / Runtime / Harness 各 own 什么

| 层 | 名字 | own 什么 | 不准碰什么 |
| --- | --- | --- | --- |
| L1 | **Shell** | 聊天 UI、Settings、Sessions、Artifact 渲染、DB、权限 UI | 不知道有几种 agent;只消费统一事件并 |
| L2 | **Runtime(Agent Framework)** | 一种执行协议:tool schema、session/permission 模型、streaming 契约。三个实现互换:`claude_code` / `codepilot_runtime` / `codex_runtime` | 不准重写 Harness 工具、不准自造 token 估算公式、不准 hardcode 能力 prompt |
| L3 | **Harness** | 注入能力:Memory / Widget / Tasks / Media / Dashboard / CLI / Skills / MCP / Workspace rules。每个 Runtime 都得尊重它 | 不准散落在各 Runtime 里各写一份 |

Harness 自身再分三小层(`phase-5e` 文档):
1. **Built-in Harness**(CodePilot 自带,载体 `src/lib/harness/capability-contract.ts`);
2. **User CodePilot Harness**(用户在 Settings 加的 MCP/Skills/slash/CLAUDE.md,须跨 runtime 有意义);
3. **External Framework Harness**(用户在 `~/.claude`、`~/.codex` 里的原生配置,须跨 runtime **可感知**,执行按各 runtime 协议)。

边界的**结构性保证**(不是约定俗成):三个 runtime 入口文件(`claude-client.ts` / `builtin-tools/index.ts` / `codex/proxy/unified-adapter.ts`)**禁止直接 import `context-compiler`**,只能经 `runtime-adapter.ts` 这层 facade 进编译器(`src/lib/harness/runtime-adapter.ts:13-31, 280-283`)。漂移测试 grep `from '@/lib/harness/context-compiler'` 必须返回 0 行。

### A.2 Runtime registry:怎么注册 + 解析

注册表极薄,就是一个 `Map<string, AgentRuntime>`(`src/lib/runtime/registry.ts:21-37`):`registerRuntime` / `getRuntime` / `getAllRuntimes` / `getAvailableRuntimes`(后者按 `r.isAvailable()` 过滤)。

每个 runtime 实现的契约也刻意做薄(`src/lib/runtime/types.ts:19-41`):
```
interface AgentRuntime {
  id; displayName; description;
  stream(options): ReadableStream<string>;   // 唯一核心方法:options 进 → SSE 行出
  interrupt(sessionId); isAvailable(); dispose();
}
```
注释明确写了设计原则:"stream() 是唯一核心方法……**Keep the interface thin: don't abstract tools, messages, or permissions**"(`types.ts:16-18`)。输入用一个 universal `RuntimeStreamOptions`,runtime-specific 字段塞进 `runtimeOptions?: Record<string, unknown>` 透传(`types.ts:47-87`)。

`resolveRuntime(overrideId?, providerId?)` 是核心解析器(`registry.ts:72-152`),优先级很有讲究:
- **0. Codex 显式**:`overrideId==='codex_runtime'` 或(auto 且 stored setting 为 codex)→ 用 Codex,**不可用就 fall through 但绝不退回 legacy**(Codex Account 是不同 wire format,退回会变成"说运行了 X 实际跑了 Y")(`registry.ts:75-87`)。
- **1. 显式 override(claude-code-sdk / native)**:这是对**本次请求**的强意图(会话 pin)。若 pin 了 SDK 而 SDK 没装,**throw 报错而不是悄悄降级到 Native**(`registry.ts:102-111`)。注释原文:"Don't pretend you ran X when you really ran Y"。
- **2. `cli_enabled=false`** → native(legacy gate,仅在无显式 override 时)。
- **3. 全局 stored setting**:**故意不 fail-closed**——存量值可能过期,沿用"悄悄降级到可用 runtime"的旧 UX(`registry.ts:124-135`)。
- **4. auto**:装了 Claude CLI → SDK,否则 → Native(`registry.ts:137-149`)。

> 关键教训钉在注释里(`registry.ts:7-15`):auto 早期会综合 env / DB / `~/.claude/settings.json` 做"凭据推断",在边缘场景频繁出错(Sentry 高位告警),后来**简化为二元 binary check**,把"没凭据"交给上层入口精准拦截,不让决策层瞎猜。

还有个孪生函数 `predictNativeRuntime(providerId?)`(`registry.ts:167-198`):**不实例化 runtime** 就预测会走哪个,好让调用方提前准备对应的 MCP 配置——这是"决策与副作用分离"的小范式。

### A.3 一个 turn 的事件:三种异构源 → 一套 UI 模型

核心是 `src/lib/runtime/contract.ts`:把整个事件面塌缩成 **8 个 canonical run event + 1 个 fallback**,外加 **4 个 permission event** 和 1 个 opaque session ref、1 个 capability matrix(`contract.ts:14-18`)。

- **Run 事件**(`contract.ts:80-160`):`assistant_delta` / `tool_started` / `tool_completed` / `command_started` / `file_changed` / `usage_updated` / `run_completed` / `run_failed` / **`unknown_item`**。每个事件带 `runtimeId + sessionId` base。
- **`unknown_item` 是强制 fallback**(`contract.ts:72-78, 150-160`):"adapters that drop unknown items silently violate the contract";UI 必须渲染成 generic block(如 "Codex item: <sourceType>"),**绝不静默丢弃**——这正是新 plugin/extension item 在专属渲染器写出来之前仍可见的机制。
- **Permission 事件**(`contract.ts:174-245`):`permission_request` / `granted` / `denied` / `unavailable`。保守默认:adapter 拿不准语义就发 `permission_unavailable`(**不发 `granted`**)(`contract.ts:170-172`)。
- **`RuntimeSessionRef`**(`contract.ts:51-66`)是 opaque handle:consumer 禁止 inspect `metadata`,只有产出它的 adapter 能读回;**runtime 切换必须保留其他 runtime 的 ref**(一个 session 同时存 SDK ref 与 Codex ref,切 picker 不擦任何一个)——"持久层应每 runtime 存一个 ref,而不是单个全局 ref"。

每个 adapter 把自己的原生事件翻译成这套 union。SDK 的映射表是显式声明的(`src/lib/runtime/event-adapter.ts:171-193`):`SDK_SSE_TO_CANONICAL` 把 17 种 SDK SSE 类型映成 canonical;关键在于**三类返回值刻意区分**(`event-adapter.ts:148-169`):canonical 类型(有直接映射)/ `null`(已知的纯 transport,如 `keep_alive`、`permission_request` 走单独通道)/ `'unknown_item'`(表里没有 → 调用方**必须** `makeUnknownItem` 兜住)。注释点名这是 Codex review 的 P2 修复:早期版本把"已知 transport-only"和"adapter 不认识"混为一谈,**静默丢了新 item 类型**。

构造器集中在 `event-adapter.ts:63-146`(`makeAssistantDelta` / `makeToolStarted` / …/ `makeUnknownItem`),让 canonical 形状只有一处来源。注释还点了 Codex 的前瞻设计:`command_started` 是为"明确区分 shell 命令启动 vs 工具启动"的 runtime(Codex)预留的,SDK 把两者都塌进 `tool_use`,所以 SDK 今天不发 `command_started`(`event-adapter.ts:36-44`)。

### A.4 自家工具怎么跨 runtime 注入(capability contract / mutationLevel / 诚实降级)

**(1) 单一真理源:capability-contract**
`src/lib/harness/capability-contract.ts` 是声明式 catalog。它存在的**根因写得极透**(`capability-contract.ts:9-45`):ClaudeCode 稳是因为 SDK 原生懂 MCP/tools/permissions;Codex Account 稳是因为它端到端跑自己的栈;而 **Codex Runtime + CodePilot provider 走的是超长 pipeline**(`Codex app-server → Responses proxy → AI SDK streamText → upstream model → Responses SSE → Codex app-server → UI`),每一段翻译都是契约可能漂移的点——结果是 `WIDGET_SYSTEM_PROMPT` 在三处各有一份(canonical 30 行 / 缩水 14 行 / Codex bridge 又一个改写版),"同一产品面、不同规则"(`capability-contract.ts:33-45`)。

每个 capability 一条 `CapabilityContract`(`capability-contract.ts:178-198`),声明:`id` / `displayName` / `status` / `toolNames` / **`exposure`(三 runtime 各一格)** / `systemPromptFragment`(三 runtime 必须 verbatim 注入,漂移测试断言)/ artifact 契约 / UI 渲染路径。`systemPromptFragment` 直接 import 自各自的真理文件(`capability-contract.ts:91-96`),不是抄字符串。

**(2) RuntimeExposureKind —— 每个 runtime 怎么挂这个能力**(`capability-contract.ts:134-150`):`mcp_server`(SDK 内进程 MCP)/ `ai_sdk_tool`(Native streamText 内)/ `bridge_executable`(Codex Responses proxy 服务端执行,结果经 side-channel 回 UI)/ `bridge_passthrough`(Codex 原生工具,proxy 保留但不执行)/ **`unsupported`**(本 runtime 故意不暴露)。

**(3) status 的严格语义**(`capability-contract.ts:102-132`):`live` **要求所有声明 runtime 的 exposure 都不是 `unsupported`**——任何"live 但某 runtime unsupported"的混合口径自动 fail。`deferred` = 有 runtime 暂 unsupported 但带 `deferredReason`;`unsupported` = 全 runtime 关闭且必须给原因。

**(4) 跨 runtime 注入的统一路径**:三个 facade(`runtime-adapter.ts:266-388`)`adaptForClaudeCode` / `adaptForNative` / `adaptForCodexProxy` 都先调纯函数 `compileContext`,各自拿回**正好它需要的形状**:SDK 拿 `{ systemPromptAppend, mcpServerNames, allowedToolNames }`,Native 拿 `{ systemPromptText, toolSetKeys }`,Codex 拿 `{ systemPromptInstructions, builtinToolNames, stopWhen, stepCount }`。facade 是纯函数(无 IO),"给定这组能力,我这个 runtime 向模型暴露什么、prompt 怎么拼进去"(`runtime-adapter.ts:26-31`)。
- 实际工具复用机制见 `src/lib/builtin-mcp-bridge.ts:25-48`:`bridgeMcpTool` 把 SDK 风格 MCP tool(`tool(name, desc, zodSchema, handler)`,返回 `{content:[{type:'text'}]}`)**适配成** Vercel AI SDK tool(`{description, inputSchema, execute}`,返回 string),从而"22 个 handler 跨 7 个文件不用重写,SDK 文件仍是 handler 逻辑的真理源"(`builtin-mcp-bridge.ts:5-11`)。

**(5) mutationLevel —— 权限分级**(`src/lib/harness/mutation-level.ts`):四级(`mutation-level.ts:32-52`):
- `safe_read`(纯读,wrapper 跳过 permission)/ `mutating_local`(改 CodePilot 本地状态)/ `mutating_external`(shell、装包、第三方计费 API、媒体库外写文件——最危险)/ `side_effect`(用户可感知但不改状态,如 notify)。
- 中心化分类表 `CODEPILOT_TOOL_MUTATION_LEVELS`(`mutation-level.ts:61-100`)+ `CORE_SAFE_READ_TOOLS`(Read/Glob/Grep/Skill)。
- **fail-safe 默认**:`shouldSkipPermission`(`mutation-level.ts:119-123`)只对 `safe_read` 返 true;**表里没分类的工具一律走 ask**(`mutation-level.ts:131-134` 返 undefined → caller 当 ask 处理)。注释钉死动机(`mutation-level.ts:16-23`):旧的 `name.startsWith('codepilot_')` 前缀把危险工具(`codepilot_cli_tools_install`、`codepilot_notify`)一路放行;现在把分类权推给"知道读写语义的工具作者"。

**(6) 诚实降级 —— capability matrix**(`src/lib/harness/capability-matrix.ts`):Settings UI 消费的是从 contract + mutation-level **纯派生**出来的矩阵(`capability-matrix.ts:5-9`,禁止平行手写表,漂移即 build fail)。每个 `Runtime × capability` 格子四态(`capability-matrix.ts:37-41`):`executable` / `perception_only` / `unavailable` / `undetermined`。派生逻辑(`deriveCell`,`capability-matrix.ts:226-265`):
- exposure 是 `unsupported` 且别处有 executable runtime → `perception_only`(给 "切到 X Runtime 启用" hint);别处也没有 → 真 `unavailable`。
- executable 的格子额外派生 `trustBoundary`(`auto_safe`/`requires_approval`/`side_effect`/`mixed`,`capability-matrix.ts:181-208`)给 UI 打信任徽章。
- 还有 provider 级二次降级(`capabilityMatrixForRuntimeProvider`,`capability-matrix.ts:401-440`):`codex_account` 走不通 CodePilot proxy 注入,于是把 bridge-only 能力 demote 成 `perception_only` 并给"切到 Native/ClaudeCode"的诚实文案,**绝不悄悄假装能用、绝不渲染假数据**。

---

## B. 值得抄的设计 + 坑(每条带动机)

1. **三 Runtime invariant 统一:8+1 canonical 事件 union(`contract.ts`)。**
   动机:三种异构源若让原始形状透到 UI,UI 就得到处 `if (runtime===...)`;加第三种 runtime 直接让分支面积翻三倍(`contract.ts:6-13`)。塌缩成一个 union 后,**UI 只消费 union,加 runtime = 写一个 adapter + 一张映射表,UI 零改动**(`event-adapter.ts:44-47`)。

2. **`unknown_item` 强制兜底 + 映射表"三态返回"。**
   动机:新 SDK 版本/Codex plugin 随时冒出没见过的 item。若静默丢,用户会"看到 agent 干了活但界面空白"。强制 fallback 让未知 item 至少以 generic block 可见(`contract.ts:150-160`)。坑:映射表必须区分"已知但不渲染(null)"和"压根不认识(unknown_item)",CodePilot 早期把两者混了,**静默丢新类型**,是被 Codex review 揪出来的 P2(`event-adapter.ts:148-169`)。

3. **capability contract:单一真理源 + verbatim system prompt + 漂移测试。**
   动机:同一能力的 prompt/schema/渲染若各 runtime 各写一份,必然漂移(CodePilot 真出现 3 份 widget prompt,`capability-contract.ts:33-45`)。catalog 一条声明 + 各 runtime verbatim 注入 + `*.test.ts` 漂移断言,把"接 Codex"从"现场补 proxy/bridge/media/widget"变成"实现 exposure factory 或显式标 unsupported"(`capability-contract.ts:72-89`)。**这是把三天痛根治的那块**。

4. **capability matrix:诚实降级,四态而非"有/无"。**
   动机:用户必须知道"这个能力在当前 runtime 能不能用、不能用切哪去"。`perception_only` 带 `suggestedRuntime`,`unavailable` 带 reason(`capability-matrix.ts:43-100`)。原则:**不诱导模型瞎猜、不渲染假数据、Settings 诚实提示**。坑:matrix 必须从 contract **派生**而非手写,否则 Settings 文案与真实注入行为会打架(`capability-matrix.ts:284-322` 记录了 Codex 把 dashboard/cli 从 perception 提升为 executable 时,必须在矩阵同步,否则"Settings 说不可调,模型却能调"的 drift)。

5. **mutationLevel 取代前缀 allowlist,fail-safe 到 ask。**
   动机:按工具名前缀/手维护白名单不 scale,漏一个就静默放行危险工具。把分类下放到工具作者声明处,未分类 = 默认 ask(`mutation-level.ts:16-29, 119-134`)。

6. **为什么不能把工具包装成 Agent(反模式)。**
   口诀划清:**Agent 拥有自己的 event loop / session 生命周期 / permission 语义 / 原生 tool schema;Tool(Skill/MCP/CLI)只是你暴露给 Agent 的一个能力,在 Agent 的 turn 内被调用**。把工具包成 Agent 会让工具去抢 turn loop、各自管 session、各写 permission——正是 CodePilot "Harness 能力散在 MCP / AI-SDK tools / Codex bridge / system prompt / artifact parser 里"的病根(`phase-5e` 文档核心原则段;`capability-contract.ts:19-45` 是这条病的活证据)。正解是反过来:工具的 handler 写一份(SDK MCP 形态),`bridgeMcpTool` 适配进别的 runtime,而不是为每个 runtime 起一个"工具 agent"。

7. **薄 Runtime 接口 + opaque session ref 的"每 runtime 一份"持久化。**
   动机:`AgentRuntime` 只暴露 `stream/interrupt/isAvailable/dispose`,不抽象 tools/messages/permissions(`types.ts:16-18`),换 runtime 成本最小;session ref 每 runtime 各存一份,切换不互擦(`contract.ts:45-49`)。

8. **解析器 fail-closed vs 故意 fall-through 的分寸。**
   显式 override(会话 pin)fail-closed(throw 真错),全局 stored setting 故意 fall-through(存量值可能过期)(`registry.ts:42-70, 124-135`)。坑:auto 别做凭据推断,二元 binary check + 上层精准拦截(`registry.ts:7-15`)。

---

## C. 映射到 Helm

Helm 已经有相当完整的一套抽象,很多地方与 CodePilot 同构,但**统一契约的"强制力"和"诚实降级"两块比 CodePilot 弱**。逐条对应:

### C.1 Runtime registry ↔ Helm provider registry(已对齐)
- CodePilot `AgentRuntime`(`runtime/types.ts:19-41`)≈ Helm `AgentClient` / `AgentSession`(`packages/server/src/server/agent/agent-sdk-types.ts:649-697, 598-637`)。Helm 接口更厚(显式有 `getPendingPermissions/respondToPermission/setMode/revert*`),但本质都是"每 provider 实现一份契约,前端不感知具体 provider"。
- CodePilot `Map<string,AgentRuntime>` + `resolveRuntime`(`registry.ts:21-152`)≈ Helm `buildProviderRegistry()` / `PROVIDER_CLIENT_FACTORIES` / `getAgentProviderDefinition(id)`(`provider-registry.ts`)。**Helm 已经做对了**:工厂表 + 按 id 查找。
- **可借鉴**:CodePilot `predictNativeRuntime`(不实例化就预测路由,提前备好 MCP 配置)这种"决策/副作用分离"小范式,Helm 在 `provider-launch-config.ts` / `runtime-mcp-config.ts` 一侧可参考——尤其当某 provider 需要不同的内置 MCP 注入策略时。

### C.2 事件统一 ↔ Helm timeline(已对齐,且 Helm 的 fallback 已存在)
- CodePilot 8+1 union(`contract.ts`)≈ Helm `AgentTimelineItem` 判别式 union(`agent-sdk-types.ts:366-373`)+ `AgentStreamEvent`(`:375-426`),且每个事件带 `provider` 字段。
- **关键好消息**:Helm 的 `ToolCallTimelineItem` **已经有 `type:"unknown"` 兜底**(`agent-sdk-types.ts:318-320`),与 CodePilot `unknown_item` 同philosophy。建议把这条**上升为显式契约**:像 CodePilot 那样,(a) 在文档/测试里钉死"任何 provider 不认识的 item 必须落 `unknown` 而非丢弃";(b) 在每个 provider 的事件映射处,区分"已知但 UI 忽略"与"压根不认识"两类(CodePilot 被这条坑过,见 B#2)。Helm 现在靠 provider 各自老实,缺一个 grep 级强制。
- CodePilot 的 `command_started`(shell vs tool 区分)对 Helm 也现成:Helm `ToolCallTimelineItem` 已细分 `shell/read/edit/write/search/fetch/...`(`agent-sdk-types.ts:226-318`),粒度比 CodePilot 还细。

### C.3 capability 契约 ↔ Helm 的 `AgentCapabilityFlags`(Helm 是弱版,最该补)
- Helm 现有 `AgentCapabilityFlags`(`packages/protocol/src/agent-types.ts:138` 起:`supportsStreaming/SessionPersistence/DynamicModes/McpServers/ReasoningStream/ToolInvocations/Rewind*`)。这是**provider 级布尔旗**,客户端读旗决定 UI/feature 可用性——对应 CLAUDE.md 的 `server_info.features.*` + feature 契约。
- **差距**:Helm 的 capability 是"provider 支不支持某协议能力"(streaming、rewind…),**没有 CodePilot 那种"自家注入工具 × runtime 的能力矩阵 + 诚实降级文案"**。Helm 当 Helm 开始注入自己的工具(它已有 `paseo` 内置 MCP,见 C.5)并想跨 provider 一致时,会正面撞上 CodePilot 那三天的问题。建议**提前引入一个 Helm 版 capability-contract**:
  - 一条声明 = `{ id, toolNames, perProvider exposure(mcp/acp-native/unsupported), systemPromptFragment(verbatim), status(live/deferred/unsupported) }`;
  - 从它**派生**一张 `provider × 内置能力` 矩阵给 Settings(四态 + suggestedProvider),而不是手写;
  - 用 vitest 漂移测试钉死"live ⇒ 所有 provider exposure 非 unsupported"和"prompt fragment verbatim"。
- 落点建议:`packages/server/src/server/agent/` 下新增 `harness/`(contract + matrix + mutation-level + adapter),与现有 `provider-registry.ts` 平行;矩阵的四态结果作为只读快照经 `server_info` 暴露给 client(类比现有 `ProviderSnapshotEntry`,`agent-types.ts:102-113`),client 端无 fallback 路径(符合 CLAUDE.md 的 feature 契约)。

### C.4 权限分级 ↔ Helm permission(可加 mutationLevel)
- Helm 已有统一 `AgentPermissionRequest/Response`(`agent-sdk-types.ts:444-470`)+ `respondToAgentPermission`(`permission-response.ts:22-40`),provider 各自实现 `respondToPermission`。这层比 CodePilot 的 permission union 更成熟(有 `followUpPrompt` 续 turn)。
- **可借鉴**:当 Helm 注入**自家**工具时,给每个自家工具标 `mutationLevel`(`safe_read` 自动放行 / 其余 ask,未分类 fail-safe 到 ask),并由此派生 Settings 的信任徽章(CodePilot `mutation-level.ts` + matrix `trustBoundary`)。对 provider 原生工具不需要(provider 自己管 auth——符合 CLAUDE.md "NEVER add auth checks")。

### C.5 内置工具注入 ↔ Helm `paseo` MCP(已对齐,且 Helm 的注入更协议无关)
- CodePilot 用三套 exposure(MCP / AI-SDK / bridge)+ `bridgeMcpTool` 复用 handler(`builtin-mcp-bridge.ts`)。Helm 走的是**更干净的路线**:`withRuntimePaseoMcpServer()`(`runtime-mcp-config.ts:29-58`)把一个 **HTTP MCP server**(name `paseo`,URL 带 `callerAgentId`,Bearer auth)注入进任意 provider 的 MCP 配置——**协议无关,一份实现跨所有支持 MCP 的 provider**。这其实**优于** CodePilot 的"每 runtime 一种 exposure 形态"。
- **代价/缺口**:HTTP-MCP 注入只覆盖**支持 MCP 的 provider**(Helm capability 里 `supportsMcpServers`)。对**不支持 MCP 的 provider**(如 Pi,据现状 `supportsMcpServers:false`),Helm 自家工具就到不了 agent——这正是 CodePilot capability-contract 要诚实表达的格子:该 provider 上把内置能力标 `perception_only/unsupported` 并在 UI 说明,而不是假装可用。这是 Helm 引入 capability-contract 的最直接动机。
- 另注:Helm 已有 `stripInternalPaseoMcpServer()`(注入前剥离持久化痕迹,`runtime-mcp-config.ts:6-27`)——比 CodePilot 干净,值得保留。

### C.6 Helm 能提前避开的 CodePilot 教训
1. **别在 runtime 决策层做凭据推断**(`registry.ts:7-15`)——Helm 用 provider 的 `isAvailable()` + 上层入口拦截,保持二元。
2. **别让自家工具的 prompt/schema 在各 provider 各写一份**——一上来就单一真理源 + verbatim 注入 + 漂移测试,别等漂移出 3 份再治。
3. **事件映射区分"已知忽略 / 未知兜底"**——Helm 已有 `unknown` item,顺手把这条写成测试钉死,免得将来某 provider 静默丢 item。
4. **Settings 诚实四态**——Helm 现在是布尔旗(能/不能),建议升级成"executable / perception_only(切到 X)/ unavailable(原因)",尤其针对 MCP-不支持的 provider。
5. **fail-closed 的分寸**——会话级 pin 的 provider 不可用就明确报错,别悄悄换 provider 跑(CodePilot 的 "Don't pretend you ran X" 教训,`registry.ts:96-111`)。

---

## D. 不适用 / 风险

1. **进程内 vs 跨进程架构根本不同。** CodePilot 是 Electron 单体,runtime 在同进程内直接 `stream(): ReadableStream`,UI 直接消费 SSE;Helm 是 **daemon ⇄ WebSocket RPC ⇄ Expo/RN client** 的 C/S。CodePilot 那套"facade 返回正好 UI 需要的形状"得改造成"daemon 侧 projection + 协议消息",不能照搬 `ReadableStream` 心智。Helm 已有 `timeline-projection.ts` + `agent-stream-coalescer.ts` 做这件事,这是 CodePilot 没有的一层,别丢。

2. **协议 back-compat 约束。** CodePilot 可以一次性重写 contract(单体、无外部老 client);Helm 的协议**必须双向 back-compat**(CLAUDE.md 协议契约)。引入 capability-contract/matrix 时,新字段一律 `.optional()` + 默认,经 `server_info.features.*` 暴露且带 `COMPAT(name)` 注释(repo 现有 68 处 `COMPAT(`)。**不要**把 CodePilot 的"feature 自由破坏"误用到协议层。

3. **Helm 的 provider 集合更大更杂(含 ACP)。** CodePilot 只三种 runtime;Helm 有 Claude/Codex/Copilot/OpenCode/Cursor/Pi,其中多家走 **ACP**(`acp-agent.ts`)。ACP 已是一层标准化协议,Helm 在 ACP 之上再叠 CodePilot 式 harness contract 时,要避免**双重抽象**:能力矩阵应表达"ACP provider 是否原生支持某能力",而非把 ACP 再包一层 runtime-adapter。

4. **CodePilot 的 `builtin-mcp-bridge.ts` 当前是半成品**(`getBuiltinMcpTools` 返回空,`builtin-mcp-bridge.ts:71-83` 注释 "return empty — incrementally bridged")——说明"一份 handler 跨 runtime 复用"在 CodePilot 也没完全落地。Helm 的 HTTP-MCP 注入(C.5)其实是更优解,**别为了对齐 CodePilot 反而退回 per-runtime bridge**。

5. **过度工程风险。** CodePilot 的 capability-contract/matrix/mutation-level/display-text 合计上千行,且大量复杂度来自"Codex Account 不走 proxy"等具体死角(`capability-matrix.ts:324-440`)。Helm 应**按需引入**:先上"单一真理源 + verbatim prompt + unknown 兜底测试"这三件**低成本高回报**的,矩阵四态与 mutationLevel 等 Helm 真正开始大规模注入自家工具、且出现 MCP-不支持 provider 时再上。不要一次性照抄全套。

---

## 附:关键文件索引(CodePilot,只读参照)

| 关注点 | 文件 |
| --- | --- |
| Runtime 接口(薄) | `src/lib/runtime/types.ts:19-41` |
| Registry + resolveRuntime | `src/lib/runtime/registry.ts:21-198` |
| 8+1 事件 / 4 permission / session ref / capabilities union | `src/lib/runtime/contract.ts` |
| SDK→canonical 映射 + 三态返回 + unknown 兜底 | `src/lib/runtime/event-adapter.ts:148-238` |
| capability 单一真理源(exposure/status/fragment) | `src/lib/harness/capability-contract.ts:102-198` |
| capability 矩阵(四态 + 诚实降级 + trustBoundary) | `src/lib/harness/capability-matrix.ts` |
| mutationLevel(四级 + fail-safe) | `src/lib/harness/mutation-level.ts` |
| 三 runtime facade(纯函数,经此进编译器) | `src/lib/harness/runtime-adapter.ts:160-388` |
| SDK MCP tool → AI-SDK tool 适配 | `src/lib/builtin-mcp-bridge.ts:25-48` |
| 设计文档 | `docs/exec-plans/completed/phase-5e-runtime-harness-architecture.md`、`phase-5d-harness-capability-contract.md`、`docs/handover/agentic-architecture-map.md`、`docs/guardrails/Runtime.md` |

| 对照点 | Helm 文件 |
| --- | --- |
| provider 契约 | `packages/server/src/server/agent/agent-sdk-types.ts:598-697` |
| provider 注册 | `packages/server/src/server/agent/provider-registry.ts` |
| 统一 timeline(含 `unknown` 兜底) | `packages/server/src/server/agent/agent-sdk-types.ts:226-426` |
| projection / coalescer(daemon 侧,CodePilot 无) | `packages/server/src/server/agent/timeline-projection.ts`、`agent-stream-coalescer.ts` |
| capability flags | `packages/protocol/src/agent-types.ts:138` 起 |
| 权限统一 | `packages/server/src/server/agent/permission-response.ts`、`agent-sdk-types.ts:444-470` |
| 内置 MCP 注入(HTTP,跨 provider) | `packages/server/src/server/agent/runtime-mcp-config.ts:6-58` |
| feature 契约 / server_info.features | `packages/protocol/src/messages.ts:675, 2296, 3799`(`AgentFeatureSchema`) |
