import { Fragment, useCallback } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { WebUiIconName } from "@/desktop/browser/webui/icons";
import { CrNavMenuItem, CrNavMenuSeparator } from "@/desktop/browser/webui/nav-menu";
import { SETTINGS_MENU_GROUPS, type SettingsMenuSection, type SettingsSection } from "./routes";
import { settingsSectionLabel } from "./titles";

// settings-ui's --settings-menu-width, which the menu has in the page's left column; in the
// drawer it fills the drawer. settings-menu pads its list 8 dip above and 5 below.
export const SETTINGS_MENU_WIDTH = 266;

const SECTION_ICONS: Record<SettingsMenuSection, WebUiIconName> = {
  people: "settingsPerson",
  privacy: "settingsSecurity",
  appearance: "settingsPalette",
  search: "settingsSearch",
  downloads: "settingsDownload",
  reset: "settingsRestartAlt",
};

function SectionItem({
  section,
  isSelected,
  onSelect,
}: {
  section: SettingsMenuSection;
  isSelected: boolean;
  onSelect: (section: SettingsSection) => void;
}) {
  const { t } = useTranslation();
  const select = useCallback(() => onSelect(section), [onSelect, section]);
  return (
    <CrNavMenuItem
      icon={SECTION_ICONS[section]}
      label={settingsSectionLabel(section, t)}
      isSelected={isSelected}
      onPress={select}
      testID={`browser-settings-menu-${section}`}
    />
  );
}

/**
 * settings-menu: the sections in Chrome's groups, then 扩展程序, which opens chrome://extensions
 * in a new tab, and 关于. No item is selected while a search shows sections of every page.
 */
export function SettingsMenu({
  section,
  onSelect,
  onOpenExtensions,
}: {
  section: SettingsSection | null;
  onSelect: (section: SettingsSection) => void;
  onOpenExtensions: () => void;
}) {
  const { t } = useTranslation();
  const isAboutSelected = section === "about";
  const selectAbout = useCallback(() => onSelect("about"), [onSelect]);
  return (
    <View accessibilityRole="menu" style={styles.menu} testID="browser-settings-menu">
      {SETTINGS_MENU_GROUPS.map((group) => (
        <Fragment key={group.join()}>
          {group.map((groupSection) => (
            <SectionItem
              key={groupSection}
              section={groupSection}
              isSelected={groupSection === section}
              onSelect={onSelect}
            />
          ))}
          <CrNavMenuSeparator variant="settings" />
        </Fragment>
      ))}
      <CrNavMenuItem
        icon="settingsChromeExtension"
        label={t("workspace.browser.extensions.page.title")}
        isSelected={false}
        isExternal
        onPress={onOpenExtensions}
        testID="browser-settings-menu-extensions"
      />
      <CrNavMenuItem
        icon="product"
        label={settingsSectionLabel("about", t)}
        isSelected={isAboutSelected}
        onPress={selectAbout}
        testID="browser-settings-menu-about"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    paddingTop: 8,
    paddingBottom: 5,
  },
});
