# Helm 前端总体架构 · 模型驱动 UI（Model-Driven UI）

> **地位**：这是 Helm **所有新前端代码必须遵守的编程规范**。任何新前端代码评审都以本文为准。
> **范围**：只管前端 UI + 「前端传给后端什么」。**后端服务保持原架构原实现**，不在本规范约束内。
> **铁律一句话**：**UI 与模型彻底分离。UI 只渲染 + 派发；状态与逻辑全在模型。出问题时——渲染错改 UI，行为/状态错改模型 API，永不混。**

## 〇、新目录 vs 旧目录（边界，先读这条）

| 边界                                                           | 状态管理                  | 模型形态                                                                          | 组件形态                                                             |
| -------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **新目录**（`packages/app/src/shell/` 及以后每个新模块）       | **MobX（最新 6.x）**      | **class 模型** + `makeAutoObservable`（**禁 `@` 装饰器**，MobX 6 语法）；单例导出 | **函数式组件 + `observer`**（mobx-react-lite）→ 全响应式、由模型驱动 |
| **旧目录**（已存在的 `screens/`、`stores/`、`components/` 等） | **Zustand**（遗留，容忍） | Zustand store + selector                                                          | 既有 hooks 订阅                                                      |

**铁律**：新代码一律 class + MobX + observer。旧 Zustand 代码**不动**，只有在被触碰改造时才整段迁到新标准（重构而非打补丁，见 §六）。**不在新目录里新建 Zustand store**；**不给旧目录强行套 MobX**。

## 一、技术选型（定死，全员遵守）

| 维度       | 选型（新目录）                                               | 说明                                                                                                                                       |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 框架       | React + React Native（Expo）                                 | 跨端；本期 **桌面 only**，移动/浏览器态 deferred（但架构按 API-first 留跨端余地）                                                          |
| 状态管理   | **MobX 6（最新）+ class 模型**                               | 「class 即模型」：observable 公共属性 + computed 派生 + action 公共方法；`makeAutoObservable(this)`，**无装饰器、无 babel 配置**；单例导出 |
| 响应式视图 | **mobx-react-lite `observer`**                               | 函数式组件包 `observer`，读模型即自动精准订阅，模型变即重渲；底层 `useSyncExternalStore`（无首帧闪烁）                                     |
| 样式/几何  | RN 原生 `StyleSheet.create`（静态）                          | 几何/布局是静态常量；**主题色不进静态样式**                                                                                                |
| 主题色     | **ThemeModel（MobX class）** 的 `tokens`，render 内内联应用  | 主题现在是 MobX 模型（见 [theme-i18n-architecture.md](./theme-i18n-architecture.md)）；新壳**不再用 Unistyles 的 theme 机制**              |
| 文案       | **I18nModel（MobX class）** 的 `t(key)`                      | 多语也是 MobX 模型；namespace=模块名（见 theme-i18n-architecture.md）                                                                      |
| 组件       | RN 原语（View/Text/Pressable）+ 仓库既有 `@/components/ui/*` | 壳子用原语自建；内容块要旧 UI 就 `import` 引用、**绝不改旧的**                                                                             |

## 二、三层结构（每层只干一件事）

```
View（视图层）   observer 函数组件：只①读模型 observable/computed ②事件调模型公共 action。零业务逻辑、零业务 useState（纯 UI 态如 hover 例外）
   ↑ 自动订阅(observer)         ↓ 派发(public action)
Pure（派生层）   纯函数 selector：state → UI 要的形状。可单测、无副作用；模型的 computed getter 调它
   ↑
Model（模型层）   class + makeAutoObservable：observable(数据) + get(computed 派生) + action(公共 API) + 私有(`_`/private)。每个壳/域一个 class，单例导出
```

## 三、模型设计规范（class · 私有/公共 · 属性/方法/派生）

**封装手段**：模型是一个 **class 单例**。对外只暴露：**observable 公共属性（只读语义）**、**computed 公共派生（`get`）**、**公共 action 方法**。私有用 `private` / `_` 前缀。组件 import 这个单例、只碰公共面 → 真正的公私分离。

- **公共属性（observable public）**：暴露给 UI **只读**，直白命名。UI 不直接赋值，只经 action 改。
- **私有属性（private）**：内部用，`private` 或 `_` 前缀（`_dragStartWidth`…），组件碰不到。
- **派生（computed `get`）**：`get visibleRegions()`、`get topBar()` 等——零参、由 observable 派生、MobX 自动缓存；内部调纯函数 selector，保持「不渲染就能测」。
- **公共方法（public action = UI 唯一入口）**：动词命名，每个 = 一个明确「意图」。`makeAutoObservable` 自动把方法包成 action。
  - **组合方法**也是公共方法：复杂行为由原子 action 组合（`openSubConversation(id)` 内部 = `openRight()` + `createSideChat(id)`）；**组件只调组合方法，不写组合逻辑**。
- **私有方法（private helpers）**：纯内部、`private`/`_` 前缀、组件调不到（`_setOpen()`…）。
- **不变量**：状态变更**只经 action**（MobX `enforceActions` 默认 observed，render 里乱改 observable 会抛）；computed/selector **永远纯**、无副作用。

## 四、数据流（严格单向）

```
UI 事件 → 调模型公共 action → MobX 改 observable → computed 重算 → observer 组件自动重渲
```

- **严禁**：组件间直接操作彼此 / 组件里写业务逻辑 / 绕过模型改 UI / 在 render 里改 observable。
- 跨壳/跨域交互 = 调各模型**公共 action 的组合**，组件间零耦合。
- 路由/系统输入（route ctx、系统色、语言）经一处 **layout-effect 桥**喂进模型 action（`setContext`/`setScheme`/`setLocale`），模型再派生——单写者，不让组件各自读外部源。

## 五、文件组织 & 验收

- 每个公共 action / computed / 纯函数顶部**一行契约注释**（输入→输出/意图）→「该改哪」一眼定位。
- **模型必须有单测**：`new Model()` → 调 action → 断言 observable/computed；纯函数（`resolveThemeScheme`/`selectVisibleRegions`…）直接喂参断言。**UI 无逻辑、不重单测，靠功能端到端验收**。
- 「该 UI 问题改 UI、该 API 问题改 API」由这套分层强约束兜底。

## 六、重构而非打补丁（迁移纪律）

- 改一个子系统 = 实现最新设计 + **同一改动里删旧**（旧 store + 旧 facade hook + 旧 test 一起删），末态读起来像「一开始就照新标准写的」，无考古层、无 dead gate、无 `??`-fallback 藏旧路径。
- 旧 Zustand 模块被触碰改造时整段迁到 class+MobX；不触碰就保持原样（容忍遗留）。

## 七、跨端（记着、本期不做）

三端共用一套模型/API、UI 尽量一套；模型/纯函数平台无关，平台差异走 `.web/.native/.electron` 扩展位。本期桌面 only 验收。
