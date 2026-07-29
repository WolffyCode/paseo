# 架构 · 对话视图状态记忆

## 1. 状态归属

- `ShellModel` 持有当前对话视图身份，以及按视图身份保存的文件目录树、右侧工作区和最大化状态。
- Shell 持久化不再写入或恢复全局右侧开关；旧存储中的对应字段被忽略，防止异步 hydration 覆盖首次关闭态。
- 视图身份由 `serverId + agentId/draftId` 构成，确保 host、真实对话与草稿互相隔离。
- 左栏显隐与左栏宽度仍为全局状态；右侧工具宽度仍为 workspace 级状态。
- 右侧 Workbench 的页签模型由 host 级集合持有，不再由“右侧区域当前是否可见”决定生命周期。

## 2. 转移

```text
当前视图 A
  -> 保存 A 的右侧展示状态
  -> 解析目标视图 B
  -> B 已访问：恢复 B
  -> B 未访问：安装关闭/空的默认状态
```

草稿创建成功时执行一次身份迁移：把 draft 视图的布局记忆和 Workbench 实例移动到 agent 视图身份，再更新中区目标。迁移不复制内容，也不创建第二个 Workbench。

## 3. Workbench 生命周期

- host 级集合按对话视图身份惰性创建右侧 panel。
- 收起右侧区域只卸载视图组件；panel 与 WorkbenchModel 留在集合中。
- 再次展开或切换回来时取回同一实例，因此页签集合、顺序、焦点和各 tab content 保持。
- Shell/host 卸载时集合统一关闭并释放所有 panel，避免跨 host 泄漏。

## 4. 装配边界

- `ShellRoot` 计算当前中区目标对应的视图身份，并在布局提交前激活 ShellModel 的对应状态。
- `ConversationTreeStore` 只在 draft 完成时发出结构化的身份迁移意图；具体 Shell 与 panel 迁移由装配层完成。
- `RightPanelRegion` 接收已经解析的 panel，只负责注册当前可见 target 和渲染 Workbench。

## 5. 测试

- ShellModel：首次视图默认关闭、A/B 独立恢复、最大化恢复、左栏不受影响、draft→agent 迁移。
- panel 集合：同一视图复用实例、不同视图隔离、身份迁移复用、host dispose 释放。
- ConversationTreeStore：完成草稿时发出一次 draft→agent 迁移且中区接管保持。
- 浏览器验收：真实点击 A/B/新对话，覆盖开关、页签、收起再展开和草稿接管。
