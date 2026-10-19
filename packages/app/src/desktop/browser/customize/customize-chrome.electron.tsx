import {
  createElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import { Pressable, ScrollView, Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChromeToggle } from "../chrome-controls";
import { ChromeIcon, type ChromeIconName } from "../chrome-icons";
import {
  CHROME_FONT_FAMILY,
  chromeColorProps,
  type ChromeColors,
  type ChromeTheme,
} from "../chrome-theme";
import type { CustomizeChromePage } from "../side-panel/store";
import { PRODUCT_NAME } from "@/constants/product";
import { PINNABLE_ACTION_PRESENTATION, type PinnableActionCategory } from "../toolbar/actions";
import {
  BROWSER_PINNABLE_ACTIONS,
  isDefaultToolbar,
  useBrowserToolbarSettingsStore,
  type BrowserPinnableAction,
} from "../toolbar/settings";
import { WebUiIcon } from "../webui/icons";
import { MINI_TOOLBAR_SVG } from "./mini-toolbar-svg";

// side_panel/shared/sp_shared_vars.css and customize_chrome app.css at a 360 dip panel.
const BODY_PADDING = 8;
const CARD_BLOCK_PADDING = 8;
const CARD_INLINE_PADDING = 16;
const CARD_RADIUS = 12;
const CARDS_GAP = 8;
// customize_toolbar/toolbar.css.
const ROW_PADDING_BLOCK = 8;
const ROW_GAP = 12;
const ROW_ICON_WIDTH = 20;
const ROW_ICON_SIZE = 16;
const CATEGORY_TITLE_MARGIN = 12;
const CATEGORY_LINE_MARGIN = 8;
const ILLUSTRATION_WIDTH = 278;
const ILLUSTRATION_HEIGHT = 147;
const ILLUSTRATION_PADDING = 16;
const ILLUSTRATION_RADIUS = 8;
const RESET_BUTTON_HEIGHT = 40;
const RESET_ICON_SIZE = 20;
// sp_heading.css: a 36 dip heading whose 24 dip back button sits 4 dip into the padding.
const HEADING_HEIGHT = 36;
const BACK_BUTTON_SIZE = 24;
const BACK_ICON_SIZE = 16;
const CHEVRON_SIZE = 20;
const TOOLBAR_CARD_HEIGHT = 52;
const TIP_ICON_SIZE = 20;
// cr_shared_vars.css: --cr-elevation-2 and -3 over --color-sys-shadow, black in both themes.
const ELEVATION_2 = "rgba(0,0,0,0.3) 0 1px 2px 0, rgba(0,0,0,0.15) 0 2px 6px 2px";
const ELEVATION_3 = "rgba(0,0,0,0.3) 0 1px 3px 0, rgba(0,0,0,0.15) 0 4px 8px 3px";
// The id suffix mini_toolbar.svg gives its clip paths.
const ILLUSTRATION_ID_SUFFIX = "_3148_48162";

type HoverState = PressableStateCallbackType & { hovered?: boolean };

/** The Customize Chrome side panel's page (chrome://customize-chrome-side-panel.top-chrome). */
export function CustomizeChromeContent({
  page,
  onShowPage,
}: {
  page: CustomizeChromePage;
  onShowPage: (page: CustomizeChromePage) => void;
}) {
  return (
    <ScrollView style={styles.scroller} contentContainerStyle={styles.scrollerContent}>
      {page === "toolbar" ? (
        <CustomizeToolbarPage onShowPage={onShowPage} />
      ) : (
        <CustomizeChromeOverview onShowPage={onShowPage} />
      )}
    </ScrollView>
  );
}

/** The overview's cards that this browser has: only 工具栏, as it has no themes or NTP cards. */
function CustomizeChromeOverview({
  onShowPage,
}: {
  onShowPage: (page: CustomizeChromePage) => void;
}) {
  const { t } = useTranslation();
  const showToolbarPage = useCallback(() => onShowPage("toolbar"), [onShowPage]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("workspace.browser.customizeChrome.toolbarCard")}
      onPress={showToolbarPage}
      style={toolbarCardStyle}
      testID="customize-chrome-toolbar-card"
    >
      <Text style={styles.heading}>{t("workspace.browser.customizeChrome.toolbar")}</Text>
      <ThemedWebUiIcon name="chevronRight" size={CHEVRON_SIZE} uniProps={primaryIconMapping} />
    </Pressable>
  );
}

function toolbarCardStyle({ hovered }: HoverState) {
  return [styles.card, styles.toolbarCard, hovered && styles.hoverOverlay];
}

type ToolbarPref = "showHomeButton" | "showForwardButton";

interface ToolbarPageCategory {
  titleKey:
    | "workspace.browser.customizeChrome.navigation"
    | "workspace.browser.customizeChrome.yourChrome"
    | "workspace.browser.customizeChrome.toolsAndActions";
  prefs: readonly ToolbarPref[];
  actionCategory: PinnableActionCategory | null;
}

// The 工具栏 page's groups in Chrome's order (customize_toolbar_handler.cc), keeping only rows
// this browser can run.
const TOOLBAR_PAGE_CATEGORIES: readonly ToolbarPageCategory[] = [
  {
    titleKey: "workspace.browser.customizeChrome.navigation",
    prefs: ["showHomeButton", "showForwardButton"],
    actionCategory: null,
  },
  {
    titleKey: "workspace.browser.customizeChrome.yourChrome",
    prefs: [],
    actionCategory: "yourChrome",
  },
  {
    titleKey: "workspace.browser.customizeChrome.toolsAndActions",
    prefs: [],
    actionCategory: "toolsAndActions",
  },
];

const PREF_ROWS: Record<
  ToolbarPref,
  {
    labelKey: "workspace.browser.controls.home" | "workspace.browser.controls.forward";
    icon: ChromeIconName;
  }
> = {
  showHomeButton: { labelKey: "workspace.browser.controls.home", icon: "home" },
  showForwardButton: { labelKey: "workspace.browser.controls.forward", icon: "forward" },
};

function categoryActions(category: PinnableActionCategory | null): BrowserPinnableAction[] {
  return BROWSER_PINNABLE_ACTIONS.filter(
    (action) => PINNABLE_ACTION_PRESENTATION[action].category === category,
  );
}

function CustomizeToolbarPage({ onShowPage }: { onShowPage: (page: CustomizeChromePage) => void }) {
  const { t } = useTranslation();
  const showHomeButton = useBrowserToolbarSettingsStore((state) => state.showHomeButton);
  const showForwardButton = useBrowserToolbarSettingsStore((state) => state.showForwardButton);
  const pinnedActions = useBrowserToolbarSettingsStore((state) => state.pinnedActions);
  const setShowHomeButton = useBrowserToolbarSettingsStore((state) => state.setShowHomeButton);
  const setShowForwardButton = useBrowserToolbarSettingsStore(
    (state) => state.setShowForwardButton,
  );
  const setActionPinned = useBrowserToolbarSettingsStore((state) => state.setActionPinned);
  const resetToDefaults = useBrowserToolbarSettingsStore((state) => state.resetToDefaults);
  const isDefault = isDefaultToolbar({ showHomeButton, showForwardButton, pinnedActions });
  const prefValues: Record<ToolbarPref, boolean> = { showHomeButton, showForwardButton };
  const prefSetters: Record<ToolbarPref, (isShown: boolean) => void> = {
    showHomeButton: setShowHomeButton,
    showForwardButton: setShowForwardButton,
  };

  // Chrome moves focus to the back button when the page opens (app.ts).
  const backButtonRef = useRef<View | null>(null);
  useEffect(() => {
    const node: unknown = backButtonRef.current;
    if (node instanceof HTMLElement) {
      node.focus({ preventScroll: true });
    }
  }, []);
  const showOverview = useCallback(() => onShowPage("overview"), [onShowPage]);

  return (
    <>
      <View style={styles.card}>
        <View style={styles.headingRow}>
          <Pressable
            ref={backButtonRef}
            accessibilityRole="button"
            accessibilityLabel={t("workspace.browser.controls.back")}
            onPress={showOverview}
            style={backButtonStyle}
            testID="customize-chrome-back"
          >
            <ThemedWebUiIcon name="arrowBack" size={BACK_ICON_SIZE} uniProps={primaryIconMapping} />
          </Pressable>
          <Text style={styles.heading}>{t("workspace.browser.customizeChrome.toolbar")}</Text>
        </View>
        <View style={styles.illustrationBox}>
          <MiniToolbarIllustration />
        </View>
        <Text style={styles.intro}>{t("workspace.browser.customizeChrome.chooseButtons")}</Text>
        <ResetToDefaultButton isDisabled={isDefault} onPress={resetToDefaults} />
      </View>
      <View style={styles.cardsGap} />
      <View style={[styles.card, styles.pinningCard]}>
        {TOOLBAR_PAGE_CATEGORIES.map((category, categoryIndex) => (
          <View key={category.titleKey}>
            {categoryIndex > 0 ? <View style={styles.categoryLine} /> : null}
            <Text style={[styles.categoryTitle, categoryIndex > 0 && styles.categoryTitleSpaced]}>
              {t(category.titleKey, { product: PRODUCT_NAME })}
            </Text>
            {category.prefs.map((pref) => (
              <ToolbarToggleRow
                key={pref}
                icon={PREF_ROWS[pref].icon}
                label={t(PREF_ROWS[pref].labelKey)}
                isOn={prefValues[pref]}
                onToggle={prefSetters[pref]}
              />
            ))}
            {categoryActions(category.actionCategory).map((action) => (
              <PinnableActionRow
                key={action}
                action={action}
                isPinned={pinnedActions.includes(action)}
                onPinnedChange={setActionPinned}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.cardsGap} />
      <View style={[styles.card, styles.tipCard]}>
        <ThemedWebUiIcon name="lightbulb" size={TIP_ICON_SIZE} uniProps={subtleIconMapping} />
        <Text style={styles.tipText}>{t("workspace.browser.customizeChrome.reorderTip")}</Text>
      </View>
    </>
  );
}

function backButtonStyle({ hovered }: HoverState) {
  return [styles.backButton, hovered && styles.backButtonHovered];
}

function PinnableActionRow({
  action,
  isPinned,
  onPinnedChange,
}: {
  action: BrowserPinnableAction;
  isPinned: boolean;
  onPinnedChange: (action: BrowserPinnableAction, isPinned: boolean) => void;
}) {
  const { t } = useTranslation();
  const presentation = PINNABLE_ACTION_PRESENTATION[action];
  const handleToggle = useCallback(
    (nextIsPinned: boolean) => onPinnedChange(action, nextIsPinned),
    [action, onPinnedChange],
  );
  return (
    <ToolbarToggleRow
      icon={presentation.smallIcon}
      label={t(presentation.labelKey)}
      isOn={isPinned}
      onToggle={handleToggle}
    />
  );
}

/** One row of the 工具栏 page: the whole row flips its switch. */
function ToolbarToggleRow({
  icon,
  label,
  isOn,
  onToggle,
}: {
  icon: ChromeIconName;
  label: string;
  isOn: boolean;
  onToggle: (isOn: boolean) => void;
}) {
  const handleToggle = useCallback(() => onToggle(!isOn), [isOn, onToggle]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      aria-checked={isOn}
      onPress={handleToggle}
      style={toggleRowStyle}
    >
      <View style={styles.rowIcon}>
        <ThemedChromeIcon name={icon} size={ROW_ICON_SIZE} uniProps={primaryIconMapping} />
      </View>
      <Text numberOfLines={1} style={styles.rowTitle}>
        {label}
      </Text>
      <ChromeToggle isChecked={isOn} onToggle={handleToggle} />
    </Pressable>
  );
}

function toggleRowStyle({ hovered }: HoverState) {
  return [styles.row, hovered && styles.rowHovered];
}

/** cr-button.floating-button with the reset icon: tonal, lifted on hover. */
function ResetToDefaultButton({
  isDisabled,
  onPress,
}: {
  isDisabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const buttonStyle = useCallback(
    ({ hovered }: HoverState) => [
      styles.resetButton,
      isDisabled ? styles.resetButtonDisabled : styles.resetButtonEnabled,
      hovered && !isDisabled && styles.resetButtonHovered,
    ],
    [isDisabled],
  );
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={buttonStyle}
      testID="customize-chrome-reset"
    >
      {({ hovered }: HoverState) => (
        <>
          {hovered && !isDisabled ? <View style={styles.resetHoverOverlay} /> : null}
          <ThemedWebUiIcon
            name="reset"
            size={RESET_ICON_SIZE}
            uniProps={isDisabled ? disabledTextMapping : tonalTextMapping}
          />
          <Text style={[styles.resetLabel, isDisabled && styles.resetLabelDisabled]}>
            {t("workspace.browser.customizeChrome.reset")}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Chrome's mini_toolbar.svg in the page's colors, on a card lifted by --cr-elevation-2. */
function MiniToolbarFrame({ chrome }: { chrome: ChromeColors }) {
  // The svg's clip path ids must be unique when two tabs show the page.
  const instanceId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const markup = useMemo(
    () => ({ __html: MINI_TOOLBAR_SVG.replaceAll(ILLUSTRATION_ID_SUFFIX, `_${instanceId}`) }),
    [instanceId],
  );
  const frameStyle = useMemo(
    () =>
      ({
        width: ILLUSTRATION_WIDTH,
        height: ILLUSTRATION_HEIGHT,
        borderRadius: ILLUSTRATION_RADIUS,
        boxShadow: ELEVATION_2,
        overflow: "hidden",
        lineHeight: 0,
        "--color-sys-header": chrome.frame,
        "--color-sys-base": chrome.toolbar,
        "--color-sys-omnibox-container": chrome.omnibox,
        "--color-sys-on-header-primary": chrome.miniToolbarCaption,
        "--color-sys-on-surface-secondary": chrome.toolbarIcon,
        "--color-sys-surface-variant": chrome.contentSeparator,
        "--color-sys-tertiary": chrome.miniToolbarExtension,
      }) as CSSProperties,
    [chrome],
  );
  return createElement("div", {
    "aria-hidden": true,
    style: frameStyle,
    dangerouslySetInnerHTML: markup,
  });
}

const MiniToolbarIllustration = withUnistyles(MiniToolbarFrame, (theme: ChromeTheme) => ({
  chrome: theme.chrome,
}));
const ThemedChromeIcon = withUnistyles(ChromeIcon);
const ThemedWebUiIcon = withUnistyles(WebUiIcon);
const primaryIconMapping = chromeColorProps("sidePanelCardText");
const subtleIconMapping = chromeColorProps("subtleIcon");
const tonalTextMapping = chromeColorProps("tonalText");
const disabledTextMapping = chromeColorProps("buttonDisabledText");

const styles = StyleSheet.create((theme) => {
  const { chrome } = theme;
  const text = {
    fontFamily: CHROME_FONT_FAMILY,
    color: chrome.sidePanelCardText,
  };
  return {
    scroller: {
      flex: 1,
      scrollbarColor: `${chrome.sidePanelScrollbar} transparent`,
    },
    scrollerContent: {
      padding: BODY_PADDING,
    },
    card: {
      borderRadius: CARD_RADIUS,
      backgroundColor: chrome.sidePanelCard,
      paddingVertical: CARD_BLOCK_PADDING,
      paddingHorizontal: CARD_INLINE_PADDING,
      overflow: "hidden",
    },
    cardsGap: {
      height: CARDS_GAP,
    },
    hoverOverlay: {
      backgroundColor: chrome.sidePanelRowHover,
    },
    toolbarCard: {
      height: TOOLBAR_CARD_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headingRow: {
      height: HEADING_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    heading: {
      ...text,
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "500",
    },
    backButton: {
      width: BACK_BUTTON_SIZE,
      height: BACK_BUTTON_SIZE,
      marginLeft: -4,
      borderRadius: BACK_BUTTON_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    backButtonHovered: {
      backgroundColor: chrome.sidePanelRowHover,
    },
    illustrationBox: {
      alignItems: "center",
      padding: ILLUSTRATION_PADDING,
      marginBottom: 8,
      borderRadius: CARD_RADIUS,
      backgroundColor: chrome.tonalContainer,
    },
    intro: {
      ...text,
      fontSize: 12,
      lineHeight: 16,
      paddingBottom: 16,
      textAlign: "center",
      color: chrome.sidePanelCardTextSecondary,
    },
    resetButton: {
      height: RESET_BUTTON_HEIGHT,
      marginBottom: 8,
      paddingLeft: 12,
      paddingRight: 16,
      borderRadius: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      overflow: "hidden",
      transitionProperty: "box-shadow",
      transitionDuration: "80ms",
      transitionTimingFunction: "linear",
    },
    resetButtonEnabled: {
      backgroundColor: chrome.tonalContainer,
    },
    resetButtonDisabled: {
      backgroundColor: chrome.buttonDisabled,
    },
    resetButtonHovered: {
      boxShadow: ELEVATION_3,
    },
    resetHoverOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: chrome.sidePanelRowHover,
    },
    resetLabel: {
      ...text,
      fontSize: 12,
      lineHeight: 20,
      fontWeight: "500",
      color: chrome.tonalText,
    },
    resetLabelDisabled: {
      color: chrome.buttonDisabledText,
    },
    // The selection card's rows reach its edges so their hover fills the full width.
    pinningCard: {
      paddingTop: 16,
      paddingBottom: 0,
      paddingHorizontal: 0,
    },
    categoryTitle: {
      ...text,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "500",
      paddingHorizontal: CARD_INLINE_PADDING,
      marginBottom: CATEGORY_TITLE_MARGIN,
    },
    categoryTitleSpaced: {
      marginTop: CATEGORY_TITLE_MARGIN,
    },
    categoryLine: {
      height: 1,
      marginTop: CATEGORY_LINE_MARGIN,
      marginHorizontal: CARD_INLINE_PADDING,
      backgroundColor: chrome.sidePanelCardDivider,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: ROW_GAP,
      paddingVertical: ROW_PADDING_BLOCK,
      paddingHorizontal: CARD_INLINE_PADDING,
    },
    rowHovered: {
      backgroundColor: chrome.sidePanelRowHover,
    },
    rowIcon: {
      width: ROW_ICON_WIDTH,
      height: ROW_ICON_SIZE,
      alignItems: "center",
      justifyContent: "center",
    },
    rowTitle: {
      ...text,
      flex: 1,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "500",
    },
    // The tip card's 1 px border sits outside the card's width (content-box sizing).
    tipCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      padding: 16,
      marginRight: -2,
      borderWidth: 1,
      borderColor: chrome.tipCardBorder,
      backgroundColor: chrome.tipCard,
    },
    tipText: {
      ...text,
      flex: 1,
      fontSize: 12,
      lineHeight: 20,
    },
  };
});
