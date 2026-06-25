import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { VendorModel } from "@getpaseo/protocol/provider-config";
import { isNative } from "@/constants/platform";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useSupportsThreeLayerVendors } from "@/providers/use-three-layer-vendors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FetchStatus = "idle" | "loading" | "error" | "success";

export interface VendorModelsSelectProps {
  serverId: string;
  baseUrl: string;
  apiKey?: string;
  apiFormat: "anthropic" | "openai";
  authStyle: "anthropic-auth-token" | "anthropic-api-key" | "openai-api-key";
  models: VendorModel[];
  exposedModelIds: string[];
  defaultModelId?: string;
  setModels: (models: VendorModel[]) => void;
  toggleExposed: (modelId: string, on: boolean) => void;
  addManualModel: (id: string) => void;
  setDefaultModel: (modelId: string) => void;
  removeModel: (modelId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers — render-free sub-elements (avoid nested ternary)
// ---------------------------------------------------------------------------

interface ModelLabelTagProps {
  model: VendorModel;
}

function ModelLabelTag({ model }: ModelLabelTagProps) {
  if (model.label) {
    return (
      <Text style={styles.modelLabel} numberOfLines={1}>
        {model.label}
      </Text>
    );
  }
  if (model.family) {
    return (
      <View style={styles.familyPill}>
        <Text style={styles.familyPillText}>{model.family}</Text>
      </View>
    );
  }
  return null;
}

interface ModelDefaultAreaProps {
  modelId: string;
  isExposed: boolean;
  isDefault: boolean;
  onSetDefault: () => void;
}

function ModelDefaultArea({ modelId, isExposed, isDefault, onSetDefault }: ModelDefaultAreaProps) {
  const { t } = useTranslation();
  if (!isExposed) return null;
  if (isDefault) {
    return (
      <Text style={styles.defaultIndicator} testID={`vendor-model-isdefault-${modelId}`}>
        {t("settings.vendors.edit.models.isDefault")}
      </Text>
    );
  }
  return (
    <Pressable
      onPress={onSetDefault}
      style={styles.setDefaultBtn}
      accessibilityRole="button"
      testID={`vendor-model-setdefault-${modelId}`}
    >
      <Text style={styles.setDefaultBtnText}>{t("settings.vendors.edit.models.setDefault")}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Model row sub-component
// ---------------------------------------------------------------------------

interface ModelRowProps {
  model: VendorModel;
  isExposed: boolean;
  isDefault: boolean;
  onToggle: () => void;
  onSetDefault: () => void;
}

function ModelRow({ model, isExposed, isDefault, onToggle, onSetDefault }: ModelRowProps) {
  const [isHovered, setIsHovered] = useState(false);

  const checkboxStyle = useMemo(
    () => [styles.checkbox, isExposed ? styles.checkboxChecked : null],
    [isExposed],
  );

  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);

  const rowStyle = useMemo(
    () => [styles.modelRow, isHovered || isNative ? styles.modelRowHovered : null],
    [isHovered],
  );

  const accessibilityState = useMemo(() => ({ checked: isExposed }), [isExposed]);

  return (
    <View
      style={rowStyle}
      onPointerEnter={handleHoverIn}
      onPointerLeave={handleHoverOut}
      testID={`vendor-model-row-${model.id}`}
    >
      {/* Checkbox */}
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={accessibilityState}
        style={styles.checkboxWrap}
        testID={`vendor-model-checkbox-${model.id}`}
      >
        <View style={checkboxStyle}>
          {isExposed ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
      </Pressable>

      {/* Model id (mono) */}
      <Text style={styles.modelId} numberOfLines={1} selectable={false}>
        {model.id}
      </Text>

      {/* Label/family tag */}
      <ModelLabelTag model={model} />

      {/* Source tag for manual */}
      {model.source === "manual" ? (
        <View style={styles.manualPill}>
          <Text style={styles.manualPillText}>manual</Text>
        </View>
      ) : null}

      {/* Default indicator / set default button */}
      <ModelDefaultArea
        modelId={model.id}
        isExposed={isExposed}
        isDefault={isDefault}
        onSetDefault={onSetDefault}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Per-row controller (stable callbacks per model id)
// ---------------------------------------------------------------------------

interface ModelRowControllerProps {
  model: VendorModel;
  isExposed: boolean;
  isDefault: boolean;
  toggleExposed: (modelId: string, on: boolean) => void;
  setDefaultModel: (modelId: string) => void;
}

function ModelRowController({
  model,
  isExposed,
  isDefault,
  toggleExposed,
  setDefaultModel,
}: ModelRowControllerProps) {
  const handleToggle = useCallback(
    () => toggleExposed(model.id, !isExposed),
    [model.id, isExposed, toggleExposed],
  );
  const handleSetDefault = useCallback(
    () => setDefaultModel(model.id),
    [model.id, setDefaultModel],
  );

  return (
    <ModelRow
      model={model}
      isExposed={isExposed}
      isDefault={isDefault}
      onToggle={handleToggle}
      onSetDefault={handleSetDefault}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VendorModelsSelect({
  serverId,
  baseUrl,
  apiKey,
  apiFormat,
  authStyle,
  models,
  exposedModelIds,
  defaultModelId,
  setModels,
  toggleExposed,
  addManualModel,
  setDefaultModel,
  removeModel: _removeModel,
}: VendorModelsSelectProps) {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId);
  // COMPAT(threeLayerVendors): added in v0.1.98, drop the gate when floor >= v0.1.98
  const supportsVendors = useSupportsThreeLayerVendors(serverId);

  // Fetch state machine
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("idle");
  const [fetchError, setFetchError] = useState<string | null>(null);

  const handleFetch = useCallback(async () => {
    if (!client || !supportsVendors) return;
    setFetchStatus("loading");
    setFetchError(null);
    try {
      const result = await client.fetchVendorModels({
        baseUrl,
        apiKey,
        apiFormat,
        authStyle,
      });
      if (result.error) {
        setFetchStatus("error");
        setFetchError(result.error);
      } else {
        // Tag each fetched model with source:"fetched" without spread-in-map
        const fetched: VendorModel[] = (result.models ?? []).map((m) =>
          Object.assign({}, m, { source: "fetched" as const }),
        );
        setModels(fetched);
        setFetchStatus("success");
      }
    } catch (e) {
      setFetchStatus("error");
      setFetchError(e instanceof Error ? e.message : "Unknown error");
    }
  }, [client, supportsVendors, baseUrl, apiKey, apiFormat, authStyle, setModels]);

  const handleFetchPress = useCallback(() => void handleFetch(), [handleFetch]);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models;
    const q = searchQuery.toLowerCase();
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.label ?? "").toLowerCase().includes(q) ||
        (m.family ?? "").toLowerCase().includes(q),
    );
  }, [models, searchQuery]);

  // Manual add
  const [manualId, setManualId] = useState("");
  const handleManualAdd = useCallback(() => {
    const trimmed = manualId.trim();
    if (!trimmed) return;
    addManualModel(trimmed);
    setManualId("");
  }, [manualId, addManualModel]);

  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.sectionTitle}>{t("settings.vendors.edit.models.sectionTitle")}</Text>
          <Text style={styles.sectionSubtitle}>
            {t("settings.vendors.edit.models.sectionSubtitle")}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t("settings.vendors.edit.models.searchPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
            testID="vendor-models-search"
          />
          <Pressable
            onPress={handleFetchPress}
            style={styles.fetchBtn}
            accessibilityRole="button"
            disabled={fetchStatus === "loading"}
            testID="vendor-models-fetch-btn"
          >
            <Text style={styles.fetchBtnText}>{t("settings.vendors.edit.models.fetchButton")}</Text>
          </Pressable>
        </View>
      </View>

      {/* Loading indicator */}
      {fetchStatus === "loading" ? (
        <View style={styles.loadingRow} testID="vendor-models-loading">
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
        </View>
      ) : null}

      {/* Error state */}
      {fetchStatus === "error" && fetchError ? (
        <View style={styles.errorRow} testID="vendor-models-error">
          <Text style={styles.errorText}>
            {t("settings.vendors.edit.models.fetchError", { reason: fetchError })}
          </Text>
          <Text style={styles.errorHint}>
            {t("settings.vendors.edit.models.fetchErrorManualHint")}
          </Text>
        </View>
      ) : null}

      {/* Model list */}
      {filteredModels.length > 0 ? (
        <View style={styles.modelList}>
          {filteredModels.map((model) => (
            <ModelRowController
              key={model.id}
              model={model}
              isExposed={exposedModelIds.includes(model.id)}
              isDefault={defaultModelId === model.id}
              toggleExposed={toggleExposed}
              setDefaultModel={setDefaultModel}
            />
          ))}
        </View>
      ) : null}

      {/* Manual add row */}
      <View style={styles.manualAddRow}>
        <TextInput
          style={styles.manualInput}
          value={manualId}
          onChangeText={setManualId}
          placeholder={t("settings.vendors.edit.models.manualAddPlaceholder")}
          autoCapitalize="none"
          autoCorrect={false}
          testID="vendor-models-manual-input"
        />
        <Pressable
          onPress={handleManualAdd}
          style={styles.manualAddBtn}
          accessibilityRole="button"
          accessibilityLabel={t("settings.vendors.edit.models.manualAddAccessibilityLabel")}
          testID="vendor-models-manual-add-btn"
        >
          <Text style={styles.manualAddBtnText}>
            {t("settings.vendors.edit.models.manualAddButton")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[3],
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: theme.spacing[3],
    flexWrap: "wrap" as const,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  headerRight: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing[2],
    flexShrink: 0,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  sectionSubtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  searchInput: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    minWidth: 100,
    height: 36,
  },
  fetchBtn: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    height: 36,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  fetchBtnText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
  },
  loadingRow: {
    paddingVertical: theme.spacing[2],
    alignItems: "center" as const,
  },
  loadingText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  errorRow: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.palette.red[500],
    padding: theme.spacing[3],
    gap: theme.spacing[1],
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.palette.red[300],
  },
  errorHint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  modelList: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden" as const,
  },
  modelRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modelRowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  checkboxWrap: {
    padding: 2,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  checkmark: {
    fontSize: 10,
    color: "#ffffff",
    lineHeight: 14,
  },
  modelId: {
    flex: 1,
    fontSize: 12,
    fontFamily: "ui-monospace, monospace",
    color: theme.colors.foreground,
    minWidth: 0,
  },
  modelLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    flexShrink: 1,
  },
  familyPill: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    flexShrink: 0,
  },
  familyPillText: {
    fontSize: 10,
    color: theme.colors.foregroundMuted,
  },
  manualPill: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface2,
    flexShrink: 0,
  },
  manualPillText: {
    fontSize: 10,
    color: theme.colors.accent,
  },
  defaultIndicator: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.accent,
    fontWeight: theme.fontWeight.semibold,
    flexShrink: 0,
  },
  setDefaultBtn: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexShrink: 0,
  },
  setDefaultBtnText: {
    fontSize: 11,
    color: theme.colors.foregroundMuted,
  },
  manualAddRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing[2],
  },
  manualInput: {
    flex: 1,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    fontFamily: "ui-monospace, monospace",
    height: 36,
  },
  manualAddBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  manualAddBtnText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.accent,
    fontWeight: theme.fontWeight.semibold,
  },
}));
