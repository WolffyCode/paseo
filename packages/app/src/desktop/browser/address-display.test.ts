import { describe, expect, it } from "vitest";
import { addressDisplaySegments, addressSecurity } from "./address-display";

function shown(url: string): string {
  return addressDisplaySegments(url)
    .map((segment) => (segment.isHost ? `[${segment.text}]` : segment.text))
    .join("");
}

describe("addressDisplaySegments", () => {
  it("elides the scheme, www and a lone slash, and emphasizes the host", () => {
    expect(shown("https://www.example.com/a/b?q=1#x")).toBe("[example.com]/a/b?q=1#x");
    expect(shown("https://www.example.com/")).toBe("[example.com]");
    expect(shown("https://m.example.com/")).toBe("[m.example.com]");
    expect(shown("https://user:pw@example.com/")).toBe("[example.com]");
    expect(shown("http://localhost:3000/app")).toBe("[localhost:3000]/app");
  });

  it("keeps the scheme of Helm's and extensions' pages, and shows a file's path", () => {
    expect(shown("paseo://extensions?id=abc")).toBe("paseo://[extensions]?id=abc");
    expect(shown("chrome-extension://abc/newtab.html")).toBe("chrome-extension://abc/newtab.html");
    expect(shown("file:///Users/me/a%20b.pdf")).toBe("/Users/me/a b.pdf");
  });

  it("shows a view-source address as its prefix and then the page's own address", () => {
    expect(shown("view-source:https://www.example.com/")).toBe("view-source:[example.com]");
    expect(shown("view-source:http://localhost:3000/app")).toBe("view-source:[localhost:3000]/app");
  });

  it("shows nothing for the new tab page", () => {
    expect(addressDisplaySegments("paseo://start")).toEqual([]);
  });
});

describe("addressSecurity", () => {
  it("names the chip each kind of page gets", () => {
    expect(addressSecurity("https://example.com")).toBe("secure");
    expect(addressSecurity("http://example.com")).toBe("notSecure");
    expect(addressSecurity("file:///a.pdf")).toBe("file");
    expect(addressSecurity("paseo://extensions")).toBe("internal");
    expect(addressSecurity("chrome-extension://abc/newtab.html")).toBe("extension");
    expect(addressSecurity("paseo://start")).toBe("none");
    expect(addressSecurity("view-source:https://example.com/")).toBe("secure");
    expect(addressSecurity("view-source:http://example.com/")).toBe("notSecure");
  });
});
