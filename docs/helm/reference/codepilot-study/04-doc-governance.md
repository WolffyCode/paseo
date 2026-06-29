# CodePilot 文档/治理体系 — Helm 可借鉴点

> 研究对象：`/Users/wangbingkun/Desktop/coding/person/WolffyCode/CodePilot-main`（只读，未改任何文件）
> 服务对象：Helm（`paseo-main`）的 `docs/helm/` 文档体系 + 根 `CLAUDE.md` Helm Critical rules
> 视角：对照 CodePilot 的「文档驱动多 agent 协作」体系，看 Helm 的 `docs/helm` 流程能怎么升级
> 一句话结论：**Helm 的 `docs/helm` 在「正向设计」(product+ui canonical / requirements / 3 闸) 上比 CodePilot 更成体系；CodePilot 真正领先的是「持久工程记忆」——guardrail 不变量契约、tech-debt 追踪、决策日志（含被否方案）、四态计划归档、验证证据账本。Helm 缺的恰好是后面这一整块。**

---

## A. CodePilot 怎么做的

CodePilot 由「作者 + Claude Code(实现) + Codex(计划/审查)」三方协作。它把协作不翻车的关键全部沉淀进 `docs/`，分四个子系统。

### A.1 exec-plans/ —— 四态分目录 + 决策日志 + 验证账本

**四态目录**（`docs/exec-plans/README.md:15-26`）：`active/` `completed/` `deferred/` `superseded/`，铁律是 **「AI 只从 `active/` 领任务」**（`README.md:5`、`:17`）。`deferred`/`superseded` 里每个文件顶部都有 `Archive note`，写明「为什么移出 / 当前替代入口 / 未来从哪重启」（`README.md:26`、`document-system-governance.md:237-241`）。这一刀直接解决「AI 从旧 active 文档里捡过期任务、重复开支线、误读优先级」（`document-system-governance.md:14-22`）。

**计划模板**（`README.md:62-92`）固定五段：

- **状态表**：`| Phase | 内容 | 状态(📋待开始/🔄进行中/✅已完成/⏸暂缓) | 备注 |`
- **决策日志**：`- YYYY-MM-DD: 决策内容及原因`
- **详细设计**：目标 / 技术方案 / 拆分步骤 / 依赖 / 验收标准
- **Smoke Ledger**：真实凭据/UI/E2E 验证记录表 `| Date | Runtime | Provider | Model | 凭据形态 | 场景 | Result | Evidence |`（`README.md:84-92`），强制「跑过真实 smoke 必须登记一行，不许只留在聊天里」。
- 每个 Phase 必须先写清 **「用户会看到什么变化 / 哪个页面或按钮可以验收 / 本阶段明确不做什么」**，说不清用户结果就不能开工（`README.md:94`、`document-system-governance.md:111-136` 的「用户能看到什么 / 不做什么 / 怎么验收」三件套贯穿每个 Phase）。

**Signal → Triage → Fix → Verify → Guardrail 闭环**（`README.md:35-45`）：所有 review finding / 用户反馈 / 测试失败都走同一闭环，最后一环「同类问题第二次出现，或涉及 schema/runtime/default/log/security，必须沉淀防线（guardrail/tech-debt/plan）」——这是把一次性修复升级成持久防线的强制出口。

**交付说明必写「被否方案及原因」**（`README.md:47-53`）：Claude Code 的交付说明必须含「上下文：用户原始诉求、讨论过程、关键判断、**被否掉的方案和原因**」+ 根因 + 改动 + 验证 + 防回归。理由直接写在文里：「不要只贴最终结论……让下一个读计划的人知道为什么这么做」「否则 ClaudeCode 重启或上下文变短后会重复旧误判」（`README.md:49`、`:57`）。

代表样本：
- `completed/document-system-governance.md` —— 文档体系自治理本身就是一个 exec-plan，Phase 0-5 每段都带「用户能看到什么/不做什么/怎么验收/实现路径」，决策日志记录了 Claude Code review 如何拦住「lint 自爆」和「中间提交必红」两个坑（`:339`）。
- `completed/engineering-quality-assurance.md` —— 「工程质量保障体系」的总纲，9 个 Phase 标 ✅/📋，决策日志解释为什么某些 Phase 暂不做（`:22-28`）。

### A.2 guardrails/ —— 模块级不变量契约（七节模板）

定位（`docs/guardrails/README.md:1-3`）：**「每份文档锁住一个跨多个文件的不变量集合，让未来改这块代码的人（AI 或人类）能在动手前快速校准『这里有哪些不能碰的边』。」** 与其它 docs 的边界很清楚（`README.md:36-40`）：`design.md` 管视觉、`handover/` 管完整架构、`exec-plans/` 管进行中的工作，**guardrail 专管「已稳定的行为契约/不变量」**，是 handover「不变量」那一节的扩写。

**七节模板**（`README.md:26-34`）逐节作用：

1. **词汇表** —— 这块代码所有专有名词 + 来源（解决：AI 把同一概念叫成不同名字 / 误解内部术语）。
2. **不变量/契约表** —— 行为规则，越严格越好（解决：核心约束散落在代码各处，改的人不知道有这条边）。
3. **关键文件 + 责任** —— 哪个不变量由哪个文件守（解决：知道有约束但不知道在哪强制）。
4. **改动检查表** —— 加新功能时必须想到的点（解决：漏掉横切影响面）。
5. **常见坑** —— 被踩过的 / Codex review 指出过的反模式（解决：同一个坑反复踩）。
6. **测试覆盖** —— 每条契约对应哪个 test、回归跑哪个文件（解决：改完不知道跑什么验证）。
7. **设计决策日志** —— 关键变更的日期 + 理由，**「为后人解释『为什么不那样做』」**（解决：后人把已被否的方案又实现一遍）。

样板看 `Runtime.md`（已成稳定契约，七节全满）：
- §2.2 是一张 **「compat tier × runtime 必须命中表」**（`Runtime.md:29-38`），把「哪个 provider 在哪个 runtime 下该不该出现」做成真值表。
- §2 内嵌 **「已知陷阱（已修，别走回头路）」**：精确到 `runtime-compat.ts:128` 的注释、是「Codex 2026-04-26 review 指出后已删」、并直接写 **「不要再加回去」**（`Runtime.md:40-41`）。
- §5 常见坑 7 条，每条都是真实回归（如「把 `providerId === ''` 当 falsy」`:89`、「Hook fetchState 初始 'loaded' 导致首帧误判」`:90`）。
- §7 决策日志 6 条，每条 `日期 + 决策 + 理由`，多条标注「全部因 Codex review 指出竞态/语义错位」（`Runtime.md:107-114`）。

**Stub 机制**（`README.md:14-23`）：对「八类高风险入口」（i18n/DatabaseSchema/PermissionBoundary/StreamSession/MCP/Onboarding/ElectronMain/Release）先建七节**占位骨架**，标 `Status: Stub`，「首次真实改动触发时由实施 Agent 填充」。`MCP.md` / `StreamSession.md` 就是 stub 实例：契约表里写「(待填充)」占位，但已经把「为什么先读 + 已知关键文件 + 已知 1-2 条不变量」先钉住（`MCP.md:1-6`、`StreamSession.md:1-5`）。`StreamSession.md` 的常见坑甚至已经记录了一条「已修 2026-06-10」的 bug 全过程（`:40`）。

### A.3 handover/ —— 模块完整架构交接 + 双向链接

`handover/`（41 份，`README.md` 一张索引表）是「系统架构、数据流、关键设计决策的持久化记录，供后续开发者（含 AI）快速上手」（`handover/README.md:1-3`）。规则：**「修改或新增文件后更新下方索引；检索本目录前先读此文件」**（`:5`）。

与之配套的是根 `CLAUDE.md` 的 **「两份文档」铁律**（`CLAUDE.md:114-132`）：每个新功能/大迭代必须同时产出**技术交接文档（`docs/handover/`）+ 产品思考文档（`docs/insights/`）**，两份**互相反向链接**、**文件同名**。`provider-governance.md:1-5` 顶部就是「产品思考见 insights/... · 架构全景见 ... · 执行计划见 ...」三向链接的实例。

### A.4 文档怎么约束多 agent 协作

**分工写死在根 CLAUDE.md / AGENTS.md**：
- `CLAUDE.md:7-13`：作者(决策/验收) / **Claude Code(生成代码)** / **Codex(计划与测试)**。
- `AGENTS.md:15-18` 写死 **Codex 角色边界**：「绝对不能修改产品代码、运行时代码、构建脚本、DB schema、样式实现或业务逻辑……需要代码修复时只输出方案和 diff 建议，交由 Claude Code 实施」。
- `README.md:55-60`（exec-plans）写死 **Codex review 规则**：给 Claude Code 的执行文案「必须共享判断过程：先写用户问题和争议，再写取舍理由，最后才写执行清单」；P1/P2 finding「不能只用聊天确认关闭，必须有修复、测试证据或 tech-debt tracker 条目」。

**语义验收与反假数据**（`CLAUDE.md:62-83`，`AGENTS.md:60-62` 同步）：凡涉及用户可见的统计/状态/能力/权限/兼容性/进度/badge，每个字段必须有 **source breadcrumb**（追到真实来源，如 `db.token_usage`、`mcp.schemaJson`），没有真实来源就隐藏/标 unsupported/标「估算」，**不得显示假 0 / placeholder / 固定估值**。Review 时必须能回答 5 个问题（`CLAUDE.md:76-82`）。

**验证分层 + 改动自查**：Tier 0/1/2 分层验证（`CLAUDE.md:100-103`，Tier 2 = Runtime/Provider/DB/权限/Stream/MCP 必须读对应 guardrail + 写 Smoke Ledger）；提交前四项自查 i18n→db→types→docs（`CLAUDE.md:106-112`）。

**docs/CLAUDE.md + 每个子目录 README** 统一一条元规则：**「检索子目录前先读对应 README.md；增删文件后更新 README.md 索引」**（`docs/CLAUDE.md:11`），并由结构化 `lint:docs-drift` 脚本强制（`document-system-governance.md` Phase 4，`:269-300`：只检测文件顶部 banner 结构信号，不做全文 grep，避免治理文档自爆）。

### A.5 tech-debt-tracker.md —— 单文件技术债账本

一张活跃项表 `| # | 描述 | 优先级 | 影响范围 | 发现日期 |` + 一张「已解决」表 `| # | 描述 | 解决日期 | 解决方式 |`（`tech-debt-tracker.md:9`、`:51`）。铁律：**「发现新的技术债务时添加到此文件；解决后标注完成日期」**（`:5`）。条目质量极高——每条不只描述现象，还写**根因 + 修法候选(a)(b)(c) + 重启条件 + 优先级理由**（如 #37 OpenRouter 静默换模型，`:43`，整段记录了两轮修复、被否的中间方案、真机复现数据）。它是「Signal→…→Guardrail」闭环的标准落点之一，也是 exec-plan 决策证据的兜底归档处。

---

## B. 值得抄的设计（按价值排序）

1. **guardrail 七节模板（不变量契约表 + 常见坑 + 防回归 + 决策日志）** —— CodePilot 整套体系里**最高价值**的一项。它把「这块代码有哪些不能碰的边、踩过哪些坑、改完跑哪个测试、为什么不那样做」做成模块级持久契约。`Runtime.md` 的「compat tier × runtime 真值表」和「已修陷阱·别走回头路·精确到行号」是教科书级写法。
2. **exec-plan 的「被否方案及原因」必写 + 决策日志（日期+理由）** —— 直接对治 AI 协作的头号顽疾：上下文一短就把已被否的方案重新实现一遍。
3. **Smoke Ledger（验证证据账本）** —— 把「真跑过、跑的什么、什么结果、证据在哪」做成表，逼真实验证落盘，杜绝「截图看着对就算过」。
4. **tech-debt-tracker 单文件账本** —— 已知债务集中、带根因+修法候选+重启条件，避免债务无声累积或被埋进 `??`-fallback。
5. **四态目录 + Archive note + 「AI 只从 active 领任务」** —— 用目录语义防止 AI 捡过期任务；轻量但有效。
6. **每个 Phase 的「用户能看到什么/不做什么/怎么验收」三件套 + 语义验收/反假数据** —— 把「功能真生效」写成可执行门禁，而不是口号。

---

## C. 映射到 Helm（关键）

### C.1 逐项对比

| 治理机制 | CodePilot | Helm 现状 | 差距 |
| --- | --- | --- | --- |
| 唯一产品真相源 | 无单一 canonical（ARCHITECTURE.md + 散落 handover） | ✅ `product.md` + `ui.html` 强制同步 + 全量自审 | **Helm 更强** |
| 每需求一套本地文档 | 每功能一个 exec-plan | ✅ `requirements/<日期>-<topic>/`（requirement+ui+architecture 契约三件套） | 持平 |
| 多 agent 组织/流程 | CLAUDE.md 协作模式 + 角色边界 | ✅ `workflow.md` 三层 org + 3 闸 | 持平（机制不同） |
| 实现层规范 | 散落 CLAUDE.md | ✅ `standards.md`（模型/UI分离·不打补丁·契约注释·单测·WHAT-not-HOW） | 持平 |
| **模块级不变量契约(guardrail)** | ✅ `guardrails/` 七节模板 | ❌ **完全没有** | **Helm 缺** |
| **技术债追踪** | ✅ `tech-debt-tracker.md` | ❌ **没有** | **Helm 缺** |
| **决策日志 / 被否方案** | ✅ 每个 plan + guardrail 都有 | ⚠️ 只在 `requirement.md` 头部夹「修订一/二」散记，无结构化决策日志、无「被否方案及原因」段 | **Helm 弱** |
| **验证证据账本** | ✅ 每个 plan 的 Smoke Ledger | ❌ QA 四审有结论但**不落盘**（验完即散） | **Helm 缺** |
| 需求生命周期归档 | ✅ active/completed/deferred/superseded + Archive note | ⚠️ `requirements/` 只按日期建目录，无状态、无索引、无归档语义 | **Helm 弱** |
| 反假数据 / source breadcrumb | ✅ 显式整节 | ⚠️ standards §5「不靠截图/grep」+ verify 记忆，但无字段级 source-breadcrumb 规则 | **Helm 弱** |

**核心判断**：Helm 强在「这东西应该长什么样」（正向设计），弱在「**跨需求的持久工程记忆**」——哪条不变量永不能破、什么坏了、为什么当时那样决策、什么做完了/搁置了、验证证据在哪。CodePilot 的 guardrail + tech-debt + 决策日志 + 四态归档 + Smoke Ledger 正好补的是这一整块。而 Helm 的痛点记忆（onboarding 欢迎页被跳过验收 FAIL、「verify functional not just rendered」翻车、3-layer providers 实现被否）**全部是这块缺失直接导致的**。

### C.2 具体可落地的升级建议

> 衔接原则：Helm 的「每需求一对 requirement+ui、强制回写 canonical、3 闸」是正向流，不动；下面新增的全是**横切持久层**，挂在现有角色和闸上，不另起一条平行流水线。

**建议 1（最高优先）· 引入 per-子系统 guardrail —— 新建 `docs/helm/guardrails/`**

- 直接搬 CodePilot 七节模板（词汇表 / 不变量契约表 / 关键文件+责任 / 改动检查表 / 常见坑 / 测试覆盖 / 设计决策日志），在 `docs/helm/guardrails/README.md` 写模板定义 + 索引。
- 用 stub 机制先给 Helm 高风险子系统建占位骨架（候选：`Onboarding`/`HostConnection`、`ProviderCascade`（提供方→供应商→模型三层，正是被否过的那块）、`HomeShell`、`SettingsIA`、`Protocol-Compat`（对应根 CLAUDE.md 的协议后向兼容 + `COMPAT()` 规则）），首次真实改到才填满。
- **衔接 Helm 流程**：
  - **架构员工(P2)** 写 `architecture.md` 时，**顺手更新所触子系统 guardrail 的「不变量契约表 + 关键文件」**（架构师性格本就「守模型/UI分离 + 模块边界、见打补丁就拦」，与 guardrail 天然契合）。
  - **测试四审④(代码质量)** 改为「对照 standards **逐条** + 对照该子系统 guardrail 的不变量表**逐条**」——把现在每次重新推导的不变量变成可勾选清单。
  - **develop 守护 PM③** 回归时读 guardrail，差异退回。
  - 「常见坑 / 设计决策日志」两节**专门承接 Helm 的翻车教训**（欢迎页被跳过、截图≠生效、providers 被否的界面错误），让同一个坑不再踩第二次。

**建议 2（高优先）· 引入技术债账本 —— 新建 `docs/helm/tech-debt.md`**

- 直接搬 CodePilot 双表结构（活跃项 `# / 描述 / 优先级 / 影响范围 / 发现日期`；已解决 `# / 描述 / 解决日期 / 解决方式`），条目要求带**根因 + 修法候选 + 重启条件**。
- **衔接**：测试/守护发现「不阻断但需沉淀」的问题时，登记到这里而不是留在聊天；**总监在 `develop → release` 提升前过一遍债账本**作为内部门禁。
- **与 Helm 既有规则呼应**：standards §2「重构而非打补丁」**禁止**把问题埋进 `??`-fallback / dead gate，那这些已知缺口就必须有个公开落点——tech-debt.md 正是它。注意 Helm「无老用户兼容」记忆：债账本里不写任何老用户/迁移类债。

**建议 3（高优先）· 给需求补「决策日志 + 验证账本 + 生命周期」**

- **决策日志（含被否方案）**：在 `templates/architecture.md` 增一节 `## 决策日志`（`- YYYY-MM-DD: 决策 + 理由 + 被否方案及原因`）。**刻意放 architecture.md 而非 requirement.md**——因为 standards §7 规定 requirement.md **只写 WHAT、禁含 HOW/取舍**；决策与 tradeoff 属 HOW 边界，放架构文档不破坏这条铁律。这直接对治「3-layer providers 被否后无处记录为什么、第二天重谈」。
- **验证账本（Smoke Ledger 简化版）**：在 `templates/requirement.md` 末尾加一张 `## 验证记录` 表（`日期 / 平台(桌面/web/手机) / 场景 / 结果 / 证据`），**测试四审 + 闸 3 董事长验收的结论必须落这张表**。直接对治「onboarding 验收=FAIL 但欢迎页死代码先前没被发现」「verify functional not just rendered」两条记忆——把「真打开客户端验过、验了什么、证据在哪」逼上岸。
- **生命周期 + 索引**：新建 `docs/helm/requirements/README.md` 作为唯一索引表，给每个需求标状态（active / done / deferred / superseded）；搁置/被替代的需求目录顶部加 `Archive note`（为什么搁置 / 替代入口 / 如何重启）。不必像 CodePilot 拆四个物理目录（Helm 需求量小），**一张 README 索引表 + 顶部 banner 足够**。沿用 CodePilot「检索前先读 README、增删后更新索引」元规则。

> 三条建议都不与 Helm 现有流程冲突：建议 1/2 是挂在「架构 P2 / 测试 P4 / 守护回归 / 总监 release 门禁」上的横切持久层；建议 3 只是给现有契约三件套各补一节，不新增文档种类、不动 3 闸。

---

## D. 不该照搬的

1. **Codex vs Claude Code 的角色分工（Codex 计划/审查、Claude Code 实现、Codex 不许碰产品代码）** —— Helm 有硬规则「全层全员 `claude-opus-4-8`，不用 Codex/`gpt` 员工」（`workflow.md:26`、根 CLAUDE.md Model mandate）。Helm 的三层 org（总监→PM→产品/UI/架构/开发/测试）已经覆盖了「计划/执行/审查」的职责分离，**不要引入 Codex 角色边界**。借鉴的是「角色边界写死进文档」这个**做法**，不是 CodePilot 的**具体角色**。

2. **handover/ + insights/ 「每功能两份互链文档」铁律** —— Helm 已把架构折进 `requirements/<日期>/architecture.md`、把产品价值折进 `requirement.md`，再起一套 `handover/`+`insights/` 双树是重复建设。**保留 Helm 的 per-requirement 契约三件套**；最多在 guardrail 的「关键文件+责任」里承接 handover 的「活架构地图」职责即可。

3. **CDP / Browser-Use / Chrome 插件 的验证阶梯**（`CLAUDE.md:30-36`）—— 那是 CodePilot 的 Electron+Next 技术栈特化。Helm 有自己的验证手段（Playwright MCP、Maestro 移动测试、`verify` skill）。借「验证分层 + 必须落证据」的**思想**，不照搬**工具链**。

4. **给每个改动都套 exec-plans Phase-table 机器** —— Helm 的 `requirements/<日期>-<topic>/` 本身就是 per-feature 单元，再平行建一棵 `exec-plans/` 树会和需求体系打架。只借 exec-plan 里的**决策日志 / 生命周期状态 / Smoke Ledger** 三个零件（已并入建议 3），**不要**把整套 active/Phase 机制复制成第二条流水线。

5. **发版/RELEASE_NOTES/构建链路的具体规范**（`CLAUDE.md:134-188`）—— CodePilot 私有，Helm 有自己的 `develop→release` 分支流和 release 文档，无关。

---

## 附：本研究读过的关键文件

CodePilot：`docs/exec-plans/README.md`、`docs/exec-plans/tech-debt-tracker.md`、`docs/exec-plans/completed/document-system-governance.md`、`docs/exec-plans/completed/engineering-quality-assurance.md`、`docs/guardrails/README.md`、`docs/guardrails/Runtime.md`、`docs/guardrails/ProviderManagement.md`、`docs/guardrails/MCP.md`、`docs/guardrails/StreamSession.md`、`docs/handover/README.md`、`docs/handover/provider-governance.md`、`docs/CLAUDE.md`、`CLAUDE.md`、`AGENTS.md`。
Helm：`docs/helm/README.md`、`workflow.md`、`standards.md`、`product.md`、`templates/`、`requirements/2026-06-24-onboarding/*`、根 `CLAUDE.md` Helm Critical rules。
