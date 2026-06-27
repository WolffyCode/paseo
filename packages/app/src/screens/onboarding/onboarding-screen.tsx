import { useRouter } from "expo-router";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { ScrollView, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddHostModal } from "@/components/add-host-modal";
import { PairLinkModal } from "@/components/pair-link-modal";
import {
  getHostRuntimeStore,
  hasConfiguredLocalDaemonOverride,
  useHosts,
} from "@/runtime/host-runtime";
import { useHostRuntimeBootstrapState } from "@/app/_layout";
import {
  resolveOnboardingPlatformCapability,
  resolveOnboardingLocalConnectState,
  resolveOnboardingPhase,
} from "@/app/host-runtime-bootstrap";
import { shouldUseDesktopDaemon } from "@/desktop/daemon/desktop-daemon";
import { formatVersionWithPrefix } from "@/desktop/updates/desktop-updates";
import { useOnboardingStore, useOnboardingStoreHydrated } from "@/stores/onboarding-store";
import { resolveAppVersion } from "@/utils/app-version";
import { codePilotLight } from "@/styles/codepilot-theme";
import { ConnectingStage } from "./connecting-stage";
import { ErrorStage } from "./error-stage";
import { MethodPickerStage } from "./method-picker-stage";
import { WelcomeStage } from "./welcome-stage";

// Renders onboarding from persisted welcome state and host-runtime snapshots while delegating home routing.
export function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bootstrapState = useHostRuntimeBootstrapState();
  const hosts = useHosts();
  const hasSeenWelcome = useOnboardingStore((state) => state.hasSeenWelcome);
  const markWelcomeSeen = useOnboardingStore((state) => state.markWelcomeSeen);
  const isOnboardingStoreHydrated = useOnboardingStoreHydrated();
  useHostRuntimeRevision();
  const store = getHostRuntimeStore();
  const hostSnapshots = hosts.flatMap((host) => {
    const snapshot = store.getSnapshot(host.serverId);
    return snapshot
      ? [
          {
            connectionStatus: snapshot.connectionStatus,
            lastError: snapshot.lastError,
          },
        ]
      : [];
  });
  const localConnect = resolveOnboardingLocalConnectState({
    hostSnapshots,
    splashError: bootstrapState.splashError,
    startupBlockerKind: bootstrapState.startupBlocker.kind,
    hasGivenUpWaitingForHost: bootstrapState.hasGivenUpWaitingForHost,
  });
  const isDesktopLocalRuntime = shouldUseDesktopDaemon();
  const platformCapability = resolveOnboardingPlatformCapability({
    isDesktopLocalRuntime,
    hasLocalDaemonCandidate: !isDesktopLocalRuntime || hasConfiguredLocalDaemonOverride(),
  });
  const [userRequestedRemote, setUserRequestedRemote] = useState(false);
  const [isDirectOpen, setIsDirectOpen] = useState(false);
  const [isPairLinkOpen, setIsPairLinkOpen] = useState(false);

  const phase = resolveOnboardingPhase({
    hasSeenWelcome,
    platformCapability,
    localConnect,
    userRequestedRemote,
  });
  const appVersionText = formatVersionWithPrefix(resolveAppVersion());

  const contentContainerStyle = useMemo(
    () => [styles.scrollContent, { paddingBottom: 24 + insets.bottom }],
    [insets.bottom],
  );

  const startLocal = useCallback(() => {
    setUserRequestedRemote(false);
    markWelcomeSeen();
    bootstrapState.connectLocal();
  }, [bootstrapState, markWelcomeSeen]);

  const chooseRemote = useCallback(() => {
    markWelcomeSeen();
    setUserRequestedRemote(true);
  }, [markWelcomeSeen]);

  const retryLocal = useCallback(() => {
    setUserRequestedRemote(false);
    bootstrapState.connectLocal();
  }, [bootstrapState]);

  const openDirect = useCallback(() => setIsDirectOpen(true), []);
  const closeDirect = useCallback(() => setIsDirectOpen(false), []);
  const openPairLink = useCallback(() => setIsPairLinkOpen(true), []);
  const closePairLink = useCallback(() => setIsPairLinkOpen(false), []);
  const scanQr = useCallback(() => {
    router.push("/pair-scan?source=onboarding");
  }, [router]);
  const openDiagnostics = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const hostSaved = useCallback(() => {
    closeDirect();
    closePairLink();
  }, [closeDirect, closePairLink]);

  if (!isOnboardingStoreHydrated) {
    return null;
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
      >
        {phase.kind === "welcome" ? (
          <WelcomeStage
            versionLabel={appVersionText}
            onStart={startLocal}
            onConnectRemote={chooseRemote}
          />
        ) : null}
        {phase.kind === "connecting" ? <ConnectingStage onCancel={chooseRemote} /> : null}
        {phase.kind === "picker" ? (
          <MethodPickerStage
            versionLabel={appVersionText}
            canRetryLocal={platformCapability.kind !== "remote-only"}
            onOpenDirect={openDirect}
            onOpenPairLink={openPairLink}
            onScanQr={scanQr}
            onRetryLocal={retryLocal}
          />
        ) : null}
        {phase.kind === "error" ? (
          <ErrorStage
            reason={phase.reason}
            onRetry={retryLocal}
            onUseOtherMethods={chooseRemote}
            onOpenDiagnostics={openDiagnostics}
          />
        ) : null}
      </ScrollView>
      <AddHostModal visible={isDirectOpen} onClose={closeDirect} onSaved={hostSaved} />
      <PairLinkModal visible={isPairLinkOpen} onClose={closePairLink} onSaved={hostSaved} />
    </View>
  );
}

// Subscribes onboarding to host-runtime snapshot revisions without copying runtime state into UI state.
function useHostRuntimeRevision(): number {
  const store = getHostRuntimeStore();
  return useSyncExternalStore(
    (listener) => store.subscribeAll(listener),
    () => store.getVersion(),
    () => store.getVersion(),
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: codePilotLight.canvas,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: "100%",
  },
});
