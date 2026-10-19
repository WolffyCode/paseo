import type { ReactNode, Ref } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { CrIconButton } from "@/desktop/browser/webui/controls";
import { WEBUI_LAYOUT } from "@/desktop/browser/webui/theme";

// settings-subpage's #headerLine: 8 dip above, 24 below, 40 for the back button and the title;
// the back button pulls 10 dip into the card's padding and keeps 10 before the title.
const HEADER_PADDING_TOP = 8;
const HEADER_PADDING_BOTTOM = 24;
const HEADER_CONTENT_HEIGHT = 40;
const BACK_BUTTON_OFFSET = 10;
const TITLE_FONT_SIZE = 14;
// The card ends 60 dip below its last row.
const PADDING_BOTTOM = 60;

/**
 * settings-subpage: a section's subpage, shown in its place. Its card sits flush under the
 * toolbar with square corners and reaches at least the bottom of the page; its header has a back
 * button to the section and the subpage's name.
 */
export function SettingsSubpage({
  title,
  onBack,
  backButtonRef,
  testID,
  children,
}: {
  title: string;
  onBack: () => void;
  /** The back button, which the settings page focuses on entering the subpage. */
  backButtonRef: Ref<View>;
  testID?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.header}>
        <View style={styles.backButton}>
          <CrIconButton
            ref={backButtonRef}
            icon="arrowBack"
            label={t("common.actions.back")}
            onPress={onBack}
            testID="browser-settings-subpage-back"
          />
        </View>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    card: {
      flexGrow: 1,
      paddingBottom: PADDING_BOTTOM,
      backgroundColor: colors.card,
      boxShadow: WEBUI_LAYOUT.cardShadow,
    },
    header: {
      minHeight: HEADER_PADDING_TOP + HEADER_CONTENT_HEIGHT + HEADER_PADDING_BOTTOM,
      flexDirection: "row",
      alignItems: "center",
      paddingTop: HEADER_PADDING_TOP,
      paddingBottom: HEADER_PADDING_BOTTOM,
      paddingHorizontal: WEBUI_LAYOUT.rowPadding,
    },
    backButton: {
      marginLeft: -BACK_BUTTON_OFFSET,
      marginRight: BACK_BUTTON_OFFSET,
    },
    title: {
      flex: 1,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: TITLE_FONT_SIZE,
      fontWeight: "500",
      lineHeight: WEBUI_LAYOUT.lineHeight,
      color: colors.titleText,
    },
  };
});
