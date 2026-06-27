import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { HostConfigRevision } from "@getpaseo/protocol/messages";
import { isNative } from "@/constants/platform";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/screens/settings/settings-section";
import { Button } from "@/components/ui/button";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { validateHostConfigText } from "@/providers/host-config-text";

// cfg1 配置文件(JSON)编辑器 —— 桌面 only(手机端不出原始 JSON 编辑)。
// 纯壳：客户端只做语法/结构校验(host-config-text)决定保存可用 + 错误定位；完整 schema 校验
// 与原子落盘是服务端权威(host.config.read/write)，乐观并发 revision/stale 由响应驱动。
export function HostConfigEditorSection({ serverId }: { serverId: string }) {
  // 桌面 only：原始配置文本编辑不在紧凑/原生端暴露。isNative 为常量，提前返回不破 hook 顺序。
  if (isNative) {
    return null;
  }
  return <HostConfigEditor serverId={serverId} />;
}

function HostConfigEditor({ serverId }: { serverId: string }) {
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const [text, setText] = useState<string | null>(null);
  const [loadedText, setLoadedText] = useState("");
  const [revision, setRevision] = useState<HostConfigRevision | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!client) return;
    const payload = await client.readHostConfig();
    if (payload.ok) {
      const next = payload.text ?? "";
      setText(next);
      setLoadedText(next);
      setRevision(payload.revision);
      setServerError(null);
    }
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!client) return;
      const payload = await client.readHostConfig();
      if (cancelled || !payload.ok) return;
      const next = payload.text ?? "";
      setText(next);
      setLoadedText(next);
      setRevision(payload.revision);
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const validation = useMemo(() => (text === null ? null : validateHostConfigText(text)), [text]);
  const dirty = text !== null && text !== loadedText;

  const handleFormat = useCallback(() => {
    if (text === null) return;
    try {
      setText(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      // 语法错时格式化按钮本就禁用，这里不应触达。
    }
  }, [text]);

  const handleRevert = useCallback(() => setText(loadedText), [loadedText]);

  const handleSave = useCallback(async () => {
    if (!client || text === null || validation?.status !== "valid") return;
    setSaving(true);
    setServerError(null);
    try {
      const payload = await client.writeHostConfig({ text, expectedRevision: revision });
      if (payload.ok) {
        setLoadedText(payload.text);
        setRevision(payload.revision);
      } else if (payload.error.code === "stale") {
        setServerError("配置已被外部修改，已重新加载磁盘版本");
        await reload();
      } else if (payload.error.code === "invalid") {
        setServerError(payload.error.message ?? "配置不符合 schema");
      } else {
        setServerError("写入失败");
      }
    } catch (error) {
      setServerError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [client, text, validation, revision, reload]);

  if (!isConnected) {
    return (
      <SettingsSection title="配置文件 (JSON)">
        <View style={noticeCardStyle}>
          <Text style={styles.noticeText}>主机离线，配置文件只读不可编辑</Text>
        </View>
      </SettingsSection>
    );
  }

  const badge = describeBadge(validation);

  return (
    <SettingsSection title="配置文件 (JSON)">
      <View style={settingsStyles.card}>
        <View style={styles.toolbar}>
          <View style={styles.badge}>
            <Text style={badge.textStyle}>{badge.label}</Text>
          </View>
          <View style={styles.toolbarActions}>
            <Button
              variant="ghost"
              size="sm"
              onPress={handleFormat}
              disabled={validation?.status !== "valid"}
            >
              格式化
            </Button>
            <Button variant="ghost" size="sm" onPress={handleRevert} disabled={!dirty}>
              恢复
            </Button>
            <Button
              variant="default"
              size="sm"
              onPress={handleSave}
              disabled={saving || !dirty || validation?.status !== "valid"}
            >
              {saving ? "保存中…" : "保存"}
            </Button>
          </View>
        </View>
        <TextInput
          style={styles.editor}
          value={text ?? ""}
          onChangeText={setText}
          editable={text !== null && !saving}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          placeholder="{ }"
        />
        {validation?.status === "invalid" && validation.error ? (
          <Text style={styles.errorLine}>{validation.error.message}</Text>
        ) : null}
        {serverError ? <Text style={styles.errorLine}>{serverError}</Text> : null}
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  notice: { padding: theme.spacing[4], alignItems: "center" },
  noticeText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  toolbarActions: { flexDirection: "row", alignItems: "center", gap: theme.spacing[1] },
  badge: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
  },
  badgeText: { fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold },
  badgeOk: { color: theme.colors.statusSuccess },
  badgeBad: { color: theme.colors.statusDanger },
  badgeMuted: { color: theme.colors.foregroundMuted },
  editor: {
    minHeight: 320,
    padding: theme.spacing[3],
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    color: theme.colors.foreground,
    textAlignVertical: "top",
  },
  errorLine: {
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[2],
    fontSize: theme.fontSize.xs,
    color: theme.colors.destructive,
    fontFamily: theme.fontFamily.mono,
  },
}));

const noticeCardStyle = [settingsStyles.card, styles.notice];
const badgeTextOk = [styles.badgeText, styles.badgeOk];
const badgeTextBad = [styles.badgeText, styles.badgeBad];
const badgeTextMuted = [styles.badgeText, styles.badgeMuted];

// 校验态 → badge 文案 + 文本样式(早返回，避免嵌套三元)。
function describeBadge(validation: ReturnType<typeof validateHostConfigText> | null) {
  if (validation === null) {
    return { label: "加载中…", textStyle: badgeTextMuted };
  }
  if (validation.status === "valid") {
    return { label: "有效", textStyle: badgeTextOk };
  }
  const label = validation.error?.line ? `无效 · 第 ${validation.error.line} 行` : "无效";
  return { label, textStyle: badgeTextBad };
}
