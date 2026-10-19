import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { PRODUCT_NAME } from "@/constants/product";
import { useSidePanelPositionStore } from "@/desktop/browser/side-panel/store";
import {
  fixupHomePageUrl,
  isDefaultToolbar,
  useBrowserToolbarSettingsStore,
} from "@/desktop/browser/toolbar/settings";
import { CrButton, CrLinkRow } from "@/desktop/browser/webui/controls";
import { CrInput, CrRadioButton } from "@/desktop/browser/webui/form-controls";
import { MdSelect } from "@/desktop/browser/webui/md-select.electron";
import { WEBUI_LAYOUT } from "@/desktop/browser/webui/theme";
import {
  SettingsIndentedRows,
  SettingsRow,
  SettingsRowSeparator,
  SettingsToggleButton,
} from "./settings-rows";
import { useSettingsSectionSearch } from "./settings-search";
import { SettingsSection } from "./settings-section";
import { settingsSectionLabel } from "./titles";

// home-url-input: cr-input at --cr-input-width 50% of its row, and at most 100 KB of text so a
// pasted page can't freeze it.
const HOME_URL_INPUT_WIDTH = "50%";
const HOME_URL_MAX_LENGTH = 102400;

type SidePanelSide = "left" | "right";

function HomePageChoice() {
  const { t } = useTranslation();
  const homePage = useBrowserToolbarSettingsStore((state) => state.homePage);
  const setHomePage = useBrowserToolbarSettingsStore((state) => state.setHomePage);
  const [isUrlInvalid, setIsUrlInvalid] = useState(false);
  const [urlResetCount, setUrlResetCount] = useState(0);
  const chooseNewTabPage = useCallback(() => setHomePage({ isNewTabPage: true }), [setHomePage]);
  const chooseUrl = useCallback(() => setHomePage({ isNewTabPage: false }), [setHomePage]);
  // HomeUrlInputElement.onInput_: checked as it's typed; an empty field is the new tab page.
  const checkUrl = useCallback((text: string) => {
    setIsUrlInvalid(fixupHomePageUrl(text) === null);
  }, []);
  // onChange_: an address is saved; leaving an invalid one puts the saved address back.
  const commitUrl = useCallback(
    (text: string) => {
      const url = fixupHomePageUrl(text);
      if (url === null) {
        setIsUrlInvalid(false);
        setUrlResetCount((count) => count + 1);
        return;
      }
      setHomePage({ url });
    },
    [setHomePage],
  );
  const clearInvalid = useCallback(() => setIsUrlInvalid(false), []);
  return (
    <SettingsIndentedRows>
      <CrRadioButton
        label={t("workspace.browser.settings.appearance.homePageNtp")}
        isChecked={homePage.isNewTabPage}
        onCheck={chooseNewTabPage}
        testID="home-page-new-tab"
      />
      <CrRadioButton
        isChecked={!homePage.isNewTabPage}
        onCheck={chooseUrl}
        isTopAligned
        testID="home-page-custom"
      >
        <View style={styles.urlField}>
          <CrInput
            value={homePage.url}
            resetKey={urlResetCount}
            placeholder={t("workspace.browser.settings.appearance.enterCustomWebAddress")}
            accessibilityLabel={t("workspace.browser.settings.appearance.enterCustomWebAddress")}
            isInvalid={isUrlInvalid}
            errorText={t("workspace.browser.settings.appearance.notValid")}
            width={HOME_URL_INPUT_WIDTH}
            maxLength={HOME_URL_MAX_LENGTH}
            isTabbable={!homePage.isNewTabPage}
            onFocus={chooseUrl}
            onChangeText={checkUrl}
            onCommit={commitUrl}
            onRevert={clearInvalid}
            testID="home-page-url"
          />
        </View>
      </CrRadioButton>
    </SettingsIndentedRows>
  );
}

/**
 * #toolbarRow: 自定义工具栏 opens the toolbar's side panel; once the toolbar differs from a fresh
 * profile's, 重置为默认设置 beside it puts the buttons back.
 */
function CustomizeToolbarRow({
  label,
  isResettable,
  onCustomizeToolbar,
}: {
  label: string;
  isResettable: boolean;
  onCustomizeToolbar: () => void;
}) {
  const { t } = useTranslation();
  const resetToDefaults = useBrowserToolbarSettingsStore((state) => state.resetToDefaults);
  return (
    <View style={styles.toolbarRow}>
      <View style={styles.toolbarLink}>
        <CrLinkRow
          label={label}
          isExternal
          hasSeparator={false}
          onPress={onCustomizeToolbar}
          testID="appearance-customize-toolbar"
        />
      </View>
      {isResettable ? (
        <>
          <SettingsRowSeparator hasStartGap={false} />
          <View style={styles.resetToolbarButton}>
            <CrButton
              label={t("workspace.browser.settings.appearance.resetToDefault")}
              accessibilityLabel={t("workspace.browser.settings.appearance.resetToolbarToDefault")}
              onPress={resetToDefaults}
              testID="appearance-reset-toolbar"
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

/**
 * settings-appearance-page with the rows this browser backs: 自定义工具栏, the home button and
 * where it goes, and which side the panels open on. Chrome's themes, mode, bookmarks bar, tab
 * strip, fonts and zoom rows need features this browser doesn't have.
 */
export function AppearancePage({ onCustomizeToolbar }: { onCustomizeToolbar: () => void }) {
  const { t } = useTranslation();
  const showHomeButton = useBrowserToolbarSettingsStore((state) => state.showHomeButton);
  const showForwardButton = useBrowserToolbarSettingsStore((state) => state.showForwardButton);
  const pinnedActions = useBrowserToolbarSettingsStore((state) => state.pinnedActions);
  const homePage = useBrowserToolbarSettingsStore((state) => state.homePage);
  const setShowHomeButton = useBrowserToolbarSettingsStore((state) => state.setShowHomeButton);
  const isRightAligned = useSidePanelPositionStore((state) => state.isRightAligned);
  const setIsRightAligned = useSidePanelPositionStore((state) => state.setIsRightAligned);
  const sidePanelOptions = useMemo(
    () => [
      { value: "left" as const, label: t("workspace.browser.settings.appearance.sidePanelLeft") },
      { value: "right" as const, label: t("workspace.browser.settings.appearance.sidePanelRight") },
    ],
    [t],
  );
  const chooseSidePanelSide = useCallback(
    (side: SidePanelSide) => setIsRightAligned(side === "right"),
    [setIsRightAligned],
  );

  // AppearancePageElement.getShowHomeSubLabel_: off, the new tab page, the address, or 自定义
  // while no address has been saved.
  let homeSubLabel = t("workspace.browser.settings.appearance.homeButtonDisabled");
  if (showHomeButton && homePage.isNewTabPage) {
    homeSubLabel = t("workspace.browser.settings.appearance.homePageNtp");
  } else if (showHomeButton) {
    homeSubLabel = homePage.url || t("workspace.browser.settings.appearance.customWebAddress");
  }
  const sidePanelsLabel = t("workspace.browser.settings.appearance.sidePanels", {
    product: PRODUCT_NAME,
  });
  const title = settingsSectionLabel("appearance", t);
  const customizeToolbarLabel = t("workspace.browser.settings.appearance.customizeToolbar");
  const homeButtonLabel = t("workspace.browser.settings.appearance.showHomeButton");
  const sidePanelPositionLabel = t("workspace.browser.settings.appearance.sidePanelPosition");
  const isToolbarResettable = !isDefaultToolbar({
    showHomeButton,
    showForwardButton,
    pinnedActions,
  });
  const isShown = useSettingsSectionSearch("appearance", [
    title,
    customizeToolbarLabel,
    isToolbarResettable ? t("workspace.browser.settings.appearance.resetToDefault") : "",
    homeButtonLabel,
    homeSubLabel,
    sidePanelPositionLabel,
    sidePanelsLabel,
    ...sidePanelOptions.map((option) => option.label),
  ]);
  if (!isShown) {
    return null;
  }

  return (
    <SettingsSection title={title} testID="browser-settings-appearance">
      <CustomizeToolbarRow
        label={customizeToolbarLabel}
        isResettable={isToolbarResettable}
        onCustomizeToolbar={onCustomizeToolbar}
      />
      <SettingsToggleButton
        label={homeButtonLabel}
        subLabel={homeSubLabel}
        isOn={showHomeButton}
        onChange={setShowHomeButton}
        testID="appearance-home-button"
      />
      {showHomeButton ? <HomePageChoice /> : null}
      <SettingsRow label={sidePanelPositionLabel} />
      <SettingsIndentedRows>
        <SettingsRow label={sidePanelsLabel} isContinuation>
          <MdSelect
            value={isRightAligned ? "right" : "left"}
            options={sidePanelOptions}
            accessibilityLabel={sidePanelsLabel}
            onChange={chooseSidePanelSide}
            testID="appearance-side-panel-position"
          />
        </SettingsRow>
      </SettingsIndentedRows>
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  urlField: {
    flex: 1,
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  toolbarLink: {
    flex: 1,
  },
  // The button ends where the card's rows end their text.
  resetToolbarButton: {
    marginRight: WEBUI_LAYOUT.rowPadding,
  },
});
