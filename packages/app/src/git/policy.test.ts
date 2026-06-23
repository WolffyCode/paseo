import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";

import { buildGitActions, type BuildGitActionsInput } from "./policy";

function createInput(overrides: Partial<BuildGitActionsInput> = {}): BuildGitActionsInput {
  return {
    isGit: true,
    hasRemote: false,
    isPaseoOwnedWorktree: false,
    isOnBaseBranch: true,
    hasUncommittedChanges: false,
    baseRefAvailable: true,
    baseRefLabel: "main",
    aheadCount: 0,
    behindBaseCount: 0,
    aheadOfOrigin: 0,
    behindOfOrigin: 0,
    shouldPromoteArchive: false,
    runtime: {
      commit: {
        disabled: false,
        status: "idle",
        handler: () => undefined,
      },
      pull: {
        disabled: false,
        status: "idle",
        handler: () => undefined,
      },
      push: {
        disabled: false,
        status: "idle",
        handler: () => undefined,
      },
      "pull-and-push": {
        disabled: false,
        status: "idle",
        handler: () => undefined,
      },
      "merge-branch": {
        disabled: false,
        status: "idle",
        handler: () => undefined,
      },
      "merge-from-base": {
        disabled: false,
        status: "idle",
        handler: () => undefined,
      },
      "archive-worktree": {
        disabled: false,
        status: "idle",
        handler: () => undefined,
      },
    },
    ...overrides,
  };
}

describe("git-actions-policy", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows only remote sync actions on the base branch", () => {
    const actions = buildGitActions(createInput({ hasRemote: true }));

    expect(actions.secondary.map((action) => action.id)).toEqual(["pull", "push", "pull-and-push"]);
  });

  it("prioritizes pull when the branch is behind origin", () => {
    const actions = buildGitActions(
      createInput({
        hasRemote: true,
        behindOfOrigin: 2,
      }),
    );

    expect(actions.primary).toMatchObject({ id: "pull", label: "Pull" });
  });

  it("keeps push clickable with a clearer message when the branch diverged", () => {
    const actions = buildGitActions(
      createInput({
        hasRemote: true,
        aheadOfOrigin: 1,
        behindOfOrigin: 1,
      }),
    );
    const pushAction = actions.secondary.find((action) => action.id === "push");

    expect(pushAction).toMatchObject({
      disabled: false,
      unavailableMessage:
        "Push isn't available yet because there are newer changes to bring in first",
    });
  });

  it("keeps push available for a no-upstream Paseo worktree with local commits", () => {
    const actions = buildGitActions(
      createInput({
        hasRemote: true,
        isPaseoOwnedWorktree: true,
        isOnBaseBranch: false,
        aheadCount: 1,
        aheadOfOrigin: null,
        behindOfOrigin: null,
      }),
    );
    const pushAction = actions.secondary.find((action) => action.id === "push");

    expect(pushAction).toMatchObject({
      disabled: false,
      unavailableMessage: undefined,
    });
  });

  it("prioritizes push when local commits are unpushed", () => {
    const actions = buildGitActions(
      createInput({
        hasRemote: true,
        isOnBaseBranch: false,
        aheadCount: 2,
        aheadOfOrigin: 2,
      }),
    );

    expect(actions.primary).toMatchObject({ id: "push", label: "Push" });
  });

  it("shows update-from-base only on feature branches that are behind the base branch", () => {
    const actions = buildGitActions(
      createInput({
        hasRemote: true,
        isOnBaseBranch: false,
        behindBaseCount: 3,
      }),
    );
    const updateAction = actions.secondary.find((action) => action.id === "merge-from-base");

    expect(updateAction).toMatchObject({
      label: "Update from main",
      disabled: false,
      unavailableMessage: undefined,
    });
  });

  it("uses a clear sentence when pull is unavailable", () => {
    const actions = buildGitActions(createInput({ hasRemote: true }));
    const pullAction = actions.secondary.find((action) => action.id === "pull");

    expect(pullAction).toMatchObject({
      disabled: false,
      unavailableMessage: "Pull isn't available because this branch is already up to date",
    });
  });

  it("keeps update-from-base off the base branch entirely", () => {
    const actions = buildGitActions(
      createInput({
        hasRemote: true,
        behindOfOrigin: 2,
      }),
    );

    expect(actions.secondary.some((action) => action.id === "merge-from-base")).toBe(false);
  });

  it("enables pull-and-push when the branch has both incoming and outgoing commits", () => {
    const actions = buildGitActions(
      createInput({
        hasRemote: true,
        aheadOfOrigin: 2,
        behindOfOrigin: 3,
      }),
    );
    const action = actions.secondary.find((entry) => entry.id === "pull-and-push");

    expect(action).toMatchObject({
      label: "Pull and push",
      disabled: false,
      unavailableMessage: undefined,
    });
  });

  it("keeps pull-and-push unavailable when the branch only has outgoing commits", () => {
    const actions = buildGitActions(
      createInput({
        hasRemote: true,
        aheadOfOrigin: 2,
        behindOfOrigin: 0,
      }),
    );
    const action = actions.secondary.find((entry) => entry.id === "pull-and-push");

    expect(action).toMatchObject({
      label: "Pull and push",
      unavailableMessage: expect.any(String),
    });
  });

  it("keeps pull-and-push unavailable when the branch only has incoming commits", () => {
    const actions = buildGitActions(
      createInput({
        hasRemote: true,
        aheadOfOrigin: 0,
        behindOfOrigin: 2,
      }),
    );
    const action = actions.secondary.find((entry) => entry.id === "pull-and-push");

    expect(action).toMatchObject({
      label: "Pull and push",
      unavailableMessage: expect.any(String),
    });
  });

  it("explains why pull-and-push is unavailable when the branch is in sync", () => {
    const actions = buildGitActions(createInput({ hasRemote: true }));
    const action = actions.secondary.find((entry) => entry.id === "pull-and-push");

    expect(action).toMatchObject({
      disabled: false,
      unavailableMessage: "Pull and push isn't available because this branch is already in sync",
    });
  });

  it("explains why pull-and-push is unavailable when there are uncommitted changes", () => {
    const actions = buildGitActions(
      createInput({
        hasRemote: true,
        hasUncommittedChanges: true,
        aheadOfOrigin: 1,
      }),
    );
    const action = actions.secondary.find((entry) => entry.id === "pull-and-push");

    expect(action?.unavailableMessage).toBe(
      "Pull and push isn't available while you have local changes so commit or stash them first",
    );
  });

  it("only shows archive worktree for paseo worktrees", () => {
    const hidden = buildGitActions(createInput());
    const shown = buildGitActions(createInput({ isPaseoOwnedWorktree: true }));

    expect(hidden.secondary.some((action) => action.id === "archive-worktree")).toBe(false);
    expect(shown.secondary.some((action) => action.id === "archive-worktree")).toBe(true);
  });

  it("promotes push over local merge when local commits are unpushed", () => {
    const actions = buildGitActions(
      createInput({
        hasRemote: true,
        isOnBaseBranch: false,
        aheadCount: 2,
        aheadOfOrigin: 2,
        behindBaseCount: 3,
      }),
    );

    expect(actions.primary).toMatchObject({
      id: "push",
      label: "Push",
    });
  });

  it("promotes local merge when the branch is ahead of the base", () => {
    const actions = buildGitActions(
      createInput({
        hasRemote: true,
        isOnBaseBranch: false,
        aheadCount: 2,
        behindBaseCount: 3,
      }),
    );

    expect(actions.primary).toMatchObject({
      id: "merge-branch",
      label: "Merge locally",
    });
  });

  it("uses Merge locally for the local merge action", () => {
    const actions = buildGitActions(
      createInput({
        isOnBaseBranch: false,
        aheadCount: 2,
      }),
    );
    const action = actions.secondary.find((entry) => entry.id === "merge-branch");

    expect(action).toMatchObject({ label: "Merge locally" });
  });

  it("uses the active language for policy-owned action labels and unavailable messages", async () => {
    await i18n.changeLanguage("zh-CN");
    const actions = buildGitActions(
      createInput({
        hasRemote: true,
        behindOfOrigin: 1,
        isOnBaseBranch: false,
        aheadCount: 0,
      }),
    );

    expect(actions.primary).toMatchObject({
      id: "pull",
      label: "Pull",
      pendingLabel: "正在 pull...",
      successLabel: "已 pull",
    });
  });
});
