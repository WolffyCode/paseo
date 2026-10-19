import { describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import { settingsPageTitle } from "./titles";

const chineseT = i18n.getFixedT("zh-CN");

describe("settingsPageTitle", () => {
  it("names the settings page itself 设置, as Chrome's title does", () => {
    expect(settingsPageTitle("paseo://settings", chineseT)).toBe("设置");
    expect(settingsPageTitle("paseo://settings/autofill", chineseT)).toBe("设置");
  });

  it("adds the section a route shows, and a dialog's section", () => {
    expect(settingsPageTitle("paseo://settings/appearance", chineseT)).toBe("设置 - 外观");
    expect(settingsPageTitle("paseo://settings/people", chineseT)).toBe("设置 - 我与 Google");
    expect(settingsPageTitle("paseo://settings/clearBrowserData", chineseT)).toBe(
      "设置 - 隐私与安全",
    );
    expect(settingsPageTitle("paseo://settings/importData", chineseT)).toBe("设置 - 我与 Google");
    expect(settingsPageTitle("paseo://settings/help", chineseT)).toBe("设置 - 关于 Helm");
  });

  it("names a subpage by its own title", () => {
    expect(settingsPageTitle("paseo://settings/manageProfile", chineseT)).toBe(
      "设置 - 自定义个人资料",
    );
  });
});
