# 梳理修订 · Helm 设置 · 应用段（Settings · Application）

> 日期：2026-06-27 · 状态：梳理定调（董事长最新修订）· PM：settings-app 段
> 配套：本目录 `about/`（关于 tab）+ `shortcuts/`（快捷键 tab），各一份 `requirement.md` + `ui.html` + PNG
> canonical：docs/helm/product.md + docs/helm/ui.html（设计批准后回写）
> 主机段（host）梳理见姊妹需求：`requirements/2026-06-27-settings-host/`

---

## 0. 一句话定性

把 Helm 设置的**应用段（Application）**重新梳理为 **5 个 tab**，删冗余、搬错位、合并细碎；并按董事长策略「**一个 tab 设计完一个、实现一个，从简单到复杂**」分批推进。**本轮（第一批）只做「关于 About + 快捷键 Shortcuts」两个 tab 的内容细化 + 设计稿，不实现**——董事长要先看设计稿，批准后才进实现。

---

## 1. 应用段最终定调（5 个 tab）

> 应用段 = 跟「当前主机」无关的客户端自身设置（本设备 / 本 App）。主机相关设置全在主机段。

| # | Tab | 英文 | 图标(现役) | 子项概要 | 平台 |
| - | --- | ---- | ---------- | -------- | ---- |
| 1 | **通用** | General | `Settings` | 客户端通用偏好 **+ 权限（并入为子项）** | 全平台 |
| 2 | **外观** | Appearance | `Palette` | 主题 / 配色 / 字体 / 密度等 | 全平台 |
| 3 | **关于** | About | `Info` | 版本 · 发布频道 · 软件更新 · 已连主机版本对比 · 社区链接 | 全平台（更新/频道桌面专属） |
| 4 | **诊断** | Diagnostics | `Stethoscope` | 日志 / 连接诊断 / 调试信息 | 全平台 |
| 5 | **快捷键** | Shortcuts | `Keyboard` | ~41 动作分 5 组 + 改键 / 重置 | **桌面 only** |

**导航顺序建议**：通用 → 外观 → 快捷键 →（分隔）→ 诊断 → 关于。最终顺序以设计稿外壳为准。

---

## 2. 移除 / 搬走（相对旧 8 tab）

旧应用段 8 tab：general / daemon / appearance / shortcuts / integrations / permissions / diagnostics / about。本次修订动了 3 项：

| 旧项 | 去向 | 原因 |
| ---- | ---- | ---- |
| **守护进程** Daemon (`daemon`) | **搬主机段** | daemon 生命周期 / 重启 / 运维属于「主机」上下文，不是客户端自身设置。应用段不再持有。 |
| **集成** Integrations (`integrations`) | **解散** | ① 命令行（CLI）= 装软件时默认随终端装好、无需手动安装，不再是设置项；② 编排 / skills → 归 **skill 目录**（另列）。集成 tab 整个取消。 |
| **权限** Permissions (`permissions`) | **并入通用** | 权限细项作为「通用」tab 下的一个子项呈现，不再独立成 tab。 |

> 旧源参照：`packages/app/src/screens/settings-screen.tsx` 的 `SIDEBAR_SECTION_ITEMS`（含 daemon/integrations/permissions 三项，本次修订后从应用段移除）。

---

## 3. 推进策略（董事长定，务必遵守）

1. **逐个 tab：设计完一个、实现一个，挨个来，从简单到复杂。**
2. **第一批 = 关于 + 快捷键。** 本轮只到「内容细化 + 设计稿」，**不实现、不改代码、不碰 daemon**。
3. **快捷键特例**：现有键位映射「不一定准」→ 本轮**先搭架子**（UI 结构 / 分组 / 改键交互完整），**准确的键位映射后边统一修正**。设计稿照此：架子完整，具体键位标「**待统一校正**」。
4. 设计批准（董事长闸）后才进实现，且仍一个 tab 一个 tab 落。

---

## 4. 本轮交付物（关于 + 快捷键，仅到设计）

- `about/requirement.md` —— 关于 tab 内容明细（逐项：项 / 控件 / 行为 / 状态），WHAT-not-HOW。
- `about/ui.html` + `about/*.png` —— 关于 tab 设计稿（嵌新设置外壳：左导航选中态 + 右详情），CodePilot 浅色 token，渲染 PNG 给董事长 Preview 看图。
- `shortcuts/requirement.md` —— 快捷键 tab 内容明细（5 组 + 改键交互 + 状态），键位标「待统一校正」。
- `shortcuts/ui.html` + `shortcuts/*.png` —— 快捷键 tab 设计稿（含改键捕获态 / 重置态）。

---

## 5. 真实能力托底索引（权威源 · 设计不得脱离）

> 内容细化与设计稿**必须**贴合下列真实代码能力，不得臆造能力。

### 关于 About
- `packages/app/src/screens/settings-screen.tsx`
  - `AboutSection`（L496-524）：App 版本（本设备）行 + 桌面更新行 + 已连主机段 + 社区链接。
  - `ConnectedHostsSection` / `HostVersionRow`（L532-606）：**列全部已连主机**（`useHosts()`），每行 = 主机名 + 版本（或 `offline` / `—`）；客户端↔主机版本不一致时 `isMismatch` 高亮 + 「versionDiffers」提示。**列全部、不跟随主机切换器**。
  - `DesktopAppUpdateRow`（L622+）：**发布频道** SegmentedControl（stable / beta，桌面）；**软件更新**（检查 `checkForUpdates` / 安装 `installUpdate` 带确认弹窗；状态文案 checking/readyToInstall/installing/error）。
- `packages/app/src/components/community-links.tsx`：3 按钮 **Star**(GitHub `github.com/getpaseo/paseo`) / **Sponsor**(Heart `github.com/sponsors/boudra`) / **Community**(Discord `discord.gg/jz8T2uahpH`)。⚠️ **三个 URL 全部要改成 Helm**，不是 getpaseo。
- 版本来源：`@/utils/app-version` `resolveAppVersion`；`@/desktop/updates/*` 更新器；`@/desktop/updates/desktop-updates` `formatVersionWithPrefix`。

### 快捷键 Shortcuts
- `packages/app/src/keyboard/keyboard-shortcuts.ts` —— **键位映射权威源**。`SHORTCUT_BINDINGS`（L171-1111）+ `buildKeyboardShortcutHelpSections`（L1470+）。**41 个 help 动作，正好 5 组**，section 顺序固定：`navigation → tabs-panes → projects → panels → agent-input`。
- `packages/app/src/screens/settings/keyboard-shortcuts-section.tsx` —— **交互权威源**：每行 = 动作名 + 键帽 `<Shortcut>` + 「改键 Rebind / 取消 / 完成」；行级「重置 Reset」（有 override 时）；段头「全部重置 Reset all」（有任意 override 时）；捕获态（`rowCapturing` 高亮 + 实时显示已捕获 combo / 等待提示）；native 显示「移动端不可用」。
- `packages/app/src/stores/keyboard-shortcuts-store.ts`：`capturingShortcut` 等捕获态。
- `getShortcutOs()`（`@/utils/shortcut-platform`）：Mac 用 ⌘、其它用 Ctrl（`mod` 键帽随平台渲染）。
- ⚠️ **键位「不一定准」实证**：`workspace-review-open` 在 Mac 上 combo=`Cmd+Shift+G`，但其 `help.keys` 写 `["ctrl","shift","G"]`——显示与实际不符。这类映射本轮**不修正**，设计稿键帽统一标注「**待统一校正**」。

### 快捷键 41 动作 × 5 组（架子明细，键位待校正）

> 取自 `buildKeyboardShortcutHelpSections` 去重后的 help row（每个 help.id 一行）。键帽为现状默认（含上述不准项），**仅作架子占位**。

**导航 Navigation（6）**：跳转工作区(`mod+1-9`) · 跳转标签(`mod+alt+1-9`) · 上一个工作区(`mod+[`) · 下一个工作区(`mod+]`) · 上一个标签(`alt+shift+[`) · 下一个标签(`alt+shift+]`)

**标签与窗格 Tabs & Panes（13）**：新建标签(`mod+T`) · 关闭当前标签(`mod/ctrl+W`) · 向右拆分窗格(`mod+\`) · 向下拆分窗格(`mod+shift+\`) · 聚焦左/右/上/下窗格(`mod+shift+方向键`) · 移动标签到左/右/上/下窗格(`mod+shift+alt+方向键`) · 关闭窗格(`mod+shift+W`)

**项目 Projects（4）**：打开项目(`mod+shift+O`) · 新建工作区(`mod+N`) · 新建工作树(`mod+O`) · 归档工作树(`mod+shift+Backspace`)

**面板 Panels（13）**：新建终端(`mod+shift+T`) · 审查变更(`ctrl+shift+G`⚠️) · 打开文件(`mod+P`) · 新建侧边聊天(`mod+alt+S`) · 切换工具面板(`mod+alt+B`) · 切换命令中心(`mod+K`) · 显示快捷键(`?`) · 切换左侧栏(`mod+B`) · 切换右侧栏(`mod+E`) · 切换双侧栏(`mod+.`) · 切换设置(`mod+,`) · 切换专注模式(`mod+shift+F`) · 循环主题(`mod+alt+T`)

**代理输入 Agent Input（5）**：聚焦消息输入(`mod+L`) · 切换语音模式(`mod+shift+D`) · 开/停听写(`mod+D`) · 中断代理(`Esc`) · 静音/取消静音语音(`Space`)

> 合计 6+13+4+13+5 = **41**。Mac/非 Mac 键帽随平台；`mod` = ⌘(Mac) / Ctrl(其它)。

---

## 6. 设计外壳与视觉规范

- **外壳**：嵌进新设置外壳（master-detail）—— **左导航**（5 tab，当前 tab 选中态）+ **右详情**（选中 tab 的内容）。与主机段（`2026-06-27-settings-host`）同一套外壳语言，应用段左导航**无 host 选择器**（那是主机段的）。
- **视觉 token**：**CodePilot 浅色主题**，与「CodePilot 主布局」(`requirements/2026-06-27-codepilot-layout/`) **共用单一 token 来源**。
  - ⚠️ 实测 token（见 `codepilot-layout/ui.html` 的 `:root`）= **浅色专业、暖灰中性盘、近黑 `--fg ≈#1c1b19`、`--accent` 非彩色（同 secondary）、`--radius 16px`、柔阴影**——**不是字面的「GitHub 蓝」**。设计稿**直接复用** `codepilot-layout/ui.html` 的 `:root` token 块，不自创蓝色 accent。需核对可只读 `CodePilot-main`，但以已扒 token 为准。

---

## 7. 不做（本轮显式排除）

- 不实现、不改任何代码、不碰 daemon。
- 不做通用 / 外观 / 诊断三个 tab（后续批次，逐个来）。
- 不在本轮修正快捷键键位映射（先架子，键位统一校正留后续）。
- daemon 搬主机段、skills 进 skill 目录 —— 属于其它段/项目，本轮只记录去向，不在此实现。
