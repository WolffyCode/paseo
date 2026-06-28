// Diagnostics — re-skin of the legacy diagnostics section onto the codePilot kit. The
// data wiring is reused unchanged: the speaker self-test drives the voice AudioEngine, and
// (desktop only) the managed-daemon runtime/logs come from the daemon-status query with a
// copy-to-clipboard action. Only the presentation moves to the kit; logic stays in hooks.
import { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";
import { Buffer } from "buffer";
import * as Clipboard from "expo-clipboard";
import { Copy, Download, Volume2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { getIsElectron } from "@/constants/platform";
import { useVoiceAudioEngineOptional } from "@/contexts/voice-context";
import type { DesktopDaemonState } from "@/desktop/daemon/desktop-daemon";
import { useDaemonStatus } from "@/desktop/hooks/use-daemon-status";
import { THINKING_TONE_NATIVE_PCM_BASE64 } from "@/utils/thinking-tone.native-pcm";
import {
  SettingsBadge,
  SettingsButton,
  SettingsCard,
  SettingsDetail,
  SettingsGroup,
  SettingsRow,
  SettingsStatusDot,
  SettingsValue,
} from "../primitives";

// Daemon-state → human label / status dot / value tone, hoisted so the runtime rows pick a
// presentation without an inline branch per render.
const DAEMON_STATE_LABEL: Record<DesktopDaemonState, string> = {
  starting: "正在启动",
  running: "运行中",
  stopped: "已停止",
  errored: "异常",
};
const DAEMON_DOT: Record<DesktopDaemonState, "on" | "off" | "idle"> = {
  starting: "idle",
  running: "on",
  stopped: "off",
  errored: "off",
};
const DAEMON_TONE: Record<DesktopDaemonState, "default" | "strong" | "warn" | "danger"> = {
  starting: "warn",
  running: "strong",
  stopped: "default",
  errored: "danger",
};

// Section root: the audio self-test is shown everywhere; the daemon runtime/logs group only
// renders inside the desktop wrapper, where a managed daemon actually exists.
export function DiagnosticsSection() {
  const { t } = useTranslation();
  const isDesktop = getIsElectron();
  return (
    <SettingsDetail
      title={t("settings.sections.diagnostics")}
      subtitle="运行内置自检，并查看本机守护进程的运行环境与日志，便于排查连接、音频或同步问题。"
    >
      <AudioTestGroup />
      {isDesktop ? <DesktopDiagnostics /> : null}
    </SettingsDetail>
  );
}

// Speaker self-test — plays the built-in thinking tone through the voice AudioEngine. The
// button is disabled until an engine is available or while a play is in flight; failures
// surface inline as the row description. Playback wiring is copied from the legacy section.
function AudioTestGroup() {
  const { t } = useTranslation();
  const audioEngine = useVoiceAudioEngineOptional();
  const [isRunning, setIsRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const handlePlay = useCallback(() => {
    if (!audioEngine || isRunning) {
      return;
    }
    setIsRunning(true);
    setFailure(null);
    void (async () => {
      try {
        const bytes = Buffer.from(THINKING_TONE_NATIVE_PCM_BASE64, "base64");
        await audioEngine.initialize();
        audioEngine.stop();
        await audioEngine.play({
          type: "audio/pcm;rate=16000;bits=16",
          size: bytes.byteLength,
          async arrayBuffer() {
            return Uint8Array.from(bytes).buffer;
          },
        });
        setFailure(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[Settings] Playback test failed", error);
        setFailure(t("settings.diagnostics.playbackFailed", { message }));
      } finally {
        setIsRunning(false);
      }
    })();
  }, [audioEngine, isRunning, t]);

  const description = failure ?? "播放测试音频，确认设备扬声器输出正常。";
  let buttonLabel = t("settings.diagnostics.playTest");
  if (isRunning) {
    buttonLabel = t("settings.diagnostics.playing");
  }

  return (
    <SettingsGroup title={t("settings.diagnostics.title")}>
      <SettingsCard>
        <SettingsRow label={t("settings.diagnostics.testAudio")} description={description}>
          <SettingsButton
            label={buttonLabel}
            icon={Volume2}
            variant="outline"
            small
            onPress={handlePlay}
            disabled={!audioEngine || isRunning}
          />
        </SettingsRow>
      </SettingsCard>
    </SettingsGroup>
  );
}

// Desktop-only diagnostics: the managed daemon's runtime (state / version / data home) and
// its log file. Reads the shared daemon-status query once and feeds both groups; missing
// data degrades to "—" / an unavailable label rather than hiding rows.
function DesktopDiagnostics() {
  const { t } = useTranslation();
  const { data } = useDaemonStatus();
  const daemon = data?.status ?? null;
  const logPath = data?.logs.logPath || null;

  const handleCopyLogPath = useCallback(() => {
    if (!logPath) {
      return;
    }
    void Clipboard.setStringAsync(logPath)
      .then(() => {
        Alert.alert(t("common.states.copied"), t("desktop.daemon.logs.copied"));
        return;
      })
      .catch((error: unknown) => {
        console.error("[Settings] Failed to copy log path", error);
        Alert.alert(t("common.errors.error"), t("desktop.daemon.logs.copyFailed"));
      });
  }, [logPath, t]);

  // TODO(diagnostics-export): there is no export-diagnostics bridge yet; the button stays
  // disabled until the desktop wrapper exposes a "collect env + logs into a bundle" command.
  const handleExport = useCallback(() => {}, []);

  const comingSoonBadge = useMemo(() => <SettingsBadge label="即将推出" />, []);

  let dotStatus: "on" | "off" | "idle" = "idle";
  let stateLabel = "—";
  let stateTone: "default" | "strong" | "warn" | "danger" = "default";
  if (daemon) {
    dotStatus = DAEMON_DOT[daemon.status];
    stateLabel = DAEMON_STATE_LABEL[daemon.status];
    stateTone = DAEMON_TONE[daemon.status];
  }
  const versionText = daemon?.version ?? "—";
  const homeText = daemon?.home || "—";
  const logDescription = logPath ?? t("desktop.daemon.logs.unavailable");

  return (
    <>
      <SettingsGroup title="运行环境">
        <SettingsCard>
          <SettingsRow label="守护进程状态">
            <SettingsStatusDot status={dotStatus} />
            <SettingsValue value={stateLabel} tone={stateTone} />
          </SettingsRow>
          <SettingsRow label="守护进程版本" divider>
            <SettingsValue value={versionText} />
          </SettingsRow>
          <SettingsRow label="数据目录" description={homeText} divider />
        </SettingsCard>
      </SettingsGroup>

      <SettingsGroup title="日志与诊断">
        <SettingsCard>
          <SettingsRow label={t("desktop.daemon.logs.title")} description={logDescription}>
            <SettingsButton
              label={t("desktop.daemon.logs.copyPath")}
              icon={Copy}
              variant="outline"
              small
              onPress={handleCopyLogPath}
              disabled={!logPath}
            />
          </SettingsRow>
          <SettingsRow
            label="导出诊断"
            description="收集运行环境与日志，导出为可分享的诊断包。"
            badge={comingSoonBadge}
            divider
          >
            <SettingsButton
              label="导出"
              icon={Download}
              variant="outline"
              small
              onPress={handleExport}
              disabled
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsGroup>
    </>
  );
}
