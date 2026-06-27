import { useMemo } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import { FOOTER_HEIGHT, MAX_CONTENT_WIDTH } from "@/constants/layout";
import { useKeyboardShiftStyle } from "@/hooks/use-keyboard-shift-style";
import type { Theme } from "@/styles/theme";

interface ObservedAgentReadOnlyBarProps {
  provider: AgentProvider | null;
}

// Read-only footer that replaces the composer for an observed provider-internal
// subagent (Claude Task / Codex sub-agent). The user can read the sub-agent's
// live conversation but never send or interrupt it — that is the provider's to
// orchestrate, and touching it would break its native mechanism.
export function ObservedAgentReadOnlyBar({ provider }: ObservedAgentReadOnlyBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { style: keyboardAnimatedStyle } = useKeyboardShiftStyle({ mode: "translate" });

  const containerStyle = useMemo(
    () => [styles.container, { paddingBottom: insets.bottom }, keyboardAnimatedStyle],
    [insets.bottom, keyboardAnimatedStyle],
  );

  const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "";

  return (
    <Animated.View style={containerStyle}>
      <View style={styles.inputAreaContainer}>
        <View style={styles.inputAreaContent}>
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              {t("agentPanel.observed.readOnly", { provider: providerLabel })}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  container: {
    flexDirection: "column",
    position: "relative",
  },
  inputAreaContainer: {
    position: "relative",
    minHeight: FOOTER_HEIGHT,
    marginHorizontal: "auto",
    alignItems: "center",
    width: "100%",
    overflow: "visible",
    padding: theme.spacing[4],
  },
  inputAreaContent: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.statusWarning,
    borderStyle: "dashed",
    borderRadius: theme.borderRadius["2xl"],
    paddingVertical: {
      xs: theme.spacing[3],
      md: theme.spacing[4],
    },
    paddingHorizontal: {
      xs: theme.spacing[4],
      md: theme.spacing[6],
    },
  },
  bannerText: {
    color: theme.colors.statusWarning,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
})) as unknown as Record<string, object>;
