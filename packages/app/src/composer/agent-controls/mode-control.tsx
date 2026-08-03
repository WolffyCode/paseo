import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
} from "react";
import { useTranslation } from "react-i18next";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useShallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import {
  Bot,
  ChevronDown,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ShieldQuestionMark,
} from "lucide-react-native";
import { ComboboxTrigger } from "@/components/ui/combobox-trigger";
import { type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Combobox, ComboboxItem, type ComboboxOption } from "@/components/ui/combobox";
import { useSessionStore } from "@/stores/session-store";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { mergeProviderPreferences, useFormPreferences } from "@/hooks/use-form-preferences";
import { resolveProviderDefinition } from "@/utils/provider-definitions";
import { useToast } from "@/contexts/toast-context";
import { useIsCompactFormFactor } from "@/constants/layout";
import { toErrorMessage } from "@/utils/error-messages";
import { showProviderNoticeToast } from "@/utils/provider-notice-toast";
import { formatAgentModeLabel } from "@/composer/agent-controls/utils";
import { getDesktopRuntimePopoverSpec } from "@/composer/desktop-composer-spec";
import { isWeb } from "@/constants/platform";
import type { AgentMode, AgentProvider } from "@getpaseo/protocol/agent-types";
import {
  getModeVisuals,
  type AgentModeColorTier,
  type AgentProviderDefinition,
} from "@getpaseo/protocol/provider-manifest";

export type AgentModeControlPlacement = "toolbar" | "footer";
const MODE_POPOVER_SPEC = getDesktopRuntimePopoverSpec("mode");

function shouldRenderForPlacement(placement: AgentModeControlPlacement, isCompact: boolean) {
  return placement === "footer" ? isCompact : !isCompact;
}

interface ModeIconProps {
  size?: number;
  color?: string;
}

const MODE_ICONS: Record<string, ComponentType<ModeIconProps>> = {
  Bot,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  ShieldQuestionMark,
};

interface ModeComboboxOptionProps {
  option: ComboboxOption;
  selected: boolean;
  active: boolean;
  onPress: () => void;
  provider: string;
  providerDefinitions: AgentProviderDefinition[];
  iconColor: string;
}

function ModeComboboxOption({
  option,
  selected,
  active,
  onPress,
  provider,
  providerDefinitions,
  iconColor,
}: ModeComboboxOptionProps) {
  const isCompact = useIsCompactFormFactor() && !isWeb;
  const visuals = getModeVisuals(provider, option.id, providerDefinitions);
  const IconComponent = visuals?.icon ? MODE_ICONS[visuals.icon] : undefined;
  const leadingSlot = useMemo(
    () => (isCompact && IconComponent ? <IconComponent size={16} color={iconColor} /> : null),
    [IconComponent, iconColor, isCompact],
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

interface AgentModeControlViewProps {
  provider: string;
  providerDefinitions: AgentProviderDefinition[];
  modeOptions: AgentMode[];
  selectedModeId: string | null | undefined;
  modelLabel?: string | null;
  onSelectMode: (modeId: string) => void;
  disabled?: boolean;
}

function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase();
}

/** Map a provider mode's semantic risk tier to the compact status-dot color. */
function resolveModeToneColor(
  colorTier: AgentModeColorTier | undefined,
  colors: {
    dangerous: string;
    safe: string;
    planning: string;
    fallback: string;
  },
): string {
  if (colorTier === "dangerous") return colors.dangerous;
  if (colorTier === "safe") return colors.safe;
  if (colorTier === "planning") return colors.planning;
  return colors.fallback;
}

/** Render the active run mode as a localized, anchored desktop selector. */
function AgentModeControlView({
  provider,
  providerDefinitions,
  modeOptions,
  selectedModeId,
  modelLabel,
  onSelectMode,
  disabled = false,
}: AgentModeControlViewProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const anchorRef = useRef<View>(null);
  const isCompact = useIsCompactFormFactor() && !isWeb;
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedMode = useMemo(() => {
    if (modeOptions.length === 0) return null;
    return modeOptions.find((m) => m.id === selectedModeId) ?? modeOptions[0];
  }, [modeOptions, selectedModeId]);

  const selectedModeLabel = selectedMode ? formatAgentModeLabel(selectedMode) : "";
  const selectedVisuals = selectedMode
    ? getModeVisuals(provider, selectedMode.id, providerDefinitions)
    : null;
  const selectedToneColor = resolveModeToneColor(selectedVisuals?.colorTier, {
    dangerous: theme.colors.palette.amber[500],
    safe: theme.colors.palette.green[500],
    planning: theme.colors.palette.blue[500],
    fallback: theme.colors.foregroundMuted,
  });
  const modeDotStyle = useMemo(
    () => [styles.modeDot, { backgroundColor: selectedToneColor }],
    [selectedToneColor],
  );

  const allOptions = useMemo<ComboboxOption[]>(
    () => modeOptions.map((m) => ({ id: m.id, label: formatAgentModeLabel(m) })),
    [modeOptions],
  );
  const filteredOptions = useMemo<ComboboxOption[]>(() => {
    const q = normalizeSearchQuery(searchQuery);
    if (!q) return allOptions;
    return allOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [allOptions, searchQuery]);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setSearchQuery("");
  }, []);

  const handlePress = useCallback(() => handleOpenChange(!open), [handleOpenChange, open]);
  const handleSelect = useCallback(
    (id: string) => {
      onSelectMode(id);
      handleOpenChange(false);
    },
    [onSelectMode, handleOpenChange],
  );

  const renderOption = useCallback(
    (args: {
      option: ComboboxOption;
      selected: boolean;
      active: boolean;
      onPress: () => void;
    }): ReactElement => (
      <ModeComboboxOption
        option={args.option}
        selected={args.selected}
        active={args.active}
        onPress={args.onPress}
        provider={provider}
        providerDefinitions={providerDefinitions}
        iconColor={theme.colors.foreground}
      />
    ),
    [provider, providerDefinitions, theme.colors.foreground],
  );

  const pressableStyle = useCallback(
    ({ pressed, hovered }: PressableStateCallbackType) => [
      styles.chip,
      hovered && styles.chipHovered,
      (pressed || open) && styles.chipPressed,
      disabled && styles.chipDisabled,
    ],
    [open, disabled],
  );

  const labelStyle = styles.chipLabel;

  const sheetHeader = useMemo<SheetHeader>(
    () => ({
      title: t("agentControls.mode.title"),
      search: {
        onChange: setSearchQuery,
        placeholder: t("agentControls.mode.searchPlaceholder"),
        testID: "mode-search-input",
      },
    }),
    [t],
  );
  const popoverHeader = useMemo(
    () => (
      <View style={styles.popoverHeader}>
        <Text style={styles.popoverTitle}>{t("agentControls.mode.title")}</Text>
        {modelLabel ? (
          <Text style={styles.popoverSubtitle} numberOfLines={1}>
            {modelLabel}
          </Text>
        ) : null}
      </View>
    ),
    [modelLabel, t],
  );

  if (!selectedMode) return null;

  return (
    <>
      <ComboboxTrigger
        ref={anchorRef}
        collapsable={false}
        disabled={disabled}
        onPress={handlePress}
        style={pressableStyle}
        accessibilityRole="button"
        accessibilityLabel={t("agentControls.mode.selectWithValue", {
          value: selectedModeLabel,
        })}
        testID="mode-control"
      >
        <View style={modeDotStyle} />
        <Text style={labelStyle} numberOfLines={1}>
          {selectedModeLabel}
        </Text>
        <ChevronDown size={13} color={theme.colors.foregroundMuted} />
      </ComboboxTrigger>
      <Combobox
        options={isCompact ? filteredOptions : allOptions}
        value={selectedMode.id}
        onSelect={handleSelect}
        open={open}
        onOpenChange={handleOpenChange}
        anchorRef={anchorRef}
        desktopPlacement={MODE_POPOVER_SPEC.placement}
        desktopOffset={MODE_POPOVER_SPEC.offset}
        desktopWidth={MODE_POPOVER_SPEC.width}
        desktopSurfaceVariant="composer"
        stickyHeader={popoverHeader}
        header={isCompact ? sheetHeader : undefined}
        renderOption={renderOption}
      />
    </>
  );
}

const EMPTY_MODES: AgentMode[] = [];

function compareAvailableModes(a: AgentMode[], b: AgentMode[]): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

interface AgentModeControlProps {
  serverId: string;
  agentId: string;
  placement: AgentModeControlPlacement;
  isCompactLayout?: boolean;
}

export const AgentModeControl = memo(function AgentModeControl({
  serverId,
  agentId,
  placement,
  isCompactLayout,
}: AgentModeControlProps) {
  const isCompactFormFactor = useIsCompactFormFactor();
  const isCompact = isCompactLayout ?? isCompactFormFactor;
  const slice = useSessionStore(
    useShallow((state) => {
      const agent = state.sessions[serverId]?.agents?.get(agentId);
      if (!agent) return null;
      return {
        provider: agent.provider,
        cwd: agent.cwd,
        currentModeId: agent.currentModeId,
        model: agent.model,
      };
    }),
  );
  const availableModes = useStoreWithEqualityFn(
    useSessionStore,
    (state) => state.sessions[serverId]?.agents?.get(agentId)?.availableModes ?? EMPTY_MODES,
    compareAvailableModes,
  );
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const { updatePreferences } = useFormPreferences();
  const toast = useToast();
  const { entries: snapshotEntries } = useProvidersSnapshot(serverId, { cwd: slice?.cwd });

  const providerDefinitions = useMemo<AgentProviderDefinition[]>(() => {
    if (!slice?.provider) return [];
    const definition = resolveProviderDefinition(slice.provider, snapshotEntries);
    return definition ? [definition] : [];
  }, [slice?.provider, snapshotEntries]);

  const handleSelectMode = useCallback(
    (modeId: string) => {
      if (!client || !slice?.provider) return;
      void updatePreferences((current) =>
        mergeProviderPreferences({
          preferences: current,
          provider: slice.provider,
          updates: {
            mode: modeId || undefined,
          },
        }),
      ).catch((error) => {
        console.warn("[AgentModeControl] persist mode preference failed", error);
      });
      void client
        .setAgentMode(agentId, modeId)
        .then((notice) => showProviderNoticeToast(toast, notice))
        .catch((error) => {
          console.warn("[AgentModeControl] setAgentMode failed", error);
          toast.error(toErrorMessage(error));
        });
    },
    [agentId, client, slice?.provider, toast, updatePreferences],
  );

  if (!slice || availableModes.length === 0) return null;
  if (!shouldRenderForPlacement(placement, isCompact)) return null;

  return (
    <AgentModeControlView
      provider={slice.provider}
      providerDefinitions={providerDefinitions}
      modeOptions={availableModes}
      selectedModeId={slice.currentModeId}
      modelLabel={slice.model}
      onSelectMode={handleSelectMode}
      disabled={!client}
    />
  );
});

export interface DraftAgentModeControlProps {
  selectedProvider: AgentProvider | null;
  providerDefinitions: AgentProviderDefinition[];
  modeOptions: AgentMode[];
  selectedMode: string;
  selectedModel?: string;
  onSelectMode: (modeId: string) => void;
  disabled?: boolean;
  placement: AgentModeControlPlacement;
  isCompactLayout?: boolean;
}

export function DraftAgentModeControl({
  selectedProvider,
  providerDefinitions,
  modeOptions,
  selectedMode,
  selectedModel,
  onSelectMode,
  disabled,
  placement,
  isCompactLayout,
}: DraftAgentModeControlProps) {
  const isCompactFormFactor = useIsCompactFormFactor();
  const isCompact = isCompactLayout ?? isCompactFormFactor;
  if (!selectedProvider || modeOptions.length === 0) return null;
  if (!shouldRenderForPlacement(placement, isCompact)) return null;
  return (
    <AgentModeControlView
      provider={selectedProvider}
      providerDefinitions={providerDefinitions}
      modeOptions={modeOptions}
      selectedModeId={selectedMode}
      modelLabel={selectedModel}
      onSelectMode={onSelectMode}
      disabled={disabled}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  chip: {
    height: 32,
    minWidth: 0,
    maxWidth: 132,
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
  chipHovered: {
    borderColor: theme.colorScheme === "dark" ? "#59635D" : "#BDC9C2",
    backgroundColor: theme.colorScheme === "dark" ? "#2B302C" : "#EBF0ED",
  },
  chipPressed: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colorScheme === "dark" ? "#22382B" : "#E7F3EC",
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipLabel: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  modeDot: {
    width: 6,
    height: 6,
    flexShrink: 0,
    borderRadius: theme.borderRadius.full,
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
}));
