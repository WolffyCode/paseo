import type { ImageSourcePropType } from "react-native";
import type { ChromeAvatarId } from "./avatar-ids";

// Chrome's default avatars as the 96 px images chrome://theme serves for them.
const AVATAR_IMAGES: Record<ChromeAvatarId, ImageSourcePropType> = {
  cat: require("../../../../assets/images/chrome-avatars/cat.png"),
  corgi: require("../../../../assets/images/chrome-avatars/corgi.png"),
  dragon: require("../../../../assets/images/chrome-avatars/dragon.png"),
  elephant: require("../../../../assets/images/chrome-avatars/elephant.png"),
  fox: require("../../../../assets/images/chrome-avatars/fox.png"),
  monkey: require("../../../../assets/images/chrome-avatars/monkey.png"),
  panda: require("../../../../assets/images/chrome-avatars/panda.png"),
  penguin: require("../../../../assets/images/chrome-avatars/penguin.png"),
  butterfly: require("../../../../assets/images/chrome-avatars/butterfly.png"),
  rabbit: require("../../../../assets/images/chrome-avatars/rabbit.png"),
  unicorn: require("../../../../assets/images/chrome-avatars/unicorn.png"),
  basketball: require("../../../../assets/images/chrome-avatars/basketball.png"),
  bike: require("../../../../assets/images/chrome-avatars/bike.png"),
  bird: require("../../../../assets/images/chrome-avatars/bird.png"),
  cheese: require("../../../../assets/images/chrome-avatars/cheese.png"),
  football: require("../../../../assets/images/chrome-avatars/football.png"),
  ramen: require("../../../../assets/images/chrome-avatars/ramen.png"),
  sunglasses: require("../../../../assets/images/chrome-avatars/sunglasses.png"),
  sushi: require("../../../../assets/images/chrome-avatars/sushi.png"),
  tamagotchi: require("../../../../assets/images/chrome-avatars/tamagotchi.png"),
  vinyl: require("../../../../assets/images/chrome-avatars/vinyl.png"),
  avocado: require("../../../../assets/images/chrome-avatars/avocado.png"),
  cappuccino: require("../../../../assets/images/chrome-avatars/cappuccino.png"),
  iceCream: require("../../../../assets/images/chrome-avatars/ice-cream.png"),
  iceWater: require("../../../../assets/images/chrome-avatars/ice-water.png"),
  melon: require("../../../../assets/images/chrome-avatars/melon.png"),
  onigiri: require("../../../../assets/images/chrome-avatars/onigiri.png"),
  pizza: require("../../../../assets/images/chrome-avatars/pizza.png"),
  sandwich: require("../../../../assets/images/chrome-avatars/sandwich.png"),
};

/**
 * The default avatar Chrome generates for a profile that hasn't picked one: its account icon on
 * the default profile color, the same in light and dark (profile_avatar_icon_util.cc
 * GetPlaceholderAvatarIconWithColors), as chrome://settings shows it.
 */
const PLACEHOLDER_AVATAR_IMAGE: ImageSourcePropType = require("../../../../assets/images/chrome-avatars/placeholder.png");

/** A profile's avatar image: the one it picked, or Chrome's placeholder. */
export function chromeAvatarImage(avatarId: ChromeAvatarId | null): ImageSourcePropType {
  return avatarId === null ? PLACEHOLDER_AVATAR_IMAGE : AVATAR_IMAGES[avatarId];
}
