# Four-column workbench

Status: first-phase implementation is in the working tree as of 2026-10-09. Wide
web and Electron use the four-column shell; compact and native layouts retain
their existing navigation. Existing conversation, creation, editor, Diff, terminal,
and browser views render inside the new shell. Column 2 holds the focused
conversation and does not split. Further
extraction of inner-view interactions remains a later phase. The performance and
cross-platform acceptance targets below still require measured evidence.

## Ownership

Keep the activity rail outside the four columns. Home and Schedules belong at the
top; Settings belongs at the bottom. Put the host picker in the titlebar. Do not
draw a divider between the rail and navigation.

| Surface                    | Owner                        | Contract                                                                         |
| -------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| Titlebar and activity rail | Workbench model              | Select host and activity; retain Home context when another activity opens.       |
| Column 1: navigation       | Navigation model             | Projects, pinned chats, independent chats, and existing creation flow.           |
| Column 2: conversations    | Conversation model           | The focused conversation only. No tab bar, no close, no split.                   |
| Column 3: content          | Conversation workspace model | Files, Markdown, Diff, browser, and terminal tabs for the focused conversation.  |
| Column 4: files            | Explorer view model          | The focused conversation's directory, selection, expansion, and scroll position. |

The four regions have fixed roles. Resizing changes their geometry; it does not
change panel ownership. Column 2 is one conversation. It does not split, and it
has no tab bar. Cmd+D and Cmd+Shift+D do nothing in column 2; editor and terminal
shortcuts keep their own scope in column 3. A draft stays in column 2 until the
first message creates the conversation, and only then does it appear in the
conversation tree. Closing a conversation happens from the tree, by archive.
Column 3 can collapse or maximize across columns 2–4.
Column 4 can collapse. Restore the previous widths and visibility after leaving
maximized content. Mount one four-column frame in the app shell for Home, Settings,
and Schedules. Pages supply region contents; they do not instantiate layouts.
Switching activity preserves column 1's node, width, visibility, surface, and resize
handle. Settings and Schedules use column 1 for navigation and expand column 2
across the remaining space. Home restores columns 3 and 4 from its preferences.
Region contents keep their route context when rendered in the shell.
Return Home without recreating conversations or drafts.

Use three independent identities:

- Host + conversation ID owns content tabs and explorer view state. Use a stable
  draft identity before submission, then bind the real conversation ID in one
  transaction without discarding its workspace.
- A view ID owns a tab, scroll position, cursor, selection, and preview/edit mode.
  Opening the same resource in two conversations creates two views.
- Host + canonical file identity owns the document buffer and save/conflict state.
  Both views observe the same document model. Never identify a file by basename
  alone or share buffers across hosts.

Workspace directory data and watchers can be shared by conversations in the same
workspace. Explorer selection and expansion cannot. An independent conversation
has no user-visible directory until one is selected. Follow [chats](chats.md) for
private execution backing; it is never a substitute explorer root.

## Models and APIs

A model is a plain TypeScript state owner, not an AI model and not a React
component. Follow the model lifetime and external-input conventions in
[forms](forms.md#the-form-model). Every stateful model exposes a stable read-only
snapshot, a subscription, typed commands, and a disposal operation.

| Model                  | Public commands to establish during extraction                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Workbench              | `selectHost`, `selectActivity`, `restoreHome`, `openResourceFromConversation`                                                          |
| Layout                 | `setViewport`, `beginResize`, `updateResize`, `commitResize`, `cancelResize`, `setRegionVisible`, `setContentMaximized`, `resetLayout` |
| Navigation             | `selectProject`, `openConversation`, `startConversation`, `setFilter`, `setGroupExpanded`                                              |
| Conversation           | `open`, `bindCreatedConversation`                                                                                                      |
| Conversation workspace | `openResource`, `selectContentTab`, `closeContentTab`, `selectDirectory`, `setViewState`                                               |
| Explorer view          | `selectPath`, `setExpanded`, `setScrollPosition`, `openSelectedFile`                                                                   |
| Document               | Reuse the existing editor model's edit, save, reload, and conflict commands.                                                           |
| Settings and schedules | Reuse their existing domain APIs; extract UI-owned transitions at their source.                                                        |
| Interaction            | `openMenu`, `closeMenu`, `setFocusedControl`, `setHoveredControl`, `requestFocus`                                                      |
| Presentation           | `setAppearance`, `setTransparencyPreference`, `setMotionPreference`, `completeTransition`                                              |

These are local typed APIs. A drag update does not issue HTTP or MCP requests.
Network, filesystem, persistence, navigation, and Electron operations belong to
injected service adapters. A future plugin command can call the same model API
without manipulating a component or a DOM node.

Components receive snapshots and command interfaces. Event handlers translate
input into commands. Do not read global stores, call clients or routing APIs,
mutate model snapshots, or sequence business operations in components. Keep
buttons, tab bars, separators, pane shells, and file rows independently usable.
A logical surface gets a model; every icon does not need its own model instance.

Platform adapters translate pointer coordinates, composition events, DOM/RN focus,
layout measurements, and animation completion into the same commands. Their local
refs and animation values implement rendering. They do not own a second selected
conversation, open-tab list, or persistent layout. Keep transient visual interaction
in an interaction model when it needs state.

Construct each model once for its declared lifetime. Async inputs arrive through
explicit commands. Publish one coherent snapshot for a cross-surface transition:
selecting a conversation also selects its content and explorer owners. An outgoing
network result must carry its host and conversation identity; switching focus does
not redirect it into the newly selected conversation.

Commands validate invariants before publishing. Return a typed outcome for
operations that can fail, and expose pending/error state in the owning snapshot.
Use request identities and cancellation for superseded work. A late save, directory
read, route response, or transition completion cannot overwrite newer intent.

Keep state ownership at its source. Extract the current workspace handlers into
these APIs, then delete the UI-owned versions. Do not add another layout store that
mirrors `workspace-layout-store`, or another editor buffer beside `FileEditorModel`.
The coordinator calls child APIs; child models do not import the coordinator or
reach into another model's mutable state.

## Resource opening

The entry point carries the source conversation explicitly. Clicking a file in the
tree opens it in that conversation's column 3. A message link first selects its
source conversation, then opens its content and expands column 3 if needed.
Deduplicate within the conversation's content tabs by resource identity.

Do not use whichever conversation happens to be focused when an async operation
finishes. A file-open operation captures its owner at invocation. Share the document
model beneath the views, including unsaved changes and save conflicts. Closing a
view releases its view state; it does not discard a dirty document or terminate a
terminal or agent. Explicit resource termination remains a separate domain command.
A web page has no view other than its tab, so closing that tab closes the page, as
closing a Chrome tab does.

## 第三栏主页

第三栏第一次打开、关掉最后一个内容页签，以及点「+」或 ⌘T，都会打开「主页」。主页是内容栏里的 `new_tab`（`workbench/content-home.tsx`），和其他新标签页一样不保存：重新加载后，只有空着的第三栏会再出现主页。

在主页上点一项，主页标签就地换成它；用快捷键打开时在旁边新开。「侧边聊天」聚焦对话输入框，「文件」打开第四栏，两者都不替换主页。在第三栏或第四栏按 ⌘L 时，工作区先聚焦当前对话，输入框随对话获得焦点；焦点在浏览器里时除外，⌘L 按 Chrome 的含义聚焦地址栏。

「打开」来自内容栏的启动目录，加上侧边聊天和文件；「插件」列出插件面板，最后一行进入设置里的插件页。主页没有地址栏和搜索框，避免和浏览器混在一起。

「最近」按对话记录第三栏看过的网页、文件和终端（`workbench/content-recents`），主页显示最新 5 条。终端只在标签还开着时列出，关掉后会话已经结束。点一条时，已打开的切过去，关掉的替换主页重新打开。草稿变成对话时，布局把第三栏交给新对话（`reboundConversation`），最近记录跟着迁移。

第三栏标签行里的标签内容在整行高度内居中。横向滚动条覆盖在标签行底边，视觉高度与拖动区域分开，不占用标签布局高度。

## 浏览器标签

每个网页是第三栏的一个标签，和终端、文件标签排在同一行；浏览器没有自己的标签条，切换网页靠第三栏。一个网页是一个 browser：一个 webview，也是 Agent 浏览器工具用的 `browserId`，由 `desktop/browser/store` 保存。所有网页共用一个浏览器配置（Electron 的同一个 session）：登录状态、Cookie、扩展、浏览记录和下载在每个对话的第三栏里都一样。

浏览器照搬 Chrome，不另做设计。尺寸、颜色、动效和交互细节取自 Chromium 源码，出处写在 `desktop/browser/chrome-theme.ts` 等文件的注释里；整体样子见设计稿 `.dev/prototypes/column3-browser/index.html`；要改外观或行为，先查 Chromium 怎么做。内核是 Electron 自带的 Chromium，大版本比 Chrome 落后 0–4 个。Chrome 专有的 Google 同步、密码管理、翻译、安全浏览和 Widevine 这里没有。Helm 给 Agent 用的网页工具（选取元素、元素截图、设备尺寸）收在工具栏的一个按钮里，和 Chrome 的扩展按钮一样摆放。

Chrome 里新开标签的地方，在这里都新开第三栏标签，都走 `desktop/browser/workspace-browsers.ts`。主页的「浏览器」、⇧⌘B、「最近」里的网页、Agent 和插件，在第三栏新开一个网页标签。网页里的链接、⌘T、⋮ 菜单的「打开新的标签页」、扩展的 `chrome.tabs.create` 和 ⇧⌘T，新标签紧跟在来源网页的标签后面。⌘点击、中键点击和「在新标签页中打开链接」开在后台，不切过去，和 Chrome 一样（主进程把 Chromium 给的 disposition 随请求带过来）。带窗口尺寸的 `window.open`（OAuth、支付）仍是单独的小窗口，因为它要保留 `window.opener`。网页只在有标签显示它时存在：不管标签以哪种方式关掉，`useBrowserPageLifetime` 都会释放它，并把它记进「最近关闭」，供 ⇧⌘T 和 ⋮ 菜单的历史记录重新打开。这个列表跨对话共用，和 Chrome 按配置记录一样。2026-10 开发版本按「窗口」保存的浏览器标签，加载时丢弃，浏览记录保留。

焦点在浏览器里（网页、工具栏、地址栏）时，Chrome 的快捷键按 Chrome 的含义执行：⌘T 在右边新开网页，⇧⌘T 重新打开关闭的网页；⌘1–⌘9、⌃Tab、⌥⌘←/→ 和 ⇧⌘[/⇧⌘] 在第三栏的标签之间切换，⌘W 关闭当前第三栏标签；⌘L 聚焦地址栏，⌘[/⌘] 后退和前进，⌘F、⌘P、⌘+/⌘−/⌘0 和 ⌥⌘I 作用于当前网页，⇧⌘M 打开个人资料菜单。这些快捷键是带 `browserFocus` 条件的绑定，排在工作区绑定前面；焦点在别处时同样的键仍按 Helm 的含义执行。网页里按下的键先交给网页，网页不处理才走这套绑定，所以网页里的编辑器仍能用 ⌘[ 缩进；⌘L 和 ⌘R 例外，由主进程直接交给浏览器（见 [architecture.md](architecture.md) 的「Browser keyboard boundary」）。

新标签页和 Chrome 一样：装了覆盖新标签页的扩展（如 iTab）时打开扩展的页面，否则显示 Helm 的起始页，标签标题是「新标签页」。两种情况下地址栏都留空，不显示内部的 `paseo://start` 或扩展页面的地址。⌘T、第三栏标签菜单的「在右侧新增标签页」等不带网址新开的网页，光标直接落在地址栏。第三栏网页标签的右键菜单在通用项前面加上 Chrome 标签菜单的「在右侧新增标签页」「重新加载」「复制」。

地址栏按 Chrome 的规则显示网址（`desktop/browser/address-display.ts`）：未编辑时省略协议和 `www.`，突出主机名；聚焦时全选完整网址，并在下方显示建议。输入按标题和网址筛选建议，方向键选择、回车打开，Escape 撤销编辑并恢复当前网址。空地址提交不改变已打开的网页。

起始页的「推荐」与地址建议读取同一份客户端浏览记录。记录跨标签共享并保存在本地；关闭标签不删除记录。没有记录时不显示推荐或历史下拉。

`desktop/browser/start-page.ts` 拥有导航、地址编辑和建议选择状态；组件渲染快照并派发命令。`desktop/browser/store` 拥有浏览记录，导航提交后才记录访问，标题和图标随后更新；哪些地址算作网页由 `browserPage` 决定，浏览记录和第三栏「最近」共用它。面板不另存一份历史。

起始页不创建 webview。提交地址后才挂载 Electron 浏览器，用当前提交的网址初始化；标签切换复用常驻视图。普通网页版不支持内嵌网页，提交网址时显示「浏览器仅桌面可用」。

Helm 自己的页面像 chrome:// 页面一样画在标签里（`desktop/browser/internal-pages.ts`：`paseo://extensions`、`paseo://downloads`、`paseo://settings`），控件照搬 Chrome WebUI 的 cr-toolbar、cr-drawer、cr-dialog 等（`desktop/browser/webui`）。打开这类页面按 Chrome 的单例规则：同一个第三栏里已有标签在显示它就切过去并换到要的地址，当前是新标签页就在原地打开，否则新开一个标签。换地址走 `requestBrowserNavigation`，由那个网页自己导航，它的地址栏才会跟着变；别的标签不要直接改它的记录。

### 设置

`paseo://settings` 照 chrome://settings 做，只放这个浏览器真有的功能（`desktop/browser/chrome-settings`）：我与 Google 里的个人资料和「导入书签和设置」，隐私与安全里的「删除浏览数据」，外观里的自定义工具栏、“主页”按钮及其网址、侧边栏位置，搜索引擎，下载内容，重置设置，关于。分区、子页和对话框都是路由（`routes.ts`）：`/manageProfile` 子页替换所属分区显示，`/clearBrowserData`、`/resetProfileSettings`、`/importData` 在所属分区上打开对话框；⋮ 菜单的「导入书签和设置」也是打开 `/importData`。标签标题按 Chrome 的规则是「设置」、「设置 - 分区名」或「设置 - 子页名」（`titles.ts`）。设置搜索在所有分区里找，命中处黄色高亮，找不到时显示「未找到任何搜索结果」；页面窄到 980 以下时左侧菜单收进抽屉。键盘焦点按 Chrome 的设置页走：从分区进子页时焦点落在返回按钮，返回时落回打开它的「自定义个人资料」；链接行整行可点，但只有行尾的按钮接收焦点，回车打开。

个人资料只有一份本地的（`desktop/browser/profile`）：名称和头像存在 `store.ts`，头像是 Chrome 的 29 个默认头像加占位头像。没改过名称时显示「您的 Helm」，并随界面语言变化（Chrome 存的是建档时那门语言的字面值）。它出现在四处，都照 Chrome 画：

- 工具栏 ⋮ 左边的头像按钮，悬停提示是「您」，改过名后显示名称；
- 头像按钮或 ⇧⌘M 打开的个人资料菜单，有身份卡片和「自定义个人资料」；
- ⋮ 菜单里的个人资料行，子菜单只有「自定义您的 Helm」；
- 设置里的「自定义个人资料」子页，改名和选头像都即时保存。

⋮ 菜单「更多工具」里的「自定义 Helm」才打开侧边栏的自定义面板。

「删除浏览数据」（`desktop/browser/clear-data`）照 Chrome 的时间范围、数据类型和计数，删除由主进程对 Electron 的 session 执行，选过的范围和类型会记住。默认搜索引擎由 `desktop/browser/search-engines.ts` 保存（列表是 Chrome 在中国区的那份），地址栏、新标签请求和右键菜单都读它；搜索词按 Chrome TemplateURL 的规则转义：在网址 `?` 之后的按查询值转义（空格写成 `+`），之前的（如百度的 `#wd=`）按路径转义（空格写成 `%20`）。

Chrome 设置里依赖 Google 或这个浏览器没有的功能不放：登录、同步和 Google 服务，安全检查、第三方 Cookie、安全浏览、网站设置、主题（包括自定义个人资料里的主题颜色）、模式、书签栏、标签页相关选项、字号和字体、网页缩放、管理搜索引擎、默认浏览器、启动时、语言、无障碍、系统，以及「了解详情」「Google Chrome 帮助」这类帮助链接和关于页的更新入口。个人资料菜单和 ⋮ 子菜单里涉及多份个人资料的行（添加、访客、管理、其他个人资料、关闭此个人资料）也不放，密码和自动填充等做了密码功能再加。

### 扩展

扩展运行在 desktop 主进程里。electron-chrome-extensions 补上 Electron 缺的 Chrome 扩展 API（标签、扩展按钮、右键菜单、快捷键）；electron-chrome-web-store 接管 Chrome 应用商店的「添加至 Chrome」按钮，并自动更新装好的扩展。electron-chrome-extensions 用 GPL-3.0 或付费授权，Helm 是 Apache-2.0，正式发布前要买授权或换成自己的实现。

Electron 原生的 `webstorePrivate` 会让主进程崩溃（它没有扩展管理客户端），而 Chromium 每次装卸扩展都会把原生 API 重新装到页面的 `chrome` 对象上。`patches/electron-chrome-web-store+0.13.0.patch` 把库的实现锁在 `chrome` 对象上，同时让扩展下载走 Electron 的网络栈，和网页一样用系统代理。升级 Electron 或这两个库后，在商店里装一个扩展再卸掉，确认主进程不崩。

扩展按钮、拼图菜单、安装确认和「扩展程序」页面在 React 里照 Chrome 画（`desktop/browser/extensions`），通过库的 IPC 读写状态，因为 desktop 的 preload 是沙箱化的，注入不了库自带的 `<browser-action-list>`。Electron 没有「停用」状态：关掉的扩展不加载，由 `disabled-extensions` 记在磁盘上，重新打开时再加载。

网页把这里当成 Chrome：浏览器会话的 UA 去掉了 Electron 和应用名（`features/browser-identity`）；网页里的 `outerWidth`、`outerHeight` 报告网页视口而不是整个 Helm 窗口，iTab 按它们排版。

## Geometry and motion

Store user widths and visibility per local workbench. Store content and explorer
view state per conversation. Switching conversations must not resize the shell.
There are three draggable boundaries between four columns; available window width
constrains their total. The activity rail has a fixed width.

Measure effective space before clamping a drag. Preserve minimum readable sizes for
the conversation and content surfaces; do not let a sidebar consume them. On a
narrower viewport, derive effective widths from the saved preference without
overwriting it. Compact layouts use overlays and view switching under
`useIsCompactFormFactor`; they do not squeeze four desktop columns into a phone.

| Interaction                 | Rendering contract                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resize                      | Capture the pointer, coalesce updates to one per frame, follow its position without easing lag, and persist once at completion. Handle release, cancellation, lost capture, and window blur. |
| Expand/collapse             | Animate size and opacity over approximately 240 ms. Keep a stable track structure and retain the surface during exit.                                                                        |
| Maximize/restore            | Animate the same layout properties. Preserve the previous visibility and width preferences.                                                                                                  |
| Conversation, tab, activity | Retain the outgoing visual during a short transition and keep the target's dimensions stable. Preserve drafts, focus rules, and scroll positions.                                            |
| Menu/dialog                 | Animate both entrance and exit. Remove interaction and accessibility exposure from an outgoing surface immediately.                                                                          |
| Reduced motion              | Respect the system preference; use an immediate or minimal transition without delaying the command.                                                                                          |

Model the desired target independently from animation progress. Animation adapters
start from the currently rendered value when the target changes. Completion carries
a transition identity; ignore completion of an interrupted animation. Do not queue
animations behind each other or use a timeout to guess when a panel can unmount.

Restore known layout before the first visible paint. Loading is explicit state with
stable geometry. Retain cached content during refresh; do not show a temporary
empty panel before data arrives. Keep editors and embedded browsers mounted when
switching views where their lifecycle requires it. Reuse the retained-panel owner
and apply its memory policy to inactive ordinary views.

Measure drag performance on the actual desktop build, including a visible editor
and browser. Target the display refresh interval, with a 16.7 ms frame budget at
60 Hz. Avoid publishing pointer samples through the entire application tree. Treat
these as acceptance targets until a trace establishes results on named hardware.

## Glass material

Use translucent background fills and restrained blur. Text, icons, editor content,
and controls keep their normal opacity. Never set opacity on the whole window or
application subtree to simulate glass.

Give each column its own rounded glass surface, including navigation. The activity
rail uses the window backing, so it remains visually separate from column 1 without
a full-height divider.

The Electron window material and app theme must agree. Configure the native window
material in the desktop window owner and preserve it through theme/background
updates. On macOS, evaluate Electron vibrancy for the window backing. On supported
Windows versions, evaluate the native background material. Platforms without that
material use the same layout with an opaque theme surface. Keep reduced-transparency
and contrast preferences in the presentation model.

Use the native backing for the large application surface, with local backdrop blur
only where overlapping menus need it. Avoid stacking a blur over every scrolling
message or editor. Plain browser preview can blur page layers; it cannot reveal or
blur the user's desktop wallpaper. Native material acceptance requires Electron.

Bundle icon assets with the application and standalone preview. A missing CDN must
not remove navigation or operation icons. Keep icon-only controls labeled and
provide tooltips through the existing control primitives.

## First-phase integration

The first phase places existing real capabilities into this shell. The visual
alignment pass also implements the prototype's conversation splitting and panel
hierarchy. It does not replace the Markdown editor or redesign conversation content.

The layout tree remains in `workspace-layout-store`; `workbench/model.ts` owns shell
activity and geometry. The document registry in `file-pane/editor/registry.ts`
retains shared dirty buffers independently of file views. An unsubmitted global
`/new` form starts with content and files collapsed, giving the creation form the
remaining width. Keep the saved widths for manual expansion. Initialize that
visibility once per draft so returning from Settings does not undo a manual
expansion. Workspace draft tabs already own their content and explorer views.

1. Extract the model APIs from current layout and workspace handlers. Establish
   conversation-owned content/explorer state and shared document ownership first.
   Preserve existing chats, drafts, dirty files, and remembered workspace selection.
2. Introduce the titlebar, activity rail, and four fixed surface components. Reuse
   navigation, creation, conversation, editor, Diff, browser, and terminal content.
3. Connect all open/select/close paths to the models. Column 2 accepts conversations
   only, column 4 accepts the file tree only, and changes/Diff live in column 3.
   Fix destination rules at the panel registry, including menus and shortcuts.
4. Connect Settings and Schedules to activity switching. Restore Home without
   rebuilding conversations. Preserve route ownership under [Expo Router](expo-router.md).
5. Connect geometry, presence, theme, and native material adapters. Add persistence
   at the model's commit boundary, with no duplicated old/new state owners.
6. Verify behavior and visual motion in wide browser and Electron, then check compact
   routing and panel behavior. Run focused tests, typecheck, lint, and formatting.

Integration starts in `app/_layout.tsx`, `workspace-screen.tsx`, `split-container.tsx`,
the workspace layout owner, panel manifest, explorer state owner, and editor model
registry. The desktop window owner handles native material. Follow the established
platform file boundaries; do not gate layout with `Platform.OS`.

Acceptance includes same-project conversations with separate views; different-host
resources; independent chats without a directory; closing and reopening a running
conversation; shared dirty file edits; file/message/Diff opening destinations;
Settings round trips; persistence after restart; rapid resize/collapse reversals;
pointer cancellation; and reduced motion/transparency. Add these to the existing
relevant suites and QA flow. Do not run the full local test suite.
