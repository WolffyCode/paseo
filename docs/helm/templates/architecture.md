<!-- 模板：复制到 docs/helm/requirements/<YYYY-MM-DD>-<topic>/architecture.md -->

# 架构 · <topic>

> 日期：<YYYY-MM-DD> · 状态：<草拟/评审中/已批> · 关联：[requirement.md](./requirement.md) · [ui.html](./ui.html)
> 写 **HOW 的边界**，不写逐行实现（实现交 Codex / helm-developer）。遵循 [standards.md](../../standards.md)。

## 1. 模块划分

新增 / 改动的模块，各自**单一职责**；放在哪个目录（path 即名）；为什么这样切。

## 2. 模型与 UI 分离

- 状态归属：哪些进 store / 纯函数 / selector（含新建的 store 与 action）。
- UI 只渲染什么、dispatch 什么。判据：逻辑不渲染即可测。

## 3. 数据流与接口契约

事件 → 状态 → 渲染；跨模块接口（命名的对象 shape，不要 inline）；纯函数签名（输入→输出，行为）。

## 4. 复用点 / 禁止重造

复用哪些现有组件 / store / 纯函数（列出）；**禁止重造清单**（已有的别再写一遍）。

## 5. 协议 / 平台

是否动协议（动则后向兼容 + 能力门 + `COMPAT()`）；平台门策略（`.web` / `.native` / `.electron` 还是运行时 `if`）。

## 6. 测试策略

哪些纯函数 / store 逻辑必须单测；端到端验证点（对应 requirement 验收标准）。

## 7. 风险与取舍

模块边界 / 性能 / 兼容 / 迁移风险，及取舍理由。
