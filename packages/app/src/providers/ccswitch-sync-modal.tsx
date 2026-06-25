import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import type { SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useCcSwitchSync } from "@/providers/use-ccswitch-sync";
import type { CcSwitchSyncItem } from "@/providers/use-ccswitch-sync";
import { stringToColor } from "@/providers/vendor-icon-color";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CcSwitchSyncModalProps {
  visible: boolean;
  serverId: string;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface TabBarProps {
  selectedCli: "claude" | "codex";
  countByCli: Record<"claude" | "codex", number>;
  onSelectClaude: () => void;
  onSelectCodex: () => void;
}

const claudeTabA11yState = { selected: true } as const;
const codexTabA11yState = { selected: true } as const;
const unselectedTabA11yState = { selected: false } as const;

function TabBar({ selectedCli, countByCli, onSelectClaude, onSelectCodex }: TabBarProps) {
  const { t } = useTranslation();
  const claudeSelected = selectedCli === "claude";
  const codexSelected = selectedCli === "codex";
  return (
    <View style={styles.tabBar}>
      <Pressable
        onPress={onSelectClaude}
        accessibilityRole="tab"
        accessibilityState={claudeSelected ? claudeTabA11yState : unselectedTabA11yState}
        style={claudeSelected ? styles.tabSelected : styles.tab}
      >
        <Text style={claudeSelected ? styles.tabTextSelected : styles.tabText}>
          {t("settings.vendors.sync.tabLabel", { name: "Claude Code", count: countByCli.claude })}
        </Text>
      </Pressable>
      <Pressable
        onPress={onSelectCodex}
        accessibilityRole="tab"
        accessibilityState={codexSelected ? codexTabA11yState : unselectedTabA11yState}
        style={codexSelected ? styles.tabSelected : styles.tab}
      >
        <Text style={codexSelected ? styles.tabTextSelected : styles.tabText}>
          {t("settings.vendors.sync.tabLabel", { name: "Codex", count: countByCli.codex })}
        </Text>
      </Pressable>
    </View>
  );
}

type StatusKind = "new" | "update" | "same";

function getStatusBadgeStyle(status: StatusKind) {
  if (status === "new") return styles.statusBadgeNew;
  if (status === "update") return styles.statusBadgeUpdate;
  return styles.statusBadgeSame;
}

function getStatusBadgeTextStyle(status: StatusKind) {
  if (status === "new") return styles.statusBadgeNewText;
  if (status === "update") return styles.statusBadgeUpdateText;
  return styles.statusBadgeSameText;
}

interface StatusBadgeProps {
  status: StatusKind;
}

function getStatusI18nKey(status: StatusKind): string {
  if (status === "new") return "settings.vendors.sync.statusNew";
  if (status === "update") return "settings.vendors.sync.statusUpdate";
  return "settings.vendors.sync.statusSame";
}

function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();
  const label = t(getStatusI18nKey(status));
  return (
    <View style={getStatusBadgeStyle(status)}>
      <Text style={getStatusBadgeTextStyle(status)}>{label}</Text>
    </View>
  );
}

interface VendorIconBadgeProps {
  name: string;
}

function VendorIconBadge({ name }: VendorIconBadgeProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "V";
  const bg = stringToColor(name || "V");
  const badgeStyle = useMemo(() => [styles.vendorIconBadge, { backgroundColor: bg }], [bg]);
  return (
    <View style={badgeStyle}>
      <Text style={styles.vendorIconBadgeText}>{initial}</Text>
    </View>
  );
}

const checkedA11yState = { checked: true } as const;
const uncheckedA11yState = { checked: false } as const;

interface SyncItemRowProps {
  item: CcSwitchSyncItem;
  selected: boolean;
  onToggle: (id: string) => void;
}

function SyncItemRow({ item, selected, onToggle }: SyncItemRowProps) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onToggle(item.ccSwitchId), [item.ccSwitchId, onToggle]);
  const checkboxStyle = useMemo(
    () => [styles.checkbox, selected ? styles.checkboxChecked : null],
    [selected],
  );
  const checkmark = selected ? "✓" : "";

  return (
    <View style={styles.itemRow}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="checkbox"
        accessibilityState={selected ? checkedA11yState : uncheckedA11yState}
        style={styles.itemPressable}
      >
        <View style={checkboxStyle}>
          {selected ? <Text style={styles.checkboxMark}>{checkmark}</Text> : null}
        </View>
        <VendorIconBadge name={item.name} />
        <View style={styles.itemMeta}>
          <View style={styles.itemNameRow}>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.name}
            </Text>
            <StatusBadge status={item.status} />
          </View>
          <Text style={styles.itemUrl} numberOfLines={1}>
            {item.baseUrl}
            {" · "}
            {t("settings.vendors.sync.modelCount", { count: item.modelCount })}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CcSwitchSyncModal({ visible, serverId, onClose }: CcSwitchSyncModalProps) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const [applyError, setApplyError] = useState<string | null>(null);

  const {
    state,
    selectedCli,
    setSelectedCli,
    itemsByCli,
    countByCli,
    selectedIds,
    toggle,
    selectAll,
    summary,
    apply,
    isApplying,
  } = useCcSwitchSync(serverId, visible);

  const handleSelectClaude = useCallback(() => setSelectedCli("claude"), [setSelectedCli]);
  const handleSelectCodex = useCallback(() => setSelectedCli("codex"), [setSelectedCli]);
  const handleSelectAll = useCallback(() => {
    setApplyError(null);
    selectAll(selectedCli, true);
  }, [selectAll, selectedCli]);
  const handleSelectNone = useCallback(() => {
    setApplyError(null);
    selectAll(selectedCli, false);
  }, [selectAll, selectedCli]);

  const handleApply = useCallback(async () => {
    setApplyError(null);
    const result = await apply();
    if (result.ok) {
      onClose();
    } else {
      setApplyError(result.error ?? t("settings.vendors.sync.applyFailed"));
    }
  }, [apply, onClose, t]);
  const handleApplyPress = useCallback(() => void handleApply(), [handleApply]);

  const header = useMemo<SheetHeader>(
    () => ({
      title: t("settings.vendors.sync.title"),
    }),
    [t],
  );

  const footer = useMemo(
    () => (
      <View style={styles.footerInner}>
        <View style={styles.footerLeft}>
          <Text style={styles.footerSummary}>
            {state.kind === "ready"
              ? t("settings.vendors.sync.footerSummary", {
                  selected: summary.selected,
                  total: summary.total,
                  newCount: summary.newCount,
                  updateCount: summary.updateCount,
                })
              : ""}
          </Text>
          {applyError ? (
            <Text style={styles.footerError} numberOfLines={2}>
              {t("settings.vendors.sync.applyFailed")}
              {": "}
              {applyError}
            </Text>
          ) : null}
        </View>
        <View style={styles.footerButtons}>
          <Button variant="outline" size="sm" onPress={onClose}>
            {t("common.actions.cancel")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onPress={handleApplyPress}
            disabled={isApplying || state.kind !== "ready" || summary.selected === 0}
            loading={isApplying}
          >
            {t("settings.vendors.sync.importButton")}
          </Button>
        </View>
      </View>
    ),
    [state, summary, onClose, handleApplyPress, isApplying, applyError, t],
  );

  const desktopMaxWidth = isCompact ? undefined : 560;

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={onClose}
      footer={footer}
      scrollable
      desktopMaxWidth={desktopMaxWidth}
    >
      {/* Subtitle */}
      <Text style={styles.subtitle}>{t("settings.vendors.sync.subtitle")}</Text>

      {/* Loading state */}
      {state.kind === "loading" ? (
        <View style={styles.centerState}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>{t("settings.vendors.sync.loading")}</Text>
        </View>
      ) : null}

      {/* Error state */}
      {state.kind === "error" ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>
            {t("settings.vendors.sync.errorPrefix")}
            {state.message}
          </Text>
        </View>
      ) : null}

      {/* Ready state */}
      {state.kind === "ready" ? (
        <>
          {/* Tab bar */}
          <TabBar
            selectedCli={selectedCli}
            countByCli={countByCli}
            onSelectClaude={handleSelectClaude}
            onSelectCodex={handleSelectCodex}
          />

          {/* Select header row */}
          <View style={styles.selectHeader}>
            <Text style={styles.selectHeading}>{t("settings.vendors.sync.selectHeading")}</Text>
            <View style={styles.selectAllRow}>
              <Pressable
                onPress={handleSelectAll}
                accessibilityRole="button"
                style={styles.selectAllButton}
              >
                <Text style={styles.selectAllText}>{t("settings.vendors.sync.selectAll")}</Text>
              </Pressable>
              <Text style={styles.selectAllSep}> · </Text>
              <Pressable
                onPress={handleSelectNone}
                accessibilityRole="button"
                style={styles.selectAllButton}
              >
                <Text style={styles.selectAllText}>{t("settings.vendors.sync.selectNone")}</Text>
              </Pressable>
            </View>
          </View>

          {/* Item list */}
          <View style={styles.itemList}>
            {itemsByCli[selectedCli].map((item) => (
              <SyncItemRow
                key={item.ccSwitchId}
                item={item}
                selected={selectedIds.has(item.ccSwitchId)}
                onToggle={toggle}
              />
            ))}
            {itemsByCli[selectedCli].length === 0 ? <Text style={styles.emptyText}>—</Text> : null}
          </View>

          {/* Footnote */}
          <Text style={styles.footnote}>{t("settings.vendors.sync.footnote")}</Text>
        </>
      ) : null}
    </AdaptiveModalSheet>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create((theme) => ({
  subtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    fontFamily: "ui-monospace, monospace",
    lineHeight: 17,
    marginBottom: theme.spacing[3],
  },
  centerState: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: theme.spacing[6],
    gap: theme.spacing[3],
  },
  loadingText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.palette.red[300],
    textAlign: "center" as const,
    lineHeight: 20,
  },
  tabBar: {
    flexDirection: "row" as const,
    gap: theme.spacing[1],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginBottom: theme.spacing[3],
  },
  tab: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabSelected: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.accent,
  },
  tabText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    fontWeight: theme.fontWeight.medium,
  },
  tabTextSelected: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.semibold,
  },
  selectHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: theme.spacing[2],
  },
  selectHeading: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    fontWeight: theme.fontWeight.semibold,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  selectAllRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },
  selectAllButton: {
    paddingHorizontal: theme.spacing[1],
    paddingVertical: 2,
  },
  selectAllText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.accent,
  },
  selectAllSep: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  itemList: {
    gap: theme.spacing[1],
  },
  itemRow: {
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden" as const,
  },
  itemPressable: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: "transparent",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  checkboxMark: {
    fontSize: 10,
    color: "#ffffff",
    fontWeight: "700" as const,
    lineHeight: 14,
  },
  vendorIconBadge: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  vendorIconBadgeText: {
    color: "#ffffff",
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
  },
  itemMeta: {
    flex: 1,
    minWidth: 0,
  },
  itemNameRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing[2],
    flexWrap: "wrap" as const,
  },
  itemName: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  itemUrl: {
    fontSize: 11,
    color: theme.colors.foregroundMuted,
    fontFamily: "ui-monospace, monospace",
    marginTop: 2,
  },
  // Status badges
  statusBadgeNew: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "#10261c",
    borderColor: "#1d4533",
  },
  statusBadgeNewText: {
    fontSize: 10,
    fontWeight: theme.fontWeight.semibold,
    color: "#5fd6a0",
  },
  statusBadgeUpdate: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "#221d10",
    borderColor: "#4a3c15",
  },
  statusBadgeUpdateText: {
    fontSize: 10,
    fontWeight: theme.fontWeight.semibold,
    color: "#e0b65a",
  },
  statusBadgeSame: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "transparent",
    borderColor: theme.colors.border,
  },
  statusBadgeSameText: {
    fontSize: 10,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foregroundMuted,
  },
  footnote: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    lineHeight: 17,
    marginTop: theme.spacing[4],
  },
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    textAlign: "center" as const,
    paddingVertical: theme.spacing[4],
  },
  footerInner: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: theme.spacing[3],
  },
  footerLeft: {
    flex: 1,
    gap: 2,
  },
  footerSummary: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  footerError: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.palette.red[300],
    lineHeight: 16,
  },
  footerButtons: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing[2],
  },
}));
