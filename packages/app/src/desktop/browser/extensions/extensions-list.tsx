import { useCallback, useMemo } from "react";
import { Image, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { CrButton, CrLinkedText, CrToggle, LINK_SLOT } from "@/desktop/browser/webui/controls";
import { WEBUI_LAYOUT } from "@/desktop/browser/webui/theme";
import type { DesktopBrowserExtension } from "@/desktop/host";

// extensions-item-list: fixed 400 x 160 cards in up to three centered columns 12 apart, inside
// 60 dip side padding.
const CARD_WIDTH = 400;
const CARD_HEIGHT = 160;
const GRID_GAP = 12;
const MAX_COLUMNS = 3;
const LIST_SIDE_PADDING = 60;
const CARD_ICON_SIZE = 36;
// The description is clipped at its box, about two and four fifths lines, not line-clamped.
const DESCRIPTION_HEIGHT = 56;

/** How many card columns fit a list this wide (item_list.ts), at least one. */
export function extensionColumnsForWidth(listWidth: number): number {
  const fitting = Math.floor(
    (listWidth - 2 * LIST_SIDE_PADDING + GRID_GAP) / (CARD_WIDTH + GRID_GAP),
  );
  return Math.min(MAX_COLUMNS, Math.max(1, fitting));
}

function ExtensionCard({
  extension,
  onShowDetails,
  onRemove,
  onSetEnabled,
}: {
  extension: DesktopBrowserExtension;
  onShowDetails: (extensionId: string) => void;
  onRemove: (extension: DesktopBrowserExtension) => void;
  onSetEnabled: (extensionId: string, isEnabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const iconSource = useMemo(
    () => (extension.iconDataUrl ? { uri: extension.iconDataUrl } : null),
    [extension.iconDataUrl],
  );
  const showDetails = useCallback(() => onShowDetails(extension.id), [extension.id, onShowDetails]);
  const remove = useCallback(() => onRemove(extension), [extension, onRemove]);
  const setEnabled = useCallback(
    (isEnabled: boolean) => onSetEnabled(extension.id, isEnabled),
    [extension.id, onSetEnabled],
  );
  return (
    <View style={styles.card} testID={`browser-extension-card-${extension.id}`}>
      <View style={styles.cardMain}>
        <View style={styles.iconWrapper}>
          {iconSource ? <Image source={iconSource} style={styles.icon} /> : null}
        </View>
        <View style={styles.cardContent}>
          <Text numberOfLines={1} style={styles.name}>
            {extension.name}
          </Text>
          <Text style={styles.description}>{extension.description}</Text>
        </View>
      </View>
      <View style={styles.buttonStrip}>
        <View style={styles.buttons}>
          <CrButton
            label={t("workspace.browser.extensions.page.details")}
            onPress={showDetails}
            testID={`browser-extension-details-${extension.id}`}
          />
          <CrButton
            label={t("workspace.browser.extensions.page.remove")}
            onPress={remove}
            testID={`browser-extension-remove-${extension.id}`}
          />
        </View>
        <CrToggle
          label={
            extension.isEnabled
              ? t("workspace.browser.extensions.page.on")
              : t("workspace.browser.extensions.page.off")
          }
          isOn={extension.isEnabled}
          onChange={setEnabled}
          testID={`browser-extension-toggle-${extension.id}`}
        />
      </View>
    </View>
  );
}

/**
 * Chrome's extension list: a card per extension, filtered by the toolbar search, or what to do
 * when there is nothing to show.
 */
export function ExtensionsList({
  extensions,
  query,
  listWidth,
  onShowDetails,
  onRemove,
  onSetEnabled,
  onOpenWebStore,
}: {
  extensions: readonly DesktopBrowserExtension[];
  query: string;
  listWidth: number;
  onShowDetails: (extensionId: string) => void;
  onRemove: (extension: DesktopBrowserExtension) => void;
  onSetEnabled: (extensionId: string, isEnabled: boolean) => void;
  onOpenWebStore: () => void;
}) {
  const { t } = useTranslation();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const shownExtensions = useMemo(
    () =>
      extensions
        .filter((extension) => extension.name.toLocaleLowerCase().includes(normalizedQuery))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [extensions, normalizedQuery],
  );
  const columns = extensionColumnsForWidth(listWidth);
  const gridStyle = useMemo(
    () => ({ width: columns * CARD_WIDTH + (columns - 1) * GRID_GAP }),
    [columns],
  );

  if (extensions.length === 0) {
    return (
      <View style={styles.list}>
        <CrLinkedText
          text={t("workspace.browser.extensions.page.empty", { link: LINK_SLOT })}
          linkLabel={t("workspace.browser.extensions.page.emptyLink")}
          onLinkPress={onOpenWebStore}
          style={styles.emptyMessage}
        />
      </View>
    );
  }
  if (shownExtensions.length === 0) {
    return (
      <View style={styles.list}>
        <Text style={styles.emptyMessage}>{t("workspace.browser.extensions.page.noResults")}</Text>
      </View>
    );
  }
  return (
    <View style={styles.list} testID="browser-extensions-list">
      <View style={[styles.grid, gridStyle]}>
        <Text style={styles.sectionHeader}>
          {t("workspace.browser.extensions.page.sectionHeader")}
        </Text>
        <View style={styles.cards}>
          {shownExtensions.map((extension) => (
            <ExtensionCard
              key={extension.id}
              extension={extension}
              onShowDetails={onShowDetails}
              onRemove={onRemove}
              onSetEnabled={onSetEnabled}
            />
          ))}
        </View>
      </View>
    </View>
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
    list: {
      minWidth: CARD_WIDTH,
      paddingTop: 24,
      paddingHorizontal: LIST_SIDE_PADDING,
      paddingBottom: 64,
    },
    grid: {
      alignSelf: "center",
    },
    sectionHeader: {
      marginTop: 21,
      marginBottom: 12,
      paddingTop: 8,
      paddingBottom: 4,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 16,
      lineHeight: WEBUI_LAYOUT.lineHeight,
      letterSpacing: 0.25,
      color: colors.text,
    },
    cards: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: GRID_GAP,
    },
    card: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      borderRadius: WEBUI_LAYOUT.cardRadius,
      backgroundColor: colors.card,
      boxShadow: WEBUI_LAYOUT.cardShadow,
    },
    cardMain: {
      flex: 1,
      minHeight: 0,
      flexDirection: "row",
      paddingVertical: 16,
      paddingHorizontal: WEBUI_LAYOUT.rowPadding,
    },
    iconWrapper: {
      alignSelf: "flex-start",
      padding: 6,
    },
    icon: {
      width: CARD_ICON_SIZE,
      height: CARD_ICON_SIZE,
    },
    cardContent: {
      flex: 1,
      marginLeft: 24,
      overflow: "hidden",
    },
    name: {
      ...text,
      marginBottom: 4,
      color: colors.text,
    },
    description: {
      ...text,
      height: DESCRIPTION_HEIGHT,
      overflow: "hidden",
      color: colors.textSecondary,
    },
    buttonStrip: {
      height: WEBUI_LAYOUT.rowMinHeight,
      flexDirection: "row",
      alignItems: "center",
      paddingRight: WEBUI_LAYOUT.rowPadding,
    },
    buttons: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingLeft: 8,
    },
    emptyMessage: {
      marginTop: 80,
      textAlign: "center",
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 16,
      fontWeight: "500",
      lineHeight: WEBUI_LAYOUT.lineHeight,
      color: colors.emptyMessage,
    },
  };
});
