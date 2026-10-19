import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";

import { buildToolCallPresentation, type ToolCallPresentationIcon } from "./presentation";

const englishT = i18n.getFixedT("en");
const chineseT = i18n.getFixedT("zh-CN");

const fakeIcons = {
  brain: (() => null) as ToolCallPresentationIcon,
  eye: (() => null) as ToolCallPresentationIcon,
  wrench: (() => null) as ToolCallPresentationIcon,
};

function fakeResolveIcon(
  toolName: string,
  detail: ToolCallDetail | undefined,
): ToolCallPresentationIcon {
  if (detail?.type === "plan") {
    return fakeIcons.brain;
  }
  if (detail?.type === "read") {
    return fakeIcons.eye;
  }
  if (toolName === "exec_command") {
    return fakeIcons.wrench;
  }
  return fakeIcons.wrench;
}

describe("tool-call presentation", () => {
  it("builds badge, detail, icon, and file-open policy in one model", () => {
    const presentation = buildToolCallPresentation({
      t: englishT,
      toolName: "read_file",
      status: "completed",
      error: null,
      cwd: "/tmp/repo",
      detail: {
        type: "read",
        filePath: "/tmp/repo/src/index.ts",
        content: "console.log('hi');",
      },
      resolveIcon: fakeResolveIcon,
    });

    expect(presentation).toMatchObject({
      displayName: "Read",
      summary: "src/index.ts",
      icon: fakeIcons.eye,
      isLoadingDetails: false,
      hasDetails: true,
      canOpenDetails: true,
      openFilePath: "/tmp/repo/src/index.ts",
      isPlan: false,
    });
  });

  it("marks running calls without meaningful detail as loading details", () => {
    const presentation = buildToolCallPresentation({
      t: englishT,
      toolName: "exec_command",
      status: "running",
      error: null,
      detail: {
        type: "unknown",
        input: {},
        output: null,
      },
      resolveIcon: fakeResolveIcon,
    });

    expect(presentation).toMatchObject({
      displayName: "Exec command",
      icon: fakeIcons.wrench,
      isLoadingDetails: true,
      hasDetails: false,
      canOpenDetails: true,
      openFilePath: null,
      isPlan: false,
    });
  });

  it("keeps plan calls out of the expandable badge path", () => {
    const presentation = buildToolCallPresentation({
      t: englishT,
      toolName: "ExitPlanMode",
      status: "completed",
      error: null,
      detail: {
        type: "plan",
        text: "1. Do the thing",
      },
      resolveIcon: fakeResolveIcon,
    });

    expect(presentation.isPlan).toBe(true);
    expect(presentation.icon).toBe(fakeIcons.brain);
  });

  it("shows fixed tool kinds in the app language and provider tool names as written", () => {
    const shell = buildToolCallPresentation({
      t: chineseT,
      toolName: "Bash",
      status: "completed",
      error: null,
      detail: { type: "shell", command: "ls -la" },
      resolveIcon: fakeResolveIcon,
    });
    const providerTool = buildToolCallPresentation({
      t: chineseT,
      toolName: "todo_write",
      status: "completed",
      error: null,
      resolveIcon: fakeResolveIcon,
    });

    expect(shell.displayName).toBe("命令");
    expect(shell.summary).toBe("ls -la");
    expect(providerTool.displayName).toBe("Todo write");
  });
});
