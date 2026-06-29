import { observer } from "mobx-react-lite";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { themeModel } from "../theme/theme-model";

// Native fallback for the shell backdrop: no CSS gradients off-web, so paint a single flat solid
// filling the window with the backdrop base colour (the average tone of the four gradient corners).
// This milestone is desktop-first; native just needs a sensible solid behind the cards. It is the
// first child of shell-root, absolutely filling it so it sits behind the top bar + cards. The
// web/electron build resolves the sibling `.web.tsx` (the real bilinear gradient) instead.
export const ShellBackdrop = observer(function ShellBackdrop() {
  const { backdrop } = themeModel.tokens;
  const style = useMemo(() => [StyleSheet.absoluteFill, { backgroundColor: backdrop }], [backdrop]);
  return <View pointerEvents="none" style={style} />;
});
