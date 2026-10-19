import { useMemo } from "react";
import { Image, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChromeIcon } from "../chrome-icons";
import { chromeColorProps } from "../chrome-theme";
import type { ChromeAvatarId } from "./avatar-ids";
import { chromeAvatarImage } from "./avatars";

const ThemedChromeIcon = withUnistyles(ChromeIcon);
const placeholderMapping = chromeColorProps("avatarPlaceholder");

// CreatePaddedIcon(glyph, size, color, 0.5): the profile menu's placeholder glyph fills half its
// disc.
const PADDED_GLYPH_RATIO = 0.5;

/**
 * The profile's avatar as Chrome's own UI draws it: the picked image cropped to a circle, or the
 * placeholder's outline glyph in the color Chrome derives from the frame. `isPadded` puts the
 * placeholder on a disc of the bubble's background, its glyph at half the size, as the profile
 * menu shows it; the toolbar shows the bare glyph.
 */
export function ProfileAvatar({
  avatarId,
  size,
  isPadded,
}: {
  avatarId: ChromeAvatarId | null;
  size: number;
  isPadded: boolean;
}) {
  const circleStyle = useMemo(
    () => ({ width: size, height: size, borderRadius: size / 2 }),
    [size],
  );
  if (avatarId !== null) {
    return <Image source={chromeAvatarImage(avatarId)} style={circleStyle} />;
  }
  if (!isPadded) {
    return <ThemedChromeIcon name="avatarPlaceholder" size={size} uniProps={placeholderMapping} />;
  }
  return (
    <View style={[styles.disc, circleStyle]}>
      <ThemedChromeIcon
        name="avatarPlaceholder"
        size={size * PADDED_GLYPH_RATIO}
        uniProps={placeholderMapping}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  disc: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.chrome.bubble,
  },
}));
