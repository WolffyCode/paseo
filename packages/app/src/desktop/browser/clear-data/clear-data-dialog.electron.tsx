import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { CrActionMenu } from "@/desktop/browser/webui/action-menu.electron";
import { CrButton } from "@/desktop/browser/webui/controls";
import { CrDialog, type CrDialogLayout } from "@/desktop/browser/webui/dialog.electron";
import { CrCheckbox, CrChip } from "@/desktop/browser/webui/form-controls";
import { WebUiIcon } from "@/desktop/browser/webui/icons";
import { WEBUI_LAYOUT, webUiColorProps } from "@/desktop/browser/webui/theme";
import { CrThrobber } from "@/desktop/browser/webui/throbber";
import { deleteBrowsingData, useBrowsingDataCounters } from "./actions";
import {
  CLEAR_DATA_TYPES,
  MAX_TIME_PERIOD_CHIPS,
  splitDataTypes,
  timePeriodChips,
  type ClearDataTimePeriod,
  type ClearDataType,
} from "./model";
import { useClearDataPrefsStore } from "./prefs";

const ThemedWebUiIcon = withUnistyles(WebUiIcon);
const expandIconMapping = webUiColorProps("icon");

// The dialog's cr-dialog variables: a 16 px medium title 14 dip above the chips, 20 dip around the
// buttons, and a body of at most 400 (--dbd-dialog-body-max-height).
const DIALOG_LAYOUT: Partial<CrDialogLayout> = {
  titlePadding: { top: 20, horizontal: 20, bottom: 14 },
  titleFontSize: 16,
  titleFontWeight: "500",
  titleLineHeight: 24,
  bodyMaxHeight: 400,
  buttonPadding: { top: 20, horizontal: 20, bottom: 20 },
};
const CHIP_GAP = 5;
const THROBBER_SIZE = 28;
const EXPAND_ICON_SIZE = 20;

/** The toast after deleting: Chrome names the range in its long form, or says only 已删除. */
export function deletionToastText(t: TFunction, timePeriod: ClearDataTimePeriod): string {
  if (timePeriod === "allTime") {
    return t("workspace.browser.clearData.deletedAllTime");
  }
  const periodKey = timePeriod === "last15Minutes" ? "last15MinutesLong" : timePeriod;
  return t("workspace.browser.clearData.deletedPeriod", {
    period: t(`workspace.browser.clearData.periods.${periodKey}`),
  });
}

/**
 * The chips of settings-clear-browsing-data-time-picker. While its row overflows it shows one
 * chip fewer, down to the selected one, and never grows back while the dialog is open.
 */
function TimePeriodPicker({
  timePeriod,
  onChange,
}: {
  timePeriod: ClearDataTimePeriod;
  onChange: (timePeriod: ClearDataTimePeriod) => void;
}) {
  const { t } = useTranslation();
  const [maxChips, setMaxChips] = useState(MAX_TIME_PERIOD_CHIPS);
  const [rowWidth, setRowWidth] = useState(0);
  const [chipsWidth, setChipsWidth] = useState(0);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const moreChipRef = useRef<View | null>(null);
  const { chips, more } = timePeriodChips(timePeriod, maxChips);

  const isOverflowing = rowWidth > 0 && chipsWidth > rowWidth;
  useEffect(() => {
    if (isOverflowing && maxChips > 1) setMaxChips(maxChips - 1);
  }, [isOverflowing, maxChips]);

  const handleRowLayout = useCallback((event: LayoutChangeEvent) => {
    setRowWidth(event.nativeEvent.layout.width);
  }, []);
  const handleChipsLayout = useCallback((event: LayoutChangeEvent) => {
    setChipsWidth(event.nativeEvent.layout.width);
  }, []);
  const openMore = useCallback(() => {
    const node: unknown = moreChipRef.current;
    if (node instanceof HTMLElement) setMoreAnchor(node);
  }, []);
  const closeMore = useCallback(() => setMoreAnchor(null), []);
  const chooseFromMore = useCallback(
    (period: ClearDataTimePeriod) => {
      setMoreAnchor(null);
      onChange(period);
    },
    [onChange],
  );
  const moreItems = useMemo(
    () =>
      more.map((period) => ({
        id: period,
        label: t(`workspace.browser.clearData.periods.${period}`),
      })),
    [more, t],
  );

  return (
    <View style={styles.pickerRow} onLayout={handleRowLayout} testID="clear-data-time-picker">
      <View style={styles.chips} onLayout={handleChipsLayout}>
        {chips.map((period) => (
          <PeriodChip
            key={period}
            period={period}
            isSelected={period === timePeriod}
            onSelect={onChange}
          />
        ))}
        {more.length > 0 ? (
          <CrChip
            ref={moreChipRef}
            label={t("workspace.browser.clearData.more")}
            isSelected={false}
            trailingIcon="arrowDropDown"
            onPress={openMore}
            testID="clear-data-more"
          />
        ) : null}
      </View>
      {moreAnchor ? (
        <CrActionMenu
          anchor={moreAnchor}
          placement="belowAnchor"
          isCompact
          items={moreItems}
          onChoose={chooseFromMore}
          onClose={closeMore}
          testID="clear-data-more-menu"
        />
      ) : null}
    </View>
  );
}

function PeriodChip({
  period,
  isSelected,
  onSelect,
}: {
  period: ClearDataTimePeriod;
  isSelected: boolean;
  onSelect: (period: ClearDataTimePeriod) => void;
}) {
  const { t } = useTranslation();
  const select = useCallback(() => onSelect(period), [onSelect, period]);
  return (
    <View style={styles.chipSlot}>
      <CrChip
        label={t(`workspace.browser.clearData.periods.${period}`)}
        isSelected={isSelected}
        onPress={select}
        testID={`clear-data-period-${period}`}
      />
    </View>
  );
}

function DataTypeRow({
  type,
  subLabel,
  isChecked,
  isDisabled,
  onChange,
}: {
  type: ClearDataType;
  subLabel: string | null;
  isChecked: boolean;
  isDisabled: boolean;
  onChange: (type: ClearDataType, isChecked: boolean) => void;
}) {
  const { t } = useTranslation();
  const change = useCallback((checked: boolean) => onChange(type, checked), [onChange, type]);
  return (
    <CrCheckbox
      label={t(`workspace.browser.clearData.types.${type}`)}
      subLabel={subLabel}
      isChecked={isChecked}
      isDisabled={isDisabled}
      onChange={change}
      testID={`clear-data-type-${type}`}
    />
  );
}

/**
 * settings-clear-browsing-data-dialog over the 隐私与安全 page: a range, the data types this
 * browser keeps with what each would delete, and 从此设备中删除. The choices are remembered only
 * when deleting, as Chrome writes its prefs then.
 */
export function ClearBrowsingDataDialog({
  onDeleted,
  onClose,
}: {
  /** Deleted: the dialog's part is done, with the toast text the page shows. */
  onDeleted: (toastText: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // The dialog opens on the saved prefs, which also settle the rows that wait behind 展开.
  const [savedPrefs] = useState(() => useClearDataPrefsStore.getState());
  const [timePeriod, setTimePeriod] = useState(savedPrefs.timePeriod);
  const [checked, setChecked] = useState(savedPrefs.checked);
  const [{ expanded, more }] = useState(() => splitDataTypes(savedPrefs.checked));
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const counters = useBrowsingDataCounters(timePeriod);
  const cancelRef = useRef<View | null>(null);
  // Chrome shows the cancel button's focus ring as the dialog opens, until the first click.
  const [isCancelRingShown, setIsCancelRingShown] = useState(true);

  useEffect(() => {
    const node: unknown = cancelRef.current;
    if (node instanceof HTMLElement) node.focus();
    const hideRing = () => setIsCancelRingShown(false);
    window.addEventListener("pointerdown", hideRing, { once: true, capture: true });
    return () => window.removeEventListener("pointerdown", hideRing, { capture: true });
  }, []);

  const shownTypes = isExpanded ? CLEAR_DATA_TYPES : expanded;
  const hasMore = !isExpanded && more.length > 0;
  const hasChecked = CLEAR_DATA_TYPES.some((type) => checked[type]);

  const changeType = useCallback((type: ClearDataType, isChecked: boolean) => {
    setChecked((current) => ({ ...current, [type]: isChecked }));
  }, []);
  const expand = useCallback(() => setIsExpanded(true), []);
  const deleteChecked = useCallback(() => {
    setIsDeleting(true);
    useClearDataPrefsStore.getState().remember({ timePeriod, checked });
    const types = new Set(CLEAR_DATA_TYPES.filter((type) => checked[type]));
    deleteBrowsingData({ timePeriod, types, now: Date.now() })
      .then(() => {
        onDeleted(deletionToastText(t, timePeriod));
        return undefined;
      })
      .catch((error: unknown) => {
        // The dialog stays open with its choices, so deleting can be tried again.
        console.error("[clear-browsing-data] deleting failed", error);
        setIsDeleting(false);
      });
  }, [checked, onDeleted, t, timePeriod]);

  const header = useMemo(
    () => (
      <View style={styles.header}>
        <TimePeriodPicker timePeriod={timePeriod} onChange={setTimePeriod} />
      </View>
    ),
    [timePeriod],
  );
  const buttons = (
    <>
      {isDeleting ? (
        <View style={styles.throbber}>
          <CrThrobber size={THROBBER_SIZE} />
        </View>
      ) : null}
      <View style={[styles.cancel, isCancelRingShown && styles.focusRing]}>
        <CrButton
          ref={cancelRef}
          label={t("workspace.browser.webui.cancel")}
          isDisabled={isDeleting}
          onPress={onClose}
          testID="clear-data-cancel"
        />
      </View>
      <CrButton
        label={t("workspace.browser.clearData.deleteFromDevice")}
        isAction
        isDisabled={isDeleting || !hasChecked}
        onPress={deleteChecked}
        testID="clear-data-delete"
      />
    </>
  );

  return (
    <CrDialog
      title={t("workspace.browser.clearData.title")}
      header={header}
      layout={DIALOG_LAYOUT}
      buttons={buttons}
      onCancel={onClose}
      testID="clear-data-dialog"
    >
      <View style={[styles.types, hasMore && styles.typesAboveExpand]}>
        {shownTypes.map((type) => (
          <DataTypeRow
            key={type}
            type={type}
            subLabel={counters[type] ?? t("workspace.browser.clearData.calculating")}
            isChecked={checked[type]}
            isDisabled={isDeleting}
            onChange={changeType}
          />
        ))}
      </View>
      {hasMore ? (
        <Pressable
          accessibilityRole="button"
          onPress={expand}
          style={expandButtonStyle}
          testID="clear-data-show-more"
        >
          <Text style={styles.expandText}>{t("workspace.browser.clearData.showMore")}</Text>
          <ThemedWebUiIcon
            name="keyboardArrowDown"
            size={EXPAND_ICON_SIZE}
            uniProps={expandIconMapping}
          />
        </Pressable>
      ) : null}
    </CrDialog>
  );
}

function expandButtonStyle({ hovered }: { hovered?: boolean }) {
  return [styles.expand, hovered && styles.expandHovered];
}

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    // The dialog's [slot=header] rule: 20 dip at the sides and below.
    header: {
      paddingHorizontal: 20,
      paddingBottom: 20,
    },
    pickerRow: {
      flexDirection: "row",
      overflow: "hidden",
    },
    chips: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      flexShrink: 0,
    },
    chipSlot: {
      marginRight: CHIP_GAP,
    },
    // #checkboxContainer: the data types in a rounded box, squared off at the bottom while 展开
    // sits under it.
    types: {
      paddingTop: 8,
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderRadius: 12,
      backgroundColor: colors.dialogContainer,
    },
    typesAboveExpand: {
      borderBottomLeftRadius: 4,
      borderBottomRightRadius: 4,
      marginBottom: 2,
    },
    expand: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
      borderBottomLeftRadius: 12,
      borderBottomRightRadius: 12,
      backgroundColor: colors.dialogContainer,
    },
    expandHovered: {
      boxShadow: `inset 0 0 0 100px ${colors.hover}`,
    },
    expandText: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: WEBUI_LAYOUT.fontSize,
      fontWeight: "500",
      lineHeight: WEBUI_LAYOUT.lineHeight,
      color: colors.text,
    },
    throbber: {
      marginRight: 16,
    },
    cancel: {
      marginRight: 8,
      borderRadius: WEBUI_LAYOUT.buttonHeight / 2,
    },
    focusRing: {
      outlineWidth: 2,
      outlineStyle: "solid",
      outlineColor: colors.primary,
      outlineOffset: 2,
    },
  };
});
