# 架构 · 右侧目录树（文件树）

> 日期：2026-06-30 · 状态：草拟 · 关联：[requirement.md](./requirement.md) · [ui.html](./ui.html)
> 写 **HOW 的边界**，不写逐行实现（实现交 helm-developer）。遵循 [standards.md](../../standards.md)。
> 定位：填壳子 §7.e.26 的目录树空容器。**不改壳行为**（toggle / 宽度记忆 280·220·500 / active-workspace 门 / 拖拽 已在 `shell-model.ts` + `selectors/regions.ts`，本需求一律沿用不碰）。

---

## 1. 模块划分

目录树**内容状态**与壳的**区域几何状态**是两个不同的真相源，必须分开。壳只管「这个区域显不显示、多宽」；目录树自管「展示哪个根、展开了哪些、选中谁、搜索态」。因此**新增一个独立的目录树 store**，不往 `ShellModel` 里塞——`ShellModel` 已经是页面/可见/几何三合一，再加文件树内容会让它做太多事，违背单一职责。壳与目录树的唯一耦合点是：壳 `fileTreeOpen` 为真时才挂载目录树视图（已有，不改）。

新增模块全部落在 `packages/app/src/shell/file-tree/`（path 即名，与壳同级、自成一包）。**新旧硬隔离（standards §8）**：本目录树是**自包含 clean-room 重写**——下表所有模块**零 import 旧功能模块**（`packages/app/src/` 下 `shell/` 以外的功能代码）；要的功能（数据层、图标、路径、剪贴板、选目录）一律在本目录内**重写或整段拷贝**，只允许直连「共享地基/包」（`@/constants/platform`、`@/components/ui/*`、`@getpaseo/client`、`@getpaseo/protocol`、`expo`/`react-native`/`unistyles`/主题）；触老功能模块的接缝仅 `composer-bridge.ts` / `right-tab-bridge.ts` 两处。对账见 §9。

| 路径                                         | 职责（单一）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model/file-tree-store.ts`                   | 目录树内容的唯一真相源（class + MobX，对齐壳 `ShellModel` 风格）：当前树根、展开集合、选中、搜索模式/查询/结果、各态机。只持状态 + 转移 action，几何/纯逻辑外包给下列纯函数。数据获取经本目录 `data/` 层（不引旧 hook/store）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `data/file-tree-data.ts`                     | **数据层（连服务器，新目录自建）**：调**传输层包** `@getpaseo/client` 的 `listDirectory` + 新增的 `fs.*` / `fs.search` 客户端方法，封装目录树所需的列目录 / 搜索 / 写操作调用。**这就是 standards §8「连接服务器的封装在新目录自建」**——store 只调本层，零引旧 `hooks/use-file-explorer-actions.ts` / `session-store`。条目/响应类型用 `@getpaseo/client` 返回的 payload 类型或本目录自有 `TreeEntry`，**不引旧 `ExplorerEntry`**。**实现修正（Phase 2-a · 依赖注入）：client 不在本目录 import 老 `session-store` 取——本层定义最小 RPC-caller 接口 `FileTreeRpcClient`（`listDirectory`/`fsSearch`/`fsCreate`/`fsMkdir`/`fsRename`/`fsMove`/`fsCopy` 的结构子集，真实 `DaemonClient` 结构满足），由壳子接线点（Dev D）读 `useSessionStore.getState().sessions[serverId].client` 注入 store→本层。新目录因此对老 `session-store` 零 import（比「在 data/ 内隔离一处取 client」更干净，连那一处耦合都不存在）。能力门 `features.fsSearch/fsWrite` 同经壳子注入的 `getContext()` 读，不在新目录 import session-store。** |
| `model/resolve-root.ts`                      | **纯函数**：默认根解析 + 树根来源优先级（外部 > 对话工作目录 > 桌面信号）。不渲染、可测。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `model/tree-reducer.ts`                      | **纯函数集**：展开/收起集合 reducer、选中 reducer、把列目录结果折进节点模型、节点级加载/错误标记。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `model/search-state.ts`                      | **纯函数集**：搜索态机（idle → typing → searching → progress/results/empty/error → cleared）、搜索能力门判定（name+content 两模式共用 `isSearchAvailable`）、命中高亮 range 计算、错误态文案决策（`searchErrorCopy`）。〔修订 2026-07-07：按名匹配移到服务端 `fs.search` name 模式，客户端过滤已删。〕                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `model/file-tree-public.ts`                  | **公共能力面**（硬性需求 5）：对外暴露的命名接口 shape + `showDirectory(root)` 动作签名。唯一复用面。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `components/file-tree-panel.tsx`             | 目录树根容器（observer）：顶部工具条 + 树体 + 全态切换。只渲染 store 派生 + dispatch。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `components/tree-node.tsx`                   | 单个节点行（observer）：图标 + 名 + 缩进 + 行态（hover/选中/加载）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `components/tree-toolbar.tsx`                | 顶部工具条：搜索入口 + 切换目录按钮。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `components/tree-search.tsx`                 | 搜索输入 + 模式切换 + 结果列表 + 高亮。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `components/tree-states.tsx`                 | 空/加载/错误/离线 四态展示（sFT6），每态带出口动作。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `model/context-menu-items.ts`                | **纯函数 selector**（sFT8）：按右键目标类型 + 剪贴板态 + 平台 + 有无活跃对话，派生「可见 + 启用」的菜单项列表。零渲染、可测。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `model/inline-edit.ts`                       | **纯函数集**（sFT8）：内联新建/重命名的名字合法性与重名校验（输入名 + 同级条目 → 合法 / 错误码）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `model/clipboard-state.ts`                   | **纯函数集**（sFT8）：剪贴板态转移（set-cut / set-copy / clear）+ 「粘贴是否可用」判定（store 持态，转移逻辑纯函数）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `icons/material-file-icons.ts`               | **拷贝（非 import）旧图标映射**：把 `getFileIconSvg(fileName) → svg` 的 Material 图标映射 + 扩展名表**整段拷贝**进本目录（旧在 `components/material-file-icons.ts`，机器生成、勿手改），新目录直接调本拷贝，不 import 旧文件。文件夹开/合两态 + 未识别兜底同源此映射。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `util/tree-paths.ts`                         | **路径归一（新目录重写）**：绝对路径构造（`buildAbsoluteTreePath`，对齐旧 `buildAbsoluteExplorerPath` 语义）+ `isAbsolutePath` 判定，**自包含**（旧 `utils/explorer-paths.ts` 依赖旧 `utils/path.ts`，故连判定一并落本目录，不引旧）。相对路径相对当前树根算。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `util/clipboard.ts`                          | **剪贴板薄封装（新目录重写）**：`copyTextToClipboard(text)`，**直接用 `expo-clipboard` 包**（`Clipboard.setStringAsync`）。旧 `utils/copy-to-clipboard.ts` 本就是 4 行 expo 薄封装，重写零成本、不 import 旧。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `util/pick-directory.ts`                     | **原生选目录薄封装（新目录重写）**：`pickDirectory(): Promise<string \| null>`，经 `@/constants/platform`（`getIsElectron`）门 + Electron dialog 桥取目录，取消返 null。旧 `desktop/pick-directory.ts` 依赖旧 `@/desktop/host`，故在本目录重写桥接，仅经平台门触 Electron，不 import 旧 desktop 模块。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `components/tree-context-menu.tsx`           | 三套右键菜单的渲染壳（observer）：**直连共享地基 `@/components/ui/context-menu.tsx`**，喂入 selector 产出的菜单项列表，只渲染 + dispatch。不新造浮层。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `model/composer-bridge.ts` (+ `.wiring.ts`)  | **唯一接缝之一（standards §8）· 触老 composer**：目录树只产出「要加入的路径 + 类型」，由此一处接老 composer 草稿，不在菜单/store 散落 composer 耦合。**Plan A（董事长裁决）：文件+目录都把绝对路径追加注入草稿文本（经老 `useDraftStore`），不走附件**（主机文件无本地字节，见 §3.11/§4）。**切两半保隔离+测试纯净**：纯工厂 `composer-bridge.ts`（零旧 import）＋ `composer-bridge.wiring.ts`（唯一 import 老 `stores/draft-store`，运行时壳子加载、单测不加载）。待结构化主机文件→附件能力落地只改本桥。登记见 §9。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `model/right-tab-bridge.ts` (+ `.wiring.ts`) | **唯一接缝之一（standards §8）· 触老 workspace**：目录树只产出「要在右栏打开的文件位置」，由此一处调老 workspace-layout-store 的 `openTabFocused` / `createWorkspaceFileTabTarget` / `buildWorkspaceTabPersistenceKey`（+ 新壳子自己的 shell `openRight()`，**不算接缝**），不在 store/菜单散落右栏 tab 耦合。**去重不自造**——交既有 `applyEnsureTab` 承接。**切两半**：纯工厂 `right-tab-bridge.ts`（零旧 import）＋ `right-tab-bridge.wiring.ts`（唯一 import 老 workspace 模块）。编辑/保存归右栏里程碑，本桥只「开 tab 指向该文件」。待老 workspace 重写进新目录只改本桥。登记见 §9。                                                                                                                                                                                                                                                                                                                                                                                                                              |

视图层只在 `shell/file-tree/components/`，**逻辑零渲染依赖**——`resolve-root` / `tree-reducer` / `search-state` / `context-menu-items` / `inline-edit` / `clipboard-state` / `util/*` 全是纯函数，store 不 import React，判据「不渲染即可测」成立。`data/file-tree-data.ts` 直连传输层包 `@getpaseo/client`（共享地基，非旧目录），是新目录自有的「连服务器」层。`composer-bridge.ts` 与 `right-tab-bridge.ts` 是**仅有的两个**触碰旧功能模块（老 composer / 老 workspace-layout-store）的隔离接缝，各自收口一处、登记在册（§9），不是纯函数但边界清晰；其余新目录代码**零碰**旧 `packages/app/src/`（`shell/` 以外）。

## 2. 模型与 UI 分离

**进 store / 纯函数 / selector：**

- 树根（`rootPath: string | null`）、树根来源标记（external / conversation / desktop）→ store 状态，来源决策走 `resolve-root.ts` 纯函数。
- 展开集合（`Set<path>`）、选中路径（`string | null`，单选）→ store + `tree-reducer.ts`。
- 已列目录缓存（`Map<path, TreeEntry[]>`，`TreeEntry` 为新目录自有条目类型 / `@getpaseo/client` 列目录响应 payload 类型，**不引旧 `ExplorerEntry`**）、节点级加载/错误 → store，折叠逻辑走 `tree-reducer.ts`（`directories` Map 结构是通用思路，新 store 自建，不引旧 `AgentFileExplorerState`）。
- 搜索：模式（`name | content`）、查询串、结果列表、搜索态（idle/searching/empty/error）→ store + `search-state.ts`。
- 面板级态（loading / empty / error / offline）→ store 计算属性派生，不在组件里 if。
- 能力门判定（内容搜索是否可用）→ `search-state.ts` 纯函数读 `server_info.features.*`；写操作能力门（`fsWrite`）→ 菜单 selector 入参。
- **剪贴板态**（`clipboard: { mode: "cut" | "copy"; path: string } | null`）→ store 状态，转移走 `clipboard-state.ts`。纯前端态，不持久化。
- **内联编辑态**（`editing` 见下）→ store 状态，名字校验走 `inline-edit.ts`，态机转移见 §3 第 10 条。

  ```
  editing:
    | { kind: "new-file" | "new-folder"; parentPath: string; draftName: string; error: InlineNameError | null }
    | { kind: "rename"; targetPath: string; originalName: string; draftName: string; error: InlineNameError | null }
    | null
  ```

  - 新建态：`parentPath` 标占位行插在哪个目录下；**此刻磁盘无文件、未发 RPC**（draft 只在内存）。`draftName` 初始空串。
  - 重命名态：`targetPath` 标哪行变输入框，`originalName` 记原名供「还原」与 blur 判定（语义是还原而非消失）。
  - `error` 由 `validateInlineName` 现算回填，驱动行内错误展示；非 null 时保持编辑态、不提交。
  - **自动聚焦**不入 store 持久态：组件 observer 在 `editing != null` 且对应行渲染时，对输入框做一次性 `focus()`（新建=空框光标就绪；重命名=主名选中、扩展名保留），属视图副作用，不是可测状态。

- **右键菜单项列表** → 不入 store，由 `context-menu-items.ts` selector 在打开菜单时按当前态现算（纯派生，避免冗余态）。

**UI 只做：** 渲染 store 的派生态（节点列表、行态、当前面板态、搜索结果、菜单项列表、内联输入态），dispatch action（全集见 §8.1 总表，含 `toggleExpand` / `select` / `setSearchMode` / `setQuery` / `clearSearch` / `revealPath` / `pickAndShowDirectory` / `retry` / `openContextMenu` / `closeContextMenu` / `cut` / `copy` / `paste` / `beginNew` / `beginRename` / `setDraftName` / `commitEdit()` / `cancelEdit` / `addToChat` / `revealInFinder` / `findInFiles` / `copyPath` / `openInRightTab`）。**内联编辑**：输入框 onChange → `setDraftName`，回车/blur → 视图按 `editing.kind` + `editing.error` 映射到 `commitEdit()` 或 `cancelEdit`（映射规则纯粹来自 store 态 + 纯函数，§3 第 10 条）。组件内**无**菜单可见/启用决策、**无**态机转移、**无**校验分支、**无**composer/右栏 tab 接线。

## 3. 数据流与接口契约

**事件 → 状态 → 渲染（端到端）：**

1. 壳 `fileTreeOpen` 翻真 → 视图挂载 → store `ensureRoot(ctx)`：调 `resolveTreeRoot(...)` 决定根 → 若返回「需解析桌面」信号，发起主机侧桌面解析（见下）→ 拿到根后 `listRoot()` → 渲染 sFT1。
2. 点文件夹 → `toggleExpand(path)` → 未缓存则标节点 loading + 经本目录 `data/file-tree-data.ts` 调 `@getpaseo/client` 的 `listDirectory(root, path)`（直连传输层包）→ 结果进 `tree-reducer` → 渲染缩进子层（sFT2）。
3. 点文件 → `select(path)` → 选中 reducer（单选）→ 行高亮（sFT3）。选中态对外可读，供后续右侧边栏文件页签复用，本需求不渲染预览。
4. 搜索 → `setSearchMode` + `setQuery` → **两种模式都走 `fs.search` RPC（debounce 后发起，`mode: "name" | "content"`）**，服务端在当前树根下**全根递归**匹配 → `search-state` 推进态机 → 结果列表 + 高亮（sFT4/sFT5），点结果 `revealPath(path)` 展开并选中。〔修订 2026-07-07：原「按名走客户端已列范围过滤」违反需求「在当前树根范围内匹配」——未展开层搜不到（董事长实测复现），废弃该决策，见 §5。〕
5. 切目录 → `pickAndShowDirectory()` → 本目录 `util/pick-directory.ts` 的 `pickDirectory()`（经平台门走 Electron dialog）→ 非 null 则 `showDirectory(picked)` 经公共面重置树（sFT7）；null 则不动（取消分叉）；选中目录列举失败 → error 态（sFT6）。

**公共能力接口（硬性需求 5，单一复用面）：** 定义命名对象，不写实现：

```
interface FileTreeController {        // file-tree-public.ts
  showDirectory(rootPath: string): void;   // 外部喂根 → 以该目录为根重置展示（清展开/选中/搜索）
  readonly rootPath: string | null;        // 当前根（只读派生）
  readonly selectedPath: string | null;    // 当前选中（只读派生，供右侧文件页签后续消费）
}
```

`showDirectory` 是「喂一个目录根 → 展示该目录树」的唯一入口。对话侧后续「选目录 / 点对话联动」一律调它，**不另造树**。store 实例即实现此接口；`FileTreeController` 是对外收窄的只读+单动作视图，避免外部碰内部态机。**YAGNI**：只为「接受外部目录输入」留这一个面，不预造对话侧的触发器/事件总线/订阅。

**默认根解析（纯函数，主机侧解析桌面）：**

```
type RootResolution =
  | { kind: "path"; path: string }       // 已有明确根
  | { kind: "needDesktop" };             // 需主机解析 ~/Desktop

resolveTreeRoot(input: {
  externalRoot: string | null;           // 公共面 showDirectory 传入（最高优先）
  conversationRoot: string | null;       // WorkspaceDescriptor.projectRootPath
}): RootResolution
```

优先级：`externalRoot` > `conversationRoot` > `needDesktop`。**桌面路径不在客户端假设 `os.homedir`**——树展示的是主机文件系统。`needDesktop` 由本目录 `data/` 层经主机解析：server `expandUserPath("~/Desktop")` 的归一在主机侧，客户端经 `data/file-tree-data.ts` 调 `@getpaseo/client` 的 `listDirectory("~/Desktop", ".")`，由主机 `expandUserPath` 每次归一取桌面根首层。

> **实现修正（Phase 2-a，核实协议后）：列目录响应的 `path` 是 ROOT-RELATIVE，根列举返回 `"."`（`normalizeRelativePath(root,root)`），并非绝对根字符串**——原文「响应回带归一后的绝对 path、store 用它回填 rootPath」与协议不符（§7「桌面根客户端可见性」风险已点名此点）。落地模型：store 持两个概念——`hostRoot`（`"~/Desktop"` 这类「~」相对/绝对主机根串，作每次 RPC 的 `root`/cwd，主机逐次展开）与**树内部全 root-relative 空间**（entry 路径、`expanded`、`selectedPath`、`dirCache` 键全相对，根键 `"."`，正是主机返回的形态）。FS RPC（list/create/mkdir/rename/move/copy/delete/search basePath）一律传 `root=hostRoot` + **root-relative 路径**（entry 路径直接回灌，零换算）。桌面根**无需**解析成字面绝对串作 RPC（主机每次展开 `~`），故 `data/` 层不设独立「resolveDesktop」往返。`FileTreeController.rootPath` 读出 = `hostRoot`。
>
> **实现修正 ②（2026-06-30，修「在 Finder 中显示」打不开 + 复制绝对路径）：绝对 copy/reveal 路径的基不能用 `hostRoot`**——`hostRoot` 是 `"~/Desktop"`（带字面 `~`），拼出 `"~/Desktop/a.ts"` 系统解析不了。修法：**列目录响应新增可选 `directory.absolutePath`**（服务端 `listDirectoryEntries` 回带 `directoryPath.resolvedPath`，即 `expandUserPath`+`realpath` 归一后的「~」-free 绝对目录路径；schema 加 `absolutePath: z.string().optional()`，后向兼容，旧 daemon 不发即 `undefined`）。store **首次列根时捕获 `absoluteRoot = listing.absolutePath ?? null`**（`adoptRoot` 内；`showDirectory` 重置时清空）；`toAbsolute()` 用 `absoluteRoot ?? hostRoot` 作基——优先用主机归一的绝对根（消除字面 `~`），旧 daemon 缺该字段时回退 `hostRoot`（external/conversation 根本就是绝对路径，回退正确）。`revealInFinder` 与 `copyPath(absolute=true)` 都经 `toAbsolute` 拼绝对路径，故都得「~」-free 绝对路径。**不在客户端 `os.homedir` 兜底**（主机可能远端，那会取错本机 home）。`copyPath(relative=true)` 不受影响（直接复制 root-relative 串）。

**右键菜单 + 写操作 + 联动（sFT8，端到端）：**

6. 右键节点/空白 → `openContextMenu(target)`；`target: { kind: "blank" | "dir" | "file"; path?: string }`。菜单浮层直连**共享地基** `@/components/ui/context-menu.tsx`（设计系统原语，已含右键/长按、自动翻转、native+web）——**定位需求（弹在点击位、优先左下、贴下/右边界翻转左上）由该组件的自动翻转满足，不新造浮层**；若默认锚点方向与「优先左下」不符，仅传入锚点/首选方向参数收口，不改组件内部。
7. 菜单项由 `deriveContextMenuItems(...)` selector 现算（见下签名），组件遍历渲染（默认/hover/disabled 态）+ 点项 dispatch 对应 action。出口（点项/点外/Esc）由 context-menu 组件既有行为承接。
8. **写操作流**：新建/重命名/剪切粘贴/复制粘贴 → store action → 经本目录 `data/` 层调对应 `fs.*` 写 RPC（见 §5）→ 成功后局部刷新受影响目录（经 `data/` 层调 `@getpaseo/client` 的 `listDirectory` 重列父目录，不做乐观树变更，避免与服务端真相漂移）→ 失败落节点级/行内错误。**新建文件（`fs.create`）成功且为文件**还要再触发联动2（见第 12 条 b），把新文件在右栏 tab 打开；新建文件夹（`fs.mkdir`）不触发联动2。
9. **剪贴板粘贴**：`cut(path)`/`copy(path)` 写 `clipboard` 态；`paste(targetDir)` = 据 `clipboard.mode` 调 `fs.move`（cut，成功后清剪贴板）或 `fs.copy`（copy，保留剪贴板）→ 重列目标目录。selector 据 `clipboard != null` 决定「粘贴」enabled。
10. **内联新建/重命名（精确态机，董事长点名）**：`editing` 态见 §2。state 进/出与各出口语义如下，**store 持态 + 转移 action，所有判定走纯函数，组件零分支**：

    **入口（自动聚焦）：**
    - `beginNew(kind, parentPath)`（`kind = "new-file" | "new-folder"`）→ 置 `editing = { kind, parentPath, draftName: "", error: null }`。视图在 `parentPath` 目录下**插入内联占位行**（draft，**此刻磁盘无文件/不发任何 RPC**）+ **自动聚焦**其输入框（空框、光标就绪）。
    - `beginRename(path)` → 置 `editing = { kind: "rename", targetPath: path, originalName, draftName: originalName, error: null }`。原行就地变输入框，**自动聚焦**（主名选中、扩展名保留，便于直接改主名）。

    **输入：** 每次改名 → `setDraftName(name)` 更新 `draftName` + 调 `validateInlineName({ name, siblings, kind })` 回填 `error`（驱动行内错误，但**输入期不阻止继续打字**，只在提交时按 `error` 决定走向）。

    **提交/取消出口（统一规则，覆盖董事长全部场景）：**
    - **回车** 且名字**合法非空**（`validateInlineName.ok`）→ `commitEdit()`：新建调 `fs.create`/`fs.mkdir`、重命名调 `fs.rename`（见 §5）；成功后清 `editing` + 重列受影响目录；**新建且 kind=new-file 成功 → 触发联动2 `openFileInRightTab`（第 12 条 b）**，new-folder 不触发。
    - **回车** 但名字**非法/重名**（`error != null`，含空名）→ **新建**：按下方「丢弃」规则；**重命名**：保持编辑态 + 行内错误，不提交（重命名回车不丢弃，给用户改正机会，Esc 才退出）。
    - **失焦（blur）/ 点空白** —— **新建一致规则：合法名才提交，否则一律丢弃占位行**（`cancelEdit`，占位行消失、不发 RPC、不创建任何文件或目录）。覆盖三种 blur：①名字合法 → 同回车提交；②**名字为空** → 丢弃（董事长明确场景：空名 blur/Esc/点空白都不创建）；③名字非法/重名 → 丢弃（**不静默创建错误名/重名文件**，与空名一致）。
    - **失焦（blur）/ 点空白** —— **重命名规则：还原（不是消失）**。①名字合法且 ≠ 原名 → 提交 `fs.rename`；②名字 == 原名 / 空 / 非法 / 重名 → `cancelEdit` **还原原名**（原行恢复显示 `originalName`，不发 RPC）。重命名无占位行，语义是「还原」而非「消失」。
    - **Esc** → `cancelEdit`：**新建**占位行消失（不创建）；**重命名**还原原名。Esc 一律不提交、不校验。

    一句话收口：**新建态——只有「合法名 + 回车/blur」会真正创建；空名、非法名、重名、Esc、点空白一律丢弃占位行，绝不静默落盘。重命名态——只有「合法名 + 回车/blur」会改名；其余一律还原原名。**`commitEdit` / `cancelEdit` 是仅有的两个出口 action，blur/Enter/Esc/点空白都映射到这两者之一（映射规则如上，由视图按当前 `editing.kind` + `error` 决定调哪个，决策依据全来自 store 态 + 纯函数，组件不含校验分支）。

11. **加入聊天（跨模块）**：`addToChat(path, kind)` → `composer-bridge.ts`。**实现修正（董事长裁决 2026-06-30，Plan A）：文件与目录都走「绝对路径文本注入当前对话草稿」**——经老 `useDraftStore.getState()` 读当前草稿、**追加**该绝对路径引用行（不覆盖已有文本/附件），不走 `{kind:"file"}` 附件。**理由**（核实代码）：目录树展示的是**主机**文件系统，手上只有主机绝对路径、**无本地字节**；老 `persistAttachmentFromFileUri` 实为**图片**路径（产 `AttachmentMetadata`→`{kind:"image"}`），唯一能产 `{kind:"file", attachment: UploadedFileAttachment}` 的是 `composer/actions.ts` 的 `uploadFileAttachments`→`client.uploadFile(bytes)`（需上传本地字节、daemon 回带托管 path）——主机文件无字节可上传，故 `{kind:"file"}` 链在目录树场景**不存在可用实现**。「结构化主机文件→附件」需**新增主机端文件→附件能力**，**deferred 到 composer 里程碑**（`readFile`→`uploadFile` 下载再上传方案**已否决**：浪费 + 语义怪；对 agentic 编码，路径引用比上传字节更自然，agent 自去主机读该文件）。无活跃对话 / 无 `draftKey` 时该项在 selector 即 disabled，bridge 不被调用。`addPathToChat({path,kind,draftKey})` 接口不变，将来切到结构化附件**只改本桥**。
12. **在 Finder 显示 / 查找 / 复制路径 + 联动2**：
    - a. **在 Finder 显示**：`revealInFinder` → Electron reveal 桥 `paseoDesktop.editor.openTarget({editorId:"finder", path, mode:"reveal"})`（经 `@/constants/platform` 的 `getIsElectron()` 门收口，桥本身是 Electron preload 能力，非旧 app 功能模块）；**查找**：`findInFiles` → 经本目录 `data/` 层调本需求新增 `fs.search`，传 scope/basePath 限定到该文件或目录（接内容搜索态机）；**复制路径**：`copyPath(path, relative)` → 本目录 `util/clipboard.ts` 的 `copyTextToClipboard()`（直连 `expo-clipboard`），绝对路径用本目录 `util/tree-paths.ts` 的 `buildAbsoluteTreePath`，相对路径相对当前树根计算（纯字符串，归本目录 `util/tree-paths.ts`，**新目录自有、不引旧 `explorer-paths`**）。
    - b. **联动2（新建文件 → 自动开右栏 → tab 打开该文件 → 编辑内容）**：见专节「联动2」（§3 末），触发点 = 第 8 条新建文件 `fs.create` 成功（**仅文件**）。本里程碑接通「开 tab 指向该文件 + 现有只读 FilePane 展示」；编辑/保存归右栏文件编辑里程碑（契约见 §5 + §7）。

**菜单项 selector + shape（不写实现）：**

```
interface ContextMenuItem {                 // context-menu-items.ts
  readonly id:
    | "new-file" | "new-folder" | "paste"           // blank + dir
    | "cut" | "copy" | "rename" | "add-to-chat"      // dir + file
    | "find-in-files"                                // blank + file
    | "reveal-in-finder" | "copy-path" | "copy-relative-path"
    | "delete";
  readonly label: string;
  readonly enabled: boolean;                 // 禁用 = 渲染灰但仍呈现（sFT8 条件禁用态）
  readonly destructive?: boolean;            // delete 为破坏性项，目录/文件菜单里仅此项需要确认
}

deriveContextMenuItems(input: {
  target: { kind: "blank" | "dir" | "file"; path?: string };
  hasClipboard: boolean;                     // 粘贴 enabled 依据
  isElectron: boolean;                       // reveal-in-finder enabled 依据
  hasActiveDraft: boolean;                   // add-to-chat enabled 依据
  fsWriteAvailable: boolean;                 // 写操作项（new/paste/cut/copy/rename/delete）enabled 依据
}): ContextMenuItem[]
```

可见性规则（如实对照 sFT8）：`find-in-files` ∈ blank+file；`paste` ∈ blank+dir；`cut/copy/rename/add-to-chat/delete` ∈ dir+file；`reveal-in-finder/copy-path/copy-relative-path` 三套皆有。启用规则：`paste` 仅 `hasClipboard`；`reveal-in-finder` 仅 `isElectron`；`add-to-chat` 仅 `hasActiveDraft`；写操作六项仅 `fsWriteAvailable`（缺能力置灰，**不写降级版**）。

**内联校验纯函数 shape：**

```
type InlineNameError = "empty" | "duplicate" | "invalid-chars" | "reserved";
validateInlineName(input: {
  name: string;
  siblings: ReadonlyArray<{ name: string }>;  // 同级条目（重名判定）
  kind: "new-file" | "new-folder" | "rename";
}): { ok: true } | { ok: false; error: InlineNameError }
```

**联动2 · 新建文件 → 自动开右侧边栏 → tab 打开该文件 → 编辑内容（端到端 + 分期边界）：**

> 完整链路是「新建文件 → 右栏 tab 打开 → 在右栏编辑文件内容 → 保存落盘」。这条链路**跨两个里程碑**，本节画全链路并**标清各环节归属与分期**。盘点结论：开 tab 可复用 `openTabFocused`，但**可编辑文件视图 + 写文件 RPC 全无**。

**本里程碑落地（目录树侧，现在就接通）：** 新增 `model/right-tab-bridge.ts`（单一适配层，类比 `composer-bridge.ts`）。它是目录树→工作区 layout 的唯一接线点，对外暴露一个动作：

```
interface RightTabBridge {                 // right-tab-bridge.ts
  // 在右侧边栏以 tab 打开某文件并聚焦；右栏未开则先开。去重交既有 applyEnsureTab。
  openFileInRightTab(input: {
    location: WorkspaceFileLocation;        // { path, lineStart?, lineEnd? }，复用 workspace/file-open 既有类型
    workspaceId: string;                    // 与 serverId 合成 persistenceKey
    serverId: string;
  }): void;
}
```

实现路子（HOW 边界，不写逐行）：

1. `persistenceKey = buildWorkspaceTabPersistenceKey({ serverId, workspaceId })`（= `${serverId}:${workspaceId}`，**复用既有函数，不自拼**）。
2. `target = createWorkspaceFileTabTarget(location)`（`{ kind:"file", path, ... }`，**复用既有工厂**）。
3. `useWorkspaceLayoutStore.getState().openTabFocused(persistenceKey, target)` —— 自动建右 pane（`tools`）+ 聚焦 + un-collapse 右工具面板；**去重由既有 `applyEnsureTab` + `workspaceTabTargetsEqual`（file tab id = `file_${path}`）承接**，同路径已开则聚焦不重复（**禁止在 bridge 自造去重**）。
4. 壳区域显隐：`openTabFocused` 只处理 layout 内的右工具面板 collapsed 态；壳的 `rightOpen` 是另一真相源（`ShellModel`），故 bridge 还要调 shell `openRight()`（幂等）确保壳右区可见。两个真相源都置开 = 右栏一定显现。

**触发数据流（端到端）：**

```
内联新建文件提交 commitEdit()  →  store 调 fs.create(root, path)  →  RPC 成功(回带归一 path)
   →  store 重列父目录(既有 listDirectory)            // 树上出现新文件
   →  仅当 kind === "new-file"：store 调 right-tab-bridge.openFileInRightTab({ location:{path}, workspaceId, serverId })
        →  openTabFocused(persistenceKey, fileTarget)   // 右栏建/聚焦 file tab（去重既有）
        →  shell.openRight()                            // 壳右区显现
        →  右栏 file tab 渲染 → 现有只读 FilePane 把该文件打开展示（本里程碑到此为止：文件已在右栏打开可见）
```

新建文件夹（`fs.mkdir`）成功**不**走联动2（只刷新树）。这一整段**现在就能接通**：复用既有开 tab + 既有只读 `FilePane`（盘点确认其能读空文件）先把新文件在右栏打开展示。

**联动2 编辑里程碑（右栏侧，单独分期 — 本架构定契约、不实现）：** 「支持增加文件内容（编辑 + 保存）」属右栏文件编辑里程碑，**不在本目录树里程碑实现**。本架构给出它与目录树的接口契约：

- **可编辑文件视图**（取代/包装现只读 `FilePane` / `FilePanel`）：右栏文件 tab 内提供可编辑文本区 + 保存动作。**归属右栏，与目录树解耦**——目录树只负责「开 tab 指向该文件」（即 `right-tab-bridge` 已交付的那一步），文件内容如何编辑、何时保存全在右栏，目录树不参与、不感知。
- **新增写文件 RPC** `file.write.request/response`：请求 `{ root: string; path: string; content: string }`（写文本内容到**已存在**文件）→ 响应 `{ path: string }`（归一后绝对路径）。与既有 `client.readFile`（读）正交；与本里程碑的 `fs.create`（建空文件）也正交——`fs.create` 只负责「文件存在」，`file.write` 负责「写入内容」。**后向兼容 + 能力门见 §5**。
- **保存流（右栏里程碑实现）**：编辑器改动 → 保存触发 → `client` 调 `file.write(root, path, content)` → 成功更新 dirty 态；失败落编辑器内错误。**目录树不感知保存**（树是文件结构视图，内容保存是右栏职责），无需在新文件保存后回刷树。

**链路归属与分期一览：**

| 环节                             | 归属                         | 分期                     | 复用/新增                                                                  |
| -------------------------------- | ---------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| 内联新建文件（建空文件）         | 目录树                       | **本里程碑**             | 新增 `fs.create`（§5）                                                     |
| 新建成功 → 开右栏 tab 指向该文件 | 目录树（`right-tab-bridge`） | **本里程碑**             | 复用 `openTabFocused`/`createWorkspaceFileTabTarget`/`openRight`，去重既有 |
| 右栏打开后只读展示文件           | 右栏                         | **本里程碑**             | 复用既有只读 `FilePane`                                                    |
| 可编辑文件视图（编辑 UI）        | 右栏                         | **编辑里程碑（不实现）** | 新增编辑器组件                                                             |
| 写文件内容 + 保存                | 右栏                         | **编辑里程碑（不实现）** | 新增 `file.write` RPC（§5 标分期）                                         |

## 4. 复用点 / 禁止重造（三分类 · 遵循 standards §8 新旧硬隔离）

> standards §8 把「复用」拆成三类：**(A) 允许直连的共享地基/包**（不算旧目录）、**(B) 必须在新目录重写/拷贝的旧功能模块**（禁止 import 旧实现）、**(C) 唯一接缝 = 两个 bridge**（仅有的触老功能模块的隔离适配文件）。下面逐项归类。**判据**：除 (A) 与 (C) 外，`shell/file-tree/**` 不得出现指向 `packages/app/src/`（`shell/` 以外）的 import（对账见 §9）。

### 4.A 允许直接 import 的共享地基 / 包（保留 import，非旧目录）

> 全 app 共享基础设施 / 独立工作区包 / 框架。新壳子本就建立其上，直连。

- **传输层包 `@getpaseo/client`（连服务器，直接调）**：
  - 列目录 `listDirectory(cwd, path) → 列目录响应 payload`（底层 `file_explorer_request/response`）—— 直连，不新建列目录 RPC。
  - 本需求**新增**的 `fs.create` / `fs.mkdir` / `fs.rename` / `fs.move` / `fs.copy`、`fs.search`、`file.write`（编辑里程碑）等 RPC 的**客户端方法** —— 加在 client 包上，新目录 `data/` 层**直连调用**（这些是传输层，所有端共享）。
  - 读文件 `readFile(cwd, path) → FileReadResult`（空文件可读）—— 右栏展示新建空文件即直连此读路径，不另造读 RPC。
- **协议包 `@getpaseo/protocol`**：上列 RPC 的 schema（`messages.ts`）+ 能力门 `server_info.features.*` —— 直连（协议契约见 §5）。
- **平台门 `@/constants/platform`**：`getIsElectron()`（reveal / 选目录 / 桌面 only 门）、`isWeb` —— 直连，平台分支只从此处取。
- **设计系统原语 `@/components/ui/*`**：右键菜单浮层 `context-menu.tsx`（右键/长按、自动翻转、native+web）—— 三套菜单 + 左下默认/边界翻转左上**全部直连此组件**。**禁止新造任何右键浮层/Portal/Modal**。Android 触摸裁剪 / contentSize 防闪 gotcha 由该组件（及 floating-panels.md）承接。
- **框架 / npm 包**：`expo-clipboard`（剪贴板薄封装直接用它）、`react-native-svg` 的 `SvgXml`（渲染拷贝进来的图标 svg）、`react-native` / `expo` / `unistyles` / 主题 —— 直连。
- **桌面根解析（主机侧能力，非旧 app 模块）**：server `expandUserPath("~/Desktop")` 的归一在主机侧；客户端只经 `data/` 层调 `@getpaseo/client` 列目录传 `~/Desktop`，由主机归一 —— 不在客户端造 Desktop helper、不假设 `os.homedir`。
- **Electron reveal 桥（preload 能力，非旧 app 模块）**：`paseoDesktop.editor.openTarget({editorId:"finder", path, mode:"reveal"})` —— 经 `getIsElectron()` 门收口直连，不另造 reveal 桥。
- **壳几何/可见 = 新壳子自己（同属 `shell/`，非旧目录）**：`ShellModel` + `selectors/regions.ts` 的 `fileTree` region / `fileTreeOpen` / `workspaceKey` / 宽度记忆、shell `openRight()` —— 沿用不改（壳与目录树同在新 `shell/` 树下，本就同包）。

### 4.B 必须在新目录重写 / 整段拷贝的旧功能模块（禁止 import 旧实现）

> 以下原列为「复用旧 X」，按 standards §8 **全部降级为「在 `shell/file-tree/` 内重写或整段拷贝」**，新目录零 import 旧文件。开发时可肉眼参考旧代码找思路，但**不得 import**。各项落点见 §1 模块表。

- **文件图标映射**：旧 `getFileIconSvg`（`components/material-file-icons.ts`，机器生成的 Material 图标 + 扩展名表）→ **整段拷贝**进 `shell/file-tree/icons/material-file-icons.ts`，新目录调本拷贝。文件夹开/合两态 + 未识别兜底同源此映射。**禁止重造图标映射逻辑**（拷贝已有数据即可），但**禁止 import 旧文件**。
- **路径归一**：旧 `buildAbsoluteExplorerPath`（`utils/explorer-paths.ts`，且依赖旧 `utils/path.ts` 的 `isAbsolutePath`）→ 在 `shell/file-tree/util/tree-paths.ts` **重写**为 `buildAbsoluteTreePath` + 自包含的绝对路径判定，不引旧 `explorer-paths` / `path`。
- **可见性过滤**：**不做**——董事长 2026-06-30 决定目录树**全部显示**（含 .DS_Store 等点文件），不设隐藏过滤；旧 `file-explorer/visibility.ts` 不复用、新目录也不实现（YAGNI；将来要「显示隐藏」开关再单加）。
- **剪贴板**：旧 `copyToClipboard`（`utils/copy-to-clipboard.ts`，本质 4 行 `expo-clipboard` 薄封装）→ 在 `shell/file-tree/util/clipboard.ts` **重写薄封装**，**直接用 `expo-clipboard` 包**（§4.A），不 import 旧文件。
- **原生选目录**：旧 `pickDirectory`（`desktop/pick-directory.ts`，依赖旧 `@/desktop/host` 桥）→ 在 `shell/file-tree/util/pick-directory.ts` **重写薄封装**，经 `@/constants/platform`（`getIsElectron`）门 + Electron dialog 取目录，取消返 null，不 import 旧 `desktop/` 模块。
- **列目录条目类型**：旧 `ExplorerEntry`（`stores/session-store.ts`）→ **不引旧类型**；新目录用 `@getpaseo/client` 列目录响应的 payload 类型，或在 `data/` / `tree-reducer` 定义自有 `TreeEntry` / `TreeNodeView`。
- **数据层（连服务器）**：旧 `hooks/use-file-explorer-actions.ts`（`requestDirectoryListing` / `AgentFileExplorerState` / `buildWorkspaceExplorerStateKey`）/ `session-store` 列目录态 → **一律不引用**；新目录自建 `shell/file-tree/data/file-tree-data.ts`（直连 `@getpaseo/client` 的 `listDirectory` + 新 `fs.*` / `fs.search` / `file.write`）。**这就是 standards §8「连接服务器的 app 层封装在新目录自建」。**
- **旧文件树 UI / 旧 hook**：旧 `file-explorer-pane.tsx` / `file-pane.tsx` / `hooks/use-file-explorer-actions.ts` → 从「逻辑参考」**降为「连参考都不 import」**，新目录全新实现（§1 `components/`）。**联动2 本里程碑右栏只读展示**：现有只读 `FilePane` / `FilePanel` 属右栏模块，目录树**不 import、不在目录树里造文件查看器**；新文件经 `right-tab-bridge`（§4.C）开 tab 后，由右栏自己渲染只读 `FilePane`——这条跨模块联动收口在 bridge，目录树不直接碰 `FilePane`。

### 4.C 唯一接缝 = 两个 bridge（仅有的触老功能模块的隔离适配文件，登记在册）

> standards §8：跨模块联动**只允许**收口在显式命名的 `*-bridge.ts` 里，一处一桥、列入清单、注明将来切换点。本需求**全部接缝仅此两处**，其余新目录代码零碰旧模块。

- **`model/composer-bridge.ts` — 触老 composer（「加入聊天」sFT8）**：唯一调老 composer 的点。**Plan A（董事长裁决）**：文件与目录**都**经老 `useDraftStore.getState().getDraftInput/saveDraftInput`（`stores/draft-store`）把绝对路径**追加**进当前草稿文本（不覆盖已有文本/附件），**不**走 `{kind:"file"}` 附件（主机文件无本地字节、`persistAttachmentFromFileUri` 实为图片路径、`uploadFile` 需本地字节——见 §3 第 11 条修正）。对外只暴露 `addPathToChat({path,kind,draftKey})`，菜单/store 不直接 import composer。**实现切两半保隔离 + 测试纯净**：纯工厂 `composer-bridge.ts`（零旧 import，单测它）＋ 具体绑定 `composer-bridge.wiring.ts`（唯一 import 老 draft-store；运行时由壳子加载，单测不加载，避免 draft-store 的 persist 中间件在 node 测试环境触 AsyncStorage）——两文件合起来是这一个接缝。**将来切换点**：待结构化主机文件→附件能力落地，只改本桥（工厂 + wiring），不动调用方。
- **`model/right-tab-bridge.ts` — 触老 workspace（联动2 · 新建文件→开右栏 tab）**：唯一调老 workspace-layout 的点——`useWorkspaceLayoutStore().openTabFocused(persistenceKey, target)`（`stores/workspace-layout-store.ts`，自动建右 `tools` pane + 聚焦 + un-collapse）+ `createWorkspaceFileTabTarget(location)`（`workspace/file-open/index.ts`）+ `buildWorkspaceTabPersistenceKey({serverId, workspaceId})`（`stores/workspace-tabs-store`）。**禁止重造开 tab / tab 去重 / persistenceKey 拼接**——去重交既有 `applyEnsureTab` + `workspaceTabTargetsEqual`（file tab id = `file_${path}`），同路径已开聚焦不重复。**注**：bridge 内还调 shell `openRight()`（`shell/model/shell-model.ts`）——那是**新壳子自己**，属 §4.A 不算接缝。**将来切换点**：待老 workspace 重写进新目录，只改本桥。
- **在文件中查找**：复用本需求新增的 `fs.search` RPC（经 `data/` 层直连 client 包，§4.A；同一 ripgrep 能力传 basePath 收窄 scope），**不为右键查找另起 RPC**——这走传输层包，非接缝。

**「加入聊天」目录引用 — 结论：** 盘点已确认 `UserComposerAttachment` 现有 kind 为 `image | file | github_issue | github_pr`，**无目录引用 kind**。本需求取舍：

- **修正（Plan A · 董事长裁决 2026-06-30）：文件与目录都走「绝对路径文本注入草稿」**，不区分。原计划「文件走 `{kind:"file"}` 附件」**经核实代码不可行**：①老 `persistAttachmentFromFileUri` 是**图片**路径（产 `AttachmentMetadata`→`{kind:"image"}`），非文件附件；②唯一能产 `{kind:"file", attachment: UploadedFileAttachment}` 的 `uploadFileAttachments`→`client.uploadFile` 需**本地字节**上传，而目录树是**主机**文件系统、手上只有主机路径无本地字节（`readDesktopFileBytes` 读的是本地 Electron 盘，非远端主机）。故 `{kind:"file"}` 链在目录树场景**无可用实现**。
- **文件 + 目录** → 经 `composer-bridge.ts` 把绝对路径**追加注入草稿正文**（复用 draft 文本写入面），不伪造附件。对 agentic 编码，路径引用比上传字节更自然（agent 自去主机读）。
- **结构化「主机文件/目录引用」附件 kind → deferred 到 composer 里程碑**（需新增协议级「主机端文件→附件」能力 + 对话侧消费语义；`readFile`→`uploadFile` 下载再上传方案**已否决**：浪费 + 语义怪 + 改全链路，零复杂度预算）。bridge 对外只暴露 `addPathToChat({path, kind, draftKey})`，将来切结构化附件**只改本桥**，不改菜单。

**肉眼参考、零 import（standards §8）：** 旧 `components/file-explorer-pane.tsx`、`hooks/use-file-explorer-actions.ts` 的列目录/选中/缩进/态切换思路开发时可肉眼看，但**连参考都不 import**——UI 在 `shell/file-tree/` 全新实现，**新建独立 store** 只装本需求需要的态（不引旧 `AgentFileExplorerState`，其 history/preview/download 字段本需求不需要，引入即把无关耦合带进来）。旧预览 `components/file-pane.tsx` —— 本需求不做预览，不碰、不引。这是「重构而非打补丁」+「新旧硬隔离」的合流：新目录读起来像一开始就照新设计写的，无旧依赖层。

## 5. 协议 / 平台

**动协议——新增一条 `fs.search` RPC，「按名」与「按内容」两模式共用：**

> 〔修订 2026-07-07〕原方案让按名搜索走「已列节点的客户端过滤」（以 YAGNI+性能为由不启用 RPC 的 name 模式）。实测证伪：树默认只列首层，未展开子树里的文件按名搜不到（根下 4 层深的 AGENTS.md 显示「无匹配结果」，展开路径后同一查询命中 2 条），直接违反需求 §2③「在**当前树根范围内**匹配文件/文件夹名」。现改为**两模式统一走服务端全根递归**；客户端仅保留高亮 range 计算，`filterByName` 纯函数删除。

- **按文件名搜索**：走 `fs.search` 的 `name` 模式——服务端自树根递归遍历（剪枝 hidden / node_modules 等重目录），大小写不敏感子串匹配名字，`limit` 截断。客户端不再做本地过滤。
- **按文件内容搜索**：走 `fs.search` 的 `content` 模式（服务端 ripgrep，Node 遍历兜底）。
  - 名称：`fs.search.request` / `fs.search.response`（域 `fs`，操作 `search`）。
  - 请求 shape（不写实现）：`{ root: string; query: string; mode: "name" | "content"; basePath?: string; limit?: number }`——两模式都在用；`basePath` 只在 content 模式（「在文件中查找」的范围收窄）传。
  - 响应 shape：`{ matches: Array<{ path: string; kind: "file"|"directory"; line?: number; preview?: string; ranges?: Array<{start:number;end:number}> }>; truncated: boolean }`——`line/preview/ranges` 给内容命中高亮用，全 `.optional()`。
  - **后向兼容**：新增 RPC + 新字段全 optional，旧客户端不识别即不发；不改任何既有 schema 字段。
  - **能力门**：挂 `server_info.features.fsSearch`（`messages.ts` 的 `ServerInfoStatusPayloadSchema.features` 对象内新增 `fsSearch: z.boolean().optional()`），注释位约定：
    `// COMPAT(fsSearch): added in v0.1.X, drop the gate when daemon floor >= v0.1.X.`
  - **能力缺失行为（不写降级版另一套）**：`search-state.ts` 读 `features.fsSearch`；为假时**两种搜索模式**入口都直接走需求规定的错误态（按模式提示需升级主机），**不**用列目录 fan-out / 客户端过滤模拟搜索，**不**写第二套实现。
  - **性能约束（服务端）**：ripgrep 跑到 kill 死线时**返回已流出的部分命中（`truncated: true`）**，不得再落入 Node 全量重扫（「超时后重扫」= 实测 25–30s 慢搜索的根因）；rg 侧带 `--max-filesize` 上限跳过巨型文件，排除目录（node_modules/dist/build/out/coverage）与 Node walk 对齐。**rg 二进制随 server 依赖内置（`@vscode/ripgrep`）**——不能指望用户机器装了 rg（实测本机就没有，导致内容搜索一直走 24–31s 的全量 Node 遍历）；缺内置时兜底 PATH 的 `rg`，都没有才落 Node walk。
  - **渐进式结果流（fsSearchProgressive，修订 2026-07-07）**：请求带可选 `progressive: true` 时，服务端在扫描过程中把命中按小批（≥25 条或 80ms 即 flush）以 **`fs.search.progress`** 消息流出，最终 `fs.search.response` 仍携带**完整集**（客户端以最终集整体替换预览，不做去重）。首命中上屏从「等全扫完」（2.5–5s）降到**亚秒级**（实测 0.4–0.7s）。后向兼容：旧 daemon 剥掉未知字段照常全量响应；旧 client 不发 `progressive` 就永远收不到 progress 消息。
  - **在途取消（supersede）**：一个会话同时只跑一个实扫——新 `fs.search.request` 到达即 abort 上一个（杀 rg 子进程 / 停 walk），被取消的搜索仍以「部分命中 + truncated」正常 resolve（客户端 last-query-wins 丢弃它），不是错误。连续击键不再叠加多个全盘扫描的 I/O。
  - **能力旗到达一致性（客户端）**：`server_info` 帧与订阅挂载存在竞态窗口——挂载侧必须「读缓存 + 订阅」双保险，错过帧不允许让能力旗停留为空直到刷新（实测症状：搜索一直显示「请升级主机」）。
  - **错误态分因**：能力缺失（`errorKind: "unsupported"` → 「请升级主机」）与运行失败（`"failed"` → 「搜索失败·请重试」）在态机上分开，超时/断连不得误提示升级主机。
  - **新鲜度保证（无索引 + 写后重搜，为文件修改功能铺路）**：搜索**没有任何索引**——每次都实扫活文件系统，「改了内容/文件名后搜到旧数据」在架构上不可能发生。树内每个写操作（新建/重命名/剪切粘贴/复制粘贴/删除）成功后**自动重跑当前活跃搜索**（store 单一钩子 `rerunActiveSearch`，经共用 debounce），结果列表即时反映改动；后续文件编辑功能的保存路径只需调同一钩子。树外部改动（编辑器/agent 写盘）在下一次搜索时天然可见（活体验证：从搜索结果行删除文件 → 结果自动变「无匹配」+ 磁盘实删）。
  - **搜索范围 = 树的显示范围（董事长裁决 2026-07-07）**：树永远显示所有条目（含 `.` 开头）；搜索同步覆盖隐藏与 gitignored 条目（rg 加 `--hidden --no-ignore`，Node walk 不剪 dot 目录）——「树上看得见就搜得到」。唯一排除集 = 重型生成目录 `node_modules/.git/dist/build/out/coverage`（两引擎一致），其内容属搜索噪音。
  - **Esc 不再关闭搜索面板（董事长裁决 2026-07-07）**：原「搜索输入内按 Esc = 收起整个搜索面板」误伤活跃搜索，已删除；面板只经工具栏搜索钮开合。Esc 在右键菜单/内联编辑处的关闭语义不变。
- 能力检测集中在 store 接入数据层那一处（一个 selector 读 `features.fsSearch`），下游组件读干净的布尔，不散落防御分支。

**FS 写操作——新增六个 dotted RPC（含 delete，已落地）：** 与既有列目录（`file_explorer_request`）/ 搜索（`fs.search`）正交——列/搜是读，这六个是写；不复用列目录 RPC 承载写，避免一个 RPC 多职责。dotted 命名 + 方向后缀，请求/响应 shape（不写实现）：

| RPC                          | 请求                                                                  | 响应                                 |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------------------ |
| `fs.create.request/response` | `{ root: string; path: string }`（新建空文件）                        | `{ path: string }`（归一后绝对路径） |
| `fs.mkdir.request/response`  | `{ root: string; path: string }`（新建目录）                          | `{ path: string }`                   |
| `fs.rename.request/response` | `{ root: string; path: string; newName: string }`（同目录改名）       | `{ path: string }`（新路径）         |
| `fs.move.request/response`   | `{ root: string; from: string; toDir: string }`（剪切粘贴）           | `{ path: string }`（落地路径）       |
| `fs.copy.request/response`   | `{ root: string; from: string; toDir: string }`（复制粘贴，递归目录） | `{ path: string }`                   |
| `fs.delete.request/response` | `{ root: string; path: string }`（删文件 / 递归删目录）               | `{ path: string }`（被删路径）       |

- **`fs.delete` 落地说明（2026-06-30 从「不做」转为「做」）**：服务端 `write-service.ts` 新增 `deleteEntry`——`resolveScopedPath` 防越界、`fs.rm(resolvedPath, { recursive: true })` 递归删目录 + 删文件、不传 `force` 故删不存在条目抛 ENOENT（不静默成功）、**显式拒删根（`relative === "."`）防误删整个工作区**。`session.ts` 新增 `fs.delete.request` 分发 + `handleFsDeleteRequest`（沿用 `emitFsRpcError`）。client `daemon-client.ts` 新增 `fsDelete(root, path, requestId?)`。**复用既有 `fsWrite` 能力门**（delete 属结构写，不另起 flag）。
- **后向兼容**：六个 RPC 全新增；后续若加字段一律 `.optional()` + 默认/`transform` 兜底；不改任何既有 schema。响应统一回带归一 `path` 供 store 回填/定位。错误（重名/无权限/不存在）走 RPC 错误通道，UI 落行内/节点错误态。
- **能力门**：挂 `server_info.features.fsWrite`（`messages.ts` 的 `ServerInfoStatusPayloadSchema.features` 内新增 `fsWrite: z.boolean().optional()`），注释位：
  `// COMPAT(fsWrite): added in v0.1.X, drop the gate when daemon floor >= v0.1.X.`
- **缺能力行为（不写降级版）**：`fsWriteAvailable` 为假时，菜单 selector 把写操作六项（new-file/new-folder/paste/cut/copy/rename/delete）置 `enabled:false`（灰显，sFT8 条件禁用态），**不**用列目录/其他 RPC 模拟写，**不**写第二套实现。能力检测同样集中在 store 接数据层那一处读 `features.fsWrite`，下游读干净布尔。

**写文件内容 RPC（联动2 编辑里程碑 — 本架构定契约，本目录树里程碑不实现）：** 盘点确认仓库**无** `writeFile(cwd, path, content)`（仅 `uploadFile` 二进制覆盖，不适合文本编辑保存）。联动2 的「支持增加/编辑文件内容 → 保存」需新增写文本 RPC，**属右栏文件编辑里程碑**：

| RPC                           | 请求                                                                    | 响应                                 |
| ----------------------------- | ----------------------------------------------------------------------- | ------------------------------------ |
| `file.write.request/response` | `{ root: string; path: string; content: string }`（写文本到已存在文件） | `{ path: string }`（归一后绝对路径） |

- **与本里程碑写 RPC 的边界**：`file.write` 与 §5 上方 `fs.create`（建空文件）**正交不复用**——`fs.create` 让「文件存在」（本里程碑、目录树触发），`file.write` 让「内容写入」（编辑里程碑、右栏触发）。两者职责单一，不合并成一个「建并写」RPC（建文件走内联新建流，写内容走编辑器保存流，触发点与归属都不同）。
- **能力门 — 结论：新增独立 `server_info.features.fsEdit`，不复用 `fsWrite`。** 理由：`fsWrite`（§5 上方）门的是「目录树写操作五项是否可用」（本里程碑随 `fs.*` 一起落地）；`file.write` 随**右栏编辑里程碑**独立落地，两个里程碑的服务端能力可能分批上线，复用同一门会让「目录树写已就绪但编辑未就绪」无法表达。故 `file.write` 挂 `server_info.features.fsEdit`（`ServerInfoStatusPayloadSchema.features` 内新增 `fsEdit: z.boolean().optional()`，对齐现有 features 全 `z.boolean().optional()` 写法），注释位：
  `// COMPAT(fsEdit): added in v0.1.X, drop the gate when daemon floor >= v0.1.X.`
- **后向兼容**：新增 RPC + 新字段全 optional；不改既有 schema。缺 `fsEdit` 时编辑里程碑的保存动作走「需升级主机」提示态，**不写降级保存路径**。
- **本里程碑无关**：目录树本里程碑既不发 `file.write`、也不读 `fsEdit`；列在此处仅为画全联动2 链路、为编辑里程碑预定契约。本里程碑只接到「开 tab + 只读展示」为止。

**平台门（桌面 only）：**

- **在 Finder 显示**：`getIsElectron()` 门——非桌面该菜单项 `enabled:false`（selector 据 `isElectron`）。`openTarget` 桥本就 Electron 专属，调用点用 `getIsElectron()` 收口；若 reveal 实现需平台分文件，沿用既有 `.electron` 文件策略，不在菜单组件里写大 `if` 块。

- 整个目录树 deferred 移动/浏览器紧凑态——本需求只交付桌面。
- 目录选择器 Electron 专属：用**本目录重写**的 `util/pick-directory.ts`（§4.B，经平台门 + Electron dialog，不引旧 `desktop/pick-directory.ts`）；调用点用 `@/constants/platform` 的 `getIsElectron()` 收口，桌面外不暴露「切换目录」按钮（或置 disabled）。若需平台分文件，沿用 `.electron` 文件策略，不在面板里写大 `if (isWeb)` 块。

## 6. 测试策略

**必测纯函数 / store（不渲染即可测）：**

- `resolveTreeRoot`：外部 > 对话 > 桌面信号 三优先级全分支（验收 1/2/14）。
- `tree-reducer`：展开/收起集合幂等、选中单选互斥（点第二个文件前一个失选，验收 3/4）、列目录结果折进缓存、节点级 loading/error 标记。
- `search-state`：态机全路径（idle→searching→results/empty/error→cleared，验收 8）；高亮 range 计算（验收 5）；能力门判定（`fsSearch` 缺失 → **两模式**都走错误态、不发 RPC，验收 6 反向）。按名匹配移到服务端——store 层测「name 查询经 debounce 发 `fs.search`（mode:"name"），命中含**未展开层**路径」（验收 5，修订 2026-07-07）。
- store 切目录流：`pickDirectory` 返回 null → 根不变（验收 11）；返回路径但列举失败 → error 态保留原可用能力（验收 12）；`showDirectory` 重置展开/选中/搜索（验收 10/14）。
- 面板态派生：offline / empty / loading / error 选择正确，每态出口动作存在（验收 16/17）。
- `deriveContextMenuItems`：三套（blank/dir/file）可见项如实（验收 13a–13d）；条件禁用——`paste` 无剪贴板灰、`reveal-in-finder` 非桌面灰、`add-to-chat` 无对话灰、写五项 `fsWrite` 缺灰（验收 13e/13f/13l + 反向能力门）。
- `clipboard-state`：set-cut/set-copy/clear 转移；`paste` 后 cut 清剪贴板、copy 留剪贴板（验收 13g/13h）。
- `validateInlineName`：empty/duplicate/invalid-chars/reserved 全分支 + 合法路径（验收 13i/13j 内联新建/重命名重名非法名）。
- **内联态机（store action 层，董事长点名必测）**——覆盖 §3 第 10 条全部出口：
  - **自动聚焦标记**：`beginNew`/`beginRename` 后 `editing` 态正确（新建空 draft + parentPath；重命名 draftName=原名 + targetPath + originalName）；聚焦本身是视图副作用，测「态足以驱动聚焦」（`editing != null` 且行可识别）。
  - **新建 · 合法名提交**：合法名 `commitEdit` → 调 `fs.create`/`fs.mkdir` + 清 editing；new-file 成功触发 `openFileInRightTab`、new-folder **不**触发。
  - **新建 · 空名 blur 丢弃**（董事长明确场景）：`draftName==""` 时 blur/Esc/点空白 → `cancelEdit`，**不调任何 RPC、editing 清空、磁盘无副作用**（断言 `fs.create`/`fs.mkdir` 零调用）。
  - **新建 · 合法名 blur 提交**：blur 且名字合法 → 等同回车提交（调建 RPC）。
  - **新建 · 非法/重名出口**：回车非法 → 丢弃占位行（new）；blur 非法/重名 → 丢弃（不静默创建错误名/重名，断言无 RPC）；**统一规则「blur 合法才提交，否则丢弃」**全分支。
  - **重命名 · 还原语义**：空名/非法/重名/Esc/点空白 → `cancelEdit` **还原 originalName**（断言无 `fs.rename`、行恢复原名）；合法且≠原名 blur/回车 → `fs.rename`；名字==原名 → 还原不发 RPC。
- 五个写 RPC 流（store action 层）：`fs.create/mkdir/rename/move/copy` 各——成功后重列受影响目录、失败落错误态、move/copy 与剪贴板态联动正确（验收 13g/13h/13i/13j）。
- `composer-bridge`：文件 → file 附件、目录 → 路径文本注入、无 draft 时 `addToChat` 不触发（验收 13m）。
- **`right-tab-bridge`（联动2 本里程碑）**：`openFileInRightTab` → persistenceKey 由 `buildWorkspaceTabPersistenceKey` 合成正确、调 `openTabFocused`（传 file target）+ `openRight`；**同路径二次调用不重复建 tab**（去重既有，断言 tab 数不增）；**无 workspaceId/persistenceKey 时降级**——不调开 tab、不抛错（见 §7，仅创建不开 tab）。**新建文件成功才触发、新建文件夹不触发**（接 §3 第 8 条）。
- 路径复制：绝对/相对（相对树根）字符串构造正确（验收 13k）。

**端到端验证点（对应 §6 验收）：** 展开落默认根双来源（1/2）、逐层展开+图标两态（3/13）、单选高亮（4）、按名/按内容搜索+高亮+定位（5/6/7）、搜索态机+清空退出（8）、切目录三分叉（9/10/11/12）、四非常规态有出口（16/17）。图标覆盖（13）靠**拷贝进本目录 `icons/material-file-icons.ts`** 的图标映射既有覆盖保证（§4.B，拷贝不重造）。

## 7. 风险与取舍

- **内容搜索新 RPC 性能**：大目录 ripgrep 可能慢/海量命中。取舍：响应带 `limit` + `truncated`，主机侧 ripgrep 自带 ignore 规则限制范围；搜索态机有明确 searching 态，UI 不阻塞。不在本需求做分页/流式（YAGNI，先 limit 截断）。
- **桌面 only 与 web 的关系**：目录选择器是 Electron 专属，浏览器 web 无系统目录选择器。本需求整体桌面 only，web 紧凑态 deferred，不为 web 造降级选目录路径。
- **公共 API 过度设计风险**：`FileTreeController` 只留 `showDirectory` + 两个只读派生，**不**预造对话侧事件/订阅/多根管理。对话侧触发交互属后续需求，现在造就是为不存在的需求买单（零复杂度预算）。
- **新 store vs 复用旧 explorer 态**：选新建独立 store，承担「与旧 explorer 逻辑有重叠」的表面重复风险；但旧态字段冗余（history/preview/download），复用即把无关耦合带进来——重写更干净，符合「重构而非打补丁」。重叠的是纯逻辑思路，不是可共享的运行时态。

### 7.1 实现教训（gate-3 实测暴露的平台事实，2026-07-07 评审补记）

以下为落地过程中实测发现并已修复的跨切面事实，代码内均有 WHY 注释，此处上抬留档：

1. **RN-web 合成按压在高频 toggle 上不可靠** → web 端工具栏钮改绑**原生 DOM click**（`components/use-web-dom-click.ts`）：真实鼠标探针数据 32/32 次原生 click 全到达，而 Pressable 管线丢约一半（每次 toggle 重渲染作废在途按压会话、吞掉下一击）。原生 click 不受 React 重渲染影响，且天然覆盖键盘激活（Enter/Space 合成 click）。native 平台仍走 Pressable onPress。
2. **JS hover（pointerenter）会漏帧**（渐进结果流下行在光标下重排、portal 开合时）→ 行 hover 的**唯一上色路径 = web CSS `:hover`**（`util/row-hover-css.ts`，注入规则随主题参数化重着色；高亮行摘除 data 属性以让内联选中色不被争抢）。行组件不再持任何 JS hover 态（评审确认原 JS 分支为死路，已删除并同步删除其虚假测试）。
3. **web `<input>` 有 ~170px 固有最小宽**、flex 压不动 → 搜索输入必须 `minWidth:0`（load-bearing），否则最小面板宽（220）下行超宽 12px，autofocus 的 scrollIntoView 会把 overflow:hidden 卡片横滚（「UI 超出」实测根因）；autofocus 同时带 `preventScroll` 兜底。
4. **tooltip/焦点抢占会吞按压 release** → TreeSearch 的 autofocus 延一帧（rAF），避免开面板的那次点击 release 被取消。
5. **内联输入的 ⌘C/⌘V 曾被行级键处理吞** → 只截获**裸 Escape**（`isModifiedEditorKey` 门，tokens.ts）。
6. **原生 web 滚动条是粗 gutter**（gate-3）→ 树列表与搜索结果列表换共享地基 `@/components/use-web-scrollbar` 细 overlay（§9① 已登记）。
7. **`syncConversationRoot` 活体跟随**：面板挂载后随 live 对话根重挂根（store `syncConversationRoot`）；**offline 由视图层合成**（`file-tree-panel.tsx` 把 runtime 连接态作为 React prop 合入 panelState）——运行时连接非 MobX 可观测，做成 store computed 会 stale，实现刻意如此。
8. **能力旗双保险的落点在旧模块** `contexts/session-context.tsx`（读缓存 + 订阅 status），属旧壳自身修复，不入本目录接缝账。

目录结构补记：`components/tokens.ts` 为双角色文件（设计常量 + 相邻视图纯决策 `isRowHighlighted`/`isModifiedEditorKey`，测试在 `tokens.test.ts`）；`components/inline-exit.ts`、`components/use-web-dom-click.ts` 同属「视图侧纯决策/视图基础设施」层——components/ 允许承载此类零渲染但服务视图的模块；`util/` 保持零 React。新建落点决策 `newEntryParentDir` 在 `model/context-menu-items.ts`（含测）。

- **桌面根客户端可见性（已解决，2026-06-30）**：原风险——列目录响应的 `path` 是 root-relative（`"."`）不带绝对根，绝对 copy/reveal 路径若用 `hostRoot`（`"~/Desktop"`，带字面 `~`）会拼出系统解析不了的串。解决——**列目录响应新增可选 `directory.absolutePath`**（服务端回带 `expandUserPath`+`realpath` 归一后的「~」-free 绝对目录路径，后向兼容 optional），store 首次列根捕获为 `absoluteRoot`，`toAbsolute()` 用 `absoluteRoot ?? hostRoot` 作绝对路径基（详见 §3 line 107「实现修正 ②」）。**不在客户端 `os.homedir` 兜底**（主机可能远端，那会取错本机 home）。
- **FS 写操作风险**：写改主机文件系统，不可逆且越权敏感。取舍——写后不做乐观树变更而是重列服务端真相（防漂移）；错误经 RPC 通道落行内/节点态，不静默；`fsWrite` 能力门 + 灰显，老主机不暴露写。move/copy 递归目录的范围与符号链接处理交服务端实现，本边界只定契约。delete 已落地（六项写之一，复用 `fsWrite` 门），服务端显式拒删根防误删整个工作区。
- **删除的破坏性 → 强制确认（2026-06-30）**：delete 不可逆，故菜单「删除」**点了先弹确认**才执行——store `requestDelete(path)` 经注入的 `confirmDestructive` 端口（impl 在第 3 接缝 wiring，调共享 `@/utils/confirm-dialog`，跨平台 native Alert / desktop dialog / web confirm，`destructive:true`，目录额外提示「及其全部内容」）；用户取消则不发任何 RPC；确认后才调 `deleteEntry`。确认决策**在 store（model-driven）**，组件只 dispatch `requestDelete`、不含确认分支。菜单项 `destructive:true`（仅 delete）。`deleteEntry` 成功重列父目录、失败落节点错误态（与其余写一致）。
- **跨模块 composer 耦合**：「加入聊天」是目录树→对话模块的跨边界调用。取舍——所有 composer 接线收口在唯一 `composer-bridge.ts`，菜单/store 不直接 import composer 内部；目录树只产出「路径 + 类型」，bridge 负责翻译。若 composer hook 形态变，改面收敛在一处。
- **目录引用 kind 不确定性**：对话侧无目录引用附件 kind，本需求以「目录路径文本注入」最小表达（见 §4 结论），不新造协议级 kind。风险——文本注入语义弱于结构化附件（对话侧无法把它当可点开的目录引用）。取舍：避免为未定义的对话侧消费语义提前改全链路协议（零复杂度预算）；待对话侧确有结构化需求再单开需求定义双向契约。bridge 的 `addPathToChat(path, kind)` 已为将来切换到结构化目录 kind 留了收口点（只改 bridge，不改菜单）。
- **联动2 分期耦合**：完整链路「新建文件 → 开右栏 tab → 编辑 → 保存」跨两个里程碑。风险——本里程碑只接到「开 tab + 只读展示」，用户新建文件后看到的是只读视图，**无法立即编辑内容**（编辑 UI 属右栏里程碑）。取舍：本里程碑交付「新建即在右栏可见」已是完整可用的最小价值（用户能确认文件建成并查看），编辑能力随右栏里程碑补齐；契约（`right-tab-bridge` 接口 + `file.write` RPC + `fsEdit` 门）已在本架构定清，两里程碑接口稳定，编辑里程碑只增右栏组件 + 写 RPC，不回改目录树。**不**为「现在就能编辑」在目录树里抢造编辑器（越界 + 零复杂度预算）。
- **编辑器归属与边界**：可编辑文件视图明确归右栏（取代/包装只读 `FilePane`），目录树**不持有、不感知**编辑态。风险——若未来有人想在目录树内联编辑文件内容，会诱使把编辑器塞进目录树。取舍：守住「目录树 = 文件结构视图（定位/选中/树写操作），右栏 = 文件内容视图（查看/编辑/保存）」的边界；内容编辑一律走右栏 tab，目录树只经 `right-tab-bridge` 把 tab 指过去。
- **自动开 tab 的工作区上下文依赖（降级）**：`openFileInRightTab` 需 `serverId + workspaceId` 合成 persistenceKey。盘点指出 shell 当前 `workspaceKey` 为占位 `${serverId}:__home__`，真实工作区身份后续里程碑接入。风险——**无活跃 workspace / 拿不到有效 workspaceId（或 persistenceKey）时无法开 tab**。降级（明确）：`right-tab-bridge.openFileInRightTab` 在 workspaceId 缺失/无效时**静默跳过开 tab（不抛错、不阻断）**，文件**照常创建成功并刷新到树上**——即「无法开 tab 则仅创建不开 tab」，绝不因开不了 tab 而让新建失败或报错。这条降级与 sFT8 新建流的成功语义一致（新建的成功判据是文件建成 + 树刷新，开 tab 是增益不是前置）。必测（§6 已列）。

## 8. 模型清单 + 对外 API 总表

> 本需求涉及的**每个模型**逐个列清其**完整对外 API 面**，作为可直接对照实现的契约表。命名为 HOW 边界的建议名，签名是契约（不写实现体）。模型分两类：**状态模型**（`file-tree-store`，class + MobX，持态）与**纯逻辑/适配模型**（其余，无运行时态或仅适配）。

### 8.1 `file-tree-store.ts` — 目录树内容唯一真相源（class + MobX，对齐 `ShellModel` 风格）

> 唯一持态者。状态/派生/转移全在此；几何/校验/态机判定外包给纯函数（store 调纯函数，不内联逻辑）。store 不 import React。下表 observable/computed/action **一项不漏**。

**状态字段（`@observable` / `makeAutoObservable` 收纳）：**

| 字段 : 类型                                                                                                                                     | 契约（一句）                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rootPath: string \| null`（getter，读出 = `hostRoot`）                                                                                         | 当前树根（主机 RPC 的 cwd，「~」相对/绝对均可）；null = 尚未定根。                                                                                                     |
| `absoluteRoot: string \| null`                                                                                                                  | 主机归一的「~」-free 绝对根，首次列根从 `listing.absolutePath` 捕获（旧 daemon 缺则 null）；`toAbsolute` 优先用它作绝对 copy/reveal 路径基（§3 line 107 实现修正 ②）。 |
| `rootSource: "external" \| "conversation" \| "desktop" \| null`                                                                                 | 当前根的来源标记，供调试/优先级判定；由 `resolve-root` 决策回填。                                                                                                      |
| `expanded: Set<string>`                                                                                                                         | 已展开目录的路径集合（展开/收起的真相）。                                                                                                                              |
| `selectedPath: string \| null`                                                                                                                  | 当前选中条目路径（单选）；null = 无选中。                                                                                                                              |
| `dirCache: Map<string, TreeEntry[]>`                                                                                                            | 已列目录缓存（路径 → 该目录条目）；`TreeEntry` = 新目录自有条目类型 / `@getpaseo/client` 列目录响应 payload 类型，**不引旧 `ExplorerEntry`**（§4.B）。                 |
| `nodeLoading: Set<string>`                                                                                                                      | 正在列取子层的节点路径集合（节点级加载态）。                                                                                                                           |
| `nodeError: Map<string, string>`                                                                                                                | 节点级错误（路径 → 错误信息）；列子层失败落此。                                                                                                                        |
| `search: { mode: "name" \| "content"; query: string; results: SearchMatch[]; phase: "idle" \| "searching" \| "results" \| "empty" \| "error" }` | 搜索态聚合；态机推进走 `search-state.ts`，结果项 shape 见 §5 `fs.search` 响应。                                                                                        |
| `clipboard: { mode: "cut" \| "copy"; path: string } \| null`                                                                                    | 剪贴板态（纯前端、不持久化）；转移走 `clipboard-state.ts`。                                                                                                            |
| `editing: …`（见 §2 完整 shape）                                                                                                                | 内联新建/重命名态（含 `kind`/`parentPath`/`targetPath`/`originalName`/`draftName`/`error`）；null = 无内联编辑。态机见 §3 第 10 条。                                   |
| `contextMenu: { target: { kind: "blank" \| "dir" \| "file"; path?: string }; anchor: { x: number; y: number } } \| null`                        | 当前打开的右键菜单目标 + 锚点；null = 无菜单。菜单项列表不入态（selector 现算）。                                                                                      |
| `panelStatus: "online" \| "offline"` 或读自数据层连接态                                                                                         | 主机连接态来源（驱动 `panelState` 的 offline 分支）；若既有连接态可读则 store 不复制，直接在 `panelState` getter 里读。                                                |

**派生（`@computed` / getter，零冗余态）：**

| 派生 : 类型                                                           | 契约（一句）                                                                                                                                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visibleNodes: TreeNodeView[]`                                        | 当前应渲染的扁平节点列表（按展开集合 + 缩进层级 + 排序展开 `dirCache`，不做隐藏文件过滤（董事长 2026-06-30 决定：全部显示，含点文件））；含内联占位行（`editing` 为 new 时）。UI 直接遍历渲染。 |
| `panelState: "loading" \| "empty" \| "error" \| "offline" \| "ready"` | 面板级态（sFT6）单一派生：offline（主机断）> error（根列举失败）> loading（根未列/列取中）> empty（根空目录）> ready；组件按此 switch，**不在组件 if**。                                        |
| `searchResultsView: SearchMatch[]`                                    | 当前搜索结果（`search.phase==="results"` 时非空），供搜索结果列表渲染 + 高亮 range。                                                                                                            |
| `pasteEnabled: boolean`                                               | 粘贴是否可用 = `clipboard != null`（喂给菜单 selector 的 `hasClipboard`）。                                                                                                                     |
| `currentSiblings: ReadonlyArray<{ name: string }>`                    | 内联编辑目标目录的同级条目（供 `validateInlineName` 重名判定）；据 `editing.parentPath`/`targetPath` 的父目录从 `dirCache` 取。                                                                 |

**动作（`@action`，逐个签名 + 一句契约 — 一个不漏）：**

| 动作签名                                                                                    | 契约（一句）                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ensureRoot(ctx: { externalRoot: string \| null; conversationRoot: string \| null }): void` | 入口：调 `resolveTreeRoot` 定根（外部>对话>桌面），定根后列首层渲染 sFT1；已定根则幂等不重列。                                                                                |
| `showDirectory(rootPath: string): void`                                                     | 公共面入口（§8.2）：以传入目录为根**重置**树（清 expanded/selected/search/clipboard/editing + 列首层）。外部喂根唯一入口。                                                    |
| `toggleExpand(path: string): void`                                                          | 展开/收起目录：未缓存则标 `nodeLoading` + 经 `data/` 层 `listDirectory`（直连 `@getpaseo/client`）折进 `dirCache`，更新 `expanded`（reducer 纯函数）。                        |
| `select(path: string): void`                                                                | 选中文件（单选）：更新 `selectedPath`（reducer 互斥）；选中态供右栏文件页签后续消费。                                                                                         |
| `setSearchMode(mode: "name" \| "content"): void`                                            | 切搜索模式；**任一模式**下 `fsSearch` 缺则态机直接走 error（`errorKind:"unsupported"`，按模式提示升级主机）。〔修订 2026-07-07〕                                              |
| `setQuery(query: string): void`                                                             | 设搜索串并推进态机：**name 与 content 都经共用 debounce 发 `fs.search` RPC**（服务端全根递归，覆盖未展开层）；空串回 idle。〔修订 2026-07-07：原「name 走客户端过滤」已废弃〕 |
| `clearSearch(): void`                                                                       | 清空搜索退出：`search` 回 idle 态，回到普通树（sFT4/5 出口）。                                                                                                                |
| `revealPath(path: string): void`                                                            | 点搜索结果：在树上展开到该路径并选中（展开祖先链 + select）。                                                                                                                 |
| `pickAndShowDirectory(): Promise<void>`                                                     | 切目录：调本目录 `util/pick-directory.ts` 的 `pickDirectory()`（经平台门走 Electron dialog）；非 null → `showDirectory(picked)`；null → 不动（取消分叉）。                    |
| `retry(): void`                                                                             | 错误/离线态重试：重列当前根或重连后重试（sFT6 出口）。                                                                                                                        |
| `collapseAll(): void`〔2026-07-07〕                                                         | 工具栏「折叠全部」：仅清空 `expanded`（选中/搜索/剪贴板/缓存全保留）——非重根，语义只是折回根首层。                                                                            |
| `refreshTree(): Promise<void>`〔2026-07-07〕                                                | 工具栏「刷新」：重列根 **及全部已展开目录**（retry 只重列根会留 stale 展开层），随后重跑活跃搜索（新鲜度契约同写操作）。                                                      |
| `toggleSearchPanel(): void`〔补记〕                                                         | 工具栏搜索钮开合搜索面（关闭时 `clearSearch` + 清 content 范围）；面板唯一开合入口（Esc 不再关闭，见 §5 裁决）。                                                              |
| `syncConversationRoot(root: string \| null): Promise<void>`〔补记〕                         | 面板挂载层喂入 live 对话根：desktop 兜底根在对话根出现时切换过去；外部显式根优先不被覆盖。                                                                                    |
| `rerunActiveSearch()`（私有）〔2026-07-07〕                                                 | 写操作/刷新成功后的新鲜度钩子：搜索开启且有 query 时经共用 debounce 重跑（无索引架构下「重跑即新鲜」，未来文件编辑保存路径复用同一钩子）。                                    |

**状态字段补记〔2026-07-07〕：** `searchOpen`（搜索面开合）、`searchInFlight`（RPC 在途——渐进流首批到达后 phase 已是 results，计数行的「· 搜索中…」尾缀靠它）、`contentSearchBasePath`（find-in-files 范围，仅 content 模式携带）、`search.errorKind`（`"unsupported"|"failed"` 错误分因）。**panelState 更正**：offline **不是** store computed 的一部分——运行时连接态非 MobX 可观测，computed 会 stale；由挂载层把 `isOffline` 作为 React prop 合成（`file-tree-panel.tsx`），store 的 `panelState` 只派生 loading/empty/error/ready。
| `openContextMenu(target: { kind: "blank" \| "dir" \| "file"; path?: string }, anchor: { x: number; y: number }): void` | 右键唤起：置 `contextMenu`；菜单项由 selector 现算（不入态）。 |
| `closeContextMenu(): void` | 关菜单：清 `contextMenu`（点项/点外/Esc 出口）。 |
| `cut(path: string): void` | 剪切：`clipboard = {mode:"cut", path}`（走 `clipboard-state` 转移）。 |
| `copy(path: string): void` | 复制：`clipboard = {mode:"copy", path}`。 |
| `paste(targetDir: string): Promise<void>` | 粘贴：经 `data/` 层据 `clipboard.mode` 调 `fs.move`（cut，成功清剪贴板）/`fs.copy`（copy，留剪贴板）→ 重列 `targetDir`（`data/` 层 `listDirectory`）。 |
| `requestDelete(path: string): Promise<void>` | 删除入口（破坏性，先确认）：经注入 `confirmDestructive` 端口弹确认（名+kind，目录提示「及其全部内容」）；取消则不发 RPC；确认后调 `deleteEntry`。确认决策在 store，组件只 dispatch。 |
| `deleteEntry(path: string): Promise<void>` | 删除执行：经 `data/` 层调 `fs.delete`（删文件 / 递归删目录）→ 成功重列父目录、失败落节点错误态（与其余写一致，不做乐观树变更）。 |
| `beginNew(kind: "new-file" \| "new-folder", parentPath: string): void` | 内联新建：插占位行 + 置 `editing`（draft 空、磁盘无文件、不发 RPC）+ 触发自动聚焦（§3 第 10 条）。 |
| `beginRename(path: string): void` | 内联重命名：原行变输入框 + 置 `editing`（draftName=原名）+ 自动聚焦（主名选中）。 |
| `setDraftName(name: string): void` | 内联输入：更新 `editing.draftName` + 调 `validateInlineName` 回填 `editing.error`。 |
| `commitEdit(): Promise<void>` | 内联提交（合法名才进）：经 `data/` 层新建调 `fs.create`/`fs.mkdir`、重命名调 `fs.rename`；成功清 editing + 重列；new-file 成功触发 `openFileInRightTab`（§3 第 10/12 条）。 |
| `cancelEdit(): void` | 内联取消：新建丢弃占位行（不创建）、重命名还原原名（§3 第 10 条 blur/Esc 出口统一汇入此）。 |
| `addToChat(path: string, kind: "file" \| "directory"): void` | 加入聊天：经 `composer-bridge.addPathToChat`（文件走附件、目录走文本）；无 draft 时 selector 已 disable，不达此。 |
| `revealInFinder(path: string): void` | 在 Finder 显示：经 reveal 桥（`getIsElectron()` 门）；非桌面 selector 已 disable。**绝对路径基用 `absoluteRoot`（主机归一的「~」-free 绝对根，缺则回退 `hostRoot`），不直拼字面 `~`**（§3 line 107 实现修正 ②）。 |
| `findInFiles(path: string): void` | 在文件中查找：切 content 搜索 + 设 scope=该文件/目录（接 `fs.search`，sFT5）。 |
| `copyPath(path: string, relative: boolean): void` | 复制路径：绝对（`util/tree-paths.ts` 的 `buildAbsoluteTreePath`，基用 `absoluteRoot ?? hostRoot`——「~」-free 绝对根，§3 line 107 实现修正 ②）/相对（相对树根原样）写剪贴板（`util/clipboard.ts` 的 `copyTextToClipboard`，直连 `expo-clipboard`）。 |
| `openInRightTab(path: string): void` | 在右栏 tab 打开文件：经 `right-tab-bridge.openFileInRightTab`（联动2 触发点；内部由 `commitEdit` 新建文件成功后调，亦可供 `select` 后续扩展，本里程碑仅新建触发）。 |

> 注：store 是 `FileTreeController`（§8.2）的实现体——对外只暴露收窄只读+单动作视图，内部态机不外泄。

### 8.2 `file-tree-public.ts` — 对外公共能力面（`FileTreeController`）

- **职责**：硬性需求 5 的唯一对外复用面；把 store 收窄为「喂目录根 → 展示 + 读当前根/选中」的只读+单动作视图，避免外部碰内部态机。
- **导出接口 shape**（已在 §3 给出，复述定位）：
  ```
  interface FileTreeController {
    showDirectory(rootPath: string): void;   // 外部喂根 → 以该目录为根重置展示
    readonly rootPath: string | null;        // 当前根（只读派生）
    readonly selectedPath: string | null;    // 当前选中（只读派生，供右栏文件页签后续消费）
  }
  ```
- **YAGNI**：只留这一面；不预造对话侧触发器/事件总线/订阅/多根管理。

### 8.3 `resolve-root.ts` — 默认根解析（纯函数）

- **职责**：决定树根来源优先级（外部 > 对话工作目录 > 桌面信号），不渲染、可测。
- **导出（已在 §3 给出，复述）**：
  ```
  type RootResolution = { kind: "path"; path: string } | { kind: "needDesktop" };
  resolveTreeRoot(input: { externalRoot: string | null; conversationRoot: string | null }): RootResolution
  ```

### 8.4 `tree-reducer.ts` — 树结构纯函数集

- **职责**：展开/选中集合 reducer + 列目录结果折进节点模型 + 节点级 loading/error 标记，全纯函数。
- **导出（HOW 边界建议签名）**：
  ```
  toggleExpandedPath(expanded: ReadonlySet<string>, path: string): Set<string>           // 展开/收起幂等切换
  selectPath(current: string | null, path: string): string | null                        // 单选互斥
  foldDirectoryListing(cache: ReadonlyMap<string, TreeEntry[]>, dir: string, entries: TreeEntry[]): Map<string, TreeEntry[]>  // 列目录结果折进缓存
  buildVisibleNodes(input: { rootPath: string; expanded: ReadonlySet<string>; cache: ReadonlyMap<string, TreeEntry[]>; editing: … }): TreeNodeView[]  // 扁平可见节点（含缩进层级 + 内联占位）
  ```
  （`TreeEntry` = 新目录自有条目类型 / `@getpaseo/client` 列目录响应 payload 类型，**不引旧 `ExplorerEntry`**，§4.B。）
  （`TreeNodeView` = 渲染用节点投影：`{ path; name; kind; depth; isExpanded; isLoading; isError; isSelected; isDraft }`，纯派生 shape。）

### 8.5 `search-state.ts` — 搜索态机纯函数集

- **职责**：搜索态机推进 + 高亮 range 计算 + 搜索能力门判定（两模式共用），全纯函数。〔修订 2026-07-07：`filterByName` 已删——按名匹配移到服务端 `fs.search` name 模式（见 §5 修订）；两模式共用一条 debounce→RPC 通路。〕
- **导出（HOW 边界建议签名）**：
  ```
  advanceSearch(current: SearchState, event: SearchEvent): SearchState                    // 态机：idle→searching→results/empty/error→cleared
  computeHighlightRanges(text: string, query: string): Array<{ start: number; end: number }>  // 命中高亮 range
  isSearchAvailable(features: { fsSearch?: boolean }): boolean                            // 搜索能力门（name + content 两模式共用）
  ```
  （`SearchMatch` 对齐 §5 `fs.search` 响应项：`{ path; kind: "file"|"directory"; line?; preview?; ranges? }`。）

### 8.6 `context-menu-items.ts` — 右键菜单 selector（纯函数）

- **职责**：按右键目标类型 + 剪贴板态 + 平台 + 有无活跃对话 + 写能力门，现算「可见+启用」菜单项列表，零渲染、可测。不入 store。
- **导出（已在 §3 给出，复述）**：`ContextMenuItem` shape + `deriveContextMenuItems(input)` —— 入参 `{ target, hasClipboard, isElectron, hasActiveDraft, fsWriteAvailable }`，出 `ContextMenuItem[]`。

### 8.7 `inline-edit.ts` — 内联名校验（纯函数）

- **职责**：内联新建/重命名的名字合法性 + 重名校验，纯函数。
- **导出（已在 §3 给出，复述）**：`InlineNameError` 联合 + `validateInlineName({ name, siblings, kind })` → `{ ok: true } | { ok: false; error }`。

### 8.8 `clipboard-state.ts` — 剪贴板态转移（纯函数）

- **职责**：剪贴板态转移（set-cut/set-copy/clear）+ 粘贴可用判定，纯函数（store 持态，转移逻辑纯）。
- **导出（HOW 边界建议签名）**：
  ```
  setCut(path: string): Clipboard                                  // → {mode:"cut", path}
  setCopy(path: string): Clipboard                                 // → {mode:"copy", path}
  clearClipboard(): null                                           // 清空
  afterPaste(clipboard: Clipboard): Clipboard | null               // cut→清空、copy→保留
  canPaste(clipboard: Clipboard | null): boolean                   // = clipboard != null
  ```
  （`Clipboard = { mode: "cut" | "copy"; path: string }`。）

### 8.9 `composer-bridge.ts` — 加入聊天适配层（跨模块 · 唯一接缝之一）

- **职责**：目录树→对话 composer 的唯一接线点。**Plan A（董事长裁决 2026-06-30）：文件与目录都把绝对路径追加注入当前对话草稿**（经老 `useDraftStore.getState()`，不覆盖已有文本/附件），不走 `{kind:"file"}` 附件（主机文件无本地字节，见 §3 第 11 条 / §4 结论）。**实现切两半**：纯工厂 `composer-bridge.ts`（零旧 import，单测它）＋ `composer-bridge.wiring.ts`（唯一 import 老 `stores/draft-store`，运行时壳子加载、单测不加载）。**standards §8 仅有的两个触老功能模块的隔离适配接缝之一**（另一是 §8.10）；登记见 §9，待结构化主机文件→附件能力落地后只改本桥。
- **导出接口 shape**：
  ```
  interface ComposerBridge {
    // 把路径加入当前对话 composer：file 与 directory 都把绝对路径追加注入草稿正文（Plan A，经 useDraftStore；不走附件，见 §3.11/§4 结论）。
    addPathToChat(input: { path: string; kind: "file" | "directory"; draftKey: string }): void;
  }
  ```
  （无 `draftKey`/无活跃对话时由菜单 selector 先 disable，bridge 不被调用。结构化目录 kind 留此收口点。）

### 8.10 `right-tab-bridge.ts` — 新建文件开右栏 tab 适配层（跨模块 · 联动2 本里程碑 · 唯一接缝之二）

- **职责**：目录树→老工作区 layout 的唯一接线点；新建文件成功后在右栏 tab 打开该文件。**仅文件**触发，新建文件夹不触发。去重交既有 `applyEnsureTab`，不自造。非纯函数（调老 layout store + 新壳子 shell），收口一处。**standards §8 仅有的两个触老功能模块的隔离适配文件之二**；登记见 §9，待老 workspace 重写进新目录后只改本桥（其中 shell `openRight()` 属新壳子自己，不算接缝）。
- **导出接口 shape**（详见 §3 联动2 节）：
  ```
  interface RightTabBridge {
    // 在右栏以 tab 打开文件并聚焦；右栏未开则先开。workspaceId 缺失/无效 → 静默跳过（仅创建不开 tab，不抛错，见 §7 降级）。
    openFileInRightTab(input: { location: WorkspaceFileLocation; workspaceId: string; serverId: string }): void;
  }
  ```
  实现复用 `buildWorkspaceTabPersistenceKey` + `createWorkspaceFileTabTarget` + `openTabFocused` + shell `openRight()`，**禁止重造开 tab/去重/persistenceKey**。

### 8.11 视图组件（无对外 API，仅渲染 store 派生 + dispatch action）

`components/file-tree-panel.tsx` / `tree-node.tsx` / `tree-toolbar.tsx` / `tree-search.tsx` / `tree-states.tsx` / `tree-context-menu.tsx`（observer，§1 已列职责）—— 不对外暴露 API，只消费 §8.1 store 的 computed + 调 action；菜单壳直连**共享地基** `@/components/ui/context-menu.tsx`（§4.A），图标渲染用拷贝进本目录的 `icons/material-file-icons.ts`（文件 SVG，经 `react-native-svg` 的 `SvgXml`）+ lucide 的 `Folder`/`FolderOpen`/`Chevron*`（文件夹/箭头）。判据「不渲染即可测」由 store/纯函数承接，组件无逻辑可单测。

> **实现落地（Phase 2-b · 组件层 + 接壳）：**
>
> - **组件层视图副作用纯函数 `components/inline-exit.ts`（`resolveBlurExit`，TDD 单测 `inline-exit.test.ts`）**：§3 第 10 条「blur/点空白 → 按 `editing.kind` + `error` 映射到 commit/cancel」是视图侧决策（Enter 一律 `commitEdit()`，store 内决定 keep-open vs discard；唯 blur 对 rename-非法须**还原**而非保持，故需此判定）。抽为本目录纯函数（不渲染即可测），组件只调它派发，零校验分支。
> - **平台门薄封装 `util/reveal.ts`（`revealInFinder`，新增）**：经 `@/constants/platform` 门 + preload `paseoDesktop.editor.openTarget({editorId:"finder",path,mode:"reveal"})`，非桌面 no-op，**不 import 老 desktop 模块**（类比 `util/pick-directory.ts`）。store 的 `revealInFinder` action 经此端口写。
> - **组合根 = 第 3 接缝 `data/file-tree-context.wiring.ts`**（登记见 §9 ③）：唯一读老 `runtime/host-runtime`（live `DaemonClient` + 连接态）+ `session-store`（`features`/`projectRootPath`）+ `draft-keys`（draftKey）的点，按 Phase 2-a 接线契约 `new FileTreeStore({...})` 注入 data 层（live client 代理，reconnect 透明）/ 两 bridge / reveal / clipboard / pick-directory / `getContext()`。本里程碑 home 路由无活跃对话 → draftKey=null（加入聊天置灰）、无 workspace → conversationRoot=null（落桌面根），符合 §3/§7 降级。
> - **壳层挂载点 `shell/components/file-tree-region.tsx`（新增，属新壳 `shell/`，非 `shell/file-tree/`，不在硬隔离范围）**：把 `shell-root.tsx` fileTree 区的占位换成真实面板——按 (serverId, workspaceId) memo 一个 store（切 workspace 重建），reactive 订阅 `useHostRuntimeConnectionStatus`（离线）+ `useSessionStore`（conversationRoot）喂给 `<FileTreePanel>`（observer），使连接/根变化触发 React 重渲 → store 的 `panelState` getter 以最新 context 重算。`ShellContext` 增 `serverId?: string|null`（layout 选择器/模型不读，仅挂载点取；`home.tsx` 路由填）。

## 9. 新旧隔离对账（遵循 standards §8）

本需求严格遵守 [standards.md](../../standards.md) §8「新旧目录硬隔离」：`shell/file-tree/**` 是**自包含 clean-room 重写**，与旧 app 代码（`packages/app/src/` 下 `shell/` 以外的功能模块）**零依赖**，使旧目录将来可整体删除。

**① 允许直接 import 清单（共享地基 / 包，非旧目录）：**

| 允许项                                                                               | 用途                                                                               | 落点                                            |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| `@getpaseo/client`（传输层包）                                                       | `listDirectory` / `readFile` + 新增 `fs.*` / `fs.search` / `file.write` 客户端方法 | `data/file-tree-data.ts`（连服务器层）          |
| `@getpaseo/protocol`（协议包）                                                       | RPC schema + `server_info.features.*` 能力门                                       | `data/` + 能力门 selector                       |
| `@/constants/platform`                                                               | `getIsElectron` / `isWeb`（reveal / 选目录 / 桌面 only 门）                        | `util/pick-directory.ts`、reveal 调用点、面板门 |
| `@/components/ui/*`（设计系统原语，含 `context-menu.tsx`）                           | 三套右键菜单浮层                                                                   | `components/tree-context-menu.tsx`              |
| `expo-clipboard` / `react-native-svg` / `react-native` / `expo` / `unistyles` / 主题 | 剪贴板薄封装 / svg 渲染 / UI 框架                                                  | `util/clipboard.ts`、`components/*`             |
| 新壳子 `shell/` 自有（`ShellModel` / `selectors/regions.ts` / shell `openRight()`）  | 壳几何/可见、右区显隐（同在 `shell/` 树下，非旧目录）                              | store / `right-tab-bridge`                      |

**② 新目录重写 / 拷贝清单（旧功能模块，禁止 import 旧实现，§4.B）：**

| 原「复用旧 X」                       | 旧位置                                                                      | 新落点                                  | 方式                                     |
| ------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------- |
| 列目录数据 hook（连服务器）          | `hooks/use-file-explorer-actions.ts` / `session-store`                      | `data/file-tree-data.ts`                | 新目录自建（直连 client 包）             |
| 文件图标映射 `getFileIconSvg`        | `components/material-file-icons.ts`                                         | `icons/material-file-icons.ts`          | 整段拷贝数据                             |
| 路径归一 `buildAbsoluteExplorerPath` | `utils/explorer-paths.ts`（+ `utils/path.ts`）                              | `util/tree-paths.ts`                    | 重写（自包含）                           |
| 剪贴板 `copyToClipboard`             | `utils/copy-to-clipboard.ts`                                                | `util/clipboard.ts`                     | 重写薄封装（直连 expo-clipboard）        |
| 原生选目录 `pickDirectory`           | `desktop/pick-directory.ts`（+ `desktop/host.ts`）                          | `util/pick-directory.ts`                | 重写薄封装（经平台门 + Electron dialog） |
| 条目类型 `ExplorerEntry`             | `stores/session-store.ts`                                                   | `data/` / `tree-reducer` 的 `TreeEntry` | 新目录自有类型（或 client payload 类型） |
| 旧文件树 UI / 旧 hook                | `file-explorer-pane.tsx` / `file-pane.tsx` / `use-file-explorer-actions.ts` | `components/*` + `model/*`              | 全新实现（肉眼参考、零 import）          |

**③ 三个接缝清单（仅有的触老功能模块的隔离适配文件，§4.C）：**

| Bridge / 接缝                                                                                                                                                                                                                            | 触碰的老模块                                                                                                                                                                                                                                                                                                                                                                                          | 暴露动作                                                                                              | 将来切换点                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `model/composer-bridge.ts`（纯工厂，零旧 import）+ `model/composer-bridge.wiring.ts`（唯一 import 老 `stores/draft-store` 的 `useDraftStore`）                                                                                           | 老 composer 草稿（`stores/draft-store` `getDraftInput`/`saveDraftInput`）—— Plan A：文件+目录都追加路径到草稿文本                                                                                                                                                                                                                                                                                     | `addPathToChat({path,kind,draftKey})`                                                                 | 结构化主机文件→附件能力落地后只改本桥（工厂+wiring） |
| `model/right-tab-bridge.ts`（纯工厂，零旧 import）+ `model/right-tab-bridge.wiring.ts`（唯一 import 老 workspace 模块）                                                                                                                  | 老 workspace-layout（`stores/workspace-layout-store.ts` `openTabFocused` + `workspace/file-open` `createWorkspaceFileTabTarget` + `stores/workspace-tabs-store` `buildWorkspaceTabPersistenceKey`）+ 新壳 `shellModel.openRight()`（不算接缝）                                                                                                                                                        | `openFileInRightTab({location, workspaceId, serverId})`                                               | 老 workspace 重写进新目录后只改本桥（工厂+wiring）   |
| `data/file-tree-context.wiring.ts`（组合根 / 第 3 接缝，Phase 2-b 落地）—— 唯一读老 `session-store` + `runtime/host-runtime` + `stores/draft-keys` + `@/utils/confirm-dialog` 取 live `DaemonClient` + 上下文 + 删除确认端口，注入 store | 老 `runtime/host-runtime`（`getHostRuntimeStore`/`isHostRuntimeConnected` 取 live client + 连接态）+ `stores/session-store`（`getSession` 取 `serverInfo.features` / `workspaces[].projectRootPath`）+ `stores/draft-keys`（`buildDraftStoreKey`）+ `@/utils/confirm-dialog`（`confirmDialog`，删除确认，跨平台 native/desktop/web）+ `@/constants/platform`（`getIsElectron`，属允许门，不算老模块） | `createFileTreeStoreForServer(serverId, workspaceId)` / `readConversationRoot(serverId, workspaceId)` | session-store / host-runtime 重写进新壳后只改本文件  |

（注：`right-tab-bridge` 内还调新壳子 shell `openRight()`——属新 `shell/`，**不算接缝**。壳层挂载点 `shell/components/file-tree-region.tsx` 属新壳 `shell/`（非 `shell/file-tree/`），可自由 import 老 `runtime`/`session-store` 做 reactive 订阅，不在硬隔离范围内、不算接缝。）

**验收判据（standards §8 判据）：** 对 `shell/file-tree/**` 跑一次依赖检查（如 `rg 'from "@/' packages/app/src/shell/file-tree` 或等价工具），**除①「允许的共享地基/包」（`@/constants/platform`、`@/components/ui/*`、`@/components/use-web-scrollbar`——web 桌面滚动条 hook，跨切面基础设施、非可删除旧功能模块）与③「已登记的三个接缝」外，不得出现指向 `packages/app/src/`（`shell/` 以外）的 import**。自查结论（评审复核 2026-07-07 订正为实况）：非接缝代码 import 的共享地基 = `@/constants/platform`、`@/components/ui/context-menu`、`@/components/ui/dropdown-menu`、`@/components/ui/tooltip`、`@/components/use-web-scrollbar`；外加 `composer-bridge.ts` 内一处 `import type { DraftInput }`（type-only、编译期擦除、无运行时依赖，工厂头注已标注该让步）。新增任何接缝必须先在本节③登记并注明将来切换点，否则视为违反硬隔离、打回开发。
