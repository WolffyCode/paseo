import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  type GestureResponderEvent,
  type PressableStateCallbackType,
} from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative, isWeb as platformIsWeb } from "@/constants/platform";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Lock,
  Network,
  Search,
  Settings,
  Star,
} from "lucide-react-native";
import { ComboboxTrigger } from "@/components/ui/combobox-trigger";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import type { SheetHeader } from "@/components/adaptive-modal-sheet";
import { useProviderSettingsStore } from "@/stores/provider-settings-store";
import { Button } from "@/components/ui/button";
import { getDesktopRuntimePopoverSpec } from "@/composer/desktop-composer-spec";
const IS_WEB = platformIsWeb;

import { Combobox, ComboboxItem, type ComboboxOption } from "@/components/ui/combobox";

const EMPTY_COMBOBOX_OPTIONS: ComboboxOption[] = [];
const EMPTY_ROUTES: CombinedModelSelectorRoute[] = [];
const MODEL_POPOVER_SPEC = getDesktopRuntimePopoverSpec("model");

function noop() {}

function favoriteButtonStyle({
  hovered,
  pressed,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [
    styles.favoriteButton,
    Boolean(hovered) && styles.favoriteButtonHovered,
    pressed && styles.favoriteButtonPressed,
  ];
}

import { getProviderIcon } from "@/components/provider-icons";
import {
  buildSelectedTriggerLabel,
  filterAndRankModelRows,
  getProviderModelRows,
  resolveSelectedModelLabel,
  type ProviderSelectionModelRow,
  type ProviderSelectorProvider,
} from "@/provider-selection/provider-selection";
import {
  resolveCombinedModelSelectorInitialView,
  selectProviderView,
  selectRouteView,
  type CombinedModelSelectorRoute,
  type CombinedModelSelectorRoutes,
  type CombinedModelSelectorView,
} from "./combined-model-selector-model";

const DESKTOP_PROVIDER_VIEW_MIN_HEIGHT = 220;
const DESKTOP_PROVIDER_VIEW_MAX_HEIGHT = 400;
const DESKTOP_PROVIDER_VIEW_BASE_HEIGHT = 80;
const DESKTOP_MODEL_ROW_HEIGHT = 40;

type SelectorView = CombinedModelSelectorView;

interface CombinedModelSelectorProps {
  providers: ProviderSelectorProvider[];
  routes: CombinedModelSelectorRoutes;
  selectedProvider: string;
  selectedRouteId: string | null;
  selectedModel: string;
  onSelect: (provider: AgentProvider, modelId: string) => void;
  onSelectProvider?: (provider: AgentProvider) => void;
  onSelectRoute: (provider: string, routeId: string) => void;
  isLoading: boolean;
  favoriteKeys?: Set<string>;
  onToggleFavorite?: (provider: string, modelId: string) => void;
  renderTrigger?: (input: {
    selectedModelLabel: string;
    onPress: () => void;
    disabled: boolean;
    isOpen: boolean;
  }) => React.ReactNode;
  onOpen?: () => void;
  onClose?: () => void;
  onRetryProvider?: (provider: AgentProvider) => void;
  isRetryingProvider?: boolean;
  disabled?: boolean;
  serverId?: string | null;
  providerLocked?: boolean;
}

interface SelectorContentProps {
  view: SelectorView;
  providers: ProviderSelectorProvider[];
  routes: CombinedModelSelectorRoutes;
  selectedProvider: string;
  selectedRouteId: string | null;
  selectedModel: string;
  searchQuery: string;
  favoriteKeys: Set<string>;
  onSelect: (provider: string, modelId: string) => void;
  onToggleFavorite?: (provider: string, modelId: string) => void;
  onDrillDown: (providerId: string, providerLabel: string) => void;
  onDrillDownRoute: (
    providerId: string,
    providerLabel: string,
    routeId: string,
    routeLabel: string,
  ) => void;
  onRetryProvider?: (provider: AgentProvider) => void;
  isRetryingProvider: boolean;
}

interface SelectorContextControlsProps {
  view: SelectorView;
  providerLabel: string;
  providerLocked: boolean;
  routeLabel: string;
  modelLabel: string;
  canChooseModel: boolean;
  isCompact: boolean;
  showSearch: boolean;
  searchQuery: string;
  onChooseProvider: () => void;
  onChooseRoute: () => void;
  onChooseModel: () => void;
  onSearchQueryChange: (value: string) => void;
}

/** Keep the provider-route-model path visible while the active level changes underneath it. */
function SelectorContextControls({
  view,
  providerLabel,
  providerLocked,
  routeLabel,
  modelLabel,
  canChooseModel,
  isCompact,
  showSearch,
  searchQuery,
  onChooseProvider,
  onChooseRoute,
  onChooseModel,
  onSearchQueryChange,
}: SelectorContextControlsProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  let levelTitle = t("modelSelector.selectModel");
  if (view.kind === "all") {
    levelTitle = t("modelSelector.title");
  } else if (view.kind === "routes") {
    levelTitle = t("modelSelector.selectRoute");
  }
  const providerIsCurrent = view.kind === "all";
  const routeIsCurrent = view.kind === "routes";
  const modelIsCurrent = view.kind === "provider";
  const providerButtonStyle = useMemo(
    () => [styles.cascadePathButton, providerIsCurrent ? styles.cascadePathButtonCurrent : null],
    [providerIsCurrent],
  );
  const providerTextStyle = useMemo(
    () => [styles.cascadePathText, providerIsCurrent ? styles.cascadePathTextCurrent : null],
    [providerIsCurrent],
  );
  const routeButtonStyle = useMemo(
    () => [styles.cascadePathButton, routeIsCurrent ? styles.cascadePathButtonCurrent : null],
    [routeIsCurrent],
  );
  const routeTextStyle = useMemo(
    () => [styles.cascadePathText, routeIsCurrent ? styles.cascadePathTextCurrent : null],
    [routeIsCurrent],
  );
  const modelButtonStyle = useMemo(
    () => [
      styles.cascadePathButton,
      styles.cascadeModelButton,
      modelIsCurrent ? styles.cascadePathButtonCurrent : null,
    ],
    [modelIsCurrent],
  );
  const modelTextStyle = useMemo(
    () => [styles.cascadePathText, modelIsCurrent ? styles.cascadePathTextCurrent : null],
    [modelIsCurrent],
  );
  return (
    <View style={styles.selectorContextControls}>
      <View style={styles.cascadePath}>
        <Pressable
          disabled={providerLocked}
          onPress={onChooseProvider}
          style={providerButtonStyle}
          accessibilityRole="button"
          testID="model-provider-field"
          accessibilityLabel={
            providerLocked
              ? t("modelSelector.providerLocked", { provider: providerLabel })
              : t("agentControls.provider.select")
          }
        >
          {providerLocked ? <Lock size={13} color={theme.colors.foregroundMuted} /> : null}
          <Text style={providerTextStyle} numberOfLines={1}>
            {providerLabel}
          </Text>
        </Pressable>
        <ChevronRight size={13} color={theme.colors.foregroundMuted} />
        <Pressable
          onPress={onChooseRoute}
          style={routeButtonStyle}
          accessibilityRole="button"
          accessibilityLabel={t("modelSelector.routeLabel")}
          testID="model-route-field"
        >
          <Text style={routeTextStyle} numberOfLines={1}>
            {routeLabel}
          </Text>
        </Pressable>
        <ChevronRight size={13} color={theme.colors.foregroundMuted} />
        <Pressable
          disabled={!canChooseModel}
          onPress={onChooseModel}
          style={modelButtonStyle}
          accessibilityRole="button"
          accessibilityLabel={t("modelSelector.selectModel")}
          testID="model-model-field"
        >
          <Text style={modelTextStyle} numberOfLines={1}>
            {modelLabel}
          </Text>
        </Pressable>
      </View>
      {!isCompact ? (
        <View style={styles.cascadeTitle}>
          <Text style={styles.cascadeTitleText}>{levelTitle}</Text>
          {providerLocked ? (
            <View style={styles.cascadeLockedStatus}>
              <Lock size={13} color={theme.colors.foregroundMuted} />
              <Text style={styles.cascadeLockedStatusText}>
                {t("modelSelector.providerLockedLabel")}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {showSearch ? (
        <View style={styles.inlineSearch}>
          <Search size={15} color={theme.colors.foregroundMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={onSearchQueryChange}
            placeholder={t("modelSelector.searchCurrentRoute")}
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.inlineSearchInput}
            accessibilityLabel={t("modelSelector.searchPlaceholder")}
            testID="model-search-input"
          />
        </View>
      ) : null}
    </View>
  );
}

function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase();
}

function sortFavoritesFirst(
  rows: ProviderSelectionModelRow[],
  favoriteKeys: Set<string>,
): ProviderSelectionModelRow[] {
  const favorites: ProviderSelectionModelRow[] = [];
  const rest: ProviderSelectionModelRow[] = [];
  for (const row of rows) {
    if (favoriteKeys.has(row.favoriteKey)) {
      favorites.push(row);
    } else {
      rest.push(row);
    }
  }
  return [...favorites, ...rest];
}

function ModelRow({
  row,
  isSelected,
  isFavorite,
  elevated = false,
  onPress,
  onToggleFavorite,
}: {
  row: ProviderSelectionModelRow;
  isSelected: boolean;
  isFavorite: boolean;
  elevated?: boolean;
  onPress: () => void;
  onToggleFavorite?: (provider: string, modelId: string) => void;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor() && !platformIsWeb;
  const ProviderIcon = getProviderIcon(row.provider);

  const handleToggleFavorite = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      onToggleFavorite?.(row.provider, row.modelId);
    },
    [onToggleFavorite, row.modelId, row.provider],
  );

  const leadingSlot = useMemo(
    () => (
      <View style={styles.rowIcon}>
        <ProviderIcon size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
      </View>
    ),
    [ProviderIcon, theme.iconSize.sm, theme.colors.foregroundMuted],
  );
  const trailingSlot = useMemo(
    () =>
      isCompact && onToggleFavorite ? (
        <Pressable
          onPress={handleToggleFavorite}
          hitSlop={8}
          style={favoriteButtonStyle}
          accessibilityRole="button"
          accessibilityLabel={
            isFavorite ? t("modelSelector.unfavoriteModel") : t("modelSelector.favoriteModel")
          }
          testID={`favorite-model-${row.provider}-${row.modelId}`}
        >
          {({ hovered }) => {
            let starColor: string;
            if (isFavorite) starColor = theme.colors.palette.amber[500];
            else if (hovered) starColor = theme.colors.foregroundMuted;
            else starColor = theme.colors.border;
            return (
              <Star
                size={16}
                color={starColor}
                fill={isFavorite ? theme.colors.palette.amber[500] : "transparent"}
              />
            );
          }}
        </Pressable>
      ) : null,
    [
      onToggleFavorite,
      isCompact,
      handleToggleFavorite,
      isFavorite,
      row.provider,
      row.modelId,
      theme.colors.palette.amber,
      theme.colors.foregroundMuted,
      theme.colors.border,
      t,
    ],
  );

  return (
    <ComboboxItem
      label={row.modelLabel}
      description={row.description}
      selected={isSelected}
      elevated={elevated}
      onPress={onPress}
      leadingSlot={leadingSlot}
      trailingSlot={trailingSlot}
      presentation="detailed"
    />
  );
}

interface SelectableModelRowProps {
  row: ProviderSelectionModelRow;
  isSelected: boolean;
  isFavorite: boolean;
  elevated?: boolean;
  onSelect: (provider: string, modelId: string) => void;
  onToggleFavorite?: (provider: string, modelId: string) => void;
}

function SelectableModelRow({
  row,
  isSelected,
  isFavorite,
  elevated,
  onSelect,
  onToggleFavorite,
}: SelectableModelRowProps) {
  const handlePress = useCallback(() => {
    onSelect(row.provider, row.modelId);
  }, [onSelect, row.provider, row.modelId]);
  return (
    <ModelRow
      row={row}
      isSelected={isSelected}
      isFavorite={isFavorite}
      elevated={elevated}
      onPress={handlePress}
      onToggleFavorite={onToggleFavorite}
    />
  );
}

interface GroupProviderButtonProps {
  provider: ProviderSelectorProvider;
  selected: boolean;
  onDrillDown: (providerId: string, providerLabel: string) => void;
}

function iconButtonStyle({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) {
  return [
    styles.rowIconButton,
    Boolean(hovered) && styles.rowIconButtonHovered,
    pressed && styles.rowIconButtonPressed,
  ];
}

function GroupProviderButton({ provider, selected, onDrillDown }: GroupProviderButtonProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const ProvIcon = getProviderIcon(provider.id);
  const selection = provider.modelSelection;

  const handlePress = useCallback(() => {
    onDrillDown(provider.id, provider.label);
  }, [onDrillDown, provider.id, provider.label]);
  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.drillDownRow,
      selected ? styles.drillDownRowSelected : null,
      hovered ? styles.drillDownRowHovered : null,
      pressed ? styles.drillDownRowPressed : null,
    ],
    [selected],
  );

  let detail = t("modelSelector.agentProvider");
  if (selection.kind === "models") {
    detail = t("modelSelector.agentProvider");
  } else if (selection.kind === "loading") {
    detail = t("modelSelector.loadingShort");
  } else {
    detail = t("modelSelector.error");
  }

  return (
    <Pressable
      onPress={handlePress}
      style={rowStyle}
      accessibilityRole="button"
      accessibilityLabel={provider.label}
      testID={`model-provider-option-${provider.id}`}
    >
      <View style={styles.rowIcon}>
        <ProvIcon size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
      </View>
      <View style={styles.drillDownCopy}>
        <Text style={styles.drillDownText}>{provider.label}</Text>
        <Text style={styles.drillDownDetail}>{detail}</Text>
      </View>
      <View style={styles.drillDownTrailing}>
        {selected ? <Check size={theme.iconSize.sm} color={theme.colors.accent} /> : null}
      </View>
    </Pressable>
  );
}

function GroupedProviderRows({
  providers,
  selectedProvider,
  onDrillDown,
}: {
  providers: ProviderSelectorProvider[];
  selectedProvider: string;
  onDrillDown: (providerId: string, providerLabel: string) => void;
}) {
  return (
    <View>
      {providers.map((provider) => (
        <View key={provider.id}>
          <GroupProviderButton
            provider={provider}
            selected={provider.id === selectedProvider}
            onDrillDown={onDrillDown}
          />
        </View>
      ))}
    </View>
  );
}

interface RouteButtonProps {
  route: CombinedModelSelectorRoute;
  selected: boolean;
  providerId: string;
  providerLabel: string;
  onDrillDownRoute: SelectorContentProps["onDrillDownRoute"];
}

/** Render one runtime route that drills into its exposed model list. */
function RouteButton({
  route,
  selected,
  providerId,
  providerLabel,
  onDrillDownRoute,
}: RouteButtonProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const handlePress = useCallback(
    () => onDrillDownRoute(providerId, providerLabel, route.id, route.label),
    [onDrillDownRoute, providerId, providerLabel, route.id, route.label],
  );
  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.drillDownRow,
      selected ? styles.drillDownRowSelected : null,
      hovered ? styles.drillDownRowHovered : null,
      pressed ? styles.drillDownRowPressed : null,
    ],
    [selected],
  );
  const routeDetail =
    route.modelSelection.kind === "loading"
      ? t("modelSelector.loadingShort")
      : t("modelSelector.routeForProvider", { provider: providerLabel });
  let trailingContent: React.ReactNode = null;
  if (route.modelSelection.kind === "loading") {
    trailingContent = <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />;
  } else if (selected) {
    trailingContent = <Check size={theme.iconSize.sm} color={theme.colors.accent} />;
  }
  return (
    <Pressable
      onPress={handlePress}
      style={rowStyle}
      accessibilityRole="button"
      accessibilityLabel={route.label}
      testID={`model-route-option-${route.id || "official"}`}
    >
      <View style={styles.rowIcon}>
        <Network size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
      </View>
      <View style={styles.drillDownCopy}>
        <Text style={styles.drillDownText}>{route.label}</Text>
        <Text style={styles.drillDownDetail}>{routeDetail}</Text>
      </View>
      <View style={styles.drillDownTrailing}>{trailingContent}</View>
    </Pressable>
  );
}

/** Render all selectable routes for the current provider. */
function ProviderRouteRows({
  providerId,
  providerLabel,
  routes,
  selectedRouteId,
  onDrillDownRoute,
}: {
  providerId: string;
  providerLabel: string;
  routes: CombinedModelSelectorRoute[];
  selectedRouteId: string | null;
  onDrillDownRoute: SelectorContentProps["onDrillDownRoute"];
}) {
  return (
    <View>
      {routes.map((route) => {
        return (
          <View key={route.id || "official"}>
            <RouteButton
              route={route}
              selected={route.id === selectedRouteId}
              providerId={providerId}
              providerLabel={providerLabel}
              onDrillDownRoute={onDrillDownRoute}
            />
          </View>
        );
      })}
    </View>
  );
}

function ProviderModelRows({
  rows,
  selectedProvider,
  selectedModel,
  favoriteKeys,
  onSelect,
  onToggleFavorite,
  normalizedQuery,
}: {
  rows: ProviderSelectionModelRow[];
  selectedProvider: string;
  selectedModel: string;
  favoriteKeys: Set<string>;
  onSelect: (provider: string, modelId: string) => void;
  onToggleFavorite?: (provider: string, modelId: string) => void;
  normalizedQuery: string;
}) {
  const isMobile = useIsCompactFormFactor() && !platformIsWeb;
  const useVirtualizedList = isMobile && isNative;
  const displayRows = useMemo(
    () => (normalizedQuery ? rows : sortFavoritesFirst(rows, favoriteKeys)),
    [favoriteKeys, normalizedQuery, rows],
  );
  const renderItem = useCallback(
    ({ item }: { item: ProviderSelectionModelRow }) => (
      <SelectableModelRow
        row={item}
        isSelected={item.provider === selectedProvider && item.modelId === selectedModel}
        isFavorite={favoriteKeys.has(item.favoriteKey)}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />
    ),
    [favoriteKeys, onSelect, onToggleFavorite, selectedModel, selectedProvider],
  );
  const keyExtractor = useCallback((row: ProviderSelectionModelRow) => row.favoriteKey, []);

  if (useVirtualizedList) {
    return (
      <BottomSheetFlatList
        data={displayRows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        style={styles.virtualizedModelList}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.virtualizedModelListContent}
      />
    );
  }

  return (
    <View>
      {displayRows.map((row) => (
        <View key={row.favoriteKey}>{renderItem({ item: row })}</View>
      ))}
    </View>
  );
}

function ProviderErrorEmptyState({
  providerId,
  message,
  onRetryProvider,
  isRetryingProvider,
}: {
  providerId: string;
  message: string;
  onRetryProvider?: (provider: AgentProvider) => void;
  isRetryingProvider: boolean;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const handleRetry = useCallback(() => {
    onRetryProvider?.(providerId);
  }, [onRetryProvider, providerId]);
  return (
    <View style={styles.emptyState}>
      <AlertTriangle size={theme.iconSize.md} color={theme.colors.foregroundMuted} />
      <Text style={styles.emptyStateText}>{message}</Text>
      {onRetryProvider ? (
        <Button variant="default" size="sm" onPress={handleRetry} disabled={isRetryingProvider}>
          {isRetryingProvider ? t("modelSelector.retrying") : t("modelSelector.retry")}
        </Button>
      ) : null}
    </View>
  );
}

function SelectorContent({
  view,
  providers,
  routes,
  selectedProvider,
  selectedRouteId,
  selectedModel,
  searchQuery,
  favoriteKeys,
  onSelect,
  onToggleFavorite,
  onDrillDown,
  onDrillDownRoute,
  onRetryProvider,
  isRetryingProvider,
}: SelectorContentProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const normalizedQuery = useMemo(() => normalizeSearchQuery(searchQuery), [searchQuery]);
  const selectedViewProvider = useMemo(() => {
    if (view.kind !== "provider") return null;
    const provider = providers.find((candidate) => candidate.id === view.providerId);
    const route = routes[view.providerId]?.find((candidate) => candidate.id === view.routeId);
    return provider && route ? { ...provider, modelSelection: route.modelSelection } : null;
  }, [providers, routes, view]);
  const visibleRows = useMemo(
    () =>
      selectedViewProvider
        ? filterAndRankModelRows(getProviderModelRows(selectedViewProvider), normalizedQuery)
        : [],
    [normalizedQuery, selectedViewProvider],
  );
  const hasResults = providers.length > 0;
  const emptyState = (
    <View style={styles.emptyState}>
      <Search size={theme.iconSize.md} color={theme.colors.foregroundMuted} />
      <Text style={styles.emptyStateText}>{t("modelSelector.noMatches")}</Text>
    </View>
  );

  if (view.kind === "routes") {
    const providerRoutes = routes[view.providerId] ?? EMPTY_ROUTES;
    if (providerRoutes.length === 0) {
      return emptyState;
    }
    return (
      <ProviderRouteRows
        providerId={view.providerId}
        providerLabel={view.providerLabel}
        routes={providerRoutes}
        selectedRouteId={view.providerId === selectedProvider ? selectedRouteId : null}
        onDrillDownRoute={onDrillDownRoute}
      />
    );
  }

  if (view.kind === "provider") {
    if (!selectedViewProvider) {
      return emptyState;
    }
    const drillSelection = selectedViewProvider.modelSelection;
    if (drillSelection.kind === "loading") {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator
            size="small"
            color={theme.colors.foregroundMuted}
            style={styles.rowSpinner}
          />
          <Text style={styles.emptyStateText}>{t("modelSelector.loadingShort")}</Text>
        </View>
      );
    }
    if (drillSelection.kind === "error") {
      return (
        <ProviderErrorEmptyState
          providerId={view.providerId}
          message={drillSelection.message}
          onRetryProvider={onRetryProvider}
          isRetryingProvider={isRetryingProvider}
        />
      );
    }
    if (visibleRows.length === 0) {
      return emptyState;
    }

    return (
      <ProviderModelRows
        rows={visibleRows}
        selectedProvider={selectedProvider}
        selectedModel={selectedModel}
        favoriteKeys={favoriteKeys}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
        normalizedQuery={normalizedQuery}
      />
    );
  }

  return (
    <View>
      {providers.length > 0 ? (
        <GroupedProviderRows
          providers={providers}
          selectedProvider={selectedProvider}
          onDrillDown={onDrillDown}
        />
      ) : null}

      {!hasResults ? emptyState : null}
    </View>
  );
}

export function CombinedModelSelector({
  providers,
  routes,
  selectedProvider,
  selectedRouteId,
  selectedModel,
  onSelect,
  onSelectProvider,
  onSelectRoute,
  isLoading,
  favoriteKeys = new Set<string>(),
  onToggleFavorite,
  renderTrigger,
  onOpen,
  onClose,
  onRetryProvider,
  isRetryingProvider = false,
  disabled = false,
  serverId = null,
  providerLocked = false,
}: CombinedModelSelectorProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor() && !platformIsWeb;
  const anchorRef = useRef<View>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isContentReady, setIsContentReady] = useState(platformIsWeb);
  const [view, setView] = useState<SelectorView>({ kind: "all" });
  const [searchQuery, setSearchQuery] = useState("");
  const selectedProviderLabel = useMemo(
    () =>
      providers.find((provider) => provider.id === selectedProvider)?.label ??
      selectedProvider ??
      t("agentControls.provider.fallback"),
    [providers, selectedProvider, t],
  );
  const selectedRoute = useMemo(
    () => routes[selectedProvider]?.find((route) => route.id === selectedRouteId) ?? null,
    [routes, selectedProvider, selectedRouteId],
  );
  const resolvedRouteLabel = selectedRoute?.label ?? t("modelSelector.routeLabel");

  const computeInitialView = useCallback((): SelectorView => {
    return resolveCombinedModelSelectorInitialView({
      selectedProvider,
      selectedRouteId,
      selectedModel,
      providerLabel: selectedProviderLabel,
      routes,
    });
  }, [routes, selectedModel, selectedProvider, selectedProviderLabel, selectedRouteId]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      setView(computeInitialView());
      if (open) {
        onOpen?.();
      } else {
        setSearchQuery("");
        onClose?.();
      }
    },
    [onOpen, onClose, computeInitialView],
  );

  const handleSelect = useCallback(
    (provider: string, modelId: string) => {
      onSelect(provider, modelId);
      setIsOpen(false);
      setSearchQuery("");
    },
    [onSelect],
  );

  const selectedModelLabel = useMemo(() => {
    const selectedProviderDefinition = providers.find((entry) => entry.id === selectedProvider);
    const routeScopedProviders =
      selectedProviderDefinition && selectedRoute
        ? [{ ...selectedProviderDefinition, modelSelection: selectedRoute.modelSelection }]
        : providers;
    return resolveSelectedModelLabel({
      providers: routeScopedProviders,
      selectedProvider,
      selectedModel,
      isLoading,
    });
  }, [isLoading, providers, selectedModel, selectedProvider, selectedRoute]);

  const desktopFixedHeight = useMemo(() => {
    if (view.kind !== "provider") {
      return undefined;
    }
    const route = routes[view.providerId]?.find((entry) => entry.id === view.routeId);
    if (!route || route.modelSelection.kind !== "models") {
      return DESKTOP_PROVIDER_VIEW_MIN_HEIGHT;
    }
    const modelCount = route.modelSelection.rows.length;
    return Math.min(
      Math.max(
        DESKTOP_PROVIDER_VIEW_MIN_HEIGHT,
        DESKTOP_PROVIDER_VIEW_BASE_HEIGHT + modelCount * DESKTOP_MODEL_ROW_HEIGHT,
      ),
      DESKTOP_PROVIDER_VIEW_MAX_HEIGHT,
    );
  }, [routes, view]);

  const triggerLabel = useMemo(() => {
    if (
      selectedModelLabel === t("modelSelector.loading") ||
      selectedModelLabel === t("modelSelector.selectModel")
    ) {
      return selectedModelLabel;
    }

    return buildSelectedTriggerLabel(selectedModelLabel);
  }, [selectedModelLabel, t]);

  useEffect(() => {
    if (platformIsWeb) {
      return () => {};
    }

    if (!isOpen) {
      setIsContentReady(false);
      return () => {};
    }

    const frame = requestAnimationFrame(() => {
      setIsContentReady(true);
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const handleTriggerPress = useCallback(() => {
    handleOpenChange(!isOpen);
  }, [handleOpenChange, isOpen]);

  const triggerStyle = useCallback(
    ({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.trigger,
      Boolean(hovered) && styles.triggerHovered,
      (pressed || isOpen) && styles.triggerPressed,
      disabled && styles.triggerDisabled,
      renderTrigger ? styles.customTriggerWrapper : null,
    ],
    [disabled, isOpen, renderTrigger],
  );

  const handleDrillDown = useCallback(
    (providerId: string, providerLabel: string) => {
      setView(selectProviderView(providerId, providerLabel, onSelectProvider));
      setSearchQuery("");
    },
    [onSelectProvider],
  );

  const handleDrillDownRoute = useCallback(
    (providerId: string, providerLabel: string, routeId: string, routeLabel: string) => {
      setView(
        selectRouteView({
          providerId,
          providerLabel,
          routeId,
          routeLabel,
          onSelectRoute,
        }),
      );
      setSearchQuery("");
    },
    [onSelectRoute],
  );

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const handleChooseProvider = useCallback(() => {
    if (providerLocked) return;
    setView({ kind: "all" });
    setSearchQuery("");
  }, [providerLocked]);

  const handleChooseRoute = useCallback(() => {
    const providerId = view.kind === "all" ? selectedProvider : view.providerId;
    const providerLabel =
      providers.find((entry) => entry.id === providerId)?.label ?? selectedProviderLabel;
    if (!providerId) return;
    setView({ kind: "routes", providerId, providerLabel });
    setSearchQuery("");
  }, [providers, selectedProvider, selectedProviderLabel, view]);

  const handleChooseModel = useCallback(() => {
    const providerId = view.kind === "all" ? selectedProvider : view.providerId;
    if (!providerId) return;
    const providerLabel =
      providers.find((entry) => entry.id === providerId)?.label ?? selectedProviderLabel;
    let route: CombinedModelSelectorRoute | null | undefined = null;
    if (view.kind === "provider") {
      route = routes[providerId]?.find((entry) => entry.id === view.routeId);
    } else if (providerId === selectedProvider) {
      route = selectedRoute;
    }
    if (!route) return;
    setView({
      kind: "provider",
      providerId,
      providerLabel,
      routeId: route.id,
      routeLabel: route.label,
    });
    setSearchQuery("");
  }, [providers, routes, selectedProvider, selectedProviderLabel, selectedRoute, view]);

  const openProviderSettings = useCallback(() => {
    if (!serverId || view.kind === "all") return;
    useProviderSettingsStore.getState().open({ serverId, provider: view.providerId });
  }, [serverId, view]);

  const sheetHeader = useMemo<SheetHeader>(() => {
    const headerActions =
      view.kind !== "all" ? (
        <Pressable
          onPress={openProviderSettings}
          disabled={!serverId}
          hitSlop={8}
          style={iconButtonStyle}
          accessibilityRole="button"
          accessibilityLabel={t("modelSelector.openProviderSettings", {
            provider: view.providerLabel,
          })}
          testID={`selector-header-settings-${view.providerId}`}
        >
          <Settings
            size={theme.iconSize.sm}
            color={!serverId ? theme.colors.border : theme.colors.foregroundMuted}
          />
        </Pressable>
      ) : undefined;
    return {
      title: providerLocked ? t("modelSelector.nextMessageTitle") : t("modelSelector.runtimeTitle"),
      actions: headerActions,
    };
  }, [
    view,
    serverId,
    openProviderSettings,
    theme.colors.border,
    theme.colors.foregroundMuted,
    providerLocked,
    t,
    theme.iconSize.sm,
  ]);

  return (
    <>
      {renderTrigger ? (
        <Pressable
          ref={anchorRef}
          collapsable={false}
          disabled={disabled}
          onPress={handleTriggerPress}
          style={triggerStyle}
          accessibilityRole="button"
          accessibilityLabel={t("modelSelector.selectedModel", { model: selectedModelLabel })}
          testID="combined-model-selector"
        >
          {renderTrigger({
            selectedModelLabel: triggerLabel,
            onPress: handleTriggerPress,
            disabled,
            isOpen,
          })}
        </Pressable>
      ) : (
        <ComboboxTrigger
          ref={anchorRef}
          collapsable={false}
          disabled={disabled}
          onPress={handleTriggerPress}
          style={triggerStyle}
          accessibilityRole="button"
          accessibilityLabel={t("modelSelector.selectedModel", { model: selectedModelLabel })}
          testID="combined-model-selector"
        >
          <Text style={styles.triggerText} numberOfLines={1} ellipsizeMode="tail">
            {triggerLabel}
          </Text>
        </ComboboxTrigger>
      )}
      <Combobox
        options={EMPTY_COMBOBOX_OPTIONS}
        value=""
        onSelect={noop}
        open={isOpen}
        onOpenChange={handleOpenChange}
        anchorRef={anchorRef}
        desktopPlacement={MODEL_POPOVER_SPEC.placement}
        desktopOffset={MODEL_POPOVER_SPEC.offset}
        desktopWidth={MODEL_POPOVER_SPEC.width}
        desktopSurfaceVariant="composer"
        desktopFixedHeight={desktopFixedHeight}
        header={isCompact ? sheetHeader : undefined}
        mobileChildrenScrollEnabled={view.kind !== "provider" || !isNative}
      >
        {isContentReady ? (
          <>
            <SelectorContextControls
              view={view}
              providerLabel={view.kind === "all" ? selectedProviderLabel : view.providerLabel}
              providerLocked={providerLocked}
              routeLabel={view.kind === "provider" ? view.routeLabel : resolvedRouteLabel}
              modelLabel={selectedModelLabel}
              canChooseModel={view.kind === "provider" || selectedRoute !== null}
              isCompact={isCompact}
              showSearch={isCompact && view.kind === "provider"}
              searchQuery={searchQuery}
              onChooseProvider={handleChooseProvider}
              onChooseRoute={handleChooseRoute}
              onChooseModel={handleChooseModel}
              onSearchQueryChange={handleSearchQueryChange}
            />
            <SelectorContent
              view={view}
              providers={providers}
              routes={routes}
              selectedProvider={selectedProvider}
              selectedRouteId={selectedRouteId}
              selectedModel={selectedModel}
              searchQuery={searchQuery}
              favoriteKeys={favoriteKeys}
              onSelect={handleSelect}
              onToggleFavorite={onToggleFavorite}
              onDrillDown={handleDrillDown}
              onDrillDownRoute={handleDrillDownRoute}
              onRetryProvider={onRetryProvider}
              isRetryingProvider={isRetryingProvider}
            />
          </>
        ) : (
          <View style={styles.sheetLoadingState}>
            <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
            <Text style={styles.sheetLoadingText}>{t("modelSelector.loadingSelector")}</Text>
          </View>
        )}
      </Combobox>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    height: 32,
    minWidth: 0,
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
  triggerHovered: {
    borderColor: theme.colorScheme === "dark" ? "#59635D" : "#BDC9C2",
    backgroundColor: theme.colorScheme === "dark" ? "#2B302C" : "#EBF0ED",
  },
  triggerPressed: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colorScheme === "dark" ? "#22382B" : "#E7F3EC",
  },
  triggerDisabled: {
    opacity: 0.5,
  },
  triggerText: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  customTriggerWrapper: {
    minWidth: 0,
    flexShrink: 1,
    overflow: "hidden",
    paddingHorizontal: 0,
    paddingVertical: 0,
    height: 32,
  },
  selectorContextControls: {
    gap: 0,
  },
  cascadePath: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cascadePathButton: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 120,
    minHeight: 28,
    paddingHorizontal: 7,
    borderRadius: 8,
  },
  cascadePathButtonCurrent: {
    backgroundColor: theme.colorScheme === "dark" ? "#2B302C" : "#EBF0ED",
  },
  cascadePathText: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  cascadePathTextCurrent: {
    color: theme.colors.foreground,
  },
  cascadeModelButton: {
    minWidth: 0,
    flex: 1,
    maxWidth: 150,
  },
  cascadeTitle: {
    minHeight: 35,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cascadeTitleText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  cascadeLockedStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  cascadeLockedStatusText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  inlineSearch: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    backgroundColor: theme.colors.surface1,
    marginHorizontal: 8,
    marginBottom: 7,
  },
  inlineSearchInput: {
    minWidth: 0,
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    ...(IS_WEB ? ({ outlineStyle: "none" } as object) : {}),
  },
  drillDownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 38,
    marginHorizontal: 4,
    marginVertical: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  drillDownRowHovered: {
    backgroundColor: theme.colorScheme === "dark" ? "#2B302C" : "#EBF0ED",
  },
  drillDownRowPressed: {
    backgroundColor: theme.colorScheme === "dark" ? "#333A35" : "#E4ECE7",
  },
  drillDownRowSelected: {
    backgroundColor: theme.colorScheme === "dark" ? "#2B302C" : "#EBF0ED",
  },
  drillDownCopy: {
    minWidth: 0,
    flex: 1,
    flexDirection: "column",
    gap: 1,
  },
  drillDownText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  drillDownDetail: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  drillDownTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  drillDownCount: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  rowIcon: {
    width: 26,
    height: 26,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: theme.colorScheme === "dark" ? "#222522" : "#F4F7F5",
  },
  rowStateInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 1,
    minWidth: 0,
  },
  rowErrorText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    maxWidth: 140,
  },
  rowIconButton: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  rowSpinner: {
    transform: [{ scale: 0.7 }],
  },
  rowIconButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  rowIconButtonPressed: {
    backgroundColor: theme.colors.surface1,
  },
  emptyState: {
    paddingVertical: theme.spacing[4],
    alignItems: "center",
    gap: theme.spacing[2],
  },
  emptyStateText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  virtualizedModelList: {
    flex: 1,
  },
  virtualizedModelListContent: {
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[1],
    paddingBottom: theme.spacing[8],
  },
  favoriteButton: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  favoriteButtonPressed: {
    backgroundColor: theme.colors.surface1,
  },
  sheetLoadingState: {
    minHeight: 160,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  sheetLoadingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
