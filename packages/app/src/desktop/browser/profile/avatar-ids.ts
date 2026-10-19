/**
 * Chrome's default avatars in its picker's order (profile_avatar_icon_util.cc, IDR_PROFILE_AVATAR
 * 27–55). Each also names its label under workspace.browser.profile.avatars.
 */
export const CHROME_AVATAR_IDS = [
  "cat",
  "corgi",
  "dragon",
  "elephant",
  "fox",
  "monkey",
  "panda",
  "penguin",
  "butterfly",
  "rabbit",
  "unicorn",
  "basketball",
  "bike",
  "bird",
  "cheese",
  "football",
  "ramen",
  "sunglasses",
  "sushi",
  "tamagotchi",
  "vinyl",
  "avocado",
  "cappuccino",
  "iceCream",
  "iceWater",
  "melon",
  "onigiri",
  "pizza",
  "sandwich",
] as const;

export type ChromeAvatarId = (typeof CHROME_AVATAR_IDS)[number];
