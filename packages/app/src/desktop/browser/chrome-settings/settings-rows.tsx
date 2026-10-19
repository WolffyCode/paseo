import { useCallback, type ReactNode } from "react";
import { Pressable, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { CrToggle } from "@/desktop/browser/webui/controls";
import { CrHighlightedText } from "@/desktop/browser/webui/search-highlight";
import { WEBUI_LAYOUT } from "@/desktop/browser/webui/theme";

type HoverState = PressableStateCallbackType & { hovered?: boolean };

// --cr-section-two-line-min-height: a row with a sublabel.
const TWO_LINE_MIN_HEIGHT = 64;
// --cr-section-indent-padding: an indented block starts 40 dip further in.
const INDENTED_PADDING_START = 60;
// .separator: a 32 dip line with 16 dip on each side.
const ROW_SEPARATOR_HEIGHT = 32;
const ROW_SEPARATOR_MARGIN = 16;

function RowLabels({
  label,
  subLabel,
  hasEndGap = false,
}: {
  label: string;
  subLabel?: string | null;
  /** settings-toggle-button keeps 20 dip between its labels and its toggle. */
  hasEndGap?: boolean;
}) {
  return (
    <View style={[styles.labels, hasEndGap && styles.labelsEndGap]}>
      <CrHighlightedText text={label} style={styles.label} />
      {subLabel ? <CrHighlightedText text={subLabel} style={styles.subLabel} /> : null}
    </View>
  );
}

/** settings-toggle-button: a label, an optional sublabel and a cr-toggle; the whole row toggles. */
export function SettingsToggleButton({
  label,
  subLabel,
  isOn,
  onChange,
  hasSeparator = true,
  testID,
}: {
  label: string;
  subLabel?: string | null;
  isOn: boolean;
  onChange: (isOn: boolean) => void;
  hasSeparator?: boolean;
  testID?: string;
}) {
  const toggle = useCallback(() => onChange(!isOn), [isOn, onChange]);
  const rowStyle = useCallback(
    ({ hovered, pressed }: HoverState) => [
      styles.row,
      hasSeparator && styles.separatorAbove,
      subLabel ? styles.twoLineRow : null,
      hovered && styles.hovered,
      pressed && styles.pressed,
    ],
    [hasSeparator, subLabel],
  );
  return (
    <Pressable accessible={false} onPress={toggle} style={rowStyle}>
      <RowLabels label={label} subLabel={subLabel} hasEndGap />
      <CrToggle label={label} isOn={isOn} onChange={onChange} testID={testID} />
    </Pressable>
  );
}

/**
 * .cr-row: a label and the control that sets it, as a dropdown. A continuation row sits in an
 * indented block, which gives it its padding and no line above.
 */
export function SettingsRow({
  label,
  subLabel,
  hasSeparator = true,
  isContinuation = false,
  children,
}: {
  label: string;
  subLabel?: string | null;
  hasSeparator?: boolean;
  isContinuation?: boolean;
  children?: ReactNode;
}) {
  return (
    <View
      style={[
        styles.row,
        isContinuation ? styles.continuationRow : hasSeparator && styles.separatorAbove,
      ]}
    >
      <RowLabels label={label} subLabel={subLabel} />
      {children}
    </View>
  );
}

/**
 * .separator: the line between a row's text and a button at its end. A link row already ends in
 * its own padding, so the line after one has no gap before it.
 */
export function SettingsRowSeparator({ hasStartGap = true }: { hasStartGap?: boolean }) {
  return <View style={[styles.rowSeparator, !hasStartGap && styles.rowSeparatorFlushStart]} />;
}

/** .list-frame: rows under a heading row, indented to its label, with no line above them. */
export function SettingsIndentedRows({ children }: { children: ReactNode }) {
  return <View style={styles.indented}>{children}</View>;
}

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  const text = {
    fontFamily: CHROME_FONT_FAMILY,
    fontSize: WEBUI_LAYOUT.fontSize,
    lineHeight: WEBUI_LAYOUT.lineHeight,
  };
  return {
    row: {
      minHeight: WEBUI_LAYOUT.rowMinHeight,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: WEBUI_LAYOUT.rowPadding,
    },
    twoLineRow: {
      minHeight: TWO_LINE_MIN_HEIGHT,
    },
    separatorAbove: {
      borderTopWidth: 1,
      borderTopColor: colors.separator,
    },
    hovered: {
      backgroundColor: colors.hover,
    },
    pressed: {
      backgroundColor: colors.pressed,
    },
    continuationRow: {
      paddingHorizontal: 0,
    },
    labels: {
      flex: 1,
      paddingVertical: WEBUI_LAYOUT.sectionVerticalPadding,
    },
    labelsEndGap: {
      marginRight: 20,
    },
    label: {
      ...text,
      color: colors.text,
    },
    subLabel: {
      ...text,
      color: colors.textSecondary,
    },
    indented: {
      paddingLeft: INDENTED_PADDING_START,
      paddingRight: WEBUI_LAYOUT.rowPadding,
    },
    rowSeparator: {
      height: ROW_SEPARATOR_HEIGHT,
      marginHorizontal: ROW_SEPARATOR_MARGIN,
      borderLeftWidth: 1,
      borderLeftColor: colors.separator,
    },
    rowSeparatorFlushStart: {
      marginLeft: 0,
    },
  };
});
