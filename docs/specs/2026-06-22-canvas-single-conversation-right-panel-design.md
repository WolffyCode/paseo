# 画布重构:单一主对话 + 右侧可展开工具面板

- **日期**:2026-06-22
- **状态**:设计已批准(主席 OK),待实现
- **效果图**:`docs/specs/assets/canvas-redesign-mockup.png`(HTML 源:同目录 `.html`)

## 背景 / 问题

当前 workspace 画布(`packages/app/src/screens/workspace/workspace-screen.tsx` 的 center column)把所有 tab 类型——`agent`/`draft`、`terminal`、`browser`、`file`、`setup`——都渲染在中间,顶部带页签栏(`WorkspaceDesktopTabsRow`)+ split-pane 树(`useWorkspaceLayoutStore`)。同时开多个工具时,画布显得杂乱。

## 目标

中间画布**只显示一个主对话**(干净,参考 Codex)。其它工具(审查 / 终端 / 浏览器 / 文件 / 侧边聊天)收进**右侧面板**,默认隐藏,由顶栏右上角一个「展开」图标开合。右侧面板内工具以**页签**形式存在,带「+」添加菜单。

## 已批准的交互(三态,见效果图)

1. **默认**:左侧栏(保持现状)+ 单一主对话。顶栏左为标题 + `…` 菜单,右上角只有一个「展开右侧面板」图标。中间**无页签栏、无分屏**,大片留白。对话切换走左侧栏的 workspace 选择。
2. **展开**:点图标 → 右侧面板滑出,图标进入激活态。面板头 = 页签栏 + 末尾「+」。「+」菜单项:**审查 ⌃⇧G / 终端 / 浏览器 ⌘T / 文件 ⌘P / 侧边聊天 ⌥⌘S**。
3. **多页签**:右侧面板内可并存多个工具页签(如 终端 + 侧边聊天),页签切换、可关闭(x),中缝可拖拽调宽。主对话始终不受影响。

## 关键决策

- **主画布严格单对话**:移除中间页签栏与中间分屏;对话切换只走左侧栏。
- **非对话工具只在右侧面板**:`terminal` / `browser` / `file` / 审查(diff/review)/ 侧边聊天,只在右 pane 出现。
- **侧边聊天** = 右侧面板里跑的第二个 agent 对话。
- **移动端 / 窄屏**:不并排;打开工具时全屏接管,复用现有移动端切换器。
- **左侧栏保持现状不动**。
- **纯客户端布局重构**:无需新增 server 能力 / 协议变更。

## 实现思路(复用现有机制,细节由实现计划展开)

- 复用 split-pane + tabs(`useWorkspaceLayoutStore` / `useWorkspaceTabsStore`):布局建模为 **主 pane(对话,无页签栏)+ 可选右 pane(工具,带页签栏 + 「+」)**。
- 顶栏「展开」图标切换右 pane 显隐(状态落在 `panel-store`)。
- 主 pane:不再为对话渲染 `WorkspaceDesktopTabsRow` / 移动端切换器;直接渲染激活的 `agent`/`draft`。
- 右 pane:自带页签栏(复用/改造 `WorkspaceDesktopTabsRow`)+ 「+」`DropdownMenu` 列出工具类型;选择即在右 pane 开页签。
- tab 类型路由:`agent`/`draft` → 主 pane;`terminal`/`browser`/`file`/审查/侧边聊天 → 右 pane。

## 受影响文件(初步)

- `packages/app/src/screens/workspace/workspace-screen.tsx`(center column、header、tabs row、mobile switcher)
- `packages/app/src/screens/workspace/workspace-desktop-tabs-row.tsx`
- `packages/app/src/stores/workspace-layout-store.ts` / `workspace-layout-actions.ts`
- `packages/app/src/stores/workspace-tabs-store/*`
- `packages/app/src/stores/panel-store/*`(右面板开合 flag)
- panel registry / pane providers

## 范围外

- 左侧栏任何改动。
- 各工具面板内部实现改动。

## 参考

- 效果图:`docs/specs/assets/canvas-redesign-mockup.html` / `.png`
