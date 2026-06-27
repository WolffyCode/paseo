import { FolderTree, GitBranch, MoreHorizontal, PanelLeft, PanelRight } from "lucide-react-native";
import { useCallback, useMemo, useState, type ComponentType } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { isWeb } from "@/constants/platform";
import type { ShellRegion, TopBarModel } from "@/stores/shell-regions";
import type { Theme } from "@/styles/theme";
import { useWindowControlsPadding } from "@/utils/desktop-window";

// The single window-wide top bar (h40, transparent over the window backdrop). It
// absorbs the three formerly-scattered chrome strips: the root traffic-light row,
// the left sidebar's window chrome, and the workspace screen's own header. Pure
// presentation + dispatch: it renders the derived TopBarModel and reports toggle
// taps; title/project/branch/menu behaviors are deferred (slots only this phase).
interface UnifiedTopBarProps {
  model: TopBarModel;
  onToggleRegion: (region: ShellRegion) => void;
}

const ThemedPanelLeft = withUnistyles(PanelLeft);
const ThemedPanelRight = withUnistyles(PanelRight);
const ThemedFolderTree = withUnistyles(FolderTree);
const ThemedMore = withUnistyles(MoreHorizontal);
const ThemedBranch = withUnistyles(GitBranch);

// Module-level color mappers — keeping them out of JSX avoids the new-function-as-prop
// lint while staying theme-reactive.
const activeIconColor = (theme: Theme) => ({ color: theme.colors.foreground });
const mutedIconColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

// Resolve a toggle's visual variant. `default` is unistyles' implicit fallback, so
// the resting state is `undefined`; hover only fires on web.
function toggleVariant(active: boolean, hovered: boolean): "active" | "hovered" | undefined {
  if (active) {
    return "active";
  }
  if (isWeb && hovered) {
    return "hovered";
  }
  return undefined;
}

export function UnifiedTopBar({ model, onToggleRegion }: UnifiedTopBarProps) {
  // Reserve the native traffic-light footprint at the bar's left (always present —
  // the bar spans the whole window above every card). Empty bar areas stay draggable.
  const windowControls = useWindowControlsPadding("sidebar");
  const barStyle = useMemo(
    () => [styles.bar, { paddingLeft: windowControls.left }],
    [windowControls.left],
  );
  return (
    <View style={barStyle}>
      <TitlebarDragRegion />
      <TopBarToggle
        icon={ThemedPanelLeft}
        region="left"
        toggle={model.left}
        onToggleRegion={onToggleRegion}
      />
      {model.title != null ? (
        <Text style={styles.title} numberOfLines={1}>
          {model.title}
        </Text>
      ) : null}
      {model.projectName != null ? (
        <View style={styles.ghost}>
          <Text style={styles.ghostText} numberOfLines={1}>
            {model.projectName}
          </Text>
        </View>
      ) : null}
      <View style={styles.menuSlot}>
        <ThemedMore size={16} uniProps={mutedIconColor} />
      </View>
      <View style={styles.spacer} />
      {model.branch != null ? (
        <View style={styles.ghost}>
          <ThemedBranch size={14} uniProps={mutedIconColor} />
          <Text style={styles.ghostText} numberOfLines={1}>
            {model.branch.name}
          </Text>
          {model.branch.dirtyCount > 0 ? (
            <Text style={styles.dirty}>{model.branch.dirtyCount}</Text>
          ) : null}
        </View>
      ) : null}
      <TopBarToggle
        icon={ThemedFolderTree}
        region="fileTree"
        toggle={model.fileTree}
        onToggleRegion={onToggleRegion}
      />
      <TopBarToggle
        icon={ThemedPanelRight}
        region="right"
        toggle={model.right}
        onToggleRegion={onToggleRegion}
      />
    </View>
  );
}

interface ThemedIconProps {
  size?: number;
  uniProps?: (theme: Theme) => { color: string };
}

// One 28x28 top-bar toggle. The active fill (#eaeef2 secondary) is the primary
// open-state signal; hover is a faint fill on web only.
function TopBarToggle({
  icon: Icon,
  region,
  toggle,
  onToggleRegion,
}: {
  icon: ComponentType<ThemedIconProps>;
  region: ShellRegion;
  toggle: { active: boolean; enabled: boolean };
  onToggleRegion: (region: ShellRegion) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const handlePress = useCallback(() => onToggleRegion(region), [onToggleRegion, region]);
  const handleHoverIn = useCallback(() => setHovered(true), []);
  const handleHoverOut = useCallback(() => setHovered(false), []);
  const accessibilityState = useMemo(
    () => ({ expanded: toggle.active, disabled: !toggle.enabled }),
    [toggle.active, toggle.enabled],
  );

  styles.useVariants({ state: toggleVariant(toggle.active, hovered) });
  return (
    <Pressable
      disabled={!toggle.enabled}
      onPress={handlePress}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={styles.toggle}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
    >
      <Icon size={16} uniProps={toggle.active ? activeIconColor : mutedIconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  bar: {
    position: "relative",
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[1],
  },
  toggle: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    variants: {
      state: {
        default: { backgroundColor: "transparent" },
        hovered: { backgroundColor: theme.colors.surfaceSidebarHover },
        active: { backgroundColor: theme.colors.secondary },
      },
    },
  },
  title: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
    maxWidth: 280,
  },
  ghost: {
    height: 26,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    maxWidth: 200,
  },
  ghostText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  dirty: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.statusWarning,
  },
  menuSlot: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  spacer: {
    flex: 1,
  },
}));
