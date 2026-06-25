# Legacy ExplorerSidebar Removal — Clean Refactor Plan

**Status:** in progress — the visible render is already removed (2026-06-22); full root migration deferred to overnight autonomous run.

**Done early (2026-06-22, to make the legacy panel disappear immediately):** removed from
`workspace-screen.tsx` the `<ExplorerSidebar>` render (3989), its `showExplorerSidebar` memo,
`shouldShowWorkspaceExplorerSidebar`, `handleOpenFileFromExplorer`, and the `ExplorerSidebar` import.
typecheck (all packages) + lint clean; live-confirmed the 变更/文件 panel is gone and the new
审查/文件 tabs still render the diff. **Still TODO tonight:** everything else below (migrate the 4
openers, delete component/context/gesture files, panel-store dead model, `_layout.tsx` global keyboard,
i18n, tests). Until then the secondary "open file explorer" entry points (agent directory click,
review attachment, terminal browse-files) are inert — they call `openFileExplorerForCheckout` which now
renders nothing. Tonight's migration repoints them to the new 文件/审查 tabs.

**Rule:** refactor, don't patch — delete the legacy explorer + migrate every opener to the new
审查/文件 right-panel tabs. No hidden gates, no broken buttons. See
[docs/coding-standards.md](../coding-standards.md) "Refactor, don't patch".

## Why

The canvas redesign moved 审查 (review/diff) and 文件 (files) into right-panel tabs
(`panels/review-panel.tsx`, `panels/files-panel.tsx`, routed by `workspace-tabs/tab-surface.ts`).
The legacy `ExplorerSidebar` (the combined 变更/文件 toggle panel) is now redundant but still
renders (persisted `desktop.fileExplorerOpen`) and is still opened by several features. Delete it
and migrate its openers to the new tabs.

## Deletion surface (mapped 2026-06-22 by two audits)

### 1. Shared helpers — `workspace/file-open/index.ts`

Add, mirroring `createWorkspaceFileTabTarget`:

- `createWorkspaceReviewTabTarget(workspaceId): { kind: "review"; workspaceId }`
- `createWorkspaceFilesTabTarget(workspaceId): { kind: "files"; workspaceId }`

### 2. Migrate openers → new tabs (do this BEFORE deleting panel-store actions)

All four have `serverId` + `workspaceId`; open via
`navigateToPreparedWorkspaceTab({ serverId, workspaceId, target })` (`@/utils/workspace-navigation`).

- `panels/terminal-panel.tsx` (86–95, 117): `handleOpenFileExplorer` → open **文件** tab.
- `panels/agent-panel.tsx` (1472–1494): review attachment → open **审查** tab. Drop
  `openFileExplorerForCheckout` + `setExplorerTabForCheckout({tab:"changes"})`.
- `composer/draft/workspace-tab.tsx` (406–428): identical to agent-panel → **审查** tab.
- `agent-stream/view.tsx` (266–267, 342–356): directory-click branch → open **文件** tab
  (consistent with the file branch right above, which already uses `navigateToPreparedWorkspaceTab`).
  Keep `requestDirectoryListing`. Drop the two panel-store reads.

### 3. Delete component files

- `components/explorer-sidebar.tsx`
- `contexts/explorer-sidebar-animation-context.tsx`
- `hooks/use-explorer-open-gesture.ts`
- `components/diff-scroll.tsx`: remove `useExplorerSidebarAnimationOptional` import + the
  `closeGestureRef` `waitFor` wiring (it was sidebar swipe coordination; the tab just scrolls).

### 4. `screens/workspace/workspace-screen.tsx`

Remove: imports (66 ExplorerSidebar, 73 ExplorerSidebarAnimationProvider, 75 useExplorerOpenGesture);
provider wrapper (971–977); `explorerOpenGesture` + its `GestureDetector` (924–930);
`shouldShowWorkspaceExplorerSidebar` (1730); the `isExplorerOpen` / `openFileExplorerForCheckout` /
`toggleFileExplorerForCheckout` / `showMobileAgent` reads + `activeExplorerCheckout` /
`openExplorerForWorkspace` / `handleToggleExplorer` (2028–2066); `explorerToggleStyle` /
`explorerToggleAccessibilityState` (2069–2080); BackHandler effect (2082–2096); `explorerToggleLabel`
(2575); `showExplorerSidebar` memo (3752); `ExplorerSidebar` render (3989–3990); `EXPLORER_TOGGLE_KEYS`
(4355).
Buttons (3615–3720):

- **Button 1** (git desktop, has diff stat): keep, `onPress={handleOpenReviewFromChanges}` (already).
  Replace dead deps — simple hover/press style, accessibilityLabel = review label
  (`workspace.header.actions.review`), drop `isExplorerOpen` active state + accessibilityState;
  tooltip label → review, shortcut keys → `["ctrl","shift","G"]`.
- **Button 2** (non-git desktop): DELETE — redundant with `WorkspaceToolPanelToggle`.
- **Button 3** (mobile): `onPress` → `isGitCheckout ? handleOpenReviewFromChanges : handleOpenFileTool`.
  Clean dead deps.
- `headerRight` useMemo deps (3723–3745): drop `handleToggleExplorer`, `isExplorerOpen`,
  `explorerToggleLabel`, `explorerToggleAccessibilityState`, `explorerToggleStyle`; add
  `handleOpenFileTool` if referenced.
- `handleWorkspaceSidebarAction` (3208–3217): `handleToggleExplorer()` → `handleToggleRightToolPanel()`.
  mod+E / ctrl+` now toggle the right tool panel (semantically "toggle right sidebar"). Update deps.

### 5. `app/_layout.tsx`

`toggleDesktopSidebars` (435–449): drop `closeDesktopFileExplorer` + file-explorer branch. The
`sidebar.toggle.right` dispatch now toggles the tool panel (handled in workspace-screen). Simplify
`toggleDesktopSidebarsWithCheckoutIntent` (and the helper) to the agent-list-only shape.

### 6. `stores/panel-store/` (do AFTER 2/4/5 so typecheck pinpoints orphans)

SAFE-DELETE (then re-run typecheck to confirm no surviving refs):

- `openFileExplorerForCheckout`, `toggleFileExplorerForCheckout`, `closeDesktopFileExplorer`,
  `desktop.fileExplorerOpen`, `selectIsFileExplorerOpen`, `buildOpenFileExplorerPatch`,
  `buildToggleFileExplorerPatch`
- `explorerWidth`, `setExplorerWidth`, `clampExplorerWidth`, `DEFAULT_EXPLORER_SIDEBAR_WIDTH`
- `explorerTab`, `setExplorerTab`
- `explorerFilesSplitRatio`, `setExplorerFilesSplitRatio`, `clampExplorerFilesSplitRatio`
- the changes/files toggle model once its consumers are migrated: `setExplorerTabForCheckout`,
  `explorerTabByCheckout`, `activateExplorerTabForCheckout`, `coerceExplorerTabForCheckout`,
  `resolveExplorerTabForCheckout`, `buildExplorerCheckoutKey`, `ExplorerCheckoutContext`
- `partialize`: remove `explorerWidth`, `explorerTab`, `explorerTabByCheckout`, `explorerFilesSplitRatio`.
  KEEP (surviving `file-explorer-pane.tsx` / `diff-pane.tsx`): `explorerSortOption` (+setter),
  `explorerShowHiddenFiles` (+toggle), `expandedPathsByWorkspace` (+setter),
  `diffExpandedPathsByWorkspace` (+setter), `showMobileAgent` (left-sidebar etc.).
  Persist note: Zustand persist tolerates removed `partialize` keys + extra stored keys → no migration.

### 7. i18n — remove `workspace.tabs.explorer` block (changes/files/open/close/toggle)

`en.ts`, `ar.ts` (491–497), `zh-CN.ts` (491–497), `es.ts`, `fr.ts` (496–502), `ru.ts` (495–501).
`i18n/resources.test.ts` (419–420): drop the `explorer.changes` / `explorer.files` assertions.

### 8. keyboard

Keep `sidebar.toggle.right` action + its mod+E / ctrl+`bindings +`toggle-right-sidebar` help label —
they now toggle the tool panel. No keyboard-config files need deletion. (`canToggleFileExplorerShortcut`in`keyboard-shortcut-routing.ts` is already orphaned — pre-existing dead code, leave for a separate sweep.)

### 9. Tests

- `stores/panel-store/state.test.ts`: drop the `selectIsFileExplorerOpen` visibility suite (≈108–136)
  and any explorerTab/explorerWidth tests for deleted symbols; keep file-tree-settings tests.
- `i18n/resources.test.ts`: 419–420.
- Re-run only the changed test files (`npx vitest run <file> --bail=1`).

### 10. Verify

- `npm run typecheck` (rebuild client/server dist if cross-package errors surface).
- `npm run lint` ; `npm run format`.
- Live (desktop web): old 变更/文件 panel GONE; picker centered; git-diff → 审查+文件; mod+E toggles
  tool panel; file/dir click in agent output → file/文件 tab; review attachment → 审查 tab.

## Commit

Separate commit from the feature work, e.g. `refactor(app): delete legacy ExplorerSidebar, route file/review opens to right-panel tabs`.
