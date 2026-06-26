# home-shell → develop 整合执行记录

> 日期：2026-06-26 · 分支：`integration`(基于 develop) · 执行：项目经理(PM) · 状态：代码绿 + 运行时验证通过,待董事长验收
> 董事长指令:以 develop 为基底,叠加 home-shell P1 UI,**冲突一律 develop 业务逻辑优先**,丢 home-shell onboarding 急切回退,融合 onboarding→主壳 s1。

## 1. 整合做法(扎根真实 git)

**关键洞察**:`merge-base(develop, home-shell) = c745aa4b`,develop 在其上**只多 1 个 docs commit**(0404147d 截图固化)→ **develop 的 `packages/app` 代码 === home-shell 的 base** → `git merge home-shell` **代码零冲突**。真正的活 = 外科式丢弃 onboarding 回退子集。

执行步骤(增量提交,均已 push):
1. `git merge home-shell`(78e30251)—— 代码零冲突,整体并入 home-shell(UI 成果 + onboarding 回退)。
2. **外科恢复 develop onboarding 簇**(5ad02843)—— 整文件 from develop(业务逻辑 develop 优先)。
3. **i18n 并集**(6d0b75b1)—— onboarding 段换回 develop + 保留 home-shell 新 UI keys。

## 2. 冲突逐条按 develop 优先解

| 文件 / 子系统 | home-shell 改了什么 | 处置(develop 优先) |
| --- | --- | --- |
| `app/_layout.tsx` | 删 `connectLocalOnBoot`/`useOnboardingStore`、`connectLocal`→`retry`、急切启动 daemon(无 welcome gate) | **整文件回 develop**(纯 onboarding 回退,无 UI 改动) |
| `app/index.tsx` | 删 `resolveStartupRoute` 的 `hasSeenWelcome` gate | **整文件回 develop**(恢复 welcome gate) |
| `runtime/host-runtime.ts` | 删 `connectLocalCandidate`/延后连接,改急切 | **整文件回 develop**(恢复延后连接 gate) |
| `app/host-runtime-bootstrap.ts(+test)` | 改 startup gate 契约 | **整文件回 develop** |
| `app/welcome.tsx` | 引 home-shell `welcome-screen` | **整文件回 develop**(引 develop onboarding 屏) |
| `screens/startup-splash-screen.tsx` | `connectLocal`→`retry` 契约 | **整文件回 develop** |
| `screens/onboarding/*`(5 屏)、`stores/onboarding-store(+test)`、`e2e/onboarding.spec`、`e2e/helpers/startup-dsl`、`maestro/flows/*` | home-shell **删除** | **从 develop 恢复** |
| `components/welcome-screen.tsx` | home-shell **新增**(急切 auto-connect 回退版) | **删除**(用 develop onboarding) |
| i18n 6 locale | 掏空 onboarding 段 + 新增 UI keys | **并集**:onboarding 段回 develop + 保留新 UI keys;`resources.test.ts` 回 develop |
| **保留 home-shell UI 成果(全部)** | `conversation-tree/*`、`components/sidebar/{host-switcher-pill,host-switcher-model,sidebar-window-chrome}`、`screens/workspace/{canvas-top-bar-*,right-panel-launcher,workspace-screen,workspace-desktop-tabs-row}`、`components/{left-sidebar,split-container}`、`composer/draft/workspace-tab`、`stores/{conversation-history-store,workspace-layout-*}`、`workspace-tabs/tab-surface` | **保 home-shell**(纯 UI,无 onboarding 耦合,已验) |

**融合(onboarding→主壳 s1)**:home-shell **原地重构** `workspace-screen.tsx`(同一路由 `h/[serverId]/workspace/[workspaceId]`,正是 develop onboarding 一直落的路由)→ develop 的 `resolveStartupRoute` 连接成功后落该路由 → 渲染 home-shell 三区壳 + 草稿空态 Composer。**融合自动成立**,无需额外接线。

## 3. 验证结果(代码绿 + 运行时真生效)

**静态(全绿)**:
- `app typecheck`:**0 错误**(先 `build:server` 补跨包声明后)。
- targeted 单测:**9 文件 158 测全过**(home-shell 新单测 conversation-tree/host-switcher-model/canvas-top-bar-chrome/conversation-history/workspace-right-panel/tab-surface/workspace-layout + 恢复的 onboarding-store/host-runtime-bootstrap)。
- i18n parity:**32/32 过**。
- lint(改动文件):**0 警告 0 错误**。

**运行时(dev:desktop 真跑,截图取证 → `verify-shots/`)**:
- app 启动、Metro bundle 成功、Electron 渲染、**浅色主题 Helm**(非破屏)。
- **host 已连接**(7070 daemon `srv_gSsF0qAIogtO`)。
- **左栏 = home-shell chrome**:host 切换器胶囊 + 新对话 + 搜索 + 设置(`01-connected-landing...png`)。
- onboarding→连接→**正确落地**(已连无工作区 → open-project 落点,develop 正确行为)。
- **⌘N 新对话 → 中区画布 Composer**:新建 workspace + Choose project + Composer 输入 + 选择模型 + **绿色(#20744A)发送按钮**(`02-new-conversation-canvas-composer.png`)。
- 启动期 `No route named h/[serverId]/workspace` 警告 = expo-router 深链重定向时子布局未挂的**瞬态噪音**(16:08:32 后停,app 正常渲染;develop 同有)——**非 home-shell 那种卡死破屏**。

**结论**:董事长担心的 home-shell「破屏 / No route / 落错路由」**已修复**——整合版 onboarding gate(develop)+ 三区主壳(home-shell)端到端真生效。

## 4. 待办 / 开放项

- 未脚本驱动进「右面板启动器」(无 cliclick + Electron a11y 不暴露);该组件为未改动的 home-shell 代码(`right-panel-launcher.tsx` + `workspace-right-panel.test.ts` 绿),home-shell 分支已 review(`requirements/2026-06-25-home-shell/review-shots/p4-*`)。董事长可在运行中的 dev:desktop 点右面板开关查看。
- 未跑全量测试套件(铁律:禁全量;已跑改动相关 targeted)。全量验证建议走 CI。
- dev:desktop 连的是**预先存在的 7070 daemon**(`desktopManaged:false`,疑似他人 worktree 起)——UI bundle 来自本 integration worktree(Metro 根在此),数据来自 7070;验证的是本整合的 UI/路由,有效。
- **未合 develop**:待董事长验收点头,由总监合并。

## 附:提交链(均已 push origin/integration)
`78e30251` merge home-shell → `5ad02843` 恢复 onboarding 簇 → `6d0b75b1` i18n 并集 → (本记录 + verify-shots)
</content>
