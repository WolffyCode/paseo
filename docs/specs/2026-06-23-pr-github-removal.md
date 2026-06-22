# PR / GitHub Integration Removal — Boundary Analysis

**Status:** analysis done 2026-06-23; **deletion CONFIRMED by chairman.** Deferred to the overnight root
cleanup. This file is the precise boundary.

**Rationale (clarified):** PRs are NOT created against paseo — the server derives the target repo from the
workspace's own `git config --get remote.origin.url` (`github-service.ts` + `checkout-git.ts`), so a PR
goes to whatever GitHub repo the workspace's origin points at (the user's own repo). The "WolffyCode/paseo"
breadcrumb only appears because that demo workspace is itself a clone of the paseo repo. We delete PR/
auto-merge anyway because it is a **GitHub-exclusive feature** (requires GitHub; unusable on GitLab/
self-hosted/no-remote) and Helm stays provider-neutral. `commit/pull/push` are remote-agnostic → kept.

## Verdict

The boundary is clean. `commit / pull / push` (and `pull-and-push / refresh / merge-branch /
merge-from-base`) are **general git** — they call pure-git server RPCs that work with any remote
(GitHub, GitLab, self-hosted, none) and have **zero GitHub dependency**. The PR + GitHub actions are a
**separable cluster**.

## KEEP — general git (`git/actions-store.ts`, `git/policy.ts`, `git/use-actions.tsx`)

| action            | server RPC                             |
| ----------------- | -------------------------------------- |
| `commit`          | `checkoutCommit`                       |
| `pull`            | `checkoutPull`                         |
| `push`            | `checkoutPush`                         |
| `pull-and-push`   | `checkoutPull` + `checkoutPush`        |
| `merge-branch`    | `checkoutMerge` (local merge of base)  |
| `merge-from-base` | `checkoutMergeFromBase` (local update) |
| `refresh`         | `checkoutRefresh`                      |

## DELETE — GitHub/PR-specific (all require a GitHub connection)

App side:

- Actions: `pr` (create/view), `merge-pr-{squash,merge,rebase}`, `enable-pr-auto-merge-{squash,merge,rebase}`,
  `disable-pr-auto-merge`.
- Store (`git/actions-store.ts`): `createPr` (`checkoutPrCreate`), `mergePr` (`checkoutPrMerge`),
  `enablePrAutoMerge`/`disablePrAutoMerge` (`checkoutGithubSetAutoMerge`),
  `assertGitHubAutoMergeActionsSupported`, and the PR ids from `CheckoutGitAsyncActionId`.
- `git/use-actions.tsx`: drop the PR status reads/handlers (`handleCreatePr`, `handleMergePr`,
  `handleEnablePrAutoMerge`, `handleDisablePrAutoMerge`, `handlePrAction`), `useCheckoutPrStatusQuery`,
  `githubFeaturesEnabled`/`githubAutoMergeActionsEnabled`, and `shipDefault` (pr/merge → just merge).
- `git/policy.ts`: delete the whole PR cluster — `PULL_REQUEST_*_ACTION_MODELS`, `buildPrAction`,
  `buildDirectPullRequestMergeAction`, `buildEnablePullRequestAutoMergeAction`,
  `buildDisablePullRequestAutoMergeAction`, `canMergePr`, `canEnablePrAutoMerge`, `hasEnabledPrAutoMerge`,
  `canUsePullRequestActionAsShipDefault`, all `*PullRequest*` helpers, `getCreatePrUnavailableMessage`,
  `getMergePrUnavailableMessage`, the PR ids from `GitActionId`.
- `git/workspace-actions.tsx`: drop `GitHubIcon`/`ThemedGitHubIcon` + the `viewPr/createPr/mergePr*`
  ICONS entries. **The top-bar GitHub icon IS the `pr` action's icon — deleting PR removes it.**
- `git/pull-request-panel/` — the entire directory (~20 files: pane, data, timeline, activity-state,
  tab-icon, query-keys, …) + its tab registration / usages.
- `git/use-pr-status-query.ts`, `components/icons/github-icon.tsx` (if no other consumer survives — verify),
  related i18n keys (`workspace.git.actions.{createPr,viewPr,mergePr,autoMerge,unavailable.*Pr*,*Github*}`).
- Diff pane (`git/diff-pane.tsx`) PR icon entries (mirror of workspace-actions ICONS).

## The two coupling points (edit, don't fear)

1. `policy.ts > getPrimaryActionId`: remove the PR branches (`canMergePr`, `canEnablePrAutoMerge`,
   `hasEnabledPrAutoMerge`, the `shipDefault==="pr"` branch, the trailing `hasPullRequest` branch).
   The primary then falls through to commit → pull → push → merge-branch → merge-from-base.
2. `policy.ts > getFeatureActionIds` + `buildGitActions` secondary list: drop the PR action ids.

## KEEP — CORE, do not touch

`archive-worktree` (`archivePaseoWorktree`) + the **worktree-per-task isolation model** is a **CORE
mechanism the chairman explicitly requires kept** (2026-06-23: "必须保留，这个是核心机制"). It is
unrelated to PRs — the PR/GitHub removal must leave it (and the worktree create/archive lifecycle) fully
intact. Do NOT remove the worktree concept.

## Server side (optional, larger scope)

The client RPCs map to server `checkoutPr*` / `checkoutGithubSetAutoMerge` handlers + protocol messages.
A full removal can delete those too, but the **app-side boundary alone is clean** — removing the app PR
cluster does not touch commit/pull/push.

## Verify after deletion

typecheck (all packages) + lint; live: the commit/pull/push split-button still works; no GitHub icon in
the top bar; no PR entries in the dropdown; diff pane has no PR actions.
