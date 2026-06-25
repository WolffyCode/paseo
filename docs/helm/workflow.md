# Helm 多智能体研发工作流（workflow）

> 每个需求都走这条流水线。**主 agent = 项目经理（PM）**，对董事长负责、统筹全程、决定开发用 Codex 还是内部 agent。
> 配套：文档体系 [README.md](./README.md) · 代码规范 [standards.md](./standards.md)。

## 角色 × 性格 × 技能

| 角色 | 产出 / 职责 | 性格（态度） | 主用 skill | agent |
| --- | --- | --- | --- | --- |
| **项目经理** = 主 agent | 立项 · 拆活 · 定人 · 对接董事长 · 汇报 · 合分支 · 回写 canonical | 统筹、对董事长负责、不亲自写代码 | brainstorming · writing-plans · dispatching-parallel-agents · finishing-a-development-branch | （主 agent，无独立文件） |
| **产品经理** | `requirement.md`（只写 WHAT） | 用户至上偏执狂，口头禅「用户为什么要这个」，范围蔓延零容忍 | brainstorming | `helm-product-manager` |
| **UI 设计师** | `ui.html`（每屏全状态） | 像素 + 状态完美主义，「少画一个 hover/右键/空/错态 = 没做完」，死守 design tokens | brainstorming | `helm-ui-designer` |
| **架构设计师** | `architecture.md`（HOW 边界） | 洁癖系统派，守模型/UI分离 + 模块边界，见打补丁就拦 | writing-plans · brainstorming | `helm-architect` |
| **开发**（可多实例） | 实现 + 单测 | 靠谱工匠，先测后写、每函数契约注释、不炫技抽小函数 | test-driven-development · executing-plans · using-git-worktrees | `helm-developer` |
| **测试** | 四审验证 | 职业怀疑论者，默认「没做对」，端到端亲手验，不信截图/grep | verify · verification-before-completion | `helm-qa` |
| **代码质量审核员** | 对规范逐条审 | 铁面御史，反打补丁，缺契约注释/单测/UI耦合一律打回 | code-review · simplify · security-review | `helm-code-reviewer` |

## 契约三件套

`requirement.md`(WHAT) + `architecture.md`(HOW 边界) + `ui.html`(全态 UI)，外加 `standards.md`(怎么写)。三件套齐 → Codex 或内部 agent 实现，**风格一致**。

## 流水线（3 个董事长闸）

```
P1 需求 + UI   产品经理 + UI设计师 一起产出 requirement.md + ui.html
              ─▶【闸 1 · 董事长一起看】
P2 架构        架构设计师 出 architecture.md
              ─▶【闸 2 · 董事长单独审】
P3 开发        PM 按规模自定 Codex / 内部 + 人数；TDD；照 三件套 + standards
              → 代码质量审核员 评审过（缺注释/单测/打补丁 打回重做）
              → PM 跟董事长说「需求完成了」
P4 测试        测试 四审：① 需求完成度（逐条对 requirement 验收标准）
                        ② 产品流程是否通（端到端跑）
                        ③ UI 是否达标（逐屏逐态对 ui.html 像素核）
                        ④ 代码质量是否达标（对 standards 逐条）
              ─▶【闸 3 · 董事长验收】
P5 集成        PM 同步 develop（finishing-a-development-branch）
              + 回写 canonical（product.md / ui.html）
```

董事长只在 **3 个闸**出现：需求+UI（一起）、架构（单独）、最终验收。其余内部自跑。

## 各阶段 superpowers 技能

- **P1**：产品经理/UI 设计师用 `brainstorming` 探需求与设计。
- **P2**：架构设计师用 `writing-plans` 把 spec 变结构 + `brainstorming` 比选方案。
- **P3**：开发用 `test-driven-development` + `executing-plans`（+ `using-git-worktrees` 隔离）；审核员用 `code-review`（+ `simplify` / `security-review`）。
- **P4**：测试用 `verify` + `verification-before-completion`。
- **P5**：PM 用 `finishing-a-development-branch`。

## Codex vs 内部 agent（PM 判断）

- **大 / 独立 / 可隔离** → Codex：开 worktree，交「契约三件套 + standards」，让它自行实现。
- **碎 / 强耦合现有上下文** → 内部 `helm-developer` agent：`subagent-driven-development` / `dispatching-parallel-agents`，多实例并行。
- 无论哪种，**P3 末尾都过 `helm-code-reviewer`**，P4 都过 `helm-qa`。

## 模型选型规范（硬规则）

启动**任何 Paseo agent** 必须用最强模型 + 最高思考档（成本不是约束）：

| 提供方 | 必须用的模型 | 思考档 | 上下文 |
| --- | --- | --- | --- |
| **codex（gpt）** | `gpt-5.5`（`codex/gpt-5.5`） | **xhigh** | 1M |
| **reclaude** | **Opus 4.8 1M**（`claude-opus-4-8[1m]`） | **max** | 1M |

- **禁止**：gpt-5.4 及以下；非 1M 的 Opus；低于上述思考档。
- 启动时**显式设置思考档**：CLI `paseo run --provider codex/gpt-5.5 --thinking xhigh` / `--provider reclaude/claude-opus-4-8[1m] --thinking max`；MCP `create_agent` 用 `settings.thinkingOptionId`。
- role→provider 默认（PM 仍可按任务判断，但上面的「提供方→模型+思考档」是绝对的）：impl/research/audit → `codex/gpt-5.5`；ui/planning → `reclaude/claude-opus-4-8[1m]`。
- 落地文件：`~/.paseo/orchestration-preferences.json`（paseo skill 选 provider 前**必读**该文件）。

## 产出物位置

`docs/helm/requirements/<YYYY-MM-DD>-<topic>/{requirement.md, ui.html, architecture.md}`；canonical 回写 `docs/helm/{product.md, ui.html}`。模板见 [templates/](./templates/)。
