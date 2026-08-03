# Helm 本机工作目录选择器交接文档

> 接手对象：Claude
> 日期：2026-08-03
> 当前分支：`codex/composer-runtime-controls`
> 当前基线提交：`2d20dfde feat(app): complete Helm conversation workspace and composer`
> 设计状态：Gate 1 已确认，下一步是 Gate 2 架构确认与生产实现。

## 1. 目标与范围

实现 Composer 的“工作目录”选择器，目标是 PC Electron 与桌面 Web 的同一套 Helm 自绘本机文件浏览器。

本期明确只处理当前电脑：

- 不设计远程 Host、多设备浏览或本机/远程切换。
- 选择器右上角不显示“本机”“远程”“当前电脑”等设备身份，也不放设备切换器。
- Electron Composer 不调用系统原生目录对话框；桌面 Web 与 Electron 都使用 Helm 双栏界面。
- 不使用浏览器 `showDirectoryPicker()`、File System Access API 句柄或浏览器文件 input 作为工作目录。
- 手机端不做本需求设计；保留现有 native Composer，不要把 PC 双栏 UI 移植到手机。
- 用户可以不选择工作目录；保持“对话 · 未选择工作目录”时，仍可发送纯对话。

## 2. 已确认的最终设计

### 2.1 紧凑项目浮层

- 工作目录触发器正上方打开约 `424px` 的圆润浮层。
- 顶部只显示“选择工作目录”和项目搜索，不显示设备上下文。
- 中部列出最近项目、当前电脑 daemon 返回的项目结果和选中状态。
- 底部固定两个动作：`浏览文件系统…`、`不使用工作目录`。
- 点击项目立即回填并关闭；点击“不使用工作目录”切换纯对话。
- 取消、Escape、点击外部或失败时保留原工作目录和 Composer 输入。

### 2.2 双栏本机文件浏览器

- 点击 `浏览文件系统…` 后，在同一工作目录节点正上方切换为约 `704px` 宽的面板，不能另开页面或覆盖到上方空白区域。
- 顶部提供：返回、前进、刷新、当前位置路径输入、当前层搜索。
- 左栏：常用位置（主目录、桌面、下载、项目目录等）和可展开目录树；左栏独立滚动。
- 右栏：当前路径下的全部目录项，至少显示名称、修改时间；右栏独立滚动。文件可展示但不能作为工作目录目标。
- 单击目录只选中；双击目录或按 Enter 进入下一层。左侧位置和树节点点击后刷新右栏。
- `选择此目录` 确认当前选中目录；`取消` 返回项目浮层；Escape 返回上一级表面或关闭。
- 必须有加载、空目录、权限不足、读取错误、路径不可用和离线状态，并且每个状态都有返回/重试/取消出口。
- 980px 及以上 PC 视口中面板完整可见，不挤压 Composer、不被画布裁切；左右长内容不能撑破布局。

完整可交互设计稿：`docs/helm/requirements/2026-08-03-filesystem-picker-design/ui.html`。

## 3. 当前代码现状

### 已存在的基础能力

- `packages/client/src/daemon-client.ts` 已有 `listDirectory(cwd, path)`、`getDirectorySuggestions()`、`openProject()`。
- `FileExplorerDirectoryPayload` 的目录项包含 `name`、`path`、`kind`、`size`、`modifiedAt`，目录结果有可选 `absolutePath`。
- 服务端已有只读目录读取：`packages/server/src/server/file-explorer/service.ts` 与 `packages/server/src/server/session.ts`。
- Composer 已支持无 workspace 的 `conversationOnly` 能力门；这部分不要被文件浏览重构破坏。

### 当前生产实现与设计的差异

`packages/app/src/composer/draft/workspace-picker.tsx` 目前仍是过渡实现：

1. 用“项目 / 文件系统”两个页签切换来源，设计要求是项目紧凑浮层通过底部按钮进入独立的双栏浏览状态。
2. 通过 `Combobox` 使用 `desktopPlacement="bottom-start"`、约 `430px` 面板，设计要求锚定触发器正上方、浏览状态约 `704px`。
3. 文件系统只有单栏列表和上一级按钮，没有左侧常用位置/可展开目录树、返回/前进历史、独立双栏滚动、刷新、当前层搜索和单击选中/双击进入。
4. 本机 Electron 仍会走 `pickDirectory()` 系统目录对话框，依赖 `useIsLocalDaemon()`；这与本期“Electron/Web 共用 Helm 自绘浏览器”冲突。
5. `workspace-picker-model.ts` 中的 `shouldUseNativeDirectoryPicker()` 及对应测试是旧分支逻辑，应在根上删除，不要再叠加兼容分支。
6. 当前目录确认存在 `listing.absolutePath ?? fallbackPath` 的猜路径回退。设计要求只接受 daemon 返回的规范化绝对路径；缺失时进入明确错误/更新 Host 状态，不允许客户端猜测路径。
7. `packages/app/src/composer/draft/workspace-picker.native.tsx` 是手机实现，继续保持现状，不要把本需求的 PC 双栏设计复制进去。

工作区已经有大量其它未提交改动。接手时只修改本需求涉及的文件，不要 reset、checkout 或覆盖用户已有改动。

## 4. 推荐实施顺序

### Gate 2：先确认架构

1. 以本交接文档、`requirement.md`、`architecture.md`、`docs/helm/product.md`、`docs/helm/ui.html` 为唯一输入。
2. 把目录浏览状态从组件内局部 state 提炼为可测试的 model/store：面板表面、根路径、相对路径、绝对路径、历史、展开树、右栏选中项、搜索、加载/空/错误/权限状态。
3. 复用现有 `listDirectory` 协议；确认 `absolutePath` 能力和旧 daemon 行为。缺少能力时单点提示“更新 Host”，不要做路径拼接或浏览器文件句柄降级。
4. 明确路径安全边界：daemon 负责认证、规范化和 workspace 校验；客户端不允许自行猜测主目录或绕过 root。

### 生产实现

1. PC Web/Electron 统一使用 `workspace-picker.tsx`；彻底删除 Composer 入口中的 `pickDirectory()`、`useIsLocalDaemon()` 和原生目录分支。native 文件可继续使用自己的实现。
2. 将项目浮层和双栏浏览器建模为两个明确表面：项目表面底部 `浏览文件系统…` 进入浏览表面，返回时恢复原项目搜索与选择。
3. 使用现有 `Combobox` 的 `top-start`/`top-end` 能力或在其上正确扩展，确保面板直接覆盖输入框上方，不在触发器上方留空白。
4. 左右栏使用稳定尺寸与独立滚动容器；实现树展开、常用位置、前进/后退、刷新、路径输入、当前层搜索、目录选中、双击/Enter 进入和确认。
5. 只渲染 `kind === "directory"` 为可确认工作目录；文件可以在右栏展示但不可确认。
6. 所有新函数先写契约注释；状态转移放 model/store，组件只渲染派生状态和派发动作。
7. 更新 `zh-CN`、`en` 等资源中的桌面文案：删除 Host 路径输入、设备切换和原生目录对话框文案；保留“对话 · 未选择工作目录”。
8. 保持 Composer 其它已确认规则：输入为空时发送按钮保留图标但禁用；`@` 文件提及删除；运行配置单行；手机端不变。

## 5. 必测场景

- 项目浮层默认打开，搜索项目、选中项目、无结果。
- 点击 `浏览文件系统…` 进入双栏；右侧目录列表和左侧树分别滚动。
- 常用位置切换、树节点展开、当前路径输入、当前层搜索。
- 单击只选中；双击/Enter 进入；返回、前进、刷新。
- 选择当前目录确认，文件不可确认。
- 加载、空目录、权限不足、读取错误、离线、取消和 Escape；失败不清空原选择或输入。
- 不选工作目录发送纯对话；旧 daemon 缺少能力时只显示更新提示，不创建隐式 workspace。
- PC Electron 与桌面 Web 的布局一致；手机端渲染保持既有实现。

## 6. 验证命令与调试

只运行受影响测试，不运行整个测试套件：

```bash
npm run format:files -- docs/helm/requirements/2026-08-03-filesystem-picker-design/ui.html docs/helm/requirements/2026-08-03-filesystem-picker-design/handoff.md
npx vitest run packages/app/src/composer/draft/workspace-picker-model.test.ts --bail=1
npm run typecheck
npm run lint
npm run format:check
```

调试桌面 Web/Electron 时使用现有开发脚本，并在 Codex 内置浏览器打开设计稿或真实 Composer；不要重启 6767 主 daemon。完整日志位置由 `$PASEO_HOME/daemon.log` 决定。

## 7. 交接结论

设计已经按用户最终意见收敛：只做当前电脑，右上角不显示设备身份，核心体验是圆润、可滚动、左右双栏的 Helm 自绘目录浏览器。Claude 的第一件事应是删除当前过渡实现的原生目录/页签/单栏路径逻辑，再按 Gate 2 确认后的 model、协议能力和 PC/Web UI 完整替换，不能在旧逻辑上继续叠加补丁。
