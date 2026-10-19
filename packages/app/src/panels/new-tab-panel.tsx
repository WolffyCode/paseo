import { memo, useCallback, useMemo, useRef, type ReactElement } from "react";
import { Pressable, ScrollView, Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { House, Pencil, Plus } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { TerminalProfileIcon } from "@/components/terminal-profile-icon";
import { Button } from "@/components/ui/button";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import type { KeyboardActionDefinition } from "@/keyboard/keyboard-action-dispatcher";
import { usePaneContext, usePaneFocus } from "@/panels/pane-context";
import { definePanel, type PanelDescriptorContext } from "@/panels/panel-registry";
import { newTabPresentation } from "@/panels/new-tab-presentation";
import {
  LAUNCHER_ICON_SIZE,
  LAUNCHER_ROW_DATA_SET,
  LauncherShortcut,
  ThemedLauncherIcon,
  useLauncherRowNavigation,
} from "@/panels/launcher-rows";
import { ICON_SIZE, SPACING, type Theme } from "@/styles/theme";
import { ContentHome } from "@/workbench/content-home";
import {
  useWorkspaceTabLaunchCatalog,
  type WorkspaceTabLaunchItem,
} from "@/workspace-tabs/launcher";

const ThemedPlus = withUnistyles(Plus);
const ThemedHouse = withUnistyles(House);
const ThemedPencil = withUnistyles(Pencil);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const extraMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundExtraMuted,
});
const LAUNCHER_MAX_WIDTH = 380;
const EDIT_PROFILES_HIT_SIZE = ICON_SIZE.xs + SPACING[2];

function rowStyle({
  pressed,
  hovered = false,
  focused = false,
}: PressableStateCallbackType & { hovered?: boolean; focused?: boolean }) {
  return [
    styles.row,
    (hovered || focused) && styles.rowHovered,
    focused && styles.rowFocused,
    pressed && styles.rowPressed,
  ];
}

function editProfilesStyle({ pressed, hovered }: PressableStateCallbackType) {
  return [styles.editProfiles, (hovered || pressed) && styles.editProfilesHovered];
}

function EditProfilesButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={editProfilesStyle}
      testID="workspace-new-tab-edit-terminal-profiles"
    >
      <View style={styles.editProfilesGlyph}>
        <ThemedPencil size={ICON_SIZE.xs} uniProps={extraMutedColorMapping} />
      </View>
    </Pressable>
  );
}

function LauncherRow({ item }: { item: WorkspaceTabLaunchItem }) {
  const { tabId } = usePaneContext();
  const handlePress = useCallback(() => {
    item.launch({ kind: "replace", tabId });
  }, [item, tabId]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      dataSet={LAUNCHER_ROW_DATA_SET}
      disabled={item.disabled}
      onPress={handlePress}
      style={rowStyle}
      tabIndex={-1}
      testID={`workspace-new-tab-${item.id}`}
    >
      {item.Icon ? <ThemedLauncherIcon Icon={item.Icon} uniProps={mutedColorMapping} /> : null}
      {item.terminalIconKey ? (
        <TerminalProfileIcon iconKey={item.terminalIconKey} size={LAUNCHER_ICON_SIZE} />
      ) : null}
      <Text numberOfLines={1} style={styles.rowLabel}>
        {item.label}
      </Text>
      {item.shortcutActionId ? <LauncherShortcut actionId={item.shortcutActionId} /> : null}
    </Pressable>
  );
}

function useNewTabDescriptor(_target: { kind: "new_tab" }, context: PanelDescriptorContext) {
  const { t } = useTranslation();
  const presentation = newTabPresentation(context.paneId);
  const label = t(presentation.labelKey);
  return {
    label,
    subtitle: label,
    tooltip: label,
    titleState: "ready" as const,
    icon: presentation.icon === "home" ? ThemedHouse : ThemedPlus,
    statusBucket: null,
  };
}

function EmptyConversation({ item }: { item: WorkspaceTabLaunchItem }) {
  const { t } = useTranslation();
  const { tabId } = usePaneContext();
  const create = useCallback(() => item.launch({ kind: "replace", tabId }), [item, tabId]);
  return (
    <View style={styles.contentEmpty}>
      <Button variant="ghost" leftIcon={Pencil} onPress={create}>
        {t("newWorkspace.title")}
      </Button>
    </View>
  );
}

const NewTabPanel = memo(function NewTabPanel(): ReactElement {
  const { host, serverId, tabId } = usePaneContext();
  const { isInteractive, focusPane } = usePaneFocus();
  const containerRef = useRef<View | null>(null);
  const groups = useWorkspaceTabLaunchCatalog({
    serverId,
    purpose: host === "explorer" ? "supporting" : "primary",
    host,
    surface: "panel",
  });
  const itemsById = useMemo(
    () => new Map(groups.flatMap((group) => group.items).map((item) => [item.id, item])),
    [groups],
  );
  const handlesWorkspaceShortcuts = isInteractive && host === "main";

  // The column 3 home also opens on its own, where a preselected row reads as a stuck hover.
  useLauncherRowNavigation({
    containerRef,
    isInteractive,
    focusPane,
    preselectFirstRow: host !== "content",
  });

  const handleKeyboardAction = useCallback(
    (action: KeyboardActionDefinition): boolean => {
      if (action.id === "workspace.agent.new" || action.id === "workspace.tab.target.agent") {
        itemsById.get("agent")?.launch({ kind: "replace", tabId });
        return true;
      }
      if (action.id === "workspace.terminal.new") {
        itemsById.get("terminal")?.launch({ kind: "replace", tabId });
        return true;
      }
      if (action.id === "workspace.browser.new" || action.id === "workspace.tab.target.browser") {
        itemsById.get("browser")?.launch({ kind: "replace", tabId });
        return true;
      }
      if (action.id === "workspace.tab.target.changes") {
        const changesItem = itemsById.get("changes") ?? itemsById.get("diff");
        if (!changesItem) return false;
        changesItem.launch({ kind: "replace", tabId });
        return true;
      }
      if (action.id === "workspace.tab.target.files") {
        const filesItem = itemsById.get("files");
        if (!filesItem) return false;
        filesItem.launch({ kind: "replace", tabId });
        return true;
      }
      return false;
    },
    [itemsById, tabId],
  );
  useKeyboardActionHandler({
    handlerId: `new-tab:${tabId}`,
    actions: [
      "workspace.agent.new",
      "workspace.terminal.new",
      "workspace.browser.new",
      "workspace.tab.target.agent",
      "workspace.tab.target.browser",
      "workspace.tab.target.changes",
      "workspace.tab.target.files",
    ],
    enabled: handlesWorkspaceShortcuts,
    priority: 250,
    handle: handleKeyboardAction,
  });

  const conversationItem = itemsById.get("agent");
  if (host === "conversations" && conversationItem)
    return <EmptyConversation item={conversationItem} />;
  if (host === "content")
    return (
      <View
        ref={containerRef}
        style={styles.homeContainer}
        tabIndex={-1}
        testID="workbench-content-home"
      >
        <ContentHome catalog={groups} />
      </View>
    );

  return (
    <View ref={containerRef} style={styles.container} testID="workspace-new-tab-panel">
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.rail}>
          {groups.map((group) => (
            <View key={group.id} style={styles.group}>
              {group.label ? (
                <View style={styles.groupHeader}>
                  <Text style={styles.groupLabel}>{group.label}</Text>
                  {group.accessory ? (
                    <EditProfilesButton
                      label={group.accessory.label}
                      onPress={group.accessory.run}
                    />
                  ) : null}
                </View>
              ) : null}
              {group.items.map((item) => (
                <LauncherRow key={item.id} item={item} />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
});

export const newTabPanelRegistration = definePanel("new_tab", {
  component: NewTabPanel,
  useDescriptor: useNewTabDescriptor,
});

const styles = StyleSheet.create((theme) => ({
  contentEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  container: {
    flex: 1,
  },
  // The home's container holds keyboard focus until an arrow key picks a row; it is not a control.
  homeContainer: {
    flex: 1,
    outlineWidth: 0,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
  },
  rail: {
    width: "100%",
    maxWidth: LAUNCHER_MAX_WIDTH,
    gap: theme.spacing[12],
  },
  group: {
    gap: theme.spacing[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: 44,
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: "transparent",
    outlineWidth: 0,
    outlineColor: "transparent",
    backgroundColor: theme.colors.surface1,
  },
  rowHovered: { backgroundColor: theme.colors.surface2 },
  rowFocused: { borderColor: theme.colors.borderAccent },
  rowPressed: { opacity: 0.85 },
  rowLabel: { flex: 1, color: theme.colors.foreground },
  // The section header shares the launcher rows' outer rails. The pencil's own
  // padding is subtracted so its glyph — not its hover box — lands on the right rail.
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginBottom: theme.spacing[1],
  },
  groupLabel: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
    // Without an explicit line height the font's ascent/descent split the text box
    // unevenly and the label rides above the pencil beside it.
    lineHeight: EDIT_PROFILES_HIT_SIZE,
  },
  // The box is the hover target; the negative margin cancels its growth on every
  // side, so its layout footprint stays the glyph and the header keeps its height.
  editProfiles: {
    width: EDIT_PROFILES_HIT_SIZE,
    height: EDIT_PROFILES_HIT_SIZE,
    margin: -(EDIT_PROFILES_HIT_SIZE - ICON_SIZE.xs) / 2,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  // Opacity sits on the whole glyph, not per path — the pencil's two strokes
  // overlap and would render unevenly if each faded on its own.
  editProfilesGlyph: {
    opacity: theme.opacity[50],
  },
  editProfilesHovered: {
    backgroundColor: theme.colors.surface2,
  },
}));
