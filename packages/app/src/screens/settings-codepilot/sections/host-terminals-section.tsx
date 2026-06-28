// Terminals (host section) — rebuilt on the codePilot settings kit. Pure re-skin: every
// piece of data wiring (host lookup, connection gate, daemon-config terminal-agent-hooks
// toggle, the resolveTerminalProfiles list with add / edit / remove / reorder mutations,
// and the standalone TerminalProfileEditModal) is reused unchanged from the legacy
// HostTerminalsPage; only the presentation moves onto SettingsDetail / SettingsGroup /
// SettingsCard / SettingsRow / SettingsToggle / SettingsEmpty.
import { useCallback, useMemo, useState, type ComponentType } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { ArrowDown, ArrowUp, Pencil, Plus, SquareTerminal, Trash2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { TerminalProfile } from "@getpaseo/protocol/messages";
import {
  getTerminalProfileIcon,
  resolveTerminalProfiles,
} from "@getpaseo/protocol/terminal-profiles";
import { getProviderIcon } from "@/components/provider-icons";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useHostRuntimeIsConnected, useHosts } from "@/runtime/host-runtime";
import {
  TerminalProfileEditModal,
  type ProfileDraft,
} from "@/screens/settings/terminal-profile-edit-modal";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  SettingsButton,
  SettingsCard,
  SettingsDetail,
  SettingsEmpty,
  SettingsGroup,
  SettingsRow,
  SettingsToggle,
} from "../primitives";
import { settingsKit } from "../styles";

type IconType = ComponentType<{ size?: number; color?: string }>;

const SUBTITLE =
  "管理这台主机的终端 Agent 钩子，以及启动新终端时可用的命令 Profile（按顺序排列，可调整顺序、编辑或删除）。";

// A draft for a brand-new profile — every field blank so the add modal opens empty.
const EMPTY_PROFILE_DRAFT: ProfileDraft = { name: "", command: "", args: "" };

// Mint a collision-resistant local id for a freshly added profile (time + random suffix),
// matching the legacy page so saved profiles keep stable identities across reorders.
function generateProfileId(): string {
  return `profile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

// Split the modal's raw arguments string into argv tokens, collapsing runs of whitespace;
// an empty/whitespace string yields undefined so we never persist an empty args array.
function parseArgsString(raw: string): string[] | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Section shell: renders the detail header, then defers the body to a connection-gated child so
// the title/subtitle stay visible even when the host is offline or unknown.
export function HostTerminalsSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  return (
    <SettingsDetail title={t("settings.hostSections.terminals")} subtitle={SUBTITLE}>
      <TerminalsBody serverId={serverId} />
    </SettingsDetail>
  );
}

// Body gate: mirrors the legacy page's three states — unknown host, disconnected host, and the
// connected host's terminal settings (hooks toggle + profiles list). The two unavailable states
// reuse the kit's dashed empty box.
function TerminalsBody({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const hosts = useHosts();
  const isConnected = useHostRuntimeIsConnected(serverId);
  const host = hosts.find((entry) => entry.serverId === serverId) ?? null;

  if (!host) {
    return <SettingsEmpty message={t("settings.host.notFound")} />;
  }
  if (!isConnected) {
    return <SettingsEmpty message={t("settings.host.terminalProfiles.unavailable")} />;
  }
  return (
    <>
      <TerminalAgentHooksGroup serverId={serverId} />
      <TerminalProfilesGroup serverId={serverId} />
    </>
  );
}

// The terminal-agent-hooks toggle. Reads/writes the host's daemon config through the same
// useDaemonConfig hook the legacy card used; a failed patch surfaces an Alert.
function TerminalAgentHooksGroup({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { config, patchConfig } = useDaemonConfig(serverId);
  const value = config?.enableTerminalAgentHooks === true;

  const handleChange = useCallback(
    (next: boolean) => {
      void patchConfig({ enableTerminalAgentHooks: next }).catch((error) => {
        console.error("[HostTerminalsSection] Failed to update terminal agent hooks", error);
        Alert.alert(
          t("common.errors.unableToSave"),
          error instanceof Error ? error.message : String(error),
        );
      });
    },
    [patchConfig, t],
  );

  return (
    <SettingsGroup title="终端 Agent">
      <SettingsCard>
        <SettingsRow
          label="启用终端 Agent 钩子"
          description="从终端 Agent 获取通知与状态。这会在你的 Agent 配置文件里安装钩子。"
        >
          <SettingsToggle value={value} onChange={handleChange} />
        </SettingsRow>
      </SettingsCard>
    </SettingsGroup>
  );
}

// The terminal-profiles list. Owns the full mutation surface — add / edit (both via the
// standalone TerminalProfileEditModal), remove (confirm → filter) and reorder (move up/down) —
// all persisting through patchConfig({ terminalProfiles }) exactly like the legacy section.
function TerminalProfilesGroup({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { config, patchConfig } = useDaemonConfig(serverId);
  const [editingProfile, setEditingProfile] = useState<{ id: string; draft: ProfileDraft } | null>(
    null,
  );
  const [isAdding, setIsAdding] = useState(false);

  const profiles = useMemo(
    () => (config ? resolveTerminalProfiles(config.terminalProfiles) : null),
    [config],
  );

  const saveProfiles = useCallback(
    async (next: TerminalProfile[]) => {
      await patchConfig({ terminalProfiles: next });
    },
    [patchConfig],
  );

  const handleAddOpen = useCallback(() => setIsAdding(true), []);
  const handleAddClose = useCallback(() => setIsAdding(false), []);
  const handleAddSave = useCallback(
    async (draft: ProfileDraft) => {
      const current = profiles ? [...profiles] : [];
      const next: TerminalProfile[] = [
        ...current,
        {
          id: generateProfileId(),
          name: draft.name,
          command: draft.command,
          args: parseArgsString(draft.args),
        },
      ];
      await saveProfiles(next);
      setIsAdding(false);
    },
    [profiles, saveProfiles],
  );

  const handleEditOpen = useCallback(
    (id: string) => {
      const profile = profiles?.find((p) => p.id === id);
      if (!profile) return;
      setEditingProfile({
        id,
        draft: {
          name: profile.name,
          command: profile.command,
          args: profile.args ? profile.args.join(" ") : "",
        },
      });
    },
    [profiles],
  );
  const handleEditClose = useCallback(() => setEditingProfile(null), []);
  const handleEditSave = useCallback(
    async (draft: ProfileDraft) => {
      if (!editingProfile || !profiles) return;
      const next: TerminalProfile[] = profiles.map((p) =>
        p.id === editingProfile.id
          ? { ...p, name: draft.name, command: draft.command, args: parseArgsString(draft.args) }
          : p,
      );
      await saveProfiles(next);
      setEditingProfile(null);
    },
    [editingProfile, profiles, saveProfiles],
  );

  const handleRemove = useCallback(
    (id: string) => {
      const profile = profiles?.find((p) => p.id === id);
      if (!profile) return;
      void confirmDialog({
        title: t("settings.host.terminalProfiles.removeConfirmTitle"),
        message: t("settings.host.terminalProfiles.removeConfirmMessage", { name: profile.name }),
        confirmLabel: t("settings.host.terminalProfiles.remove"),
        cancelLabel: t("common.actions.cancel"),
        destructive: true,
      }).then(async (confirmed) => {
        if (!confirmed || !profiles) return;
        try {
          await saveProfiles(profiles.filter((p) => p.id !== id));
        } catch (error) {
          Alert.alert(
            t("common.errors.unableToSave"),
            error instanceof Error ? error.message : String(error),
          );
        }
        return;
      });
    },
    [profiles, saveProfiles, t],
  );

  const handleMoveUp = useCallback(
    async (id: string) => {
      if (!profiles) return;
      const index = profiles.findIndex((p) => p.id === id);
      if (index <= 0) return;
      const next = [...profiles];
      const [item] = next.splice(index, 1);
      next.splice(index - 1, 0, item);
      try {
        await saveProfiles(next);
      } catch (error) {
        Alert.alert(
          t("common.errors.unableToSave"),
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [profiles, saveProfiles, t],
  );

  const handleMoveDown = useCallback(
    async (id: string) => {
      if (!profiles) return;
      const index = profiles.findIndex((p) => p.id === id);
      if (index < 0 || index >= profiles.length - 1) return;
      const next = [...profiles];
      const [item] = next.splice(index, 1);
      next.splice(index + 1, 0, item);
      try {
        await saveProfiles(next);
      } catch (error) {
        Alert.alert(
          t("common.errors.unableToSave"),
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [profiles, saveProfiles, t],
  );

  const addButton = useMemo(
    () => (
      <SettingsButton
        label="新增"
        icon={Plus}
        variant="primary"
        small
        onPress={handleAddOpen}
        disabled={!profiles}
      />
    ),
    [handleAddOpen, profiles],
  );

  return (
    <SettingsGroup title={t("settings.host.terminalProfiles.sectionTitle")} action={addButton}>
      {profiles && profiles.length > 0 ? (
        <SettingsCard>
          {profiles.map((profile, index) => (
            <TerminalProfileRow
              key={profile.id}
              profile={profile}
              divider={index > 0}
              isFirst={index === 0}
              isLast={index === profiles.length - 1}
              onEdit={handleEditOpen}
              onRemove={handleRemove}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
            />
          ))}
        </SettingsCard>
      ) : (
        <SettingsEmpty message={t("settings.host.terminalProfiles.emptyState")} />
      )}

      <TerminalProfileEditModal
        visible={isAdding}
        title={t("settings.host.terminalProfiles.addProfileTitle")}
        initialDraft={EMPTY_PROFILE_DRAFT}
        onClose={handleAddClose}
        onSave={handleAddSave}
        testID="terminal-profile-edit-modal"
      />

      {editingProfile ? (
        <TerminalProfileEditModal
          visible
          title={t("settings.host.terminalProfiles.editProfileTitle")}
          initialDraft={editingProfile.draft}
          onClose={handleEditClose}
          onSave={handleEditSave}
        />
      ) : null}
    </SettingsGroup>
  );
}

// One profile row: provider/terminal icon + name + command(args) on the left, the reorder /
// edit / remove icon actions on the right. Derives every visual from props so the list item
// never builds fresh objects in JSX.
function TerminalProfileRow({
  profile,
  divider,
  isFirst,
  isLast,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  profile: TerminalProfile;
  divider: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();

  const handleEdit = useCallback(() => onEdit(profile.id), [onEdit, profile.id]);
  const handleRemove = useCallback(() => onRemove(profile.id), [onRemove, profile.id]);
  const handleMoveUp = useCallback(() => onMoveUp(profile.id), [onMoveUp, profile.id]);
  const handleMoveDown = useCallback(() => onMoveDown(profile.id), [onMoveDown, profile.id]);

  const commandText =
    profile.args && profile.args.length > 0
      ? `${profile.command} ${profile.args.join(" ")}`
      : profile.command;

  const rowStyle = useMemo(
    () => (divider ? [terminalStyles.row, terminalStyles.rowDivider] : terminalStyles.row),
    [divider],
  );
  const iconKey = getTerminalProfileIcon(profile);

  return (
    <View style={rowStyle} testID={`terminal-profile-row-${profile.id}`}>
      <View style={terminalStyles.profileIcon}>
        <ProfileIcon
          iconKey={iconKey}
          size={theme.iconSize.md}
          color={theme.colors.foregroundMuted}
        />
      </View>
      <View style={terminalStyles.profileMain}>
        <Text style={settingsKit.rowLabelText} numberOfLines={1}>
          {profile.name}
        </Text>
        <Text style={settingsKit.rowDesc} numberOfLines={1}>
          {commandText}
        </Text>
      </View>
      <View style={terminalStyles.profileActions}>
        <RowIconButton
          icon={ArrowUp}
          accessibilityLabel={t("settings.host.terminalProfiles.moveUp")}
          onPress={handleMoveUp}
          disabled={isFirst}
          testID={`terminal-profile-move-up-${profile.id}`}
        />
        <RowIconButton
          icon={ArrowDown}
          accessibilityLabel={t("settings.host.terminalProfiles.moveDown")}
          onPress={handleMoveDown}
          disabled={isLast}
          testID={`terminal-profile-move-down-${profile.id}`}
        />
        <RowIconButton
          icon={Pencil}
          accessibilityLabel={t("settings.host.terminalProfiles.editProfile")}
          onPress={handleEdit}
          testID={`terminal-profile-edit-${profile.id}`}
        />
        <RowIconButton
          icon={Trash2}
          accessibilityLabel={t("settings.host.terminalProfiles.remove")}
          onPress={handleRemove}
          danger
          testID={`terminal-profile-remove-${profile.id}`}
        />
      </View>
    </View>
  );
}

// A compact icon-only ghost action button for a profile row. `danger` tints the glyph with the
// destructive token; `disabled` dims it. Stateless — the row owns the press.
function RowIconButton({
  icon: Icon,
  accessibilityLabel,
  onPress,
  disabled,
  danger,
  testID,
}: {
  icon: IconType;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const a11yState = useMemo(() => ({ disabled: disabled ?? false }), [disabled]);
  const style = useMemo(
    () =>
      disabled
        ? [terminalStyles.iconButton, terminalStyles.iconButtonDisabled]
        : terminalStyles.iconButton,
    [disabled],
  );
  const color = danger ? theme.colors.destructive : theme.colors.foregroundMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={a11yState}
      disabled={disabled}
      onPress={onPress}
      style={style}
      testID={testID}
    >
      <Icon size={theme.iconSize.sm} color={color} />
    </Pressable>
  );
}

// The leading glyph for a profile — the well-known provider icon when one is resolvable, else a
// generic terminal mark.
function ProfileIcon({
  iconKey,
  size,
  color,
}: {
  iconKey: string | undefined;
  size: number;
  color: string;
}) {
  if (!iconKey) {
    return <SquareTerminal size={size} color={color} />;
  }
  const Icon = getProviderIcon(iconKey);
  return <Icon size={size} color={color} />;
}

const terminalStyles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    minHeight: 56,
  },
  rowDivider: {
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  profileIcon: {
    width: theme.iconSize.md,
    alignItems: "center",
    justifyContent: "center",
  },
  profileMain: {
    flex: 1,
    minWidth: 0,
  },
  profileActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 0,
  },
  iconButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  iconButtonDisabled: {
    opacity: 0.4,
  },
}));
