# Unified Top Bar Redesign (Codex-style) — Design + Behaviors

**Status:** design approved 2026-06-23 (chairman). Mockup: `/tmp/paseo-shot/topbar-mockup.png`.
Implementation pending.

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

## Note

The previous interim ("toggle at the tools tab-bar **leading** edge") is superseded by this design and
will be reworked into the trailing-toggle + unified-top-bar layout.
