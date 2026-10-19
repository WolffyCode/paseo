import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { CrHighlightedText } from "@/desktop/browser/webui/search-highlight";
import { WEBUI_LAYOUT } from "@/desktop/browser/webui/theme";

// settings-section's #title: 108% of the base font on a 154% line, 21 dip above and 12 below.
const TITLE_FONT_SIZE = 14.04;
const TITLE_LINE_HEIGHT = 20.02;

/** settings-section: a page's title above its card of rows. */
export function SettingsSection({
  title,
  testID,
  children,
}: {
  title: string;
  testID?: string;
  children: ReactNode;
}) {
  return (
    <View testID={testID}>
      <View style={styles.header}>
        <View accessibilityRole="header">
          <CrHighlightedText text={title} style={styles.title} />
        </View>
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    header: {
      paddingRight: 20,
    },
    title: {
      marginTop: 21,
      marginBottom: 12,
      paddingTop: 8,
      paddingBottom: 4,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: TITLE_FONT_SIZE,
      fontWeight: "400",
      lineHeight: TITLE_LINE_HEIGHT,
      letterSpacing: 0.25,
      color: colors.text,
    },
    card: {
      borderRadius: WEBUI_LAYOUT.cardRadius,
      backgroundColor: colors.card,
      boxShadow: WEBUI_LAYOUT.cardShadow,
    },
  };
});
