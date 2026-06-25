import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown, Eye, EyeOff } from "lucide-react-native";
import type { Vendor } from "@getpaseo/protocol/provider-config";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { FormField, FormTextInput } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useVendors } from "@/providers/use-vendors";
import { useVendorDraft, isQuickToggleOn } from "@/providers/use-vendor-draft";
import type { QuickToggleKey, VendorDraft } from "@/providers/use-vendor-draft";
import { VendorModelsSelect } from "@/providers/vendor-models-select";
import { stringToColor } from "@/providers/vendor-icon-color";

// ---------------------------------------------------------------------------
// Icon wrappers
// ---------------------------------------------------------------------------

const ThemedEye = withUnistyles(Eye);
const ThemedEyeOff = withUnistyles(EyeOff);
const ThemedChevronDown = withUnistyles(ChevronDown);

const iconMuted = (theme: { colors: { foregroundMuted: string } }) => ({
  color: theme.colors.foregroundMuted,
});

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VendorEditModalProps {
  visible: boolean;
  cli: "claude" | "codex";
  vendor?: Vendor;
  serverId: string;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dropdownTriggerStyle({ pressed }: PressableStateCallbackType) {
  return [styles.dropdownTrigger, pressed ? styles.dropdownTriggerPressed : null];
}

function getAuthStyleLabel(authStyle: VendorDraft["authStyle"], t: (k: string) => string): string {
  if (authStyle === "anthropic-api-key") {
    return t("settings.vendors.edit.authStyleAnthropicApiKeyLabel");
  }
  if (authStyle === "openai-api-key") {
    return t("settings.vendors.edit.authStyleOpenaiApiKeyLabel");
  }
  return t("settings.vendors.edit.authStyleAnthropicAuthTokenLabel");
}

// ---------------------------------------------------------------------------
// Sub-components (extracted to reduce complexity and nesting)
// ---------------------------------------------------------------------------

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

interface ApiKeyFieldProps {
  initialValue: string;
  resetKey: number;
  onChangeText: (v: string) => void;
}

function ApiKeyField({ initialValue, resetKey, onChangeText }: ApiKeyFieldProps) {
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const { t } = useTranslation();
  const toggleVisible = useCallback(() => setApiKeyVisible((v) => !v), []);
  const handleChange = useCallback((v: string) => onChangeText(v || ""), [onChangeText]);

  return (
    <View style={styles.apiKeyRow}>
      <View style={styles.apiKeyInputWrap}>
        <FormTextInput
          initialValue={initialValue}
          key={`apiKey-${resetKey}`}
          onChangeText={handleChange}
          secureTextEntry={!apiKeyVisible}
          placeholder="sk-..."
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.monoInput}
          testID="vendor-apikey-input"
        />
      </View>
      <Pressable
        onPress={toggleVisible}
        accessibilityRole="button"
        accessibilityLabel={
          apiKeyVisible
            ? t("settings.vendors.edit.hideApiKey")
            : t("settings.vendors.edit.showApiKey")
        }
        style={styles.eyeButton}
      >
        {apiKeyVisible ? (
          <ThemedEyeOff size={16} uniProps={iconMuted} />
        ) : (
          <ThemedEye size={16} uniProps={iconMuted} />
        )}
      </Pressable>
    </View>
  );
}

interface QuickToggleRowProps {
  configJson: Record<string, unknown>;
  toggleQuick: (key: QuickToggleKey, on: boolean) => void;
}

const QUICK_TOGGLE_KEYS: QuickToggleKey[] = [
  "hideAiSignature",
  "teammatesMode",
  "enableToolSearch",
  "maxThinking",
  "disableAutoUpgrade",
];

const QUICK_TOGGLE_I18N_KEYS: Record<QuickToggleKey, string> = {
  hideAiSignature: "settings.vendors.edit.qtHideAiSignature",
  teammatesMode: "settings.vendors.edit.qtTeammates",
  enableToolSearch: "settings.vendors.edit.qtEnableToolSearch",
  maxThinking: "settings.vendors.edit.qtMaxThinking",
  disableAutoUpgrade: "settings.vendors.edit.qtDisableAutoUpgrade",
};

function QuickToggleRow({ configJson, toggleQuick }: QuickToggleRowProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.quickTogglesRow}>
      {QUICK_TOGGLE_KEYS.map((key) => {
        const on = isQuickToggleOn(configJson, key);
        return (
          <QuickToggleItem
            key={key}
            toggleKey={key}
            label={t(QUICK_TOGGLE_I18N_KEYS[key])}
            on={on}
            toggleQuick={toggleQuick}
          />
        );
      })}
    </View>
  );
}

interface QuickToggleItemProps {
  toggleKey: QuickToggleKey;
  label: string;
  on: boolean;
  toggleQuick: (key: QuickToggleKey, on: boolean) => void;
}

function QuickToggleItem({ toggleKey, label, on, toggleQuick }: QuickToggleItemProps) {
  const handlePress = useCallback(() => toggleQuick(toggleKey, !on), [toggleKey, on, toggleQuick]);
  const checkboxStyle = useMemo(() => [styles.checkbox, on ? styles.checkboxChecked : null], [on]);
  const accessibilityState = useMemo(() => ({ checked: on }), [on]);
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="checkbox"
      accessibilityState={accessibilityState}
      style={styles.quickToggle}
    >
      <View style={checkboxStyle} />
      <Text style={styles.quickToggleLabel}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// API format + auth style picker sub-components (to stay within jsx-max-depth)
// ---------------------------------------------------------------------------

interface ApiFormatPickerProps {
  apiFormat: VendorDraft["apiFormat"];
  onSelectAnthropic: () => void;
  onSelectOpenai: () => void;
}

function ApiFormatPicker({ apiFormat, onSelectAnthropic, onSelectOpenai }: ApiFormatPickerProps) {
  const { t } = useTranslation();
  const label =
    apiFormat === "anthropic"
      ? t("settings.vendors.edit.apiFormatAnthropicLabel")
      : t("settings.vendors.edit.apiFormatOpenaiLabel");
  return (
    <FormField
      label={t("settings.vendors.edit.apiFormat")}
      hint={t("settings.vendors.edit.apiFormatHint")}
    >
      <DropdownMenu>
        <DropdownMenuTrigger style={dropdownTriggerStyle} testID="vendor-apiformat-trigger">
          <Text style={styles.dropdownTriggerText}>{label}</Text>
          <ThemedChevronDown size={14} uniProps={iconMuted} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start" width={220}>
          <DropdownMenuItem selected={apiFormat === "anthropic"} onSelect={onSelectAnthropic}>
            {t("settings.vendors.edit.apiFormatAnthropicLabel")}
          </DropdownMenuItem>
          <DropdownMenuItem selected={apiFormat === "openai"} onSelect={onSelectOpenai}>
            {t("settings.vendors.edit.apiFormatOpenaiLabel")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </FormField>
  );
}

interface AuthStylePickerProps {
  authStyle: VendorDraft["authStyle"];
  onSelectAuthToken: () => void;
  onSelectApiKey: () => void;
  onSelectOpenai: () => void;
}

function AuthStylePicker({
  authStyle,
  onSelectAuthToken,
  onSelectApiKey,
  onSelectOpenai,
}: AuthStylePickerProps) {
  const { t } = useTranslation();
  const label = getAuthStyleLabel(authStyle, t);
  return (
    <FormField
      label={t("settings.vendors.edit.authStyle")}
      hint={t("settings.vendors.edit.authStyleHint")}
    >
      <DropdownMenu>
        <DropdownMenuTrigger style={dropdownTriggerStyle} testID="vendor-authstyle-trigger">
          <Text style={styles.dropdownTriggerText} numberOfLines={1}>
            {label}
          </Text>
          <ThemedChevronDown size={14} uniProps={iconMuted} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start" width={280}>
          <DropdownMenuItem
            selected={authStyle === "anthropic-auth-token"}
            onSelect={onSelectAuthToken}
          >
            {t("settings.vendors.edit.authStyleAnthropicAuthTokenLabel")}
          </DropdownMenuItem>
          <DropdownMenuItem selected={authStyle === "anthropic-api-key"} onSelect={onSelectApiKey}>
            {t("settings.vendors.edit.authStyleAnthropicApiKeyLabel")}
          </DropdownMenuItem>
          <DropdownMenuItem selected={authStyle === "openai-api-key"} onSelect={onSelectOpenai}>
            {t("settings.vendors.edit.authStyleOpenaiApiKeyLabel")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </FormField>
  );
}

interface ConfigJsonEditorProps {
  configJsonText: string;
  isJsonValid: boolean;
  setConfigJsonText: (text: string) => { ok: boolean; error?: string };
}

function ConfigJsonEditor({
  configJsonText,
  isJsonValid,
  setConfigJsonText,
}: ConfigJsonEditorProps) {
  const { t } = useTranslation();
  const handleFormat = useCallback(() => {
    try {
      setConfigJsonText(JSON.stringify(JSON.parse(configJsonText) as unknown, null, 2));
    } catch {
      // ignore — editor already shows invalid JSON
    }
  }, [configJsonText, setConfigJsonText]);

  const jsonEditorStyle = useMemo(
    () => [styles.jsonEditor, !isJsonValid ? styles.jsonEditorInvalid : null],
    [isJsonValid],
  );

  return (
    <>
      <TextInput
        value={configJsonText}
        onChangeText={setConfigJsonText}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        style={jsonEditorStyle}
        testID="vendor-config-json-input"
      />
      <Pressable onPress={handleFormat} style={styles.formatButton} accessibilityRole="button">
        <Text style={styles.formatButtonText}>{t("settings.vendors.edit.formatButton")}</Text>
      </Pressable>
      <Text style={styles.jsonNote}>{t("settings.vendors.edit.jsonNote")}</Text>
    </>
  );
}

interface VendorFooterProps {
  exposedCount: number;
  totalCount: number;
  isPending: boolean;
  isValid: boolean;
  submitError: string | null;
  onSave: () => void;
}

function VendorFooter({
  exposedCount,
  totalCount,
  isPending,
  isValid,
  submitError,
  onSave,
}: VendorFooterProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.footerInner}>
      <Text style={styles.footerExposedText}>
        {t("settings.vendors.edit.models.exposedCountFooter", {
          exposed: exposedCount,
          total: totalCount,
        })}
      </Text>
      <View style={styles.footerRight}>
        {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
        <Button variant="default" size="sm" onPress={onSave} disabled={isPending || !isValid}>
          {isPending ? t("settings.vendors.edit.saving") : t("settings.vendors.edit.save")}
        </Button>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Modal component
// ---------------------------------------------------------------------------

export function VendorEditModal({ visible, cli, vendor, serverId, onClose }: VendorEditModalProps) {
  const { t } = useTranslation();
  const { upsertVendor } = useVendors(serverId);
  const [resetKey, setResetKey] = useState(0);

  const {
    draft,
    setField,
    setConfigJsonText,
    configJsonText,
    toggleQuick,
    errors,
    toVendor,
    isValid,
    isJsonValid,
    setModels,
    toggleExposed,
    addManualModel,
    setDefaultModel,
    removeModel,
  } = useVendorDraft(vendor, cli);

  // Bump resetKey so uncontrolled FormTextInput children re-mount with fresh initialValue
  useEffect(() => {
    if (visible) {
      setResetKey((k) => k + 1);
    }
  }, [visible, vendor]);

  const [isPending, setIsPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (isPending || !isValid) return;
    setIsPending(true);
    setSubmitError(null);
    try {
      await upsertVendor(cli, toVendor());
      onClose();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : t("common.errors.unableToSave"));
    } finally {
      setIsPending(false);
    }
  }, [isPending, isValid, upsertVendor, cli, toVendor, onClose, t]);

  const handleSavePress = useCallback(() => void handleSave(), [handleSave]);

  const handleClose = useCallback(() => {
    setSubmitError(null);
    onClose();
  }, [onClose]);

  const handleNameChange = useCallback((v: string) => setField("name", v), [setField]);
  const handleNotesChange = useCallback(
    (v: string) => setField("notes", v || undefined),
    [setField],
  );
  const handleWebsiteChange = useCallback(
    (v: string) => setField("websiteUrl", v || undefined),
    [setField],
  );
  const handleApiKeyChange = useCallback(
    (v: string) => setField("apiKey", v || undefined),
    [setField],
  );
  const handleBaseUrlChange = useCallback((v: string) => setField("baseUrl", v), [setField]);
  const handleFallbackModelChange = useCallback(
    (v: string) => setField("fallbackModel", v || undefined),
    [setField],
  );
  const handleApiFormatAnthropicSelect = useCallback(
    () => setField("apiFormat", "anthropic"),
    [setField],
  );
  const handleApiFormatOpenaiSelect = useCallback(
    () => setField("apiFormat", "openai"),
    [setField],
  );
  const handleAuthStyleAuthTokenSelect = useCallback(
    () => setField("authStyle", "anthropic-auth-token"),
    [setField],
  );
  const handleAuthStyleApiKeySelect = useCallback(
    () => setField("authStyle", "anthropic-api-key"),
    [setField],
  );
  const handleAuthStyleOpenaiSelect = useCallback(
    () => setField("authStyle", "openai-api-key"),
    [setField],
  );

  const isNewVendor = !vendor;
  const hasCcSwitch = vendor?.source?.kind === "cc-switch";
  const title = isNewVendor
    ? t("settings.vendors.edit.newTitle")
    : t("settings.vendors.edit.title");

  const exposedCount = draft.exposedModelIds?.length ?? 0;
  const totalCount = draft.models?.length ?? 0;

  // Stable empty-array fallbacks so VendorModelsSelect receives a referentially stable value.
  const emptyModels = useMemo<[]>(() => [], []);
  const draftModels = draft.models ?? emptyModels;
  const draftExposedModelIds = draft.exposedModelIds ?? emptyModels;

  const headerLeading = useMemo(() => <VendorIconBadge name={draft.name} />, [draft.name]);

  const headerSubtitle = useMemo(() => {
    const vendorName = draft.name.trim();
    const hasName = vendorName.length > 0;
    if (!hasCcSwitch && !hasName) return null;
    return (
      <View style={styles.headerSubtitleRow}>
        {hasName ? <Text style={styles.headerVendorName}>{vendorName}</Text> : null}
        {hasCcSwitch ? (
          <View style={styles.ccSwitchTag}>
            <Text style={styles.ccSwitchTagText}>{t("settings.vendors.edit.ccSwitchTag")}</Text>
          </View>
        ) : null}
      </View>
    );
  }, [draft.name, hasCcSwitch, t]);

  const footer = useMemo(
    () => (
      <VendorFooter
        exposedCount={exposedCount}
        totalCount={totalCount}
        isPending={isPending}
        isValid={isValid}
        submitError={submitError}
        onSave={handleSavePress}
      />
    ),
    [exposedCount, totalCount, isPending, isValid, submitError, handleSavePress],
  );

  const header = useMemo(
    () => ({ title, leading: headerLeading, subtitle: headerSubtitle }),
    [title, headerLeading, headerSubtitle],
  );

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={handleClose}
      footer={footer}
      desktopMaxWidth={600}
      scrollable
    >
      {/* ---- Section 1: Basic info ---- */}
      <View style={styles.section}>
        <View style={styles.sideBySide}>
          <View style={styles.sideBySlot}>
            <FormField
              label={t("settings.vendors.edit.vendorName")}
              error={errors.name}
              testID="vendor-name-field"
            >
              <FormTextInput
                initialValue={draft.name}
                key={`name-${resetKey}`}
                onChangeText={handleNameChange}
                placeholder={t("settings.vendors.edit.vendorName")}
                autoCapitalize="none"
                testID="vendor-name-input"
              />
            </FormField>
          </View>
          <View style={styles.sideBySlot}>
            <FormField label={t("settings.vendors.edit.notes")}>
              <FormTextInput
                initialValue={draft.notes ?? ""}
                key={`notes-${resetKey}`}
                onChangeText={handleNotesChange}
                placeholder={t("settings.vendors.edit.notes")}
                testID="vendor-notes-input"
              />
            </FormField>
          </View>
        </View>

        <FormField label={t("settings.vendors.edit.websiteUrl")}>
          <FormTextInput
            initialValue={draft.websiteUrl ?? ""}
            key={`websiteUrl-${resetKey}`}
            onChangeText={handleWebsiteChange}
            placeholder="https://example.com"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.monoInput}
            testID="vendor-website-input"
          />
        </FormField>

        <FormField label={t("settings.vendors.edit.apiKey")}>
          <ApiKeyField
            initialValue={draft.apiKey ?? ""}
            resetKey={resetKey}
            onChangeText={handleApiKeyChange}
          />
        </FormField>

        <FormField
          label={t("settings.vendors.edit.baseUrl")}
          hint={t("settings.vendors.edit.baseUrlTip")}
        >
          <FormTextInput
            initialValue={draft.baseUrl}
            key={`baseUrl-${resetKey}`}
            onChangeText={handleBaseUrlChange}
            placeholder="https://api.example.com/v1"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.monoInput}
            testID="vendor-baseurl-input"
          />
        </FormField>
      </View>

      {/* ---- Section 2: Advanced options ---- */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.vendors.edit.advancedTitle")}</Text>

        <View style={styles.sideBySide}>
          <View style={styles.sideBySlot}>
            <ApiFormatPicker
              apiFormat={draft.apiFormat}
              onSelectAnthropic={handleApiFormatAnthropicSelect}
              onSelectOpenai={handleApiFormatOpenaiSelect}
            />
          </View>
          <View style={styles.sideBySlot}>
            <AuthStylePicker
              authStyle={draft.authStyle}
              onSelectAuthToken={handleAuthStyleAuthTokenSelect}
              onSelectApiKey={handleAuthStyleApiKeySelect}
              onSelectOpenai={handleAuthStyleOpenaiSelect}
            />
          </View>
        </View>

        <FormField
          label={t("settings.vendors.edit.fallbackModel")}
          hint={t("settings.vendors.edit.fallbackModelHint")}
        >
          <FormTextInput
            initialValue={draft.fallbackModel ?? ""}
            key={`fallbackModel-${resetKey}`}
            onChangeText={handleFallbackModelChange}
            placeholder="claude-opus-4-5"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.monoInput}
            testID="vendor-fallbackmodel-input"
          />
        </FormField>
      </View>

      {/* ---- Section 3: Config JSON ---- */}
      <View style={styles.section}>
        <View style={styles.configJsonHeader}>
          <Text style={styles.sectionTitle}>{t("settings.vendors.edit.configJsonTitle")}</Text>
          <View style={styles.writeToCommonRow}>
            <Text style={styles.writeToCommonLabel}>
              {t("settings.vendors.edit.writeToCommon")}
            </Text>
            <View style={styles.checkbox} />
            <Text style={styles.editCommonConfigLink}>
              {t("settings.vendors.edit.editCommonConfig")}
            </Text>
          </View>
        </View>

        <QuickToggleRow configJson={draft.configJson} toggleQuick={toggleQuick} />

        <ConfigJsonEditor
          configJsonText={configJsonText}
          isJsonValid={isJsonValid}
          setConfigJsonText={setConfigJsonText}
        />
      </View>

      {/* ---- Section 4: Models multiselect (3.2b) ---- */}
      <View style={styles.section}>
        <VendorModelsSelect
          serverId={serverId}
          baseUrl={draft.baseUrl}
          apiKey={draft.apiKey}
          apiFormat={draft.apiFormat}
          authStyle={draft.authStyle}
          models={draftModels}
          exposedModelIds={draftExposedModelIds}
          defaultModelId={draft.defaultModelId}
          setModels={setModels}
          toggleExposed={toggleExposed}
          addManualModel={addManualModel}
          setDefaultModel={setDefaultModel}
          removeModel={removeModel}
        />
      </View>
    </AdaptiveModalSheet>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.spacing[3],
  },
  sectionTitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.7,
    fontWeight: theme.fontWeight.semibold,
  },
  sideBySide: {
    flexDirection: "row" as const,
    gap: theme.spacing[3],
  },
  sideBySlot: {
    flex: 1,
    minWidth: 0,
  },
  monoInput: {
    fontFamily: "ui-monospace, monospace",
    fontSize: theme.fontSize.sm,
  },
  apiKeyRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing[2],
  },
  apiKeyInputWrap: {
    flex: 1,
    minWidth: 0,
  },
  eyeButton: {
    width: 36,
    height: 36,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  dropdownTrigger: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 44,
  },
  dropdownTriggerPressed: {
    backgroundColor: theme.colors.surface3,
  },
  dropdownTriggerText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  configJsonHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  writeToCommonRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing[2],
  },
  writeToCommonLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  editCommonConfigLink: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.accent,
  },
  checkbox: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  quickTogglesRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: theme.spacing[3],
  },
  quickToggle: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing[2],
  },
  quickToggleLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foreground,
  },
  jsonEditor: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    color: theme.colors.foreground,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: 12,
    fontFamily: "ui-monospace, monospace",
    minHeight: 180,
    textAlignVertical: "top" as const,
  },
  jsonEditorInvalid: {
    borderColor: theme.colors.palette.red[500],
  },
  formatButton: {
    alignSelf: "flex-end" as const,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface2,
  },
  formatButtonText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foreground,
  },
  jsonNote: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    lineHeight: 16,
  },
  vendorIconBadge: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  vendorIconBadgeText: {
    color: "#ffffff",
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
  },
  headerSubtitleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing[2],
    flexWrap: "wrap" as const,
  },
  headerVendorName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  ccSwitchTag: {
    alignSelf: "flex-start" as const,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "#251f3a",
    borderColor: "#3a2f5e",
  },
  ccSwitchTagText: {
    fontSize: 10,
    fontWeight: theme.fontWeight.semibold,
    color: "#b6a3ff",
  },
  footerInner: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: theme.spacing[3],
  },
  footerExposedText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    flex: 1,
  },
  footerRight: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing[3],
  },
  submitError: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.palette.red[300],
  },
}));
