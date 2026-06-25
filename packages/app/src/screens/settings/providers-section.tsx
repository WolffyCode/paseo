import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown, ChevronRight, Pencil, RefreshCw, Trash2 } from "lucide-react-native";
import type { Vendor } from "@getpaseo/protocol/provider-config";
import type { Theme } from "@/styles/theme";
import { useVendors } from "@/providers/use-vendors";
import type { VendorCli } from "@/providers/use-vendors";
import { isNative } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import { VendorEditModal } from "@/providers/vendor-edit-modal";
import { CcSwitchSyncModal } from "@/providers/ccswitch-sync-modal";
import { stringToColor } from "@/providers/vendor-icon-color";

const ThemedPencil = withUnistyles(Pencil);
const ThemedTrash2 = withUnistyles(Trash2);
const ThemedRefreshCw = withUnistyles(RefreshCw);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedChevronDown = withUnistyles(ChevronDown);

const iconMuted = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const iconAccent = (theme: Theme) => ({ color: theme.colors.accent });

export interface ProvidersSectionProps {
  serverId: string;
  /** Called when the user taps ＋新增 or ✎编辑 — open the edit vendor modal (Task 3.2) */
  onEditVendor?: (cli: VendorCli, vendor?: Vendor) => void;
  /** Called when the user taps ⟳一键同步 — open the sync modal (Task 3.3) */
  onOpenSync?: () => void;
}

// ------------------------------------------------------------------
// Badge
// ------------------------------------------------------------------

type BadgeKind = "cc-switch" | "key" | "default";

function getBadgeStyle(kind: BadgeKind) {
  if (kind === "cc-switch") return styles.badgeCcSwitch;
  if (kind === "key") return styles.badgeKey;
  return styles.badgeDefault;
}

function getBadgeTextStyle(kind: BadgeKind) {
  if (kind === "cc-switch") return styles.badgeCcSwitchText;
  if (kind === "key") return styles.badgeKeyText;
  return styles.badgeDefaultText;
}

function VendorBadge({ kind, label }: { kind: BadgeKind; label: string }) {
  return (
    <View style={getBadgeStyle(kind)}>
      <Text style={getBadgeTextStyle(kind)}>{label}</Text>
    </View>
  );
}

// ------------------------------------------------------------------
// Model chips preview (read-only)
// ------------------------------------------------------------------

interface ModelChipsProps {
  vendor: Vendor;
  onFetch?: () => void;
}

function ModelChipsPreview({ vendor, onFetch }: ModelChipsProps) {
  const { t } = useTranslation();
  const exposedIds = vendor.exposedModelIds ?? [];
  const allModels = vendor.models ?? [];
  const defaultModelId = vendor.defaultModelId;
  const count = exposedIds.length;
  const shownModels = allModels.filter((m) => exposedIds.includes(m.id));

  return (
    <View style={styles.modelsPanel}>
      <View style={styles.modelsHeader}>
        <Text style={styles.modelsHeaderLabel}>
          {t("settings.vendors.modelsPreviewLabel", { count })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("settings.vendors.fetchModels")}
          onPress={onFetch}
          style={styles.fetchButton}
        >
          <Text style={styles.fetchButtonText}>{t("settings.vendors.fetchModels")}</Text>
        </Pressable>
      </View>
      <View style={styles.modelChips}>
        {shownModels.map((model) => {
          const isDefault = model.id === defaultModelId;
          const chipStyle = isDefault ? styles.modelChipDefault : styles.modelChip;
          const chipTextStyle = isDefault ? styles.modelChipTextDefault : styles.modelChipText;
          const chipTagStyle = isDefault ? styles.modelChipTagDefault : styles.modelChipTag;
          return (
            <View key={model.id} style={chipStyle}>
              <Text style={chipTextStyle}>{model.label ?? model.id}</Text>
              {isDefault ? (
                <Text style={chipTagStyle}>{t("settings.vendors.defaultModelTag")}</Text>
              ) : null}
            </View>
          );
        })}
        {exposedIds.length === 0 ? <Text style={styles.modelsEmptyText}>—</Text> : null}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------
// Vendor card
// ------------------------------------------------------------------

interface VendorCardProps {
  vendor: Vendor;
  onEdit: () => void;
  onDelete: () => void;
  onFetch?: () => void;
}

function VendorCard({ vendor, onEdit, onDelete, onFetch }: VendorCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isCompact = useIsCompactFormFactor();

  const showActions = isHovered || isNative || isCompact;
  const nameInitial = vendor.name.charAt(0).toUpperCase();
  const modelCount = vendor.exposedModelIds?.length ?? 0;
  const hasKey = Boolean(vendor.apiKey);
  const hasCcSwitch = vendor.source?.kind === "cc-switch";
  const iconBg = useMemo(() => stringToColor(vendor.name), [vendor.name]);

  const handleToggleExpand = useCallback(() => setIsExpanded((prev) => !prev), []);
  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);

  const cardStyle = isExpanded ? styles.vendorCardExpanded : styles.vendorCard;
  const iconStyle = useMemo(() => [styles.vendorIcon, { backgroundColor: iconBg }], [iconBg]);

  return (
    <View style={cardStyle} onPointerEnter={handleHoverIn} onPointerLeave={handleHoverOut}>
      <Pressable
        onPress={handleToggleExpand}
        accessibilityRole="button"
        accessibilityLabel={
          isExpanded ? t("settings.vendors.collapseVendor") : t("settings.vendors.expandVendor")
        }
        style={styles.vendorRow}
      >
        <View style={iconStyle}>
          <Text style={styles.vendorIconText}>{nameInitial}</Text>
        </View>
        <View style={styles.vendorMeta}>
          <View style={styles.vendorNameRow}>
            <Text style={styles.vendorName}>{vendor.name}</Text>
            {hasCcSwitch ? (
              <VendorBadge kind="cc-switch" label={t("settings.vendors.ccSwitchBadge")} />
            ) : null}
            {hasKey ? <VendorBadge kind="key" label={t("settings.vendors.keyBadge")} /> : null}
          </View>
          <Text style={styles.vendorUrl} numberOfLines={1}>
            {vendor.baseUrl}
          </Text>
        </View>
        <View style={styles.vendorRight}>
          {showActions ? (
            <View style={styles.vendorActions}>
              <Pressable
                onPress={onEdit}
                accessibilityRole="button"
                accessibilityLabel={t("settings.vendors.editVendor")}
                testID={`edit-vendor-${vendor.id}`}
                style={styles.actionButton}
              >
                <ThemedPencil size={12} uniProps={iconMuted} />
              </Pressable>
              <Pressable
                onPress={onDelete}
                accessibilityRole="button"
                accessibilityLabel={t("settings.vendors.deleteVendor")}
                testID={`delete-vendor-${vendor.id}`}
                style={styles.actionButton}
              >
                <ThemedTrash2 size={12} uniProps={iconMuted} />
              </Pressable>
            </View>
          ) : null}
          <Text style={styles.vendorCount}>
            {t("settings.vendors.modelCount", { count: modelCount })}
          </Text>
          {isExpanded ? (
            <ThemedChevronDown size={14} uniProps={iconMuted} />
          ) : (
            <ThemedChevronRight size={14} uniProps={iconMuted} />
          )}
        </View>
      </Pressable>
      {isExpanded ? <ModelChipsPreview vendor={vendor} onFetch={onFetch} /> : null}
    </View>
  );
}

// ------------------------------------------------------------------
// Direct-connect (default) item
// ------------------------------------------------------------------

function DirectConnectItem() {
  const { t } = useTranslation();
  return (
    <View style={styles.vendorCard}>
      <View style={styles.vendorRow}>
        <View style={styles.directConnectIcon}>
          <Text style={styles.vendorIconText}>⎈</Text>
        </View>
        <View style={styles.vendorMeta}>
          <View style={styles.vendorNameRow}>
            <Text style={styles.vendorName}>{t("settings.vendors.directConnect")}</Text>
            <VendorBadge kind="default" label={t("settings.vendors.defaultBadge")} />
          </View>
          <Text style={styles.vendorUrl}>{t("settings.vendors.directConnectNote")}</Text>
        </View>
        <View style={styles.vendorRight}>
          <Text style={styles.vendorCount}>{t("settings.vendors.officialModels")}</Text>
          <ThemedChevronRight size={14} uniProps={iconMuted} />
        </View>
      </View>
    </View>
  );
}

// ------------------------------------------------------------------
// CLI item
// ------------------------------------------------------------------

interface CliItemProps {
  label: string;
  initial: string;
  color: string;
  count: number;
  selected: boolean;
  onPress: () => void;
  countLabel: string;
}

// Hover-reveal is intentionally omitted here: CliItem uses selection-state styling only and has no inner Pressables.
function CliItem({ label, initial, color, count, selected, onPress, countLabel }: CliItemProps) {
  const isCompact = useIsCompactFormFactor();
  const itemStyle = useMemo(() => {
    if (selected && isCompact) return styles.cliItemSelectedCompact;
    if (selected) return styles.cliItemSelected;
    if (isCompact) return styles.cliItemCompact;
    return styles.cliItem;
  }, [selected, isCompact]);
  const iconStyle = useMemo(() => [styles.cliIcon, { backgroundColor: color }], [color]);
  const nameStyle = selected ? styles.cliNameSelected : styles.cliName;
  const countStyle = selected ? styles.cliCountSelected : styles.cliCount;
  const _ = count; // suppress unused warning — count is used in countLabel

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={itemStyle}
    >
      <View style={iconStyle}>
        <Text style={styles.cliIconText}>{initial}</Text>
      </View>
      <View style={styles.cliMeta}>
        <Text style={nameStyle}>{label}</Text>
        <Text style={countStyle}>{countLabel}</Text>
      </View>
    </Pressable>
  );
}

// ------------------------------------------------------------------
// Main component
// ------------------------------------------------------------------

export function ProvidersSection({ serverId, onEditVendor, onOpenSync }: ProvidersSectionProps) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const { selectedCli, setSelectedCli, vendorsForSelectedCli, vendorCountByCli, deleteVendor } =
    useVendors(serverId);

  // Edit modal state
  const [editingVendor, setEditingVendor] = useState<Vendor | undefined>(undefined);
  const [editingCli, setEditingCli] = useState<VendorCli>("claude");
  const [editModalVisible, setEditModalVisible] = useState(false);

  // Sync modal state (used when no external onOpenSync prop is provided)
  const [syncModalVisible, setSyncModalVisible] = useState(false);

  const handleSelectClaude = useCallback(() => setSelectedCli("claude"), [setSelectedCli]);
  const handleSelectCodex = useCallback(() => setSelectedCli("codex"), [setSelectedCli]);

  const handleAddVendor = useCallback(() => {
    if (onEditVendor) {
      onEditVendor(selectedCli, undefined);
    } else {
      setEditingCli(selectedCli);
      setEditingVendor(undefined);
      setEditModalVisible(true);
    }
  }, [onEditVendor, selectedCli]);

  const handleOpenSync = useCallback(() => {
    if (onOpenSync) {
      onOpenSync();
    } else {
      setSyncModalVisible(true);
    }
  }, [onOpenSync]);

  const handleEditModalClose = useCallback(() => setEditModalVisible(false), []);
  const handleSyncModalClose = useCallback(() => setSyncModalVisible(false), []);

  const handleDeleteVendor = useCallback(
    (vendor: Vendor) => {
      Alert.alert(
        t("settings.vendors.deleteConfirmTitle"),
        t("settings.vendors.deleteConfirmMessage"),
        [
          { text: t("settings.vendors.deleteConfirmCancel"), style: "cancel" },
          {
            text: t("settings.vendors.deleteConfirmOk"),
            style: "destructive",
            onPress: () => {
              void deleteVendor(selectedCli, vendor.id);
            },
          },
        ],
      );
    },
    [deleteVendor, selectedCli, t],
  );

  const handleEditVendor = useCallback(
    (vendor: Vendor) => {
      if (onEditVendor) {
        onEditVendor(selectedCli, vendor);
      } else {
        setEditingCli(selectedCli);
        setEditingVendor(vendor);
        setEditModalVisible(true);
      }
    },
    [onEditVendor, selectedCli],
  );

  // Per-vendor callbacks (stable refs via useMemo of maps)
  const editCallbacks = useMemo<Map<string, () => void>>(() => {
    const map = new Map<string, () => void>();
    for (const v of vendorsForSelectedCli) {
      map.set(v.id, () => handleEditVendor(v));
    }
    return map;
    // handleEditVendor changes when selectedCli/onEditVendor changes → rebuild
  }, [vendorsForSelectedCli, handleEditVendor]);

  const deleteCallbacks = useMemo<Map<string, () => void>>(() => {
    const map = new Map<string, () => void>();
    for (const v of vendorsForSelectedCli) {
      map.set(v.id, () => handleDeleteVendor(v));
    }
    return map;
  }, [vendorsForSelectedCli, handleDeleteVendor]);

  const claudeCountLabel = t("settings.vendors.vendorCountSuffix", {
    count: vendorCountByCli.claude,
  });
  const codexCountLabel = t("settings.vendors.vendorCountSuffix", {
    count: vendorCountByCli.codex,
  });

  const outerStyle = isCompact ? styles.compactLayout : styles.masterDetail;
  const cliColStyle = isCompact ? styles.cliColumnCompact : styles.cliColumn;

  const cliColumn = (
    <View style={cliColStyle}>
      {!isCompact ? <Text style={styles.colLabel}>{t("settings.vendors.colLabel")}</Text> : null}
      <CliItem
        label={t("settings.vendors.claudeCode")}
        initial="C"
        color="#d97757"
        count={vendorCountByCli.claude}
        selected={selectedCli === "claude"}
        onPress={handleSelectClaude}
        countLabel={claudeCountLabel}
      />
      <CliItem
        label={t("settings.vendors.codex")}
        initial="o"
        color="#10a37f"
        count={vendorCountByCli.codex}
        selected={selectedCli === "codex"}
        onPress={handleSelectCodex}
        countLabel={codexCountLabel}
      />
      {!isCompact ? (
        <View style={styles.fixNote}>
          <Text style={styles.fixNoteText}>{t("settings.vendors.fixNote")}</Text>
        </View>
      ) : null}
    </View>
  );

  const vendorArea = (
    <View style={styles.vendorArea}>
      <View style={styles.vendorAreaHeader}>
        <Text style={styles.vendorAreaLabel}>{t("settings.vendors.vendorAreaLabel")}</Text>
        <View style={styles.vendorAreaPill}>
          <Text style={styles.vendorAreaPillText}>url + key</Text>
        </View>
      </View>
      <DirectConnectItem />
      {vendorsForSelectedCli.map((vendor) => (
        <VendorCard
          key={vendor.id}
          vendor={vendor}
          onEdit={editCallbacks.get(vendor.id) ?? handleAddVendor}
          onDelete={deleteCallbacks.get(vendor.id) ?? handleAddVendor}
          onFetch={undefined}
        />
      ))}
      <Pressable
        onPress={handleAddVendor}
        accessibilityRole="button"
        accessibilityLabel={t("settings.vendors.addVendorButton")}
        style={styles.addVendorButton}
      >
        <Text style={styles.addVendorButtonText}>{t("settings.vendors.addVendorButton")}</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.pageRoot}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{t("settings.vendors.pageTitle")}</Text>
        <Pressable
          onPress={handleOpenSync}
          accessibilityRole="button"
          accessibilityLabel={t("settings.vendors.syncButton")}
          style={styles.syncButton}
        >
          <ThemedRefreshCw size={14} uniProps={iconAccent} />
          <Text style={styles.syncButtonText}>{t("settings.vendors.syncButton")}</Text>
        </Pressable>
      </View>
      <View style={outerStyle}>
        {cliColumn}
        {vendorArea}
      </View>
      <VendorEditModal
        visible={editModalVisible}
        cli={editingCli}
        vendor={editingVendor}
        serverId={serverId}
        onClose={handleEditModalClose}
      />
      <CcSwitchSyncModal
        visible={syncModalVisible}
        serverId={serverId}
        onClose={handleSyncModalClose}
      />
    </View>
  );
}

// ------------------------------------------------------------------
// Styles
// ------------------------------------------------------------------

const styles = StyleSheet.create((theme) => ({
  pageRoot: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  pageTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    backgroundColor: theme.colors.accent,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  syncButtonText: {
    color: "#ffffff",
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  masterDetail: {
    flexDirection: "row",
    flex: 1,
  },
  compactLayout: {
    flex: 1,
    flexDirection: "column",
  },
  cliColumn: {
    width: 212,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebar,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[1],
  },
  cliColumnCompact: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing[3],
    gap: theme.spacing[1],
  },
  colLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: theme.spacing[2],
    marginLeft: theme.spacing[1],
  },
  cliItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  cliItemSelected: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: "#21304f",
  },
  cliItemCompact: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  cliItemSelectedCompact: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: "#21304f",
  },
  cliIcon: {
    width: 25,
    height: 25,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  cliIconText: {
    color: "#ffffff",
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
  },
  cliMeta: {
    flex: 1,
  },
  cliName: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foregroundMuted,
  },
  cliNameSelected: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  cliCount: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  cliCountSelected: {
    fontSize: theme.fontSize.xs,
    color: "#a9c0ff",
  },
  fixNote: {
    paddingHorizontal: theme.spacing[1],
    paddingVertical: theme.spacing[2],
  },
  fixNoteText: {
    fontSize: 10.5,
    color: theme.colors.foregroundMuted,
    lineHeight: 16,
  },
  vendorArea: {
    flex: 1,
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  vendorAreaHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  vendorAreaLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  vendorAreaPill: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
  },
  vendorAreaPillText: {
    fontSize: 10,
    color: theme.colors.foregroundMuted,
  },
  vendorCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.xl,
    overflow: "hidden",
    marginBottom: theme.spacing[2],
  },
  vendorCardExpanded: {
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.xl,
    overflow: "hidden",
    marginBottom: theme.spacing[2],
  },
  vendorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  vendorIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  directConnectIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3a3f48",
  },
  vendorIconText: {
    color: "#ffffff",
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.xs,
  },
  vendorMeta: {
    flex: 1,
    minWidth: 0,
  },
  vendorNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexWrap: "wrap",
  },
  vendorName: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  vendorUrl: {
    fontSize: 11.5,
    color: theme.colors.foregroundMuted,
    fontFamily: "ui-monospace, monospace",
    marginTop: 2,
  },
  vendorRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  vendorActions: {
    flexDirection: "row",
    gap: theme.spacing[1],
  },
  actionButton: {
    width: 27,
    height: 27,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    alignItems: "center",
    justifyContent: "center",
  },
  vendorCount: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  badgeCcSwitch: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "#251f3a",
    borderColor: "#3a2f5e",
  },
  badgeCcSwitchText: {
    fontSize: 10,
    fontWeight: theme.fontWeight.semibold,
    color: "#b6a3ff",
  },
  badgeKey: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "#10261c",
    borderColor: "#1d4533",
  },
  badgeKeyText: {
    fontSize: 10,
    fontWeight: theme.fontWeight.semibold,
    color: "#5fd6a0",
  },
  badgeDefault: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "#15233f",
    borderColor: "#28406d",
  },
  badgeDefaultText: {
    fontSize: 10,
    fontWeight: theme.fontWeight.semibold,
    color: "#9bb8ff",
  },
  modelsPanel: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface3,
    padding: theme.spacing[3],
  },
  modelsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing[2],
  },
  modelsHeaderLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  fetchButton: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: "#21304f",
  },
  fetchButtonText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.accent,
  },
  modelChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  modelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: "#171a20",
  },
  modelChipDefault: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: "#21304f",
  },
  modelChipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  modelChipTextDefault: {
    fontSize: theme.fontSize.sm,
    color: "#ffffff",
  },
  modelChipTag: {
    fontSize: 10,
    color: theme.colors.foregroundMuted,
  },
  modelChipTagDefault: {
    fontSize: 10,
    color: "#a9c0ff",
  },
  modelsEmptyText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  addVendorButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[3],
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.xl,
    marginTop: theme.spacing[1],
  },
  addVendorButtonText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
}));
