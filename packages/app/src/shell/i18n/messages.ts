import type { SupportedLocale } from "@/i18n/locales";

// The shell module's translation data. Flat dot-path keys under the `shell.*` namespace
// (first segment = module name, per the i18n key protocol); the value is the user-visible
// copy. en is the mandatory base every other locale falls back to; zh-CN ships at full
// parity. Other locales fall back to en in I18nModel.t. Adding a string = add the same key
// to BOTH tables (a parity test guards this).

export type ShellMessages = Record<string, string>;

const en: ShellMessages = {
  "shell.back": "Back",
  "shell.settings": "Settings",
  "shell.topBar.conversationSlot": "Title / context · placeholder",
  "shell.topBar.settingsSlot": "Settings · placeholder",
  "shell.zone.left.title": "Sidebar · Conversation tree",
  "shell.zone.left.subtitle":
    "Host switcher / new chat / search / project → conversation → subagent tree",
  "shell.zone.left.tag": "Empty placeholder · conversation-tree module",
  "shell.zone.center.title": "Center · Conversation",
  "shell.zone.center.subtitle":
    "Empty-state greeting / composer / message stream — all the conversation module; the shell does not paint it. The center is always present and flex-fills the remaining width.",
  "shell.zone.center.tag": "Empty placeholder · conversation module",
  "shell.zone.right.title": "Right · Work panel",
  "shell.zone.right.subtitle": "Review / terminal / browser / file-preview tabs and their content",
  "shell.zone.right.tag": "Empty placeholder · work-panel module",
  "shell.zone.fileTree.title": "File tree",
  "shell.zone.fileTree.subtitle": "Working-directory file tree",
  "shell.zone.fileTree.tag": "Empty placeholder · file-tree module",
  "shell.zone.settingsNav.title": "Settings navigation",
  "shell.zone.settingsNav.subtitle":
    "Host section (host / models & providers / usage…) + app section (general / appearance / shortcuts / diagnostics / about)",
  "shell.zone.settingsNav.tag": "Empty placeholder · settings module",
  "shell.zone.settingsContent.title": "Settings content (master-detail)",
  "shell.zone.settingsContent.subtitle":
    "Select a left-nav item → the matching settings detail renders here",
  "shell.zone.settingsContent.tag": "Empty placeholder · per settings sub-requirement",
};

const zhCN: ShellMessages = {
  "shell.back": "返回",
  "shell.settings": "设置",
  "shell.topBar.conversationSlot": "标题 / 上下文 · 占位",
  "shell.topBar.settingsSlot": "设置 · 占位",
  "shell.zone.left.title": "左栏 · 对话树区",
  "shell.zone.left.subtitle": "host 切换器 / 新对话 / 搜索 / 项目 → 对话 → subagent 树",
  "shell.zone.left.tag": "空占位 · 属对话树模块",
  "shell.zone.center.title": "中区 · 对话区",
  "shell.zone.center.subtitle":
    "空态问候 / Composer / 对话流 —— 全属对话模块，本壳不画。中区恒在、自适应填满剩余宽。",
  "shell.zone.center.tag": "空占位 · 属对话模块",
  "shell.zone.right.title": "右栏 · 工作面板区",
  "shell.zone.right.subtitle": "审查 / 终端 / 浏览器 / 文件预览 等 tab 及其内容",
  "shell.zone.right.tag": "空占位 · 属工作面板模块",
  "shell.zone.fileTree.title": "目录树区",
  "shell.zone.fileTree.subtitle": "工作目录文件树浏览",
  "shell.zone.fileTree.tag": "空占位 · 属目录树模块",
  "shell.zone.settingsNav.title": "设置导航区",
  "shell.zone.settingsNav.subtitle":
    "主机段（主机 / 模型与提供方 / 用量…）+ 应用段（通用 / 外观 / 快捷键 / 诊断 / 关于）",
  "shell.zone.settingsNav.tag": "空占位 · 属设置模块",
  "shell.zone.settingsContent.title": "设置内容区（master-detail）",
  "shell.zone.settingsContent.subtitle": "选中左导航某项 → 此处渲染对应设置详情",
  "shell.zone.settingsContent.tag": "空占位 · 属各设置子需求",
};

// en is mandatory (the fallback base); other locales are optional and fall back to en.
export const SHELL_MESSAGES: { en: ShellMessages } & Partial<
  Record<SupportedLocale, ShellMessages>
> = {
  en,
  "zh-CN": zhCN,
};
