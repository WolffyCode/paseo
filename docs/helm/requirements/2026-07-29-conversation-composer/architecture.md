# 架构 · 对话 Composer 与运行配置

> 日期：2026-07-29 · 状态：已实现，待 Gate 3 验收 · 关联：[requirement.md](./requirement.md) · [ui.html](./ui.html)
> 遵循 [standards.md](../../standards.md)，本文件只定义实现边界与可验证契约。

## 1. 模块划分

- `packages/app/src/composer/` 继续拥有真实对话 Composer。`index.tsx` 只组合输入、队列、工具栏、上下文用量和发送状态，不新建第二套输入组件。
- `packages/app/src/composer/composer-toolbar-model.ts` 以纯函数派生桌面/紧凑态的常驻控件、收纳控件、锁定状态和稳定尺寸；布局决策不散落到组件条件分支。
- `packages/app/src/composer/agent-controls/` 继续拥有提供方、中转站、模型、推理强度、运行模式和 provider feature 的选择能力。现有 selector 与 provider capability 数据是唯一来源，仅重组触发器、锚定面板和紧凑态入口。
- `packages/app/src/composer/draft/workspace-picker.tsx` 继续负责草稿工作目录入口。它在 Composer 顶部上下文条中渲染；本机 Electron 调用系统目录选择器，远程 host 保留 host 目录选择能力。
- `packages/app/src/components/context-window-meter.tsx` 继续组合当前对话 context window 与 provider usage，只调整为统一的 32px 点击槽位。
- `packages/app/src/composer/actions.ts` 继续拥有本地待发队列的纯操作。删除和强制发送均操作现有 session queue，不新增队列 store。

## 2. 模型与 UI 分离

- session store 继续持有真实 agent、queued messages、context window 和运行状态；draft store 继续持有草稿文本、附件与创建配置。
- provider hooks/manifest 继续提供可用 provider、vendor/model、thinking、mode、feature 和 usage；UI 不硬编码 Codex、OpenCode 或额度窗口。
- 纯模型根据 `isCompactLayout`、能力集合、会话是否已创建和数据是否可用，派生常驻槽位与“+”菜单内容。工作目录与 provider 的锁定规则由会话类型输入决定。
- UI 只渲染模型结果并派发已有选择、发送、停止、删除、强制发送和目录选择动作。组件不复制 store 已知状态，也不自行推导 provider 能力。

## 3. 数据流与接口契约

1. 新对话加载 draft 配置，Composer 顶部渲染目录上下文条；目录选择成功后，daemon 返回的真实 workspace 写入 session store 并绑定 draft。
2. Electron 本机目录点击调用 `pickDirectory()`，其 bridge 最终使用 Electron `showOpenDialog({ properties: ["openDirectory"] })`；取消返回 `null` 且保留草稿。远程/browser/native 使用 host 目录建议并以 `openProject` 验证。
3. provider 控件从当前 capability snapshot 派生选项。创建前 provider 可改；创建后 provider 只显示锁定摘要，中转站、模型、thinking、mode 与 feature 仍通过现有 preference/agent action 保存。
4. agent 运行时提交写入现有 `queuedMessages`。删除只按 id 移除目标项；强制发送先移除并调用现有 submit，失败时把原项恢复到队首并暴露错误。
5. context meter 从 agent 的 used/max tokens 派生百分比，信息面板按返回值追加 provider usage windows、balances 和 details；任一数据缺失不伪造占位。

## 4. 复用点 / 禁止重造

复用：`CombinedModelSelector`、现有 thinking/mode/provider feature 控件、session/draft store、`ContextWindowMeter`、`ProviderUsageTooltipSection`、`pickDirectory`、`openProject`、`sendQueuedComposerMessageNow` 与既有 Composer 附件/语音命令。

禁止新增第二套 provider/model 配置、第二个 queue、硬编码 5h/7 天额度、伪造 Plan/Build 模型、用 host Relay 表示中转站、在 Web 中模拟 Electron 目录路径或复制一份 Composer 状态。

## 5. 协议 / 平台

- 本需求不改协议。当前协议已经提供 context window、provider usage、provider modes/features 与模型能力。
- Electron 本机目录使用现有桌面 bridge；远程 host、普通 Web 与 native 不调用本机文件系统，继续使用 host-backed 目录选择。
- 响应式按 Composer 容器宽度/compact form factor 决定，不用 `Platform.OS` 代替布局判断。DOM 键盘和锚点逻辑继续受 `isWeb` 保护。

## 6. 测试策略

- 纯模型单测覆盖 780px 桌面与 320px 紧凑态的常驻/收纳控件、能力缺失和创建后锁定。
- Composer action 单测覆盖队列删除的精确性，以及强制发送成功、失败恢复和缺失目标。
- workspace picker model/组件测试覆盖路径摘要、本机原生 picker 成功/取消/失败与远程 host 选择分流。
- 只运行受影响测试文件，再执行全仓 `typecheck`、`lint` 和目标文件格式化。
- Gate 3 在真实调试客户端逐项验证：新对话与进行中位置稳定、目录选择、provider 锁定、模型/强度/mode、紧凑布局、队列、context/usage、离线与错误出口。

## 7. 风险与取舍

- 现有 agent controls 同时服务多平台和 draft/active 两条路径；本次以重组和统一样式为主，不复制选择逻辑，降低能力分叉风险。
- 浏览器无法直接选择远程主机文件系统，只有 Electron 本机 host 才能满足系统原生目录弹窗；其它平台必须显示 host-backed 目录选择，这是安全边界而非降级实现。
- provider 配置快照可能在运行中刷新。控件只消费现有稳定 snapshot，并保持输入和队列不因加载/错误被清空。
- Composer 是共享高频组件，视觉改动可能影响中区与右栏；以纯布局模型、固定尺寸和两种最小宽度验收控制回归。
