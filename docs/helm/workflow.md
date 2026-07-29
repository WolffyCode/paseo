# Helm 研发工作流（当前编码客户端 · 三个董事长闸）

> 当前编码客户端端到端负责需求分析、设计同步、架构、实现和验证。仓库不要求多代理组织，不绑定任何 provider、模型或思考档位。
> 配套：文档体系 [README.md](./README.md) · 代码规范 [standards.md](./standards.md)。

## 执行原则

- **单一责任主体**：当前编码客户端负责把任务从现状调查推进到可运行、可验收的结果，不把完成责任转交给外部编排系统。
- **工具中立**：仓库不指定客户端、provider、模型或推理配置。运行环境和用户决定使用什么工具。
- **按需协作**：只有用户明确要求，或当前客户端原生支持且确有收益时，才进行任务委派；委派不改变当前客户端对最终结果的责任。
- **分支隔离**：功能工作从 `develop` 切分支；验证完成并经董事长验收后才合回 `develop`。
- **证据优先**：每个阶段都以仓库文档、代码、测试和真实客户端行为为证据，不以口头完成或截图替代功能验证。

## 每个功能项目的流程

1. **读现状**：阅读 `docs/helm/product.md`、`docs/helm/ui.html`、相关 requirement/architecture 和现有代码，确认真实基线。
2. **产品 + 设计**：在 `requirements/<YYYY-MM-DD>-<topic>/` 产出 `requirement.md` + `ui.html`，同步 canonical `product.md` + `ui.html`，并完成全量完整性与流程连通性自查。
3. **闸 1 · 董事长审产品 + 设计稿**：提交需求边界、流程、全状态和 UI；未通过前不进入架构实现。
4. **架构方案**：产出 `architecture.md`，明确模块边界、状态归属、数据流、复用点、兼容性、测试策略和风险。
5. **闸 2 · 董事长审架构**：架构通过后再实现；反馈回写文档，避免实现与契约分叉。
6. **实现 + 验证**：按 [standards.md](./standards.md) 实现，补相关单测，只运行受影响的测试文件，并执行 typecheck、lint、format。
7. **闸 3 · 董事长验收成果**：启动真实客户端/调试页面，按 requirement 和 UI 逐项验收。问题回到实现和验证步骤，直到通过。
8. **合并 + 回归**：董事长确认后合回 `develop`；在 `develop` 上对照 canonical 产品文档、UI 设计和代码质量做回归，再按分支规则推进 `release`。

## 董事长接触点

- **闸 1 · 产品 + 设计稿**：确认做什么、用户流程、边界和完整 UI 状态。
- **闸 2 · 架构实现方案**：确认怎么分层、状态放哪里、如何兼容和验证。
- **闸 3 · 成果验收**：在真实客户端或调试页面亲自验证功能。

## 质量职责

当前编码客户端在交付前完成四项自审：

1. **需求完成度**：逐条核对验收标准。
2. **产品流程**：端到端走通入口、成功、取消、失败、离线和恢复路径。
3. **UI 一致性**：逐屏逐态对照 `ui.html`，检查桌面与紧凑布局。
4. **代码质量**：逐条对照 [standards.md](./standards.md)、相关测试和仓库检查命令。

## 契约三件套

`requirement.md`（WHAT）+ `architecture.md`（HOW 边界）+ `ui.html`（全态 UI）+ `standards.md`（实现规范）。三件套齐全且两个 canonical 已同步，才能进入实现。

## 产出物位置

`docs/helm/requirements/<YYYY-MM-DD>-<topic>/{requirement.md, ui.html, architecture.md}`；canonical 回写 `docs/helm/{product.md, ui.html}`。模板见 [templates/](./templates/)。
