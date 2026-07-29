# 架构 · 右侧对话页签

> 日期：2026-07-28 · 状态：开发验证中 · 关联：[requirement.md](./requirement.md) · [ui.html](./ui.html)

## 1. 模块划分

- 右侧 Workbench 继续拥有所有页签身份、聚焦、关闭与排序，不建立第二套对话页签 store。
- conversation tab content 只保存 target、workspace、title 与 readOnly，真实消息/草稿生命周期继续由既有对话面板负责。
- 左树 store 只派发结构化“打开右侧对话”意图；装配层负责展开 Shell 右栏并送入已挂载或待挂载的 Workbench。
- 根对话拖拽编码/解码是纯模型；行组件只写入载荷，中区组件只转发有效 drop。
- 对话树模型向右栏暴露当前中区目标的真实 workspace；右栏不维护第二套目录选择状态。

## 2. 模型与 UI 分离

- WorkbenchModel 负责 agent/draft 身份、去重、append 和 draft→agent 重定向。
- ConversationTreeStore 负责 subagent 入口的 `readOnly=true` 语义和离线门。
- 纯函数负责 drag payload 的可信解码；非法、缺目录和非根对话载荷拒绝。
- UI 仅渲染页签、新建入口、drop 高亮和对话面板，并 dispatch open/retarget/close/reorder。

## 3. 数据流与接口契约

```text
subagent click -> tree store -> open conversation request(readOnly) -> right registry -> Workbench
root drag -> encoded payload -> center drop -> tree store request(editable) -> Workbench
right new -> current center workspace -> draft request -> WorkspaceDraftAgentTab
create success -> session snapshot -> tab retarget(agent) -> daemon directory update -> left tree grouping
```

真实 agent 的页签身份为 agentId，draft 身份为 draftId。每个 conversation request 必须同时携带 workspaceId、title 与 readOnly；页签自身的 workspace 作为 PaneContext 工作目录，不跟随中区切换。

## 4. 复用点 / 禁止重造

- 复用 WorkbenchModel、TabBar、AgentConversationPanel、PaneProvider、WorkspaceDraftAgentTab、session store 和右栏文件打开能力。
- 禁止复制 timeline、Composer、createAgent、agent fetch、workspace 分组或页签排序逻辑。
- 禁止把 subagent readOnly 仅等同于 provider observed 字段。

## 5. 协议 / 平台

不修改协议、RPC 或能力门。拖拽使用 Web/Electron 的受控 DOM 事件并由 `isWeb` 门保护；其它对话能力保持跨平台。

## 6. 测试策略

- Workbench：真实 agent 去重、多个 draft、draft→agent、关闭与排序回归。
- Tree store：subagent 请求携带继承 workspace 与 readOnly。
- Drag：合法载荷 round-trip，缺目录与非法 JSON 拒绝。
- Registry/controller：右栏展开顺序、未挂载队列和跨 workspace conversation 请求。
- 端到端：点击真实 subagent、拖入真实根对话、沿用当前 workspace 新建、未选目录禁用、首次发送、左树归组、刷新持久化、只读输入禁用。

## 7. 风险与取舍

- 右栏按当前 Shell workspace 挂载，但 conversation tab 自带 workspace，避免为了并行对话切换中区；文件链接按页签 workspace 解析后仍在当前 Workbench 打开。
- 页签状态当前为客户端会话内存，刷新后不恢复右栏布局；真实 agent 已持久化并仍会出现在左树。
- 当前中区 workspace 缺失时右栏新建入口禁用，不猜测路径，也不回退到旧新建路由。
