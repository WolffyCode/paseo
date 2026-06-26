import { type Href, router } from "expo-router";
import { ChevronLeft, ChevronRight, SquarePen } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { SidebarMenuToggle } from "@/components/headers/menu-header";
import {
  selectConversationCanGoBack,
  selectConversationCanGoForward,
  useConversationHistoryStore,
} from "@/stores/conversation-history-store";
import type { Theme } from "@/styles/theme";
import { useWindowControlsPadding } from "@/utils/desktop-window";

// Theme-reactive icon leaves: icon color is a non-style prop, so it rides withUnistyles + uniProps
// (not useUnistyles, which is banned). Disabled dimming is plain opacity on the style prop.
const ThemedChevronLeft = withUnistyles(ChevronLeft);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedSquarePen = withUnistyles(SquarePen);

const mutedIconColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const activeIconColor = (theme: Theme) => ({ color: theme.colors.foreground });

const NO_SHORTCUT_KEYS: [] = [];
const CHROME_ICON_SIZE = 16;

interface SidebarWindowChromeProps {
  /** Collapsed: the bar lives in the canvas top bar (sidebar hidden) and gains a ✎ new-conversation icon. */
  collapsed: boolean;
  /** Start a fresh draft — only surfaced in the collapsed bar (expanded sidebar has its own new-conversation row). */
  onNewConversation: () => void;
}

/**
 * Window-chrome strip pinned to the top-left of the window (desktop pinned only). It carries the
 * traffic-light gap + drag region, the sidebar toggle, and conversation back/forward arrows so those
 * window-level controls stay out of the canvas top bar (反馈 1). It renders in two places by design —
 * expanded it sits atop the left sidebar; collapsed it rides the canvas top bar's left edge so the
 * strip and traffic lights never vanish when the sidebar is hidden (反馈 4a). Collapsed mode drops the
 * traffic-light gap/drag region because the canvas top bar already owns that padding.
 */
export function SidebarWindowChrome({ collapsed, onNewConversation }: SidebarWindowChromeProps) {
  const { t } = useTranslation();
  const padding = useWindowControlsPadding("sidebar");
  const canGoBack = useConversationHistoryStore(selectConversationCanGoBack);
  const canGoForward = useConversationHistoryStore(selectConversationCanGoForward);
  const goBack = useConversationHistoryStore((state) => state.goBack);
  const goForward = useConversationHistoryStore((state) => state.goForward);

  // Arrows are pure dispatch: the store returns the route (a pathname string) to navigate to, or null
  // when disabled. The history store stays framework-agnostic, so the string is cast to the router's
  // typed Href at this navigation boundary (the stored value was a live route when it was recorded).
  const handleBack = useCallback(() => {
    const route = goBack();
    if (route) router.navigate(route as Href);
  }, [goBack]);
  const handleForward = useCallback(() => {
    const route = goForward();
    if (route) router.navigate(route as Href);
  }, [goForward]);

  const rowStyle = useMemo(
    () =>
      collapsed
        ? styles.rowCollapsed
        : [styles.rowExpanded, { paddingLeft: padding.left, minHeight: padding.top }],
    [collapsed, padding.left, padding.top],
  );

  return (
    <View style={rowStyle}>
      {collapsed ? null : <TitlebarDragRegion />}
      <SidebarMenuToggle tooltipSide="bottom" testID="sidebar-window-chrome-toggle" />
      <View style={styles.navGroup}>
        <HeaderToggleButton
          testID="sidebar-window-chrome-back"
          onPress={handleBack}
          disabled={!canGoBack}
          tooltipLabel={t("common.actions.back")}
          tooltipKeys={NO_SHORTCUT_KEYS}
          tooltipSide="bottom"
          accessibilityRole="button"
          accessibilityLabel={t("common.actions.back")}
        >
          {({ hovered }) => (
            <ThemedChevronLeft
              size={CHROME_ICON_SIZE}
              uniProps={pickChromeIconColor(canGoBack, hovered)}
              style={canGoBack ? undefined : styles.iconDisabled}
            />
          )}
        </HeaderToggleButton>
        <HeaderToggleButton
          testID="sidebar-window-chrome-forward"
          onPress={handleForward}
          disabled={!canGoForward}
          tooltipLabel={t("common.actions.forward")}
          tooltipKeys={NO_SHORTCUT_KEYS}
          tooltipSide="bottom"
          accessibilityRole="button"
          accessibilityLabel={t("common.actions.forward")}
        >
          {({ hovered }) => (
            <ThemedChevronRight
              size={CHROME_ICON_SIZE}
              uniProps={pickChromeIconColor(canGoForward, hovered)}
              style={canGoForward ? undefined : styles.iconDisabled}
            />
          )}
        </HeaderToggleButton>
      </View>
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
  },
  navGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  dragSpacer: {
    flex: 1,
    alignSelf: "stretch",
  },
  iconDisabled: {
    opacity: 0.4,
  },
}));
