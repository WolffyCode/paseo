# 架构 · 新对话工作目录

## 1. 状态归属

- `ConversationTreeStore` 持有中区草稿身份及可空的 workspace 绑定；全局新建创建未绑定草稿，项目菜单新建创建预绑定草稿。
- `WorkspaceDraftAgentTab` 持有目录选择的瞬时 UI 状态和草稿输入；创建请求仍只接受真实 workspace id 与 cwd。
- host 是目录与 workspace 身份的唯一真源。选择路径后调用现有 `open_project_request`，使用返回的 descriptor 更新 session store 和草稿目标。

## 2. 状态转移

```text
全局新建 -> unbound draft
unbound draft -> 选择目录 -> selecting
selecting -> 取消/失败 -> unbound draft（输入不变）
selecting -> open_project 成功 -> bound draft
bound draft -> 首次发送 -> pending agent -> real agent
项目菜单新建 -> bound draft
```

## 3. 组件边界

- 目录入口是 draft Composer 的上下文栏，不进入通用 `Composer` 的消息编辑职责。
- 中区未绑定草稿可直接挂载 draft surface；绑定 workspace 后继续沿用既有 PaneContext 与真实创建流。
- 桌面本机选择通过 Electron 目录桥；非本机桌面和其它平台使用 daemon 目录 suggestions，最终统一走 `openProject(cwd)`。
- 选择成功后立即把返回 descriptor 合并进 session store，并让 conversation tree 的 workspace stream 完成项目树同步。

## 4. 不变量

- `createAgent` 前同时存在 workspace id 与非空 cwd。
- 目录选择失败不改变当前绑定；取消不创建 workspace。
- 草稿 id 在未绑定到绑定的过程中保持不变，因此输入 store 与视图周期不丢失。
- 创建期间禁止改目录，避免乐观 agent 与请求 workspace 分叉。
- 选中颜色使用独立语义 token，不修改 toggle 或 hover 的全局含义。

## 5. 测试

- Store：全局未绑定、项目预绑定、目录绑定、非法 workspace、draft→agent。
- 纯模型：目录 label、发送前置条件、失败/取消保持。
- 组件：目录入口状态、选择成功回调、未选目录错误与选中背景。
- 浏览器验收：首次草稿、取消、选择真实目录、输入保持、创建归组、旧对话切换和 hover/selected 对比。
