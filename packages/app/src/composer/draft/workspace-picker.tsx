import { useQuery } from "@tanstack/react-query";
import type { FileExplorerDirectoryPayload } from "@getpaseo/client/internal/daemon-client";
import type { WorkspaceDescriptorPayload } from "@getpaseo/protocol/messages";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderGit2,
  FolderOpen,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Pressable,
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
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import type { SheetHeader } from "@/components/adaptive-modal-sheet";
import {
  draftWorkspaceDirectoryName,
  normalizeFilesystemBrowserPath,
  resolveFilesystemParent,
} from "./workspace-picker-model";

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedFolder = withUnistyles(Folder);
const ThemedFolderGit = withUnistyles(FolderGit2);
const ThemedFolderOpen = withUnistyles(FolderOpen);
const foregroundMutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const accentColor = (theme: Theme) => ({ color: theme.colors.accent });
const EMPTY_OPTIONS: ComboboxOption[] = [];

function noop() {}

export interface DraftWorkspacePickerLabels {
  readonly selectDirectory: string;
  readonly inputPlaceholder: string;
  readonly opening: string;
  readonly empty: string;
  readonly openPath: string;
  readonly openFailed: string;
  readonly projects: string;
  readonly filesystem: string;
  readonly filesystemPlaceholder: string;
  readonly filesystemLoading: string;
  readonly filesystemEmpty: string;
  readonly chooseCurrentDirectory: string;
  readonly parentDirectory: string;
  readonly filesystemUnavailable: string;
  readonly conversationOnly: string;
}

export interface DraftWorkspacePickerProps {
  readonly serverId: string;
  readonly directory: string | null;
  readonly disabled: boolean;
  readonly labels: DraftWorkspacePickerLabels;
  readonly onSelected: (workspace: WorkspaceDescriptorPayload) => void;
}

/** Keep pressed-state styling stable without allocating a callback for each result row. */
function resultRowStyle({
  hovered = false,
  pressed,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [
    styles.resultRow,
    hovered ? styles.resultRowHovered : null,
    pressed ? styles.resultRowPressed : null,
  ];
}

/** Keep the optional Electron directory action visually aligned with result rows. */
function footerButtonStyle({
  hovered = false,
  pressed,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [
    styles.footerButton,
    hovered ? styles.resultRowHovered : null,
    pressed ? styles.resultRowPressed : null,
  ];
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

/** Render one directory from the host filesystem browser without exposing files as workspace targets. */
function FilesystemDirectoryRow({
  entry,
  onOpen,
}: {
  entry: FileExplorerDirectoryPayload["entries"][number];
  onOpen: (path: string) => void;
}) {
  const handlePress = useCallback(() => onOpen(entry.path), [entry.path, onOpen]);
  return (
    <Pressable onPress={handlePress} style={resultRowStyle}>
      <ThemedFolder size={15} uniProps={foregroundMutedColor} />
      <Text style={styles.resultText} numberOfLines={1}>
        {entry.name}
      </Text>
      <ChevronRight size={14} color="#8B938E" />
    </Pressable>
  );
}

const SELECTED_TAB_STATE = { selected: true } as const;
const UNSELECTED_TAB_STATE = { selected: false } as const;
const EMPTY_FILESYSTEM_ENTRIES: FileExplorerDirectoryPayload["entries"] = [];

/** Keep the project/filesystem tabs independent from the picker lifecycle and query state. */
function WorkspacePickerTab({
  kind,
  label,
  selected,
  onPress,
}: {
  kind: "projects" | "filesystem";
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const tabStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.tab,
      selected ? styles.tabActive : null,
      pressed ? styles.resultRowPressed : null,
    ],
    [selected],
  );
  const tabTextStyle = useMemo(
    () => [styles.tabText, selected ? styles.tabTextActive : null],
    [selected],
  );
  const Icon = kind === "projects" ? FolderGit2 : Folder;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={selected ? SELECTED_TAB_STATE : UNSELECTED_TAB_STATE}
      onPress={onPress}
      style={tabStyle}
    >
      <Icon size={14} color={selected ? "#20744A" : "#8B938E"} />
      <Text style={tabTextStyle}>{label}</Text>
    </Pressable>
  );
}

/** Render the two directory sources without increasing the main picker component's branch depth. */
function WorkspacePickerResults({
  activeTab,
  filesystemEntries,
  filesystemError,
  filesystemLoading,
  labels,
  onFilesystemDirectoryOpen,
  onProjectSelect,
  options,
  submittingPath,
}: {
  activeTab: "projects" | "filesystem";
  filesystemEntries: FileExplorerDirectoryPayload["entries"];
  filesystemError: string | null;
  filesystemLoading: boolean;
  labels: DraftWorkspacePickerLabels;
  onFilesystemDirectoryOpen: (path: string) => void;
  onProjectSelect: (path: string) => void;
  options: ProjectPickerOption[];
  submittingPath: string | null;
}) {
  if (submittingPath !== null) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" />
        <Text style={styles.muted}>{labels.opening}</Text>
      </View>
    );
  }
  if (activeTab === "filesystem") {
    if (filesystemLoading) {
      return (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.muted}>{labels.filesystemLoading}</Text>
        </View>
      );
    }
    if (filesystemError !== null) {
      return <Text style={styles.muted}>{filesystemError || labels.filesystemUnavailable}</Text>;
    }
    const directories = filesystemEntries.filter((entry) => entry.kind === "directory");
    if (directories.length === 0) {
      return <Text style={styles.muted}>{labels.filesystemEmpty}</Text>;
    }
    return (
      <>
        {directories.map((entry) => (
          <FilesystemDirectoryRow
            key={entry.path}
            entry={entry}
            onOpen={onFilesystemDirectoryOpen}
          />
        ))}
      </>
    );
  }
  if (options.length === 0) {
    return <Text style={styles.muted}>{labels.empty}</Text>;
  }
  return (
    <>
      {options.map((option) => (
        <DirectoryOptionRow
          key={`${option.kind}:${option.path}`}
          option={option}
          labels={labels}
          onSelect={onProjectSelect}
        />
      ))}
    </>
  );
}

/** Own the anchored panel markup so the trigger lifecycle stays below the lint complexity limit. */
function WorkspacePickerPanel({
  activeTab,
  canBrowseNativeDirectory,
  errorMessage,
  filesystemEntries,
  filesystemError,
  filesystemListingLoading,
  filesystemPath,
  filesystemRoot,
  handleFilesystemDirectoryOpen,
  handleFilesystemParent,
  handleFilesystemTabPress,
  handleNativeDirectoryPickerPress,
  handleOptionSelect,
  handleProjectsTabPress,
  inputRef,
  labels,
  onQueryChange,
  onSubmitQuery,
  open,
  pickerHeader,
  selectFilesystemDirectory,
  setOpen,
  submittingPath,
  triggerRef,
  options,
  query,
}: {
  activeTab: "projects" | "filesystem";
  canBrowseNativeDirectory: boolean;
  errorMessage: string | null;
  filesystemEntries: FileExplorerDirectoryPayload["entries"] | undefined;
  filesystemError: string | null;
  filesystemListingLoading: boolean;
  filesystemPath: string;
  filesystemRoot: string;
  handleFilesystemDirectoryOpen: (path: string) => void;
  handleFilesystemParent: () => void;
  handleFilesystemTabPress: () => void;
  handleNativeDirectoryPickerPress: () => void;
  handleOptionSelect: (path: string) => void;
  handleProjectsTabPress: () => void;
  inputRef: RefObject<TextInput | null>;
  labels: DraftWorkspacePickerLabels;
  onQueryChange: (value: string) => void;
  onSubmitQuery: () => void;
  open: boolean;
  pickerHeader: SheetHeader;
  selectFilesystemDirectory: () => void;
  setOpen: (open: boolean) => void;
  submittingPath: string | null;
  triggerRef: RefObject<View | null>;
  options: ProjectPickerOption[];
  query: string;
}) {
  return (
    <Combobox
      options={EMPTY_OPTIONS}
      value=""
      onSelect={noop}
      searchable={false}
      open={open}
      onOpenChange={setOpen}
      anchorRef={triggerRef}
      header={pickerHeader}
      desktopPlacement="bottom-start"
      desktopOffset={6}
      desktopWidth={430}
      desktopSurfaceVariant="composer"
    >
      <View testID="draft-workspace-picker-modal">
        <View style={styles.tabRow}>
          <WorkspacePickerTab
            kind="projects"
            label={labels.projects}
            selected={activeTab === "projects"}
            onPress={handleProjectsTabPress}
          />
          <WorkspacePickerTab
            kind="filesystem"
            label={labels.filesystem}
            selected={activeTab === "filesystem"}
            onPress={handleFilesystemTabPress}
          />
        </View>
        <View style={styles.searchRow}>
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={onQueryChange}
            placeholder={
              activeTab === "filesystem" ? labels.filesystemPlaceholder : labels.inputPlaceholder
            }
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            editable={submittingPath === null}
            returnKeyType="go"
            onSubmitEditing={onSubmitQuery}
          />
        </View>
        {activeTab === "filesystem" ? (
          <View style={styles.filesystemToolbar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={labels.parentDirectory}
              disabled={filesystemPath === "." || submittingPath !== null}
              onPress={handleFilesystemParent}
              style={styles.parentButton}
            >
              <ArrowLeft size={14} color={filesystemPath === "." ? "#B8BFBA" : "#66706A"} />
            </Pressable>
            <Text style={styles.filesystemPath} numberOfLines={1}>
              {shortenPath(
                filesystemPath === "."
                  ? filesystemRoot
                  : `${filesystemRoot.replace(/\/$/, "")}/${filesystemPath}`,
              )}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={filesystemEntries === undefined || submittingPath !== null}
              onPress={selectFilesystemDirectory}
              style={styles.chooseCurrentButton}
            >
              <Text style={styles.chooseCurrentText}>{labels.chooseCurrentDirectory}</Text>
            </Pressable>
          </View>
        ) : null}
        {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}
        <View style={styles.resultsContent}>
          <WorkspacePickerResults
            activeTab={activeTab}
            filesystemEntries={filesystemEntries ?? EMPTY_FILESYSTEM_ENTRIES}
            filesystemError={filesystemError}
            filesystemLoading={filesystemListingLoading}
            labels={labels}
            onFilesystemDirectoryOpen={handleFilesystemDirectoryOpen}
            onProjectSelect={handleOptionSelect}
            options={options}
            submittingPath={submittingPath}
          />
        </View>
        {canBrowseNativeDirectory ? (
          <View style={styles.panelFooter}>
            <Pressable
              onPress={handleNativeDirectoryPickerPress}
              disabled={submittingPath !== null}
              style={footerButtonStyle}
              accessibilityRole="button"
            >
              <ThemedFolderOpen size={15} uniProps={foregroundMutedColor} />
              <Text style={styles.footerButtonText}>{labels.selectDirectory}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Combobox>
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
  const [activeTab, setActiveTab] = useState<"projects" | "filesystem">("projects");
  const [query, setQuery] = useState("");
  const [filesystemRoot, setFilesystemRoot] = useState("~");
  const [filesystemPath, setFilesystemPath] = useState(".");
  const [submittingPath, setSubmittingPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const triggerRef = useRef<View>(null);

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

  const filesystemListing = useQuery({
    queryKey: ["draft-workspace-filesystem", serverId, filesystemRoot, filesystemPath],
    queryFn: async () => {
      if (!client) return null;
      return client.listDirectory(filesystemRoot, filesystemPath);
    },
    enabled: open && activeTab === "filesystem" && Boolean(client) && isConnected,
    staleTime: 5_000,
    retry: false,
  });

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveTab("projects");
    setFilesystemRoot("~");
    setFilesystemPath(".");
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

  const openPicker = useCallback(() => {
    if (disabled || !client || !isConnected) return;
    setOpen(true);
  }, [client, disabled, isConnected]);
  const openNativeDirectoryPicker = useCallback(async () => {
    if (disabled || !client || !isConnected || !isLocalDaemon || !getIsElectron()) return;
    setErrorMessage(null);
    try {
      const path = await pickDirectory();
      if (path !== null) await selectPath(path);
    } catch (error) {
      setErrorMessage(error instanceof Error && error.message ? error.message : labels.openFailed);
    }
  }, [client, disabled, isConnected, isLocalDaemon, labels.openFailed, selectPath]);

  const submitCustomPath = useCallback(() => {
    if (activeTab === "filesystem") {
      const trimmed = query.trim();
      if (isOpenableProjectPath(trimmed)) {
        setFilesystemRoot(trimmed);
        setFilesystemPath(".");
        setQuery("");
      }
      return;
    }
    if (isOpenableProjectPath(query)) void selectPath(query);
  }, [activeTab, query, selectPath]);
  const handleTriggerPress = useCallback(() => openPicker(), [openPicker]);
  const handleNativeDirectoryPickerPress = useCallback(
    () => void openNativeDirectoryPicker(),
    [openNativeDirectoryPicker],
  );
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setErrorMessage(null);
  }, []);
  const handleOptionSelect = useCallback((path: string) => void selectPath(path), [selectPath]);
  const handleFilesystemDirectoryOpen = useCallback((path: string) => {
    setFilesystemPath(normalizeFilesystemBrowserPath(path));
  }, []);
  const handleProjectsTabPress = useCallback(() => setActiveTab("projects"), []);
  const handleFilesystemTabPress = useCallback(() => setActiveTab("filesystem"), []);
  const handleFilesystemParent = useCallback(() => {
    const parent = resolveFilesystemParent(filesystemPath);
    if (parent !== null) setFilesystemPath(parent);
  }, [filesystemPath]);
  const selectFilesystemDirectory = useCallback(() => {
    const listing = filesystemListing.data;
    if (!listing) return;
    const fallbackPath =
      filesystemPath === "."
        ? filesystemRoot
        : `${filesystemRoot.replace(/\/$/, "")}/${filesystemPath}`;
    void selectPath(listing.absolutePath ?? fallbackPath);
  }, [filesystemListing.data, filesystemPath, filesystemRoot, selectPath]);
  const triggerStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.trigger,
      (hovered || pressed) && !disabled ? styles.triggerHovered : null,
      disabled ? styles.triggerDisabled : null,
    ],
    [disabled],
  );
  const displayDirectory = directory?.trim() ?? "";
  const canBrowseNativeDirectory = isLocalDaemon && getIsElectron();
  const pickerHeader = useMemo<SheetHeader>(
    () => ({
      title: labels.selectDirectory,
      leading: <ThemedFolderOpen size={15} uniProps={foregroundMutedColor} />,
    }),
    [labels.selectDirectory],
  );
  const filesystemError =
    filesystemListing.error instanceof Error ? filesystemListing.error.message : null;

  return (
    <>
      <View style={styles.contextWrap}>
        <Pressable
          ref={triggerRef}
          collapsable={false}
          accessibilityRole="button"
          accessibilityLabel={labels.selectDirectory}
          disabled={disabled || !isConnected}
          onPress={handleTriggerPress}
          style={triggerStyle}
          testID="draft-workspace-picker-trigger"
        >
          <View style={styles.folderMark}>
            <ThemedFolderGit size={15} uniProps={accentColor} />
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {displayDirectory
              ? draftWorkspaceDirectoryName(displayDirectory)
              : labels.conversationOnly}
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
      <WorkspacePickerPanel
        activeTab={activeTab}
        canBrowseNativeDirectory={canBrowseNativeDirectory}
        errorMessage={errorMessage}
        filesystemEntries={filesystemListing.data?.entries}
        filesystemError={filesystemError}
        filesystemListingLoading={filesystemListing.isLoading}
        filesystemPath={filesystemPath}
        filesystemRoot={filesystemRoot}
        handleFilesystemDirectoryOpen={handleFilesystemDirectoryOpen}
        handleFilesystemParent={handleFilesystemParent}
        handleFilesystemTabPress={handleFilesystemTabPress}
        handleNativeDirectoryPickerPress={handleNativeDirectoryPickerPress}
        handleOptionSelect={handleOptionSelect}
        handleProjectsTabPress={handleProjectsTabPress}
        inputRef={inputRef}
        labels={labels}
        onQueryChange={handleQueryChange}
        onSubmitQuery={submitCustomPath}
        open={open}
        pickerHeader={pickerHeader}
        options={options}
        query={query}
        selectFilesystemDirectory={selectFilesystemDirectory}
        setOpen={setOpen}
        submittingPath={submittingPath}
        triggerRef={triggerRef}
      />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  contextWrap: {
    maxWidth: "100%",
    alignSelf: "flex-start",
  },
  trigger: {
    width: "auto",
    maxWidth: "100%",
    minWidth: 0,
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingLeft: 5,
    paddingRight: 9,
    borderRadius: 10,
    backgroundColor: "transparent",
  },
  triggerHovered: {
    backgroundColor: theme.colorScheme === "dark" ? "#2B302C" : "#EBF0ED",
  },
  triggerDisabled: { opacity: 0.55 },
  folderMark: {
    width: 26,
    height: 26,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: theme.colorScheme === "dark" ? theme.colors.surface3 : "#E7F3EC",
  },
  name: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    flexShrink: 0,
  },
  path: {
    maxWidth: 340,
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  inlineError: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[1],
  },
  searchRow: {
    minHeight: 42,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tabRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: theme.colors.accent },
  tabText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  tabTextActive: { color: theme.colors.accent, fontWeight: theme.fontWeight.medium },
  filesystemToolbar: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  parentButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  filesystemPath: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  chooseCurrentButton: {
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: theme.spacing[2],
    borderRadius: 8,
    backgroundColor: theme.colorScheme === "dark" ? "#284A38" : "#E7F3EC",
  },
  chooseCurrentText: { color: theme.colors.accent, fontSize: theme.fontSize.xs },
  input: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    outlineStyle: "none",
  } as object,
  modalError: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
  },
  resultsContent: { padding: theme.spacing[2] },
  panelFooter: {
    minHeight: 44,
    justifyContent: "center",
    padding: 5,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footerButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: 9,
  },
  footerButtonText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  resultRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: 10,
  },
  resultRowHovered: {
    backgroundColor: theme.colorScheme === "dark" ? "#2B302C" : "#EBF0ED",
  },
  resultRowPressed: {
    backgroundColor: theme.colorScheme === "dark" ? "#333A35" : "#E4ECE7",
  },
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
