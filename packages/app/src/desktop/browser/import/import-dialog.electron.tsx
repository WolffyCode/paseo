import { createElement, useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { DesktopChromeProfile } from "@/desktop/host";
import { ChromeCheckbox, ChromeDialogButton } from "@/desktop/browser/chrome-controls";
import { ChromeDialog } from "@/desktop/browser/chrome-dialog";
import {
  CHROME_FONT_FAMILY,
  chromeColorProps,
  type ChromeTheme,
} from "@/desktop/browser/chrome-theme";
import { importFromChrome, listChromeProfiles, type ChromeImportChoices } from "./chrome-import";

// Chrome lists a source as "<browser> - <profile>" (import_data_dialog.ts getProfileDisplayName_).
const CHROME_BROWSER_NAME = "Google Chrome";
// cr:check-circle, which Chrome draws at 80 dip once the import is done.
const SUCCESS_ICON_PATH =
  "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z";
const SUCCESS_ICON_SIZE = 80;
// md-select (ui/webui/resources/cr_elements/md_select_lit.css).
const SELECT_WIDTH = 200;
const SELECT_HEIGHT = 36;
const SELECT_SIDE_PADDING = 10;
const SELECT_ARROW_WIDTH = 7;
const SELECT_ARROW_GAP = 3;
const SPINNER_SIZE = 20;

type ImportPhase =
  | { kind: "loading" }
  | { kind: "choosing"; profiles: DesktopChromeProfile[]; isImporting: boolean }
  | { kind: "done"; failedExtensionNames: string[] };

interface SelectColors {
  borderColor: string;
  textColor: string;
  hoverColor: string;
  arrowColor: string;
}

function selectColors(theme: ChromeTheme): SelectColors {
  const { chrome } = theme;
  return {
    borderColor: chrome.selectBorder,
    textColor: chrome.bubbleText,
    hoverColor: chrome.toolbarHover,
    arrowColor: chrome.defaultFavicon,
  };
}

/** md-select's down arrow (//resources/images/arrow_down.svg) as a background image. */
function arrowImage(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12" fill="${color}"><path d="M0 0h24L12 12z"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** The source list: a native select styled as Chrome's md-select. */
function ProfileSelect({
  profiles,
  selectedDirectory,
  onSelect,
  isDisabled,
  label,
  borderColor,
  textColor,
  hoverColor,
  arrowColor,
}: SelectColors & {
  profiles: readonly DesktopChromeProfile[];
  selectedDirectory: string | null;
  onSelect: (directory: string) => void;
  isDisabled: boolean;
  label: string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onSelect(event.target.value);
    },
    [onSelect],
  );
  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);
  const style = useMemo(
    () => ({
      appearance: "none" as const,
      width: SELECT_WIDTH,
      maxWidth: "100%",
      height: SELECT_HEIGHT,
      boxSizing: "border-box" as const,
      paddingLeft: SELECT_SIDE_PADDING,
      paddingRight: SELECT_SIDE_PADDING + SELECT_ARROW_WIDTH + SELECT_ARROW_GAP,
      border: `1px solid ${borderColor}`,
      borderRadius: 8,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 12,
      color: textColor,
      backgroundColor: isHovered ? hoverColor : "transparent",
      backgroundImage: arrowImage(arrowColor),
      backgroundRepeat: "no-repeat",
      backgroundPosition: `calc(100% - ${SELECT_SIDE_PADDING}px) center`,
      backgroundSize: SELECT_ARROW_WIDTH,
      cursor: "pointer",
    }),
    [arrowColor, borderColor, hoverColor, isHovered, textColor],
  );
  return createElement(
    "select",
    {
      "aria-label": label,
      "data-testid": "browser-import-source",
      disabled: isDisabled,
      value: selectedDirectory ?? "",
      onChange: handleChange,
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      style,
    },
    profiles.map((profile) =>
      createElement(
        "option",
        { key: profile.directory, value: profile.directory },
        `${CHROME_BROWSER_NAME} - ${profile.name}`,
      ),
    ),
  );
}

const ThemedProfileSelect = withUnistyles(ProfileSelect);

function SuccessIcon({ color }: { color: string }) {
  return (
    <Svg width={SUCCESS_ICON_SIZE} height={SUCCESS_ICON_SIZE} viewBox="0 0 24 24">
      <Path d={SUCCESS_ICON_PATH} fill={color} />
    </Svg>
  );
}

const ThemedSuccessIcon = withUnistyles(SuccessIcon);
const ThemedSpinner = withUnistyles(ActivityIndicator);
const primaryMapping = chromeColorProps("buttonProminent");

/**
 * Chrome's "Import bookmarks and settings" dialog with the user's Chrome profiles as sources.
 * Opening it reads only the list of profiles; Import reads the chosen one.
 */
export function ChromeImportDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [phase, setPhase] = useState<ImportPhase>({ kind: "loading" });
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);
  const [choices, setChoices] = useState<ChromeImportChoices>({ extensions: true, toolbar: true });

  useEffect(() => {
    let isCurrent = true;
    void listChromeProfiles()
      .catch((error: unknown) => {
        console.error("[browser-import] could not list Chrome profiles", error);
        return [];
      })
      .then((profiles) => {
        if (!isCurrent) {
          return undefined;
        }
        setPhase({ kind: "choosing", profiles, isImporting: false });
        setSelectedDirectory(profiles[0]?.directory ?? null);
        return undefined;
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  const isImporting = phase.kind === "choosing" && phase.isImporting;
  const handleEscape = useCallback(() => {
    if (!isImporting) {
      onClose();
    }
  }, [isImporting, onClose]);
  const setExtensionsChosen = useCallback((isChosen: boolean) => {
    setChoices((current) => ({ ...current, extensions: isChosen }));
  }, []);
  const setToolbarChosen = useCallback((isChosen: boolean) => {
    setChoices((current) => ({ ...current, toolbar: isChosen }));
  }, []);

  const handleImport = useCallback(() => {
    if (phase.kind !== "choosing" || !selectedDirectory) {
      return;
    }
    setPhase({ ...phase, isImporting: true });
    void importFromChrome({ directory: selectedDirectory, uiLocale: i18n.language, choices })
      .then((outcome) => {
        setPhase({ kind: "done", failedExtensionNames: outcome.failedExtensionNames });
        return undefined;
      })
      .catch((error: unknown) => {
        // Chrome closes the dialog when an import fails.
        console.error("[browser-import] import from Chrome failed", error);
        onClose();
      });
  }, [choices, i18n.language, onClose, phase, selectedDirectory]);

  const doneButton = useMemo(
    () => (
      <ChromeDialogButton
        variant="prominent"
        label={t("workspace.browser.importData.done")}
        onPress={onClose}
        testID="browser-import-done"
      />
    ),
    [onClose, t],
  );

  // Chrome shows the dialog once the sources are listed, so it doesn't flicker.
  if (phase.kind === "loading") {
    return null;
  }
  if (phase.kind === "done") {
    return (
      <ChromeDialog
        title={t("workspace.browser.importData.title")}
        onEscape={onClose}
        testID="browser-import-dialog"
        buttons={doneButton}
      >
        <View style={styles.successIcon}>
          <ThemedSuccessIcon uniProps={primaryMapping} />
        </View>
        <Text style={styles.description}>{t("workspace.browser.importData.success")}</Text>
        {phase.failedExtensionNames.length > 0 ? (
          <Text style={styles.description}>
            {t("workspace.browser.importData.failedExtensions", {
              names: phase.failedExtensionNames.join(", "),
            })}
          </Text>
        ) : null}
      </ChromeDialog>
    );
  }

  const hasProfiles = phase.profiles.length > 0;
  const isNothingChosen = !choices.extensions && !choices.toolbar;
  return (
    <ChromeDialog
      title={t("workspace.browser.importData.title")}
      onEscape={handleEscape}
      testID="browser-import-dialog"
      buttons={
        <>
          {isImporting ? (
            <View style={styles.spinner}>
              <ThemedSpinner size={SPINNER_SIZE} uniProps={primaryMapping} />
            </View>
          ) : null}
          <ChromeDialogButton
            variant="tonal"
            label={t("common.actions.cancel")}
            isDisabled={isImporting}
            onPress={onClose}
          />
          <ChromeDialogButton
            variant="prominent"
            label={t("workspace.browser.importData.import")}
            isDisabled={isImporting || isNothingChosen || !hasProfiles}
            onPress={handleImport}
            testID="browser-import-commit"
          />
        </>
      }
    >
      {hasProfiles ? (
        <ThemedProfileSelect
          profiles={phase.profiles}
          selectedDirectory={selectedDirectory}
          onSelect={setSelectedDirectory}
          isDisabled={isImporting}
          label={t("workspace.browser.importData.from")}
          uniProps={selectColors}
        />
      ) : (
        <Text style={styles.description}>{t("workspace.browser.importData.noProfileFound")}</Text>
      )}
      {hasProfiles ? (
        <>
          <Text style={styles.description}>{t("workspace.browser.importData.items")}</Text>
          <View>
            <ChromeCheckbox
              label={t("workspace.browser.importData.extensions")}
              isChecked={choices.extensions}
              isDisabled={isImporting}
              onChange={setExtensionsChosen}
              testID="browser-import-extensions"
            />
            <ChromeCheckbox
              label={t("workspace.browser.importData.toolbar")}
              isChecked={choices.toolbar}
              isDisabled={isImporting}
              onChange={setToolbarChosen}
              testID="browser-import-toolbar"
            />
          </View>
        </>
      ) : null}
    </ChromeDialog>
  );
}

const styles = StyleSheet.create((theme) => {
  const { chrome } = theme;
  return {
    description: {
      marginTop: 8,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 13,
      lineHeight: 20,
      color: chrome.bubbleTextSecondary,
    },
    successIcon: {
      alignItems: "center",
    },
    spinner: {
      marginHorizontal: 8,
      justifyContent: "center",
    },
  };
});
