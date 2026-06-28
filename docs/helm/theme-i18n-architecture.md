# Helm 基础标准 · 主题模型 + 多语(i18n)模型 + 模块标准（class + MobX 表达）

> **地位**：这是 Helm **所有新前端模块必须遵守的基础标准**。壳子（`shell/`）及其后每一个新模块，都按本文接入「主题模型」与「多语模型」。与 [frontend-architecture.md](./frontend-architecture.md)（模型驱动 UI 铁律：新目录 = class + MobX6 + observer）、[standards.md](./standards.md)、[../unistyles.md](../unistyles.md) 配套；冲突时就高不就低。
> **范围**：前端 UI 主题与文案的**契约 + 公共 API + 接入规范**。**不**改后端、不动协议。
> **一句话**：**每个新模块都接入两套 MobX 模型——`ThemeModel`（observable `scheme` + computed `tokens` + `setScheme`）与 `I18nModel`（observable `locale` + `t(key)` + `setLocale`）；模块组件 `observer` 化、读模型即响应式。禁止自造平行调色板、禁止 `theme.colorScheme` 索引、禁止硬编码用户可见字符串。**
> **协议实质不变**：主题配置文件协议（token 契约）、token 分类（taxonomy）、i18n namespace/key 规范——全部保留；本次只把「模型」从「Unistyles/i18next 共享单例」**落成 MobX class**（新目录标准）。

---

## 0. 背景与根因（为什么要立这条基础标准）

`/home`（路由 `app/h/[serverId]/home.tsx` → `shell/components/shell-root.tsx`）渲染崩，报 `theme.colorScheme` undefined。根因**不是**少写一个守卫，而是**壳子没有自己可靠的主题模型**：

- 旧壳 `shell/theme/shell-tokens.ts` 自造一张 `SHELL_COLORS: Record<"light"|"dark", …>` 硬编码调色板，组件里用 `StyleSheet.create((theme) => SHELL_COLORS[theme.colorScheme].backdrop)` 取色。这是**双重间接**：先读样式工厂注册主题的 `colorScheme` 判别字段，再去索引**另一张手维护的表**。
- 一旦 `theme.colorScheme` 解析不出确定的 `"light"|"dark"`（自适应回灌窗口里 Unistyles 处于 `adaptiveThemes` 态、系统 scheme 尚未定），`SHELL_COLORS[undefined]` === `undefined`，再 `.surfaceCard` 即抛 “Cannot read properties of undefined”。壳**无契约保证**这个判别字段一定在。

**根因解（本标准）**：壳不再向样式工厂「问」scheme，而是拥有一个 **MobX `ThemeModel`**——它的 `scheme` 由 **app 自有状态**（settings + 系统色）经**纯函数 `resolveThemeScheme` 算出来**，`tokens` 是 `scheme` 的 computed（浅/深各一份 token 自带）。组件 `observer` 化、读 `themeModel.tokens.X`。`theme.colorScheme` 索引这条死路从此**结构性消失**。

---

## 1. 模块划分（谁拥有这两套模型 · 放哪）

新目录的两套模型都是 **class 单例**（MobX 6，`makeAutoObservable`，无装饰器）：

| 模型                                      | 归属（新目录）                                                                                                                                      | 形态                                                                                                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **主题模型 `ThemeModel`**                 | `shell/theme/theme-model.ts`（及以后每个新模块的 `<module>/theme/`，或复用壳的）                                                                    | class：observable `scheme` + computed `tokens` + action `setScheme`；**token 浅/深各一份自带**（按 §A.1 契约）；纯函数 `resolveThemeScheme` 派生 scheme   |
| **多语模型 `I18nModel`**                  | `shell/i18n/i18n-model.ts`                                                                                                                          | class：observable `locale` + 方法 `t(key)` + action `setLocale`；messages 按 §B.1 namespace/key 协议；复用既有 `SupportedLocale`/`resolveSupportedLocale` |
| **当前选择的所有权（scheme & language）** | 既有 `hooks/use-settings/*`：`AppSettings.theme: ThemeName \| "auto"` + `AppSettings.language: AppLanguage`（react-query + 持久化，**唯一真相源**） | 不动——本标准只规定「scheme/语言的解析全部从这里派生，经一处 layout-effect 桥喂进模型」                                                                    |

**「配备」= 接入消费**：董事长说「每个新模块都必须配备主题模型 + 多语模型」。在新目录标准里，「配备」=**该模块持有/接入一个 MobX `ThemeModel` + `I18nModel`，组件 `observer` 读之**。不是把色值/文案散落硬编码（那就是 `SHELL_COLORS` 那种碎片化 bug 源）。模型集中、组件消费 = 可靠。

> **与旧目录的边界**：旧 `screens/`/`stores/` 仍走 Unistyles `theme.colors.*` + i18next `useTranslation`（遗留、容忍，见 frontend-architecture §〇）。本标准只约束**新目录**。两套并存属壳子集成范畴；本标准让被 `/home` 用的 `shell/` 合规、修崩。

---

## 2. A. 主题模型 `ThemeModel`（class + MobX）

### A.1 主题配置文件协议（`ThemeTokens` 契约 · 重中之重，协议实质保留）

**协议一句话**：一个主题 = **一组填满 token 契约的强类型对象（浅/深各一份），按固定 token 分类与语义命名提供值**；`ThemeModel` 自带这浅/深两份，`scheme` 选其一为 `tokens`。新增方案 = 加一份满足契约的实例，消费方零改动。

**协议形态（零复杂度）**：落地为**编译期 TS 契约类型**（`ShellTokens` 接口），不是运行时 JSON 加载器——当前无用户自带主题，JSON+Zod+动态注册是没有当下收益的大抽象。契约本身就是 schema：将来要外置 JSON / 用户主题，只在**解析边界一处**镜像成 Zod（`parse → validate(ShellTokens) → new ThemeModel(tokens)`），**所有消费方一行不改**（§8）。

**token 分类（taxonomy · 浅深都必须给，缺一不可）**：壳 `ShellTokens` 的语义角色组（沿用既有 codePilot「github」浅色 + 方案C periwinkle 兜底 + 半透明白卡的值）——

| 组                | 字段（语义角色，非具象色名）                | 说明                                                                         |
| ----------------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| **背景**          | `backdrop`                                  | 方案C periwinkle 实心兜底（macOS Electron 走 vibrancy 透明，见 §A.4 平台门） |
| **表面**          | `surfaceSidebar` / `surfaceCard`            | 浮卡半透明白：侧栏更透（frosted rail）、内容卡近不透                         |
| **文字**          | `foreground` / `foregroundMuted`            | 主/次文字                                                                    |
| **描边**          | `border`                                    | 卡唯一可见边（hairline）+ 占位虚线                                           |
| **开关**          | `toggleActive` / `toggleHover`              | 展开态浅灰填充 / hover 洗色                                                  |
| **行/幽灵 hover** | `rowHover` / `ghostHover`                   | 侧栏行 / 返回按钮 hover                                                      |
| **gutter**        | `gutterIdle` / `gutterHover` / `gutterDrag` | 拖拽手柄中线三态                                                             |

> **命名规范（硬约束）**：① 颜色 token 一律**语义角色名**（surface/foreground/border/toggle/gutter…），禁裸 hex 与具象色名出现在组件；② 浅深两份实例**字段集完全一致**（差值不差键）——这样 `themeModel.tokens.X` 在任何 scheme 下都拿得到 X，**这正是壳崩的反面**；③「几何」（顶栏高、gutter 宽、卡圆角这类**与浅深无关的固定像素**）**不进 token**，留 `shell-tokens.ts` 静态常量。判据：**「这个值会随浅/深变吗？」** 会 ⟹ 进 `tokens`；不会 ⟹ 静态常量。

### A.2 所有权与可靠解析（不依赖样式工厂注入）

| 关注点                       | 归属                                                                                                                        | 契约                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **选哪套主题**               | settings store `AppSettings.theme: ThemeName \| "auto"`（**唯一写者**）                                                     | 用户选择，持久化；默认 `codePilot`                          |
| **当前是浅还是深（scheme）** | **纯函数** `resolveThemeScheme(setting, systemScheme)`，**不读** `UnistylesRuntime`、**不读**样式工厂的 `theme.colorScheme` | scheme 从 **app 自有状态** 算出 ⟹「壳子自己可靠的主题来源」 |
| **token → 视图**             | `ThemeModel.tokens`（computed）+ 组件 `observer` 内联应用                                                                   | `scheme` 变 → `tokens` 重算 → observer 重渲                 |
| **谁喂 scheme**              | 一处 layout-effect 桥（在 `shell-root`）：`themeModel.setScheme(resolveThemeScheme(settings.theme, systemColorScheme))`     | **单写者**——模块**永不**自己乱设 scheme                     |

```
ThemeScheme = "light" | "dark"
THEME_SCHEME: Record<ThemeName, ThemeScheme>     // 静态映射：codePilot→light, light→light, dark/zinc/midnight/claude/ghostty→dark
resolveThemeScheme(setting: ThemeName|"auto", systemScheme: "light"|"dark"|null): ThemeScheme
   // 纯函数：setting==="auto" → systemScheme ?? "light"；否则 THEME_SCHEME[setting]。单测直接喂参、确定、与渲染时序无关。
```

**「可靠」的本质**：scheme 不再向样式回调「问」（那条在自适应/回灌窗口不保证），而是 `resolveThemeScheme` **算**出来——输入是 app 自有的 settings + 系统 scheme，确定、可单测。这是修壳崩的模型级根因解。

### A.3 公共 API（class 面）

```
class ThemeModel {
  scheme: ThemeScheme            // observable，默认 "light"（codePilot 浅）
  get tokens(): ShellTokens      // computed = SHELL_TOKENS[scheme]
  setScheme(scheme): void        // action，唯一写 scheme 的入口（layout-effect 桥调）
}
export const themeModel = new ThemeModel()   // 单例
```

**消费（99% 情形，observer 内联）**：

```
const Card = observer(function Card() {
  const t = themeModel.tokens;
  return <View style={[styles.card, { backgroundColor: t.surfaceCard, borderColor: t.border }]} />;
});
```

几何/布局用 `StyleSheet.create`（静态）；**主题色从 `themeModel.tokens.X` 取、render 内内联**——`observer` 保证 scheme 切换重渲。

**红线（评审直接打回）**：

- ❌ `SHELL_COLORS[theme.colorScheme]` 式**平行调色板 + scheme 索引** —— 壳崩原型，全面禁止。
- ❌ 新壳里用 **Unistyles `StyleSheet.create((theme)=>…theme.colors…)`** 取主题色 —— 新壳主题是 MobX 模型，不走 Unistyles theme 机制。
- ❌ `useUnistyles()` / `useTheme()->{tokens}` 整包 hook（[../unistyles.md](../unistyles.md) 明禁的重渲染源）。
- ❌ 组件里 `theme.colorScheme === "light" ? …` 拿样式工厂判别字段分叉 —— 要分叉用 `themeModel.scheme`（确定来源）；要选色把两值都进 token 让 `scheme` 选。
- ❌ 裸 hex / 具象色名出现在组件 —— 一律走 `themeModel.tokens.<语义角色>`。

### A.4 与 Unistyles 的关系（新壳：**不用其 theme 机制**）

**定：新目录（`shell/` 及以后）主题走 MobX `ThemeModel`，不再用 Unistyles 的 theme 机制**（`StyleSheet.create((theme)=>…)` 的主题回调、`withUnistyles`、`useUnistyles`）。几何用 RN 原生 `StyleSheet.create`（静态）。理由：董事长定的新标准是「主题 = MobX 模型、组件 observer 响应式」；MobX `tokens` computed + observer 已白给①浅深 token 传播 ②`scheme` 自适应（`resolveThemeScheme` 含 `"auto"` 跟随系统）③切换零分支。**旧目录**仍用 Unistyles（遗留、容忍）。平台门（vibrancy 透明）仍走 `getIsElectronMac()`/`isWeb`（`@/constants/platform`，与 scheme 无关）。

### A.5 模块如何接入主题（最小样板）

- 组件包 `observer`；render 顶 `const t = themeModel.tokens;`，色值内联 `{ backgroundColor: t.surfaceCard }`。
- 几何/布局：`const styles = StyleSheet.create({...})`（RN 原生，静态，**不含主题色**）。
- 图标/三方 prop 要随主题变：直接把 `t.foreground` 传 `color` prop（observer 已使叶子重渲），**不需** `withUnistyles`。
- 需要 scheme 分叉（极少）：读 `themeModel.scheme`。
- 模块**不**新建任何 `*-colors.ts` / `SHELL_COLORS` 表；新语义色加进 `ShellTokens` 契约（浅深都给）。

---

## 3. B. 多语(i18n)模型 `I18nModel`（class + MobX）

### B.1 语言配置文件协议（namespace/key · 协议实质保留）

**协议一句话**：每个模块的文案 = 一张 **messages 表**（`Record<SupportedLocale, ...>`），key 用**点分语义路径**、**首段 = 模块名作命名空间**；新增语言 = 补该 locale 的 messages（缺的回退 `en`）。

- **namespace**：靠 **key 首段 = 模块名** 实现（`shell.back`、`shell.zone.left.title`），不开多套 i18n 运行时（零复杂度）。
- **key 规范**：点分语义路径，key 是语义不是英文原文；首段=模块/功能名。
- **语言集**：复用既有 `SupportedLocale = "ar"|"en"|"es"|"fr"|"ru"|"zh-CN"`、`AppLanguage = "system" | SupportedLocale`（`i18n/locales.ts`）。
- **数据**：新壳 messages 随模块走（`shell/i18n/messages.ts`），按上面协议；至少 en + zh-CN，其余回退 en。

### B.2 所有权与解析

| 关注点                | 归属                                                                                                                   | 契约                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **选哪种语言**        | settings store `AppSettings.language: AppLanguage`（**唯一写者**）                                                     | `"system"` 或具体 locale；默认 `system`                  |
| **解析到具体 locale** | 纯函数 `resolveSupportedLocale(language, systemLocales)`（**既有**，复用）                                             | `"system"` → 按系统语言匹配 → 兜底 `DEFAULT_LOCALE="en"` |
| **谁喂 locale**       | 一处 layout-effect 桥（`shell-root`）：`i18nModel.setLocale(resolveSupportedLocale(settings.language, systemLocales))` | **单写者**；模块**永不**自己改 locale                    |

### B.3 公共 API（class 面）

```
class I18nModel {
  locale: SupportedLocale        // observable，默认 DEFAULT_LOCALE
  t(key: string): string         // 读 this.locale（建立响应式依赖）→ messages[locale][key] ?? messages.en[key] ?? key
  setLocale(locale): void        // action，唯一写 locale 入口（layout-effect 桥调）
}
export const i18nModel = new I18nModel()    // 单例
```

**消费**：`observer` 组件内 `i18nModel.t("shell.back")`——`setLocale` 触发 observer 重渲。

**红线**：❌ 硬编码用户可见字符串 ❌ 平行文案常量表（messages 表即唯一来源）❌ 模块自调 `i18n.changeLanguage`。

### B.4 模块如何接入多语（最小样板）

- 组件包 `observer`；所有用户可见文案：`i18nModel.t("<module>.<key>")`。
- 文案值加进该模块 `i18n/messages.ts` 的对应 locale 段（en + zh-CN 必给，缺的回退 en）。

---

## 4. C. 模块标准（每个新模块 = 接入两套 MobX 模型）

**钉死一句话**：**每个新模块都必须接入 `ThemeModel` + `I18nModel`、组件 `observer` 化、只通过模型公共 API 消费——禁止自造调色板、禁止 `theme.colorScheme` 索引、禁止硬编码文案、禁止第二套 i18n 运行时。**

| 维度              | 必须                                                            | 禁止                                                                          |
| ----------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 颜色              | `observer` + `themeModel.tokens.<语义角色>` render 内联         | 裸 hex、`SHELL_COLORS` 平行表、`theme.colorScheme` 索引、Unistyles theme 回调 |
| 几何/布局         | RN 原生 `StyleSheet.create`（静态，无主题色）                   | 把固定像素塞进 token                                                          |
| 浅/深分叉（极少） | `themeModel.scheme`                                             | 样式工厂 `theme.colorScheme`                                                  |
| 新语义色          | 加进 `ShellTokens` 契约（浅深都给）                             | 模块内私存色值                                                                |
| 用户可见文案      | `i18nModel.t("<module>.key")`，值进 `i18n/messages.ts`          | 硬编码字符串、平行文案表                                                      |
| 主题/语言切换     | 只读 settings + 一处 layout-effect 桥调 `setScheme`/`setLocale` | 模块自调 setTheme/changeLanguage                                              |

**目录约定**（沿用 frontend-architecture 三层）：模块 = `model/`（class 模型 + 纯函数 selector）+ `components/`（`observer` 只渲染+dispatch）+ `theme/`（`ThemeModel` + `ShellTokens` 契约 + `resolveThemeScheme`）+ `i18n/`（`I18nModel` + `messages`）。**模块消费自己的/壳的模型单例，不重造引擎**。

---

## 5. 落到壳子：修掉 `/home` 的 `theme.colorScheme` undefined 崩

**重构而非打补丁**（standards §2）：不给 `SHELL_COLORS[theme.colorScheme ?? "light"]` 加守卫（留考古层），而是**整段拔掉平行调色板 + scheme 索引**，让壳改走 `ThemeModel`——崩的结构从此**不存在**。

**步骤（HOW 边界）**：

1. **建 `ThemeModel`**：把 `SHELL_COLORS` 浅/深两份值搬进 `shell/theme/theme-model.ts` 的 `SHELL_TOKENS`（`ShellTokens` 契约实例）；class 自带 + `scheme`/`tokens`/`setScheme`；加 `resolveThemeScheme` + `THEME_SCHEME`。
2. **建 `I18nModel`**：`shell/i18n/`，messages（壳文案，en+zh-CN）+ `locale`/`t`/`setLocale`。
3. **组件 `observer` 化**：`shell/components/*` 每一处 `SHELL_COLORS[theme.colorScheme].X` → `themeModel.tokens.X`（render 内联）；硬编码中文 → `i18nModel.t(...)`；几何用 RN `StyleSheet.create`。
4. **删平行表**：删 `shell-tokens.ts` 的 `SHELL_COLORS` 与 `ShellScheme`；**保留**纯几何/平台静态常量（`TOP_BAR_HEIGHT`/`GUTTER_WIDTH`/`CARD_RADIUS`/`CONTROL_RADIUS`/`WINDOW_PADDING`/`TRAFFIC_LIGHT_INSET`/`SHELL_USES_VIBRANCY`/`WEB_FROSTED`/`WEB_CARD_SHADOW`/`TOGGLE_*`）。
5. **桥**：`shell-root` 一处 layout-effect 喂 `setScheme`/`setLocale`/`setContext`。
6. **结果**：壳内**再无** `theme.colorScheme` 索引 ⟹ undefined-索引崩**结构性消失**；浅深由 `ThemeModel.scheme` 决定。

---

## 6. 模型与 UI 分离 / 数据流（判据：不渲染就能测）

| 落哪层                    | 内容                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **model（MobX class）**   | `ThemeModel`（`scheme`/`tokens`/`setScheme`）、`I18nModel`（`locale`/`t`/`setLocale`）。所有权真相源仍在 settings store（`theme`/`language`）；模型 `scheme`/`locale` 是其**派生镜像**，由桥单写。 |
| **纯函数（selector 级）** | `resolveThemeScheme(setting, systemScheme)`、`resolveSupportedLocale(language, systemLocales)`——`state → 形状`，无副作用、不碰 React/DOM，单测直接喂参。                                           |
| **view（observer 组件）** | 读 `themeModel.tokens.*` / `themeModel.scheme` / `i18nModel.t(...)`；**零** scheme/语言业务 useState。                                                                                             |

**数据流（单向）**：

```
用户改主题 → settings.theme 变 → shell-root 桥 effect: themeModel.setScheme(resolveThemeScheme(...)) → tokens computed 重算 → observer 重渲
用户改语言 → settings.language 变 → 桥 effect: i18nModel.setLocale(resolveSupportedLocale(...))        → t() 依赖 locale → observer 重渲
系统切浅深 → useColorScheme 变 → (auto 时) 桥 effect 重算 setScheme → tokens 重算 → observer 重渲
```

---

## 7. 复用点 / 禁止重造

**复用（直接用）**：既有 `SupportedLocale`/`resolveSupportedLocale`/`DEFAULT_LOCALE`（`i18n/locales.ts`）、`AppSettings.theme`/`language`（`hooks/use-settings/*` 唯一真相源）、`hooks/use-color-scheme(.web).ts`（系统 scheme 源）、`ThemeName`（`styles/theme.ts` 仅取类型/常量，**不取实时色**）；壳 `shell-tokens.ts` 的几何/平台静态常量。

**禁止重造**：❌ 平行调色板 / `SHELL_COLORS` 式 scheme 索引（崩的原型）❌ `useUnistyles()`/`useTheme()` 整包 hook ❌ 新壳用 Unistyles theme 机制取色 ❌ 第二套 i18n 运行时 / 平行文案表 / 硬编码用户字符串 ❌ 模块自调 setTheme/changeLanguage（只此 shell-root 桥单写）。

**本标准新增**：`ThemeModel`（MobX class，自带浅深 `ShellTokens`）、`resolveThemeScheme`+`THEME_SCHEME`、`I18nModel`（MobX class）+ `shell/i18n/messages.ts`、本文档=标准。

---

## 8. 协议 / 平台

- **不动 wire 协议**：纯前端模型与取色/取文案路径，无 schema/RPC/`server_info.features.*` 变更，**无 `COMPAT()`**。theme/language 是 client app-state，本 fork 无老用户、不写迁移/存量兼容。
- **平台门**：scheme/locale 解析纯函数**平台无关**（不碰 DOM）。系统 scheme 源已 `.web` 扩展；壳 vibrancy 走 `getIsElectronMac()`/`isWeb`。**桌面 only 验收**，model/纯函数平台无关 ⟹ 跨端余地天然留好。
- **未来外置主题 JSON / 用户主题**：契约即 schema——解析边界一处镜像成 Zod `parse→validate(ShellTokens)→new ThemeModel(tokens)`，消费方零改。本期不实现（零复杂度）。

---

## 9. 测试策略（必测纯函数 / 模型 · 不渲染可测）

- **`resolveThemeScheme.test`**：`"auto"`+systemScheme(`light`/`dark`/`null`)→对应/兜底 `light`；每个具体 `ThemeName`→`THEME_SCHEME` 对值（codePilot→light、dark系→dark）。
- **`ThemeModel.test`**：`new ThemeModel()` 默认 `scheme="light"`、`tokens` 指浅；`setScheme("dark")` 后 `tokens` 指深；**浅深 `tokens` 字段集完全一致**（断言同键——直接钉死壳崩根因）。
- **`I18nModel.test`**：`new I18nModel()` 默认 locale 的 `t(key)` 命中；`setLocale("zh-CN")` 后 `t` 取中文；缺失 key 回退 en、再回退 key 本身。
- **`resolveSupportedLocale.test`（既有，保持）**：`"system"` 各系统语言匹配 + 脏值兜底 `en`。
- **端到端验收点**：`/home` 在浅/深 + 自适应回灌窗口**不崩**（壳崩验收，CDP 真渲染）；切主题/切语言即时生效。UI 无逻辑、不重单测，靠功能验收。

---

## 10. 风险与取舍

1. **否决 `useTheme()->{tokens}` 巨钩**：改为 MobX `tokens` computed + `observer`——同样「一个公共 API 拿全部 token」，但 observer 精准订阅、`tokens` 仅 `scheme` 变时重算，不重渲染风暴。
2. **scheme 双源（settings 派生 vs 引擎 active）**：新壳取色**只**走 `ThemeModel.tokens`（单一来源），不再与 Unistyles active 主题并存，双源不一致问题在新壳消失。
3. **契约 vs 运行时 JSON**：本期定 TS 契约不上 JSON 引擎；要支持用户自带主题时在解析边界一处加 Zod，消费零改。
4. **两套壳并存**（`screens/home-shell/` vs `shell/`）：本标准不合并，只让 `shell/` 合规、修崩；合并属壳子集成需求。
