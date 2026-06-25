# Helm 文档体系（docs/helm）

> 本目录是 Helm 产品的**唯一设计真相源**。两个 canonical 文档 —— `product.md`（产品文档）和 `ui.html`（UI 设计稿）—— 共同描述整个产品的入口、界面、功能、交互、流程。**任何 Helm 改动都以这两份为准。**

## 文件结构

```
docs/helm/
├─ README.md        本说明（文档体系 + 格式规范）
├─ workflow.md      研发工作流：角色/性格/3 个董事长闸（每个需求怎么走）
├─ standards.md     代码开发规范：实现层契约（模型/UI分离·不打补丁·契约注释·单测·WHAT-not-HOW）
├─ product.md       【canonical】产品文档：入口/界面/全功能/全流程；读完即懂全部
├─ ui.html          【canonical】UI 设计稿：每个功能的完整 UI + 全交互态（浏览器直接打开）
├─ templates/       requirement.md / architecture.md 模板
├─ requirements/    每个需求的「本地一套」
│   └─ <YYYY-MM-DD>-<topic>/
│       ├─ requirement.md    本地需求文档（只写 WHAT）
│       ├─ ui.html           本地 UI 设计稿（全态）
│       └─ architecture.md   本地架构文档（HOW 边界）
└─ reference/        旧设计稿归档（仅参考，非真相源）：HELM-v3-*
```

## 两个 canonical 是什么

- **`product.md`（产品视角）** — 描述：产品定位 → 全局 IA → 入口与导航 → 功能清单（每功能：作用 / 入口 / 流程 / 边界）→ 核心流程 → 全局状态与规则 → 术语表。**读完这一份，就知道 Helm 的全部功能与流程。**
- **`ui.html`（界面视角）** — 描述**每个功能的完整 UI**。每一屏都必须带「交互注解块」，逐项写清：布局、各交互态、右键菜单有几个按钮分别是什么、每个可点元素点击后的效果。

两份**强制同步**：同一个交互，`product.md` 用文字写、`ui.html` 用「视觉 + 注解」写，**不允许只更一边**。

## 每个需求的工作流（铁律）

> 完整研发流水线（角色 · 性格 · 3 个董事长闸 · Codex/内部 agent）见 [workflow.md](./workflow.md)；实现层代码规范见 [standards.md](./standards.md)。下面是**文档同步**铁律。

1. **读现状** — 先读 `product.md` + 打开 `ui.html`，确认当前设计/UI 现状，站在现状上做增量，不重复造。
2. **出本地一对** — 在 `requirements/<YYYY-MM-DD>-<topic>/` 下写 `requirement.md` + `ui.html`，描述这个需求要做什么、UI 全态长什么样。
3. **回写 canonical** — 把这个需求并入 `product.md` + `ui.html`，让两份 canonical 永远等于「最新现状」。
4. **多分支同步** — canonical 改动落主线（`develop` → `release`，见根 `CLAUDE.md` 分支规则），其它分支 rebase 继承；任何时刻所有分支看到的都是同一份最新 canonical。

## 格式规范

### `product.md` 功能条目模板

「功能清单」里每个功能按此模板写：

```
### <功能名>
- 作用：一句话说清解决什么
- 入口：从哪里进入（按钮 / 菜单 / 快捷键 / 导航）
- 流程：用户操作步骤 → 系统响应
- 边界：不做什么 / 依赖什么能力（能力门）
- UI：对应 ui.html 的哪一屏（#锚点）
```

### `ui.html` 每屏必带的「交互注解块」

每一屏除视觉外，必须有一块注解，覆盖以下**全部维度**（确实没有就写「无」）：

- **布局**：桌面态 + 紧凑 / 手机态
- **状态**：默认 / hover 悬浮 / active 活跃·选中 / 运行态 / 禁用 / 空 / 加载 / 错误 / 离线
- **右键菜单**：列出每一个菜单项（几个、分别叫什么）+ 每项点击后效果
- **点击效果**：每个可点元素点下去发生什么

可直接复制 `ui.html` 内的「屏模板」。

### `requirements/` 命名

`<YYYY-MM-DD>-<topic>`，例如 `2026-06-25-provider-cascade`。

## reference/

`HELM-v3-*` 是旧版设计稿（很完整，但与目标效果有偏差），仅作**参考备份**，**不是真相源**。新设计以 canonical 为准，可借鉴 reference 的好部分。
