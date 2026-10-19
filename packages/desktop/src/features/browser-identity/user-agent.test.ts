import { describe, expect, it } from "vitest";
import { chromeUserAgent, withGoogleChromeBrand } from "./user-agent.js";

const ELECTRON_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Paseo/0.11.1 Chrome/152.0.7977.76 Electron/44.2.0 Safari/537.36";

describe("chromeUserAgent", () => {
  it("drops the Electron and app tokens so the string matches Chrome's", () => {
    expect(chromeUserAgent({ userAgent: ELECTRON_USER_AGENT, appName: "Paseo" })).toBe(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.76 Safari/537.36",
    );
  });

  it("keeps a user agent that names neither", () => {
    const chrome =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.76 Safari/537.36";
    expect(chromeUserAgent({ userAgent: chrome, appName: "Paseo" })).toBe(chrome);
  });

  it("treats the app name literally", () => {
    expect(
      chromeUserAgent({
        userAgent: "A (KHTML) Paseo.Dev/1.0 Chrome/1 Safari/1",
        appName: "Paseo.Dev",
      }),
    ).toBe("A (KHTML) Chrome/1 Safari/1");
  });
});

describe("withGoogleChromeBrand", () => {
  it("adds Google Chrome at Chromium's version", () => {
    expect(withGoogleChromeBrand('"Not?A_Brand";v="24", "Chromium";v="152"')).toBe(
      '"Not?A_Brand";v="24", "Chromium";v="152", "Google Chrome";v="152"',
    );
  });

  it("uses the full version in a full version list", () => {
    expect(withGoogleChromeBrand('"Chromium";v="152.0.7977.76", "Not?A_Brand";v="24.0.0.0"')).toBe(
      '"Chromium";v="152.0.7977.76", "Not?A_Brand";v="24.0.0.0", "Google Chrome";v="152.0.7977.76"',
    );
  });

  it("leaves a list that already names Google Chrome, or names no Chromium", () => {
    const chrome = '"Chromium";v="152", "Google Chrome";v="152"';
    expect(withGoogleChromeBrand(chrome)).toBe(chrome);
    expect(withGoogleChromeBrand('"Not?A_Brand";v="24"')).toBe('"Not?A_Brand";v="24"');
  });
});
