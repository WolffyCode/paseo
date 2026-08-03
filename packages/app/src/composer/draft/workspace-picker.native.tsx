import { useQuery } from "@tanstack/react-query";
import type { WorkspaceDescriptorPayload } from "@getpaseo/protocol/messages";
import { ChevronDown, Folder, FolderOpen } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  buildProjectPickerOptions,
  isOpenableProjectPath,
  type ProjectPickerOption,
} from "@/components/project-picker-options";
import { pickDirectory } from "@/desktop/pick-directory";
import { getIsElectron } from "@/constants/platform";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { normalizeWorkspaceDescriptor, useSessionStore } from "@/stores/session-store";
import { useRecommendedProjectPaths } from "@/stores/session-store-hooks";
import { shortenPath } from "@/utils/shorten-path";
import type { Theme } from "@/styles/theme";
import { isWeb } from "@/constants/platform";
import {
  draftWorkspaceDirectoryName,
  shouldUseNativeDirectoryPicker,
} from "./workspace-picker-model";

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedFolder = withUnistyles(Folder);
const ThemedFolderOpen = withUnistyles(FolderOpen);
const foregroundMutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export interface DraftWorkspacePickerLabels {
  readonly selectDirectory: string;
  readonly inputPlaceholder: string;
  readonly opening: string;
  readonly empty: string;
  readonly openPath: string;
  readonly openFailed: string;
}

export interface DraftWorkspacePickerProps {
  readonly serverId: string;
  readonly directory: string | null;
  readonly disabled: boolean;
  readonly labels: DraftWorkspacePickerLabels;
  readonly onSelected: (workspace: WorkspaceDescriptorPayload) => void;
}

/** Keep pressed-state styling stable without allocating a callback for each result row. */
function resultRowStyle({ pressed }: PressableStateCallbackType) {
  return [styles.resultRow, pressed ? styles.resultRowPressed : null];
}

/** Render one host directory result with a stable selection callback. */
function DirectoryOptionRow({
  option,
  labels,
  onSelect,
}: {
  option: ProjectPickerOption;
  labels: DraftWorkspacePickerLabels;
  onSelect: (path: string) => void;
}) {
  const handlePress = useCallback(() => onSelect(option.path), [onSelect, option.path]);
  return (
    <Pressable onPress={handlePress} style={resultRowStyle}>
      <ThemedFolderOpen size={15} uniProps={foregroundMutedColor} />
      <Text style={styles.resultText} numberOfLines={1}>
        {option.kind === "path"
          ? `${labels.openPath}: ${shortenPath(option.path)}`
          : shortenPath(option.path)}
      </Text>
    </Pressable>
  );
}

/** Select a host directory and bind the daemon-confirmed workspace to an existing draft. */
export function DraftWorkspacePicker({
  serverId,
  directory,
  disabled,
  labels,
  onSelected,
}: DraftWorkspacePickerProps) {
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const isLocalDaemon = useIsLocalDaemon(serverId);
  const recommendedPaths = useRecommendedProjectPaths(serverId);
  const mergeWorkspaces = useSessionStore((state) => state.mergeWorkspaces);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [submittingPath, setSubmittingPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const suggestions = useQuery({
    queryKey: ["draft-workspace-directory-suggestions", serverId, query],
    queryFn: async () => {
      if (!client) return [];
      const result = await client.getDirectorySuggestions({
        query,
        includeDirectories: true,
        includeFiles: false,
        limit: 30,
      });
      return (
        result.entries?.flatMap((entry) => (entry.kind === "directory" ? [entry.path] : [])) ?? []
      );
    },
    enabled: open && Boolean(client) && isConnected,
    staleTime: 15_000,
    retry: false,
  });
  const options = useMemo(
    () =>
      buildProjectPickerOptions({
        recommendedPaths,
        serverPaths: suggestions.data ?? [],
        query,
      }),
    [query, recommendedPaths, suggestions.data],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setErrorMessage(null);
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  const selectPath = useCallback(
    async (path: string) => {
      const trimmed = path.trim();
      if (!trimmed || !client || submittingPath !== null) return;
      setSubmittingPath(trimmed);
      setErrorMessage(null);
      try {
        const result = await client.openProject(trimmed);
        if (result.workspace === null) {
          setErrorMessage(result.error?.trim() || labels.openFailed);
          return;
        }
        mergeWorkspaces(serverId, [normalizeWorkspaceDescriptor(result.workspace)]);
        onSelected(result.workspace);
        setOpen(false);
      } catch (error) {
        setErrorMessage(
          error instanceof Error && error.message ? error.message : labels.openFailed,
        );
      } finally {
        setSubmittingPath(null);
      }
    },
    [client, labels.openFailed, mergeWorkspaces, onSelected, serverId, submittingPath],
  );

  const openPicker = useCallback(async () => {
    if (disabled || !client || !isConnected) return;
    if (
      !shouldUseNativeDirectoryPicker({
        isLocalDaemon,
        isElectron: getIsElectron(),
      })
    ) {
      setOpen(true);
      return;
    }
    setErrorMessage(null);
    try {
      const path = await pickDirectory();
      if (path !== null) await selectPath(path);
    } catch (error) {
      setErrorMessage(error instanceof Error && error.message ? error.message : labels.openFailed);
    }
  }, [client, disabled, isConnected, isLocalDaemon, labels.openFailed, selectPath]);

  const close = useCallback(() => {
    if (submittingPath === null) setOpen(false);
  }, [submittingPath]);
  useEffect(() => {
    if (!isWeb || !open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [close, open]);
  const submitCustomPath = useCallback(() => {
    if (isOpenableProjectPath(query)) void selectPath(query);
  }, [query, selectPath]);
  const handleTriggerPress = useCallback(() => void openPicker(), [openPicker]);
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setErrorMessage(null);
  }, []);
  const handleOptionSelect = useCallback((path: string) => void selectPath(path), [selectPath]);
  const triggerStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.trigger,
      (hovered || pressed) && !disabled ? styles.triggerHovered : null,
      disabled ? styles.triggerDisabled : null,
    ],
    [disabled],
  );
  const displayDirectory = directory?.trim() ?? "";
  let resultContent;
  if (submittingPath !== null) {
    resultContent = (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" />
        <Text style={styles.muted}>{labels.opening}</Text>
      </View>
    );
  } else if (options.length === 0) {
    resultContent = <Text style={styles.muted}>{labels.empty}</Text>;
  } else {
    resultContent = options.map((option) => (
      <DirectoryOptionRow
        key={`${option.kind}:${option.path}`}
        option={option}
        labels={labels}
        onSelect={handleOptionSelect}
      />
    ));
  }

  return (
    <>
      <View style={styles.contextWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.selectDirectory}
          disabled={disabled || !isConnected}
          onPress={handleTriggerPress}
          style={triggerStyle}
          testID="draft-workspace-picker-trigger"
        >
          <ThemedFolder size={15} uniProps={foregroundMutedColor} />
          <Text style={styles.name} numberOfLines={1}>
            {displayDirectory
              ? draftWorkspaceDirectoryName(displayDirectory)
              : labels.selectDirectory}
          </Text>
          {displayDirectory ? (
            <Text style={styles.path} numberOfLines={1}>
              {shortenPath(displayDirectory)}
            </Text>
          ) : null}
          <ThemedChevronDown size={14} uniProps={foregroundMutedColor} />
        </Pressable>
        {errorMessage && !open ? <Text style={styles.inlineError}>{errorMessage}</Text> : null}
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.overlay}>
          <Pressable
            style={styles.backdrop}
            onPress={close}
            testID="draft-workspace-picker-backdrop"
          />
          <View style={styles.panel} testID="draft-workspace-picker-modal">
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={handleQueryChange}
              placeholder={labels.inputPlaceholder}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              editable={submittingPath === null}
              returnKeyType="go"
              onSubmitEditing={submitCustomPath}
            />
            {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}
            <ScrollView
              style={styles.results}
              contentContainerStyle={styles.resultsContent}
              keyboardShouldPersistTaps="always"
            >
              {resultContent}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  contextWrap: {
    width: "100%",
  },
  trigger: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.surface1,
  },
  triggerHovered: { backgroundColor: theme.colors.surface2 },
  triggerDisabled: { opacity: 0.55 },
  name: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    flexShrink: 0,
  },
  path: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs, flex: 1, minWidth: 0 },
  inlineError: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[1],
  },
  overlay: { flex: 1, alignItems: "center", paddingTop: theme.spacing[12] },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.5)" },
  panel: {
    width: 620,
    maxWidth: "92%",
    maxHeight: "76%",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    ...theme.shadow.lg,
  },
  input: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    outlineStyle: "none",
  } as object,
  modalError: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
  },
  results: { maxHeight: 420 },
  resultsContent: { padding: theme.spacing[2] },
  resultRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.sm,
  },
  resultRowPressed: { backgroundColor: theme.colors.surface1 },
  resultText: { color: theme.colors.foreground, fontSize: theme.fontSize.sm, flex: 1 },
  loadingRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    padding: theme.spacing[3],
  },
}));
