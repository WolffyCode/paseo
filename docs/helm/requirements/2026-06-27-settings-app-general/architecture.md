# 架构 · Helm 设置 · 应用段 · 关于 About + 快捷键 Shortcuts

> 日期：2026-06-27 · 状态：草拟（待闸-2）· 关联：[about/requirement.md](./about/requirement.md) · [about/ui.html](./about/ui.html) · [shortcuts/requirement.md](./shortcuts/requirement.md) · [shortcuts/ui.html](./shortcuts/ui.html) · 上游 [inventory.md](./inventory.md)
> 写 **HOW 的边界**，不写逐行实现（实现交 helm-developer）。遵循 [standards.md](../../standards.md)。
> **本期定性**：只做这两个 tab 自身的 **UI 交互 + 配置（定义/读写/持久化）**，**绝不接对话 / Agent 运行时联动**。关于+快捷键本是 app 级设置、联动面本就小；原则照旧——配置层完整建好、可单测，「键位真正去触发业务动作」「更新器底层」那段消费**已存在、本期不重写、留 well-defined seam**。

---

## 0. 边界总纲（最重要 · 一句话切口）

**这两个 tab 的模型层几乎全部已存在且已接通**——本期不是「建新功能」，而是「**把已工作的模型重新安置进设置外壳 + 补两处缺口 + 留一处 seam**」。落到代码证据：

- **关于**：版本只读、五态更新机、安装确认弹窗+兜底、发布通道持久化、主机版本对比、社区按钮——`settings-screen.tsx` 的 `AboutSection`(L502)/`ConnectedHostsSection`(L532)/`HostVersionRow`(L554)/`DesktopAppUpdateRow`(L622) + `use-desktop-app-updater.ts` + `desktop-app-updater.ts`（状态机）+ `confirm-dialog.ts` + `community-links.tsx` **整套已在**。本期缺口只有两处：**① 社区三 URL 改 Helm（值待闸-1）② 随设置外壳换肤**。
- **快捷键**：改键捕获、逐行/全部重置、移动端不可用、override 落盘——`keyboard-shortcuts-section.tsx` + `use-keyboard-shortcut-overrides.ts` + `keyboard-shortcuts.ts`(`buildKeyboardShortcutHelpSections`/`getBindingIdForAction`/`buildEffectiveBindings`) **整套已在**，且 override **已被运行时消费**（`use-keyboard-shortcuts.ts:52` `buildEffectiveBindings(overrides)` 喂 dispatcher）。本期缺口只有一处：**改键状态机现内联在组件 `useState×3 + useEffect`，零单测、违反「不渲染即可测」**→ 抽成纯 reducer（standards §1/§2），并就地预留**冲突检测 seam**（本轮不建）。

**为什么这么切**：消费层（`buildEffectiveBindings`→runtime、Electron updater、desktop-settings 落盘）**本就接通**，本期物理不碰它；配置层（override 写入、通道偏好、URL 常量、改键 FSM）在设置内完整建好、可评审、可单测。冲突检测留 inert seam，将来加不返工。

---

## 1. 模块划分

按「**复用为主，新增集中在两个缺口**」切。两个 tab 各是一块自包含的设置详情体（detail body），只渲染 + dispatch。

### 1.1 设置外壳（**不属本期 · 依赖**）
- 新 master-detail 外壳 = 既有 `packages/app/src/app/settings/[section].tsx` → `screens/settings-screen.tsx` 的 **section-id 路由换肤**（`case "about"` L1538 / `case "shortcuts"` L1523 已把两 body 挂上）。
- **5-tab 应用段导航重排**（删 daemon/integrations/permissions、加分隔、`SIDEBAR_SECTION_ITEMS` L144 改）、左导航选中态、master/detail 分栏、CodePilot token 换肤——是 **settings-app 整体工程 + 主机段（`2026-06-27-settings-host`）共用的外壳交付物，不属本期**。本期两 body **必须 shell-agnostic**：不持外壳布局、不假定导航形态，外壳给什么挂点就挂哪。
- **风险**见 §7.1（外壳归属协调）。

### 1.2 关于 About（`screens/settings/about/`，从 `settings-screen.tsx` 析出）
- **`about-section`（复用现 `AboutSection` 树 + 析出独立文件 + 换肤）**：组合 5 块——App 版本行 / 发布通道（桌面）/ 软件更新行（桌面）/ 已连主机对比 / 社区链接。逻辑全在既有 hook，本组件只渲染 + dispatch。
- **`connected-hosts-section` / `host-version-row`（复用现树）**：列 `useHosts()` 全部主机（**不随主机切换器**）；空态整段不渲染（现 `hosts.length === 0 → null` 已对）。
- **`desktop-app-update-row`（复用现 `DesktopAppUpdateRow`）**：通道分段 + 五态更新行 + 安装确认弹窗 + 兜底 Alert，全接 `useDesktopAppUpdater()`。
- **`community/helm-links.ts`（**新增 · 唯一缺口**）**：Helm 三 URL 常量块（Star/Sponsor/Community），替换 `community-links.tsx` 里硬编码的 getpaseo 地址。单点定义，禁散落（值待闸-1，未定前占位常量 + `// TODO(helm-url)`）。

### 1.3 快捷键 Shortcuts（`screens/settings/shortcuts/` + `keyboard/`）
- **`keyboard/shortcut-capture-machine`（**新增 · 唯一缺口 = 纯 reducer**）**：把现内联在 `keyboard-shortcuts-section.tsx`(L166-237) 的捕获状态机（`capturedCombos`/`heldModifiers`/`capturingBindingId` + keydown 归约 + Backspace 退段）提成**纯 reducer + 选择器**，不渲染即可测（§2.2、§3.4）。冲突检测 seam 落于此（§4）。
- **`screens/settings/shortcuts/shortcuts-section`（复用现 `KeyboardShortcutsSection` + 瘦身为 render+dispatch）**：渲染 5 组 41 行（`buildKeyboardShortcutHelpSections`）、键帽（`Shortcut` 组件）、改键/重置/全部重置、捕获态、native 占位。状态全读 reducer + override hook，组件内零转移逻辑。**平台门修正**：tab 可见性判据是 `!isNative`（桌面+带键盘 web），现外壳 `isDesktopApp` 门把 web 浏览器误挡（§7.1），换肤时随手改正。
- **持久化（复用 · 不动）**：`hooks/use-keyboard-shortcut-overrides.ts` 已是 override 真相源（AsyncStorage + react-query）。本期**直接接，不另起存储**。
- **运行时消费（复用 · 本期不碰）**：`buildEffectiveBindings` + `use-keyboard-shortcuts.ts` 已把 override 喂 dispatcher——这正是「键位真正触发业务动作」那段，**已接通、本期一行不改**。
- **键位映射表（不碰 · DEFERRED）**：`keyboard-shortcuts.ts` 的 `SHORTCUT_BINDINGS`/`help.keys`（含「审查变更」⌃⇧G vs 实际 ⌘⇧G 不符项）**本轮不修正**，键帽照现状 `help.keys` 渲染（设计稿已标「待校正」），统一校正归后续独立轮次。

---

## 2. 模型与 UI 分离（状态归属）

铁律：**状态 / 派生 / 转移进 store·纯函数·selector；组件只渲染 model 派生态 + dispatch。判据：不渲染即可测。**

### 2.1 状态归属表

| 数据 | 归属 / 真相源 | 持久化 | 本期动作 |
| --- | --- | --- | --- |
| App 版本（本设备） | `utils/app-version.resolveAppVersion()`（纯函数） | — | 复用 |
| 发布通道 stable/beta | **`desktop/settings/desktop-settings.ts` 单源**（desktop IPC 落盘）；`useSettings` 仅 facade 透传（storage.ts:150 读 / index.ts:192 写穿透） | 桌面 prefs | 复用 · **禁开第二写路径** |
| 更新器状态（idle/checking/pending/up-to-date/available/installing/installed/error） | `desktop/updates/desktop-app-updater.ts` external store（`useSyncExternalStore`） | — | 复用 |
| 可安装版本 / 错误 / 上次检查 | 同上 snapshot | — | 复用 |
| 主机版本（每台） | `useSessionStore(...serverInfo.version)` + `useHostRuntimeIsConnected`（既有 server_info） | — | 复用（只读） |
| 版本不一致判定 | `normalizeVersion` + `isMismatch`（剥 `v` 前缀后比对，现内联 HostVersionRow） | — | 复用（可选析出纯函数便于测，§6） |
| 社区 URL | **`about/community/helm-links.ts` 常量（新增）** | 静态 | 新增（值待闸-1） |
| 快捷键 override（bindingId→combo） | **`use-keyboard-shortcut-overrides.ts` 单源**（AsyncStorage `@paseo:keyboard-shortcut-overrides` + react-query） | 客户端 prefs | 复用 · **禁另起存储** |
| 改键捕获态（capturedCombos / heldModifiers / 目标行） | **`shortcut-capture-machine` 纯 reducer（新增）**，组件 `useReducer` 持有；瞬态、不落盘、失焦自动取消 | 瞬态 | 新增（从组件内联析出） |
| 全局「正在捕获」抑制信号 | `stores/keyboard-shortcuts-store.ts.capturingShortcut`（既有，捕获期抑制全局快捷键） | 内存 | 复用（reducer 副作用 dispatch true/false） |
| 默认 keymap + 平台键帽 | `keyboard-shortcuts.ts.buildKeyboardShortcutHelpSections/getBindingIdForAction` + `getShortcutOs` | — | 复用 |

### 2.2 UI 只做（渲染层）
- **关于**：按 `useDesktopAppUpdater` 的 `status/statusText/availableUpdate/isChecking/isInstalling` 渲染五态行 + 按钮禁用；通道分段 `onValueChange → updateSettings({releaseChannel})`；主机行按 selector 渲染版本/离线/—/不一致高亮；社区按钮 `openExternalUrl(HELM_*)`。**组件内零计算**：无版本比较分支、无状态机推导——全读 hook/selector。
- **快捷键**：按 reducer 派生「等待 / 已捕获 / 多段序列」渲染键帽区 + 完成/取消；按 `overrides[bindingId]` 决定键帽值 + 是否显「重置」；按 `hasOverrides` 决定段头「全部重置」；`isNative → 占位`。dispatch：startCapture / appendCombo / popCombo / save / cancel / removeOverride / resetAll。**两个真相源 = bug**：键帽值一律从 override + 默认 keymap 派生，组件不持副本。

---

## 3. 数据流与接口契约（配置协议 + 状态机签名）

### 3.1 关于 · 软件更新数据流（桌面 only · 全复用）
```
进入页 → useFocusEffect → checkForUpdates({intent:"automatic", silent:true})
  → desktop-app-updater external store 转 checking → 拉取 → available|up-to-date|pending|error
  → useSyncExternalStore 推 snapshot → 组件渲染五态
点「更新到 vX.Y.Z」 → confirmDialog(...) → 确认 → installUpdate() → 转 installing → installed（待重启）
                                       → 取消 → 无副作用，回 available
                    → confirmDialog reject（弹窗打不开）→ catch → Alert（兜底，不静默吞）
```
**5 个 UI 态 ← 8 值枚举映射**（实现按此判，不新造态）：`checking`→检查中；`up-to-date`(+`pending` 视为已检查无更新)→已是最新；`available`→有可用更新·可安装；`installing`→安装中；`error`→错误；`idle`=初始/未检查（首次静默检查前），`installed`=安装完成待重启的瞬态。按钮逻辑：检查在 `isChecking||isInstalling` 禁用；更新在 `isChecking||isInstalling||!availableUpdate` 禁用（现 L731-741 已对）。

### 3.2 关于 · 发布通道 / 版本对比
- 通道：`updateSettings({releaseChannel})` → facade 穿透 `desktop-settings` 落盘 → `useDesktopAppUpdater` 经 `useDesktopSettings` 读到 → 下次检查走该频道。**单写路径**，无独立保存按钮。
- 版本对比：`resolveAppVersion()`（客户端）vs `serverInfo.version`（每主机，既有 server_info）→ `normalizeVersion` 剥前缀比对 → `isMismatch` 高亮。**纯读，无协议新增**。

### 3.3 社区链接契约（唯一新增常量）
```
// about/community/helm-links.ts —— Helm 官方三地址（值待闸-1 定稿，未定前占位 + TODO(helm-url)）
HELM_COMMUNITY_URLS = {
  star:      string,  // Helm 官方代码仓库
  sponsor:   string,  // Helm 赞助页
  community: string,  // Helm 社区（Discord）
}
```
`CommunityLinks` 三按钮 `onPress → openExternalUrl(HELM_COMMUNITY_URLS.*)`。**禁止**把 URL 散在组件里（现状 getpaseo 硬编码即反例，本期收敛到单点）。

### 3.4 快捷键 · 改键状态机契约（**唯一新增纯逻辑**）

把现内联归约（L213-237）提成纯 reducer，签名（命名/形态交开发，契约如下）：
```
type CaptureState = {
  bindingId: string | null;        // null = 未捕获
  capturedCombos: string[];        // 已捕获的多段 chord（每段 combo 字符串）
  heldModifiers: string | null;    // 仅按住修饰键的实时回显
  conflict: ConflictInfo | null;   // 冲突 seam —— 本期恒 null（§4）
};
type CaptureEvent =
  | { type: "start"; bindingId }
  | { type: "key"; combo: string | null; held: string | null }  // combo=null 表仅修饰键
  | { type: "backspace" }          // 退最后一段
  | { type: "cancel" } | { type: "save" } | { type: "blur" };

captureReducer(state, event): CaptureState        // 纯转移，不渲染即测
canSaveCapture(state): boolean                    // 今 = capturedCombos.length>0 && !state.conflict
capturedComboString(state): string                // capturedCombos.join(" ") → 交 setOverride
```
- 组件 `useReducer(captureReducer)` 持瞬态；`save` 时取 `capturedComboString` 调既有 `setOverride(bindingId, combo)`；`blur`（`!isFocused`）/ 切 tab 自动 `cancel`。
- keydown 监听仍在组件（web-only，`window.addEventListener` + `preventDefault`），但**只把事件翻成 `{combo,held}` dispatch 给 reducer**，不在监听里推状态——转移全在纯函数。
- 副作用：`start`/`cancel`/`save`/`blur` 同步 `keyboard-shortcuts-store.setCapturingShortcut(true|false)`（既有抑制信号）。

### 3.5 override 持久化契约（复用 · back-compat）
- 形态：`Record<bindingId, comboString>`，`comboString` = 空格连接的多段 chord。`setOverride/removeOverride/resetAll` 已实现。
- **客户端 prefs back-compat**（非协议）：`loadOverridesFromStorage` 已 try/catch，**坏 JSON → 空**；`buildEffectiveBindings` 只读已知 `binding.id`，**未知 bindingId 自动忽略**（键位表演进/改名不崩）。**无老用户 → 不写迁移**（见项目规矩 [[no-existing-user-compat]]）；AsyncStorage key 保持 `@paseo:...`（改名无收益、徒增迁移）。

---

## 4. in-scope vs deferred 边界表（+ 冲突检测 seam）

| # | 能力 | 本期 | 落点 / seam |
| --- | --- | --- | --- |
| A1 | 关于 5 块（版本/通道/更新/主机对比/社区）渲染 + 全交互态 | **本期 · 复用换肤** | §1.2 |
| A2 | 五态更新机 + 安装确认弹窗 + 兜底 Alert | **本期 · 复用** | `use-desktop-app-updater` |
| A3 | 社区三 URL 改 Helm | **本期 · 新增常量** | §3.3（值待闸-1） |
| A4 | 主机版本对比（列全部·不随切换器·不一致高亮·离线·—·空态隐藏） | **本期 · 复用** | §3.2 |
| S1 | 快捷键 5 组 41 行渲染 + 平台键帽 | **本期 · 复用** | `buildKeyboardShortcutHelpSections` |
| S2 | 改键捕获态（等待/已捕获/多段/Backspace/完成/取消/失焦取消） | **本期 · 析出纯 reducer** | §3.4 |
| S3 | 逐行重置 / 段头全部重置 / override 落盘 | **本期 · 复用** | `use-keyboard-shortcut-overrides` |
| S4 | 移动端整段「不可用」占位 | **本期 · 复用** | `isNative` 门 |
| — | — | — | — |
| D1 | override 驱动**运行时真正触发动作** | **❌ 本期不碰（已接通）** | `buildEffectiveBindings`→`use-keyboard-shortcuts`：本就消费，物理不动 |
| D2 | 41 条键位映射**准确性校正**（⌃⇧G vs ⌘⇧G 等） | **❌ deferred** | 不碰 `SHORTCUT_BINDINGS`/`help.keys`；归后续「键位统一校正」轮 |
| D3 | **改键冲突检测**（撞车告警/阻止/覆盖/换一个） | **❌ deferred · 留 seam** | §3.4：reducer 留 `conflict: ConflictInfo\|null`（恒 null）+ `canSaveCapture` 已含 `!conflict`；将来加纯函数 `detectConflict(combos, effectiveBindings, bindingId)` 灌入即可，UI 本轮**不建**（S3 设计稿是开放项预览，非承诺） |
| D4 | 更新器底层机制 / 新增更新频道 | **❌ 不碰** | 沿用现役 desktop updater，仅两档 stable/beta |
| D5 | 通用/外观/诊断三 tab、外壳 5-tab 重排与换肤 | **❌ 不属本期** | §1.1（外壳工程 / 后续批次） |

**冲突检测 seam 怎么留（关键）**：① 数据位——reducer state 带 `conflict` 字段，本期构造恒 `null`；② 判据位——「能否保存」收敛到单一纯谓词 `canSaveCapture(state)`，今为 `combos.length>0 && !conflict`，将来 `detectConflict` 一旦返回非 null，完成键自动置灰、提示行自动具备插入点；③ UI 位——完成键禁用态已是 model 驱动（读 `canSaveCapture`），加冲突时无需改组件结构。**本轮一行检测逻辑不写、一个冲突 UI 不建**，但加它时 reducer 签名与组件渲染契约不变 → 零返工。

---

## 5. 复用点 / 禁止重造清单

**复用（直接接，禁止另起一套）：**
- 设置外壳 + section 路由：`app/settings/[section].tsx`、`screens/settings-screen.tsx`（外壳归属见 §1.1）。
- 设置卡 / 分组 / 行：`screens/settings/settings-section.tsx`、`settings-group.tsx`、`styles/settings.ts`、`SegmentedControl`、`components/ui/button`、`components/ui/shortcut`。
- 关于整树：`AboutSection`/`ConnectedHostsSection`/`HostVersionRow`/`DesktopAppUpdateRow`（`settings-screen.tsx`）。
- 更新器：`desktop/updates/use-desktop-app-updater.ts` + `desktop-app-updater.ts`（状态机）+ `desktop-updates.ts`（`formatVersionWithPrefix`/`shouldShowDesktopUpdateSection`）。
- 确认弹窗：`utils/confirm-dialog.ts`。
- 通道持久化：`desktop/settings/desktop-settings.ts`（单源）+ `hooks/use-settings`（facade）。
- 版本/主机：`utils/app-version.resolveAppVersion`、`useHosts`、`useSessionStore(serverInfo.version)`、`useHostRuntimeIsConnected`。
- 社区按钮壳：`components/community-links.tsx`（**只换 URL，不重写组件**）。
- 快捷键全套：`keyboard/keyboard-shortcuts.ts`(`buildKeyboardShortcutHelpSections`/`getBindingIdForAction`/`buildEffectiveBindings`/`DEFAULT_BINDINGS`)、`keyboard/shortcut-string.ts`（combo/chord 解析）、`components/ui/shortcut`（键帽）、`utils/shortcut-platform.getShortcutOs`、`stores/keyboard-shortcuts-store.capturingShortcut`、`hooks/use-keyboard-shortcut-overrides.ts`（持久化）。

**禁止重造（已有，别再写一遍）：**
- 别新建第二套 override 存储 / 第二条通道写路径——override 走 `use-keyboard-shortcut-overrides`，通道走 `updateSettings`→`desktop-settings`。
- 别重写更新状态机 / 主机对比 / 确认弹窗 / 键帽渲染 / help 分组 / combo 解析——**全在**。
- 别在设置里重建一套键位→动作映射或重新解析快捷键——`buildEffectiveBindings` 已是唯一映射源，运行时已消费。
- 别动 `SHORTCUT_BINDINGS`/`help.keys` 修键位（D2 deferred）。
- 别建冲突检测器 / 冲突 UI（D3 deferred，仅留 seam）。
- 别建设置外壳 / master-detail / host 选择器（§1.1 依赖，非本期）。

**新增（确有具体收益才建）：**
- `about/community/helm-links.ts`：Helm URL 单点常量（收敛散落 + 待闸-1 填值）。
- `keyboard/shortcut-capture-machine`：改键纯 reducer + 选择器（收益＝可单测 + 冲突 seam 之家；命名禁 `-utils/-helpers/-manager`）。
- 关于/快捷键两 body 从 `settings-screen.tsx` 析出独立文件（随外壳换肤，瘦身为 render+dispatch）。

---

## 6. 测试策略（强制单测 · 不渲染即可测）

**必测纯函数 / reducer（模型与 UI 分离的回报）：**
1. **改键 reducer（必测 · 本期核心）**：`start`→空捕获；仅修饰键→`heldModifiers` 回显、`canSaveCapture=false`；按全组合→追加段、`heldModifiers` 清；多段 chord 连续追加；`backspace` 退最后一段（空时不崩）；`save`→`capturedComboString` = 空格连接；`cancel`/`blur`→回 `bindingId:null` 空态；**`conflict` 恒 null、`canSaveCapture` 含 `!conflict`（冲突 seam 占位断言）**。
2. **override 持久化 back-compat（必测）**：坏 JSON → 空（不抛）；`setOverride/removeOverride/resetAll` round-trip；**未知 bindingId 经 `buildEffectiveBindings` 被忽略、不污染有效绑定**；`hasOverrides` 随增删翻转。
3. **更新态→UI 映射（必测）**：8 值枚举 → 5 UI 态 + 两按钮禁用矩阵（checking/installing 禁检查；checking/installing/无更新 禁更新）；`statusText`/`availableUpdate` 文案绑定。（`formatStatusText`/`isChecking`/`isInstalling` 已纯，补未覆盖分支。）
4. **版本不一致（必测）**：`normalizeVersion` 剥 `v`/空白；client 与 host normalize 后相等→不高亮、不等→`isMismatch`；任一为 null→不判不一致（离线/未上报不误报）。建议把 `isMismatch` 析出纯函数 `isVersionMismatch(client, host)` 便于断言。

**端到端验证点（对应 requirement 验收 · 不靠截图/text-grep）：**
- 关于：桌面 5 块 / 非桌面 3 块（无通道无更新、不报错）；进入页自动静默检查；点更新→确认弹窗→确认转安装中 / 取消无副作用；主机块列全部·切换器不影响其集合·空态整段隐藏。
- 快捷键：改键捕获→完成→该行显蓝点+重置+键帽变；逐行重置/全部重置回默认；切走 tab 自动取消捕获；native 仅占位。
- **deferred 反向验证**：改键 `save` **只**写 override（落盘+设置内键帽变），运行时经既有 `buildEffectiveBindings` 自然生效——确认**未新增**消费接线、**未触碰** `SHORTCUT_BINDINGS`（防「键位校正」越界）；确认**无任何**冲突检测分支被实现（seam 恒 inert）。

---

## 7. 协议 / 平台门 + 风险取舍

### 7.1 协议 / 平台门
- **协议**：**不动**。两 tab 纯客户端：版本对比读既有 `server_info.version`、更新走 Electron 桥、通道/override 走客户端 prefs——**无新增 RPC、无新增 `server_info.features.*`、无 `COMPAT()`**（本期没有「新 daemon 能力」要门控）。若实现中确需新 server 字段：一律 `.optional()`、dotted 命名空间、配 `features.*` + `COMPAT` 注释——但**目标是不新增、能复用既有**。
- **平台门**（只从 `@/constants/platform`，沿用既有内联门，无需 `.web/.native` 拆文件）：
  - 快捷键：平台门判据 = **`!isNative`**（桌面 App + 带键盘 web 可用；native 显占位）——inventory「桌面 only」精确含义即「非移动端」。⚠️ **现旧外壳 `settings-screen.tsx:1524` 用 `isDesktopApp ? <KeyboardShortcutsSection/> : null`（仅 Electron），把 web 浏览器也挡掉了，与需求不符**；外壳换肤时（§1.1）该 tab 可见性门须改为 `!isNative`。body 本身已对：`isNative → 占位`（既有），捕获 keydown web-only（`window.addEventListener`，已 `if (isNative) return`）。
  - 关于：通道 + 更新两块 `isDesktopApp`（`shouldShowDesktopUpdateSection`/`getIsElectronRuntime`）才渲染；版本/主机/社区全平台。确认弹窗仅桌面可达（无更新按钮禁用，到不了）。

### 7.2 风险与取舍
1. **外壳归属协调（中风险 · 最需对齐）**：新 5-tab master-detail 外壳本期**不交付**，由 settings-app 整体 + 主机段共用。两 body 现挂在旧 `settings-screen.tsx` 路由。**取舍**：本期把两 body 做成 **shell-agnostic 的 render+dispatch 详情体**——外壳就绪即原位换肤、未就绪则维持现路由，**不写降级 fork、不在 body 内塞外壳逻辑**。需与主机段 PM 对齐：`SIDEBAR_SECTION_ITEMS` 5-tab 重排（删 daemon/integrations/permissions）谁落、何时落。
2. **改键 FSM 析出 = 重构非打补丁（中风险）**：现内联状态机可工作但零测。**取舍**：按 standards §1/§2，**实现新 reducer + 同一改动里删组件内联态**（`useState×3`+keydown 归约整体迁走），末态读起来像一开始就分层——不留半截内联、不留 dead gate。收益＝可单测 + 冲突 seam 有家，非为抽而抽。
3. **通道双读非双源（低风险 · 须守）**：`useSettings` 与 `useDesktopSettings` 都暴露 `releaseChannel`，但单源在 `desktop-settings`（前者 facade 穿透）。**取舍**：写一律走 `updateSettings`（穿透到 desktop-settings），**禁**在更新器侧另开写路径，避免造第二真相源。
4. **冲突 seam 的「零成本」纪律（低风险）**：seam 必须 **inert**——`conflict` 恒 null、无半建检测、无隐藏冲突 UI（standards §2 禁 dead gate）。**取舍**：宁可将来加检测时多接一个纯函数，也不本轮埋一段永假分支。
5. **社区 URL 待闸-1（低风险 · 阻塞项）**：三 Helm 地址未定。**取舍**：先落单点占位常量 + `TODO(helm-url)`，闸-1 给值即改一处；**不**先用 getpaseo 充数（指向上游＝产品错误）。
6. **键位「待校正」与改键并存（已澄清）**：键帽显示可能与实际触发不符（D2），但改键 override 写的是用户**新选**的 combo、经 `buildEffectiveBindings` 真实生效——**改键功能不受键位显示不准影响**。校正轮只改默认 `help.keys`/`SHORTCUT_BINDINGS`，与本期 override 机制正交，不返工。
