import { createContext, useContext, useEffect } from "react";
import { useCrSearchQuery } from "@/desktop/browser/webui/search-highlight";
import { textsMatchSearch } from "@/desktop/browser/webui/search-match";
import type { SettingsMenuSection } from "./routes";

export interface SettingsSearchReporter {
  /** A section tells the page whether it shows for the query it was given. */
  reportMatch: (report: { query: string; section: SettingsMenuSection; isMatch: boolean }) => void;
}

const SettingsSearchContext = createContext<SettingsSearchReporter | null>(null);

export const SettingsSearchProvider = SettingsSearchContext.Provider;

/**
 * Whether a section shows: always outside a search, and during one only when one of the texts it
 * shows matches, as settings-main hides a page with no hits. The page hears every answer, to show
 * 未找到任何搜索结果 when none matches.
 */
export function useSettingsSectionSearch(
  section: SettingsMenuSection,
  texts: readonly string[],
): boolean {
  const query = useCrSearchQuery();
  const reporter = useContext(SettingsSearchContext);
  const isMatch = query !== "" && textsMatchSearch(texts, query);
  useEffect(() => {
    if (query !== "") reporter?.reportMatch({ query, section, isMatch });
  }, [isMatch, query, reporter, section]);
  return query === "" || isMatch;
}
