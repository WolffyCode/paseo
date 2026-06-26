import { SquarePen } from "lucide-react-native";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { SidebarMenuToggle } from "@/components/headers/menu-header";
import type { Theme } from "@/styles/theme";
import { useWindowControlsPadding } from "@/utils/desktop-window";

// Theme-reactive icon leaf: icon color is a non-style prop, so it rides withUnistyles + uniProps
// (not useUnistyles, which is banned).
const ThemedSquarePen = withUnistyles(SquarePen);

const mutedIconColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const activeIconColor = (theme: Theme) => ({ color: theme.colors.foreground });

const NO_SHORTCUT_KEYS: [] = [];
// 反馈: 顶栏图标缩小到 15 (比标准 md=16 小 1px), 与左侧 □ (menu-header) 保持一致。
const CHROME_ICON_SIZE = 15;
// Chrome strip height centers the toggle / back-forward icons on the macOS traffic lights to their left.
// Measured from a real OS screenshot: the 3 light dots are Ø14px, 23px center-to-center, geometric vertical
// center ≈ y20.5. Eye-calibrated: the square toggle reads aligned when its center sits ~y21, so height = 42
// → toggle center = 42/2 = 21.
// 反馈: 展开收起图标要跟苹果关闭/最小化按钮同一条水平线 (eye-calibrated 到 y21)。
const CHROME_ROW_HEIGHT = 42;
// 反馈: 展开收起图标(及其后的 ‹ › ✎)整体再往右移 2px,与交通灯多留点间距。
// 加在 paddingLeft 上 → web(无交通灯,离左边缘)与 Electron(离交通灯)同步偏移。
const TOGGLE_LEFT_NUDGE = 2;

interface SidebarWindowChromeProps {
  /** Collapsed: the bar lives in the canvas top bar (sidebar hidden) and gains a ✎ new-conversation icon. */
  collapsed: boolean;
  /** Start a fresh draft — only surfaced in the collapsed bar (expanded sidebar has its own new-conversation row). */
  onNewConversation: () => void;
}

/**
 * Window-chrome strip pinned to the top-left of the window (desktop pinned only). It carries the
 * traffic-light gap + drag region and the sidebar toggle so those window-level controls stay out of the
 * canvas top bar (反馈 1). It renders in two places by design — expanded it sits atop the left sidebar;
 * collapsed it rides the canvas top bar's left edge so the strip and traffic lights never vanish when the
 * sidebar is hidden (反馈 4a), and gains a ✎ new-conversation icon. Collapsed mode drops the traffic-light
 * gap/drag region because the canvas top bar already owns that padding.
 */
export function SidebarWindowChrome({ collapsed, onNewConversation }: SidebarWindowChromeProps) {
  const { t } = useTranslation();
  const padding = useWindowControlsPadding("sidebar");

  // Height = CHROME_ROW_HEIGHT so the toggle / back-forward icon centers line up with the macOS traffic
  // lights to the left (反馈: 展开收起图标要跟苹果关闭/最小化按钮在同一条水平线). paddingLeft = lights width
  // + TOGGLE_LEFT_NUDGE pushes the toggle 2px further right of the lights (反馈).
  const rowStyle = useMemo(
    () =>
      collapsed
        ? styles.rowCollapsed
        : [
            styles.rowExpanded,
            { paddingLeft: padding.left + TOGGLE_LEFT_NUDGE, minHeight: CHROME_ROW_HEIGHT },
          ],
    [collapsed, padding.left],
  );

  return (
    <View style={rowStyle}>
      {collapsed ? null : <TitlebarDragRegion />}
      <SidebarMenuToggle tooltipSide="bottom" testID="sidebar-window-chrome-toggle" />
      {collapsed ? (
        <HeaderToggleButton
          testID="sidebar-window-chrome-new"
          onPress={onNewConversation}
          tooltipLabel={t("sidebar.actions.newConversation")}
          tooltipKeys={NO_SHORTCUT_KEYS}
          tooltipSide="bottom"
          accessibilityRole="button"
          accessibilityLabel={t("sidebar.actions.newConversation")}
        >
          {({ hovered }) => (
            <ThemedSquarePen
              size={CHROME_ICON_SIZE}
              uniProps={pickChromeIconColor(true, hovered)}
            />
          )}
        </HeaderToggleButton>
      ) : (
        // Expanded: the remaining width is the window drag region (TitlebarDragRegion overlays it).
        <View style={styles.dragSpacer} />
      )}
    </View>
  );
}

// Icon color: foreground on hover (enabled only), muted otherwise. Disabled also dims via opacity.
function pickChromeIconColor(enabled: boolean, hovered: boolean) {
  return enabled && hovered ? activeIconColor : mutedIconColor;
}

const styles = StyleSheet.create((theme) => ({
  rowExpanded: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: theme.spacing[1.5],
  },
  rowCollapsed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    // 收起态整行(□✎+标题)对齐到展开态 □(贴交通灯)的水平左移 + 垂直下移,由 canvas 顶栏的 leftStyle
    // 统一处理(见 workspace-screen headerLeft 的 collapsedHeaderLeftAlign),让图标和标题一起移、保持间距。
  },
  dragSpacer: {
    flex: 1,
    alignSelf: "stretch",
  },
}));
