import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ScrollView, Text, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import {
  BROWSER_EXTENSIONS_URL,
  BROWSER_SETTINGS_URL,
  settingsRoute,
  settingsUrl,
} from "@/desktop/browser/internal-pages";
import { CrDrawer } from "@/desktop/browser/webui/nav-menu";
import { CrSearchQueryProvider } from "@/desktop/browser/webui/search-highlight";
import { normalizeSearchQuery, searchDebounceMs } from "@/desktop/browser/webui/search-match";
import { WEBUI_LAYOUT } from "@/desktop/browser/webui/theme";
import { CrToast } from "@/desktop/browser/webui/toast";
import { CrToolbar } from "@/desktop/browser/webui/toolbar";
import { openBrowserFromPage } from "@/desktop/browser/workspace-browsers";
import { ClearBrowsingDataDialog } from "../clear-data/clear-data-dialog.electron";
import { ChromeImportDialog } from "../import/import-dialog.electron";
import { AboutPage } from "./about-page";
import { AppearancePage } from "./appearance-page.electron";
import { DownloadsPage } from "./downloads-page";
import { ManageProfilePage } from "./manage-profile-page";
import { PeoplePage } from "./people-page";
import { PrivacyPage } from "./privacy-page";
import { ResetPage, ResetProfileDialog } from "./reset-page.electron";
import {
  resolveSettingsRoute,
  SEARCHABLE_SECTIONS,
  settingsDialogRoute,
  settingsSectionRoute,
  settingsSubpageRoute,
  type SettingsMenuSection,
  type SettingsSection,
  type SettingsSubpage,
} from "./routes";
import { SearchEnginePage } from "./search-engine-page.electron";
import { SETTINGS_MENU_WIDTH, SettingsMenu } from "./settings-menu";
import { SettingsSearchProvider, type SettingsSearchReporter } from "./settings-search";

// settings-ui: narrow at 980 and below, where the menu moves into the drawer.
const NARROW_WIDTH = 980;
// .cr-centered-card-container: 96% of the main column, 550 to 680 wide; --settings-main-basis is
// the column that fits it.
const CENTERED_CARD_MAX_WIDTH = 680;
const CENTERED_CARD_MIN_WIDTH = 550;
const CENTERED_CARD_WIDTH_SHARE = 0.96;
const MAIN_BASIS = CENTERED_CARD_MAX_WIDTH / CENTERED_CARD_WIDTH_SHARE;

// cr-toast on settings: up to 568 wide, gone after 5 s.
const TOAST_MAX_WIDTH = 568;
const TOAST_DURATION_MS = 5000;

// #noSearchResults: 80 dip down, its first line 123% of the base font.
const NO_RESULTS_MARGIN_TOP = 80;
const NO_RESULTS_FONT_SIZE = 15.99;

// react-native's types have no sticky position; Chrome's #left sticks to the top while the
// sections scroll.
const STICKY_TOP = { position: "sticky", top: 0 } as unknown as ViewStyle;

interface SearchReports {
  query: string;
  matches: Partial<Record<SettingsMenuSection, boolean>>;
}

/** The settings search: the typed text, and the query sections show for after the debounce. */
function useSettingsSearch(onCleared: () => void) {
  const [typedQuery, setTypedQuery] = useState("");
  const [query, setQuery] = useState("");
  const [reports, setReports] = useState<SearchReports>({ query: "", matches: {} });
  const onClearedRef = useRef(onCleared);
  onClearedRef.current = onCleared;

  useEffect(() => {
    const normalized = normalizeSearchQuery(typedQuery);
    const timer = setTimeout(() => {
      setQuery((previous) => {
        // Clearing a search goes back to the settings page itself, as Chrome's does.
        if (previous !== "" && normalized === "") onClearedRef.current();
        return normalized;
      });
    }, searchDebounceMs(normalized));
    return () => clearTimeout(timer);
  }, [typedQuery]);

  const reporter = useMemo<SettingsSearchReporter>(
    () => ({
      reportMatch: ({ query: reportedQuery, section, isMatch }) => {
        setReports((current) => {
          const matches = current.query === reportedQuery ? current.matches : {};
          return { query: reportedQuery, matches: { ...matches, [section]: isMatch } };
        });
      },
    }),
    [],
  );
  const hasNoResults =
    query !== "" &&
    reports.query === query &&
    SEARCHABLE_SECTIONS.every((section) => reports.matches[section] === false);
  return { query, setTypedQuery, reporter, hasNoResults };
}

/** Focuses a rendered view: on the web, a view is its DOM element. */
function focusView(view: View | null) {
  const element: unknown = view;
  if (element instanceof HTMLElement) element.focus();
}

/**
 * Chrome's chrome://settings as one of the browser's own pages (paseo://settings): the left
 * menu, the section a route names, a dialog route opened over its section, and a search through
 * every section.
 */
export function BrowserSettingsPage({
  browserId,
  url,
  isPresented,
  onNavigate,
  onCustomizeToolbar,
}: {
  browserId: string;
  url: string;
  /** Whether this copy of the page is the one shown, the only one that may take focus. */
  isPresented: boolean;
  onNavigate: (url: string) => void;
  /** 自定义工具栏: Customize Chrome's toolbar page in this tab's side panel. */
  onCustomizeToolbar: () => void;
}) {
  const { t } = useTranslation();
  const [pageWidth, setPageWidth] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);
  const { section, subpage, dialog } = resolveSettingsRoute(settingsRoute(url));
  const isNarrow = pageWidth <= NARROW_WIDTH;
  const showSettingsPage = useCallback(() => onNavigate(BROWSER_SETTINGS_URL), [onNavigate]);
  const search = useSettingsSearch(showSettingsPage);
  const isSearching = search.query !== "";

  useEffect(() => {
    if (!toastText) return undefined;
    const timer = setTimeout(() => setToastText(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toastText]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setPageWidth(event.nativeEvent.layout.width);
  }, []);
  const showSection = useCallback(
    (next: SettingsSection) => {
      setIsDrawerOpen(false);
      onNavigate(settingsUrl(settingsSectionRoute(next)));
    },
    [onNavigate],
  );
  const openExtensions = useCallback(() => {
    setIsDrawerOpen(false);
    openBrowserFromPage({
      sourceBrowserId: browserId,
      url: BROWSER_EXTENSIONS_URL,
      isActive: true,
    });
  }, [browserId]);
  const openClearBrowsingData = useCallback(() => {
    onNavigate(settingsUrl(settingsDialogRoute("clearBrowserData")));
  }, [onNavigate]);
  const openResetDialog = useCallback(() => {
    onNavigate(settingsUrl(settingsDialogRoute("resetProfileSettings")));
  }, [onNavigate]);
  const openImportData = useCallback(() => {
    onNavigate(settingsUrl(settingsDialogRoute("importData")));
  }, [onNavigate]);
  const openManageProfile = useCallback(() => {
    onNavigate(settingsUrl(settingsSubpageRoute("manageProfile")));
  }, [onNavigate]);
  // A dialog closing and a subpage's back button both return to the section's own page.
  const returnToSection = useCallback(() => {
    onNavigate(settingsUrl(settingsSectionRoute(section)));
  }, [onNavigate, section]);
  // settings-privacy-page's onCbdDialogClosed_: back to the page, with the toast.
  const finishDeleting = useCallback(
    (text: string) => {
      setToastText(text);
      returnToSection();
    },
    [returnToSection],
  );
  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

  // settings-view-mixin's focus on navigating within the page: entering a subpage focuses its
  // back button, and leaving it focuses the control that opened it (its section's focus config).
  // Opening a route from elsewhere moves no focus.
  const backButtonRef = useRef<View>(null);
  const manageProfileEntryRef = useRef<View>(null);
  const shownRouteRef = useRef<{ section: SettingsSection; subpage: SettingsSubpage | null }>(null);
  useEffect(() => {
    const previousRoute = shownRouteRef.current;
    shownRouteRef.current = { section, subpage };
    const isNavigation =
      previousRoute !== null &&
      (previousRoute.section !== section || previousRoute.subpage !== subpage);
    if (!isNavigation || !isPresented) return;
    if (subpage !== null) {
      focusView(backButtonRef.current);
      return;
    }
    if (previousRoute.subpage === null) return;
    const subpageEntries: Record<SettingsSubpage, View | null> = {
      manageProfile: manageProfileEntryRef.current,
    };
    focusView(subpageEntries[previousRoute.subpage]);
  }, [isPresented, section, subpage]);

  const sectionViews: Record<SettingsSection, ReactNode> = {
    people: (
      <PeoplePage
        key="people"
        onOpenManageProfile={openManageProfile}
        onOpenImportData={openImportData}
        manageProfileEntryRef={manageProfileEntryRef}
      />
    ),
    privacy: <PrivacyPage key="privacy" onOpenClearBrowsingData={openClearBrowsingData} />,
    appearance: <AppearancePage key="appearance" onCustomizeToolbar={onCustomizeToolbar} />,
    search: <SearchEnginePage key="search" />,
    downloads: <DownloadsPage key="downloads" />,
    reset: <ResetPage key="reset" onOpenResetDialog={openResetDialog} />,
    about: <AboutPage key="about" />,
  };
  const subpageViews: Record<SettingsSubpage, ReactNode> = {
    manageProfile: <ManageProfilePage onBack={returnToSection} backButtonRef={backButtonRef} />,
  };
  let content: ReactNode = subpage ? subpageViews[subpage] : sectionViews[section];
  const isOnSubpage = subpage !== null && !isSearching;
  if (isSearching) {
    content = search.hasNoResults ? (
      <Text style={styles.noResults} testID="browser-settings-no-results">
        {t("workspace.browser.settings.noSearchResults")}
      </Text>
    ) : (
      SEARCHABLE_SECTIONS.map((searchable) => sectionViews[searchable])
    );
  }

  // A search shows sections from every page, so no menu item is the page shown.
  const menu = (
    <SettingsMenu
      section={isSearching ? null : section}
      onSelect={showSection}
      onOpenExtensions={openExtensions}
    />
  );
  return (
    <CrSearchQueryProvider value={search.query}>
      <SettingsSearchProvider value={search.reporter}>
        <View style={styles.page} onLayout={handleLayout} testID="browser-settings-page">
          <CrToolbar
            title={t("workspace.browser.settings.title")}
            searchLabel={t("workspace.browser.settings.search")}
            onMenuPress={openDrawer}
            leftSpacerWidth={SETTINGS_MENU_WIDTH}
            centerBasis={MAIN_BASIS}
            isNarrow={isNarrow}
            onSearchChange={search.setTypedQuery}
          />
          <ScrollView style={styles.scroller} contentContainerStyle={styles.scrollContent}>
            {isNarrow ? null : (
              <View style={[styles.left, STICKY_TOP]}>
                <View style={styles.leftMenu}>{menu}</View>
              </View>
            )}
            <View
              style={[
                styles.main,
                isNarrow && styles.mainNarrow,
                isOnSubpage && styles.mainSubpage,
              ]}
            >
              {search.hasNoResults ? (
                content
              ) : (
                <View style={[styles.sections, isOnSubpage && styles.sectionsSubpage]}>
                  {content}
                </View>
              )}
            </View>
            {isNarrow ? null : <View style={styles.right} />}
          </ScrollView>
          {isNarrow && isDrawerOpen ? (
            <CrDrawer
              heading={t("workspace.browser.settings.title")}
              onClose={closeDrawer}
              testID="browser-settings-drawer"
            >
              {menu}
            </CrDrawer>
          ) : null}
          {dialog === "clearBrowserData" ? (
            <ClearBrowsingDataDialog onDeleted={finishDeleting} onClose={returnToSection} />
          ) : null}
          {dialog === "resetProfileSettings" ? (
            <ResetProfileDialog onClose={returnToSection} />
          ) : null}
          {dialog === "importData" ? <ChromeImportDialog onClose={returnToSection} /> : null}
          {toastText ? (
            <CrToast text={toastText} maxWidth={TOAST_MAX_WIDTH} testID="browser-settings-toast" />
          ) : null}
        </View>
      </SettingsSearchProvider>
    </CrSearchQueryProvider>
  );
}

const styles = StyleSheet.create((theme) => ({
  page: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.webui.page,
  },
  scroller: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  // #left, #main and #right share the width, #main from a basis that fits the cards.
  left: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: SETTINGS_MENU_WIDTH,
  },
  // #left settings-menu: the menu keeps its own width however wide the column grows.
  leftMenu: {
    width: SETTINGS_MENU_WIDTH,
  },
  main: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: MAIN_BASIS,
    minWidth: 0,
  },
  mainNarrow: {
    paddingHorizontal: 3,
  },
  // A subpage's card reaches the bottom of the page.
  mainSubpage: {
    alignSelf: "stretch",
  },
  sectionsSubpage: {
    flexGrow: 1,
  },
  sections: {
    width: `${CENTERED_CARD_WIDTH_SHARE * 100}%`,
    maxWidth: CENTERED_CARD_MAX_WIDTH,
    minWidth: CENTERED_CARD_MIN_WIDTH,
    alignSelf: "center",
  },
  right: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  noResults: {
    marginTop: NO_RESULTS_MARGIN_TOP,
    textAlign: "center",
    fontFamily: CHROME_FONT_FAMILY,
    fontSize: NO_RESULTS_FONT_SIZE,
    lineHeight: WEBUI_LAYOUT.lineHeight,
    color: theme.webui.text,
  },
}));
