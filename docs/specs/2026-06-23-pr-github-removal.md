# PR / GitHub Integration Removal — Boundary Analysis

**Status:** **EXECUTED 2026-06-23** (app-side). Typecheck 0 / lint 0 / format clean / 36 git unit tests
green / live smoke: app renders, `Commit` split-button present, zero PR·auto-merge entries anywhere.
Original analysis + boundary below is unchanged. See "## Execution" at the bottom for what shipped,
the one kept-feature decision, and the one deferred follow-up.

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

## Execution (2026-06-23)

**Removed (app-side):** the PR action cluster from `policy.ts` / `use-actions.tsx` / `actions-store.ts` /
`workspace-actions.tsx` / `diff-pane.tsx` (PR ids, builders, handlers, `useCheckoutPrStatusQuery`,
`computePrErrorMessage`, the PR ICONS); the whole `git/pull-request-panel/` directory (19 files); the PR
pane timeline query plumbing (`prPaneTimelineQueryKind`, `invalidatePrPaneTimelineForCheckout`, and its
caller in `checkout-status-cache.ts`); the `e2e/pr-pane.spec.ts` + `e2e/helpers/pr-pane.ts`; the PR test
cases in `policy.test.ts` (35→18 it-blocks) and `actions-store.test.ts` (auto-merge cases); and the dead
`workspace.git.actions` PR/auto-merge i18n keys across all 6 locales (108 entries).

**KEPT — decision (spec said "delete `use-pr-status-query.ts` if no other consumer survives — verify"):**
consumers survive, so the **sidebar PR hint** stays — `use-pr-status-query.ts`'s `PrHint` /
`selectPrHintFromStatus` / `useWorkspacePrHint`, the `checkoutPrStatus` cache write in
`checkout-status-cache.ts`, and the hover-card checks summary (`workspace.git.pr.sections.checks`). Only the
now-dead `useCheckoutPrStatusQuery` hook was trimmed from that file. Rationale: it is a passive read-only
indicator, lives in the chairman-protected left sidebar, and removing it would be a separate UI change — out
of this boundary. **If you also want the sidebar PR hint gone, say so and it's a small follow-up.**

**KEPT — not PR features:** `components/icons/github-icon.tsx` and the top-bar "Open workspace in GitHub"
button (`workspace-open-in-editor-primary`) — that is the multi-target **open-in-editor** affordance
(GitHub.dev is one target), not the PR action; `community-links` GitHub link; the sidebar repo remote-URL
display. The top bar no longer renders the _PR action's_ GitHub icon.

**DEFERRED follow-up — `workspace.git.pr.*` i18n namespace:** partially dead (the deleted pane used most of
`sections`/`activity`/`time`/`errors`/`states`/`accessibility`; the surviving hover-card still uses
`sections.checks`). It needs a per-key audit against the kept sidebar hint before removal across 6 locales —
left intact now to avoid silently breaking a live string at 2am. Tagged here so it isn't lost.

**Untouched (per chairman, app-side boundary only):** server `checkoutPr*` / `checkoutGithubSetAutoMerge`
handlers + protocol messages. `commit/pull/push/pull-and-push/merge-branch/merge-from-base/refresh` and the
**core `archive-worktree`** lifecycle are fully intact.
