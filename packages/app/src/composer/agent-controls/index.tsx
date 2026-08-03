import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  Pressable,
  Keyboard,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useShallow } from "zustand/shallow";
import { Brain, ChevronDown, ListTodo, Settings2, ShieldCheck, Zap } from "lucide-react-native";
import { DropdownTrigger } from "@/components/ui/dropdown-trigger";
import { ComboboxTrigger } from "@/components/ui/combobox-trigger";
import { CombinedModelSelector } from "@/components/combined-model-selector";
import {
  buildProviderSelectorProviders,
  buildSelectableProviderSelectorProviders,
  type ProviderSelectorProvider,
} from "@/provider-selection/provider-selection";
import { useSessionStore } from "@/stores/session-store";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { resolveProviderDefinition } from "@/utils/provider-definitions";
import {
  buildFavoriteModelKey,
  mergeProviderPreferences,
  toggleFavoriteModel,
  useFormPreferences,
} from "@/hooks/use-form-preferences";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Combobox, ComboboxItem, type ComboboxOption } from "@/components/ui/combobox";
import { DraftAgentModeControl, AgentModeControl } from "@/composer/agent-controls/mode-control";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  AgentFeature,
  AgentMode,
  AgentModelDefinition,
  AgentProvider,
} from "@getpaseo/protocol/agent-types";
import type { AgentProviderDefinition } from "@getpaseo/protocol/provider-manifest";
import {
  getFeatureHighlightColor,
  getFeatureTooltip,
  getAgentControlHintKey,
  formatThinkingOptionLabel,
  resolveAgentModelSelection,
} from "@/composer/agent-controls/utils";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useToast } from "@/contexts/toast-context";
import { toErrorMessage } from "@/utils/error-messages";
import { showProviderNoticeToast } from "@/utils/provider-notice-toast";
import { deriveComposerToolbarLayout } from "@/composer/composer-toolbar-model";
import { useComposerModelRoutes } from "@/composer/agent-controls/use-composer-model-routes";
import { getDesktopRuntimePopoverSpec } from "@/composer/desktop-composer-spec";
import { isWeb } from "@/constants/platform";

const REASONING_POPOVER_SPEC = getDesktopRuntimePopoverSpec("reasoning");
const FEATURE_POPOVER_SPEC = getDesktopRuntimePopoverSpec("feature");

interface AgentControlOption {
  id: string;
  label: string;
}

type AgentControlSelector = "mode" | "model" | "thinking" | `feature-${string}`;

interface ControlledAgentControlsProps {
  provider: string;
  providerLabel?: string;
  providerOptions?: AgentControlOption[];
  selectedProviderId?: string;
  onSelectProvider?: (providerId: string) => void;
  modelOptions?: AgentControlOption[];
  selectedModelId?: string;
  onSelectModel?: (modelId: string) => void;
  onSelectProviderAndModel?: (provider: string, modelId: string) => void;
  thinkingOptions?: AgentControlOption[];
  selectedThinkingOptionId?: string;
  onSelectThinkingOption?: (thinkingOptionId: string) => void;
  disabled?: boolean;
  isModelLoading?: boolean;
  modelSelectorProviders?: ProviderSelectorProvider[];
  favoriteKeys?: Set<string>;
  onToggleFavoriteModel?: (provider: string, modelId: string) => void;
  features?: AgentFeature[];
  onSetFeature?: (featureId: string, value: unknown) => void;
  onDropdownClose?: () => void;
  onModelSelectorOpen?: () => void;
  onRetryModelProvider?: (provider: AgentProvider) => void;
  isRetryingModelProvider?: boolean;
  /** Extra elements rendered inline with the agent controls (desktop only). */
  desktopExtras?: ReactNode;
  modelSelectorServerId?: string | null;
  isCompactLayout?: boolean;
  compactPlacement?: "toolbar" | "overflow";
}

export interface DraftAgentControlsProps {
  providerDefinitions: AgentProviderDefinition[];
  selectedProvider: AgentProvider | null;
  onSelectProvider: (provider: AgentProvider) => void;
  modeOptions: AgentMode[];
  selectedMode: string;
  onSelectMode: (modeId: string) => void;
  models: AgentModelDefinition[];
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  isModelLoading: boolean;
  modelSelectorProviders: ProviderSelectorProvider[];
  isAllModelsLoading: boolean;
  onSelectProviderAndModel: (provider: AgentProvider, modelId: string) => void;
  thinkingOptions: NonNullable<AgentModelDefinition["thinkingOptions"]>;
  selectedThinkingOptionId: string;
  onSelectThinkingOption: (thinkingOptionId: string) => void;
  features?: AgentFeature[];
  onSetFeature?: (featureId: string, value: unknown) => void;
  onDropdownClose?: () => void;
  onModelSelectorOpen?: () => void;
  onRetryModelProvider?: (provider: AgentProvider) => void;
  isRetryingModelProvider?: boolean;
  disabled?: boolean;
  modelSelectorServerId?: string | null;
  isCompactLayout?: boolean;
  compactPlacement?: "toolbar" | "overflow";
}

interface AgentControlsProps {
  agentId: string;
  serverId: string;
  onDropdownClose?: () => void;
  isCompactLayout?: boolean;
  compactPlacement?: "toolbar" | "overflow";
}

function findOptionLabel(
  options: AgentControlOption[] | undefined,
  selectedId: string | undefined,
  fallback: string,
) {
  if (!options || options.length === 0) {
    return fallback;
  }
  const selected = options.find((option) => option.id === selectedId);
  return selected?.label ?? fallback;
}

const FEATURE_ICONS: Record<string, typeof Zap> = {
  "list-todo": ListTodo,
  "shield-check": ShieldCheck,
  zap: Zap,
};

function getFeatureIcon(icon?: string) {
  return (icon && FEATURE_ICONS[icon]) || Settings2;
}

function getFeatureIconColor(
  featureId: string,
  enabled: boolean,
  palette: {
    blue: { 400: string };
    green: { 400: string };
    yellow: { 400: string };
  },
  foregroundMuted: string,
): string {
  if (!enabled) {
    return foregroundMuted;
  }

  switch (getFeatureHighlightColor(featureId)) {
    case "blue":
      return palette.blue[400];
    case "green":
      return palette.green[400];
    case "yellow":
      return palette.yellow[400];
    default:
      return foregroundMuted;
  }
}

// Mobile agent controls only — strip namespace prefix so providers like OpenCode
// show "gpt-5.5" instead of "openrouter/gpt-5.5". Full label still appears in
// the model picker.
function shortModelLabel(label: string): string {
  const i = label.lastIndexOf("/");
  return i === -1 ? label : label.slice(i + 1);
}

/** Render the model and provider as one desktop runtime label. */
function DesktopModelTriggerContent({
  selectedModelLabel,
  providerLabel,
  routeLabel,
}: {
  selectedModelLabel: string;
  providerLabel: string;
  routeLabel: string;
}) {
  const { theme } = useUnistyles();
  return (
    <View pointerEvents="none" style={styles.desktopModelTrigger}>
      <Text style={styles.desktopModelChain} numberOfLines={1} ellipsizeMode="middle">
        <Text style={styles.desktopModelSecondary}>{providerLabel}</Text>
        <Text style={styles.desktopModelSeparator}> · </Text>
        <Text style={styles.desktopModelSecondary}>{routeLabel}</Text>
        <Text style={styles.desktopModelSeparator}> · </Text>
        <Text style={styles.desktopModelPrimary}>{shortModelLabel(selectedModelLabel)}</Text>
      </Text>
      <ChevronDown size={13} color={theme.colors.foregroundMuted} />
    </View>
  );
}

type ActiveSheet = "thinking" | "features" | null;

function resolveHasAnyControl({
  canSelectModel,
  thinkingOptions,
  features,
  hasDesktopExtras,
}: {
  canSelectModel: boolean;
  thinkingOptions: AgentControlOption[] | undefined;
  features: AgentFeature[] | undefined;
  hasDesktopExtras: boolean;
}) {
  return (
    canSelectModel ||
    Boolean(thinkingOptions?.length) ||
    Boolean(features?.length) ||
    hasDesktopExtras
  );
}

function toComboboxOptions(options: AgentControlOption[] | undefined): ComboboxOption[] {
  return (options ?? []).map((o) => ({ id: o.id, label: o.label }));
}

function toThinkingControlOptions(options: AgentControlOption[] | undefined): AgentControlOption[] {
  return (options ?? []).map((option) => ({
    id: option.id,
    label: formatThinkingOptionLabel(option),
  }));
}

function buildFallbackModelSelectorProviders(
  provider: string,
  modelOptions: AgentControlOption[] | undefined,
): ProviderSelectorProvider[] {
  if (!modelOptions || modelOptions.length === 0) {
    return [];
  }
  return [
    {
      id: provider,
      label: provider,
      modelSelection: {
        kind: "models",
        rows: modelOptions.map((option) => ({
          favoriteKey: buildFavoriteModelKey({ provider, modelId: option.id }),
          provider,
          providerLabel: provider,
          modelId: option.id,
          modelLabel: option.label,
        })),
      },
    },
  ];
}

function makeBadgePressableStyle(
  baseStyle: StyleProp<ViewStyle>,
  disabledStyle: StyleProp<ViewStyle>,
  disabled: boolean,
  isOpen: boolean,
) {
  return ({ pressed, hovered }: PressableStateCallbackType) => [
    baseStyle,
    hovered && styles.modeBadgeHovered,
    (pressed || isOpen) && styles.modeBadgePressed,
    disabled && disabledStyle,
  ];
}

function pickSheetModel({
  nextProviderId,
  modelId,
  currentProvider,
  onSelectProviderAndModel,
  onSelectProvider,
  onSelectModel,
}: {
  nextProviderId: string;
  modelId: string;
  currentProvider: string;
  onSelectProviderAndModel?: (provider: string, modelId: string) => void;
  onSelectProvider?: (providerId: string) => void;
  onSelectModel?: (modelId: string) => void;
}) {
  if (onSelectProviderAndModel) {
    onSelectProviderAndModel(nextProviderId, modelId);
    return;
  }
  if (nextProviderId !== currentProvider) {
    onSelectProvider?.(nextProviderId);
  }
  onSelectModel?.(modelId);
}

function pickDesktopModel({
  nextProviderId,
  modelId,
  currentProvider,
  onSelectModel,
}: {
  nextProviderId: string;
  modelId: string;
  currentProvider: string;
  onSelectModel?: (modelId: string) => void;
}) {
  if (nextProviderId === currentProvider) {
    onSelectModel?.(modelId);
  }
}

type AgentControlsSlice = {
  provider: string;
  cwd: string | null;
  runtimeModelId: string | null;
  model: string | null | undefined;
  features: AgentFeature[] | undefined;
  thinkingOptionId: string | null | undefined;
  lastUsage: unknown;
} | null;

function selectAgentControlsSlice(
  state: ReturnType<typeof useSessionStore.getState>,
  serverId: string,
  agentId: string,
): AgentControlsSlice {
  const currentAgent = state.sessions[serverId]?.agents?.get(agentId) ?? null;
  if (!currentAgent) {
    return null;
  }
  return {
    provider: currentAgent.provider,
    cwd: currentAgent.cwd,
    runtimeModelId: currentAgent.runtimeInfo?.model ?? null,
    model: currentAgent.model,
    features: currentAgent.features,
    thinkingOptionId: currentAgent.thinkingOptionId,
    lastUsage: currentAgent.lastUsage,
  };
}

function resolveSnapshotSelectedEntry(
  snapshotEntries: ReturnType<typeof useProvidersSnapshot>["entries"],
  agentProvider: string | undefined,
) {
  if (!snapshotEntries || !agentProvider) {
    return null;
  }
  return snapshotEntries.find((e) => e.provider === agentProvider) ?? null;
}

function buildAgentProviderDefinitions(
  agentProvider: string | undefined,
  snapshotEntries: ReturnType<typeof useProvidersSnapshot>["entries"],
): AgentProviderDefinition[] {
  const definition = agentProvider
    ? resolveProviderDefinition(agentProvider, snapshotEntries)
    : undefined;
  return definition ? [definition] : [];
}

function buildAgentProviderModels(
  agentProvider: string | undefined,
  models: AgentModelDefinition[] | null,
): Map<string, AgentModelDefinition[]> {
  const map = new Map<string, AgentModelDefinition[]>();
  if (agentProvider && models) {
    map.set(agentProvider, models);
  }
  return map;
}

function buildOpenChangeHandler(
  selector: AgentControlSelector,
  setOpenSelector: (next: AgentControlSelector | null) => void,
  onDropdownClose?: () => void,
) {
  return (nextOpen: boolean) => {
    setOpenSelector(nextOpen ? selector : null);
    if (!nextOpen) {
      onDropdownClose?.();
    }
  };
}

/** Render capability-driven controls in either the persistent toolbar or the compact + overflow. */
// oxlint-disable-next-line complexity
function ControlledAgentControls({
  provider,
  providerLabel,
  providerOptions,
  selectedProviderId,
  onSelectProvider,
  modelOptions,
  selectedModelId,
  onSelectModel,
  onSelectProviderAndModel,
  thinkingOptions,
  selectedThinkingOptionId,
  onSelectThinkingOption,
  disabled = false,
  isModelLoading = false,
  modelSelectorProviders,
  favoriteKeys = new Set<string>(),
  onToggleFavoriteModel,
  features,
  onSetFeature,
  onDropdownClose,
  onModelSelectorOpen,
  onRetryModelProvider,
  isRetryingModelProvider = false,
  desktopExtras,
  modelSelectorServerId = null,
  isCompactLayout,
  compactPlacement = "toolbar",
}: ControlledAgentControlsProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const isCompactFormFactor = useIsCompactFormFactor();
  const isCompact = isCompactLayout ?? isCompactFormFactor;
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [openSelector, setOpenSelector] = useState<AgentControlSelector | null>(null);

  const thinkingAnchorRef = useRef<View>(null);

  const canSelectModel = Boolean(onSelectModel);
  const canSelectThinking = Boolean(
    onSelectThinkingOption && thinkingOptions && thinkingOptions.length > 0,
  );

  const displayProvider = findOptionLabel(
    providerOptions,
    selectedProviderId,
    providerLabel ?? provider ?? t("agentControls.provider.fallback"),
  );
  const formattedThinkingOptions = useMemo(
    () => toThinkingControlOptions(thinkingOptions),
    [thinkingOptions],
  );
  const displayThinking = findOptionLabel(
    formattedThinkingOptions,
    selectedThinkingOptionId,
    formattedThinkingOptions[0]?.label ?? t("agentControls.thinking.unknown"),
  );

  const hasAnyControl = resolveHasAnyControl({
    canSelectModel,
    thinkingOptions,
    features,
    hasDesktopExtras: desktopExtras !== null && desktopExtras !== undefined,
  });
  const toolbarLayout = deriveComposerToolbarLayout({
    isCompact,
    hasModel: canSelectModel,
    hasThinking: Boolean(thinkingOptions?.length),
    hasMode: desktopExtras !== null && desktopExtras !== undefined,
    hasFeatures: Boolean(features?.length),
  });
  const compactControls =
    compactPlacement === "toolbar" ? toolbarLayout.persistent : toolbarLayout.overflow;
  const containerStyle = useMemo(
    () =>
      isCompact && compactPlacement === "overflow"
        ? [styles.container, styles.overflowContainer]
        : styles.container,
    [compactPlacement, isCompact],
  );

  const modelDisabled = disabled;

  const fallbackModelSelectorProviders = useMemo(
    () => buildFallbackModelSelectorProviders(provider, modelOptions),
    [modelOptions, provider],
  );
  const effectiveModelSelectorProviders = modelSelectorProviders ?? fallbackModelSelectorProviders;
  const modelRoutes = useComposerModelRoutes({
    serverId: modelSelectorServerId,
    providers: effectiveModelSelectorProviders,
    selectedProvider: provider,
  });
  const comboboxThinkingOptions = useMemo<ComboboxOption[]>(
    () => toComboboxOptions(formattedThinkingOptions),
    [formattedThinkingOptions],
  );

  const renderThinkingOption = useCallback(
    (args: { option: ComboboxOption; selected: boolean; active: boolean; onPress: () => void }) => (
      <ThinkingComboboxOption
        option={args.option}
        selected={args.selected}
        active={args.active}
        onPress={args.onPress}
        iconColor={theme.colors.foreground}
      />
    ),
    [theme.colors.foreground],
  );

  const handleOpenChange = useCallback(
    (selector: AgentControlSelector) =>
      buildOpenChangeHandler(selector, setOpenSelector, onDropdownClose),
    [onDropdownClose],
  );

  const handleThinkingPress = useCallback(() => {
    handleOpenChange("thinking")(openSelector !== "thinking");
  }, [handleOpenChange, openSelector]);

  const handleThinkingOpenChange = useMemo(() => handleOpenChange("thinking"), [handleOpenChange]);

  const handleThinkingSelect = useCallback(
    (id: string) => onSelectThinkingOption?.(id),
    [onSelectThinkingOption],
  );

  const handleDesktopModelSelect = useCallback(
    (nextProviderId: string, modelId: string) => {
      pickDesktopModel({ nextProviderId, modelId, currentProvider: provider, onSelectModel });
    },
    [onSelectModel, provider],
  );

  const thinkingPressableStyle = useMemo(
    () =>
      makeBadgePressableStyle(
        styles.modeBadge,
        styles.disabledBadge,
        disabled || !canSelectThinking,
        openSelector === "thinking",
      ),
    [canSelectThinking, disabled, openSelector],
  );

  const handleOpenSheet = useCallback((sheet: Exclude<ActiveSheet, null>) => {
    Keyboard.dismiss();
    setActiveSheet(sheet);
  }, []);

  const handleCloseSheet = useCallback(() => {
    setActiveSheet(null);
  }, []);

  const handleSelectThinkingAndClose = useCallback(
    (thinkingOptionId: string) => {
      onSelectThinkingOption?.(thinkingOptionId);
      setActiveSheet(null);
    },
    [onSelectThinkingOption],
  );

  const handleSheetModelSelect = useCallback(
    (nextProviderId: string, modelId: string) => {
      pickSheetModel({
        nextProviderId,
        modelId,
        currentProvider: provider,
        onSelectProviderAndModel,
        onSelectProvider,
        onSelectModel,
      });
    },
    [onSelectModel, onSelectProvider, onSelectProviderAndModel, provider],
  );

  if (!hasAnyControl) {
    return null;
  }
  if (isCompact && compactControls.length === 0) {
    return null;
  }

  return (
    <View style={containerStyle}>
      {!isCompact ? (
        <DesktopAgentControlsContent
          provider={provider}
          selectedModelId={selectedModelId}
          thinkingOptions={formattedThinkingOptions}
          selectedThinkingOptionId={selectedThinkingOptionId}
          features={features}
          onSetFeature={onSetFeature}
          onToggleFavoriteModel={onToggleFavoriteModel}
          onDropdownClose={onDropdownClose}
          onModelSelectorOpen={onModelSelectorOpen}
          onRetryModelProvider={onRetryModelProvider}
          isRetryingModelProvider={isRetryingModelProvider}
          favoriteKeys={favoriteKeys}
          disabled={disabled}
          isModelLoading={isModelLoading}
          canSelectModel={canSelectModel}
          canSelectThinking={canSelectThinking}
          modelSelectorProviders={effectiveModelSelectorProviders}
          modelRoutes={modelRoutes}
          modelDisabled={modelDisabled}
          comboboxThinkingOptions={comboboxThinkingOptions}
          displayProvider={displayProvider}
          displayThinking={displayThinking}
          openSelector={openSelector}
          thinkingAnchorRef={thinkingAnchorRef}
          thinkingPressableStyle={thinkingPressableStyle}
          handleThinkingPress={handleThinkingPress}
          handleThinkingSelect={handleThinkingSelect}
          handleDesktopModelSelect={handleDesktopModelSelect}
          onSelectProvider={onSelectProvider}
          handleThinkingOpenChange={handleThinkingOpenChange}
          handleOpenChange={handleOpenChange}
          renderThinkingOption={renderThinkingOption}
          extras={desktopExtras}
          modelSelectorServerId={modelSelectorServerId}
        />
      ) : (
        <SheetAgentControlsContent
          provider={provider}
          selectedModelId={selectedModelId}
          selectedThinkingOptionId={selectedThinkingOptionId}
          features={features}
          onSetFeature={onSetFeature}
          onToggleFavoriteModel={onToggleFavoriteModel}
          onDropdownClose={onDropdownClose}
          onModelSelectorOpen={onModelSelectorOpen}
          onRetryModelProvider={onRetryModelProvider}
          isRetryingModelProvider={isRetryingModelProvider}
          favoriteKeys={favoriteKeys}
          disabled={disabled}
          isModelLoading={isModelLoading}
          canSelectModel={canSelectModel}
          canSelectThinking={canSelectThinking}
          modelSelectorProviders={effectiveModelSelectorProviders}
          modelRoutes={modelRoutes}
          modelDisabled={modelDisabled}
          comboboxThinkingOptions={comboboxThinkingOptions}
          openSelector={openSelector}
          activeSheet={activeSheet}
          handleOpenSheet={handleOpenSheet}
          handleCloseSheet={handleCloseSheet}
          handleSheetModelSelect={handleSheetModelSelect}
          onSelectProvider={onSelectProvider}
          handleSelectThinkingAndClose={handleSelectThinkingAndClose}
          handleOpenChange={handleOpenChange}
          renderThinkingOption={renderThinkingOption}
          modelSelectorServerId={modelSelectorServerId}
          showModel={compactControls.includes("model")}
          showThinking={compactControls.includes("thinking")}
          showFeatures={compactControls.includes("features")}
          extras={compactControls.includes("mode") ? desktopExtras : null}
          compactPlacement={compactPlacement}
          displayThinking={displayThinking}
          providerLocked={!onSelectProvider}
        />
      )}
    </View>
  );
}

interface DesktopAgentControlsContentProps {
  provider: string;
  selectedModelId?: string;
  thinkingOptions?: AgentControlOption[];
  selectedThinkingOptionId?: string;
  features?: AgentFeature[];
  onSetFeature?: (featureId: string, value: unknown) => void;
  onToggleFavoriteModel?: (provider: string, modelId: string) => void;
  onDropdownClose?: () => void;
  onModelSelectorOpen?: () => void;
  onRetryModelProvider?: (provider: AgentProvider) => void;
  isRetryingModelProvider: boolean;
  favoriteKeys: Set<string>;
  disabled: boolean;
  isModelLoading: boolean;
  canSelectModel: boolean;
  canSelectThinking: boolean;
  modelSelectorProviders: ProviderSelectorProvider[];
  modelRoutes: ReturnType<typeof useComposerModelRoutes>;
  modelDisabled: boolean;
  comboboxThinkingOptions: ComboboxOption[];
  displayProvider: string;
  displayThinking: string;
  openSelector: AgentControlSelector | null;
  thinkingAnchorRef: RefObject<View | null>;
  thinkingPressableStyle: (state: PressableStateCallbackType) => StyleProp<ViewStyle>;
  handleThinkingPress: () => void;
  handleThinkingSelect: (id: string) => void;
  handleDesktopModelSelect: (providerId: string, modelId: string) => void;
  onSelectProvider?: (providerId: string) => void;
  handleThinkingOpenChange: (open: boolean) => void;
  handleOpenChange: (selector: AgentControlSelector) => (nextOpen: boolean) => void;
  renderThinkingOption: (args: {
    option: ComboboxOption;
    selected: boolean;
    active: boolean;
    onPress: () => void;
  }) => ReactElement;
  extras?: ReactNode;
  modelSelectorServerId: string | null;
}

function DesktopAgentControlsContent(props: DesktopAgentControlsContentProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const {
    provider,
    selectedModelId,
    thinkingOptions,
    selectedThinkingOptionId,
    features,
    onSetFeature,
    onToggleFavoriteModel,
    onDropdownClose,
    onModelSelectorOpen,
    onRetryModelProvider,
    isRetryingModelProvider,
    favoriteKeys,
    disabled,
    isModelLoading,
    canSelectModel,
    canSelectThinking,
    modelSelectorProviders,
    modelRoutes,
    modelDisabled,
    comboboxThinkingOptions,
    displayProvider,
    displayThinking,
    openSelector,
    thinkingAnchorRef,
    thinkingPressableStyle,
    handleThinkingPress,
    handleThinkingSelect,
    handleDesktopModelSelect,
    onSelectProvider,
    handleThinkingOpenChange,
    handleOpenChange,
    renderThinkingOption,
    extras,
    modelSelectorServerId,
  } = props;
  const selectedRouteLabel =
    modelRoutes.routes[provider]?.find((route) => route.id === modelRoutes.selectedRouteId)
      ?.label ?? t("modelSelector.routeLabel");
  const thinkingPopoverHeader = useMemo(
    () => (
      <View style={styles.popoverHeader}>
        <Text style={styles.popoverTitle}>{t("agentControls.thinking.strengthTitle")}</Text>
        {selectedModelId ? (
          <Text style={styles.popoverSubtitle} numberOfLines={1}>
            {shortModelLabel(selectedModelId)}
          </Text>
        ) : null}
      </View>
    ),
    [selectedModelId, t],
  );

  const renderDesktopModelTrigger = useCallback(
    ({ selectedModelLabel }: { selectedModelLabel: string }) => (
      <DesktopModelTriggerContent
        selectedModelLabel={selectedModelLabel}
        providerLabel={displayProvider}
        routeLabel={selectedRouteLabel}
      />
    ),
    [displayProvider, selectedRouteLabel],
  );

  return (
    <>
      {canSelectModel ? (
        <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger asChild triggerRefProp="ref">
            <View style={styles.modelControlAnchor}>
              <CombinedModelSelector
                providers={modelSelectorProviders}
                routes={modelRoutes.routes}
                selectedProvider={provider}
                selectedRouteId={modelRoutes.selectedRouteId}
                selectedModel={selectedModelId ?? ""}
                onSelect={handleDesktopModelSelect}
                onSelectProvider={onSelectProvider}
                onSelectRoute={modelRoutes.selectRoute}
                favoriteKeys={favoriteKeys}
                onToggleFavorite={onToggleFavoriteModel}
                isLoading={isModelLoading}
                disabled={modelDisabled}
                onOpen={onModelSelectorOpen}
                onClose={onDropdownClose}
                onRetryProvider={onRetryModelProvider}
                isRetryingProvider={isRetryingModelProvider}
                renderTrigger={renderDesktopModelTrigger}
                serverId={modelSelectorServerId}
                providerLocked={!onSelectProvider}
              />
            </View>
          </TooltipTrigger>
          <TooltipContent side="top" align="center" offset={8}>
            <Text style={styles.tooltipText}>{t(getAgentControlHintKey("model"))}</Text>
          </TooltipContent>
        </Tooltip>
      ) : null}

      {thinkingOptions && thinkingOptions.length > 0 ? (
        <>
          <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
            <TooltipTrigger asChild triggerRefProp="ref">
              <ComboboxTrigger
                ref={thinkingAnchorRef}
                collapsable={false}
                disabled={disabled || !canSelectThinking}
                onPress={handleThinkingPress}
                style={thinkingPressableStyle}
                accessibilityRole="button"
                accessibilityLabel={t("agentControls.thinking.selectWithValue", {
                  value: displayThinking,
                })}
                testID="agent-thinking-selector"
              >
                <Text style={styles.runtimeBadgeText} numberOfLines={1}>
                  {displayThinking}
                </Text>
                <ChevronDown size={13} color={theme.colors.foregroundMuted} />
              </ComboboxTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" offset={8}>
              <Text style={styles.tooltipText}>{t(getAgentControlHintKey("thinking"))}</Text>
            </TooltipContent>
          </Tooltip>
          <Combobox
            options={comboboxThinkingOptions}
            value={selectedThinkingOptionId ?? ""}
            onSelect={handleThinkingSelect}
            searchable={false}
            open={openSelector === "thinking"}
            onOpenChange={handleThinkingOpenChange}
            anchorRef={thinkingAnchorRef}
            desktopPlacement={REASONING_POPOVER_SPEC.placement}
            desktopOffset={REASONING_POPOVER_SPEC.offset}
            desktopWidth={REASONING_POPOVER_SPEC.width}
            desktopSurfaceVariant="composer"
            stickyHeader={thinkingPopoverHeader}
            renderOption={renderThinkingOption}
          />
        </>
      ) : null}

      {extras}

      {(features ?? []).map((feature) => (
        <DesktopFeatureControl
          key={feature.id}
          feature={feature}
          disabled={disabled}
          openSelector={openSelector}
          handleOpenChange={handleOpenChange}
          onSetFeature={onSetFeature}
        />
      ))}
    </>
  );
}

interface SheetAgentControlsContentProps {
  provider: string;
  selectedModelId?: string;
  selectedThinkingOptionId?: string;
  features?: AgentFeature[];
  onSetFeature?: (featureId: string, value: unknown) => void;
  onToggleFavoriteModel?: (provider: string, modelId: string) => void;
  onDropdownClose?: () => void;
  onModelSelectorOpen?: () => void;
  onRetryModelProvider?: (provider: AgentProvider) => void;
  isRetryingModelProvider: boolean;
  favoriteKeys: Set<string>;
  disabled: boolean;
  isModelLoading: boolean;
  canSelectModel: boolean;
  canSelectThinking: boolean;
  modelSelectorProviders: ProviderSelectorProvider[];
  modelRoutes: ReturnType<typeof useComposerModelRoutes>;
  modelDisabled: boolean;
  comboboxThinkingOptions: ComboboxOption[];
  openSelector: AgentControlSelector | null;
  activeSheet: ActiveSheet;
  handleOpenSheet: (sheet: Exclude<ActiveSheet, null>) => void;
  handleCloseSheet: () => void;
  handleSheetModelSelect: (providerId: string, modelId: string) => void;
  onSelectProvider?: (providerId: string) => void;
  handleSelectThinkingAndClose: (thinkingOptionId: string) => void;
  handleOpenChange: (selector: AgentControlSelector) => (nextOpen: boolean) => void;
  renderThinkingOption: (args: {
    option: ComboboxOption;
    selected: boolean;
    active: boolean;
    onPress: () => void;
  }) => ReactElement;
  modelSelectorServerId: string | null;
  showModel: boolean;
  showThinking: boolean;
  showFeatures: boolean;
  extras?: ReactNode;
  compactPlacement: "toolbar" | "overflow";
  displayThinking: string;
  providerLocked: boolean;
}

function SheetAgentControlsContent(props: SheetAgentControlsContentProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const {
    provider,
    selectedModelId,
    selectedThinkingOptionId,
    features,
    onSetFeature,
    onToggleFavoriteModel,
    onDropdownClose,
    onModelSelectorOpen,
    onRetryModelProvider,
    isRetryingModelProvider,
    favoriteKeys,
    disabled,
    isModelLoading,
    canSelectModel,
    canSelectThinking,
    modelSelectorProviders,
    modelRoutes,
    modelDisabled,
    comboboxThinkingOptions,
    openSelector,
    activeSheet,
    handleOpenSheet,
    handleCloseSheet,
    handleSheetModelSelect,
    onSelectProvider,
    handleSelectThinkingAndClose,
    handleOpenChange,
    renderThinkingOption,
    modelSelectorServerId,
    showModel,
    showThinking,
    showFeatures,
    extras,
    compactPlacement,
    displayThinking,
    providerLocked,
  } = props;

  const thinkingAnchorRef = useRef<View | null>(null);

  const hasThinking = showThinking && comboboxThinkingOptions.length > 0;
  const hasFeatures = showFeatures && Boolean(features && features.length > 0);
  const featuresSheetHeader = useMemo<SheetHeader>(
    () => ({ title: t("agentControls.features.title") }),
    [t],
  );

  const handleOpenThinking = useCallback(() => handleOpenSheet("thinking"), [handleOpenSheet]);
  const handleOpenFeatures = useCallback(() => handleOpenSheet("features"), [handleOpenSheet]);
  const handleThinkingSheetOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        handleOpenSheet("thinking");
      } else {
        handleCloseSheet();
      }
    },
    [handleCloseSheet, handleOpenSheet],
  );

  const renderModelTrigger = useCallback(
    ({
      selectedModelLabel,
    }: {
      selectedModelLabel: string;
      onPress: () => void;
      disabled: boolean;
      isOpen: boolean;
    }) => (
      <View pointerEvents="none" style={styles.prefsButton} testID="agent-controls-model">
        <Text style={styles.prefsButtonText} numberOfLines={1}>
          {shortModelLabel(selectedModelLabel)}
        </Text>
        <ChevronDown size={13} color={theme.colors.foregroundMuted} />
      </View>
    ),
    [theme.colors.foregroundMuted],
  );

  const thinkingButtonStyle = makeBadgePressableStyle(
    styles.modeIconBadge,
    styles.disabledBadge,
    disabled || !canSelectThinking,
    activeSheet === "thinking",
  );
  const featuresButtonStyle = makeBadgePressableStyle(
    styles.modeIconBadge,
    styles.disabledBadge,
    disabled,
    activeSheet === "features",
  );

  return (
    <>
      {showModel && canSelectModel ? (
        <CombinedModelSelector
          providers={modelSelectorProviders}
          routes={modelRoutes.routes}
          selectedProvider={provider}
          selectedRouteId={modelRoutes.selectedRouteId}
          selectedModel={selectedModelId ?? ""}
          onSelect={handleSheetModelSelect}
          onSelectProvider={onSelectProvider}
          onSelectRoute={modelRoutes.selectRoute}
          favoriteKeys={favoriteKeys}
          onToggleFavorite={onToggleFavoriteModel}
          isLoading={isModelLoading}
          disabled={modelDisabled}
          onOpen={onModelSelectorOpen}
          onClose={onDropdownClose}
          onRetryProvider={onRetryModelProvider}
          isRetryingProvider={isRetryingModelProvider}
          renderTrigger={renderModelTrigger}
          serverId={modelSelectorServerId}
          providerLocked={providerLocked}
        />
      ) : null}

      {hasThinking ? (
        <Pressable
          ref={thinkingAnchorRef}
          onPress={handleOpenThinking}
          disabled={disabled || !canSelectThinking}
          style={compactPlacement === "overflow" ? styles.overflowControl : thinkingButtonStyle}
          accessibilityRole="button"
          accessibilityLabel={t("agentControls.thinking.select")}
          testID="agent-controls-thinking"
        >
          <Brain size={theme.iconSize.md} color={theme.colors.foregroundMuted} />
          {compactPlacement === "overflow" ? (
            <Text style={styles.overflowControlText}>{displayThinking}</Text>
          ) : null}
        </Pressable>
      ) : null}

      {extras}

      {hasFeatures ? (
        <Pressable
          onPress={handleOpenFeatures}
          disabled={disabled}
          style={compactPlacement === "overflow" ? styles.overflowControl : featuresButtonStyle}
          accessibilityRole="button"
          accessibilityLabel={t("agentControls.features.open")}
          testID="agent-controls-features"
        >
          <Settings2 size={theme.iconSize.md} color={theme.colors.foregroundMuted} />
          {compactPlacement === "overflow" ? (
            <Text style={styles.overflowControlText}>{t("agentControls.features.title")}</Text>
          ) : null}
        </Pressable>
      ) : null}

      {hasThinking ? (
        <Combobox
          options={comboboxThinkingOptions}
          value={selectedThinkingOptionId ?? ""}
          onSelect={handleSelectThinkingAndClose}
          searchable={false}
          title={t("agentControls.thinking.title")}
          open={activeSheet === "thinking"}
          onOpenChange={handleThinkingSheetOpenChange}
          anchorRef={thinkingAnchorRef}
          renderOption={renderThinkingOption}
        />
      ) : null}

      <AdaptiveModalSheet
        header={featuresSheetHeader}
        visible={activeSheet === "features"}
        onClose={handleCloseSheet}
        testID="agent-features-sheet"
      >
        {(features ?? []).map((feature) => (
          <SheetFeatureItem
            key={`feature-${feature.id}`}
            feature={feature}
            disabled={disabled}
            openSelector={openSelector}
            handleOpenChange={handleOpenChange}
            onSetFeature={onSetFeature}
          />
        ))}
      </AdaptiveModalSheet>
    </>
  );
}

function SheetFeatureItem({
  feature,
  disabled,
  openSelector,
  handleOpenChange,
  onSetFeature,
}: {
  feature: AgentFeature;
  disabled: boolean;
  openSelector: AgentControlSelector | null;
  handleOpenChange: (selector: AgentControlSelector) => (nextOpen: boolean) => void;
  onSetFeature?: (featureId: string, value: unknown) => void;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const featureSelector: AgentControlSelector = `feature-${feature.id}`;

  const handleFeatureOpenChange = useMemo(
    () => handleOpenChange(featureSelector),
    [handleOpenChange, featureSelector],
  );

  const handleTogglePress = useCallback(() => {
    if (feature.type === "toggle") {
      onSetFeature?.(feature.id, !feature.value);
    }
  }, [feature, onSetFeature]);

  const handleSelectOption = useCallback(
    (optionId: string) => {
      onSetFeature?.(feature.id, optionId);
    },
    [feature.id, onSetFeature],
  );

  const togglePressableStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.sheetSelect,
      pressed && styles.sheetSelectPressed,
      disabled && styles.disabledSheetSelect,
    ],
    [disabled],
  );

  if (feature.type === "toggle") {
    const FeatureIcon = getFeatureIcon(feature.icon);
    return (
      <View style={styles.sheetSection}>
        <Pressable
          disabled={disabled}
          onPress={handleTogglePress}
          style={togglePressableStyle}
          accessibilityRole="button"
          accessibilityLabel={getFeatureTooltip(feature)}
          testID={`agent-feature-${feature.id}`}
        >
          <FeatureIcon
            size={theme.iconSize.md}
            color={getFeatureIconColor(
              feature.id,
              feature.value,
              theme.colors.palette,
              theme.colors.foregroundMuted,
            )}
          />
          <Text style={styles.sheetSelectText}>{feature.label}</Text>
          <Text style={styles.modeBadgeText}>
            {feature.value ? t("agentControls.features.on") : t("agentControls.features.off")}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (feature.type === "select") {
    const selectedOption = feature.options.find((o) => o.id === feature.value);
    return (
      <View style={styles.sheetSection}>
        <DropdownMenu
          open={openSelector === featureSelector}
          onOpenChange={handleFeatureOpenChange}
        >
          <DropdownTrigger
            disabled={disabled}
            style={togglePressableStyle}
            accessibilityRole="button"
            accessibilityLabel={getFeatureTooltip(feature)}
            testID={`agent-feature-${feature.id}`}
          >
            <Text style={styles.sheetSelectText}>{selectedOption?.label ?? feature.label}</Text>
          </DropdownTrigger>
          <DropdownMenuContent side="top" align="start">
            {feature.options.map((option) => (
              <FeatureOptionMenuItem
                key={option.id}
                option={option}
                selected={option.id === feature.value}
                onSelect={handleSelectOption}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </View>
    );
  }

  return null;
}

/** Render one capability-defined feature as an independent desktop runtime control. */
function DesktopFeatureControl({
  feature,
  disabled,
  openSelector,
  handleOpenChange,
  onSetFeature,
}: {
  feature: AgentFeature;
  disabled: boolean;
  openSelector: AgentControlSelector | null;
  handleOpenChange: (selector: AgentControlSelector) => (nextOpen: boolean) => void;
  onSetFeature?: (featureId: string, value: unknown) => void;
}) {
  const { theme } = useUnistyles();
  const featureSelector: AgentControlSelector = `feature-${feature.id}`;
  const anchorRef = useRef<View>(null);
  const FeatureIcon = getFeatureIcon(feature.icon);
  const featureTooltip = getFeatureTooltip(feature);
  const handleFeatureOpenChange = useMemo(
    () => handleOpenChange(featureSelector),
    [featureSelector, handleOpenChange],
  );
  const handleSelectOption = useCallback(
    (optionId: string) => onSetFeature?.(feature.id, optionId),
    [feature.id, onSetFeature],
  );
  const handleToggle = useCallback(() => {
    if (feature.type === "toggle") {
      onSetFeature?.(feature.id, !feature.value);
    }
  }, [feature, onSetFeature]);
  const handleFeaturePress = useCallback(
    () => handleFeatureOpenChange(openSelector !== featureSelector),
    [featureSelector, handleFeatureOpenChange, openSelector],
  );
  const options = useMemo<ComboboxOption[]>(
    () =>
      feature.type === "select"
        ? feature.options.map((option) => ({ id: option.id, label: option.label }))
        : [],
    [feature],
  );
  const accessibilityState = useMemo(
    () => ({
      checked: feature.type === "toggle" ? feature.value : false,
      disabled: disabled || !onSetFeature,
    }),
    [disabled, feature, onSetFeature],
  );
  const toggleStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.desktopFeatureToggle,
      feature.type === "toggle" && feature.value ? styles.desktopFeatureToggleActive : null,
      hovered ? styles.modeBadgeHovered : null,
      pressed ? styles.modeBadgePressed : null,
      disabled || !onSetFeature ? styles.disabledBadge : null,
    ],
    [disabled, feature, onSetFeature],
  );

  if (feature.type === "toggle") {
    return (
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger
          onPress={handleToggle}
          disabled={disabled || !onSetFeature}
          style={toggleStyle}
          accessibilityRole="switch"
          accessibilityState={accessibilityState}
          accessibilityLabel={featureTooltip}
          testID={`agent-feature-${feature.id}`}
        >
          <FeatureIcon
            size={theme.iconSize.sm}
            color={getFeatureIconColor(
              feature.id,
              feature.value,
              theme.colors.palette,
              theme.colors.foregroundMuted,
            )}
          />
        </TooltipTrigger>
        <TooltipContent side="top" align="center" offset={8}>
          <Text style={styles.tooltipText}>{featureTooltip}</Text>
        </TooltipContent>
      </Tooltip>
    );
  }

  const selectedOption = options.find((option) => option.id === feature.value);
  const selectStyle = makeBadgePressableStyle(
    styles.desktopFeatureSelect,
    styles.disabledBadge,
    disabled || !onSetFeature,
    openSelector === featureSelector,
  );
  return (
    <>
      <ComboboxTrigger
        ref={anchorRef}
        collapsable={false}
        disabled={disabled || !onSetFeature}
        onPress={handleFeaturePress}
        style={selectStyle}
        accessibilityRole="button"
        accessibilityLabel={featureTooltip}
        testID={`agent-feature-${feature.id}`}
      >
        <FeatureIcon size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
        <Text style={styles.runtimeBadgeText} numberOfLines={1}>
          {selectedOption?.label ?? feature.label}
        </Text>
        <ChevronDown size={13} color={theme.colors.foregroundMuted} />
      </ComboboxTrigger>
      <Combobox
        options={options}
        value={String(feature.value)}
        onSelect={handleSelectOption}
        searchable={false}
        open={openSelector === featureSelector}
        onOpenChange={handleFeatureOpenChange}
        anchorRef={anchorRef}
        desktopPlacement={FEATURE_POPOVER_SPEC.placement}
        desktopOffset={FEATURE_POPOVER_SPEC.offset}
        desktopWidth={FEATURE_POPOVER_SPEC.width}
        desktopSurfaceVariant="composer"
        desktopOptionPresentation="compact"
      />
    </>
  );
}

function FeatureOptionMenuItem({
  option,
  selected,
  onSelect,
}: {
  option: { id: string; label: string };
  selected: boolean;
  onSelect: (optionId: string) => void;
}) {
  const handleSelect = useCallback(() => {
    onSelect(option.id);
  }, [onSelect, option.id]);

  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {option.label}
    </DropdownMenuItem>
  );
}

function ThinkingComboboxOption({
  option,
  selected,
  active,
  onPress,
  iconColor,
}: {
  option: ComboboxOption;
  selected: boolean;
  active: boolean;
  onPress: () => void;
  iconColor: string;
}) {
  const isCompact = useIsCompactFormFactor() && !isWeb;
  const leadingSlot = useMemo(
    () => (isCompact ? <Brain size={16} color={iconColor} /> : null),
    [iconColor, isCompact],
  );
  return (
    <ComboboxItem
      label={option.label}
      selected={selected}
      active={active}
      onPress={onPress}
      leadingSlot={leadingSlot}
      presentation={isCompact ? "default" : "compact"}
    />
  );
}

export const AgentControls = memo(function AgentControls({
  agentId,
  serverId,
  onDropdownClose,
  isCompactLayout,
  compactPlacement = "toolbar",
}: AgentControlsProps) {
  const { preferences, updatePreferences } = useFormPreferences();
  const agent = useSessionStore(
    useShallow((state) => selectAgentControlsSlice(state, serverId, agentId)),
  );
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const toast = useToast();

  const {
    entries: snapshotEntries,
    isLoading: snapshotIsLoading,
    isRefreshing: snapshotIsRefreshing,
    refresh: refreshSnapshot,
    refetchIfStale: refetchSnapshotIfStale,
  } = useProvidersSnapshot(serverId, { cwd: agent?.cwd });

  const snapshotSelectedEntry = useMemo(
    () => resolveSnapshotSelectedEntry(snapshotEntries, agent?.provider),
    [snapshotEntries, agent?.provider],
  );

  const models = snapshotSelectedEntry?.models ?? null;
  const selectedProviderIsLoading = snapshotSelectedEntry?.status === "loading";

  const agentProviderDefinitions = useMemo(
    () => buildAgentProviderDefinitions(agent?.provider, snapshotEntries),
    [agent?.provider, snapshotEntries],
  );

  const agentProviderModels = useMemo(
    () => buildAgentProviderModels(agent?.provider, models),
    [agent?.provider, models],
  );
  const agentModelSelectorProviders = useMemo(() => {
    if (snapshotSelectedEntry) {
      return buildSelectableProviderSelectorProviders([snapshotSelectedEntry]);
    }
    return buildProviderSelectorProviders({
      providerDefinitions: agentProviderDefinitions,
      modelsByProvider: agentProviderModels,
    });
  }, [agentProviderDefinitions, agentProviderModels, snapshotSelectedEntry]);

  const modelSelection = resolveAgentModelSelection({
    models,
    runtimeModelId: agent?.runtimeModelId,
    configuredModelId: agent?.model,
    explicitThinkingOptionId: agent?.thinkingOptionId,
  });

  const modelOptions = useMemo<AgentControlOption[]>(() => {
    return (models ?? []).map((model) => ({ id: model.id, label: model.label }));
  }, [models]);
  const favoriteKeys = useMemo(
    () =>
      new Set(
        (preferences.favoriteModels ?? []).map((favorite) => buildFavoriteModelKey(favorite)),
      ),
    [preferences.favoriteModels],
  );

  const thinkingOptions = useMemo<AgentControlOption[]>(() => {
    return (modelSelection.thinkingOptions ?? []).map((option) => ({
      id: option.id,
      label: formatThinkingOptionLabel(option),
    }));
  }, [modelSelection.thinkingOptions]);

  const agentProvider = agent?.provider;
  const activeModelId = modelSelection.activeModelId;

  const handleSelectModel = useCallback(
    (modelId: string) => {
      if (!client || !agentProvider) {
        return;
      }
      void updatePreferences((current) =>
        mergeProviderPreferences({
          preferences: current,
          provider: agentProvider,
          updates: {
            model: modelId,
          },
        }),
      ).catch((error) => {
        console.warn("[AgentControls] persist model preference failed", error);
      });
      void client.setAgentModel(agentId, modelId).catch((error) => {
        console.warn("[AgentControls] setAgentModel failed", error);
        toast.error(toErrorMessage(error));
      });
    },
    [agentId, agentProvider, client, toast, updatePreferences],
  );

  const handleToggleFavoriteModel = useCallback(
    (provider: string, modelId: string) => {
      void updatePreferences((current) =>
        toggleFavoriteModel({ preferences: current, provider, modelId }),
      ).catch((error) => {
        console.warn("[AgentControls] toggle favorite model failed", error);
      });
    },
    [updatePreferences],
  );

  const handleSelectThinkingOption = useCallback(
    (thinkingOptionId: string) => {
      if (!client || !agentProvider) {
        return;
      }
      if (activeModelId) {
        void updatePreferences((current) =>
          mergeProviderPreferences({
            preferences: current,
            provider: agentProvider,
            updates: {
              model: activeModelId,
              thinkingByModel: {
                [activeModelId]: thinkingOptionId,
              },
            },
          }),
        ).catch((error) => {
          console.warn("[AgentControls] persist thinking preference failed", error);
        });
      }
      void client
        .setAgentThinkingOption(agentId, thinkingOptionId)
        .then((notice) => showProviderNoticeToast(toast, notice))
        .catch((error) => {
          console.warn("[AgentControls] setAgentThinkingOption failed", error);
          toast.error(toErrorMessage(error));
        });
    },
    [activeModelId, agentId, agentProvider, client, toast, updatePreferences],
  );

  const handleSetFeature = useCallback(
    (featureId: string, value: unknown) => {
      if (!client || !agentProvider) {
        return;
      }
      void updatePreferences((current) =>
        mergeProviderPreferences({
          preferences: current,
          provider: agentProvider,
          updates: {
            featureValues: {
              [featureId]: value,
            },
          },
        }),
      ).catch((error) => {
        console.warn("[AgentControls] persist feature preference failed", error);
      });
      void client.setAgentFeature(agentId, featureId, value).catch((error) => {
        console.warn("[AgentControls] setAgentFeature failed", error);
        toast.error(toErrorMessage(error));
      });
    },
    [agentId, agentProvider, client, toast, updatePreferences],
  );

  const handleModelSelectorOpen = useCallback(() => {
    refetchSnapshotIfStale(agentProvider);
  }, [agentProvider, refetchSnapshotIfStale]);

  const handleRetryModelProvider = useCallback(
    (provider: AgentProvider) => {
      void refreshSnapshot([provider]);
    },
    [refreshSnapshot],
  );

  const modeChip = useMemo(
    () => (
      <AgentModeControl
        serverId={serverId}
        agentId={agentId}
        placement={compactPlacement === "overflow" ? "footer" : "toolbar"}
        isCompactLayout={isCompactLayout}
      />
    ),
    [serverId, agentId, isCompactLayout, compactPlacement],
  );

  if (!agent) {
    return null;
  }

  return (
    <ControlledAgentControls
      provider={agent.provider}
      providerLabel={snapshotSelectedEntry?.label ?? agent.provider}
      modelSelectorProviders={agentModelSelectorProviders}
      modelOptions={modelOptions}
      selectedModelId={modelSelection.activeModelId ?? undefined}
      onSelectModel={handleSelectModel}
      favoriteKeys={favoriteKeys}
      onToggleFavoriteModel={handleToggleFavoriteModel}
      thinkingOptions={thinkingOptions.length > 1 ? thinkingOptions : undefined}
      selectedThinkingOptionId={modelSelection.selectedThinkingId ?? undefined}
      onSelectThinkingOption={handleSelectThinkingOption}
      features={agent.features}
      onSetFeature={handleSetFeature}
      isModelLoading={snapshotIsLoading || selectedProviderIsLoading}
      onModelSelectorOpen={handleModelSelectorOpen}
      onRetryModelProvider={handleRetryModelProvider}
      isRetryingModelProvider={snapshotIsRefreshing}
      onDropdownClose={onDropdownClose}
      disabled={!client}
      desktopExtras={modeChip}
      modelSelectorServerId={serverId}
      isCompactLayout={isCompactLayout}
      compactPlacement={compactPlacement}
    />
  );
});

export function DraftAgentControls({
  providerDefinitions,
  selectedProvider,
  onSelectProvider,
  modeOptions,
  selectedMode,
  onSelectMode,
  models,
  selectedModel,
  onSelectModel,
  isModelLoading: _isModelLoading,
  modelSelectorProviders,
  isAllModelsLoading,
  onSelectProviderAndModel,
  thinkingOptions,
  selectedThinkingOptionId,
  onSelectThinkingOption,
  features,
  onSetFeature,
  onDropdownClose,
  onModelSelectorOpen,
  onRetryModelProvider,
  isRetryingModelProvider = false,
  disabled = false,
  modelSelectorServerId = null,
  isCompactLayout,
  compactPlacement = "toolbar",
}: DraftAgentControlsProps) {
  const { preferences, updatePreferences } = useFormPreferences();
  const isCompactFormFactor = useIsCompactFormFactor();
  const isCompact = isCompactLayout ?? isCompactFormFactor;
  const draftModelRoutes = useComposerModelRoutes({
    serverId: modelSelectorServerId,
    providers: modelSelectorProviders,
    selectedProvider: selectedProvider ?? "",
  });
  const selectedProviderLabel = useMemo(
    () =>
      providerDefinitions.find((definition) => definition.id === selectedProvider)?.label ??
      selectedProvider ??
      "",
    [providerDefinitions, selectedProvider],
  );
  const selectedRouteLabel =
    draftModelRoutes.routes[selectedProvider ?? ""]?.find(
      (route) => route.id === draftModelRoutes.selectedRouteId,
    )?.label ?? "";
  const renderDraftModelTrigger = useCallback(
    ({ selectedModelLabel }: { selectedModelLabel: string }) => (
      <DesktopModelTriggerContent
        selectedModelLabel={selectedModelLabel}
        providerLabel={selectedProviderLabel}
        routeLabel={selectedRouteLabel}
      />
    ),
    [selectedProviderLabel, selectedRouteLabel],
  );

  const mappedThinkingOptions = useMemo<AgentControlOption[]>(() => {
    return toThinkingControlOptions(thinkingOptions);
  }, [thinkingOptions]);
  const favoriteKeys = useMemo(
    () =>
      new Set(
        (preferences.favoriteModels ?? []).map((favorite) => buildFavoriteModelKey(favorite)),
      ),
    [preferences.favoriteModels],
  );

  const effectiveSelectedThinkingOption =
    selectedThinkingOptionId || mappedThinkingOptions[0]?.id || undefined;

  const modelOptions = useMemo<AgentControlOption[]>(
    () =>
      models.map((model) => ({
        id: model.id,
        label: model.label,
      })),
    [models],
  );

  const handleToggleFavorite = useCallback(
    (provider: string, modelId: string) => {
      void updatePreferences((current) =>
        toggleFavoriteModel({ preferences: current, provider, modelId }),
      ).catch((error) => {
        console.warn("[DraftAgentControls] toggle favorite model failed", error);
      });
    },
    [updatePreferences],
  );

  const draftModeChip = useMemo(
    () => (
      <DraftAgentModeControl
        placement={compactPlacement === "overflow" ? "footer" : "toolbar"}
        selectedProvider={selectedProvider}
        providerDefinitions={providerDefinitions}
        modeOptions={modeOptions}
        selectedMode={selectedMode}
        selectedModel={selectedModel}
        onSelectMode={onSelectMode}
        disabled={disabled}
        isCompactLayout={isCompactLayout}
      />
    ),
    [
      selectedProvider,
      providerDefinitions,
      modeOptions,
      selectedMode,
      selectedModel,
      onSelectMode,
      disabled,
      isCompactLayout,
      compactPlacement,
    ],
  );

  if (!isCompact) {
    return (
      <View style={styles.container}>
        <CombinedModelSelector
          providers={modelSelectorProviders}
          routes={draftModelRoutes.routes}
          selectedProvider={selectedProvider ?? ""}
          selectedRouteId={draftModelRoutes.selectedRouteId}
          selectedModel={selectedModel}
          onSelect={onSelectProviderAndModel}
          onSelectProvider={onSelectProvider}
          onSelectRoute={draftModelRoutes.selectRoute}
          favoriteKeys={favoriteKeys}
          onToggleFavorite={handleToggleFavorite}
          isLoading={isAllModelsLoading}
          disabled={disabled}
          onOpen={onModelSelectorOpen}
          onClose={onDropdownClose}
          onRetryProvider={onRetryModelProvider}
          isRetryingProvider={isRetryingModelProvider}
          renderTrigger={renderDraftModelTrigger}
          serverId={modelSelectorServerId}
        />
        {selectedProvider ? (
          <ControlledAgentControls
            provider={selectedProvider}
            thinkingOptions={mappedThinkingOptions.length > 0 ? mappedThinkingOptions : undefined}
            selectedThinkingOptionId={effectiveSelectedThinkingOption}
            onSelectThinkingOption={onSelectThinkingOption}
            features={features}
            onSetFeature={onSetFeature}
            onDropdownClose={onDropdownClose}
            onRetryModelProvider={onRetryModelProvider}
            isRetryingModelProvider={isRetryingModelProvider}
            disabled={disabled}
            desktopExtras={draftModeChip}
            isCompactLayout={isCompactLayout}
          />
        ) : null}
      </View>
    );
  }

  return (
    <ControlledAgentControls
      provider={selectedProvider ?? ""}
      providerLabel={selectedProviderLabel}
      modelSelectorProviders={modelSelectorProviders}
      modelOptions={modelOptions}
      selectedModelId={selectedModel}
      onSelectModel={onSelectModel}
      onSelectProvider={onSelectProvider}
      onSelectProviderAndModel={onSelectProviderAndModel}
      isModelLoading={isAllModelsLoading}
      favoriteKeys={favoriteKeys}
      onToggleFavoriteModel={handleToggleFavorite}
      thinkingOptions={mappedThinkingOptions.length > 0 ? mappedThinkingOptions : undefined}
      selectedThinkingOptionId={effectiveSelectedThinkingOption}
      onSelectThinkingOption={onSelectThinkingOption}
      features={features}
      onSetFeature={onSetFeature}
      onModelSelectorOpen={onModelSelectorOpen}
      onRetryModelProvider={onRetryModelProvider}
      isRetryingModelProvider={isRetryingModelProvider}
      disabled={disabled}
      desktopExtras={draftModeChip}
      modelSelectorServerId={modelSelectorServerId}
      isCompactLayout={isCompactLayout}
      compactPlacement={compactPlacement}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  modeBadge: {
    height: 32,
    minWidth: 0,
    maxWidth: 112,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface0,
    gap: 6,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modeIconBadge: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface0,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modeBadgeHovered: {
    borderColor: theme.colorScheme === "dark" ? "#59635D" : "#BDC9C2",
    backgroundColor: theme.colorScheme === "dark" ? "#2B302C" : "#EBF0ED",
  },
  modeBadgePressed: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colorScheme === "dark" ? "#22382B" : "#E7F3EC",
  },
  disabledBadge: {
    opacity: 0.5,
  },
  modeBadgeText: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  runtimeBadgeText: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  modelControlAnchor: {
    minWidth: 0,
    flexShrink: 1,
  },
  desktopFeatureToggle: {
    width: 32,
    height: 32,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  desktopFeatureToggleActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface2,
  },
  desktopFeatureSelect: {
    height: 32,
    minWidth: 0,
    maxWidth: 112,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  desktopModelTrigger: {
    width: "auto",
    maxWidth: 290,
    height: 32,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
  },
  desktopModelPrimary: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
  },
  desktopModelChain: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  desktopModelSecondary: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  desktopModelSeparator: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  popoverHeader: {
    minHeight: 35,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  popoverTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  popoverSubtitle: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  overflowControl: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: 6,
  },
  overflowContainer: {
    width: "100%",
    flexDirection: "column",
    alignItems: "stretch",
    gap: theme.spacing[1],
  },
  overflowControlText: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.4,
  },
  prefsButton: {
    width: "100%",
    height: 32,
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  prefsButtonText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    flexShrink: 1,
    minWidth: 0,
  },
  sheetSection: {
    gap: theme.spacing[2],
  },
  sheetSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.surface2,
    backgroundColor: theme.colors.surface0,
  },
  sheetSelectPressed: {
    backgroundColor: theme.colors.surface2,
  },
  disabledSheetSelect: {
    opacity: 0.5,
  },
  sheetSelectText: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
}));
