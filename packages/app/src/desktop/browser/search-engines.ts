import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

export const SEARCH_ENGINE_IDS = ["baidu", "bing", "sogou", "so360", "google"] as const;

export type SearchEngineId = (typeof SEARCH_ENGINE_IDS)[number];

export interface SearchEngine {
  id: SearchEngineId;
  /** The engine's own name, shown untranslated, as Chrome does. */
  name: string;
  keyword: string;
  /** The search address, with {searchTerms} where the query goes. */
  urlTemplate: string;
  faviconUrl: string;
}

const SEARCH_TERMS = "{searchTerms}";

/**
 * Chrome's prepopulated engines for this region (template_url_prepopulate_data's China list), in
 * the order its 搜索引擎 dialog lists them. Chrome picks the list by country; other regions'
 * lists aren't here.
 */
export const SEARCH_ENGINES: readonly SearchEngine[] = [
  {
    id: "baidu",
    name: "百度",
    keyword: "baidu.com",
    urlTemplate: `https://www.baidu.com/#ie=UTF-8&wd=${SEARCH_TERMS}`,
    faviconUrl: "https://www.baidu.com/favicon.ico",
  },
  {
    id: "bing",
    name: "Microsoft Bing",
    keyword: "bing.com",
    urlTemplate: `https://www.bing.com/search?q=${SEARCH_TERMS}`,
    faviconUrl: "https://www.bing.com/favicon.ico",
  },
  {
    id: "sogou",
    name: "搜狗",
    keyword: "sogou.com",
    urlTemplate: `https://www.sogou.com/web?ie=UTF-8&query=${SEARCH_TERMS}`,
    faviconUrl: "https://www.sogou.com/images/logo/old/favicon.ico",
  },
  {
    id: "so360",
    name: "360",
    keyword: "so.com",
    urlTemplate: `https://www.so.com/s?ie=UTF-8&q=${SEARCH_TERMS}`,
    faviconUrl: "https://www.so.com/favicon.ico",
  },
  {
    id: "google",
    name: "Google",
    keyword: "google.com",
    // The parameters Chrome adds to an omnibox search on Google.
    urlTemplate: `https://www.google.com/search?q=${SEARCH_TERMS}&sourceid=chrome&ie=UTF-8`,
    faviconUrl: "https://www.google.com/images/branding/product/ico/googleg_alldp.ico",
  },
];

// A fresh Chrome profile searches with Google.
export const DEFAULT_SEARCH_ENGINE_ID: SearchEngineId = "google";

export function searchEngineById(id: SearchEngineId): SearchEngine {
  const engine = SEARCH_ENGINES.find((candidate) => candidate.id === id);
  if (!engine) {
    throw new Error(`Unknown search engine ${id}`);
  }
  return engine;
}

// base::EscapePath leaves these as they are, where a query value escapes them.
const PATH_KEPT_ESCAPES = /%(24|26|2B|2C|2F|3B|3D|40)/g;

/**
 * The engine's search address for `query`. As TemplateURLRef::HandleReplacements does, terms
 * after the template's ? are escaped as a query value with spaces as +, and terms before it, as
 * Baidu's #wd=, as a path with spaces as %20.
 */
export function searchUrl(engine: SearchEngine, query: string): string {
  const queryStart = engine.urlTemplate.indexOf("?");
  const isInQuery = queryStart !== -1 && engine.urlTemplate.indexOf(SEARCH_TERMS) > queryStart;
  const escapedComponent = encodeURIComponent(query);
  const escapedQuery = isInQuery
    ? escapedComponent.replace(/%20/g, "+")
    : escapedComponent.replace(PATH_KEPT_ESCAPES, (escape) => decodeURIComponent(escape));
  return engine.urlTemplate.replace(SEARCH_TERMS, escapedQuery);
}

const SearchEnginePrefsSchema = z.object({
  defaultEngineId: z.enum(SEARCH_ENGINE_IDS),
});

interface SearchEngineState {
  defaultEngineId: SearchEngineId;
  setDefaultEngine: (id: SearchEngineId) => void;
}

/** Chrome's default search provider pref: the engine the address bar and page menu search with. */
export const useSearchEngineStore = create<SearchEngineState>()(
  persist(
    (set) => ({
      defaultEngineId: DEFAULT_SEARCH_ENGINE_ID,
      setDefaultEngine: (id) => set({ defaultEngineId: id }),
    }),
    {
      name: "browser-search-engine",
      storage: createValidatedPersistStorage(AsyncStorage, SearchEnginePrefsSchema),
      partialize: (state) => ({ defaultEngineId: state.defaultEngineId }),
    },
  ),
);

export function defaultSearchEngine(): SearchEngine {
  return searchEngineById(useSearchEngineStore.getState().defaultEngineId);
}

export function useDefaultSearchEngine(): SearchEngine {
  return searchEngineById(useSearchEngineStore((state) => state.defaultEngineId));
}
