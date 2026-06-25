import { useCallback, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { AddHostModal } from "@/components/add-host-modal";
import { PairLinkModal } from "@/components/pair-link-modal";
import { isNative, isWeb } from "@/constants/platform";
import { formatVersionWithPrefix } from "@/desktop/updates/desktop-updates";
import { resolveAppVersion } from "@/utils/app-version";
import { openExternalUrl } from "@/utils/open-external-url";
import { buildHostRootRoute } from "@/utils/host-routes";
import {
  resolveOnboardingPhase,
  type OnboardingPhase,
  type StartupBlocker,
  type StartupRegistryStatus,
} from "@/app/host-runtime-bootstrap";
import { useEarliestOnlineHostServerId, useHostRuntimeBootstrapState } from "@/app/_layout";
import { useHostRegistryStatus, useHosts } from "@/runtime/host-runtime";
import { useOnboardingStore } from "@/stores/onboarding-store";
import type { HostProfile } from "@/types/host-connection";
import { OnboardingConnectingView } from "./connecting-view";
import { OnboardingErrorView } from "./error-view";
import { OnboardingHostPickerView } from "./picker-view";
import { OnboardingWelcomeView } from "./welcome-view";

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  scrollView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: theme.spacing[6],
  },
  surface: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    gap: theme.spacing[6],
  },
  versionLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textAlign: "center",
    marginTop: theme.spacing[6],
  },
}));

interface OnboardingScreenState {
  phase: OnboardingPhase;
  hosts: HostProfile[];
  anyOnlineHostServerId: string | null;
  hostRegistryStatus: StartupRegistryStatus;
  startupBlocker: StartupBlocker;
}

/** Contract: Own onboarding-only state wiring and render the phase-specific pure view at /welcome. */
export function OnboardingScreen() {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const appVersionText = formatVersionWithPrefix(resolveAppVersion());
  const hosts = useHosts();
  const hostRegistryStatus = useHostRegistryStatus();
  const anyOnlineHostServerId = useEarliestOnlineHostServerId();
  const bootstrapState = useHostRuntimeBootstrapState();
  const hasSeenWelcome = useOnboardingStore((state) => state.hasSeenWelcome);
  const markWelcomeSeen = useOnboardingStore((state) => state.markWelcomeSeen);
  const [isDirectOpen, setIsDirectOpen] = useState(false);
  const [isPasteLinkOpen, setIsPasteLinkOpen] = useState(false);

  const state = useMemo<OnboardingScreenState>(
    () => ({
      phase: resolveOnboardingPhase({
        hasSeenWelcome,
        hosts,
        anyOnlineHostServerId,
        hostRegistryStatus,
        startupBlocker: bootstrapState.startupBlocker,
        hasGivenUpWaitingForHost: bootstrapState.hasGivenUpWaitingForHost,
      }),
      hosts,
      anyOnlineHostServerId,
      hostRegistryStatus,
      startupBlocker: bootstrapState.startupBlocker,
    }),
    [
      anyOnlineHostServerId,
      bootstrapState.hasGivenUpWaitingForHost,
      bootstrapState.startupBlocker,
      hasSeenWelcome,
      hostRegistryStatus,
      hosts,
    ],
  );
  const scrollContentContainerStyle = useMemo(
    () => [styles.container, { paddingBottom: theme.spacing[6] + insets.bottom }],
    [insets.bottom, theme.spacing],
  );

  const openDirect = useCallback(() => setIsDirectOpen(true), []);
  const closeDirect = useCallback(() => setIsDirectOpen(false), []);
  const openPasteLink = useCallback(() => setIsPasteLinkOpen(true), []);
  const closePasteLink = useCallback(() => setIsPasteLinkOpen(false), []);
  const openWebsite = useCallback(() => {
    void openExternalUrl("https://paseo.sh");
  }, []);
  const openSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);
  const openScan = useCallback(() => {
    router.push("/pair-scan?source=onboarding");
  }, [router]);
  const handleRetry = useCallback(() => {
    bootstrapState.retry();
  }, [bootstrapState]);
  const handleContinueFromWelcome = useCallback(() => {
    markWelcomeSeen();
  }, [markWelcomeSeen]);
  const handleOpenHost = useCallback(
    (serverId: string) => {
      router.replace(buildHostRootRoute(serverId));
    },
    [router],
  );
  const handleHostSaved = useCallback(
    ({ serverId }: { profile: HostProfile; serverId: string }) => {
      markWelcomeSeen();
      handleOpenHost(serverId);
    },
    [handleOpenHost, markWelcomeSeen],
  );

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={scrollContentContainerStyle}
        showsVerticalScrollIndicator={false}
        testID="onboarding-screen"
      >
        <View style={styles.surface}>
          {renderPhaseView({
            phase: state.phase,
            hosts: state.hosts,
            anyOnlineHostServerId: state.anyOnlineHostServerId,
            hostRegistryStatus: state.hostRegistryStatus,
            startupBlocker: state.startupBlocker,
            onContinue: handleContinueFromWelcome,
            onOpenDirect: openDirect,
            onOpenPasteLink: openPasteLink,
            onOpenScan: openScan,
            onOpenSettings: openSettings,
            onOpenWebsite: openWebsite,
            onRetry: handleRetry,
            onOpenHost: handleOpenHost,
            connectingStatusLabel: t("onboarding.status.connecting"),
          })}
          <Text style={styles.versionLabel}>{appVersionText}</Text>
        </View>

        <AddHostModal visible={isDirectOpen} onClose={closeDirect} onSaved={handleHostSaved} />
        <PairLinkModal
          visible={isPasteLinkOpen}
          onClose={closePasteLink}
          onSaved={handleHostSaved}
        />
      </ScrollView>
    </View>
  );
}

interface RenderPhaseViewInput {
  phase: OnboardingPhase;
  hosts: HostProfile[];
  anyOnlineHostServerId: string | null;
  hostRegistryStatus: StartupRegistryStatus;
  startupBlocker: StartupBlocker;
  onContinue: () => void;
  onOpenDirect: () => void;
  onOpenPasteLink: () => void;
  onOpenScan: () => void;
  onOpenSettings: () => void;
  onOpenWebsite: () => void;
  onRetry: () => void;
  onOpenHost: (serverId: string) => void;
  connectingStatusLabel: string;
}

/** Contract: Keep onboarding phase-to-view mapping declarative and side-effect free. */
function renderPhaseView(input: RenderPhaseViewInput) {
  if (input.phase === "welcome") {
    return (
      <OnboardingWelcomeView
        showScanAction={!isWeb}
        showWebsiteLink={isNative}
        onContinue={input.onContinue}
        onOpenDirect={input.onOpenDirect}
        onOpenPasteLink={input.onOpenPasteLink}
        onOpenScan={input.onOpenScan}
        onOpenSettings={input.onOpenSettings}
        onOpenWebsite={input.onOpenWebsite}
      />
    );
  }

  if (input.phase === "picker") {
    return (
      <OnboardingHostPickerView
        hosts={input.hosts}
        showScanAction={!isWeb}
        onOpenHost={input.onOpenHost}
        onOpenDirect={input.onOpenDirect}
        onOpenPasteLink={input.onOpenPasteLink}
        onOpenScan={input.onOpenScan}
      />
    );
  }

  if (input.phase === "error") {
    return (
      <OnboardingErrorView
        message={
          input.startupBlocker.kind === "managed-daemon-error" ? input.startupBlocker.message : null
        }
        showScanAction={!isWeb}
        onRetry={input.onRetry}
        onOpenDirect={input.onOpenDirect}
        onOpenPasteLink={input.onOpenPasteLink}
        onOpenScan={input.onOpenScan}
      />
    );
  }

  return (
    <OnboardingConnectingView
      anyOnlineHostServerId={input.anyOnlineHostServerId}
      hostRegistryStatus={input.hostRegistryStatus}
      startupBlocker={input.startupBlocker}
      statusLabel={input.connectingStatusLabel}
    />
  );
}
