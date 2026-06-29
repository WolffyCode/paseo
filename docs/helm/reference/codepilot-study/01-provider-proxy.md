# CodePilot 借鉴研究 ① — Provider 中转站 / Codex Proxy / 兼容矩阵

> 研究对象:`CodePilot-main`(Electron + Next.js + TypeScript + SQLite,三 runtime:Claude Code SDK / CodePilot Native / Codex)。
> 服务对象:**Helm**(Paseo fork,Expo/RN + WebSocket RPC + 文件式 JSON 持久化)。
> 目的:为「被董事长否决的三层 providers」(提供方→供应商→模型)找一套已跑通的参照实现。
> 证据格式:`相对路径:行号`(CodePilot 根 = `CodePilot-main/`,Helm 根 = `paseo-main/`),关键论断必带证据。
> 只读研究,未改动 CodePilot 任何文件。

---

## A. CodePilot 怎么做的

### A.1 数据模型:provider → preset/protocol → model(三层但命名不同)

CodePilot 没有用「供应商(vendor)」这个词,但**实质就是三层**,只是把第二层拆成「DB 里的 provider 行(带 base_url+key)」+「catalog 里的 preset 模板」两个东西:

| CodePilot 概念 | 是什么 | 证据 |
| --- | --- | --- |
| **Protocol**(wire 协议) | `anthropic / openai-compatible / openrouter / bedrock / vertex / google / *-image`,**用协议而非品牌名分发** | `src/lib/provider-catalog.ts:20-28` |
| **AuthStyle** | `api_key / auth_token / env_only / custom_header` | `src/lib/provider-catalog.ts:33-38` |
| **VendorPreset**(内置服务模板) | 40+ 个已知服务商模板:`key/name/protocol/authStyle/baseUrl/defaultModels/defaultRoleModels/meta` + `sdkProxyOnly` + `meta.claudeCodeVerified`。这是「供应商目录」 | 定义 `provider-catalog.ts:87-176`,数组 `VENDOR_PRESETS` @ `:455` |
| **ApiProvider**(DB 行,用户实例) | `id/name/provider_type/protocol/base_url/api_key/is_active/headers_json/env_overrides_json/role_models_json/options_json`。这是用户配置的「供应商实例」 | DB schema(`src/lib/db.ts`),字段引用见 `provider-resolver.ts:43-95` |
| **CatalogModel**(模型) | `modelId/upstreamModelId/displayName/role/capabilities{reasoning,toolUse,vision,contextWindow,supportsEffort,...}` | `provider-catalog.ts:47-73` |
| **RoleModels**(语义角色→模型) | `default/reasoning/small/haiku/sonnet/opus` | `provider-catalog.ts:76-83` |
| **provider_models 表**(DB 物化的模型清单) | 每个 provider 一张,字段含 `enabled / upstream_model_id / display_name / capabilities_json / enable_source`。**DB 行优先于 catalog 兜底** | `provider-resolver.ts:991-994` |

**虚拟 provider**(无 DB 行,但要在 UI 出现):

- `env` — 只用环境变量 / `~/.claude/settings.json`,`provider===undefined`(`provider-resolver.ts:278`)。
- `openai-oauth` — ChatGPT OAuth(Codex API),走 `/responses`,标 `_openaiOAuth`(`provider-resolver.ts:213-214`)。
- `codex_account` — Codex 自带账号登录,标 `_codexAccount`,**不走 proxy,走 Codex 自己的 app-server**(`provider-resolver.ts:223-225`)。

**Resolver 的职责**(`resolveProvider()` @ `provider-resolver.ts:203-281`):把「请求里的 providerId / session 的 provider_id / 全局 default / env / 虚拟 provider」按优先级(`:129-137`)统一成一个 `ResolvedProvider`,再由两个出口消费:
- `toClaudeCodeEnv()` → 生成 `ANTHROPIC_*` 环境变量,喂给 Claude Code SDK 子进程;
- `toAiSdkConfig()`(`:509-819`)→ 生成 Vercel AI SDK 配置(`sdkType/apiKey/baseUrl/modelId/headers/useResponsesApi`),喂给 Native runtime + Codex proxy。

模型选择优先级(`provider-resolver.ts:1074-1102`):显式请求 model → session model → 全局 default(须属于该 provider)→ `roleModels.default` → 首个 enabled+兼容 model → …。**隐藏模型(enabled=0)永不被选为默认,只有显式点名才用**(`:1093-1101`)。

> 关键设计:`is_active` **不是**「启用/禁用」开关,而是「当前选中(单选)」标记;默认 provider 无论 `is_active` 都生效(`provider-resolver.ts:243-250`)。

### A.2 Codex Proxy:Codex 请求怎么被拦截 + 翻译成 Responses wire

这是整套最值得抄的部分。Codex(app-server)本来只能调它自己的模型;CodePilot 让 Codex 能用 CodePilot 里**任意 provider/model**,靠的是一条「本地 Responses 代理」。链路:

```
Codex app-server
  └─(被注入的 model_provider=codepilot_proxy, base_url=本机 /api/codex/proxy/v1, wire_api=responses)
      → POST /api/codex/proxy/v1/responses        ← 本地 Next 路由(拦截点)
        → parseResponsesRequest()                 ← 校验 Responses wire 形状
        → handleProxyRequest()                    ← 查 provider + 定 compat tier + 选 adapter family
          → createUnifiedAdapter()
            → createModel({providerId, model})     ← 复用 Native 的同一个工厂(选对 @ai-sdk/*)
            → translateResponsesInput()            ← Responses input[] → ai-sdk ModelMessage[]
            → translateResponsesTools()            ← Responses tools[] → ai-sdk ToolSet
            → streamText() / generateText()        ← 真正打上游
            → translateStream()                    ← ai-sdk fullStream → Responses SSE 事件
        → text/event-stream 回给 Codex
```

**1) 注入(让 Codex 把请求发到本地)** — `src/lib/codex/provider-proxy.ts:75-107`(`buildCodexProviderProxyInjection`)。利用 Codex `ThreadStartParams.config` 是自由 override map 的特性,塞进一个虚拟 `model_providers.codepilot_proxy`,`base_url` 指向 `http://127.0.0.1:<port>/api/codex/proxy/v1`,`wire_api: 'responses'`,并用 **HTTP header** `x-codepilot-target-provider: <provider-id>` 告诉代理「用户选的是哪个 CodePilot provider」(`:38-52`、`:81-93`)。用 header 不用 query,因为 Codex 把 `http_headers` 逐字加到对该 provider 的**每个**请求上(`:22-24`)。
- **resume 也要重发同一份 config**(`provider-proxy.ts:108-167`):dev 端口变了 / Codex 重启 / 未来 Codex 裁剪未知 model_providers,这三种情况都会让 resume 丢配置,所以每次都重新附上。
- `env`/空 providerId 必须在到这里之前就被拒(`:191-196` 抛错,不静默构造 no-op)。

**2) 拦截路由** — `src/app/api/codex/proxy/v1/responses/route.ts`。刻意做成薄壳:读 header → `parseResponsesRequest` → `handleProxyRequest` → 把 `ProxyResult` 序列化成 SSE 或 JSON(`:41-114`)。**stream 中途的错误也返回 HTTP 200**,错误以 SSE 内嵌 `response.failed` 事件承载(`:18-22`)。

**3) 派发 + gate** — `src/lib/codex/proxy/adapter.ts:165-265`(`handleProxyRequest`):
   1. 无 target header → `provider_not_targeted`(`:169-174`);
   2. 查 provider:先查 `VIRTUAL_PROVIDERS`(`:88-98`),否则 `getProvider()` 查 DB,查不到 → `provider_not_found`(`:200-207`);
   3. 算 `compat = getProviderCompatFromApi(provider)` → `family = ADAPTER_FAMILY_BY_COMPAT[compat]` + `status = ADAPTER_STATUS_BY_COMPAT[compat]`(`:209-213`);
   4. **凭证检查** `resolved.hasCredentials`,空 key → `credentials_missing`(`:229-235`);
   5. **adapter-status gate**:`pending`(只剩 `unknown` tier)→ `adapter_not_implemented`(`:240-246`);`not_applicable`(codex_account/media)→ 路由 bug 错误(`:247-253`);
   6. `await adapter(input, resolved)`,**外层兜 try/catch**,适配器再保证自己不抛(`:258-264`)。

**4) 统一适配器** — `src/lib/codex/proxy/unified-adapter.ts:64-260`。**三个 family 共用一个翻译器**,因为 wire 差异都在 `@ai-sdk/*` 各自的 SDK 内部、`createModel()` 已按 `sdkType` 选对(`:1-12`)。关键:
   - **必须把 raw `targetProviderId` 透传给 `createModel`(不是 `resolved.provider?.id`)**,否则 `openai-oauth` 这种虚拟 provider(`resolved.provider===undefined`)会静默回落默认 provider —— 这就是 Phase 5b 的 P0 bug(`:68-91`)。
   - **先挂 bridge → 翻译 tools → 编 system prompt → 再 buildMessages**(`:93-117`):早期顺序反了,compiler prompt 只通过 `providerOptions.openai.instructions` 到达,**对 Anthropic-compat / CodePlan / openai chat-completions 路径不可见**(它们的 system 全在 messages 数组里),导致这些 provider 丢掉 wire 规格、image-gen 规则、memory/tasks 工具描述。
   - **effort → 双路 providerOptions**(`:497-543`):同时塞 `anthropic.thinking` 和 `openai.reasoningEffort`,哪个底层 SDK 在用就拿哪个,ai-sdk 静默丢弃不认的 key。
   - Codex `/responses` 端点**强制要求** `instructions` 非空 + `store:false`,适配器无条件兜上(`:502-525`)。

**5) Responses SSE 翻译** — `src/lib/codex/proxy/translate-stream.ts:85-418`。ai-sdk `fullStream` part → Codex Responses 事件的逐型映射(`:13-27`)。踩过的坑都固化成防御代码:
   - `output_item.done` **必须发**,否则 Codex 的 `handle_output_item_done` 不落 item,GLM/Kimi 出现「completed 但空白」(`:37-44`)。
   - `text-delta` 前若没有 `text-start`(OpenRouter Anthropic-skin 会这样),要**防御性补 `output_item.added`**,否则 delta 被丢、消息渲染空白(`:135-167`)。
   - 错误事件发 **`response.failed`** 而**不是** `{type:'error'}`:Codex app-server 解析器不认 `error`,会落到「stream closed before response.completed」静默失败(`:29-35`、对照 `adapter.ts:309-329`)。
   - bridge 自己执行的工具(`builtinToolNames`)的 `function_call` 事件**要抑制**,不能漏给 Codex,否则 Codex 会去执行一个它不认识的工具(`:206-252`)。
   - `finally` 块:上游没发终止事件时,**合成一个 zero-usage `response.completed`**,保证 Codex reader 干净退出(`:405-417`)。

### A.3 兼容矩阵:provider × runtime 怎么 gate

**两层 compat**:provider 层 tier(8 档)+ model 层 `supportedRuntimes[]`。

provider tier(`src/lib/runtime-compat.ts:1-19`):`claude_code_ready / claude_code_verified / claude_code_experimental / openrouter_anthropic_skin / codepilot_only / codex_account / media_only / unknown`。三 runtime id:`['claude_code','codepilot_runtime','codex_runtime']`(`src/lib/runtime/runtime-id.ts:20`)。

`getModelCompat()`(`runtime-compat.ts:162-261`)按 tier 填 `supportedRuntimes` + 每 runtime 的 `unsupportedReasonByRuntime`:

| tier | claude_code | codepilot_runtime | codex_runtime | 不兼容原因(摘) |
| --- | :-: | :-: | :-: | --- |
| `claude_code_ready` | ✓ | ✓ | ✓ | 官方/Bedrock/Vertex |
| `claude_code_verified` / `_experimental` | ✓ | ✓ | ✓ | 第三方 Anthropic-compat(GLM/Kimi…) |
| `openrouter_anthropic_skin` | ✓ | ✗ | ✓ | URL 是 `/api` 不是 `/v1` |
| `codepilot_only` | ✗ | ✓ | ✓ | OpenAI wire,Claude Code 够不着 |
| `codex_account` | ✗ | ✗ | ✓ | 只走 Codex app-server |
| `media_only` | ✗ | ✗ | ✗ | 图像/视频,不进 chat picker |
| `unknown` | ✓ | ✓ | ✗ | proxy 无法判定 wire format |

**gate 落地的三处**(同一矩阵,三个消费点):
- **服务端过滤**:`/api/providers/models?runtime=<id>` 把不在 `supportedRuntimes` 的 model 直接从响应里删掉。
- **客户端渲染**:不兼容的行**置灰但仍可见**,tooltip 显示 `unsupportedReasonByRuntime[runtime]` —— 让用户知道「为什么不能选」而不是干脆消失。
- **resolver 兜底**:默认 model 回落链里跳过不兼容的;但**显式点名仍放行**,错误留到下游暴露(`provider-resolver.ts:1031-1072`)。

**Codex proxy 侧的 parity 表**(`src/lib/codex/proxy/provider-parity.ts`):
- `ADAPTER_STATUS_BY_COMPAT`(`:34-53`):每 tier 一个 `ready/pending/not_applicable`,**单一真相源**,adapter ship 一个就翻一个为 `ready`;现仅 `unknown=pending`。
- `ADAPTER_FAMILY_BY_COMPAT`(`:60-81`):tier → `openai_compatible / anthropic_compatible / codeplan / native`。verified/experimental → `codeplan`(因为带品牌别名映射 GLM/Kimi/百炼/MiniMax/DeepSeek);`unknown` → 猜 `openai_compatible`(chat/completions 最常见)。
- `pickerDisabledReason(family, isZh)`(`:144-167`)产出中英双语「具体」禁用文案,而不是「Codex 不支持」(后者暗示永久不支持,被 Codex CLI 用户吐槽过,见 `:6-9`)。

> **verified vs experimental 的真相**:两者**运行时完全等价**(同样三 runtime、同一个 `ClaudeCodeCompatModel` 适配器),差异**纯 UI 语气**——"Claude Code 兼容"(info)vs "Claude Code 实验"(warning)。判定点 `runtime-compat.ts:76-82`:`preset.protocol==='anthropic'` 时,`meta.claudeCodeVerified` 为真→verified,否则→experimental。**真正会 block 的是 `sdkProxyOnly`**(只能走 Claude Code SDK,挡掉 Vercel AI SDK 文本生成路径)。

---

## B. 值得抄的设计 + 踩过的坑(每条:为什么 / 不这么做会怎样)

1. **协议(protocol)分发,而非品牌名分发。** `provider-catalog.ts:20-28` 用 `protocol` 决定 wire/SDK/auth。
   - *为什么*:同一品牌可换 base_url、可起多实例;品牌字符串匹配会随用户改名/改端点崩。OpenRouter 同一家因 `/api` vs `/v1` 落到不同 tier 就是例证。

2. **provider 实例(DB,带 base_url+key)与 preset 模板(catalog,带默认 models/meta)分离;DB 行优先,catalog 只兜底。** `provider-resolver.ts:991-994`。
   - *为什么*:用户能改 base_url、改名、隐藏/启用模型;preset 升级不能覆盖用户编辑。

3. **「保护配置完整性,而非揣测用户意图」。** 模型刷新(`apply`)**绝不**翻动 `enable_source ∈ {manual_enabled, manual_hidden}` 或 `user_edited=1` 的行(`auto-discover-models.ts:14-15,116`;doc `ProviderManagement.md §8#5` 标 P0)。
   - *不这么做*:用户隐藏的模型下次刷新被重新启用、改的名被改回——CodePilot 明确记为 P0 教训。

4. **空集合不伪造、不回落 env。** `classifyProvider()`(`model-discovery.ts:118-207`)对 OAuth/套餐型/OpenRouter 直接判 `unsupported`,**不去探它的 `/v1/models`**;探到的「真的空」与「全是已知行(up-to-date)」严格区分(`auto-discover-models.ts:110-118`)。Class C(不可探)provider **不显示 Refresh 按钮**(doc `ModelDiscovery.md §8#10`)。
   - *不这么做*:套餐型 provider 的 `/v1/models` 只返回 SKU 白名单,探出来写进 `provider_models` 会把真正能用的模型挤掉,用户聊天 4xx。

5. **AbortController 防竞态是硬纪律。** 每次 fetch:abort 上一次 + 新 controller + `.then` 里查 `signal.aborted`;`provider-changed` 事件刷新时**慢的旧请求不许覆盖新结果**(doc `Runtime.md §2.5/§5#5`)。探模型一律 `AbortSignal.timeout(8000)`(doc `ModelDiscovery.md §8#5`)。
   - *不这么做*:慢上游(Bedrock/跨区)让 spinner 转到天荒地老;旧响应回来盖掉新 provider 的列表。

6. **凭证不泄漏。** base_url 显示前 `sanitizeEndpointForDisplay()` 检测 `sk-/pk_/ghp_/ant-` 等前缀,疑似 secret 就遮罩只留后 4 位(`provider-endpoint-sanitize.ts:52`);探测响应里把 `?key=sk-xxx` 换成 `***`(doc `ModelDiscovery.md §8#6`)。
   - *为什么*:provider 卡片会进截图/录屏/日志。

7. **错误事件形状要对准消费者解析器,而非 SDK fixture。** 发 `response.failed` 而非 `{type:'error'}`(`translate-stream.ts:29-35`;`adapter.ts:309-329`)。
   - *不这么做*:Codex app-server 解析器落到未处理分支 → 「stream closed before response.completed」静默失败,用户看到空白。

8. **虚拟 provider 必须在 proxy 端镜像注册。** `VIRTUAL_PROVIDERS`(`adapter.ts:88-98`)与 `/api/providers/models` 暴露面一一对应,有契约测试钉(`:75-78`)。
   - *不这么做*:UI 显示了 openai-oauth、用户一选、send 在 proxy 端 `provider_not_found`。

9. **凭证桥不碰 cc-switch.db,改用 per-request shadow HOME。** cc-switch 写的是 Claude Code 的 `~/.claude/settings.json`(不是它的 db);选了 DB provider 时,CodePilot 造一个临时 `~/.claude/`,把 settings.json **剥掉 `ANTHROPIC_*` auth keys 但保留 mcpServers/hooks/plugins/permissions**,子进程 HOME 指过去,stream `finally` 清理(doc `cc-switch-credential-bridge.md §四`)。`settingSources` 对 DB provider 只留 `['user']`(`provider-resolver.ts:1220`)。
   - *不这么做*:cc-switch 留在 settings.json 的旧 `ANTHROPIC_BASE_URL/AUTH_TOKEN` 会盖掉用户在 UI 选的 provider —— 这是「`claude` CLI 能用但 CodePilot 报 No credentials」的真实 bug 链。

10. **品牌 preset 必须排在 wildcard 之前。** `anthropic-thirdparty` 兜底 preset 若排在 GLM/Kimi 前会先匹配、吃掉搜索(doc `ProviderManagement.md §8#4`)。

11. **`provider_type` 不可改,只能删了重建。** 它决定 wire/role_models/SDK 路径,改了会腐化状态(doc `ProviderManagement.md §8#3`,`/api/providers/[id]` PUT 禁改)。

---

## C. 映射到 Helm(直接抄 / 要改 / 救项目②)

### C.1 关键发现:Helm 其实已经有半套 Codex 注入了

Helm 的 `buildCodexCustomProviderConfig`(`packages/server/src/server/agent/providers/codex-app-server-agent.ts:2860-2890`)**已经在用和 CodePilot 一样的 Codex `model_providers` 注入手法**:对 `extends==='codex'` 的自定义 provider,从 `env.OPENAI_BASE_URL` 取 base_url、normalize 成 `/v1`、塞进 `model_providers[id] = {name, base_url, wire_api:'responses', env_key:'OPENAI_API_KEY'}`。

差别只有一个:**Helm 把 `base_url` 指向上游真实端点**(Codex 直连上游),**CodePilot 指向本机 proxy 路由**(`/api/codex/proxy/v1`)再翻译。也就是说:
- Helm 现状 = 「Codex + OpenAI 兼容上游」可直连(不需要 proxy)。
- 要支持「Codex 用 Anthropic / 套餐型 / 任意 provider」,才需要 CodePilot 那条本地 proxy。

> 这条对救项目②很重要:**注入机制 Helm 已验证可行**,缺的是「本地 proxy + Responses 翻译」这一段——而那段恰好是 CodePilot 归档最完整的部分。

### C.2 能直接抄的(语言栈无关,纯逻辑/纪律)

- **三层数据模型的「层」划法**:protocol(wire)/ provider 实例(base_url+key)/ model(带 capabilities + upstreamModelId 双 id)。Helm 当前 `ProviderOverrideSchema`(`packages/protocol/src/provider-config.ts:46-58`)只有 `extends/env/models[]` 两层半,把 base_url+key 混在 `env` 里(`OPENAI_BASE_URL/OPENAI_API_KEY/ANTHROPIC_BASE_URL`)。**抄 CodePilot 把「供应商实例」提成一等实体**,字段对齐 `ApiProvider`(protocol/base_url/api_key/headers/role_models/models)。
- **兼容矩阵做成单一真相 map**(`ADAPTER_STATUS_BY_COMPAT` / `ADAPTER_FAMILY_BY_COMPAT` / `getModelCompat`)。Helm 直接照搬这张 provider×runtime 表(Helm 的「runtime」= claude/codex/copilot/opencode/pi 这些 CLI),用 `supportedRuntimes[] + unsupportedReasonByRuntime{}` 表达,UI 置灰可见 + 给具体原因。
- **verified vs experimental = UI 语气,不 block 功能**;真正 block 用单独 flag(对应 Helm 可叫 `proxyOnly`/`cliOnly`)。
- **模型发现的全套纪律**:`enable_source` 保护用户编辑、AbortController 防竞态、`AbortSignal.timeout`、不探套餐型、空集合不伪造、endpoint 脱敏。这些是 bug 清单换来的,**逐条抄成 Helm 的 server 端 helper + 测试**。
- **Responses SSE 翻译里那一串防御**(`output_item.done` 必发、`text-delta` 补 `text-start`、发 `response.failed`、`finally` 合成 completion、抑制 bridge 工具 function_call):如果 Helm 要做 Codex proxy,**几乎可逐行移植**(纯 TS,无框架依赖)。

### C.3 因 Helm 是 RN / WebSocket / JSON 要改的

| CodePilot 做法 | Helm 要改成 |
| --- | --- |
| Next.js HTTP 路由 `POST /api/codex/proxy/v1/responses` 拦截 Codex | Helm daemon(Node)里起一个**本地 HTTP server**(不是 WebSocket RPC):Codex app-server 通过 `model_providers.base_url` 用标准 HTTP 调它。**这条必须是 HTTP**——Codex 只会发 HTTP,WebSocket RPC 用不上。可挂在 daemon 已有的 HTTP 监听上加一个 `/codex-proxy/v1/responses` path,base_url 注入指向 `http://127.0.0.1:<daemonPort>/codex-proxy/v1`。 |
| SQLite `api_providers` / `provider_models` 表 | 文件式 JSON + Zod(`docs/data-model.md`)。把 `agents.providers` 扩成含 `vendors`(供应商实例数组)+ `vendorModels`。原子写、无迁移(沿用 Helm 持久化约定)。 |
| `createModel()` 走 `@ai-sdk/*` 直连上游 | Helm 没有 Native AI-SDK runtime,**只有 CLI 子进程**。所以「Codex 用别的 provider」要么 (a) 像现状那样把 base_url+key 注入 Codex TOML 让 Codex 直连(仅 OpenAI 兼容 + Anthropic 兼容 wire 可行),要么 (b) daemon 里引入 `@ai-sdk/*` 真的做翻译代理(重,等同把 CodePilot Native runtime 搬进来)。**建议先做 (a)**,(b) 留作后续。 |
| 客户端 React 组件置灰 + tooltip | RN:`isHovered‖isNative‖isCompact` 控制可见性(见根 CLAUDE.md hover 规则);禁用行同样「可见 + 原因」。 |
| `~/.claude/settings.json` shadow HOME | Helm 已是 `~/.helm` 隔离 + per-agent 子进程,**这条思路直接复用**:选了供应商实例时,给该 agent 子进程一份剥掉 auth 的 settings,避免 cc-switch/全局 env 盖掉 UI 选择。 |

### C.4 救「被否的三层 providers」——错在哪 + 怎么修

Helm v3 需求(`docs/helm/reference/HELM-v3-需求文档.md:21,57-60,108`)定义的三层是对的:**提供方(CLI)🔒锁定 → 中转站(供应商,url+key)→ 模型**,对话锁提供方、中转站+模型可中途切。naughty-hyena 分支实现了 `agents.vendors` schema、vendor-env 编译、cc-switch 导入、vendor-edit UI(872 行),但被否「界面错误 + 代码不生效」。对照 CodePilot,**最可能的根因与修正**:

1. **「代码不生效」≈ 注入/解析没接到真实 send 路径。** CodePilot 的教训正是这类:raw providerId 没透传给工厂导致静默回落默认(`unified-adapter.ts:68-91`);resume 没重发 config 导致旧配置生效(`provider-proxy.ts:108-167`);compileContext 顺序错导致 prompt 对部分 wire 不可见。**修正方向**:Helm 选了供应商后,必须验证它**真的改变了子进程的 env / Codex TOML / 模型 id**,而不是只改了 UI store。用 CodePilot 的「单一 resolver → 单一注入点 → 下游读干净 shape」结构,避免散落的 `??` 兜底。这与根 CLAUDE.md「能力检测集中一处、无 fallback 分支散落」完全一致。

2. **「界面错误」≈ 缺少 compat gate 和置灰态。** 三层级联若不接兼容矩阵,会让用户选出「这个 CLI 配这个供应商根本跑不通」的组合。**修正**:抄 `getModelCompat` 那张表,级联第二/三层按 (提供方, 供应商) 过滤可选模型,不可选的置灰 + 给具体原因(provider-parity 的双语文案模式)。

3. **cc-switch 同步不要碰它的私有 db。** naughty-hyena 写了 `cc-switch-import.ts(335行)`。CodePilot 的结论是 **cc-switch 真正落盘的是 `~/.claude/settings.json`**,且**不直接读 cc-switch.db**;同步应基于 settings.json 的 `env.{ANTHROPIC_BASE_URL,ANTHROPIC_AUTH_TOKEN,...}` 映射成 Helm 供应商(doc `cc-switch-credential-bridge.md §2.1`)。Helm 若坚持读 cc-switch.db,要把它当**只读导入源**,且导入后用 shadow-settings 隔离防止双向覆盖。

4. **供应商必须是一等持久化实体 + Zod。** naughty-hyena 的 Approach C(`agents.vendors.{claude:[...],codex:[...]}` + `vendorCommonConfig`)方向正确,但要**对齐 CodePilot 的字段集**(`protocol/base_url/api_key/headers/role_models/models[{modelId,upstreamModelId,capabilities}]/exposedModelIds/enable_source`),并把「模型放出列表」「enable_source 保护」「endpoint 脱敏」一起带上——否则刷新模型会回滚用户编辑(P0)。

5. **重构而非打补丁(符合 Helm 标准)。** 实现新三层时,旧的「base_url 塞 env」两层路径要一次性切干净(根 CLAUDE.md「refactor, don't patch」),`buildCodexCustomProviderConfig` 改成从供应商实体取值而非从 `env` 反推。

> 一句话:**naughty-hyena 的数据模型方向是对的,死在「UI 没接兼容 gate + 注入没接真实 send 路径」**。CodePilot 提供的正是这两段的完整参照(矩阵单一真相 + resolver 单一注入点 + 翻译层防御)。

---

## D. 不适用 / 风险(Helm 不该照搬的)

1. **不要照搬 SQLite + `db.ts`(165KB)。** Helm 是文件式 JSON + Zod、无迁移(`docs/data-model.md`)。CodePilot 大量逻辑绕着 SQLite 列(`is_active` int、`enable_source` 列、`provider_models` 表)展开;Helm 要把这些表达成 JSON schema + 原子写,**借语义不借存储**。

2. **不要引入 CodePilot Native runtime(`@ai-sdk/*` 直连)只为做 proxy。** 那是把一整个「应用内 LLM 客户端」搬进 daemon——与 Helm「聚合本机 CLI agent」的产品定位(`docs/product.md`)不符,且体量巨大(`provider-resolver.ts` 70KB、`provider-catalog.ts` 79KB)。Codex proxy 的 (a) 方案(注入 base_url 让 Codex 直连)能覆盖大多数 OpenAI/Anthropic 兼容上游,**不需要本地翻译层**。本地 Responses 翻译层只在「要让 Codex 用 Anthropic wire 上游」时才需要,可作为 M2 之后的增量。

3. **40+ VENDOR_PRESETS 全量目录不要硬抄。** CodePilot 内置 40+ 厂商模板(`provider-catalog.ts:455`)。Helm 起步用一个**小而准**的 preset 子集(用户真在用的:Anthropic 官方、OpenRouter、GLM/Kimi、Z.AI/Qwen——后两者 Helm 文档已覆盖,见 `docs/custom-providers.md`),其余靠 `unknown` tier + 用户填 protocol 兜底。盲抄大目录会带来一堆 Helm 没测过的「verified」声明,违背「verify functional, not rendered」教训(MEMORY)。

4. **Codex 强制 `store:false / instructions 非空`、`response.failed` 形状等,是绑定到 Codex app-server 当前版本的契约**(`unified-adapter.ts:502-525`、`translate-stream.ts:29-35`)。Helm 抄翻译层时要把这些当**版本相关的脏知识**记进注释/COMPAT 标记,Codex 升级时复核——别当成永恒真理。

5. **`namespace/tool_search/local_shell` 等 Codex 非函数工具白名单**(`parse-request.ts:62-69`)是逆向 Codex Rust 源码(`tool_spec.rs`)得来的,会随 Codex 版本漂移。Helm 若做 proxy,这张表要能容错(未知类型给清晰 `unsupported_tool_kind` 而非静默丢),并标注来源版本。

---

## 附:本研究引用的关键文件清单(绝对路径)

CodePilot(只读):
- `/Users/wangbingkun/Desktop/coding/person/WolffyCode/CodePilot-main/src/lib/codex/provider-proxy.ts`
- `/Users/wangbingkun/Desktop/coding/person/WolffyCode/CodePilot-main/src/app/api/codex/proxy/v1/responses/route.ts`
- `/Users/wangbingkun/Desktop/coding/person/WolffyCode/CodePilot-main/src/lib/codex/proxy/adapter.ts`
- `/Users/wangbingkun/Desktop/coding/person/WolffyCode/CodePilot-main/src/lib/codex/proxy/unified-adapter.ts`
- `/Users/wangbingkun/Desktop/coding/person/WolffyCode/CodePilot-main/src/lib/codex/proxy/translate-stream.ts`
- `/Users/wangbingkun/Desktop/coding/person/WolffyCode/CodePilot-main/src/lib/codex/proxy/parse-request.ts`
- `/Users/wangbingkun/Desktop/coding/person/WolffyCode/CodePilot-main/src/lib/codex/proxy/provider-parity.ts`
- `/Users/wangbingkun/Desktop/coding/person/WolffyCode/CodePilot-main/src/lib/provider-resolver.ts`
- `/Users/wangbingkun/Desktop/coding/person/WolffyCode/CodePilot-main/src/lib/provider-catalog.ts`
- `/Users/wangbingkun/Desktop/coding/person/WolffyCode/CodePilot-main/src/lib/runtime-compat.ts`
- `/Users/wangbingkun/Desktop/coding/person/WolffyCode/CodePilot-main/src/lib/model-discovery.ts` · `auto-discover-models.ts` · `catalog-recommend.ts` · `provider-endpoint-sanitize.ts` · `provider-presence.ts`
- docs:`docs/guardrails/{ProviderManagement,ModelDiscovery,Runtime,ComposerModelSelection}.md` · `docs/handover/provider-{architecture,proxy-bridge,governance,error-doctor}.md` · `docs/exec-plans/completed/{phase-5-codex-runtime,provider-resolver-refactor,provider-governance,cc-switch-credential-bridge}.md`

Helm(只读对照):
- `/Users/wangbingkun/Desktop/coding/person/WolffyCode/paseo-main/packages/server/src/server/agent/providers/codex-app-server-agent.ts`(`buildCodexCustomProviderConfig:2860-2890`)
- `/Users/wangbingkun/Desktop/coding/person/WolffyCode/paseo-main/packages/protocol/src/provider-config.ts`
- `/Users/wangbingkun/Desktop/coding/person/WolffyCode/paseo-main/docs/helm/reference/HELM-v3-需求文档.md`
- `/Users/wangbingkun/Desktop/coding/person/WolffyCode/paseo-main/docs/custom-providers.md` · `docs/data-model.md`
