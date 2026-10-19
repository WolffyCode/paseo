// react-native-web's Pressable hands `onKeyDown` the DOM keydown after its own press handling,
// but the bundled react-native types don't declare it.
import "react-native";
import type { KeyboardEvent } from "react";

declare module "react-native" {
  interface PressableProps {
    onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  }
}
