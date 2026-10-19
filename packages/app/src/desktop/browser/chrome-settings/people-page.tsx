import { useCallback, type Ref } from "react";
import { Image, Pressable, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { chromeAvatarImage } from "@/desktop/browser/profile/avatars";
import { profileDisplayName, useBrowserProfileStore } from "@/desktop/browser/profile/store";
import { CrIconButton, CrLinkRow } from "@/desktop/browser/webui/controls";
import { CrHighlightedText } from "@/desktop/browser/webui/search-highlight";
import { WEBUI_LAYOUT } from "@/desktop/browser/webui/theme";
import { useSettingsSectionSearch } from "./settings-search";
import { SettingsSection } from "./settings-section";
import { settingsSectionLabel, settingsSubpageLabel } from "./titles";

type HoverState = PressableStateCallbackType & { hovered?: boolean };

// #profile-row: a two-line row with the profile's 40 dip avatar, 16 dip before its name, and the
// 32 dip subpage arrow, which pulls 8 dip into the row's end padding. The row presses as a whole;
// the arrow is what takes focus.
const PROFILE_ROW_MIN_HEIGHT = 64;
const PROFILE_ICON_SIZE = 40;
const PROFILE_NAME_GAP = 16;
const ARROW_BUTTON_MARGIN_START = 16;
const ARROW_BUTTON_MARGIN_END = -8;

function ProfileRow({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const name = useBrowserProfileStore((state) => state.name);
  const avatarId = useBrowserProfileStore((state) => state.avatarId);
  const rowStyle = useCallback(
    ({ hovered, pressed }: HoverState) => [
      styles.profileRow,
      hovered && styles.hovered,
      pressed && styles.pressed,
    ],
    [],
  );
  return (
    <Pressable tabIndex={-1} onPress={onPress} style={rowStyle} testID="people-profile-row">
      <Image source={chromeAvatarImage(avatarId)} style={styles.profileIcon} />
      <View style={styles.profileName}>
        <CrHighlightedText text={profileDisplayName(name, t)} style={styles.profileNameText} />
      </View>
      <View style={styles.arrowButton}>
        <CrIconButton
          icon="subpageArrow"
          label={settingsSubpageLabel("manageProfile", t)}
          isInActionableRow
          onPress={onPress}
        />
      </View>
    </Pressable>
  );
}

/**
 * settings-people-page as Chrome shows it with sync off: the profile, 自定义个人资料 and
 * 导入书签和设置. Google 服务, sign-in and sync need a Google account this browser doesn't have.
 */
export function PeoplePage({
  onOpenManageProfile,
  onOpenImportData,
  manageProfileEntryRef,
}: {
  onOpenManageProfile: () => void;
  onOpenImportData: () => void;
  /** 自定义个人资料, which takes focus back when 自定义个人资料's subpage is left. */
  manageProfileEntryRef: Ref<View>;
}) {
  const { t } = useTranslation();
  const name = useBrowserProfileStore((state) => state.name);
  const title = settingsSectionLabel("people", t);
  const customizeLabel = settingsSubpageLabel("manageProfile", t);
  const importLabel = t("workspace.browser.importData.title");
  const isShown = useSettingsSectionSearch("people", [
    title,
    profileDisplayName(name, t),
    customizeLabel,
    importLabel,
  ]);
  if (!isShown) {
    return null;
  }
  return (
    <SettingsSection title={title} testID="browser-settings-people">
      <ProfileRow onPress={onOpenManageProfile} />
      <CrLinkRow
        ref={manageProfileEntryRef}
        label={customizeLabel}
        isExternal={false}
        onPress={onOpenManageProfile}
        testID="people-customize-profile"
      />
      <CrLinkRow
        label={importLabel}
        isExternal={false}
        onPress={onOpenImportData}
        testID="people-import-data"
      />
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    profileRow: {
      minHeight: PROFILE_ROW_MIN_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: WEBUI_LAYOUT.rowPadding,
    },
    hovered: {
      backgroundColor: colors.hover,
    },
    pressed: {
      backgroundColor: colors.pressed,
    },
    profileIcon: {
      width: PROFILE_ICON_SIZE,
      height: PROFILE_ICON_SIZE,
      borderRadius: PROFILE_ICON_SIZE / 2,
    },
    profileName: {
      flex: 1,
      paddingLeft: PROFILE_NAME_GAP,
      paddingVertical: WEBUI_LAYOUT.sectionVerticalPadding,
    },
    profileNameText: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: WEBUI_LAYOUT.fontSize,
      lineHeight: WEBUI_LAYOUT.lineHeight,
      color: colors.text,
    },
    arrowButton: {
      marginLeft: ARROW_BUTTON_MARGIN_START,
      marginRight: ARROW_BUTTON_MARGIN_END,
    },
  };
});
