import { observer } from "mobx-react-lite";
import { createElement } from "react";
import { getIsElectronMac } from "@/constants/platform";
import { themeModel } from "../theme/theme-model";

// The window-wide bilinear four-corner gradient backdrop (web/electron). It blends the four
// chairman-fixed corners — top edge bluer, bottom edge greyer — across the whole window. On
// macOS Electron the window itself is transparent with NO system vibrancy, and this whole
// backdrop is painted at <1 alpha, so the real desktop shows through the light-blue wash. The
// solid cards floating over it stay fully opaque.
//
// Why two stacked raw <div>s instead of a react-native-web View: RNW's View style pipeline does
// not pass `backgroundImage` / `maskImage` through to the DOM, and a single CSS layer cannot
// express a 2D bilinear blend. So:
//   - outer div: the BOTTOM edge gradient, left → right (bottomLeft → bottomRight), filling the window.
//   - inner div: the TOP edge gradient, left → right (topLeft → topRight), masked to fade from fully
//     opaque at the top to transparent at the bottom.
// Alpha-compositing the masked top layer over the bottom layer interpolates each column vertically
// between its top and bottom colour, and each row already interpolates horizontally — the exact
// bilinear blend, with the four window corners reading out as the four exact corner values.
//
// Transparency is carried by a SINGLE group `opacity` on the outer div, not by per-corner alpha:
// the corner colours stay fully opaque so the masked top layer never alpha-stacks over the bottom
// layer (which would read more opaque up top and break the uniform translucency); the one group
// opacity then makes the whole composited blend uniformly translucent. Browser web keeps opacity 1
// (no desktop behind it to reveal) — zero non-desktop regression.
//
// pointerEvents:none so it never intercepts input; it absolutely fills shell-root (rendered as the
// first child there, so it sits behind the top bar + cards). Corner values come from ThemeModel —
// model-driven, no colour literals in the component.
export const ShellBackdrop = observer(function ShellBackdrop() {
  const { topLeft, topRight, bottomLeft, bottomRight } = themeModel.tokens.backdropGradient;
  const fill = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;
  // macOS Electron: translucent so the real desktop shows through. Browser web: opaque.
  const backdropOpacity = getIsElectronMac() ? 0.5 : 1;
  return createElement(
    "div",
    {
      "aria-hidden": true,
      style: {
        ...fill,
        backgroundImage: `linear-gradient(to right, ${bottomLeft}, ${bottomRight})`,
        opacity: backdropOpacity,
        pointerEvents: "none",
      },
    },
    createElement("div", {
      style: {
        ...fill,
        backgroundImage: `linear-gradient(to right, ${topLeft}, ${topRight})`,
        maskImage: "linear-gradient(to bottom, #000, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, #000, transparent)",
      },
    }),
  );
});
