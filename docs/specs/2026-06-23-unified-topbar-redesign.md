# Unified Top Bar Redesign (Codex-style) — Design + Behaviors

**Status:** **IMPLEMENTED + live-verified 2026-06-23.** Mockup: `/tmp/paseo-shot/topbar-mockup.png`.
M1 `f6199720` (renderPaneHeader) · M2 `37a0b8a8` (header → main pane, narrows on expand: Commit CTA
1383→801px) · M3 `bd45a783` (toggle pinned top-right, identical X 1672=1672 collapsed/expanded). M4
needed **no code** — diff-badge toggle already existed (`handleToggleReviewFromChanges`), collapse-keeps-tabs
works (`rightToolPanelCollapsedByWorkspace`), switch-clears works (fresh per workspace), and the top-bar↔canvas
divider was already removed by M2 (the header is a `borderless` `ScreenHeader` rendered inside the main pane).
Desktop-only change; mobile keeps the standalone header. All verified via Playwright at :8082.

## Goal

Make the workspace top bar a single unified strip (like Codex), where the right tool panel's
tab bar lives **in the top bar** and the expand/collapse toggle is **pinned at the window's
top-right corner and never moves**.

## Layout

The top bar is composed of two segments that align strictly with the resizable split below:

- **Main segment** (above the main pane): `≡ 标题  WolffyCode/paseo  ···` … `[Commit ▾] [diff 徽标]`.
- **Tools segment** (above the tools pane, only when open): `[审查][文件][+]` … `[▢ toggle]`.

Strict alignment is required → implement by rendering each pane's header **inside the split**
(so widths track the pane + resize automatically), not as a separate full-width bar.

- The **toggle is always at the far-right of the rightmost pane's header** = window corner:
  - **Collapsed:** main pane is full width → toggle sits at the main header's far right (expands).
  - **Expanded:** tools pane is rightmost → toggle sits at the tools tab-bar's far right (collapses).
  - Net effect: the toggle's screen position is unchanged across states ("位置一直不变").
- On expand, the main pane narrows, so its controls (Commit, diff badge) **shift left**; the freed
  right space becomes the tools tab bar.
- The tools pane has **no separate tab-bar row** anymore — its tabs are in the top bar.

## Behaviors

1. **GitHub jump icon: removed** from the top bar.
2. **diff 徽标 (`+2.4k −624`) = review toggle.** Click once → expand panel + open 审查 (review).
   Click again → collapse. (Replaces the current open-only `handleOpenReviewFromChanges`; add
   toggle semantics.)
3. **Collapse preserves content.** Collapsing the panel must NOT remove its tabs — reopening shows
   the same tabs. Only the user pressing a tab's `×` removes a tab.
   - **Implementation note:** today `closeRightToolPanel → removeRightToolPanelFromLayout` removes the
     RIGHT_PANEL pane node from the tree (`workspace-layout-actions.ts:1504`), which drops its tabs.
     Need a **collapsed-but-kept** state: keep the pane + its tabIds, mark the panel hidden, and
     un-hide on expand. (Likely a `rightToolPanelCollapsedByWorkspace` flag in the layout store, with
     the split renderer skipping the tools pane when collapsed but retaining its node/tabs.)
4. **Switching workspace/conversation clears the right panel.** When the active workspace changes,
   the right panel's tabs are cleared (fresh per workspace). Verify current behavior; add clearing if
   absent.

## Implementation plan

- **split-container:** add `renderPaneHeader?: (paneId) => ReactNode` (mirror `renderPaneEmptyState`),
  rendered as the pane's top header. Main pane → workspace controls; tools pane → existing tab bar.
  Move the toggle to the tab-bar **trailing** (far right) for the tools pane; revert the previous
  leading-slot toggle.
- **workspace-screen:** remove the standalone full-width `ScreenHeader`; provide `renderPaneHeader`
  for `MAIN_PANE_ID` (title + Commit + diff badge + menu + toggle-when-collapsed). Remove GitHub icon.
  Wire diff badge to a toggle handler (open review / collapse).
- **layout store:** add the collapsed-but-kept state for D; clear right panel on workspace switch (E).
- Verify: typecheck/lint, then live (collapsed toggle at corner; expand → tabs in top bar aligned with
  panel; resize keeps alignment; diff badge toggles; collapse keeps tabs; switch clears).

## Implementation milestones (code-anchored — current as of `1390526b`)

Build in this order; each is a compilable + live-verifiable checkpoint commit. Never leave the top bar
half-broken between milestones (chairman hard rule).

**Current structure (what exists today):**

- `components/split-container.tsx`: `SplitContainerProps` (l.84) already has `renderPaneEmptyState` (l.126)
  - `renderPaneTabBarLeading` (l.127). `SplitPaneView` renders per pane (l.1032–1100): an optional
    tab-bar row (`showTabBar`, l.1035) whose `WorkspaceDesktopTabsRow` takes `leading={renderPaneTabBarLeading}`
    (l.1040), then `paneContent`. The MAIN pane has **no** tab bar (single conversation); the RIGHT_PANEL pane
    has the review/files tab bar.
- `screens/workspace/workspace-screen.tsx`: a full-width `ScreenHeader` (l.3753, `borderless`) with
  `left` = `SidebarMenuToggle` + `WorkspaceHeaderTitleBar` (≡ title / repo / ··· menu) and `right` =
  `headerRight` (Commit split-button `changes-primary-cta`, diff badge, `workspace-explorer-toggle`, and
  `WorkspaceToolPanelToggle` l.1383). `SplitContainer` at l.3676. The interim right-panel toggle is injected
  via `renderSplitPaneTabBarLeading` for `RIGHT_PANEL_PANE_ID` (l.3468–3488). Collapse-but-kept state
  **already exists**: `rightToolPanelCollapsedByWorkspace` (l.2032) — verify it retains tabs.

**M1 — split-container `renderPaneHeader` (additive, safe).** Add `renderPaneHeader?: (paneId) => ReactNode`
to `SplitContainerProps` (mirror `renderPaneEmptyState`); thread it through `SplitNodeView`/`SplitPaneView`;
render it inside `styles.pane` **above** the `showTabBar` block (l.1035) as the pane's top header, full pane
width so it tracks resize. Add a `trailing` prop to `WorkspaceDesktopTabsRow` (mirror `leading`, l.1040) for
the tools-pane toggle. Typecheck only — no visual change yet.

**M2 — main-pane header + drop standalone `ScreenHeader` (collapsed state matches mockup).** Provide
`renderPaneHeader(MAIN_PANE_ID)` = the current `ScreenHeader` content (`SidebarMenuToggle` +
`WorkspaceHeaderTitleBar` + `headerRight` Commit/diff-badge) **plus** the toggle at far-right **when
collapsed**. Stop rendering the standalone `ScreenHeader` on desktop/focused (keep mobile path). Header height
must equal the tools tab-bar height so the strip reads as one bar. Live: collapsed top bar = mockup “收起”.

- **M1 done** (`f6199720`): `SplitContainer` now accepts `renderPaneHeader`, rendered above each pane.
- **Gotcha (must get right, else stale header / TDZ crash = broken top bar):** the header must be a
  **stable** node — `desktopSplitContent` is a `useMemo`, and an unstable `renderPaneHeader` makes the whole
  split chrome re-render every keystroke. So memoize: `headerLeft` (mirror the existing `headerRight`
  `useMemo` at ~l.3514) → `workspaceHeaderNode` `useMemo` → `renderSplitPaneHeader` `useCallback`, inserted
  **after** `headerRight`/`showScreenHeader`/`createTerminalDisabled` (l.3651/3653/3657) and **before**
  `desktopSplitContent` (l.3671). `headerLeft`'s ~35 deps are the `WorkspaceHeaderTitleBar` props
  (l.3760–3800); most come from a **hook-destructured bundle** (`isWorkspaceHeaderLoading` /
  `workspaceHeaderTitle` / `workspaceHeaderSubtitle` / `shouldShowWorkspaceHeaderSubtitle` /
  `currentBranchName` are fields on a status object — find the destructure and confirm it's < l.3671).
  Over-list deps (safe); the danger is _under_-listing → stale header. Then `renderPaneHeader` flows into
  `desktopSplitContent`'s dep array, and the standalone header becomes `{isMobile ? workspaceHeaderNode : null}`.

**M3 — tools-pane header = tab bar + trailing toggle (expanded state matches mockup).** Put the toggle in the
tools tab-bar **trailing** slot (shown when expanded); **revert** `renderSplitPaneTabBarLeading`. The toggle’s
screen-X must be identical collapsed-vs-expanded (window right corner). On expand, main pane narrows →
Commit/diff shift left; freed right space = tools tab bar. Live: expand → tabs in top bar, aligned + resize.

**M4 — behaviors + chrome.** diff badge (`+2.4k −624`) = review **toggle** (open review+expand / re-click
collapse), replacing open-only `handleOpenReviewFromChanges`. Remove the top-bar↔canvas **divider**
(`borderBottom` at l.4076 / l.4124 — confirm which is the header rule). Verify collapse keeps tabs
(`rightToolPanelCollapsedByWorkspace`) and workspace/conversation switch clears the right panel. GitHub jump
icon already gone (Phase 2). Live: full mockup diff (toggle fixed, diff-toggle, collapse-keeps, switch-clears,
seamless strip).

## Note

The previous interim ("toggle at the tools tab-bar **leading** edge", `renderSplitPaneTabBarLeading`) is
superseded by this design and is reverted in **M3**.
