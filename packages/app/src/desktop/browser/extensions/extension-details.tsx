import { useCallback, useMemo } from "react";
import { Image, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import {
  CrIconButton,
  CrLinkRow,
  CrSecondaryText,
  CrSection,
  CrToggle,
} from "@/desktop/browser/webui/controls";
import { WEBUI_LAYOUT } from "@/desktop/browser/webui/theme";
import type { DesktopBrowserExtension } from "@/desktop/host";
import { permissionLines } from "./permission-lines";
import { extensionSiteAccess } from "./permission-warnings";
import { useBrowserExtensionPinsStore } from "./store";
import { chromeWebStoreDetailUrl } from "./web-store";

// extensions-detail-view: a 680 dip card column, a 48 dip header with a 24 dip icon.
const DETAIL_WIDTH = 680;
const HEADER_ICON_SIZE = 24;

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <View style={styles.bulletList}>
      {items.map((item) => (
        <View key={item} style={styles.bulletRow}>
          <CrSecondaryText>•</CrSecondaryText>
          <View style={styles.bulletText}>
            <CrSecondaryText>{item}</CrSecondaryText>
          </View>
        </View>
      ))}
    </View>
  );
}

/** A labelled switch row of the details card, under a separator. */
function ToggleRow({
  label,
  isOn,
  onChange,
  testID,
}: {
  label: string;
  isOn: boolean;
  onChange: (isOn: boolean) => void;
  testID: string;
}) {
  return (
    <View style={[styles.toggleRow, styles.separatorAbove]}>
      <Text style={styles.toggleRowLabel}>{label}</Text>
      <CrToggle label={label} isOn={isOn} onChange={onChange} testID={testID} />
    </View>
  );
}

/**
 * Chrome's details page for one extension (chrome://extensions/?id=): the switch, what it is
 * and may do, its links, and removal. Rows for features this browser lacks (site settings,
 * incognito, file URLs, developer mode) are left out.
 */
export function ExtensionDetails({
  extension,
  onBack,
  onOpenInNewTab,
  onRemove,
  onSetEnabled,
}: {
  extension: DesktopBrowserExtension;
  onBack: () => void;
  onOpenInNewTab: (url: string) => void;
  onRemove: (extension: DesktopBrowserExtension) => void;
  onSetEnabled: (extensionId: string, isEnabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const isPinned = useBrowserExtensionPinsStore((state) =>
    state.pinnedExtensionIds.includes(extension.id),
  );
  const setPinned = useBrowserExtensionPinsStore((state) => state.setPinned);
  const iconSource = useMemo(
    () => (extension.iconDataUrl ? { uri: extension.iconDataUrl } : null),
    [extension.iconDataUrl],
  );
  const permissions = useMemo(
    () => permissionLines(t, extension.permissions).map((line) => line.text),
    [extension.permissions, t],
  );
  const siteAccess = useMemo(() => extensionSiteAccess(extension.permissions), [extension]);
  const { id: extensionId, optionsUrl, websiteUrl } = extension;
  const setEnabled = useCallback(
    (isEnabled: boolean) => onSetEnabled(extensionId, isEnabled),
    [extensionId, onSetEnabled],
  );
  const setPinnedToToolbar = useCallback(
    (isOn: boolean) => setPinned(extensionId, isOn),
    [extensionId, setPinned],
  );
  const openOptions = useCallback(() => {
    if (optionsUrl) onOpenInNewTab(optionsUrl);
  }, [onOpenInNewTab, optionsUrl]);
  const openWebsite = useCallback(() => {
    if (websiteUrl) onOpenInNewTab(websiteUrl);
  }, [onOpenInNewTab, websiteUrl]);
  const openStorePage = useCallback(
    () => onOpenInNewTab(chromeWebStoreDetailUrl(extensionId)),
    [extensionId, onOpenInNewTab],
  );
  const remove = useCallback(() => onRemove(extension), [extension, onRemove]);

  let siteAccessContent = (
    <CrSecondaryText>{t("workspace.browser.extensions.page.siteAccessEmpty")}</CrSecondaryText>
  );
  if (siteAccess.isAllSites) {
    siteAccessContent = (
      <View style={styles.siteAccess}>
        <Text style={styles.primaryText}>
          {t("workspace.browser.extensions.page.hostPermissionsHeading")}
        </Text>
        <CrSecondaryText>{t("workspace.browser.extensions.page.onAllSites")}</CrSecondaryText>
      </View>
    );
  } else if (siteAccess.hosts.length > 0) {
    siteAccessContent = <BulletList items={siteAccess.hosts} />;
  }

  return (
    <View style={styles.column} testID={`browser-extension-details-${extensionId}`}>
      <View style={styles.header}>
        <CrIconButton
          icon="arrowBack"
          label={t("workspace.browser.extensions.page.back", { name: extension.name })}
          onPress={onBack}
          testID="browser-extension-details-back"
        />
        {iconSource ? <Image source={iconSource} style={styles.headerIcon} /> : null}
        <Text style={styles.headerName}>{extension.name}</Text>
      </View>
      <View style={styles.enableRow}>
        <Text style={[styles.enableLabel, extension.isEnabled && styles.enableLabelOn]}>
          {extension.isEnabled
            ? t("workspace.browser.extensions.page.on")
            : t("workspace.browser.extensions.page.off")}
        </Text>
        <CrToggle
          label={extension.name}
          isOn={extension.isEnabled}
          onChange={setEnabled}
          testID="browser-extension-details-toggle"
        />
      </View>
      <CrSection title={t("workspace.browser.extensions.page.description")} hasSeparator={false}>
        <CrSecondaryText>
          {extension.description || t("workspace.browser.extensions.page.noDescription")}
        </CrSecondaryText>
      </CrSection>
      <CrSection title={t("workspace.browser.extensions.page.version")}>
        <CrSecondaryText>{extension.version}</CrSecondaryText>
      </CrSection>
      <CrSection title={t("workspace.browser.extensions.page.permissions")}>
        {permissions.length > 0 ? (
          <BulletList items={permissions} />
        ) : (
          <CrSecondaryText>
            {t("workspace.browser.extensions.page.permissionsEmpty")}
          </CrSecondaryText>
        )}
      </CrSection>
      <CrSection title={t("workspace.browser.extensions.page.siteAccess")}>
        {siteAccessContent}
      </CrSection>
      <ToggleRow
        label={t("workspace.browser.extensions.page.pinToToolbar")}
        isOn={isPinned}
        onChange={setPinnedToToolbar}
        testID="browser-extension-details-pin"
      />
      {optionsUrl ? (
        <CrLinkRow
          label={t("workspace.browser.extensions.page.extensionOptions")}
          isExternal
          isDisabled={!extension.isEnabled}
          onPress={openOptions}
          testID="browser-extension-details-options"
        />
      ) : null}
      {websiteUrl ? (
        <CrLinkRow
          label={t("workspace.browser.extensions.page.extensionWebsite")}
          isExternal
          onPress={openWebsite}
          testID="browser-extension-details-website"
        />
      ) : null}
      <CrLinkRow
        label={t("workspace.browser.extensions.page.viewInStore")}
        isExternal
        onPress={openStorePage}
        testID="browser-extension-details-store"
      />
      <CrSection title={t("workspace.browser.extensions.page.source")}>
        <CrSecondaryText>{t("workspace.browser.extensions.page.sourceWebStore")}</CrSecondaryText>
      </CrSection>
      <CrLinkRow
        label={t("workspace.browser.extensions.page.removeExtension")}
        isExternal={false}
        onPress={remove}
        testID="browser-extension-details-remove"
      />
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
    column: {
      width: DETAIL_WIDTH,
      maxWidth: "100%",
      alignSelf: "center",
      paddingBottom: 64,
      backgroundColor: colors.card,
      boxShadow: WEBUI_LAYOUT.cardShadow,
    },
    // 40 dip of row under 8 dip of top padding.
    header: {
      height: 48,
      flexDirection: "row",
      alignItems: "center",
      paddingTop: 8,
      paddingHorizontal: 12,
      marginBottom: 12,
    },
    headerIcon: {
      width: HEADER_ICON_SIZE,
      height: HEADER_ICON_SIZE,
      marginLeft: 16,
      marginRight: 12,
    },
    headerName: {
      flex: 1,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 14,
      fontWeight: "500",
      color: colors.titleText,
    },
    enableRow: {
      minHeight: WEBUI_LAYOUT.rowMinHeight,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: WEBUI_LAYOUT.rowPadding,
      marginBottom: 8,
    },
    enableLabel: {
      ...text,
      fontWeight: "500",
      color: colors.textSecondary,
    },
    enableLabelOn: {
      color: colors.enabledText,
    },
    separatorAbove: {
      borderTopWidth: 1,
      borderTopColor: colors.separator,
    },
    toggleRow: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: WEBUI_LAYOUT.rowPadding,
      paddingVertical: WEBUI_LAYOUT.sectionVerticalPadding,
      paddingHorizontal: WEBUI_LAYOUT.rowPadding,
    },
    toggleRowLabel: {
      ...text,
      flex: 1,
      color: colors.text,
    },
    primaryText: {
      ...text,
      color: colors.text,
    },
    siteAccess: {
      marginTop: 12,
      gap: 4,
    },
    bulletList: {
      paddingLeft: 4,
    },
    bulletRow: {
      flexDirection: "row",
      gap: 8,
    },
    bulletText: {
      flex: 1,
    },
  };
});
