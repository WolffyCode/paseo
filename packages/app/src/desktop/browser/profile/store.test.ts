import { describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import { profileDisplayName, profileNameToSave } from "./store";

const chineseT = i18n.getFixedT("zh-CN");

describe("profileNameToSave", () => {
  it("saves a name without its outer whitespace", () => {
    expect(profileNameToSave("  工作  ")).toBe("工作");
  });

  it("refuses a name that is only whitespace, as the field's pattern does", () => {
    expect(profileNameToSave("")).toBeNull();
    expect(profileNameToSave("   ")).toBeNull();
  });
});

describe("profileDisplayName", () => {
  it("calls a profile that was never named 您的 Helm, as Chrome calls it 您的 Chrome", () => {
    expect(profileDisplayName(null, chineseT)).toBe("您的 Helm");
    expect(profileDisplayName("工作", chineseT)).toBe("工作");
  });
});
