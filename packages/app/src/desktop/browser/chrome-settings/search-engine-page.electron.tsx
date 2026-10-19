import { useCallback, useMemo, useState } from "react";
import { Image, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import {
  SEARCH_ENGINES,
  useDefaultSearchEngine,
  useSearchEngineStore,
  type SearchEngine,
  type SearchEngineId,
} from "@/desktop/browser/search-engines";
import { CrButton } from "@/desktop/browser/webui/controls";
import { CrDialog, type CrDialogLayout } from "@/desktop/browser/webui/dialog.electron";
import { CrRadioButton } from "@/desktop/browser/webui/form-controls";
import { WebUiIcon } from "@/desktop/browser/webui/icons";
import { CrHighlightedText } from "@/desktop/browser/webui/search-highlight";
import { WEBUI_LAYOUT, webUiColorProps } from "@/desktop/browser/webui/theme";
import { useSettingsSectionSearch } from "./settings-search";
import { SettingsSection } from "./settings-section";
import { settingsSectionLabel } from "./titles";

const ThemedWebUiIcon = withUnistyles(WebUiIcon);
const faviconFallbackMapping = webUiColorProps("icon");

const FAVICON_SIZE = 16;
// The current engine's line: 55 tall, 12 dip between its icon, name and button.
const ENGINE_LINE_MIN_HEIGHT = 55;
// settings-search-engine-list-dialog: 16 dip around the title and body, 24 around the buttons,
// a list of at most 360, and 20 dip rings.
const LIST_DIALOG_LAYOUT: Partial<CrDialogLayout> = {
  titlePadding: { top: 16, horizontal: 16, bottom: 16 },
  bodyPaddingHorizontal: 16,
  bodyMaxHeight: 360,
  buttonPadding: { top: 24, horizontal: 24, bottom: 24 },
};
const LIST_RADIO_SIZE = 20;

/**
 * settings-search-engine-icon: the default globe until the engine's favicon has loaded, and for
 * good when it can't load, as Chrome shows it while its favicon service has no icon.
 */
function EngineIcon({ engine }: { engine: SearchEngine }) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const source = useMemo(() => ({ uri: engine.faviconUrl }), [engine.faviconUrl]);
  const handleLoad = useCallback(() => setLoadedUrl(engine.faviconUrl), [engine.faviconUrl]);
  const handleError = useCallback(() => setFailedUrl(engine.faviconUrl), [engine.faviconUrl]);
  const isLoaded = loadedUrl === engine.faviconUrl;
  const hasFailed = failedUrl === engine.faviconUrl;
  return (
    <View style={styles.favicon}>
      {isLoaded ? null : (
        <ThemedWebUiIcon
          name="defaultFavicon"
          size={FAVICON_SIZE}
          uniProps={faviconFallbackMapping}
        />
      )}
      {hasFailed ? null : (
        <Image
          source={source}
          onLoad={handleLoad}
          onError={handleError}
          style={[styles.faviconImage, !isLoaded && styles.faviconImageLoading]}
        />
      )}
    </View>
  );
}

function EngineChoice({
  engine,
  isChecked,
  onCheck,
}: {
  engine: SearchEngine;
  isChecked: boolean;
  onCheck: (id: SearchEngineId) => void;
}) {
  const check = useCallback(() => onCheck(engine.id), [engine.id, onCheck]);
  return (
    <View style={styles.choice}>
      <CrRadioButton
        isChecked={isChecked}
        onCheck={check}
        isLabelFirst
        size={LIST_RADIO_SIZE}
        testID={`search-engine-choice-${engine.id}`}
      >
        <View style={styles.choiceEngine}>
          <EngineIcon engine={engine} />
          <Text style={styles.text}>{engine.name}</Text>
        </View>
      </CrRadioButton>
    </View>
  );
}

/**
 * settings-search-engine-list-dialog: the region's engines; 设为默认 makes the chosen one the
 * default.
 */
function SearchEngineListDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const defaultEngine = useDefaultSearchEngine();
  const [chosenId, setChosenId] = useState(defaultEngine.id);
  const setAsDefault = useCallback(() => {
    useSearchEngineStore.getState().setDefaultEngine(chosenId);
    onClose();
  }, [chosenId, onClose]);
  const title = useMemo(
    () => (
      <View>
        <Text style={styles.dialogTitle}>{t("workspace.browser.settings.menu.search")}</Text>
        <Text style={styles.dialogSubtitle}>
          {t("workspace.browser.settings.searchEngine.dialogSubtitle")}
        </Text>
      </View>
    ),
    [t],
  );
  const buttons = (
    <>
      <CrButton label={t("workspace.browser.webui.cancel")} onPress={onClose} />
      <View style={styles.setAsDefault}>
        <CrButton
          label={t("workspace.browser.settings.searchEngine.setAsDefault")}
          isAction
          onPress={setAsDefault}
          testID="search-engine-set-default"
        />
      </View>
    </>
  );
  return (
    <CrDialog
      title={title}
      layout={LIST_DIALOG_LAYOUT}
      buttons={buttons}
      onCancel={onClose}
      testID="search-engine-dialog"
    >
      {SEARCH_ENGINES.map((engine) => (
        <EngineChoice
          key={engine.id}
          engine={engine}
          isChecked={engine.id === chosenId}
          onCheck={setChosenId}
        />
      ))}
    </CrDialog>
  );
}

/**
 * settings-search-page: the engine the address bar searches with, changed through the region's
 * list. Chrome's 管理搜索引擎和网站搜索 (shortcuts and site search) isn't part of this browser.
 */
export function SearchEnginePage() {
  const { t } = useTranslation();
  const engine = useDefaultSearchEngine();
  const [isChoosing, setIsChoosing] = useState(false);
  const openList = useCallback(() => setIsChoosing(true), []);
  const closeList = useCallback(() => setIsChoosing(false), []);
  const title = settingsSectionLabel("search", t);
  const description = t("workspace.browser.settings.searchEngine.description");
  const isShown = useSettingsSectionSearch("search", [title, description, engine.name]);
  if (!isShown) {
    return null;
  }
  return (
    <SettingsSection title={title} testID="browser-settings-search">
      <View style={styles.row}>
        <View style={styles.description}>
          <CrHighlightedText text={title} style={styles.text} />
          <CrHighlightedText text={description} style={styles.secondary} />
        </View>
        <View style={styles.engineLine}>
          <EngineIcon engine={engine} />
          <CrHighlightedText
            text={engine.name}
            style={[styles.text, styles.engineName]}
            testID="search-engine-current"
          />
          <CrButton
            label={t("workspace.browser.settings.change")}
            onPress={openList}
            testID="search-engine-change"
          />
        </View>
      </View>
      {isChoosing ? <SearchEngineListDialog onClose={closeList} /> : null}
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  const text = {
    fontFamily: CHROME_FONT_FAMILY,
    fontSize: WEBUI_LAYOUT.fontSize,
    lineHeight: WEBUI_LAYOUT.lineHeight,
  };
  return {
    row: {
      paddingHorizontal: WEBUI_LAYOUT.rowPadding,
    },
    description: {
      paddingTop: WEBUI_LAYOUT.sectionVerticalPadding,
    },
    text: {
      ...text,
      color: colors.text,
    },
    secondary: {
      ...text,
      color: colors.textSecondary,
    },
    engineLine: {
      minHeight: ENGINE_LINE_MIN_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    engineName: {
      marginRight: "auto",
    },
    favicon: {
      width: FAVICON_SIZE,
      height: FAVICON_SIZE,
    },
    faviconImage: {
      position: "absolute",
      top: 0,
      left: 0,
      width: FAVICON_SIZE,
      height: FAVICON_SIZE,
    },
    faviconImageLoading: {
      opacity: 0,
    },
    dialogTitle: {
      marginBottom: 16,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 15,
      lineHeight: 15,
      color: colors.text,
    },
    dialogSubtitle: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 12,
      lineHeight: 22,
      color: colors.text,
    },
    choice: {
      marginHorizontal: 16,
    },
    choiceEngine: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
    },
    setAsDefault: {
      marginLeft: 12,
    },
  };
});
