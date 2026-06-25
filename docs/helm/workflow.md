# Helm 研发工作流（三层主子孙：总监 → 项目经理 → 员工）

> 主 agent = **项目总监（Director）**，只维护 `develop` 分支，指挥最多 3 个项目经理；每个项目经理调度自己的小组。
> 配套：文档体系 [README.md](./README.md) · 代码规范 [standards.md](./standards.md)。

## 三层结构

```
董事长 (Chairman · 人)
  └─ 项目总监 (Director = 主 agent)        ── 只维护 develop；指挥 ≤3 个 PM；不亲自写功能
       ├─ 功能项目经理 PM①（如 首页）        ── 一个模块 · 一条 off-develop 分支 · 自调度本组
       │    └─ 员工：产品 · UI · 架构 · 开发 · 测试
       ├─ 功能项目经理 PM②（如 对话框）       ── 同上，可与 PM① 并行
       │    └─ 员工：产品 · UI · 架构 · 开发 · 测试
       └─ develop 守护 PM③（固定角色）        ── 保证 develop 完全符合整体 product.md + ui.html
            └─ 员工：产品(查产品) · UI(查 UI) · 测试(查代码质量)
```

- **项目总监（主 agent）**：只对 `develop` 负责——派活、把 PM 的设计稿转呈董事长、转达验收意见、合并分支、守 develop 完整。**不亲自做功能开发**。
- **功能 PM（最多 2 个并行）**：各负责一个模块；基于 develop 建开发分支；自行调度本组 产品/UI/架构/开发/测试；对总监负责。
- **develop 守护 PM③（固定角色）**：每当一条分支合并进 develop 后，带 产品/UI/测试 对 develop 做回归——产品查「是否符合整体 product.md」、UI 查「是否符合整体 ui.html」、测试查「代码质量」。**有差异 → 退回该功能项目的开发修**。
- **员工**：每个 PM 下设 产品 · UI · 架构 · 开发 · 测试，由该 PM 自行调度。

## 模型（硬规则）

**全层、全员一律 `claude-opus-4-8`（Opus 4.8），思考档 high/max（难任务用 max）。不用 Codex / `gpt` 员工，不降档。** 成本不是约束。

## 每个功能项目的流程

```
0. 总监把项目派给一个功能 PM。
1. PM 基于 develop 建开发分支；PM 的 产品 + UI 基于 develop 的 canonical（product.md + ui.html）
   出「需求 + 最新设计稿」。
2. PM 把 需求 + 设计稿 交总监 → 总监转呈董事长   ──▶【闸 1 · 董事长审 产品+设计稿】
3. 通过 → PM 的 架构 出「架构实现方案」(architecture.md) → 总监转呈董事长 ──▶【闸 2 · 董事长审架构】
4. 通过 → PM 安排 开发 实现（契约三件套 + 单测）→ 测试 单测 + 回归。
5. 测试通过 → PM 上报总监 → 总监报董事长       ──▶【闸 3 · 董事长打开客户端/调试窗口验收成果】
6. 董事长找到的问题 → 退回该项目组（开发修）→ 循环直到董事长 OK。
7. 董事长确认 OK → 总监把分支合并 develop；合并若有代码冲突 / 功能失效，
   由该项目组解冲突 + 串通主流程。
8. 合并后交 develop 守护 PM③ → 产品/UI/测试 对 develop 回归（对照整体 product.md + ui.html）
   → 有差异 → 该项目开发修 → 直到 develop 与整体设计 / 产品文档完全一致。
```

## 董事长接触点（3 个闸）

- **闸 1 · 产品 + 设计稿**：需求 + 设计稿（产品 + UI 一起出，基于 develop canonical）。
- **闸 2 · 架构实现方案**：`architecture.md`（HOW 边界 / 实现方案）。
- **闸 3 · 成果验收**：打开客户端 / 页面调试窗口，亲验成果。
- 守护 PM③ 的 develop 回归是**合并后的内部闸**，出差异才上报。

## 角色 × 性格 × 技能 × agent

| 层 | 角色 | 职责 / 产出 | 性格（态度） | 主用 skill | agent |
| --- | --- | --- | --- | --- | --- |
| 总监 | **项目总监** = 主 agent | 维护 develop · 派活 · 转呈设计 · 转达验收 · 合并 · 守完整性 | 只管 develop、对董事长负责、不写功能 | dispatching-parallel-agents · finishing-a-development-branch | （主 agent） |
| PM | **功能项目经理** | 立项 · 调度本组 · 出 需求+设计稿 · 汇报 · 解冲突串主流程 | 统筹、对总监负责、自调度本组 | brainstorming · writing-plans · dispatching-parallel-agents | `helm-pm` |
| PM | **develop 守护** | 保证 develop 符合整体设计 / 产品文档 | 铁面巡检、产品/UI/代码三线对照 | code-review · verify | `helm-guardian` |
| 员工 | **产品** | `requirement.md`（只写 WHAT） | 用户至上偏执狂、范围蔓延零容忍 | brainstorming | `helm-product` |
| 员工 | **UI** | `ui.html`（每屏全态） | 像素 + 状态完美主义、死守 design tokens、**画面 = 真实 UI（流程解释进注解块）** | brainstorming | `helm-ui` |
| 员工 | **架构** | `architecture.md`（HOW 边界） | 洁癖系统派、守模型/UI分离 + 模块边界、见打补丁就拦 | writing-plans | `helm-architect` |
| 员工 | **开发**（可多实例） | 实现 + 单测 | 靠谱工匠、先测后写、每函数契约注释、不炫技抽小函数 | test-driven-development · executing-plans · using-git-worktrees | `helm-dev` |
| 员工 | **测试** | 单测 + 回归 + 四审 | 职业怀疑论者、默认「没做对」、端到端亲手验、不信截图/grep | verify · verification-before-completion · code-review | `helm-qa` |

测试四审（沿用）：① 需求完成度（逐条对验收）② 产品流程是否通（端到端）③ UI 是否达标（逐屏逐态对 ui.html）④ 代码质量是否达标（对 standards 逐条）。

## 契约三件套

`requirement.md`(WHAT) + `architecture.md`(HOW 边界) + `ui.html`(全态 UI) + `standards.md`(怎么写)。三件套齐 → 开发实现，**风格一致**。

## 文档同步铁律（保留）

- 设计**基于 develop 的 canonical** product.md + ui.html 出最新设计稿；项目合并后 canonical 同步。
- 每个需求**全量自查**（完整性 + 流程打通，见 README §4「每个需求的工作流」第 4 步）；develop 守护 PM③ 是这条的最终执行者。

## 产出物位置

`docs/helm/requirements/<YYYY-MM-DD>-<topic>/{requirement.md, ui.html, architecture.md}`；canonical 回写 `docs/helm/{product.md, ui.html}`。模板见 [templates/](./templates/)。
