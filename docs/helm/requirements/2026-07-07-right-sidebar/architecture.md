# 架构 · 右侧侧边栏（工作面板 · 多页签）· 文件先行 · 文件页签 VSCode 对等

> 日期：2026-07-07 · 状态：评审中（专家评审团 → 董事长闸 2）· 关联：[requirement.md](./requirement.md)（v7 · 已过闸 1）· [ui.html](./ui.html)（v7 · 9 屏）
> 写 **HOW 的边界**，不写逐行实现（实现交 helm-developer）。遵循 [standards.md](../../standards.md) + [coding-standards.md](../../../coding-standards.md)。
> 本文接进的既有底座（已 Read 核对，非臆造）：`shell/model/shell-model.ts`（MobX 类 + `selectors/regions.ts` 纯函数）、`shell/file-tree/*`（范本 + 复用对象，尤其 `model/right-tab-bridge*.ts` 已埋的通向右面板的桥、`model/file-tree-public.ts` 公共能力、`model/file-tree-store.ts` 的类+纯函数风格）、`shell/theme/theme-model.ts`、`shell/components/{region-frame,region-placeholder,shell-root,file-tree-region}.tsx`、`terminal/runtime/*`（包裹 xterm 的边界参照）、`@getpaseo/highlight`（`resolveSyntaxColors("one")`）、`client.readFile`、协议 `fs.*`。

---

## 0. 立场先行：本架构如何调和「OOP 领域模型」与「模型/UI 分离」

董事长第 2 条原则要求「用 OOP 组织领域模型」，而 standards §1 要求「模型/UI 分离」，仓库 coding-standards 又写「functional over object-oriented」。**这三者在本仓库里不是矛盾，因为新 Helm `shell/` 已经把它们收敛成一条既定约定，本架构照抄不发明：**

- **既定事实**：`shell/model/shell-model.ts` 的 `ShellModel`、`shell/file-tree/model/file-tree-store.ts` 的 `FileTreeStore`、`shell/theme/theme-model.ts` 的 `ThemeModel` **都是 `makeAutoObservable` 的 MobX 类**。`FileTreeStore` 文件头原话：「class + MobX, **mirroring ShellModel's style**. It owns state + transitions only; every derivation is delegated to the Phase-1 pure functions」。
- **这条约定同时满足三方**：一个 MobX 类 = **OOP 领域对象**（把自己的状态与行为封装在一处，高内聚，`observer` 不参与即可单测）= standards §1 的**模型层**（状态/派生/转移的真相源）。`observer` 包裹的组件 = **模型的纯渲染 + 向对象派发意图（调方法）**。coding-standards 的「functional over OOP」是**仓库默认**，Helm shell 层**已刻意特化**为「MobX 类做模型 + 纯函数做派生」——因为 observer 组件在数学意义上仍是「UI = f(model)」的纯函数。
- **纯函数不是「把逻辑摊在自由函数里」的反面教材，而是 OOP 对象所委托的派生/策略层**：`selectors/regions.ts`、`tree-reducer.ts`、`resolve-root.ts`、`search-state.ts` 都是**被类调用**的纯派生，standards §1 明文要求「状态/派生/转移进 store·**纯函数**·selector」。董事长第 2 条禁止的是「把**领域状态+行为**摊成自由函数」——那部分归类；派生/策略仍是纯函数，且**必须**是纯函数（否则不渲染即测的回报就没了）。

**本架构的明确立场**：右侧侧边栏的领域模型 = 一组 **MobX 类**（`WorkbenchModel`、`FileDocumentModel` …），**与既有 shell/file-tree 同构、并存演进**（不是包裹、不是另起炉灶）；每个类**只持状态+转移**，把每一处派生委托给**同目录的纯函数模块**；UI 全是 `observer` 纯渲染 + 派发。**不引入 Zustand**——Zustand 是**旧** `workspace-layout-store` 的风格，是新 shell 的**长期退役方向**（≠ 本轮处置：旧 store 本轮**一行不删**、仍服务旧 workspace 路由，见 §4.1 迁移/删旧清单），本轮**新框架不采用它**。真正的 `class`（非 MobX 模型）只出现在**包裹成熟编辑器**的适配层（§1.C），那是 UI 侧适配器、不是领域对象。

---

## 1. 模块划分

新增落点：**`packages/app/src/shell/right-panel/`**（目录即模块，路径即名——coding-standards《Structure and modules》）。内部按 file-tree 的成熟切法分 `model/`（领域类 + 纯函数）、`file-tab/`（第一个页签类型，自带 `model/ data/ components/`）、`components/`（框架 UI）。壳层挂载点 `shell/components/right-panel-region.tsx`（对位 `file-tree-region.tsx`）。为什么这么切：**tab 框架**与**文件页签**是两个正交职责——框架管「多页签骨架」、与内容类型无关；文件页签是「第一个实现内容契约的类型」。二者同目录但分子模块，边界即 §1.A 定义的 `TabContent` 契约。

### A. Tab 框架（多页签骨架 · 与内容类型解耦的可复用基础设施）

落点 `right-panel/model/` + `right-panel/components/`。**单一职责**：管理页签集合、顺序、聚焦、启动器↔页签态切换、放大——**完全不知道任何页签类型内部长什么样**。这是「五类页签挂靠的稳定外壳」，考的就是高内聚低耦合。

- **`WorkbenchModel`（MobX 类 · 领域对象）**——框架的唯一真相源。持有：
  - `tabs: PanelTab[]` + `focusedTabId`。**`PanelTab` 只存身份**：`{ id, kind, target, content }`（`content` = 该 tab 的 `TabContent` 引用）。**`title`/`activityDot` 不进存储态**——tab 头渲染时从 `tab.content` **live 读**（`TabContent` 的只读成员即唯一来源，杜绝双持真相源，M5）。放大态**不代理**：UI 直接读 `ShellModel.rightMaximized`（页签模型不耦合 shell 几何，M8）。
  - 意图方法（UI 派发的）：`openTab(request)` / `focusTab(id)` / `closeTab(id)` / `closeOthers(id)` / `closeAll()` / `reorderTab(id, dropIndex)` / `openLauncherType(kind)`。
  - **注入依赖**：`WorkbenchModel` 持一个注入的**内容工厂端口** `TabContentFactory`（`create(request) → TabContent`，`request` shape 见 §3.3 `OpenTabRequest`）；`openTab` 调 `factory.create(...)`、**不 import `FileDocumentModel`**——连构造层也不泄漏具体页签类型（M4）。工厂与 `TabContent` 同源一条缝，绑定在壳挂载点（§3.5），file 是其唯一注册项。
  - `mode` 派生：`tabs.length === 0 ? "launcher" : "tabs"`——「关全部回启动器」不是特判，是这条派生的自然结果（standards §1，不渲染即测）。
- **纯函数模块（`WorkbenchModel` 委托的派生/策略，各自单测）**：
  - `model/file-location.ts` — **shell 自有** `FileLocation`（`{ path; lineStart?; lineEnd? }`）+ `normalizeFileLocation(raw)`（trim / `\`→`/` / 段归一 / 行号钳制）+ `sameFilePath(a, b)`（**文件身份判定 = 归一 path、Windows 大小写不敏感**）。**等价重写自旧 `@/workspace/file-open` 的位置归一 + 路径相等、零跨目录引旧**（§4.2）。**关键（评审阻断修正）**：文件身份轴 = **path only**；`lineStart/lineEnd` 是**打开后定位参数、不参与身份**（见 tab-instancing）。
  - `model/tab-instancing.ts` — `resolveTabInstancing(existing, requestPath) → { action: "focus"; id } | { action: "append"; tab }`。**去重/身份 = 归一 path**（`sameFilePath`）：`file` **一文件一 tab**（同一 path 命中既有 → focus，对齐旧 `file_${path}` + VSCode + 验收 item 17）、`review` 单实例、其余多实例。**行号不进身份**——「打开带行号的 location」= 命中既有则**聚焦 + 把行号交该 tab 的 `FileDocumentModel` 作 reveal/滚动目标（retarget，对齐旧 `applyEnsureTab`）**、未命中则 append 一个 **path 身份**新 tab、以该行号为初始滚动目标；**行号处理在 openFile 编排 / `FileDocumentModel`、不在 `resolveTabInstancing`**（它只裁身份）。新 tab `id` 由归一 path 生成（shell 自定格式，不借旧 `file_${path}`、不引旧 store）。**完整「跳转到行」交互（requirement §7 建议项 1）本轮 deferred**——此处只把**身份轴钉成 path**，让未来带行号源（对话文档地址/输出本地链接，§3.1）**零碰撞、不丢行号**地接入（正是评审要防的潜伏缺陷）。
  - `model/tab-order.ts` — `placeTabAtDropIndex(order, movingId, dropIndex) → order'`：拖拽调序的落位（无固定首位）。
  - `model/tab-kind-policy.ts` — **`TAB_KIND_POLICY` 静态表**（每类的实例规则/图标/本轮是否可用/`⌘P` 提示）。启动器与新建下拉**直接渲染这张表的静态投影**（`file` 可用；对话/浏览器/代码审核/终端 `enabled:false` + `comingSoon:true`）——**不套 `deriveLauncherItems` 函数**（无动态输入、需求无「milestone」概念，套一层是投机 indirection，M9）；去重/单实例也读它。**策略集中**（coding-standards：同一判别式散在 3 处就建表）。
- **框架 UI（`observer` 纯渲染）**：`components/tab-bar.tsx`（Codex 胶囊 tab 头 + 末尾 `+` + 右上 ⤢/收起 + 悬浮 ✕/脏 ● 复用位）、`components/new-tab-menu.tsx`（新建下拉）、`components/tab-context-menu.tsx`（页签右键 3 项，复用 file-tree 的 `use-web-dom-click` 关闭外点）、`components/launcher.tsx`（竖排五类启动器）、`components/workbench.tsx`（组装 + 按 `focusedTab.kind` 委托给内容渲染器）。

**内容契约（框架↔具体类型的唯一缝）** `model/tab-content.ts`：

```ts
// 框架只认这一个契约；file 是第一个实现者，未来终端/浏览器/审核/对话各插一个实现。
interface TabContent {
  readonly title: string; // tab 头显示名（文件=文件名，过长截断在渲染层做）
  readonly activityDot: ActivityDot; // 页签活动点：本轮唯一驱动源=文件脏态；无内容驱动则 "none"
  onActivated(): void; // 该 tab 被切到/聚焦（文件用它触发树 reveal 联动）
  onClosing(): void; // 关闭前钩子（文件用它触发失焦=自动保存；同步语义、不阻断关闭）
}
type ActivityDot = "none" | "dirty";
```

框架**只调这一个契约**，不知道 `onClosing` 里文件在自动保存。**这是 YAGNI 的红线**：不预置 plugin bus、不预置四类的空实现、不预置投机钩子——四类是 `TAB_KIND_POLICY` 里的**数据行（禁用）**，不是抽象。缝只有一条（`TabContent`），且此刻就有真实实现者（file），符合「一个适配器是假想缝、两个才是真缝」——file 是第一个真实现，框架/内容拆分又是需求 §2·A 明令的「可复用骨架」，故此缝**成立且最小**。

### B. 文件页签（第一个实现 `TabContent` 的类型）

落点 `right-panel/file-tab/`。领域对象 **`FileDocumentModel`（MobX 类，一个打开的文件页签一个实例，实现 `TabContent`）**——把「一个打开文件」的全部状态+行为封装在一处：

- 状态：`path` / `workspaceId` / `kind: DocumentKind` / `load: LoadState` / `baseline: { modifiedAt }`（上次落盘的盘上时间戳——**只存 mtime、不镜像内容**：内容归编辑器缓冲，模型无内容副本，M1）/ `save: SaveLifecycle` / `mdView: "preview" | "edit"` / `find: FindSessionState` / `conflict: ConflictState | null` / `readOnlyReason`。
- 行为（意图方法）：`load()` / `markEdited()`（编辑器报「有改动」→ 置脏）/ `autosaveOnBlur()`（失焦触发）/ `close()`（=失焦=自动保存后交还框架）/ `toggleMdView()` / `resolveConflict(choice)` / 一组 find 意图（见 §1.D）。
- **失焦自动保存的状态归属与触发边界**：脏/自动保存中/已存/失败**全在 `FileDocumentModel`**，UI 只渲染 `save` 派生 + 派发失焦。触发边界（失焦=切页签/切窗口/点内容区外/关页签）由 UI 事件映射为 `autosaveOnBlur()` 一个入口：
  - 切页签 → 框架在 `focusTab` 前对旧文件 tab 调 `onClosing`/失焦入口；
  - 切窗口 → 编辑器适配层 `onBlur`（web `blur`/`visibilitychange`，`isWeb` 内联）；
  - 点内容区外 → 编辑器 `onBlur`；
  - 关页签 → `close()` 内先失焦。
  - `SaveLifecycle = { status: "clean" } | { status: "dirty" } | { status: "saving" } | { status: "saved" } | { status: "failed" }`（判别联合，coding-standards：让不可能态不可表达）。失败=**非阻塞**（渲染轻条、无重试按钮）、改动保留、下次失焦再试；写能力整体缺失 → `readOnlyReason` 令页签退化只读（§5 能力门）。**无 ⌘S、无保存按钮、无关闭三择一**——这些在末态里不存在（standards §2 重构非打补丁，不留残迹）。
- **外部变更冲突**：不靠 watch。写路径把基线 `modifiedAt` 作为 `expectedModifiedAt` 交给写 RPC（§5），主机侧发现盘上 mtime 与期望不符 → 回 `conflict{ hostModifiedAt }`，`FileDocumentModel` 进 `conflict` 态给三出口，**每出口的内容来源写死**（M7）：**重载** = 一次 host `readFile` 拉最新 → `editor.applyExternalContent`、`baseline.modifiedAt = hostModifiedAt`；**保留本地** = 以 `editor.getContent()` 覆写、`expectedModifiedAt` 换 `hostModifiedAt` 再发写（这次不再冲突）；**对比** = 先一次 host `readFile` 拉最新、与 `editor.getContent()` 并排，看完仍回这三出口。每出口回确定态、无死胡同。这是**唯一保留的阻塞确认**。「打开期间的实时推送探测」= 可选 `fs.watch` 能力，本轮 deferred（§5）。
- **树↔页签双向 reveal 联动**：`onActivated()` → 调 file-tree 公共能力 `revealFile(absPath)`（§3.4/§4）。**三分支（更深后代 reveal 不改根 / 直接子项仅选中 / 越界重根）的判定归 file-tree**——本模块只发命令、不重画树，符合需求「呈现由 file-tree 负责」。反向（树点文件 → 开/聚焦页签）走既有 `right-tab-bridge`（§4）。
- **对话文档地址承接 / 输出本地链接落点**：都不新造入口——三来源与输出链接**统一落在**框架的 `RightPanelController.openFile(location)`（§3.3）。承接侧本轮就位；对话/终端的**发起侧**属各自模块、随其 deferred。
- **同文件去重 / 切树根不删页签**：去重在 `resolveTabInstancing`（§1.A）；切树根是 file-tree 内部行为，与 `WorkbenchModel.tabs` 无耦合——**天然不删**（两模型无共享状态，这正是低耦合的收益，不需要任何「保留」代码）。

纯函数（`file-tab/model/`，单测）：`document-kind.ts` — `classifyDocumentKind(path, mime) → DocumentKind`（**共享包** `@getpaseo/highlight` 的 `isLanguageSupported` 判代码语言；md 判定用 **shell 自有扩展名判定**（**`trim().toLowerCase()` 后 `endsWith(".md"|".markdown")`**——大小写不敏感、`.mdx`/`.md.txt` 自然排除；逐字等价重写旧 `isRenderedMarkdownFile`、**不引旧 `@/components/file-pane-render-mode`**）；image/binary 看 `FileReadResult.kind`/mime——`FileReadResult` 出自**共享** `packages/client`、非旧 app 目录）；`find-state.ts` — `advanceFind(state, event)` 查找/替换状态机（**镜像** file-tree 的 `search-state.ts` `advanceSearch` 形态，不复制代码）。**写 RPC 入参就地组装**（`{ root, path, content: editor.getContent(), expectedModifiedAt: baseline.modifiedAt }` 是一次性对象字面量）——**不抽 `buildWriteFileInput`**：单行透传抽出来只是 indirection（standards §4，M10）。

### C. 编辑器内核（包裹成熟库 · 适配层）

落点 `file-tab/components/editor-surface.web.tsx`（+ 基/`.native` 兜底 = 「桌面 only」占位）。**决策见 §4（包裹 CodeMirror 6，不自造）**。此层是**唯一的非 MobX `class`/imperative 适配器**，边界严格（对位 terminal 包裹 xterm）：

- **只渲染 + 发事件**：渲染 `FileDocumentModel` 给的初始内容；发 `onEdited`（→ `markEdited`）、`onBlur`（→ `autosaveOnBlur`）、`onReady`。
- **持模型的是领域对象、不是它**：编辑器持有「活的编辑缓冲」（CodeMirror 的 `EditorState`）作为交互面，**领域对象不镜像每个字符**——保存时由领域对象**拉**（`handle.getContent()`）。脏是编辑器上报的一个布尔，不是内容副本（预答评审挑战①，§7）。
- 暴露 imperative handle：`getContent()` / `applyExternalContent(text)`（冲突「重载」用）/ `find` 系操作委托 CodeMirror search 引擎并回报 `{ current, total }`。
- **md 预览**：`file-tab/components/markdown-preview.tsx` **新写**，构建在**共享 npm 引擎** `react-native-markdown-display` + `markdown-it` 上、代码围栏用 `@getpaseo/highlight`——**不引旧 `@/components/markdown/renderer`**。**图片**：`file-tab/components/image-preview.tsx` **新写薄** RN `<Image>`（client `readFile` bytes → data URI）——**不引旧 `@/components/file-pane`**。**binary** 只读兜底本地新写。（长期若不愿两份 md 包装，另议把 md 组件提升到**共享包**再共用——flag 给总监，非本轮。）

### D. 查找/替换控制器

`FindSessionState`（query / replaceExpanded / matchCase / wholeWord / regex / current / total）作为 `FileDocumentModel` 的一个字段，经 `advanceFind` 纯机推进；`FileDocumentModel` 暴露 find 意图（`openFind` ⌘F / `openReplace` ⌘⌥F / `setFindQuery` / `nextMatch` / `prevMatch` / `replaceOne` / `replaceAll` / `toggleFindOption` / `closeFind` Esc）。**匹配/高亮/滚动由 CodeMirror search 引擎执行**（不自造匹配器），`{current,total}` 回流到 state；浮层 UI 是 state 的纯渲染，**配色随 chrome 主题**（§1.E）。仅作用当前页签，不碰 file-tree 全局搜索。

### D2. 内容区右键（三套 · 按内容类型派生）

纯函数 `file-tab/model/content-menu-items.ts` — `deriveContentMenu(kind) → ContentMenuItem[]`，**镜像** file-tree 的 `model/context-menu-items.ts` 派生法：按 `DocumentKind` 出三套——代码/文本 9 项（剪切/复制/粘贴/全选/查找/替换/复制文件路径/在目录树中定位/在 Finder 中显示）、md 预览 5 项、图片 4 项（md 编辑形态=代码/文本 9 项）。菜单**live 派生不存态**（同 file-tree `deriveMenu`）。其中「查找/替换」派 find 意图、「在目录树中定位」派 `revealFile`、「在 Finder 中显示」复用注入的 reveal 端口、「复制文件路径」复用 clipboard 端口——**都不新造**。**目录树写操作（新建/重命名/删除/剪切复制粘贴）不在任何一套里**（不重画树边界）。

### E. 主题 / 高亮（令牌归属 + 扩展点）

- **编辑器 chrome（背景/gutter/当前行/选区/查找高亮/浮层）随 app 主题**：复用 `themeModel`。新增一组编辑器语义令牌 `EDITOR_TOKENS: Record<ThemeScheme, EditorTokens>`（放 `theme/`，与 `SHELL_TOKENS` 同源同风格，浅/深各一套）。**不自造主题源**——scheme 仍由 `themeModel.scheme` 驱动，`observer` 一处翻。
- **代码高亮默认 ODPF（深）/ 浅色默认集（浅）**：**复用** `@getpaseo/highlight` 的 `resolveSyntaxColors("one", scheme)`（`"one"` = One Dark/One Light 家族，即 ODPF 观感源），映成 CodeMirror 的 `HighlightStyle`。读（对话代码块等既用高亮）与编辑共享**一套调色源**。
- **扩展点、不做**：「每主题默认高亮集 + 用户自定义高亮」= 设置模块后续。本轮只留一处种子——调色解析器**入参已是 `themeId`（默认 `"one"`）**，将来设置模块传别的 id 即可，**不建任何设置 UI、不加开关**（YAGNI）。具体 hex 属 design token、归 ui.html。

---

## 2. 模型与 UI 分离（落到本模块的判据表）

| 关注点                                         | 归属（模型层，不渲染即测）                                               | UI 只做                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------- |
| 页签集合/顺序/聚焦/去重/单实例                 | `WorkbenchModel` + `tab-instancing`/`tab-order`/`TAB_KIND_POLICY` 静态表 | 渲染 tabs 派生 + 派发 open/focus/close/reorder  |
| 启动器↔页签态、关全部回启动器                  | `WorkbenchModel.mode` 派生                                               | 按 mode 渲染 launcher 或 tab 头                 |
| 文档类型/加载/脏/自动保存四态/md 双态/只读原因 | `FileDocumentModel` + `document-kind`                                    | 渲染 save/kind/mdView 派生 + 派发编辑/失焦/切态 |
| 失焦自动保存触发                               | `FileDocumentModel.autosaveOnBlur()`                                     | 把 blur/切页签/关闭映射到该入口                 |
| 查找/替换会话                                  | `FindSessionState` + `advanceFind`                                       | 渲染浮层 + 派发 find 意图                       |
| 外部冲突三出口                                 | `FileDocumentModel.conflict` + `resolveConflict`                         | 渲染冲突条 + 派发 choice                        |
| 树 reveal 三分支                               | **file-tree**（`revealFile` + 内部纯判定）                               | 无（本模块只发命令）                            |
| 放大整面板                                     | `ShellModel`（region 几何，§4）                                          | ⤢ 派发 `toggleRightMaximized()`                 |

**判据**：以上每格「模型层」都能在**不挂载任何组件**的情况下用 vitest 驱动（§6）。任一格若发现「组件里在算转移/分支策略」，即放错层。

---

## 3. 数据流与接口契约

### 3.1 打开文件（三来源 + 输出链接 → 统一落点）

事件（树点文件 / 对话点文档地址 / 输出点本地路径 / 启动器·新建）→ `RightPanelController.openFile(location)` → 按 `location.path` 走 `resolveTabInstancing`（**身份=path**）→ **命中**则 `focusTab` + 若 `location` 带行号则命令该 `FileDocumentModel` reveal 该行（retarget）；**未命中**则 `append` 新 `PanelTab{kind:"file"}`（`content = factory.create({ kind: "file", location })`，§3.3；框架**不 import** 具体类，M4）→ `FileDocumentModel.load()`（`io.readFile`）、带行号则作初始 reveal 目标 → `observer` 渲染。收起态先 `shellModel.openRight()`（复用壳行为）。

### 3.2 编辑 → 脏 → 失焦自动保存（含并发在途守卫）

编辑器 `onEdited` → `markEdited()`（`save:"dirty"`，tab 现脏 ●）→ 失焦入口 `autosaveOnBlur()` → 就地组装写入参（拉 `editor.getContent()` + `baseline.modifiedAt`）→ `save:"saving"` → `io.writeFile(...)` → 成功 `save:"saved"`（●清、`baseline.modifiedAt` 更新为回传新 mtime）/ mtime 冲突 → `conflict`（三出口，§1.B）/ 其它失败 `save:"failed"`（非阻塞）。

**并发在途守卫（M6 · 失焦自动保存是头号特性，必须串行化）**：`save === "saving"` 时再来失焦**不并发第二笔写**——置 `pendingResave`；本笔写 resolve 后若期间又变脏，则**按最新 `editor.getContent()` 补一笔**（串行单飞）。这样杜绝「两笔写竞态 → 先落者更新 mtime → 后落者拿旧 `expectedModifiedAt` → 假冲突 / 丢写」。快切页签下**每个文档的写严格串行**。

关页签：`close()` 内先触发这条失焦保存链、无弹窗、失败也照关（关闭永不被写阻断）。

### 3.3 命名的对象 shape（跨模块契约，不 inline）

```ts
// 右面板对外的统一落点 = 一个「小编排器」（组合 shellModel.openRight() + workbench.openTab()），替代旧
// useWorkspaceLayoutStore.openTabFocused。它**不是** FileTreeController 那种「把 store 收窄成只读视图」的纯类型
// 收窄——它有真实编排行为（确保右栏展开 + 去重开 tab），故定性为 orchestrator，别与 FileTreeController 混谈（M8）。
interface RightPanelController {
  openFile(location: FileLocation): void; // 去重+聚焦/新开 + 确保右栏展开；入参 = shell 自有 FileLocation（§1.A file-location.ts），零旧目录引入。**覆盖旧 M12（当时定 WorkspaceFileLocation）——董事长零旧依赖规则优先**
  openLauncherType(kind: TabKind): void; // 启动器/新建下拉入口（本轮仅 "file" 生效）
}

// tab 内容契约（框架↔类型唯一缝，§1.A）+ 其构造缝（M4）——框架靠工厂建内容，不 import 具体类：
type OpenTabRequest = { kind: "file"; location: FileLocation }; // 本轮唯一 arm；未来加 terminal/browser/… arm
interface TabContentFactory {
  create(request: OpenTabRequest): TabContent; // 本轮唯一注册项 = file → FileDocumentModel
}

// 文件页签 IO 端口（注入，保测试可隔离；对位 FileTreeStoreDeps.data。命名避开 -Data smell，M13）
interface FileTabIo {
  readFile(cwd: string, path: string): Promise<FileReadResult>; // 既有 client.readFile
  writeFile(input: WriteFileInput): Promise<WriteFileResult>; // 新能力，§5
}
interface WriteFileInput {
  root: string;
  path: string;
  content: string;
  expectedModifiedAt: string; // = 打开时读到的 baseline.modifiedAt；host 侧比对做冲突守卫（§5）
}
type WriteFileResult =
  | { ok: true; modifiedAt: string }
  | { ok: false; reason: "conflict"; hostModifiedAt: string }
  | { ok: false; reason: "denied" | "unavailable" };

// 失焦自动保存的能力门契约（右面板从 shell 上下文读，不自探）
interface FileTabContext {
  readonly serverId: string;
  readonly workspaceId: string;
  readonly features: { fsWriteFile?: boolean }; // 缺 → 页签只读 + "更新主机"
  readonly isElectron: boolean;
  readonly isOffline: boolean;
}
```

### 3.4 树↔页签桥契约（复用既有桥 + 一处新增公共能力）

- **页签→树（新增，本模块发命令）**：`FileTreeController` 扩一个方法 `revealFile(absPath: string): void`；file-tree **内部**用既有 `revealPath`（当前树内展开祖先+选中）+ `reroot`（越界重根）实现三分支，判定逻辑落 file-tree 的纯函数 `resolveRevealAction(targetAbsPath, currentRoot) → { action:"reveal"|"select"|"reroot" }`（单测）。本模块只调 `revealFile`。**M18 前置依赖（诚实标注）**：现 `revealPath`（store:594）**只展开+选中、不滚动**，`file-tree-panel.tsx` 的 `FlatList` 未按 `selectedPath` 滚动。item23① 的「滚动使其可见」需 **file-tree 侧补一处** view 滚动（`FlatList.scrollToIndex` 到选中行的 `visibleNodes` 下标）——**此能力当前不存在、是 reveal 完整落地的一项 file-tree 交付**；本模块只发命令、不越界实现它。
- **树→页签（复用既有桥，仅换线 + 边界转换）**：file-tree 既有 `model/right-tab-bridge.ts`（纯契约 `openFileInRightTab`，其 `location` 本就是结构化 `{path,lineStart?,lineEnd?}`、不引旧类型）+ `right-tab-bridge.wiring.ts`（具体绑定）已预留「switch point」。**本轮把 wiring 从旧 `openTabFocused` 改绑到 `RightPanelController.openFile`**——桥纯契约与调用方（`FileTreeStore`）**一字不动**。**边界转换落在 wiring（file-tree 侧）**：wiring 把桥产出的结构化 location 传给 `openFile`（右面板收 shell 自有 `FileLocation`、结构同形直接满足；**右面板不 import 桥/旧类型**）。**去重不重造**：编排在 `WorkbenchModel`/`resolveTabInstancing`、身份轴 = **path**（shell 自有 `sameFilePath`，§1.A），与 §1.A 对齐（M11）。
  - **已知不一致（flag 给总监）**：file-tree 自身的 `right-tab-bridge.wiring.ts` 等**仍 import 旧 `@/workspace/file-open`/`@/stores/workspace-*`**——这是 **file-tree 的既有欠账**、违反同一零旧依赖规则，本轮**只把 right-panel 做到零旧依赖**、不回溯整改 file-tree（另议）。**桥的边界转换正是把 right-panel 与该欠账隔离**：右面板永不碰旧类型，转换发生在 file-tree 侧 wiring。

### 3.5 面板级聚合态

**`WorkbenchModel` 生命周期 + 持久化写死（评审澄清 1）**：一个 `WorkbenchModel` 每 (serverId, workspaceId)、随挂载点建（**对位 `file-tree-region.tsx` 的 `useMemo(createStore, [serverId, workspaceId])` 范式**）、**瞬态不持久**——**打开的文件页签不跨重载存活、切 workspace 重建**。这与旧系统「按 `${serverId}:${workspaceId}` 持久 tab」不同，是**有意的记忆语义变化**（同 M15 `rightMaximized` 瞬态）；因此**不需要** `buildWorkspaceTabPersistenceKey`、无持久 store 槽位。跨重载/跨 workspace 的「记住上次开了哪些文件页签」= **requirement §7 建议项 5 deferred**（届时才引入持久槽 + key）。

`right-panel-region.tsx` 组合 `WorkbenchModel` + 壳上下文（offline/serverId/workspaceKey）派生面板级 空(=launcher) / 加载 / 错误(+重试) / 能力门(更新主机) / 离线(整面板冻结+重连横幅)，**与文件内容态区分**（面板空≠文件空；面板离线≠文件加载）——对位 `FileTreeStore.panelState` 的优先级派生法。

---

## 4. 复用点 / 禁止重造

### 4.1 迁移 / 删旧处置清单（本轮一行不删 · 随旧路由 cutover 统一删）

**合法性先说清**（避免 §0/§4 的「退役」措辞被误读，M2）：新 shell（`home.tsx → ShellRoot`，右/中区当前是空 `RegionPlaceholder`）与旧 `workspace/[workspaceId] → WorkspaceScreen` 是**两条并存的活路由**。旧 tab 系统全在旧路由下**活着**，本轮**一行不删**——这**合法**（coding-standards《Refactor, don't patch》：新 shell 是分阶段重建，本轮触碰的子系统=**新 shell 右区**，旧路由不在本轮触碰面，故「不删」= untouched legacy、非「打补丁留旧」）。「退役」只是**长期方向**，≠ 本轮处置。**更关键（董事长零旧目录规则）**：新 shell **不复用这些旧件的代码**——需要的能力**已在新目录按最新模型方式等价重写**（§4.2 审计）。故旧件对新 shell = **零依赖**，留在旧路由、cutover 删除**对新 shell 零影响**。这消解了「复用旧工具 → 又随 cutover 删」的自相矛盾（那正是规则要避免的坑）。

**A. 旧件——本轮不删、随旧路由 cutover 统一删**：

| 旧件                                                             | 活在哪                                         | 本轮处置                                                                                        | 何时删           |
| ---------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------- |
| `workspace-layout-store.openTabFocused`                          | 旧 `WorkspaceScreen` 路由                      | 不删；file-tree 桥仅**换线**离开它（§3.4）                                                      | 随旧路由 cutover |
| `workspace-layout-store.rightToolPanelMaximizedByWorkspace`      | 旧路由                                         | 不删；新右区放大是 `ShellModel.rightMaximized` 另起                                             | 随旧路由 cutover |
| `workspace-tabs-store`（Zustand tab 状态）                       | 旧路由                                         | 不删；新框架另起 MobX，**不 extend/不 fork**                                                    | 随旧路由 cutover |
| `components/file-pane.tsx`（只读文件预览）                       | 旧路由                                         | 不删；新可编辑文件页签是新实现、不改它                                                          | 随旧路由 cutover |
| `buildWorkspaceTabPersistenceKey` / `workspace-tabs/identity.ts` | 旧路由 + file-tree 桥 wiring（file-tree 欠账） | 不删；**新 shell 完全不用**——right-panel 自有等价（`file-location.ts` + 自家 tab id/key，§4.2） | 随旧路由 cutover |

**Ring-fence 第二 maximize 真相源（M2）**：新 `ShellModel.rightMaximized` **只治新右区**、旧 `rightToolPanelMaximizedByWorkspace` **只治旧屏**；新旧路由**互斥挂载 → 二者永不共渲**，不构成「两处真相源同时活」。

**B. 落点 `RightPanelController.openFile` 的迁移点清单（M3）**——各发起点在**新 shell** 的连通性：

| 发起点                                                       | 位置                                        | 断链          | 本轮                                | 端到端可验？                             |
| ------------------------------------------------------------ | ------------------------------------------- | ------------- | ----------------------------------- | ---------------------------------------- |
| file-tree 桥                                                 | `right-tab-bridge.wiring.ts`（新 shell 内） | ①             | **换线到 `openFile`**               | ✅ 全通（树→文件页签）                   |
| `agent-stream/view.tsx`（`openTabFocused`）                  | 旧路由                                      | ②/③           | 不改（随对话/终端模块迁移改绑）     | ❌ 新 shell 对话中区仍占位、发起侧未迁入 |
| `workspace-screen.tsx`                                       | 旧路由                                      | ②/③           | 不改                                | ❌ 同上                                  |
| `panels/files-panel.tsx`                                     | 旧路由                                      | 旧 files 面板 | 不改                                | ❌                                       |
| `assistant-file-links/provider.tsx`（`onOpenWorkspaceFile`） | 旧路由                                      | ③             | 不改（随对话迁移改绑到 `openFile`） | ❌                                       |

**诚实边界（收敛过度声明，M3）**：**断链②③在新 shell = 落点（`openFile`）就绪、但端到端「待发起模块迁入新 shell 后方可验」**——这**符合** requirement §2.E 的 deferral（承接侧就位、触发侧随各自模块 deferred），不是漏画强制迁移点。本轮真正端到端连通的只有**断链①（树→文件页签）**；把「承接侧就位」读成「已可用」是不对的。

### 4.2 旧 app 目录 import 审计 → 新目录等价落点（董事长零旧依赖规则）

**规则**：`shell/right-panel/`（含 `file-tab/`）+ 挂载点 **对旧 app 目录零直接 import**；需要的能力**按最新模型方式（MobX 类 + 纯函数、模型/UI 分离、命名有价值、不写单行/无用函数）等价重写到新目录**。逐条审计：

| 旧 app 依赖（禁引）                                                             | 原用途                 | 新目录等价落点（零旧引入）                                                                                                         |
| ------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `@/workspace/file-open`：`WorkspaceFileLocation`/`normalize…`/`…LocationsEqual` | 文件位置类型/归一/相等 | **新写** `right-panel/model/file-location.ts`：`FileLocation`+`normalizeFileLocation`+`sameFilePath`（§1.A · path 身份轴）         |
| `@/workspace/file-open`：`createWorkspaceFileTabTarget`                         | 建旧 store target      | **不需要**——`resolveTabInstancing` 直接建自家 `PanelTab.target`（不经旧 store）                                                    |
| `@/stores/workspace-tabs-store`：`file_${path}` 身份 / `…TargetsEqual`          | tab 身份/去重          | **新写**——身份/去重按 `sameFilePath`（**path only**）、行号是定位参数不进身份；tab id = shell 自定格式（§1.A）                     |
| `@/stores/workspace-tabs-store`：`buildWorkspaceTabPersistenceKey`              | 持久 tab 的 key        | **不需要**——本轮文件页签**瞬态、不跨重载**（§3.5，同 M15）；持久化记忆 = requirement §7 建议项 5 deferred                          |
| `@/stores/workspace-layout-store`：`openTabFocused`                             | 旧右区开 tab           | **取代**——`WorkbenchModel.openTab`；file-tree 桥 wiring 换线到 `openFile`（转换在 file-tree 侧，§3.4）                             |
| `@/stores/workspace-layout-store`：`rightToolPanelMaximizedByWorkspace`         | 旧放大态               | **新增** `ShellModel.rightMaximized`（shell 内、非旧目录）；旧 flag 不碰                                                           |
| `@/components/file-pane-render-mode`：`isRenderedMarkdownFile`                  | md 判定                | **新写**——`document-kind.ts` 扩展名判定（**大小写不敏感 · `.mdx`/`.md.txt` 自然排除**，§1.B）                                      |
| `@/components/markdown/renderer`：`MarkdownRenderer`                            | md 预览渲染            | **新写** `file-tab/components/markdown-preview.tsx`（共享 npm 引擎 `react-native-markdown-display`/`markdown-it`+highlight，§1.C） |
| `@/components/file-pane`：图片/二进制预览                                       | 图片只读               | **新写** `file-tab/components/image-preview.tsx`（薄 RN `<Image>`，§1.C）+ binary 本地兜底                                         |

**自验结论（董事长点 6）**：`shell/right-panel/` + 挂载点 **零** `@/workspace/*`、`@/stores/workspace-*`、`@/components/*`（旧 app 目录）import；只剩 **shell 内**（`shell/model|theme|i18n`、file-tree 公共面）+ **共享包**。唯一跨旧目录接触点 = **file-tree 侧 wiring**（file-tree 既有欠账，桥边界转换已隔离，§3.4）。

**复用（明列 · 仅共享包 + shell 内，无旧 app 目录）**：

- **共享包**（非旧 app 目录，照旧引用、不重写）：`@getpaseo/highlight`（`resolveSyntaxColors("one")` + `isLanguageSupported`）、`packages/client`（`readFile` + 新 `fs.write` + `FileReadResult` 类型）、`packages/protocol`、md 引擎 npm 包 `react-native-markdown-display`/`markdown-it`。
- **file-tree 公共能力**（shell 内）：`model/right-tab-bridge.ts`（纯契约，换线不换约）、`model/file-tree-public.ts` 的 `FileTreeController`（扩 `revealFile`）、既有 `revealPath`/`reroot`（三分支的实现体）。
- **壳行为**（shell 内）：`ShellModel.openRight()`（收起→展开）、`RegionFrame`/`RegionGutter`（右区卡壳与拖拽手柄——宽度 480/320/800 已定）、`themeModel.tokens`/`scheme`（主题源）、`i18nModel`（文案，键落 `shell/i18n/messages.ts` 的 `shell.rightPanel.*`）。
- **「包裹成熟库」思路**（仅**形态参照**、不 import terminal）：`terminal/runtime` + `terminal/webview`（xterm 被包裹、模型自持会话）——编辑器适配层照此边界（库持缓冲、模型持文档/脏/保存/查找/冲突）。
- **挂载范式**（仅**形态参照**）：`shell/components/file-tree-region.tsx`（每 workspace 一个模型、喂 offline/root）——`right-panel-region.tsx` 照此结构新写。

**禁止重造（清单）**：

- **「禁止重造」vs「等价重写」先分清（董事长零旧目录规则）**：**禁止重造** = 重复实现**共享包/成熟库引擎**（`@getpaseo/highlight` tokenizer、md 引擎、CodeMirror）——那是浪费；**要求等价重写** = 把**旧 app 目录的领域小工具**（`FileLocation` 归一/相等、md 扩展名判定、tab 身份/key）按最新 MobX+纯函数方式重写进 `right-panel/`——因**跨目录引旧被禁**（§4.2）。二者不可混谈。
- **别重画树**：不在文件页签里做任何目录树/文件写操作（新建/重命名/删除/剪切复制粘贴归 file-tree）；reveal/重根只发命令。
- **别重定义壳行为**：右栏 toggle/宽度/拖拽手柄/记忆宽度/active workspace 门/展开右栏——全沿用 `ShellModel`（shell 内），不复制到本模块。
- **别自造主题源 / 别自造高亮调色**：编辑器背景与代码高亮读 `themeModel` + `@getpaseo/highlight`（共享），不新起配色系统。
- **别重造共享引擎**：代码编辑=包裹 CodeMirror、md 渲染=共享 npm 引擎（`react-native-markdown-display`/`markdown-it`）、代码高亮=`@getpaseo/highlight`、查找匹配=CodeMirror search。
- **别新建 Zustand tab store**：旧 `workspace-layout-store`/`workspace-tabs-store` 本轮**新框架不采用**（长期退役方向、仍服务旧路由，见 §4.1），新框架另起 MobX 类、**不 extend / 不 fork / 不 import**。

**编辑器内核决策（brainstorm → 定）**：

- **选项 A · 自造**（RN `<TextInput>` + `@getpaseo/highlight` 现有 read-only tokens）：要自己实现可编辑缓冲、撤销分组、查找替换浮层匹配、选区/当前行/多态键位——等于**重造一个编辑器**，达不到「类 VSCode」，违反复用而非重造 + 零复杂度预算。**否决**。
- **选项 B · Monaco**：功能最全，但**重**（体积/worker、RN-web 内嵌成本高、更像「装个 IDE」），对「侧栏内嵌的 VSCode-lite 文件页」过配。**否决**。
- **选项 C · 包裹 CodeMirror 6**（**采纳**）：MIT、模块化、内嵌编辑器事实标准；一次给齐可编辑缓冲 + Lezer 语法高亮 + 内置 search/replace + 撤销/重做 + 标准键位 + 主题扩展（背景随 chrome / 高亮喂 ODPF 调色）。桌面 only + `isWeb` → `editor-surface.web.tsx` 直接挂 DOM（不必像终端那样进 webview 隔离）；`.native` = 「桌面 only」占位。**理由**：满足「类 VSCode」+ 复用而非重造，且适配层边界（只渲染+发事件、模型持态）与终端包裹 xterm 同构，评审可对照既有成熟先例。**代价**：新增一个依赖（CodeMirror 6 相关包）——记在 §7 风险。

---

## 5. 协议 / 平台

**动协议——新增一处主机能力（失焦自动保存的写回）**：现有 `fs.*` 只有 `fs.search/create/mkdir/rename/move/copy/delete`，**没有「写文件内容」**（`fs.create` 只建空文件）；`readFile` 走既有 file-explorer 通道（读能力已具，不新增门）。故：

- **新增 RPC `fs.write.request` / `fs.write.response`**（**随 `fs.*` 家族三段式小写**——不用 `fs.writeFile` 免成家族里唯一 camelCase 异类，M14；点式命名空间 + 方向后缀，遵 [rpc-namespacing](../../../rpc-namespacing.md)）；入参 `{ root, path, content, expectedModifiedAt }`，回 `{ modifiedAt }` 或 `conflict{ hostModifiedAt }`（盘上 mtime≠期望）。**把外部冲突守卫折进写请求**——省掉单独的 watch 能力。
- **新增能力标志 `server_info.features.fsWriteFile`**（**故意不叫 `fsWrite`**——`fsWrite` 已门着**结构写** create/rename/…；标志名与 RPC 名 `fs.write` 略异是**有意的语义区分**：`fsWrite`=结构写、`fsWriteFile`=写文件**内容**）。理由：半年前的旧 daemon 会 `fsWrite:true` 却没有内容写 handler——复用它会让旧 daemon 谎报能力、自动保存必炸。新标志只由实现了内容写 RPC 的 daemon 广播。
- **后向兼容 + `COMPAT()`**：`fs.write` 是**纯新增 RPC**（additive）+ 由 `features.fsWriteFile` 门控——客户端**仅在该 flag 为真时**才发 `fs.write`、才走可编辑写路径，旧 daemon 永远收不到未知类型。缺能力 → **文件页签退化只读 + 「更新主机以使用」**（不写降级写实现、无 fallback 另一套——CLAUDE.md feature contract）。能力标志处一行 `// COMPAT(fsWriteFile): added in v0.1.X, drop the gate when floor >= v0.1.X`。
- **mtime 守卫的格式约束 + 已知残余风险（M17）**：`expectedModifiedAt` 与回传 `modifiedAt` **两端统一 `.toISOString()`**（host `fs.write` handler 读盘 mtime 也走同一格式），否则格式差会**每存假冲突**。mtime 仅 **ms 粒度** → 同一毫秒内的外部改动守卫捕获不到，属**已知残余风险**（可接受：人工外部改动极难落在同 ms）；host 侧可行则写 handler 用 `stat→比对→写` + 文件锁把 TOCTOU 窗口收到最小。
- **可选能力 · 外部变更实时推送（`fs.watch`）= 本轮 deferred**：本轮冲突探测靠「写时 mtime 守卫 + 失焦重读比对」，无需 watch；实时推送是后续可选能力，缺则不影响查看/编辑/自动保存主路径（需求 §能力门：可选）。

**平台门**：桌面 only。编辑器适配走 **Metro 文件扩展**而非运行时 `if`——`editor-surface.web.tsx`（DOM 挂 CodeMirror）/ 基文件或 `.native` = 「桌面 only」占位；小处（`blur`/`visibilitychange` 订阅）用 `isWeb` 内联。平台门只从 `@/constants/platform`。移动/紧凑态 deferred。

---

## 6. 测试策略

**必单测的纯函数（模型/UI 分离的回报）**：`normalizeFileLocation`/`sameFilePath`（shell 自有文件位置归一 + **path 身份**判定，含 Windows 大小写不敏感——**等价重写的正确性钉死**，§4.2）、`resolveTabInstancing`（**同 path 命中→focus**；**同 path 不同行→focus 既有 + retarget 行号、不新开**（评审阻断用例，验收 item 17）；未命中→append；`review` 单实例；多实例 append）、`placeTabAtDropIndex`（落位边界）、`TAB_KIND_POLICY`（仅 file 可用、四类 comingSoon——静态表形状断言，非 `deriveLauncherItems` 函数，M9）、`classifyDocumentKind`（code/text/md/image/binary 分派；**md 判定大小写不敏感** `.MD`/`.MARKDOWN`、**排除** `.mdx`/`.md.txt`——锁死等价，评审澄清 2）、`advanceFind`（查找→替换展开→大小写/全词/正则→上下条→计数）、`resolveRevealAction`（三分支判定 · 落 file-tree）、能力→只读派生。

**必测的模型逻辑（不渲染即测，注入 fake `FileTabIo` + fake `TabContentFactory`）**：`WorkbenchModel`（open/focus/close/closeOthers/closeAll→launcher、reorder、去重、`PanelTab` 只存身份不双持 title/dot）；`FileDocumentModel`（load；edit→dirty；四种失焦→saving→saved，脏清 + 基线 mtime 更新；写失败→非阻塞 failed 且改动保留；**并发守卫（M6）：saving 期间再失焦 → 串行补写一笔、用最新内容与最新 mtime、不假冲突/不丢写**；close→先自动保存；conflict 三出口各回确定态、**「重载/对比」拉 host 内容**（M7）；md preview↔edit 切换不丢改动；image/binary→只读无脏）。

**回归既有测试（M16）**：`right-tab-bridge.test.ts` 更新至新注入形态——桥的 deps 现绑 `RightPanelController.openFile`（换线，§3.4）；**纯契约 `openFileInRightTab` 与其测试断言保持不动**（只换 wiring 的 fake 目标）。

**端到端验证点 ↔ requirement 验收**：失焦自动保存四场景（切页签/切窗口/点外/关页签，item 19/20/36）、查找替换浮层全控件（item 37）、常用快捷键（item 38）、三分支 reveal（item 23/24）、md 默认预览+可切（item 39）、外部冲突三出口（item 21）、同文件去重（item 17）、切树根不删页签（item 18）、关全部回启动器（item 12）、整面板放大占对话区·左栏与树保留（item 13/14）、能力门→只读「更新主机」（item 29）、编辑器背景随主题+高亮 ODPF（item 40）。**不靠截图/grep 判过**，走 [[verify]] 端到端真生效。

---

## 7. 风险与取舍

- **OOP × 模型/UI 分离的张力（评审最可能挑战①）**：包裹 CodeMirror 后「编辑器持缓冲 vs 模型持内容」会否成两个真相源、违反 standards §1「不持模型已知数据的 UI 副本」？**取舍**：编辑器缓冲**不是模型状态的副本**，是模型**不镜像**的交互面（同 xterm 的屏缓冲 vs 终端会话模型）；模型只持文档生命周期（基线/脏/保存/冲突），保存时**拉**内容、脏是编辑器上报的一个布尔——**没有 selector 从模型派生内容**，故非两真相源。这是既有终端已验证的「包裹成熟库」边界。
- **Tab 框架为未来四类预留是否过度设计（评审最可能挑战②）**：**取舍**：只建**一条**缝（`TabContent`）+ 一张**策略表**（禁用行是数据非抽象）+ **零投机钩子**；file 是此刻的真实现，框架/内容拆分是需求明令的「五类骨架」。这是「五类框架」的**下限**，不是过度设计——若连这条缝都不建，未来插终端就得改框架，反而违背高内聚低耦合。
- **新增 `fs.write` 内容写能力 / 能力门 `fsWriteFile` 不复用 `fsWrite`（评审最可能挑战③）**：**取舍**：`fsWrite` 门结构写、旧 daemon 已实现；内容写是新操作，复用会让旧 daemon 谎报、自动保存必炸。独立 `fsWriteFile` 门是 CLAUDE.md 的诚实能力契约（RPC 名随家族叫 `fs.write`、门名 `fsWriteFile` 语义区分内容写，见 §5）；mtime 守卫折进写请求，免掉单独 watch。**代价**：需服务端配套实现新 RPC（跨包），记明为交付依赖。
- **编辑器内核选型风险**：CodeMirror 新依赖的体积/RN-web 挂载/桌面 only 覆盖面。**缓解**：desktop-only + `.web` 直挂 DOM（无 webview 开销）；适配缝隔离，未来若需 native 只换 `.native` 实现、模型不动。
- **失焦自动保存边界风险**：频繁写（**缓解**：触发源是**失焦**不是每键，天然合并；不做 per-keystroke 写）；**在途并发写**（**缓解**：saving 期间串行补写单飞，§3.2 M6，杜绝竞态假冲突/丢写）；并发外部改动（mtime 守卫→冲突而非盲覆盖）；写失败（非阻塞 + 下次失焦重试，不阻断编辑/关闭）。
- **放大态归属 + 持久化（M8 / M15）**：`ShellModel` 无 maximize（旧 Zustand 有 `rightToolPanelMaximizedByWorkspace`，只治旧屏，§4.1 已 ring-fence）。**取舍**：放大是「哪些卡渲染 + 几何」，属 `ShellModel`（region 几何的单一 owner）——新增 `rightMaximized` + `toggleRightMaximized()` + `selectVisibleRegions` 让右区吃掉中区（左栏/树保留，v7 已决）；tab 条 ⤢ **只派发**、UI **直接读 `ShellModel.rightMaximized`**（`WorkbenchModel` 不代理、不耦合 shell 几何，M8）。**持久化定死（M15）**：`rightMaximized` = **全局瞬态、不进 `ShellPersistedState`**（需求未要求放大跨重载保留）、切 workspace/context 归位 `false`。这是对**内聚 owner 的最小扩展**、非在右面板另起平行几何态（避免两处真相源），是本架构**唯一**对 shell 层的扩展，理由=几何归 shell。
- **能力门缺失的降级**：只给**可恢复态**（只读 + 「更新主机」/ 冲突可重载 / 失败可续编），**绝不写降级版第二套写实现**（standards §2 + feature contract）。
- **零旧依赖规则的取舍（等价重写 vs 复用 · 董事长硬规则）**：新 shell 对旧 app 目录零 import → 少量**领域小工具短期重复**（`FileLocation` 归一/相等、md 扩展名判定，在新旧各一份）直到旧路由 cutover。**取舍成立**：重复的只是**小纯函数**（引擎——highlight / markdown / CodeMirror——仍是**共享包、不重复**），换来**新目录自洽、可独立演进、cutover 删旧对新 shell 零影响**。file-tree 自身仍 import 旧目录属**既有欠账**（本轮不回溯），桥边界转换已把 right-panel 与之隔离（§3.4 / §4.2）。
