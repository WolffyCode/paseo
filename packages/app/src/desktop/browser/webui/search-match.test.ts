import { describe, expect, it } from "vitest";
import {
  highlightParts,
  normalizeSearchQuery,
  searchDebounceMs,
  textsMatchSearch,
} from "./search-match";

describe("normalizeSearchQuery", () => {
  it("collapses whitespace and drops leading space, as CrSearchFieldMixin does", () => {
    expect(normalizeSearchQuery("  下载   内容 ")).toBe("下载 内容 ");
    expect(normalizeSearchQuery("")).toBe("");
  });
});

describe("searchDebounceMs", () => {
  it("waits less the longer the query", () => {
    expect(searchDebounceMs("")).toBe(0);
    expect(searchDebounceMs("a")).toBe(500);
    expect(searchDebounceMs("ab")).toBe(400);
    expect(searchDebounceMs("abc")).toBe(300);
    expect(searchDebounceMs("abcdef")).toBe(200);
  });
});

describe("textsMatchSearch", () => {
  it("matches case-insensitively and ignores accents", () => {
    expect(textsMatchSearch(["Cookie 及其他网站数据"], "cookie")).toBe(true);
    expect(textsMatchSearch(["Paramètres"], "parametres")).toBe(true);
    expect(textsMatchSearch(["外观"], "下载")).toBe(false);
  });

  it("treats the query as plain text", () => {
    expect(textsMatchSearch(["a.b"], "a.b")).toBe(true);
    expect(textsMatchSearch(["axb"], "a.b")).toBe(false);
  });
});

describe("highlightParts", () => {
  it("splits a text around every hit", () => {
    expect(highlightParts("下载完成后显示下载内容", "下载")).toEqual([
      { text: "下载", isHit: true },
      { text: "完成后显示", isHit: false },
      { text: "下载", isHit: true },
      { text: "内容", isHit: false },
    ]);
  });

  it("keeps the text's own letters where the query differs in case or accents", () => {
    expect(highlightParts("Paramètres avancés", "AVANCES")).toEqual([
      { text: "Paramètres ", isHit: false },
      { text: "avancés", isHit: true },
    ]);
  });

  it("leaves a text whole when nothing matches or the query is empty", () => {
    expect(highlightParts("外观", "下载")).toEqual([{ text: "外观", isHit: false }]);
    expect(highlightParts("外观", "")).toEqual([{ text: "外观", isHit: false }]);
  });
});
