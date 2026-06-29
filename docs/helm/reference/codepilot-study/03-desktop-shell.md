# CodePilot 研究 · 03 桌面外壳 + Codex 式布局

> 对象：CodePilot（`/Users/wangbingkun/Desktop/coding/person/WolffyCode/CodePilot-main`，Electron 40 + Next 16 `output:'standalone'`）
> 服务：Helm（Paseo fork，Expo/React Native 一套码跑 iOS/Android/web/Electron，Unistyles + WebSocket RPC），项目① **home-shell**（Codex 式三区主壳，桌面 only）
> 范围：只读 CodePilot 提炼借鉴点，不改其任何文件。证据均带 `文件:行号`（CodePilot 相对其仓库根，Helm 相对 paseo-main 根）。
> 关联设计稿：`docs/helm/requirements/2026-06-25-home-shell/{requirement,architecture}.md`（在 `home-shell` 分支）。

---

## A. CodePilot 怎么做的

### A.1 Electron 外壳机制（standalone server 启动时序）

CodePilot 是「Electron 主进程内**起一个本地 Next standalone HTTP server**，窗口再 `loadURL('http://127.0.0.1:<port>')`」的形态。整条启动链：

1. **单实例锁 + whenReady**：`app.requestSingleInstanceLock()`（`electron/main.ts:1396`），`app.whenReady()` 里串行做：持久日志 → crash 面包屑 → 读用户 shell env → 解析系统代理 → **native 模块 ABI 校验** → 版本升级清缓存 → 设 Dock 图标（`electron/main.ts:1470-1517`）。
2. **固定端口起 server（为 localStorage origin 稳定）**：`STABLE_PORTS = [47823..47830]`（`electron/main.ts:731`）。`startServerOnStablePort()`（`:764`）按序**真的去 bind**每个候选端口（先 `isPortFree` 预检 `:706`，再 `utilityProcess.fork` 起 server，再 `waitForServer` 等健康），失败就换下一个；全失败才回落 OS 随机端口 `getDynamicPort()`（`:734`）。注释点明动机：renderer 的 `localStorage` 按 origin（scheme+host+**port**）键控，**每次随机端口 = 每次重启等于清空 localStorage**（主题/默认模型/上次 provider/工作目录记忆全丢，`:717-730`），并显式处理了两实例同时抢 47823 的 TOCTOU 竞态（`:751-759`）。
3. **utilityProcess 起 server（不占 Dock）**：`startServer(port)` 用 `utilityProcess.fork(serverPath, [], { serviceName:'codepilot-server', stdio:'pipe' })`（`electron/main.ts:885`），注释明说选 utilityProcess 就是为了「在 macOS 上**不另起一个 Dock 图标**」（`:883-884`）。env 注入：用户 shell env + 系统代理 + `PORT`/`HOSTNAME=127.0.0.1`/`CLAUDE_GUI_DATA_DIR`/扩展 PATH（`:868-881`）。
4. **splash 健康检查**：窗口先 `loadURL(url || LOADING_HTML)`（`electron/main.ts:1080`）。`LOADING_HTML` 是一个 inline `data:text/html` 的转圈 splash（`:943-973`，含 `-webkit-app-region: drag` 让 splash 可拖窗）。`waitForServer(port)`（`:811`）轮询 `http://127.0.0.1:<port>/api/health`（`:830`，`family:4` 强制 IPv4 绕开 Windows IPv6 坑），200 才算起来，30s 超时把 server stderr 拼进报错。server ready 后才把窗口导到真实页面。
5. **native 模块 ABI rebuild + 自检**：打包阶段 `scripts/after-pack.js` 用 `npx electron-rebuild -f -o better-sqlite3`（`:38`）把 better-sqlite3 重编译为 Electron ABI，再 `walkAndReplace` 把 `.node` 拷进 standalone 资源各处（`:88-107`）；运行时 `checkNativeModuleABI()`（`electron/main.ts:521`）启动前 `process.dlopen` 试加载，ABI 不匹配（`NODE_MODULE_VERSION`）就弹清晰错误框并退出（`:554-563`），而不是给个 cryptic 的 MODULE_NOT_FOUND。
6. **原生质感 titlebar + vibrancy（macOS）**：`createWindow()`（`electron/main.ts:975`）在 darwin 下 `titleBarStyle:'hiddenInset'` + `trafficLightPosition:{x:20,y:21}`（手动对齐交通灯到顶栏项中线，`:990-998`）；`vibrancy:'menu'`（对齐 Codex.app 实测材质，`:1017-1030`）+ `transparent:true` + **`backgroundColor:'#00ffffff'`**——注释专门标注这是 Electron issue #20357 的 workaround：rgb=0 alpha=0 会被 macOS 当成不透明白，必须用白底 alpha=0（`:1032-1038`）。**关键坑**：`loadURL` 会把合成器背景重置为不透明，所以在 `loadURL` 之后**再调一次** `setBackgroundColor('#00ffffff')` + `setVibrancy(...)`（`:1089-1100`）；dev 下 DevTools 必须 `mode:'undocked'`，docked DevTools 会强制不透明白底（`:1103-1108`）。Windows 走 `titleBarStyle:'hidden'` + `titleBarOverlay`（`:1052-1058`）。
7. **菜单栏常驻**：窗口 `close` 默认 `event.preventDefault()` + `hide()`，只有 `isQuitting` 才真退（`electron/main.ts:1211-1215`）；窗口 hidden 时把通知轮询交给主进程（`:1221`）。

**配套构建/打包**：
- `next.config.ts`：`output:'standalone'`（`:6`）；`cacheHandler` 指向 `cache-handler.js` + `cacheMaxMemorySize:0`（`:14-15`）——因为打包后 server cwd 在只读安装目录，Next 默认 FileSystemCache 会 `mkdir .next/cache` 报 EPERM，所以换成纯内存增量缓存（`cache-handler.js:1-81`，FIFO 上限 1000）；`serverExternalPackages` 把 better-sqlite3 等 native/动态 require 留在 node_modules 不打包（`:56`）。
- `scripts/build-electron.mjs`：esbuild 打 main/preload（`:44-54`），并把 standalone 里的符号链接换成实拷贝好让 electron-builder 能打包（`resolveStandaloneSymlinks` `:5-24`）；每次构建前清 `dist-electron/`（`:29`，注释说 v0.34 升级崩溃就是 stale artifact 进了 app.asar）。
- `electron-builder.yml`：`extraResources` 把 `.next/standalone/` 整个塞进 `resources/standalone/`（`:20-46`）；`asarUnpack: **/*.node`（`:49-51`）；`afterPack`/`afterSign` 两 hook（`:47-48`）。

### A.2 三栏布局的组件结构

CodePilot 的 UI 是「**一条横跨整窗的共享顶栏** + 其下一排浮动卡片」的 macOS Tahoe 风格（注意：是**共享单顶栏**，不是三区各自 chrome——见 C.6）。

**外壳骨架**（`src/components/layout/AppShell.tsx`）：
- 最外层 `flex flex-col h-screen`：`<UnifiedTopBar/>`（**单条共享顶栏**，sibling 在内容行之上，`:705-707`）→ `<UpdateBanner/>` → `flex flex-1` 内容行（`:708`）。Round 20 注释明说：把顶栏提成 sibling 是为了让四张卡（左栏/主区/workspace/file-tree）在同一条顶栏下**对齐同一 y 起点**（`:694-704`）。
- 内容行里：左栏 `CardFrame kind="sidebar" width={chatListWidth}` + `ResizeGutter`（`:728-757`）→ `<ChatContentRow>`（主区卡 + workspace 卡 + PanelZone，`:758`）。

**浮动卡原语**（`src/components/layout/card-primitives.tsx`，Phase 7c）——**三个单一职责组件，刻意把 shadow / clip / gutter 拆开免得跨面板漂移**（`:3-25`）：
- `CardFrame`（`:78`）：只管 shadow + radius + 布局槽，**不 clip**（overflow 可见好让 box-shadow 画出圆角轮廓）；`kind="main"` 用 `flex-1` 撑满、其余给定 `width`。
- `CardSurface`（`:126`）：画 bg + `clip-path: inset(0 round 14px)` + backdrop-filter，**不画外阴影**；darwin 下才有圆角，off-mac radius=0、clip 为 no-op，同一份 DOM 在 web/win/linux 退化成普通块（`:115-125`）。
- `ResizeGutter`（`:182`，`RESIZE_GUTTER_WIDTH_PX=8` `:180`）：8px 宽行级手柄，**只能放在两张 CardFrame 之间、绝不进 CardFrame 内**；2px 可见线居中在 8px 命中区里（几何契约有真实 DOM e2e 守：gutter 宽==8、线 centerX==gutter centerX，`:168-172`）；hover 画**跟随光标的渐变高亮**（`color-mix(oklch)` `:230-255`）；双击 `onReset` 复位默认宽。**宽度状态留在消费方**（panel 自己持有），原语只收 `width` prop + `onResize/onResizeEnd/onReset` 回调（`:22-24`）。
- 拖拽实现（`ResizeGutter` `:189-228` / 旧 `ResizeHandle.tsx:35-78`）：`onPointerDown` 里 `setPointerCapture` + `document.body.style.cursor='col-resize'` + `userSelect='none'`；`onPointerMove` 算 `delta=clientX-startX` 回调；`onPointerUp` 释放并 `onResizeEnd`。**约束 clamp 在消费方 handler 里**（`AppShell.tsx:325-327` `CHATLIST_MIN=180/MAX=300`）。宽度持久化：localStorage `codepilot_chatlist_width`（`AppShell.tsx:319-333`）。

**顶栏**（`src/components/layout/UnifiedTopBar.tsx`）：
- `WebkitAppRegion:'drag'` 整条可拖窗（`:229`），每个交互控件单独标 `'no-drag'`（`:242`、`:330`）。
- 交通灯让位用 CSS 变量 token：`--platform-traffic-light-safe-area`（水平躲交通灯）+ `--platform-traffic-light-offset-y`（垂直对齐交通灯中线），off-mac 都为 0（`:153-157`）。
- 左：侧栏开关 → 对话标题 → 工作区名 → 每会话 `···` 菜单；右：分支标签 / file-tree 开关 / workspace-sidebar 开关（`:221-426`）。注释里 Round 33 还记录了「既然顶上有 tab 条了，返回可以放上面」的迭代（`:174-190`）。

**NavRail**（`src/components/layout/NavRail.tsx`）：56px（`w-14`）竖图标 rail（Chats/Plugins/Gallery + 底部 Settings，`:32-36`、`:51`）——**但已废弃**：`AppShell.tsx:7` 注释「NavRail removed — navigation merged into ChatListPanel」，导航并进了 ChatListPanel。

**右栏 tab 系统**（`src/components/layout/WorkspaceSidebar/` + `src/lib/workspace-sidebar.ts`）——**纯状态模型 reducer，无 React、可单测**（`workspace-sidebar.ts:1-14`）：
- 永远两个 `FIXED_TABS`（`git`/`widget`，不可关，`:96-99`）+ 0..N 个动态 tab（markdown/artifact/file/files-pinned），动态 tab 按 `dynamicTabId(kind,key)='kind:key'` 去重（`:126`）。
- `openDynamicTab`（`:148`）：同 id 已存在 → **原地替换元数据并激活**（避免重开后丢 trust/标题，`:152-157`）；否则**追加到末尾并激活**。
- `closeTab`（`:171`）：fixed 不可关（no-op）；关掉后**激活左邻**（`nextTabs[idx-1]` 退而 `git`，`:183`）。
- 持久化：`storageKey` 按 `workspace::session` 分桶（`:213`），`serialize` 只存动态 tab（`:232-239`），`parse` 时 **fixed tab 总是从 FIXED_TABS 重新物化**、对坏数据返回 `initialState()`（`:245-267`）。
- `TabBar.tsx`：`role="tablist"` + ArrowLeft/Right/Home/End 键盘循环（`:82-104`）；**关闭折进前导图标**——hover 时文件图标淡出、X 淡入，点图标即关，省掉独立 X 按钮约 16px/tab（`:279-297`）；动态 tab `flex-1 min-w-[40px] max-w-[160px]` 浏览器式收缩、fixed tab `shrink-0`（`:237-239`）；**折叠/收起按钮 `shrink-0` 钉在水平 scroller 之外**，注释记录这是修过的真 bug：以前折叠键在 `overflow-x-auto` 里、tab 一多就被挤出右缘点不到（`:106-177`）。**注意：CodePilot 的 tab 不支持拖拽调序**（TabBar 无任何 drag 处理）。

**分屏**（`AppShell.tsx:391-513` + `SplitColumn.tsx`）：AppShell 持有 `splitSessions`（最多 2，localStorage 持久 + URL `router.replace` 同步）；`SplitColumn` 是带「活跃高亮边框」的 ChatView（`SplitColumn.tsx:156-163`）。

**终端**（`electron/terminal-manager.ts`）：用 `child_process.spawn` + `stdio:'pipe'`，**不是真 PTY**——`resize()` 是 no-op、vim/htop 渲染不对（自标 KNOWN LIMITATION `:15-24`、`:92`）。

---

## B. 值得抄的设计 + 坑

**值得抄（设计/交互层）**
1. **浮动卡原语三拆分（shadow / clip / gutter 各一组件，职责不串）**——`card-primitives.tsx` 的纪律：阴影画在不 clip 的 frame、圆角裁剪在 surface、拖拽线只在两 frame 之间的 gutter，且**宽度状态留消费方、原语只收 width+回调**。这套「布局原语只管几何、状态归宿在面板」的边界非常干净。
2. **ResizeGutter 的拖拽 UX**：命中区(8px)比可见线(2px)宽一倍、跟随光标的渐变高亮、双击复位、拖拽时 body 锁 `cursor/userSelect`、约束 clamp 在 handler、松手才持久化——并配了**几何 e2e 断言**（宽==8、线居中）。
3. **tab reducer 的几个具体行为**：去重 by `kind:key`、重开**原地替换**、关 tab **激活左邻**、fixed tab **不持久化而是加载时重物化**、坏数据 fallback 到 initialState。这些是「tab 系统」该有的默认语义清单。
4. **折叠/放大等"壳级控件"钉在 tab scroller 之外**（别和会溢出的 tab 共用一个滚动容器）——CodePilot 踩过坑修过。
5. **窗口拖拽纪律**：顶栏整体 `app-region:drag`、每个交互控件单独 `no-drag`；交通灯让位用 CSS token（safe-area + offset-y）而非硬编码。
6. **原生质感的两段式 vibrancy**：构造选项 + `loadURL` 后再 `setVibrancy/setBackgroundColor`，`backgroundColor` 用 `#00ffffff` 不是 `#00000000`（issue #20357），dev DevTools 必须 undocked。这些是 macOS 半透明卡真正能浮出来的硬条件。
7. **ABI 不匹配给清晰错误**：`process.dlopen` 自检 + 明确弹框，而不是让用户撞 cryptic crash。

**坑（CodePilot 自己标注或暴露的）**
- **固定端口是为了绕开「localStorage 跟 origin 走」**——这是 Electron+本地 HTTP server 形态**自找的问题**（A.2 STABLE_PORTS + TOCTOU 重试 + 随机端口回落一大坨代码）。
- **只读安装目录 + Next FileSystemCache = EPERM**，被迫上纯内存 cacheHandler。
- **终端不是真 PTY**（spawn+pipe），resize no-op、全屏程序不工作——CodePilot 的明显短板。
- 单实例、菜单栏常驻、版本升级清缓存、Windows IPv4 健康检查——都是「本地 server 形态」要额外伺候的运维琐事。

---

## C. 映射到 Helm（关键）

> 先说**形态差异**：CodePilot 打包后 = 主进程内 `utilityProcess.fork` 起**本地 Next standalone HTTP server**（固定端口）+ 窗口 `loadURL('http://127.0.0.1:<port>')`。
> Helm 打包后 = 静态 Expo web bundle 经**自定义特权协议 `helm://app/`** 直供（`packages/desktop/src/main.ts:75` `APP_SCHEME="helm"`、`:310-313` `registerSchemesAsPrivileged({standard,secure,supportFetchAPI})`、`:532` `loadURL('helm://app/')`、`:655` `protocol.handle`），renderer 通过 **WebSocket / 本地 transport（directPipe/socket）经 daemon-manager 连 daemon**（`:24-26` `daemon-manager`/`local-transport`），dev 下 `loadURL('http://localhost:8081')` 连 Expo（`:74`/`:528`）。
> **结论先行**：A.2 的三栏**布局/组件组合/交互模式** Helm 能照搬思路（即便是 RN）；A.1 的 **standalone-server 那一整套**几乎都不适用——Helm 的等价机制是「**自定义协议供静态包 + daemon over WebSocket**」，且 Helm 在多处**已经比 CodePilot 更优**。

### C.1 能直接借鉴的（布局/组件组合/交互模式层）

| CodePilot 做法 | 映射到 home-shell | Helm 现状 / 怎么借 |
| --- | --- | --- |
| ResizeGutter 拖拽 UX（宽命中区/窄可见线/渐变高亮/双击复位/拖拽锁 cursor/clamp 在 handler/松手持久化 + 几何 e2e） | **s12 侧栏拖拽效果态**（反馈 D/E：手柄高亮 accent 绿 + 宽度气泡 + min/max 阻力 + 每工作区记忆） | 借**交互规格与几何契约**，不借代码。Helm 右栏宽已 per-workspace（`workspace-layout-store.splitSizesByWorkspace` + `resizeSplit`），左栏宽 architecture R1 已决迁 per-workspace。RN 适配：拖拽用 gesture-handler 而非 DOM pointer，高频宽度走 `inlineUnistylesStyle`（见 D）。 |
| 浮动卡三拆分 + 「布局原语只管几何、宽度状态归面板」 | 三区独立 chrome（左栏/canvas/右栏各自边界） | 借**职责切分纪律**。Helm 已有 `split-container` + `workspace-layout-store`（纯数据 SplitNode/Pane，architecture §1 处置=复用）；别重造一套，但可用 CodePilot 的「frame 管阴影/surface 管裁剪/gutter 管拖拽 + 状态留消费方」做组件边界自检。 |
| tab reducer 行为清单（去重 kind:key / 重开原地替换 / 关 tab 激活左邻 / fixed 不持久化重物化 / 坏数据 fallback） | **s4 右面板 tab**（反馈 C：悬浮✕、新选项卡+、全部可关、关完回启动器） | 借**默认语义**。Helm 已有 `workspace-tabs-store` + `workspace-layout-actions`（纯函数 + 单测，architecture §1#8/#9 处置=复用）；CodePilot 的「启动器默认态」对应 Helm `selectRightPanelMode(layout)`（空 tabIds→launcher），「全部可关」对应 `canCloseRightPanelTab` 恒 true（R6 已决）。 |
| 折叠/放大控件钉在 tab scroller 之外 | 右栏 tab 头的 ⤢ 放大 / ▯ 收起 | 直接采纳这条防溢出经验：⤢/▯ 不要和会横向溢出的 tab 列共用滚动容器。 |
| 窗口拖拽纪律（drag 顶栏 / no-drag 控件 / 交通灯 CSS token） | **左栏窗口 chrome 细条**（交通灯 + 侧栏开关 + ‹›，反馈 1/B） | Helm 已有 `components/desktop/titlebar-drag-region.tsx` + `useWindowControlsPadding`（architecture §1#23 复用）。借**纪律**：每个交互控件标 no-drag、控件中线对齐交通灯。 |
| tab「hover 图标变 X」省宽 + WAI-ARIA tablist 键盘 | 右栏 tab 悬浮✕ | 借交互形态；但**别照抄 CSS group-hover 标记**（RN 不通，见 D）。键盘 tablist 模式可借。 |
| ABI 不匹配弹清晰错误（`dlopen` 自检） | （低优先）node-pty 加载自检 | Helm 打包带 node-pty 真 PTY（`packages/desktop/scripts/after-pack.js:52` 按平台保留 prebuild），若想要可借「加载失败给清晰错误」的思路。 |

### C.2 Electron-standalone-Next 特有、Helm（Expo/RN）用不上（附 Helm 等价机制）

| CodePilot 机制 | 为何 Helm 用不上 | Helm 的等价机制 |
| --- | --- | --- |
| `utilityProcess.fork(server.js)` 起本地 Next HTTP server + `loadURL(http://127.0.0.1)` + `/api/health` splash 轮询（`main.ts:764/811/885`） | Helm 没有本地 HTTP server | **自定义特权协议 `helm://app/` 直供静态 Expo 包**（`packages/desktop/src/main.ts:310-313/532/655`）；后端是**独立 daemon，renderer 经 WebSocket/local-transport 连**（`daemon-manager`/`local-transport`）。"等后端 ready 的过场"= onboarding「连接中过场」+ host-runtime 连接态，不是 HTTP 健康轮询。 |
| **STABLE_PORTS 固定端口（为 localStorage origin 稳定）**（`main.ts:717-731`）+ TOCTOU 重试 + 随机端口回落 | 这是「端口即 origin」形态自找的问题 | **`helm://app` 是天生稳定 origin**——localStorage 跨重启天然不丢，**完全不需要**端口编排那一坨。**别移植 STABLE_PORTS**。 |
| better-sqlite3 ABI rebuild（`after-pack.js:38`）+ `checkNativeModuleABI`（`main.ts:521`）+ `serverExternalPackages` | Helm **无 SQLite**——`docs/data-model.md` 明示**文件型 JSON 持久化（Zod 校验）** | Helm 的 native 模块是 **node-pty（真 PTY）+ ripgrep**，after-pack 是**按平台裁剪 prebuild**（`packages/desktop/scripts/after-pack.js:52-93`）而非 rebuild。所以「ABI rebuild」整套不适用。 |
| 纯内存 `cacheHandler` + `cacheMaxMemorySize:0`（只读安装目录 EPERM，`cache-handler.js`/`next.config.ts:14-15`） | 无 Next server、无 `.next/cache` 写盘 | 不存在该问题。 |
| `resolveStandaloneSymlinks` / `extraResources standalone/` / `asarUnpack **/*.node`（build-electron.mjs / electron-builder.yml） | 无 standalone 产物 | Helm 打的是 Expo 静态 web bundle + node-pty/ripgrep 二进制，打包逻辑在 `packages/desktop/scripts/after-pack.js`。 |
| 登录 shell 取 env（`loadUserShellEnv` `main.ts:577`）+ 系统代理探测（`resolveSystemProxy` `:612`，给中国 Clash/Surge 用户）+ 扩展 PATH | 这是「主进程要 spawn server/CLI 带全量 env」的需求 | Helm 已有 `packages/desktop/src/login-shell-env.ts`（同思路）。**系统代理经 Chromium `resolveProxy` 注入子进程**这招若 Helm daemon spawn 没有，可借（属 daemon 启动 env，非主壳布局）。 |

### C.3 可选/未来（macOS 原生质感）

CodePilot 的 vibrancy 套路（`transparent:true` + `backgroundColor:'#00ffffff'`（issue #20357）+ `loadURL` 后**再** `setVibrancy` + DevTools undocked + 交通灯 `trafficLightPosition`，`main.ts:989-1108`）是**可迁移到 Helm 桌面壳 `packages/desktop/src/main.ts`** 的真实 Electron 知识。但 home-shell 本轮是**浅色主题、无悬浮 rail/侧条**，并不追求 Tahoe 半透明卡，所以这条**仅作「将来若要原生质感时的现成踩坑笔记」**，本轮不接。交通灯让位 Helm 已用 `useWindowControlsPadding`（architecture §1#23）。

### C.4 逐项对照设计稿（home-shell 三区 vs CodePilot 三栏）

- **左栏窗口 chrome 细条（交通灯+侧栏开关+‹›+收起态✎）**：借 CodePilot 的「drag/no-drag 纪律 + 交通灯 CSS token 对齐」。CodePilot 没有「左栏顶自带窗口细条」（它是**全窗共享单顶栏**），所以**结构上别学 CodePilot**——Helm architecture §2.1 新建 `<SidebarWindowChrome>` 复用 `titlebar-drag-region` + `useWindowControlsPadding` 才对。
- **canvas 自带顶栏**：CodePilot 是**反例**（见 C.6）。Helm architecture §2.2 的「顶栏仍作 MAIN pane header（`renderSplitPaneHeader`）、只占 MAIN 宽不横跨右栏」是对的物理保证，别照 CodePilot 提成全窗 sibling。
- **右侧栏 tab + 启动器默认 + 全部可关 + 拖拽调序 + 左缘拖宽 + 放大**：tab reducer 语义、折叠键防溢出、hover✕ 借 CodePilot；但 **CodePilot tab 不支持拖拽调序**——Helm 反而**已有** `reorderTabsInPane`（architecture §1#8 复用），这块 Helm 超前于 CodePilot，别去 CodePilot 找参考。放大占满中区 = Helm `setRightToolPanelMaximized`（已有）。
- **左右栏拖拽改宽 + 效果态（s12）**：借 ResizeGutter 的 UX 规格 + 几何契约；实现走 Helm 既有 `resizeSplit` + per-workspace + RN 手势（见 D）。
- **环境信息 popover / 打开位置下拉 / 主机切换器同宽下拉 / ⌘K**：CodePilot 用 Radix `DropdownMenu`/`Tooltip`（DOM portal）——**整套不适用 RN**。Helm 必须走 `docs/floating-panels.md` 范式（combobox/dropdown-menu/context-menu/autocomplete-popover + `FloatingPanelPortalHost`），architecture §4 已逐个映射好。**别让开发照搬 CodePilot 的 Radix 用法**。
- **对话树（s6）/ 主机切换器（s7）**：CodePilot **没有**对话树（它左栏是会话列表）、也**没有多主机**（单机本地 server，故无主机切换器）——这两块 CodePilot **无参考价值**，Helm 走自己的 `conversation-tree/*`（新建）+ `host-runtime`（复用）。
- **Composer 彩色 token（s10/反馈 K）**：CodePilot 无此特性，无参考。
- **终端**：CodePilot 是 spawn+pipe 假 PTY（短板）；Helm 已有真 PTY（node-pty）+ `panels/terminal-panel`。**别学 CodePilot 终端**。

### C.5 一句话

CodePilot 在 home-shell 上**真正值钱的是三样交互规格**：① ResizeGutter 拖拽手感 + 几何契约（→ s12）；② tab reducer 默认语义清单（→ s4，但 Helm 已有更全的 store）；③ 窗口拖拽 drag/no-drag 纪律（→ 左栏窗口细条）。其余（standalone server / 固定端口 / SQLite ABI / vibrancy）要么不适用、要么 Helm 已用更优机制（自定义协议 / 文件型 JSON / 真 PTY）解决。

### C.6 反模式提醒（CodePilot 是反面教材的地方）

- **共享单顶栏 ≠ 三区独立 chrome**：CodePilot Round 20 刻意把顶栏做成**横跨整窗的共享 sibling**（`AppShell.tsx:694-707`），好让四张卡对齐同一 y。**home-shell 反馈 B 要的恰恰相反**——三个独立整体、**无一条横跨整窗的标题栏**。所以 CodePilot 的 `UnifiedTopBar` 结构是**要避开的形态**；Helm architecture §2.2 已正确地把 canvas 顶栏留在 MAIN pane 内。

---

## D. 不适用 / 风险（RN 上会崩的 web/DOM 假设）

> home-shell 本轮**桌面 only**（web/Electron），但 Helm 是「一套码」，RN 假设照样会在 native 路径或 Unistyles 上咬人。逐条标。

1. **原始 DOM 拖拽 API 会崩 native**：`ResizeHandle`/`ResizeGutter` 用 `setPointerCapture`、`document.body.style.cursor/userSelect`、`getBoundingClientRect`、`onPointerDown/Move/Up/Leave`（`ResizeHandle.tsx:41-78`、`card-primitives.tsx:189-228`）——**全部 native 崩或 no-op**。Helm 必须 `isWeb` 守卫，或用 `react-native-gesture-handler` 的 Pan + RN `measure`。CLAUDE.md/architecture §7 已禁 `onPointerEnter/Leave`（native iOS 不触发）。
2. **高频像素宽喂进 Unistyles style = web CSS 注册表泄漏**：CodePilot 直接把变化的 `{width}`/`{top,left}` 塞进 inline style（对它无害）。Helm 若把拖拽宽 / popover 定位塞进 **Unistyles 管理组件**的 `style`，每个不同值都会往 `#unistyles-web` 追加一条永不回收的 CSS 规则（`docs/unistyles.md`「Dynamic Pixel Styles On Web」）。**必须用 `inlineUnistylesStyle` 标记**这些高频几何值（s12 拖拽宽 + 环境信息 popover / 主机下拉 / 打开位置下拉的定位）。architecture §4 已点名走 `inlineUnistylesStyle`。这是把 ResizeGutter 搬到 Helm 的**头号陷阱**。
3. **hover 显隐（tab✕ / 树节点 kebab）不能照搬 CSS group-hover**：CodePilot 用 Tailwind `group/group-hover:opacity`（`TabBar.tsx:286-291`）。Helm 的 hover **只在 web 生效**，且在 `Pressable` 上挂 hover、内部又嵌 `Pressable` 会触发 `docs/hover.md` 失败模式 1（hover 状态机互抢、闪烁循环）。必须用 canonical 形态：**外层 plain `View` + `onPointerEnter/Leave`，press 放分离的内层 `Pressable`**，可见性 `isHovered || isNative || isCompact`。**抄行为别抄 markup**。
4. **锚定浮层不能用 Radix/DOM portal**：CodePilot 的 `DropdownMenu`/`Tooltip` 是 web DOM 组件。Helm 必须用 `docs/floating-panels.md` 的 4 个 canonical 文件 + `FloatingPanelPortalHost` + `measureInWindow`，并处理「两次测量闪烁」（anchor 未定先返回 null、contentSize 未定先 opacity:0）与 host-relative 定位。**主机下拉同宽（反馈 I）** 需测 anchor 宽再约束——CodePilot 的 content-width Radix 菜单给不了这个，机制完全不同。
5. **`onPointerLeave` 等 pointer 事件**：`ResizeHandle.tsx:76`/`card-primitives.tsx:226` 用了 `onPointerLeave`。桌面 web 可用，但 native 不触发；home-shell 桌面 only 可容忍，但**仍需 `isWeb` 包，且不能让任何 native 路径依赖它**。
6. **`-webkit-app-region` / `LOADING_HTML` splash**：纯 web/Electron CSS（`main.ts:943-973`、`UnifiedTopBar.tsx:229`），RN 无 app-region 概念——只属桌面壳，不进 RN UI 层。Helm 桌面壳 drag region 用 `titlebar-drag-region.tsx`。
7. **`Animated.View` + Unistyles 动态样式会崩**：若 home-shell 用 Reanimated 做拖拽/放大动画，**别**给 `Animated.View` 套 `StyleSheet.create((theme)=>...)`（`docs/unistyles.md`「Reanimated `Animated.View`」——主题切换时 Unistyles 与 Reanimated 抢同一 native 节点 → `Unable to find node on an unmounted component` 崩溃，曾是真实 iOS 侧栏崩溃）。静态定位留 RN `StyleSheet`，主题色走 inline。

---

## 附：关键文件索引

**CodePilot**（证据源）：`electron/main.ts`（启动/端口/server/窗口/vibrancy/ABI）、`electron/terminal-manager.ts`、`electron/preload.ts`、`electron/updater.ts`（已禁用）、`next.config.ts`、`cache-handler.js`、`scripts/build-electron.mjs`、`scripts/after-pack.js`、`electron-builder.yml`、`src/components/layout/{AppShell,UnifiedTopBar,NavRail,card-primitives,ResizeHandle,SplitColumn}.tsx`、`src/components/layout/WorkspaceSidebar/{index,TabBar}.tsx`、`src/lib/workspace-sidebar.ts`、`docs/guardrails/ElectronMain.md`。

**Helm**（映射目标）：`packages/desktop/src/main.ts`（`helm://` 协议 + daemon-manager）、`packages/desktop/scripts/after-pack.js`（node-pty/ripgrep 裁剪）、`packages/desktop/src/login-shell-env.ts`、`docs/data-model.md`（文件型 JSON）、`docs/floating-panels.md` / `docs/hover.md` / `docs/unistyles.md`（RN 适配硬约束）、`docs/helm/requirements/2026-06-25-home-shell/{requirement,architecture}.md`（`home-shell` 分支，三区主壳设计 + 80% 复用清单）。
