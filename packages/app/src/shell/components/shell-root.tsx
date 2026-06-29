import { observer } from "mobx-react-lite";
import { Fragment, useLayoutEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { getIsElectronMac } from "@/constants/platform";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppSettings } from "@/hooks/use-settings";
import { DEFAULT_LOCALE, parseAppLanguage } from "@/i18n/locales";
import { i18nModel } from "../i18n/i18n-model";
import { type ShellContext, shellModel } from "../model/shell-model";
import { WINDOW_PADDING } from "../theme/shell-tokens";
import { resolveThemeScheme, themeModel } from "../theme/theme-model";
import { RegionFrame } from "./region-frame";
import { RegionGutter } from "./region-gutter";
import { RegionPlaceholder } from "./region-placeholder";
import { SettingsEntry } from "./settings-entry";
import { ShellBackdrop } from "./shell-backdrop";
import { TopBar } from "./top-bar";

// The one bridge from app inputs to the shell models: the route context, the theme scheme
// (derived from the app's own settings + system scheme — never a style-factory colorScheme),
// and the locale (mirrored from the app's already-resolved i18n language). Layout effects so
// the models are current before paint (no first-frame flash). This is the single writer for
// setContext/setScheme/setLocale; no component reaches the external sources itself.
function useShellBridge(ctx: ShellContext): void {
  const { settings } = useAppSettings();
  const systemScheme = useColorScheme();
  const { i18n } = useTranslation();
  const language = i18n.language;

  useLayoutEffect(() => {
    shellModel.setContext(ctx);
  }, [ctx]);

  useLayoutEffect(() => {
    themeModel.setScheme(resolveThemeScheme(settings.theme, systemScheme ?? null));
  }, [settings.theme, systemScheme]);

  useLayoutEffect(() => {
    const parsed = parseAppLanguage(language);
    i18nModel.setLocale(parsed && parsed !== "system" ? parsed : DEFAULT_LOCALE);
  }, [language]);
}

// The shell's route-level assembly. It feeds the models the route context + theme/locale,
// then lays out the window-wide top bar over the row of floating cards. Card order is fixed
// left → center → right → file tree, gutters between. Every region is an empty placeholder
// this milestone; open/close/drag/page-switch all work on top of it. Pure composition over
// the model — it reads computeds and renders, holding no layout state itself. `observer` so
// every model change repaints it.
export const ShellRoot = observer(function ShellRoot({ ctx }: { ctx: ShellContext }) {
  useShellBridge(ctx);
  const visible = shellModel.visibleRegions;
  const isSettings = shellModel.currentPage === "settings";
  const { showsShell, workspaceKey } = shellModel;
  // The shell-root base fill. On macOS Electron it is transparent so the half-transparent
  // ShellBackdrop is the ONLY layer behind the cards and the real desktop shows through it (the
  // app's transparent ancestor chain in _layout lets the desktop reach here). Off mac (browser web
  // + native) there is no desktop to reveal, so we paint the opaque flat backdrop as the base — a
  // white ancestor would otherwise show through. ShellBackdrop paints over this base (the bilinear
  // gradient on web/electron, a flat solid on native) as the first child, behind the top bar + cards.
  const backdrop = themeModel.tokens.backdrop;
  const rootBg = getIsElectronMac() ? "transparent" : backdrop;
  const rootStyle = useMemo(() => [styles.root, { backgroundColor: rootBg }], [rootBg]);
  return (
    <View style={rootStyle} testID="shell-root">
      <ShellBackdrop />
      {showsShell ? <TopBar /> : null}
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
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "column",
    gap: 4,
    paddingTop: WINDOW_PADDING.top,
    paddingHorizontal: WINDOW_PADDING.horizontal,
    paddingBottom: WINDOW_PADDING.bottom,
  },
  row: { flex: 1, minHeight: 0, flexDirection: "row" },
});
