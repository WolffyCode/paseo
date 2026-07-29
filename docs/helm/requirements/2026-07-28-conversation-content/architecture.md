# 架构 · 中区真实对话与新对话草稿

## 1. 模块边界

- `ShellRoot` 是 host 级组合根，持有一份 `ConversationTreeStore`，左栏与中区共享。
- `LeftRegion` 只渲染树、搜索和 host 控件，不再拥有 store 生命周期。
- `ConversationRegion` 把 `focusedRootId` 解析成 agent/workspace，并通过 `PaneProvider` / `PaneFocusProvider` 挂载既有 `AgentConversationPanel`。
- 消息流、timeline、Composer、归档和错误态继续由 `AgentConversationPanel` 及其现有 hooks/stores 负责。
- `ConversationTreeStore` 额外持有 host 级中区 draft 目标；顶部和项目入口只更新该目标，不调用旧新建路由。
- `WorkspaceDraftAgentTab` 提供 Shell 专用 docked 布局变体，只改变空草稿的布局锚点，不改变其它 workspace 页面默认的居中新建体验。

## 2. 数据流

```text
daemon agent/workspace stream
  -> ConversationTreeStore
  -> focusedRootId 或 draftId + workspaceId
  -> ConversationRegion PaneContext
  -> AgentConversationPanel
  -> session store / fetchAgent / timeline sync
```

`HostRuntime` 已负责 agent directory 到 session store 的同步；中区不复制目录数据，也不把树内 preview fixture 写入 session store。

## 3. 生命周期

- 每个 `serverId` 创建一份树 store，host 连接后挂载，切 host 或离开壳层时 dispose。
- 左栏显隐不影响 store，因此不会清空 `focusedRootId`。
- 当前根对话的 workspaceId 写入 shell context，使右栏与文件树随对话切换到同一 workspace。
- 对话组件以 agentId 为 key，切换时重建内容边界，避免旧 timeline 短暂串入。
- 草稿组件以 draftId 为 key；第一次提交沿用既有 `createAgent` 与 optimistic stream。创建回调先把 snapshot 写入 session store，再把树模型原子切到真实 agent + 原 workspace，避免等待 daemon 目录事件造成空态闪烁。
- daemon 的 agent upsert 到达后接管树节点；临时的创建完成 workspace 只用于跨越这段竞态，并在切换目标或收到真实节点后清理。
- 初始 agent/workspace 快照成功写入 store 后，store 在同一 action 内检查中区目标；仅当根对话、草稿和 pending agent 都为空时创建默认草稿，避免加载完成后闪出“选择一个对话”或覆盖并发产生的显式目标。

## 4. 新对话工作区解析

- 项目菜单入口直接携带已解析的 workspaceId。
- 首次进入自动草稿与全局入口共用解析规则：优先当前中区根对话的 workspace；否则从已知 workspace 中优先选择 `local_checkout` / `directory`，并按目录与 ID 稳定排序。
- 没有 workspace 时仍进入中区的 unavailable draft 状态，不触发 `/new` 或 `/open-project` 路由。

## 5. 文件联动

`PaneContext.openFileInWorkspace` 把消息文件位置转给现有 `rightTabBridge`。相对路径先以 `WorkspaceDetail.directory` 解析成 host 绝对路径；绝对 Unix、home 与 Windows 路径保持其原身份。桥负责打开右栏并交给现有 Workbench 去重、聚焦和加载。

## 6. 降级与错误

- 显式选择的根对话被移除或 agent 没有 workspaceId：渲染中区可恢复空态，不猜测目录；这不是首次进入落点。
- host 离线：store 保持选择，真实对话面板使用既有离线/重连逻辑。
- preview 根对话不是 daemon agent：真实面板按既有 missing-agent 路径处理，不能生成伪造 timeline。
- 新对话没有可用 workspace：渲染内嵌不可用态；选择根对话或打开项目后可退出。
- 创建失败：继续持有同一个 draftId，保留 Composer 状态和重试入口。

## 7. 测试

- 纯函数：根对话到 workspace 的解析；跨平台绝对/相对路径处理。
- 现有 store 测试：根对话更新 `focusedRootId`，subagent 保持中区 focus。
- store 初始化测试：首次加载后创建默认 workspace 草稿，并证明已有根对话、草稿或 pending agent 不会被覆盖。
- 集成调试：导入真实 Codex 会话，点击左树验证真实 timeline、Composer 与文件联动。
- 新建调试：点击顶部与项目入口验证 URL 不变、workspace 正确、第一条消息发送前后 Composer 的边界框位置不变，以及真实 agent 接管和重载持久化。
- 修改后运行聚焦 Vitest、`npm run typecheck`、`npm run lint` 与 `git diff --check`。
