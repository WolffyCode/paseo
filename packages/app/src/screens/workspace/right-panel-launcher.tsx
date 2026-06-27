import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Shortcut } from "@/components/ui/shortcut";
import {
  useWorkspaceToolMenuItems,
  type WorkspaceToolsAddHandlers,
} from "@/screens/workspace/workspace-desktop-tabs-row";

interface RightPanelLauncherProps {
  handlers: WorkspaceToolsAddHandlers;
  showCreateBrowserTab: boolean;
}

/**
 * The right panel's default state (反馈②): a vertical launcher of the four dockable tools
 * (审查/终端/浏览器/文件, each with its shortcut). Shown while the tools pane holds no tab; picking a
 * row opens that tool and flips the panel to its tab strip. Rendered only when
 * `selectRightPanelMode(layout) === "launcher"` — the model owns visibility, this only renders.
 */
export function RightPanelLauncher({ handlers, showCreateBrowserTab }: RightPanelLauncherProps) {
  const items = useWorkspaceToolMenuItems({
    handlers,
    showCreateBrowserTab,
    includeSideChat: false,
  });
  return (
    <View style={styles.container}>
      <View style={styles.list}>
        {items.map((item) => (
          <Pressable
            key={item.key}
            testID={`right-panel-launcher-${item.key}`}
            onPress={item.onSelect}
            style={launcherRowStyle}
          >
            {item.leading}
            <Text style={styles.label}>{item.label}</Text>
            {item.shortcutKeys ? (
              <Shortcut chord={item.shortcutKeys} style={styles.shortcut} />
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
  },
  list: {
    width: "100%",
    maxWidth: 360,
    gap: theme.spacing[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  // Self-styled hover lighten (web only; native keeps the base surface). Self-contained per
  // docs/hover.md — the Pressable styles itself, no sibling reveal, so the render-prop form is safe.
  rowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  label: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  shortcut: {
    backgroundColor: "transparent",
  },
}));

function launcherRowStyle({ hovered }: PressableStateCallbackType) {
  return hovered ? [styles.row, styles.rowHovered] : styles.row;
}
