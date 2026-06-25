/**
 * ConversationModelPicker
 *
 * Cascade vendor/model chip placed on its own row below the composer input box.
 * Binds to the ConversationModelSelection view-model from Task 4.1.
 *
 * Chip format: 🔒{provider} · {vendor} · {model} ▾
 * Open → 3-layer cascade:
 *   ① Provider — locked (cannot switch)
 *   ② Vendor   — switchable (direct-connect + vendor list)
 *   ③ Model    — models for selected vendor (checkmark on selected)
 *
 * Footer: "⚙ 管理供应商…" → navigates to host providers settings.
 *
 * Desktop: two-column (vendor list | model list) via useIsCompactFormFactor=false.
 * Compact: single-column drill-down (vendor list → press vendor → model list).
 *
 * Floating layer: web uses inline absolute positioning anchored to chip;
 * on native uses Modal (keyboard can be dismissed, no IME attachment needed).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Pressable, Text, View, Modal, ScrollView, useWindowDimensions } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative, isWeb } from "@/constants/platform";
import { buildSettingsHostSectionRoute } from "@/utils/host-routes";
import type { ConversationModelSelection } from "./use-conversation-model-selection";
import type { Vendor, VendorModel } from "@getpaseo/protocol/provider-config";

// ---------------------------------------------------------------------------
// Web overlay portal helpers — resolved at runtime so native bundles don't
// pull in react-dom or browser-only modules.
// ---------------------------------------------------------------------------

function tryGetCreatePortal(): (typeof import("react-dom"))["createPortal"] | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("react-dom") as typeof import("react-dom")).createPortal;
  } catch {
    return null;
  }
}

/** Returns (or lazily creates) a fixed full-screen overlay container in the DOM. */
function getOrCreateOverlayRoot(): HTMLElement {
  let el = document.getElementById("cascade-picker-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "cascade-picker-overlay";
    el.style.position = "fixed";
    el.style.inset = "0";
    el.style.pointerEvents = "none";
    document.body.appendChild(el);
  }
  return el;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationModelPickerProps {
  serverId: string;
  selection: ConversationModelSelection;
}

// ---------------------------------------------------------------------------
// Helper: resolve display label for a provider
// ---------------------------------------------------------------------------
function formatProviderLabel(provider: string | null): string {
  if (!provider) return "—";
  if (provider === "claude") return "Claude Code";
  if (provider === "codex") return "Codex";
  return provider;
}

// ---------------------------------------------------------------------------
// Chip — the collapsed trigger button
// ---------------------------------------------------------------------------

interface ModelChipProps {
  providerLabel: string;
  vendorLabel: string;
  modelLabel: string;
  isOpen: boolean;
  onPress: () => void;
}

function ModelChip({
  providerLabel,
  vendorLabel,
  modelLabel,
  isOpen,
  onPress,
}: ModelChipProps): ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);
  const handlePressIn = useCallback(() => setIsPressed(true), []);
  const handlePressOut = useCallback(() => setIsPressed(false), []);

  const chipStyle = useMemo(
    () => [styles.chip, (isHovered || isPressed) && styles.chipHovered, isOpen && styles.chipOpen],
    [isHovered, isPressed, isOpen],
  );

  return (
    <Pressable
      testID="model-picker-chip"
      accessibilityRole="button"
      style={chipStyle}
      onPress={onPress}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Text style={styles.chipLock}>🔒</Text>
      <Text testID="chip-provider" style={styles.chipProvider}>
        {providerLabel}
      </Text>
      <Text style={styles.chipSep}> · </Text>
      <Text testID="chip-vendor" style={styles.chipText}>
        {vendorLabel}
      </Text>
      <Text style={styles.chipSep}> · </Text>
      <Text testID="chip-model" style={styles.chipText} numberOfLines={1}>
        {modelLabel}
      </Text>
      <Text style={styles.chipArrow}>{isOpen ? " ▴" : " ▾"}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// VendorRow — one entry in the vendor list
// ---------------------------------------------------------------------------

interface VendorRowProps {
  testID: string;
  label: string;
  isSelected: boolean;
  onPress: () => void;
}

function VendorRow({ testID, label, isSelected, onPress }: VendorRowProps): ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);
  const handlePressIn = useCallback(() => setIsPressed(true), []);
  const handlePressOut = useCallback(() => setIsPressed(false), []);
  const rowStyle = useMemo(
    () => [
      styles.vendorRow,
      (isHovered || isPressed) && styles.rowHovered,
      isSelected && styles.rowSelected,
    ],
    [isHovered, isPressed, isSelected],
  );

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      style={rowStyle}
      onPress={onPress}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Text style={isSelected ? styles.rowTextSelected : styles.rowText} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.rowArrow}>›</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// ModelRow — one entry in the model list
// ---------------------------------------------------------------------------

interface ModelRowProps {
  testID: string;
  label: string;
  isSelected: boolean;
  onPress: () => void;
}

function ModelRow({ testID, label, isSelected, onPress }: ModelRowProps): ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);
  const handlePressIn = useCallback(() => setIsPressed(true), []);
  const handlePressOut = useCallback(() => setIsPressed(false), []);
  const rowStyle = useMemo(
    () => [
      styles.modelRow,
      (isHovered || isPressed) && styles.rowHovered,
      isSelected && styles.rowSelected,
    ],
    [isHovered, isPressed, isSelected],
  );

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      style={rowStyle}
      onPress={onPress}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Text style={isSelected ? styles.rowTextSelected : styles.rowText} numberOfLines={1}>
        {label}
      </Text>
      {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// VendorList — reused in both compact and desktop panels
// ---------------------------------------------------------------------------

interface VendorListProps {
  vendors: Vendor[];
  selectedVendorId: string | null;
  directConnectLabel: string;
  onSelectVendor: (id: string | null) => void;
}

function VendorList({
  vendors,
  selectedVendorId,
  directConnectLabel,
  onSelectVendor,
}: VendorListProps): ReactElement {
  const handlePressDirectConnect = useCallback(() => {
    onSelectVendor(null);
  }, [onSelectVendor]);

  return (
    <>
      <VendorRow
        testID="cascade-vendor-direct"
        label={directConnectLabel}
        isSelected={selectedVendorId === null}
        onPress={handlePressDirectConnect}
      />
      {vendors.map((v) => (
        <VendorItemRow
          key={v.id}
          vendor={v}
          isSelected={selectedVendorId === v.id}
          onSelectVendor={onSelectVendor}
        />
      ))}
    </>
  );
}

interface VendorItemRowProps {
  vendor: Vendor;
  isSelected: boolean;
  onSelectVendor: (id: string | null) => void;
}

function VendorItemRow({ vendor, isSelected, onSelectVendor }: VendorItemRowProps): ReactElement {
  const handlePress = useCallback(() => {
    onSelectVendor(vendor.id);
  }, [onSelectVendor, vendor.id]);

  return (
    <VendorRow
      testID={`cascade-vendor-${vendor.id}`}
      label={vendor.name}
      isSelected={isSelected}
      onPress={handlePress}
    />
  );
}

// ---------------------------------------------------------------------------
// ModelList — reused in both compact and desktop panels
// ---------------------------------------------------------------------------

interface ModelListProps {
  models: VendorModel[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
}

function ModelList({ models, selectedModelId, onSelectModel }: ModelListProps): ReactElement {
  return (
    <>
      {models.map((m) => (
        <ModelItemRow
          key={m.id}
          model={m}
          isSelected={selectedModelId === m.id}
          onSelectModel={onSelectModel}
        />
      ))}
    </>
  );
}

interface ModelItemRowProps {
  model: VendorModel;
  isSelected: boolean;
  onSelectModel: (id: string) => void;
}

function ModelItemRow({ model, isSelected, onSelectModel }: ModelItemRowProps): ReactElement {
  const handlePress = useCallback(() => {
    onSelectModel(model.id);
  }, [onSelectModel, model.id]);

  return (
    <ModelRow
      testID={`cascade-model-${model.id}`}
      label={model.label ?? model.id}
      isSelected={isSelected}
      onPress={handlePress}
    />
  );
}

// ---------------------------------------------------------------------------
// CascadePanel — desktop two-column or compact single-column
// ---------------------------------------------------------------------------

interface CascadePanelProps {
  lockedProvider: string | null;
  vendors: Vendor[];
  selectedVendorId: string | null;
  exposedModels: VendorModel[];
  selectedModelId: string | null;
  isCompact: boolean;
  onSelectVendor: (id: string | null) => void;
  onSelectModel: (id: string) => void;
  onManageVendors: () => void;
  onClose: () => void;
  labels: {
    directConnect: string;
    providerLocked: string;
    providerSection: string;
    vendorSection: string;
    modelSection: string;
    manageVendors: string;
    back: string;
  };
}

// ManageVendorsRow — footer entry with hover state (Fix 4)
interface ManageVendorsRowProps {
  label: string;
  onPress: () => void;
}

function ManageVendorsRow({ label, onPress }: ManageVendorsRowProps): ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);
  const handlePressIn = useCallback(() => setIsPressed(true), []);
  const handlePressOut = useCallback(() => setIsPressed(false), []);
  const rowStyle = useMemo(
    () => [styles.manageVendorsRow, (isHovered || isPressed) && styles.rowHovered],
    [isHovered, isPressed],
  );
  return (
    <Pressable
      testID="cascade-manage-vendors"
      accessibilityRole="button"
      style={rowStyle}
      onPress={onPress}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Text style={styles.manageVendorsText}>{label}</Text>
    </Pressable>
  );
}

// BackRow — compact drill-down "back" affordance (Fix 3)
interface BackRowProps {
  label: string;
  onPress: () => void;
}

function BackRow({ label, onPress }: BackRowProps): ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);
  const handlePressIn = useCallback(() => setIsPressed(true), []);
  const handlePressOut = useCallback(() => setIsPressed(false), []);
  const rowStyle = useMemo(
    () => [styles.backRow, (isHovered || isPressed) && styles.rowHovered],
    [isHovered, isPressed],
  );
  return (
    <Pressable
      testID="cascade-back"
      accessibilityRole="button"
      style={rowStyle}
      onPress={onPress}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Text style={styles.backRowText}>‹ {label}</Text>
    </Pressable>
  );
}

function CascadePanel({
  lockedProvider,
  vendors,
  selectedVendorId,
  exposedModels,
  selectedModelId,
  isCompact,
  onSelectVendor,
  onSelectModel,
  onManageVendors,
  onClose,
  labels,
}: CascadePanelProps): ReactElement {
  // On compact, track which "drill level" we're on: "vendor" or "model"
  const [compactLevel, setCompactLevel] = useState<"vendor" | "model">("vendor");

  const handleSelectVendorCompact = useCallback(
    (id: string | null) => {
      onSelectVendor(id);
      if (id !== null) {
        setCompactLevel("model");
      } else {
        onClose();
      }
    },
    [onSelectVendor, onClose],
  );

  const handleSelectModel = useCallback(
    (id: string) => {
      onSelectModel(id);
      onClose();
    },
    [onSelectModel, onClose],
  );

  const handleSelectVendorDesktop = useCallback(
    (id: string | null) => {
      onSelectVendor(id);
      if (id === null) {
        onClose();
      }
    },
    [onSelectVendor, onClose],
  );

  // Fix 3: back navigation for compact drill-down
  const handleBackToVendors = useCallback(() => {
    setCompactLevel("vendor");
  }, []);

  const providerLabel = formatProviderLabel(lockedProvider);

  if (isCompact) {
    return (
      <View testID="cascade-panel" style={styles.cascadePanel}>
        {compactLevel === "vendor" ? (
          <ScrollView bounces={false}>
            <Text style={styles.sectionLabel}>{labels.providerSection}</Text>
            <View testID="cascade-provider-locked" style={styles.lockedRow}>
              <Text style={styles.lockedProviderName}>{providerLabel}</Text>
              <Text style={styles.lockedBadge}>{labels.providerLocked}</Text>
            </View>
            <Text style={styles.sectionLabel}>{labels.vendorSection}</Text>
            <VendorList
              vendors={vendors}
              selectedVendorId={selectedVendorId}
              directConnectLabel={labels.directConnect}
              onSelectVendor={handleSelectVendorCompact}
            />
            <View style={styles.divider} />
            <ManageVendorsRow label={labels.manageVendors} onPress={onManageVendors} />
          </ScrollView>
        ) : (
          <ScrollView bounces={false}>
            {/* Fix 3: back button at the top of the model level */}
            <BackRow label={labels.back} onPress={handleBackToVendors} />
            <Text style={styles.sectionLabel}>{labels.modelSection}</Text>
            <ModelList
              models={exposedModels}
              selectedModelId={selectedModelId}
              onSelectModel={handleSelectModel}
            />
          </ScrollView>
        )}
      </View>
    );
  }

  // Desktop: two-column layout
  return (
    <View testID="cascade-panel" style={styles.cascadePanelDesktop}>
      <View style={styles.cascadeColumn}>
        <Text style={styles.sectionLabel}>{labels.providerSection}</Text>
        <View testID="cascade-provider-locked" style={styles.lockedRow}>
          <Text style={styles.lockedProviderName}>{providerLabel}</Text>
          <Text style={styles.lockedBadge}>{labels.providerLocked}</Text>
        </View>
        <Text style={styles.sectionLabel}>{labels.vendorSection}</Text>
        <ScrollView bounces={false} style={styles.vendorScroll}>
          <VendorList
            vendors={vendors}
            selectedVendorId={selectedVendorId}
            directConnectLabel={labels.directConnect}
            onSelectVendor={handleSelectVendorDesktop}
          />
        </ScrollView>
        <View style={styles.divider} />
        <ManageVendorsRow label={labels.manageVendors} onPress={onManageVendors} />
      </View>

      {selectedVendorId !== null && exposedModels.length > 0 ? (
        <View style={styles.cascadeColumn}>
          <Text style={styles.sectionLabel}>{labels.modelSection}</Text>
          <ScrollView bounces={false} style={styles.modelScroll}>
            <ModelList
              models={exposedModels}
              selectedModelId={selectedModelId}
              onSelectModel={handleSelectModel}
            />
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Web anchor rect — measured coordinates for the portal overlay
// ---------------------------------------------------------------------------

interface AnchorRect {
  left: number;
  top: number;
  width: number;
}

// Static DOM style objects (defined outside render to satisfy react-perf lint rules)
const WEB_BACKDROP_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 999,
  pointerEvents: "auto",
} as const;

function stopPropagation(e: React.MouseEvent) {
  e.stopPropagation();
}

// ---------------------------------------------------------------------------
// Main component — ALL hooks called unconditionally before any early return
// ---------------------------------------------------------------------------

export function ConversationModelPicker({
  serverId,
  selection,
}: ConversationModelPickerProps): ReactElement | null {
  const { t } = useTranslation();
  const router = useRouter();
  const isCompact = useIsCompactFormFactor();
  const [isOpen, setIsOpen] = useState(false);
  const chipRef = useRef<View>(null);
  // Web: measured anchor position for portal overlay
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null);
  const windowDimensions = useWindowDimensions();

  const { lockedProvider, vendors, vendorId, modelId, exposedModels, selectVendor, selectModel } =
    selection;

  const vendorLabel = useMemo(() => {
    if (!vendorId) {
      return t("conversation.modelPicker.directConnect");
    }
    const vendor = vendors.find((v) => v.id === vendorId);
    return vendor?.name ?? vendorId;
  }, [vendorId, vendors, t]);

  const modelLabel = modelId ?? t("conversation.modelPicker.noModel");
  const providerLabel = formatProviderLabel(lockedProvider);

  const handleChipPress = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setAnchorRect(null);
  }, []);

  const handleManageVendors = useCallback(() => {
    setIsOpen(false);
    setAnchorRect(null);
    router.push(buildSettingsHostSectionRoute(serverId, "providers"));
  }, [router, serverId]);

  // Fix 2: Measure chip position when opening on web so the Portal overlay can
  // be anchored correctly — avoids clipping by any overflow:hidden ancestor.
  // Falls back to (0, 0) when measureInWindow is unavailable (e.g., jsdom tests).
  useEffect(() => {
    if (!isOpen || !isWeb) return;
    const el = chipRef.current;
    if (!el) {
      // No ref yet — use origin as fallback so the panel still renders
      setAnchorRect({ left: 0, top: 0, width: 0 });
      return;
    }
    let cancelled = false;
    el.measureInWindow((x, y, width) => {
      if (!cancelled) {
        setAnchorRect({ left: x, top: y, width });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, windowDimensions.width, windowDimensions.height]);

  const cascadeLabels = useMemo(
    () => ({
      directConnect: t("conversation.modelPicker.directConnect"),
      providerLocked: t("conversation.modelPicker.providerLocked"),
      providerSection: t("conversation.modelPicker.providerSection"),
      vendorSection: t("conversation.modelPicker.vendorSection"),
      modelSection: t("conversation.modelPicker.modelSection"),
      manageVendors: t("conversation.modelPicker.manageVendors"),
      back: t("conversation.modelPicker.back"),
    }),
    [t],
  );

  // Fix 2: Portal overlay positioning — all hooks must be called before early returns.
  // Use origin as fallback when the chip hasn't been measured yet (e.g. first frame,
  // or environments where measureInWindow fires (0,0) like jsdom).
  const resolvedAnchorLeft = anchorRect?.left ?? 0;
  const resolvedAnchorTop = anchorRect?.top ?? 0;
  const hasAnchor = anchorRect !== null || (isOpen && isWeb);
  const webPanelStyle = useMemo<React.CSSProperties>(
    () => ({
      position: "fixed",
      left: Math.max(8, Math.min(resolvedAnchorLeft, windowDimensions.width - 460 - 8)),
      bottom: windowDimensions.height - resolvedAnchorTop + 6,
      zIndex: 1000,
      pointerEvents: "auto",
    }),
    [resolvedAnchorLeft, resolvedAnchorTop, windowDimensions.width, windowDimensions.height],
  );

  // Only render when there is a locked provider (new-agent draft with vendor support)
  if (!lockedProvider) {
    return null;
  }

  const cascadePanel = isOpen ? (
    <CascadePanel
      lockedProvider={lockedProvider}
      vendors={vendors}
      selectedVendorId={vendorId}
      exposedModels={exposedModels}
      selectedModelId={modelId}
      isCompact={isCompact || isNative}
      onSelectVendor={selectVendor}
      onSelectModel={selectModel}
      onManageVendors={handleManageVendors}
      onClose={handleClose}
      labels={cascadeLabels}
    />
  ) : null;

  if (isNative) {
    // Native: use Modal so touch hit-test works on Android (floating-panels.md gotcha 1)
    return (
      <View style={styles.row}>
        <View ref={chipRef}>
          <ModelChip
            providerLabel={providerLabel}
            vendorLabel={vendorLabel}
            modelLabel={modelLabel}
            isOpen={isOpen}
            onPress={handleChipPress}
          />
        </View>
        <Modal
          transparent
          visible={isOpen}
          animationType="fade"
          onRequestClose={handleClose}
          statusBarTranslucent
        >
          <Pressable style={styles.modalBackdrop} onPress={handleClose}>
            <View style={styles.modalContent}>{cascadePanel}</View>
          </Pressable>
        </Modal>
      </View>
    );
  }

  // Fix 2: Web — render the cascade panel via a DOM portal anchored to the chip's
  // measured position. This escapes any overflow:hidden ancestor and tracks the
  // chip even when the soft keyboard shifts the composer. The backdrop uses a
  // fixed-position div (pointer-events: auto) so outside clicks close the panel.
  const portalFn = tryGetCreatePortal();
  const webOverlay =
    isOpen && hasAnchor && portalFn
      ? portalFn(
          <>
            {/* Backdrop: full-screen click-capture; pointer-events re-enabled on this div */}
            <div style={WEB_BACKDROP_STYLE} onClick={handleClose} />
            {/* Cascade panel, anchored above chip (bottom-aligned) */}
            <div style={webPanelStyle} onClick={stopPropagation}>
              {cascadePanel}
            </div>
          </>,
          getOrCreateOverlayRoot(),
        )
      : null;

  return (
    <View style={styles.row}>
      <View ref={chipRef}>
        <ModelChip
          providerLabel={providerLabel}
          vendorLabel={vendorLabel}
          modelLabel={modelLabel}
          isOpen={isOpen}
          onPress={handleChipPress}
        />
      </View>
      {webOverlay}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: 7,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    gap: 0,
  },
  chipHovered: {
    backgroundColor: theme.colors.surface2,
  },
  chipOpen: {
    backgroundColor: theme.colors.surface2,
  },
  chipLock: {
    fontSize: 11,
    marginRight: 4,
  },
  chipProvider: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    fontWeight: "600",
  },
  chipSep: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  chipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  chipArrow: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },

  // Modal backdrop (native)
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
    paddingBottom: 32,
    paddingHorizontal: theme.spacing[4],
  },
  modalContent: {
    borderRadius: theme.borderRadius["2xl"],
    overflow: "hidden",
  },

  // Cascade panel
  cascadePanel: {
    backgroundColor: theme.colors.surface0,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    maxHeight: 360,
    overflow: "hidden",
  },
  cascadePanelDesktop: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface0,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    maxHeight: 360,
    overflow: "hidden",
  },
  cascadeColumn: {
    width: 230,
    flexShrink: 0,
  },
  vendorScroll: {
    maxHeight: 200,
  },
  modelScroll: {
    maxHeight: 260,
  },

  // Section labels
  sectionLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: theme.colors.foregroundMuted,
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },

  // Locked provider row
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: theme.spacing[2],
    marginBottom: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 7,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    opacity: 0.85,
  },
  lockedProviderName: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.foreground,
  },
  lockedBadge: {
    fontSize: 10.5,
    color: "#d9a441",
    marginLeft: theme.spacing[2],
  },

  // Vendor/model rows
  vendorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: 7,
    marginHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: 7,
    marginHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  rowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  rowSelected: {
    backgroundColor: "#21304f",
  },
  rowText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.foreground,
  },
  rowTextSelected: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: "#fff",
  },
  rowArrow: {
    fontSize: 12,
    color: theme.colors.foregroundMuted,
    marginLeft: theme.spacing[1],
  },
  checkmark: {
    fontSize: 12,
    color: "#5b8cff",
    marginLeft: theme.spacing[1],
  },

  // Divider + manage vendors footer
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing[1],
  },
  manageVendorsRow: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    marginHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  manageVendorsText: {
    fontSize: 11.5,
    color: "#5b8cff",
  },

  // Back row (compact drill-down — Fix 3)
  backRow: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    marginHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  backRowText: {
    fontSize: theme.fontSize.sm,
    color: "#5b8cff",
    fontWeight: "600",
  },
}));
