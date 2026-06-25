# Helm 代码开发规范（standards）

> 实现层契约：**不管由 Codex 还是内部 agent 写代码，都照此执行**，保证风格一致、不被某个实现者的习惯带跑。
> 基线 = 仓库 [docs/coding-standards.md](../coding-standards.md) + [docs/testing.md](../testing.md)。本文件是 **Helm 增量与强约定**；与基线冲突处以本文件为准。**只约束新 Helm 代码**，旧代码在被触碰改造时才带到新标准（见 §2）。

## 1. 模型驱动 UI / 模型与 UI 分离（强制）

见 coding-standards《UI and model separation》。要点：

- 状态 / 派生 / 转移 / 路由 全在 **store · 纯函数 · selector**；UI 是 model 的纯函数。
- 组件只**渲染** model 派生态 + **dispatch** action；组件内无业务逻辑、无转移计算、无分支策略。
- 不持有 model 已知数据的 UI 副本——用 selector 派生。两个真相源就是 bug。
- 新行为先落 **store action / 纯函数**，组件调用之。判据：**不渲染就能测**，否则放错层了。

## 2. 重构而非打补丁（强制）

见 coding-standards《Refactor, don't patch》。

- 禁止 dead gate / `shown && …` 永假分支 / `??`-fallback 隐藏旧路径 / 半数调用点留旧 handler。
- 改子系统 = 实现最新设计 + **同一改动里删旧**（组件 + store 态 + handler + i18n 一起）。
- 末态要读起来像「一开始就照最新设计写的」，无考古层。

## 3. 注释：每个函数写「契约注释」

- 每个函数（含组件、store action、纯函数）顶部一句 **契约注释**：**做什么 / 为什么存在**（偏 why、写意图与约束），不复述实现。
- 函数**内部**仍遵守《Comments and noise》：删零信息注释、不复述代码、无装饰分隔线、无 hedging、无注释掉的代码。
- 一句话：**函数顶有「它是什么」，函数内只在「为什么这么做不显然」时才注释。**

## 4. 抽函数克制

- **不为单行 / 一次性逻辑抽小函数**（呼应 YAGNI：调用一次是 indirection，不是 abstraction）。
- 抽取只有两个正当理由：**复用**，或 **降嵌套**（>3 层，见《Density》）。否则内联。
- 禁止 `-utils` / `-helpers` / `-manager` / `-handler` 命名兜底（见《Structure and modules》）。

## 5. 测试：必须写单测 + 说明

- 每个需求的代码**必须带单测**；遵循 [testing.md](../testing.md)：TDD、真实依赖优先 mock、确定性。
- 每个测试有清晰**说明**（测什么 / 为什么 / 覆盖哪个场景）；测试名即文档。
- 纯函数 / store 逻辑**必测**（这是「模型与 UI 分离」的回报：逻辑不渲染即可测）。
- 不靠截图 / text-grep 判通过；UI 与流程要**端到端验证真生效**（见 [[verify]] / docs 教训）。

## 6. 代码风格

- 格式化只用 `npm run format`(Biome)，不手改格式、不用 `npx` 直跑工具（见根 CLAUDE.md）。
- 类型 / 错误 / 命名 / 密度 / React：全照 coding-standards 对应小节。
- 平台门只从 `@/constants/platform`；大分支用 `.web` / `.native` / `.electron` 文件而非运行时 `if`。
- 协议后向兼容 + 能力门 `server_info.features.*` + `COMPAT()` 注释（见根 CLAUDE.md）。

## 7. 文档分工：需求只写 WHAT，不写 HOW

- **`requirement.md` 只写 WHAT** —— 目标 / 用户价值 / 流程 / 全状态 / 边界 / 验收标准。**禁止**放真实代码片段、函数名、文件改法、实现路子——那会绑架实现者的思考，让不同 AI 写出不同风格。
- **`architecture.md` 写 HOW 的边界** —— 模块划分 / 数据流 / 状态归属 / 接口契约 / 复用点 / 风险，不写逐行实现。
- **`ui.html`** —— 每个功能完整 UI + 全交互态（见 [README.md](./README.md) 格式）。
- 三者 + 本规范 = **「契约三件套」**：交给任意实现者（Codex / 内部 agent），结果一致。
