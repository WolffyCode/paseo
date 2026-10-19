import { useCallback, useState, type ReactNode, type Ref } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { PRODUCT_NAME } from "@/constants/product";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { ProfileAvatarSelector } from "@/desktop/browser/profile/avatar-selector";
import {
  profileDisplayName,
  profileNameToSave,
  useBrowserProfileStore,
} from "@/desktop/browser/profile/store";
import { CrInput } from "@/desktop/browser/webui/form-controls";
import { WEBUI_LAYOUT } from "@/desktop/browser/webui/theme";
import { SettingsSubpage } from "./settings-subpage";
import { settingsSubpageLabel } from "./titles";

// settings-manage-profile: a section is its title (cr-title-text, 9.38 dip above and below), then
// its content indented 40 dip with 4 dip above; it ends 24 dip lower, and every section after the
// first has a line and 4 dip above it.
const SECTION_PADDING_BOTTOM = 24;
const SECTION_PADDING_TOP = 4;
const TITLE_MARGIN = 9.38;
const TITLE_FONT_SIZE = 14;
const CONTENT_INDENT = 40;
const CONTENT_PADDING_TOP = 4;
const NAME_INPUT_WIDTH = 288;
const NAME_MAX_LENGTH = 500;
// #profileAvatarSelector: 72 dip avatars 25 apart, 4 dip of room for the selected outline and
// 10 below.
const AVATAR_SIZE = 72;
const AVATAR_SPACING = 25;
const AVATAR_SELECTOR_PADDING = 4;
const AVATAR_SELECTOR_MARGIN_BOTTOM = 10;

function ManageProfileSection({
  title,
  isFirst = false,
  children,
}: {
  title: string;
  isFirst?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={[styles.section, !isFirst && styles.laterSection]}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

/**
 * settings-manage-profile (自定义个人资料): the profile's name, saved when the field is left or
 * Enter is pressed, and its avatar, picked with one click. Chrome's theme color row needs browser
 * themes this browser doesn't have.
 */
export function ManageProfilePage({
  onBack,
  backButtonRef,
}: {
  onBack: () => void;
  backButtonRef: Ref<View>;
}) {
  const { t } = useTranslation();
  const name = useBrowserProfileStore((state) => state.name);
  const avatarId = useBrowserProfileStore((state) => state.avatarId);
  const setName = useBrowserProfileStore((state) => state.setName);
  const setAvatar = useBrowserProfileStore((state) => state.setAvatar);
  const [isNameInvalid, setIsNameInvalid] = useState(false);
  const displayName = profileDisplayName(name, t);

  const checkName = useCallback((text: string) => {
    setIsNameInvalid(profileNameToSave(text) === null);
  }, []);
  // onNameInputChange_: an invalid name is kept in the field but not saved. Leaving the default
  // name as it is keeps it the default, so it follows the language.
  const commitName = useCallback(
    (text: string) => {
      const savedName = profileNameToSave(text);
      if (savedName === null || savedName === displayName) return;
      setName(savedName);
    },
    [displayName, setName],
  );
  const clearInvalid = useCallback(() => setIsNameInvalid(false), []);

  return (
    <SettingsSubpage
      title={settingsSubpageLabel("manageProfile", t)}
      onBack={onBack}
      backButtonRef={backButtonRef}
      testID="browser-settings-manage-profile"
    >
      <ManageProfileSection
        title={t("workspace.browser.settings.people.nameYourProfile", { product: PRODUCT_NAME })}
        isFirst
      >
        <CrInput
          value={displayName}
          accessibilityLabel={t("workspace.browser.settings.people.nameInputLabel")}
          isInvalid={isNameInvalid}
          width={NAME_INPUT_WIDTH}
          maxLength={NAME_MAX_LENGTH}
          onChangeText={checkName}
          onCommit={commitName}
          onRevert={clearInvalid}
          testID="manage-profile-name"
        />
      </ManageProfileSection>
      <ManageProfileSection title={t("workspace.browser.settings.people.pickAvatar")}>
        <ScrollView horizontal contentContainerStyle={styles.avatarSelector}>
          <ProfileAvatarSelector
            selectedAvatarId={avatarId}
            avatarSize={AVATAR_SIZE}
            spacing={AVATAR_SPACING}
            onSelect={setAvatar}
          />
        </ScrollView>
      </ManageProfileSection>
    </SettingsSubpage>
  );
}

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    section: {
      paddingHorizontal: WEBUI_LAYOUT.rowPadding,
      paddingBottom: SECTION_PADDING_BOTTOM,
    },
    laterSection: {
      paddingTop: SECTION_PADDING_TOP,
      borderTopWidth: 1,
      borderTopColor: colors.separator,
    },
    sectionTitle: {
      marginVertical: TITLE_MARGIN,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: TITLE_FONT_SIZE,
      fontWeight: "500",
      lineHeight: WEBUI_LAYOUT.lineHeight,
      color: colors.titleText,
    },
    content: {
      paddingLeft: CONTENT_INDENT,
      paddingTop: CONTENT_PADDING_TOP,
    },
    avatarSelector: {
      padding: AVATAR_SELECTOR_PADDING,
      marginBottom: AVATAR_SELECTOR_MARGIN_BOTTOM,
    },
  };
});
