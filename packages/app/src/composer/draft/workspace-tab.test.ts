import { describe, expect, test } from "vitest";

import {
  resolveWorkspaceDraftContentKind,
  validateDraftSubmission,
  type WorkspaceDraftEmptyLayout,
} from "./workspace-tab-core";

const baseComposerState = {
  providerDefinitions: [{ id: "codewhale" }],
  selectedProvider: "codewhale",
  isModelLoading: false,
  effectiveModelId: "",
  availableModels: [],
};

function validate(overrides = {}) {
  return validateDraftSubmission({
    text: "hello",
    allowsEmptyAutoSubmit: false,
    composerState: baseComposerState,
    autoSubmitConfig: null,
    workspaceDirectory: "/tmp/project",
    requiresWorkspaceDirectory: true,
    hasClient: true,
    ...overrides,
  });
}

describe("workspace draft agent model validation", () => {
  test("allows a ready provider with no models to submit without a selected model", () => {
    expect(validate({})).toBeNull();
  });

  test("keeps waiting while model defaults are loading", () => {
    expect(
      validate({
        composerState: {
          ...baseComposerState,
          isModelLoading: true,
        },
      }),
    ).toBe("Model defaults are still loading");
  });

  test("still requires a selected model when the provider exposes models", () => {
    expect(
      validate({
        composerState: {
          ...baseComposerState,
          availableModels: [{ id: "deepseek/deepseek-v4-pro" }],
        },
      }),
    ).toBe("No model is available for the selected provider");
  });

  test("allows an unbound draft to start a conversation without a workspace directory", () => {
    expect(
      validate({
        workspaceDirectory: null,
        requiresWorkspaceDirectory: false,
      }),
    ).toBeNull();
  });
});

describe("workspace draft content presentation", () => {
  test.each<{
    name: string;
    isSubmitting: boolean;
    hasDraftAgent: boolean;
    emptyLayout: WorkspaceDraftEmptyLayout;
    hasError: boolean;
    expected: ReturnType<typeof resolveWorkspaceDraftContentKind>;
  }>([
    {
      name: "optimistic agent owns the body once the first message starts",
      isSubmitting: true,
      hasDraftAgent: true,
      emptyLayout: "docked-with-title",
      hasError: false,
      expected: "stream",
    },
    {
      name: "workspace page keeps its centered empty presentation",
      isSubmitting: false,
      hasDraftAgent: false,
      emptyLayout: "centered",
      hasError: false,
      expected: "centered-title",
    },
    {
      name: "main desktop conversation shows a title above its docked Composer",
      isSubmitting: false,
      hasDraftAgent: false,
      emptyLayout: "docked-with-title",
      hasError: false,
      expected: "docked-title",
    },
    {
      name: "narrow docked conversation only reserves body space for an error",
      isSubmitting: false,
      hasDraftAgent: false,
      emptyLayout: "docked",
      hasError: true,
      expected: "docked-error",
    },
    {
      name: "narrow docked conversation remains empty without an error",
      isSubmitting: false,
      hasDraftAgent: false,
      emptyLayout: "docked",
      hasError: false,
      expected: "none",
    },
  ])("$name", ({ expected, ...input }) => {
    expect(resolveWorkspaceDraftContentKind(input)).toBe(expected);
  });
});
