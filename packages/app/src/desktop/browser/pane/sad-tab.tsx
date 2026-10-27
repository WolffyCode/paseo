import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChromeDialogButton } from "../chrome-controls";
import { CHROME_FONT_FAMILY, chromeColorProps } from "../chrome-theme";

// SadTabView: 20 dip insets, the block a third of the way down; the 48 dip icon 16 above the
// title (the large font, 21 px), the message 13 below it in 12 px on 16 dip lines, the error code
// in 10 px 13 below that, and 16 above the button row.
const INSET = 20;
const ICON_SIZE = 48;
const ICON_MARGIN_BOTTOM = 16;
const TITLE_FONT_SIZE = 21;
const TITLE_MARGIN_BOTTOM = 13;
const TITLE_MAX_WIDTH = 600;
const MESSAGE_FONT_SIZE = 12;
const MESSAGE_LINE_HEIGHT = 16;
const ERROR_CODE_FONT_SIZE = 10;
const ERROR_CODE_MARGIN_TOP = 13;
const ERROR_CODE_MARGIN_BOTTOM = 16;
// The spacer below the block grows twice as much as the one above it.
const SPACE_ABOVE_FLEX = 1;
const SPACE_BELOW_FLEX = 2;

// crashed_tab_old.icon: a stroked folder-like page with a frowning face; square caps make its
// zero-length strokes the face's 2 dip dots.
const CRASHED_TAB_FRAME =
  "M1.5 8.5 v34 h45 v-28 m-3 -3 h-10 v-3 m-3 -3 h-10 m15 6 h-18 v-3 m-3 -3 h-10";
const CRASHED_TAB_FACE =
  "M12 35 h2 m2 -2 h12 m2 2 h3 m2 2 h3 M11 21 l0 0 m0 4 l0 0 m4 0 l0 0 m0 -4 l0 0 m-2 2 l0 0 M33 21 l0 0 m0 4 l0 0 m4 0 l0 0 m0 -4 l0 0 m-2 2 l0 0";
const FRAME_STROKE_WIDTH = 3;
const FACE_STROKE_WIDTH = 2;

function CrashedTabIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 48 48" fill="none">
      <Path
        d={CRASHED_TAB_FRAME}
        stroke={color}
        strokeWidth={FRAME_STROKE_WIDTH}
        strokeLinecap="square"
      />
      <Path
        d={CRASHED_TAB_FACE}
        stroke={color}
        strokeWidth={FACE_STROKE_WIDTH}
        strokeLinecap="square"
      />
    </Svg>
  );
}

const ThemedCrashedTabIcon = withUnistyles(CrashedTabIcon);
const iconMapping = chromeColorProps("bubbleTextSecondary");

/**
 * Chrome's sad tab (SadTabView) over a page whose renderer process ended, such as from the task
 * manager's 结束任务: 喔唷，崩溃啦！ with the error code and 重新加载. Its 了解详情 link leads to
 * Google's help, which this browser leaves out.
 */
export function BrowserSadTab({ exitCode, onReload }: { exitCode: number; onReload: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.page} testID="browser-sad-tab">
      <View style={styles.spaceAbove} />
      <View style={styles.block} accessibilityRole="alert">
        <View style={styles.icon}>
          <ThemedCrashedTabIcon uniProps={iconMapping} />
        </View>
        <Text style={styles.title}>{t("workspace.browser.sadTab.title")}</Text>
        <Text style={styles.message}>{t("workspace.browser.sadTab.message")}</Text>
        <Text selectable style={styles.errorCode}>
          {t("workspace.browser.sadTab.errorCode", { code: exitCode })}
        </Text>
        <View style={styles.actions}>
          <ChromeDialogButton
            label={t("workspace.browser.sadTab.reload")}
            variant="prominent"
            onPress={onReload}
            testID="browser-sad-tab-reload"
          />
        </View>
      </View>
      <View style={styles.spaceBelow} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => {
  // kColorDialogBackground, kColorSysOnSurface and kColorSecondaryForeground: the same surface
  // colors Chrome's bubbles use.
  const { chrome } = theme;
  return {
    page: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      padding: INSET,
      alignItems: "center",
      backgroundColor: chrome.bubble,
    },
    spaceAbove: {
      flexGrow: SPACE_ABOVE_FLEX,
    },
    spaceBelow: {
      flexGrow: SPACE_BELOW_FLEX,
    },
    block: {
      maxWidth: TITLE_MAX_WIDTH,
      alignItems: "flex-start",
    },
    icon: {
      marginBottom: ICON_MARGIN_BOTTOM,
    },
    title: {
      marginBottom: TITLE_MARGIN_BOTTOM,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: TITLE_FONT_SIZE,
      color: chrome.bubbleText,
    },
    message: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: MESSAGE_FONT_SIZE,
      lineHeight: MESSAGE_LINE_HEIGHT,
      color: chrome.bubbleTextSecondary,
    },
    errorCode: {
      marginTop: ERROR_CODE_MARGIN_TOP,
      marginBottom: ERROR_CODE_MARGIN_BOTTOM,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: ERROR_CODE_FONT_SIZE,
      color: chrome.bubbleTextSecondary,
    },
    actions: {
      alignSelf: "stretch",
      flexDirection: "row",
      justifyContent: "flex-end",
    },
  };
});
