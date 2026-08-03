import { useCallback, useMemo } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { AutocompleteOption } from "@/components/ui/autocomplete";
import {
  useAgentCommandsQuery,
  type AgentSlashCommand,
  type DraftCommandConfig,
} from "./use-agent-commands-query";
import { orderAutocompleteOptions } from "@/components/ui/autocomplete-utils";
import { useAutocomplete } from "./use-autocomplete";
import { CLIENT_SLASH_COMMANDS, type ClientSlashCommand } from "@/client-slash-commands";
import {
  applySlashCommandReplacement,
  filterAndRankCommandAutocompleteEntries,
  filterInlineSkillCommandEntries,
  findActiveSlashCommand,
} from "@/utils/agent-command-autocomplete";

interface UseAgentAutocompleteInput {
  userInput: string;
  cursorIndex: number;
  setUserInput: (nextValue: string) => void;
  serverId: string;
  agentId: string;
  draftConfig?: DraftCommandConfig;
  onAutocompleteApplied?: () => void;
  onClientSlashCommand?: (command: ClientSlashCommand) => void;
  canExecuteClientSlashCommand?: boolean;
}

type AgentAutocompleteOption =
  | (AutocompleteOption & { type: "client_command"; command: ClientSlashCommand })
  | (AutocompleteOption & { type: "provider_command" });

interface AgentAutocompleteResult {
  isVisible: boolean;
  options: AutocompleteOption[];
  selectedIndex: number;
  isLoading: boolean;
  errorMessage?: string;
  loadingText: string;
  emptyText: string;
  onSelectOption: (option: AutocompleteOption) => void;
  onKeyPress: (event: { key: string; preventDefault: () => void }) => boolean;
}

type AvailableCommand =
  | { source: "client"; command: ClientSlashCommand }
  | { source: "provider"; command: AgentSlashCommand };

function normalizeDraftCommandConfig(
  draftConfig?: DraftCommandConfig,
): DraftCommandConfig | undefined {
  if (!draftConfig) {
    return undefined;
  }

  const cwd = draftConfig.cwd.trim();
  if (!cwd) {
    return undefined;
  }

  const modeId = draftConfig.modeId?.trim() ?? "";
  const model = draftConfig.model?.trim() ?? "";
  const thinkingOptionId = draftConfig.thinkingOptionId?.trim() ?? "";
  const featureValues = draftConfig.featureValues;
  return {
    provider: draftConfig.provider,
    cwd,
    ...(modeId ? { modeId } : {}),
    ...(model ? { model } : {}),
    ...(thinkingOptionId ? { thinkingOptionId } : {}),
    ...(featureValues && Object.keys(featureValues).length > 0 ? { featureValues } : {}),
  };
}

/** Project one client or provider slash command into the shared autocomplete option shape. */
function mapCommandToOption(entry: AvailableCommand, t: TFunction): AgentAutocompleteOption {
  const command = entry.command;
  const base = {
    id: command.name,
    label: `/${command.name}`,
    detail: command.argumentHint || undefined,
    description:
      entry.source === "client" ? t(entry.command.descriptionKey) : entry.command.description,
    kind: "command" as const,
  };
  if (entry.source === "client") {
    return {
      ...base,
      type: "client_command",
      command: entry.command,
    };
  }
  return {
    ...base,
    type: "provider_command",
  };
}

interface BuildAutocompleteOptionsInput {
  isVisible: boolean;
  commands: AgentSlashCommand[];
  isDraftContext: boolean;
  commandFilterQuery: string;
  isInlineCommand: boolean;
  t: TFunction;
}

/** Build the ranked slash-command list for the active cursor token. */
function buildCommandAutocompleteOptions(input: BuildAutocompleteOptionsInput) {
  if (!input.isVisible) {
    return [];
  }

  const providerCommands = input.commands.map(
    (command): AvailableCommand => ({ source: "provider", command }),
  );
  const clientCommandNames = new Set(CLIENT_SLASH_COMMANDS.map((command) => command.name));
  const rootCommands: AvailableCommand[] = input.isDraftContext
    ? providerCommands
    : [
        ...CLIENT_SLASH_COMMANDS.map(
          (command): AvailableCommand => ({ source: "client", command }),
        ),
        ...providerCommands.filter((entry) => !clientCommandNames.has(entry.command.name)),
      ];
  const availableCommands = input.isInlineCommand
    ? filterInlineSkillCommandEntries(providerCommands)
    : rootCommands;
  const matches = filterAndRankCommandAutocompleteEntries(
    availableCommands,
    input.commandFilterQuery,
  );
  return orderAutocompleteOptions(matches).map((entry) => mapCommandToOption(entry, input.t));
}

/** Decide whether the current host and conversation can enumerate slash commands. */
function resolveCanLoadCommands(args: {
  serverId: string;
  agentId: string;
  isDraftContext: boolean;
}): boolean {
  if (!args.serverId) {
    return false;
  }
  return Boolean(args.agentId) || args.isDraftContext;
}

/** Expose slash-command autocomplete state and keyboard behavior to the Composer. */
export function useAgentAutocomplete(input: UseAgentAutocompleteInput): AgentAutocompleteResult {
  const { t } = useTranslation();
  const {
    userInput,
    cursorIndex,
    setUserInput,
    serverId,
    agentId,
    draftConfig,
    onAutocompleteApplied,
    onClientSlashCommand,
    canExecuteClientSlashCommand,
  } = input;

  const activeSlashCommand = useMemo(
    () =>
      findActiveSlashCommand({
        text: userInput,
        cursorIndex,
      }),
    [cursorIndex, userInput],
  );
  const commandFilterQuery = activeSlashCommand?.query ?? "";

  const normalizedDraftConfig = useMemo(
    () => normalizeDraftCommandConfig(draftConfig),
    [draftConfig],
  );

  const isDraftContext = normalizedDraftConfig !== undefined;
  const queryDraftConfig = normalizedDraftConfig;
  const canLoadCommands = resolveCanLoadCommands({ serverId, agentId, isDraftContext });

  const canShowAutocomplete = activeSlashCommand !== null && canLoadCommands;

  const {
    commands,
    isLoading: isCommandsLoading,
    isError,
    error,
  } = useAgentCommandsQuery({
    serverId,
    agentId,
    enabled: canShowAutocomplete,
    draftConfig: queryDraftConfig,
  });

  const isVisible = canShowAutocomplete && !isCommandsLoading;

  const options = useMemo<AgentAutocompleteOption[]>(
    () =>
      buildCommandAutocompleteOptions({
        commandFilterQuery,
        commands,
        isInlineCommand: activeSlashCommand?.position === "inline",
        isDraftContext,
        isVisible,
        t,
      }),
    [activeSlashCommand, commandFilterQuery, commands, isDraftContext, isVisible, t],
  );

  const onSelectOption = useCallback(
    (option: AutocompleteOption) => {
      const selected = option as AgentAutocompleteOption;
      if (
        selected.type === "client_command" &&
        selected.command.execution === "immediate" &&
        canExecuteClientSlashCommand &&
        onClientSlashCommand
      ) {
        onClientSlashCommand(selected.command);
        return;
      }

      if (!activeSlashCommand) {
        setUserInput(`/${selected.id} `);
        onAutocompleteApplied?.();
        return;
      }

      const nextInput = applySlashCommandReplacement({
        text: userInput,
        command: activeSlashCommand,
        commandName: selected.id,
      });
      setUserInput(nextInput);
      onAutocompleteApplied?.();
    },
    [
      canExecuteClientSlashCommand,
      onAutocompleteApplied,
      onClientSlashCommand,
      setUserInput,
      userInput,
      activeSlashCommand,
    ],
  );

  const { selectedIndex, onKeyPress } = useAutocomplete({
    isVisible,
    options,
    query: commandFilterQuery,
    onSelectOption,
    onEscape: activeSlashCommand?.position === "start" ? () => setUserInput("") : undefined,
  });

  return {
    isVisible,
    options,
    selectedIndex,
    isLoading: isCommandsLoading && options.length === 0,
    errorMessage: isError ? (error?.message ?? t("agentAutocomplete.failedToLoad")) : undefined,
    loadingText: t("agentAutocomplete.loadingCommands"),
    emptyText: t("agentAutocomplete.noCommands"),
    onSelectOption,
    onKeyPress,
  };
}
