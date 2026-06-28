import { Fragment } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { type ShellContext, useShell } from "../api/use-shell";
import { SHELL_COLORS, SHELL_USES_VIBRANCY, WINDOW_PADDING } from "../theme/shell-tokens";
import { RegionFrame } from "./region-frame";
import { RegionGutter } from "./region-gutter";
import { RegionPlaceholder } from "./region-placeholder";
import { SettingsEntry } from "./settings-entry";
import { TopBar } from "./top-bar";

// The shell's route-level assembly: read the route context, derive page + visible regions
// + top bar through the facade, and lay out the window-wide top bar over the row of cards.
// Card order is fixed left → center → right → file tree, gutters between. Every region is
// an empty placeholder this milestone; the open/close/drag/page-switch all work on top of
// it. Pure composition — it reads selectors and renders, holding no layout state itself.

export function ShellRoot({ ctx }: { ctx: ShellContext }) {
  const { page, visible, topBar, actions } = useShell(ctx);
  const isSettings = page === "settings";
  const { workspaceKey } = ctx;
  return (
    <View style={styles.root}>
      {ctx.showsShell ? <TopBar model={topBar} actions={actions} /> : null}
      <View style={styles.row}>
        {visible.left != null ? (
          <Fragment>
            <RegionFrame kind="sidebar" width={visible.left}>
              <RegionPlaceholder variant={isSettings ? "settingsNav" : "left"} />
              {isSettings ? null : <SettingsEntry />}
            </RegionFrame>
            <RegionGutter region="left" currentWidth={visible.left} />
          </Fragment>
        ) : null}

        <RegionFrame kind="main">
          <RegionPlaceholder variant={isSettings ? "settingsContent" : "center"} />
        </RegionFrame>

        {visible.right != null && workspaceKey != null ? (
          <Fragment>
            <RegionGutter region="right" workspaceKey={workspaceKey} currentWidth={visible.right} />
            <RegionFrame kind="content" width={visible.right}>
              <RegionPlaceholder variant="right" />
            </RegionFrame>
          </Fragment>
        ) : null}

        {visible.fileTree != null && workspaceKey != null ? (
          <Fragment>
            <RegionGutter
              region="fileTree"
              workspaceKey={workspaceKey}
              currentWidth={visible.fileTree}
            />
            <RegionFrame kind="content" width={visible.fileTree}>
              <RegionPlaceholder variant="fileTree" />
            </RegionFrame>
          </Fragment>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    flexDirection: "column",
    gap: 4,
    paddingTop: WINDOW_PADDING.top,
    paddingHorizontal: WINDOW_PADDING.horizontal,
    paddingBottom: WINDOW_PADDING.bottom,
    // Approach C: transparent on macOS Electron so the window vibrancy reads through;
    // the periwinkle fallback everywhere else.
    backgroundColor: SHELL_USES_VIBRANCY ? "transparent" : SHELL_COLORS[theme.colorScheme].backdrop,
  },
  row: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
  },
}));
