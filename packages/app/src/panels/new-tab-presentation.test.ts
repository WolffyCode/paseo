import { describe, expect, it } from "vitest";
import { workbenchContentPaneId } from "@/workbench/layout";
import { newTabPresentation } from "./new-tab-presentation";

describe("newTabPresentation", () => {
  it("presents a column 3 new tab as the home page", () => {
    expect(newTabPresentation(workbenchContentPaneId("agent:a1"))).toEqual({
      labelKey: "workspace.home.title",
      icon: "home",
    });
  });

  it("keeps the plain new tab everywhere else", () => {
    const plainNewTab = { labelKey: "workspace.tabs.actions.newTab", icon: "plus" };
    expect(newTabPresentation(null)).toEqual(plainNewTab);
    expect(newTabPresentation("main")).toEqual(plainNewTab);
    expect(newTabPresentation("workbench:conversations")).toEqual(plainNewTab);
  });
});
