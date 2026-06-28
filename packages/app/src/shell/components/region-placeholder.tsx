import type { ComponentType } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { SHELL_COLORS } from "../theme/shell-tokens";
import {
  iconMuted,
  ThemedFolderTree,
  ThemedMessageSquare,
  ThemedPanelLeft,
  ThemedPanelRight,
  ThemedSettings,
  ThemedSliders,
} from "./icons";

// The shell's one empty-container body. Every region this milestone renders this: a real
// card geometry filled with a dashed outline + the region's name + which module owns its
// future content. It draws NO real content — that belongs to the deferred content
// milestones. The labels are the skeleton's own metadata, fixed by ui.html, not business
// data, so they live here rather than flowing through the model.

export type ZoneVariant =
  | "left"
  | "center"
  | "right"
  | "fileTree"
  | "settingsNav"
  | "settingsContent";

type ThemedIcon = ComponentType<{ size?: number; uniProps?: typeof iconMuted }>;

interface ZoneCopy {
  Icon: ThemedIcon;
  title: string;
  subtitle: string;
  tag: string;
}

const ZONE_COPY: Record<ZoneVariant, ZoneCopy> = {
  left: {
    Icon: ThemedPanelLeft,
    title: "左栏 · 对话树区",
    subtitle: "host 切换器 / 新对话 / 搜索 / 项目 → 对话 → subagent 树",
    tag: "空占位 · 属对话树模块",
  },
  center: {
    Icon: ThemedMessageSquare,
    title: "中区 · 对话区",
    subtitle:
      "空态问候 / Composer / 对话流 —— 全属对话模块，本壳不画。中区恒在、自适应填满剩余宽。",
    tag: "空占位 · 属对话模块",
  },
  right: {
    Icon: ThemedPanelRight,
    title: "右栏 · 工作面板区",
    subtitle: "审查 / 终端 / 浏览器 / 文件预览 等 tab 及其内容",
    tag: "空占位 · 属工作面板模块",
  },
  fileTree: {
    Icon: ThemedFolderTree,
    title: "目录树区",
    subtitle: "工作目录文件树浏览",
    tag: "空占位 · 属目录树模块",
  },
  settingsNav: {
    Icon: ThemedSliders,
    title: "设置导航区",
    subtitle: "主机段（主机 / 模型与提供方 / 用量…）+ 应用段（通用 / 外观 / 快捷键 / 诊断 / 关于）",
    tag: "空占位 · 属设置模块",
  },
  settingsContent: {
    Icon: ThemedSettings,
    title: "设置内容区（master-detail）",
    subtitle: "选中左导航某项 → 此处渲染对应设置详情",
    tag: "空占位 · 属各设置子需求",
  },
};

export function RegionPlaceholder({ variant }: { variant: ZoneVariant }) {
  const { Icon, title, subtitle, tag } = ZONE_COPY[variant];
  return (
    <View style={styles.zone}>
      <View style={styles.iconBox}>
        <Icon size={20} uniProps={iconMuted} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <Text style={styles.tag}>{tag}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  zone: {
    flex: 1,
    minHeight: 0,
    margin: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: SHELL_COLORS[theme.colorScheme].border,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: SHELL_COLORS[theme.colorScheme].toggleActive,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: SHELL_COLORS[theme.colorScheme].foreground,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 11.5,
    lineHeight: 17,
    color: SHELL_COLORS[theme.colorScheme].foregroundMuted,
    maxWidth: 240,
    textAlign: "center",
  },
  tag: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: SHELL_COLORS[theme.colorScheme].foregroundMuted,
    borderWidth: 1,
    borderColor: SHELL_COLORS[theme.colorScheme].border,
    borderRadius: 9999,
    paddingVertical: 2,
    paddingHorizontal: 9,
    overflow: "hidden",
  },
}));
