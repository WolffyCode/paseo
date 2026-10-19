import { forwardRef, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { WEBUI_LAYOUT } from "./theme";

// cr-toast: 52 tall, at least 288 wide, 24 in from the page's bottom left corner.
const TOAST_HEIGHT = 52;
const TOAST_MIN_WIDTH = 288;
const TOAST_EDGE = 24;

/**
 * cr-toast: a page's one-line notice at its bottom left, with an optional button. When it goes
 * away is the page's choice.
 */
export const CrToast = forwardRef<
  View,
  {
    text: string;
    action?: { label: string; onPress: () => void };
    maxWidth?: number;
    testID?: string;
  }
>(function CrToast({ text, action, maxWidth, testID }, ref) {
  const widthStyle = useMemo(() => (maxWidth ? { maxWidth } : null), [maxWidth]);
  return (
    <View
      ref={ref}
      style={[styles.toast, widthStyle]}
      role="alert"
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <Text numberOfLines={1} style={styles.text}>
        {text}
      </Text>
      {action ? (
        <Pressable accessibilityRole="button" onPress={action.onPress} style={styles.button}>
          <Text style={styles.buttonText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    toast: {
      position: "absolute",
      left: TOAST_EDGE,
      bottom: TOAST_EDGE,
      minWidth: TOAST_MIN_WIDTH,
      height: TOAST_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      borderRadius: 8,
      backgroundColor: colors.toast,
      boxShadow: "0 2px 4px rgba(0,0,0,0.28)",
    },
    text: {
      flexShrink: 1,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: WEBUI_LAYOUT.fontSize,
      color: colors.toastText,
    },
    button: {
      height: 36,
      marginLeft: 32,
      justifyContent: "center",
    },
    buttonText: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: WEBUI_LAYOUT.fontSize,
      fontWeight: "500",
      color: colors.toastButton,
    },
  };
});
