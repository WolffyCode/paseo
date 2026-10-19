import { describe, expect, it } from "vitest";
import { isAddressInput, resolveAddressInput } from "./address-input";
import { searchEngineById, searchUrl } from "./search-engines";

const GOOGLE = searchEngineById("google");

describe("isAddressInput", () => {
  it("takes domains, hosts with ports, local hosts and known schemes as addresses", () => {
    expect(isAddressInput("github.com")).toBe(true);
    expect(isAddressInput("docs.github.com/en?q=1")).toBe(true);
    expect(isAddressInput("example.co.uk:8080/path")).toBe(true);
    expect(isAddressInput("localhost:3000")).toBe(true);
    expect(isAddressInput("127.0.0.1/admin")).toBe(true);
    expect(isAddressInput("https://example.com/a b")).toBe(true);
    expect(isAddressInput("paseo://extensions")).toBe(true);
    expect(isAddressInput("例子.中国")).toBe(true);
  });

  it("takes words, sentences and unknown schemes as searches", () => {
    expect(isAddressInput("hello")).toBe(false);
    expect(isAddressInput("how to use git")).toBe(false);
    expect(isAddressInput("node.js tutorial")).toBe(false);
    expect(isAddressInput("a.b")).toBe(false);
    expect(isAddressInput("foo:bar")).toBe(false);
    expect(isAddressInput("你好")).toBe(false);
  });
});

describe("resolveAddressInput", () => {
  it("opens addresses and searches the default engine for the rest", () => {
    expect(resolveAddressInput(" github.com ", GOOGLE)).toBe("https://github.com");
    expect(resolveAddressInput("localhost:5173", GOOGLE)).toBe("http://localhost:5173");
    expect(resolveAddressInput("how to use git", GOOGLE)).toBe(searchUrl(GOOGLE, "how to use git"));
  });
});

describe("searchUrl", () => {
  it("builds Chrome's Google search URL", () => {
    expect(searchUrl(GOOGLE, "a b&c")).toBe(
      "https://www.google.com/search?q=a+b%26c&sourceid=chrome&ie=UTF-8",
    );
  });

  it("puts the query where each engine takes it", () => {
    expect(searchUrl(searchEngineById("bing"), "a+b")).toBe("https://www.bing.com/search?q=a%2Bb");
  });

  it("escapes terms before the URL's query as a path, as Chrome does for Baidu's #wd=", () => {
    expect(searchUrl(searchEngineById("baidu"), "你好 世界")).toBe(
      "https://www.baidu.com/#ie=UTF-8&wd=%E4%BD%A0%E5%A5%BD%20%E4%B8%96%E7%95%8C",
    );
    expect(searchUrl(searchEngineById("baidu"), "a+b&c:d")).toBe(
      "https://www.baidu.com/#ie=UTF-8&wd=a+b&c%3Ad",
    );
  });
});
