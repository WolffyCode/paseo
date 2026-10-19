import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron-log/main", () => ({ default: { warn: vi.fn() } }));

const { readChromeExtensionName } = await import("./extension-names.js");

const EXTENSION_ID = "pmnhcgfcafcnkbengdcanjablaabjplo";

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value));
}

describe("readChromeExtensionName", () => {
  let extensionsDirectory: string;

  beforeEach(async () => {
    extensionsDirectory = await mkdtemp(path.join(os.tmpdir(), "chrome-extensions-"));
  });

  afterEach(async () => {
    await rm(extensionsDirectory, { recursive: true, force: true });
  });

  it("reads a plain manifest name from the folder Chrome recorded", async () => {
    await writeJson(path.join(extensionsDirectory, EXTENSION_ID, "1.2.0_0", "manifest.json"), {
      name: "Cookie Editor",
    });

    await expect(
      readChromeExtensionName({
        extensionsDirectory,
        extension: { id: EXTENSION_ID, path: `${EXTENSION_ID}/1.2.0_0`, manifest: null },
        uiLocale: "zh-CN",
      }),
    ).resolves.toBe("Cookie Editor");
  });

  it("resolves a localized name in the UI locale, then the default locale", async () => {
    const folder = path.join(extensionsDirectory, EXTENSION_ID, "10.0_0");
    await writeJson(path.join(extensionsDirectory, EXTENSION_ID, "9.0_0", "manifest.json"), {
      name: "Old version",
    });
    await writeJson(path.join(folder, "manifest.json"), {
      name: "__MSG_appName__",
      default_locale: "en",
    });
    await writeJson(path.join(folder, "_locales", "zh_CN", "messages.json"), {
      APPNAME: { message: "前端助手" },
    });
    await writeJson(path.join(folder, "_locales", "en", "messages.json"), {
      appName: { message: "FeHelper" },
    });
    const extension = { id: EXTENSION_ID, path: null, manifest: null };

    await expect(
      readChromeExtensionName({ extensionsDirectory, extension, uiLocale: "zh-CN" }),
    ).resolves.toBe("前端助手");
    await expect(
      readChromeExtensionName({ extensionsDirectory, extension, uiLocale: "ja" }),
    ).resolves.toBe("FeHelper");
  });

  it("uses the manifest Chrome stored and the files' locales for its message", async () => {
    const folder = path.join(extensionsDirectory, EXTENSION_ID, "2.0_0");
    await writeJson(path.join(folder, "_locales", "en", "messages.json"), {
      extName: { message: "iTab" },
    });

    await expect(
      readChromeExtensionName({
        extensionsDirectory,
        extension: {
          id: EXTENSION_ID,
          path: `${EXTENSION_ID}/2.0_0`,
          manifest: { name: "__MSG_extName__", default_locale: "en" },
        },
        uiLocale: "zh-CN",
      }),
    ).resolves.toBe("iTab");
  });

  it("has no name for an extension whose files are gone", async () => {
    await expect(
      readChromeExtensionName({
        extensionsDirectory,
        extension: { id: EXTENSION_ID, path: null, manifest: null },
        uiLocale: "zh-CN",
      }),
    ).resolves.toBeNull();
  });
});
