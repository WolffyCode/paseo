import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { buildChatAgentInput } from "./submission";
import { Composer } from "@/composer";
import { useAgentInputDraft } from "@/composer/draft/input-draft";
import type { MessagePayload } from "@/composer/types";
import { ScreenHeader } from "@/components/headers/screen-header";
import { SidebarMenuToggle } from "@/components/headers/menu-header";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { HostPicker } from "@/components/hosts/host-picker";
import { ComboboxTrigger } from "@/components/ui/combobox-trigger";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { confirmDialog } from "@/utils/confirm-dialog";
import { toErrorMessage } from "@/utils/error-messages";
import { useDraftStore } from "@/stores/draft-store";
import { generateDraftId } from "@/stores/draft-keys";
import {
  navigateToWorkspace,
  useLastWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import {
  normalizeWorkspaceDescriptor,
  useSessionStore,
  type WorkspaceDescriptor,
} from "@/stores/session-store";
import {
  getHostRuntimeStore,
  useHostRuntimeClient,
  useHostRuntimeIsConnected,
  useHosts,
} from "@/runtime/host-runtime";
import { useHostFeature } from "@/runtime/host-features";
import {
  canClearSubmittedChatDraft,
  chatTitle,
  INITIAL_CHATS_SCREEN_STATE,
  reduceChatsScreen,
  selectChats,
} from "./model";

const MENU_TOGGLE = <SidebarMenuToggle />;
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
function spinnerColor(theme: Theme) {
  return { color: theme.colors.foregroundMuted };
}

const EMPTY_WORKSPACES = new Map<string, WorkspaceDescriptor>();

export function ChatsScreen() {
  const hosts = useHosts();
  const last = useLastWorkspaceSelection();
  const [selectedHost, setSelectedHost] = useState<string | null>(last?.serverId ?? null);
  const serverId =
    hosts.find((host) => host.serverId === selectedHost)?.serverId ?? hosts[0]?.serverId;
  const { t } = useTranslation();
  if (!serverId)
    return (
      <View style={styles.container}>
        <ScreenHeader left={MENU_TOGGLE} />
        <Text style={styles.message}>{t("chats.noHost")}</Text>
      </View>
    );
  return <HostChats key={serverId} serverId={serverId} onSelectHost={setSelectedHost} />;
}

interface HostChatsProps {
  serverId: string;
  onSelectHost: (id: string) => void;
}

function HostChats({ serverId, onSelectHost }: HostChatsProps) {
  const { t } = useTranslation();
  const hosts = useHosts();
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const supported = useHostFeature(serverId, "independentChats");
  const workspaces = useSessionStore(
    (state) => state.sessions[serverId]?.workspaces ?? EMPTY_WORKSPACES,
  );
  const chats = useMemo(() => selectChats(workspaces), [workspaces]);
  const [state, dispatch] = useReducer(reduceChatsScreen, INITIAL_CHATS_SCREEN_STATE);
  const [hostPickerOpen, setHostPickerOpen] = useState(false);
  const hostAnchor = useRef<View>(null);
  const mounted = useRef(true);
  const submission = useRef({ id: generateDraftId() });
  const draft = useAgentInputDraft({
    draftKey: `new-chat:${serverId}`,
    composer: { initialServerId: serverId, isVisible: true },
  });
  const controls = draft.composerState;
  const busy = state.operation.kind !== "idle";
  const host = hosts.find((candidate) => candidate.serverId === serverId);
  useEffect(() => {
    mounted.current = true;
    const release = getHostRuntimeStore().acquireDirectoryDemand(serverId);
    return () => {
      mounted.current = false;
      release();
    };
  }, [serverId]);

  const submit = useCallback(
    async (payload: MessagePayload) => {
      if (!client || !connected) throw new Error(t("chats.offline"));
      if (!supported) throw new Error(t("chats.updateHost"));
      const hasContent = payload.text.trim().length > 0 || payload.attachments.length > 0;
      if (!controls?.selectedProvider || !hasContent) throw new Error(t("chats.selectModel"));
      if (busy) return;
      const submittedDraft = useDraftStore.getState().getDraftInput(`new-chat:${serverId}`);
      dispatch({ type: "start", operation: { kind: "creating" } });
      try {
        const agentInput = await buildChatAgentInput({
          payload,
          controls,
          provider: controls.selectedProvider,
          clientMessageId: `${submission.current.id}:message`,
        });
        const result = await client.createWorkspace({
          source: { kind: "chat" },
          title: chatTitle(payload.text) || t("chats.new"),
          agent: agentInput,
          idempotencyKey: submission.current.id,
        });
        if (!result.workspace || !result.agent) {
          if (!result.creation?.outcomeUnknown) submission.current.id = generateDraftId();
          throw new Error(result.error ?? t("chats.createFailed"));
        }
        const workspace = normalizeWorkspaceDescriptor(result.workspace);
        const agentId = result.agent.id;
        useSessionStore.getState().mergeWorkspaces(serverId, [workspace]);
        const currentDraft = useDraftStore.getState().getDraftInput(`new-chat:${serverId}`);
        if (canClearSubmittedChatDraft(submittedDraft, currentDraft)) draft.clear("sent");
        submission.current = { id: generateDraftId() };
        if (mounted.current) {
          dispatch({ type: "complete" });
          navigateToWorkspace({
            serverId,
            workspaceId: workspace.id,
            target: { kind: "agent", agentId },
          });
        }
      } catch (error) {
        if (mounted.current) dispatch({ type: "fail", error: toErrorMessage(error) });
        throw error;
      }
    },
    [busy, client, connected, controls, draft, serverId, supported, t],
  );

  const archive = useCallback(
    async (chat: WorkspaceDescriptor) => {
      if (!client || !connected) {
        dispatch({ type: "fail", error: t("chats.offline") });
        return;
      }
      const confirmed = await confirmDialog({
        title: t("chats.archive"),
        message: t("chats.archiveConfirm"),
        confirmLabel: t("chats.archive"),
        destructive: true,
      });
      if (!confirmed) return;
      dispatch({ type: "start", operation: { kind: "archiving", id: chat.id } });
      try {
        const result = await client.archiveWorkspace(chat.id);
        if (result.error) throw new Error(result.error);
        dispatch({ type: "complete" });
      } catch (error) {
        dispatch({ type: "fail", error: toErrorMessage(error) });
      }
    },
    [client, connected, t],
  );

  const openHostPicker = useCallback(() => setHostPickerOpen(true), []);
  const agentControls = useMemo(
    () => (controls ? { ...controls.agentControls, disabled: busy || !connected } : undefined),
    [controls, busy, connected],
  );
  const openChat = useCallback(
    (chat: WorkspaceDescriptor) => navigateToWorkspace({ serverId, workspaceId: chat.id }),
    [serverId],
  );
  const renameChat = useCallback(
    (chat: WorkspaceDescriptor) => dispatch({ type: "rename", workspace: chat }),
    [],
  );
  const closeRename = useCallback(() => dispatch({ type: "rename", workspace: null }), []);
  const validateName = useCallback(
    (value: string) => (value.trim() ? null : t("chats.nameRequired")),
    [t],
  );
  const saveName = useCallback(
    async (value: string) => {
      if (!client || !state.renaming) throw new Error(t("chats.offline"));
      await client.setWorkspaceTitle(state.renaming.id, value.trim());
      dispatch({ type: "rename", workspace: null });
    },
    [client, state.renaming, t],
  );

  return (
    <View style={styles.container} testID="chats-screen">
      <ScreenHeader left={MENU_TOGGLE} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t("chats.title")}</Text>
        <HostPicker
          hosts={hosts}
          value={serverId}
          onSelect={onSelectHost}
          open={hostPickerOpen}
          onOpenChange={setHostPickerOpen}
          anchorRef={hostAnchor}
        >
          <ComboboxTrigger ref={hostAnchor} onPress={openHostPicker} disabled={busy}>
            <Text style={styles.text}>{host?.label}</Text>
          </ComboboxTrigger>
        </HostPicker>
        <Text style={styles.message}>{t("chats.description")}</Text>
        {!connected ? <Text style={styles.error}>{t("chats.offline")}</Text> : null}
        {connected && !supported ? <Text style={styles.error}>{t("chats.updateHost")}</Text> : null}
        {controls ? (
          <Composer
            agentId={`new-chat:${serverId}`}
            serverId={serverId}
            isPaneFocused={true}
            onSubmitMessage={submit}
            isSubmitLoading={busy || !connected || !supported || !draft.isHydrated}
            submitBehavior="preserve-and-lock"
            textSource={draft.textSource}
            onChangeText={draft.editText}
            textReplacement={draft.textReplacement}
            attachments={draft.attachments}
            onChangeAttachments={draft.setAttachments}
            cwd=""
            clearDraft={draft.clear}
            agentControls={agentControls}
            commandDraft={controls.commandDraft}
            autoFocus
            submitButtonTestID="chat-create-submit"
            submitButtonAccessibilityLabel={t("chats.new")}
          />
        ) : (
          <ThemedLoadingSpinner uniProps={spinnerColor} />
        )}
        {state.error ? (
          <Text style={styles.error} accessibilityRole="alert" testID="chats-error">
            {state.error}
          </Text>
        ) : null}
        <Text style={styles.section}>{t("chats.recent")}</Text>
        {chats.length === 0 ? (
          <Text style={styles.message} testID="chats-empty">
            {t("chats.empty")}
          </Text>
        ) : null}
        {chats.map((chat) => (
          <ChatRow
            key={chat.id}
            chat={chat}
            busy={busy}
            connected={connected}
            archiving={state.operation.kind === "archiving" && state.operation.id === chat.id}
            onOpen={openChat}
            onRename={renameChat}
            onArchive={archive}
          />
        ))}
      </ScrollView>
      <AdaptiveRenameModal
        visible={state.renaming !== null}
        title={t("chats.rename")}
        initialValue={state.renaming?.name ?? ""}
        onClose={closeRename}
        testID="chat-rename-modal"
        validate={validateName}
        maxLength={80}
        onSubmit={saveName}
      />
    </View>
  );
}

interface ChatRowProps {
  chat: WorkspaceDescriptor;
  busy: boolean;
  connected: boolean;
  archiving: boolean;
  onOpen: (chat: WorkspaceDescriptor) => void;
  onRename: (chat: WorkspaceDescriptor) => void;
  onArchive: (chat: WorkspaceDescriptor) => Promise<void>;
}
function ChatRow({ chat, busy, connected, archiving, onOpen, onRename, onArchive }: ChatRowProps) {
  const { t } = useTranslation();
  const open = useCallback(() => onOpen(chat), [chat, onOpen]);
  const rename = useCallback(() => onRename(chat), [chat, onRename]);
  const archive = useCallback(() => {
    void onArchive(chat);
  }, [chat, onArchive]);
  return (
    <View style={styles.row} testID={`chat-row-${chat.id}`}>
      <Button
        variant="ghost"
        style={styles.open}
        onPress={open}
        disabled={busy}
        testID={`chat-open-${chat.id}`}
      >
        <Text style={styles.text} numberOfLines={2}>
          {chat.name}
        </Text>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onPress={rename}
        disabled={busy || !connected}
        testID={`chat-rename-${chat.id}`}
      >
        {t("chats.rename")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onPress={archive}
        disabled={busy || !connected}
        testID={`chat-archive-${chat.id}`}
      >
        {t("chats.archive")}
      </Button>
      {archiving ? <ThemedLoadingSpinner uniProps={spinnerColor} /> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.surface0 },
  content: {
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    padding: theme.spacing[6],
    gap: theme.spacing[4],
  },
  title: {
    fontSize: theme.fontSize["2xl"],
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.normal,
  },
  section: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  text: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
  message: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.base },
  error: { color: theme.colors.destructive, fontSize: theme.fontSize.base },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
  open: { flex: 1, minWidth: 0, justifyContent: "flex-start" },
}));
