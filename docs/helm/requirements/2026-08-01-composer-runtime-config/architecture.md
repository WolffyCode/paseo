# 架构 · 桌面 Composer 运行配置

> 日期：2026-08-01 · 状态：已实现，待 Gate 3 验收 · 关联：[requirement.md](./requirement.md) · [ui.html](./ui.html)

## 1. 模块边界

- Composer 继续拥有工作目录、输入、附件、语音、发送与运行配置的组合布局，不建立第二套输入组件。
- Agent controls 继续拥有模型、推理强度、运行模式和 provider feature；桌面布局只保留一个提供方/中转站/模型级联入口。
- 级联层级、初始页选择和层级转移由独立纯模型负责，UI 只渲染视图并派发选择。
- Host provider config 是中转站列表、暴露模型与当前中转站的唯一配置源；官方直连由路由模型作为每个提供方的固定首项加入。
- 文件自动补全 Hook 只保留 slash command 路径；文件提及解析、查询和替换模块删除。
- Draft 内容展示由纯展示模型在乐观消息流、居中空态、带标题的中区底部空态、无标题窄栏空态和错误态之间选择；UI 只渲染模型结果。
- 桌面工作目录选择器通过 `.native.tsx` 保留原生端实现；PC Web/Electron 的 Helm 浮层承载当前电脑已知项目，并进入同一个双栏目录浏览器。两端继续通过同一个 `onSelected(workspace)` 边界把当前电脑的真实绝对路径交回草稿。

## 2. 数据流

1. provider capability snapshot 形成提供方与官方模型列表。
2. Host config 的 `vendors` 形成各提供方的中转站路由；只消费启用项，并按 `order` 排序。
3. 中转站模型由 `models` 与 `exposedModelIds` 交集形成；未暴露模型不进入 Composer。
4. `currentVendorId` 缺失时使用官方直连；空字符串同样表示官方直连；其它值表示对应中转站。不存在或已禁用的值回到未选择状态。
5. 选择中转站通过现有 Host config patch 持久化；选择模型、thinking、mode 与 feature 继续走各自已有偏好或 Agent 动作。
6. 新对话传入提供方选择动作；活动对话不传入该动作，级联模型据此锁定提供方层。
7. 未选目录提交时，客户端在 capability gate 通过后发送 `conversationOnly: true`，不发送 `workspaceId`；daemon 使用 `$PASEO_HOME/conversations` 作为 provider 所需的内部 cwd，但不调用 workspace 解析/创建，也不把该目录暴露成用户 workspace。
8. 选择目录提交时继续发送真实 `workspaceId` 与目录 cwd，原有 workspace/project 所有权链路不变。

## 3. 平台与布局

- 新布局由桌面 Web/Electron form factor 决定，不因中区面板变窄而退回手机结构；文字触发器在自身范围内省略长值，始终保留独立入口。原生手机路径保持现有结构。
- 所有运行配置下拉复用现有锚定 Combobox：模型使用 `top-start`，推理强度、运行模式、provider feature 与上下文使用 `top-end`，统一 14px offset；不新增居中 Modal。
- Composer 主体最大宽度为 760px；运行配置使用单行 flex，标签固定在左、控件组在右，模型摘要和其它文字控件各自在边界内收缩省略，不切换成第二套图标布局。
- 工作目录在桌面移到输入框上方并使用锚定浮层；项目搜索消费已有/推荐目录。点击“浏览文件系统…”进入左右双栏、分别滚动的当前电脑目录浏览器。原生端保留现有平台实现，PC Web/Electron 不调用浏览器文件句柄。
- PC/Web 中区主画布选择“底部 Composer + 中部空态标题”展示；右侧窄对话继续选择无标题底部展示，手机端不接入该展示类型。首条消息进入现有乐观消息流后，标题由同一展示模型移除。

## 4. 协议与运行时边界

- `vendors` 与 optional `currentVendorId` 继续使用既有向后兼容协议，无新增 RPC。
- Composer 已消费中转站配置做选择与回显，但 daemon Agent 启动/发送链路仍不消费 `currentVendorId`。不得把 UI 选择描述为已经切换活动 Agent 的 API endpoint。
- 本期不恢复历史 vendor 启动注入路径，不绕过现有的 no-send-path 约束。
- `create_agent_request.conversationOnly` 是向后兼容的可选字段；daemon 通过 optional `server_info.features.conversationOnlyAgents` 声明支持。客户端在草稿提交入口单点门控，旧 Host 缺少能力时显示更新提示，不发送新字段，也不模拟 workspace 回退。
- conversation-only 与 `workspaceId`、worktree/git 创建互斥；daemon 在创建 Agent 前拒绝组合请求。无 workspace 的 Agent 仍可进入消息流和 Composer，但 workspace 文件、终端、浏览器与 review 工具不建立目标。

## 5. 测试

- 级联纯模型覆盖缺提供方、缺中转站、完整三级路径、提供方选择和中转站选择。
- 路由纯模型覆盖官方直连、启用/禁用中转站、排序、暴露模型过滤、明确选择、缺失选择和陈旧选择。
- Draft 展示纯模型覆盖乐观消息、居中空态、中区标题空态、右侧无标题空态与错误态。
- 目录纯模型覆盖当前电脑位置树、路径历史、双栏滚动、选择确认/取消/失败与清空；桌面交互验证项目搜索、选择、目录浏览和纯对话入口。
- server session 集成测试覆盖 conversation-only 创建：内部 cwd 存在、Agent 无 `workspaceId`、project/workspace registry 均不新增记录。
- 只运行受影响的定向测试，再执行全仓 typecheck、lint 和格式检查。
- Gate 3 在桌面 Web 实际点击验证布局、上方锚定、默认层级、提供方锁定、输入动作与控制台错误。
