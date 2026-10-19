import { createContext, useContext } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { highlightParts, type HighlightPart } from "./search-match";

// search_highlight_utils' hit: yellow behind dark text in both themes.
const HIT_BACKGROUND = "#FFEB3B";
const HIT_TEXT = "#202124";

const SearchQueryContext = createContext("");

/** The query a WebUI page is searching for, which its text highlights; empty when not searching. */
export const CrSearchQueryProvider = SearchQueryContext.Provider;

export function useCrSearchQuery(): string {
  return useContext(SearchQueryContext);
}

/** A WebUI text with the page's search hits highlighted. */
export function CrHighlightedText({
  text,
  style,
  testID,
}: {
  text: string;
  style: StyleProp<TextStyle>;
  testID?: string;
}) {
  const query = useCrSearchQuery();
  // Each part is keyed by where it starts in the text.
  const parts: (HighlightPart & { offset: number })[] = [];
  let offset = 0;
  for (const part of highlightParts(text, query)) {
    parts.push({ ...part, offset });
    offset += part.text.length;
  }
  return (
    <Text style={style} testID={testID}>
      {parts.map((part) =>
        part.isHit ? (
          <Text key={part.offset} style={styles.hit}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  hit: {
    backgroundColor: HIT_BACKGROUND,
    color: HIT_TEXT,
  },
});
