import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { PRODUCT_NAME } from "@/constants/product";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { WebUiProductLogo } from "@/desktop/browser/webui/icons";
import { WEBUI_LAYOUT } from "@/desktop/browser/webui/theme";
import { resolveAppVersion } from "@/utils/app-version";
import { SettingsSection } from "./settings-section";
import { settingsSectionLabel } from "./titles";

// settings-about-page: a 32 dip logo 10 dip before a 20 px product name, rows 64 tall, and the
// text of the version row lined up under the name.
const LOGO_SIZE = 32;
const LOGO_GAP = 10;
const PRODUCT_TITLE_SIZE = 20;
const TWO_LINE_ROW_MIN_HEIGHT = 64;
// Helm's own pages run in Electron's Chromium, whose user agent names its version; the browser
// pages get Chrome's instead.
const CHROMIUM_VERSION = /Chrome\/([\d.]+)/;

function chromiumVersion(): string {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return CHROMIUM_VERSION.exec(userAgent)?.[1] ?? "";
}

/** The CPU architecture Chrome puts after its version, as arm64 or x86_64. */
function useArchitecture(): string | null {
  const [architecture, setArchitecture] = useState<string | null>(null);
  useEffect(() => {
    let isCurrent = true;
    const userAgentData = (
      navigator as Navigator & {
        userAgentData?: {
          getHighEntropyValues: (
            hints: string[],
          ) => Promise<{ architecture?: string; bitness?: string }>;
        };
      }
    ).userAgentData;
    void userAgentData
      ?.getHighEntropyValues(["architecture", "bitness"])
      .then(({ architecture: cpu, bitness }) => {
        if (!isCurrent || !cpu) return undefined;
        // Chrome writes arm64 for Apple silicon and x86_64 for Intel Macs.
        setArchitecture(cpu === "arm" ? `arm${bitness ?? ""}` : `x86_${bitness ?? ""}`);
        return undefined;
      })
      .catch((error: unknown) => {
        // Electron always answers; without an answer the version row stays empty.
        console.warn("[browser-settings] architecture unavailable", error);
      });
    return () => {
      isCurrent = false;
    };
  }, []);
  return architecture;
}

/**
 * settings-about-page: the product and its version, with the Chromium the browser runs on where
 * Chrome names its build. Chrome's update row needs an update channel for this product, which it
 * doesn't have yet, and its help and legal links are Google's.
 */
export function AboutPage() {
  const { t } = useTranslation();
  const architecture = useArchitecture();
  return (
    <SettingsSection title={settingsSectionLabel("about", t)} testID="browser-settings-about">
      <View style={styles.row}>
        <View style={styles.logo}>
          <WebUiProductLogo size={LOGO_SIZE} />
        </View>
        <Text style={styles.productTitle}>{PRODUCT_NAME}</Text>
      </View>
      <View style={[styles.row, styles.separatorAbove]}>
        <View style={styles.iconColumn} />
        {architecture ? (
          <Text selectable style={styles.version} testID="browser-settings-version">
            {t("workspace.browser.settings.about.version", {
              version: resolveAppVersion() ?? "",
              build: `Chromium ${chromiumVersion()}`,
              arch: architecture,
            })}
          </Text>
        ) : null}
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    row: {
      minHeight: TWO_LINE_ROW_MIN_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: WEBUI_LAYOUT.rowPadding,
    },
    separatorAbove: {
      borderTopWidth: 1,
      borderTopColor: colors.separator,
    },
    logo: {
      marginRight: LOGO_GAP,
    },
    productTitle: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: PRODUCT_TITLE_SIZE,
      fontWeight: "400",
      lineHeight: 20.02,
      color: colors.text,
    },
    iconColumn: {
      minWidth: LOGO_SIZE,
      marginRight: LOGO_GAP,
    },
    version: {
      flex: 1,
      paddingVertical: WEBUI_LAYOUT.sectionVerticalPadding,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: WEBUI_LAYOUT.fontSize,
      lineHeight: WEBUI_LAYOUT.lineHeight,
      color: colors.textSecondary,
    },
  };
});
