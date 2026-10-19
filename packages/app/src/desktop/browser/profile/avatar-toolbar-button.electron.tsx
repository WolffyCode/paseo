import { forwardRef } from "react";
import type { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ChromeToolbarButton } from "../chrome-controls";
import { CHROME_LAYOUT } from "../chrome-theme";
import { ProfileAvatar } from "./profile-avatar";
import { useBrowserProfileStore } from "./store";

/**
 * AvatarToolbarButton in its normal state, just before ⋮: the profile's avatar, which opens the
 * profile menu. With one local profile and no Google sign-in it never grows Chrome's sign-in,
 * sync or work pills.
 */
export const AvatarToolbarButton = forwardRef<View, { isMenuOpen: boolean; onPress: () => void }>(
  function AvatarToolbarButton({ isMenuOpen, onPress }, ref) {
    const { t } = useTranslation();
    const name = useBrowserProfileStore((state) => state.name);
    const avatarId = useBrowserProfileStore((state) => state.avatarId);
    // GetAvatarNameForProfile: the only profile, still on its default name, goes by 您.
    const label = name ?? t("workspace.browser.profile.singleProfileName");
    return (
      <ChromeToolbarButton
        ref={ref}
        label={label}
        isActive={isMenuOpen}
        onPress={onPress}
        testID="browser-avatar-button"
      >
        <ProfileAvatar avatarId={avatarId} size={CHROME_LAYOUT.toolbarIconSize} isPadded={false} />
      </ChromeToolbarButton>
    );
  },
);
