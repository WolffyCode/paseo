# Four-column workbench

Status: first-phase implementation is in the working tree as of 2026-10-09. Wide
web and Electron use the four-column shell; compact and native layouts retain
their existing navigation. Existing conversation, creation, editor, Diff, terminal,
and browser views render inside the new shell. Conversation panes support nested
horizontal and vertical splits, tab movement, and closing additional panes. Further
extraction of inner-view interactions remains a later phase. The performance and
cross-platform acceptance targets below still require measured evidence.

## Ownership

Keep the activity rail outside the four columns. Home and Schedules belong at the
top; Settings belongs at the bottom. Put the host picker in the titlebar. Do not
draw a divider between the rail and navigation.

| Surface                    | Owner                        | Contract                                                                         |
| -------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| Titlebar and activity rail | Workbench model              | Select host and activity; retain Home context when another activity opens.       |
| Column 1: navigation       | Navigation model             | Projects, pinned chats, independent chats, and existing creation flow.           |
| Column 2: conversations    | Conversation tabs model      | Conversation views only; closing a tab preserves the chat and its runtime.       |
| Column 3: content          | Conversation workspace model | Files, Markdown, Diff, browser, and terminal tabs for the focused conversation.  |
| Column 4: files            | Explorer view model          | The focused conversation's directory, selection, expansion, and scroll position. |

The four regions have fixed roles. Resizing changes their geometry; it does not
change panel ownership. Within column 2, Cmd+D splits the focused conversation
region to the right and Cmd+Shift+D splits it below. These bindings apply inside
conversation regions, so editor and terminal shortcuts keep their own scope. Each
new region starts with a draft. Tabs can move between conversation regions; the
default region remains when its last tab moves away. Additional regions can close
without archiving their conversations. Column 3 can collapse or maximize across columns 2–4.
Column 4 can collapse. Restore the previous widths and visibility after leaving
maximized content. Mount one four-column frame in the app shell for Home, Settings,
and Schedules. Pages supply region contents; they do not instantiate layouts.
Switching activity preserves column 1's node, width, visibility, surface, and resize
handle. Settings and Schedules use column 1 for navigation and expand column 2
across the remaining space. Home restores columns 3 and 4 from its preferences.
Region contents keep their route context when rendered in the shell.
Return Home without recreating conversations or drafts.

Use three independent identities:

- Host + conversation ID owns content tabs and explorer view state. Use a stable
  draft identity before submission, then bind the real conversation ID in one
  transaction without discarding its workspace.
- A view ID owns a tab, scroll position, cursor, selection, and preview/edit mode.
  Opening the same resource in two conversations creates two views.
- Host + canonical file identity owns the document buffer and save/conflict state.
  Both views observe the same document model. Never identify a file by basename
  alone or share buffers across hosts.

Workspace directory data and watchers can be shared by conversations in the same
workspace. Explorer selection and expansion cannot. An independent conversation
has no user-visible directory until one is selected. Follow [chats](chats.md) for
private execution backing; it is never a substitute explorer root.

## Models and APIs

A model is a plain TypeScript state owner, not an AI model and not a React
component. Follow the model lifetime and external-input conventions in
[forms](forms.md#the-form-model). Every stateful model exposes a stable read-only
snapshot, a subscription, typed commands, and a disposal operation.

| Model                  | Public commands to establish during extraction                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Workbench              | `selectHost`, `selectActivity`, `restoreHome`, `openResourceFromConversation`                                                          |
| Layout                 | `setViewport`, `beginResize`, `updateResize`, `commitResize`, `cancelResize`, `setRegionVisible`, `setContentMaximized`, `resetLayout` |
| Navigation             | `selectProject`, `openConversation`, `startConversation`, `setFilter`, `setGroupExpanded`                                              |
| Conversation tabs      | `open`, `select`, `closeView`, `bindCreatedConversation`                                                                               |
| Conversation workspace | `openResource`, `selectContentTab`, `closeContentTab`, `selectDirectory`, `setViewState`                                               |
| Explorer view          | `selectPath`, `setExpanded`, `setScrollPosition`, `openSelectedFile`                                                                   |
| Document               | Reuse the existing editor model's edit, save, reload, and conflict commands.                                                           |
| Settings and schedules | Reuse their existing domain APIs; extract UI-owned transitions at their source.                                                        |
| Interaction            | `openMenu`, `closeMenu`, `setFocusedControl`, `setHoveredControl`, `requestFocus`                                                      |
| Presentation           | `setAppearance`, `setTransparencyPreference`, `setMotionPreference`, `completeTransition`                                              |

These are local typed APIs. A drag update does not issue HTTP or MCP requests.
Network, filesystem, persistence, navigation, and Electron operations belong to
injected service adapters. A future plugin command can call the same model API
without manipulating a component or a DOM node.

Components receive snapshots and command interfaces. Event handlers translate
input into commands. Do not read global stores, call clients or routing APIs,
mutate model snapshots, or sequence business operations in components. Keep
buttons, tab bars, separators, pane shells, and file rows independently usable.
A logical surface gets a model; every icon does not need its own model instance.

Platform adapters translate pointer coordinates, composition events, DOM/RN focus,
layout measurements, and animation completion into the same commands. Their local
refs and animation values implement rendering. They do not own a second selected
conversation, open-tab list, or persistent layout. Keep transient visual interaction
in an interaction model when it needs state.

Construct each model once for its declared lifetime. Async inputs arrive through
explicit commands. Publish one coherent snapshot for a cross-surface transition:
selecting a conversation also selects its content and explorer owners. An outgoing
network result must carry its host and conversation identity; switching focus does
not redirect it into the newly selected conversation.

Commands validate invariants before publishing. Return a typed outcome for
operations that can fail, and expose pending/error state in the owning snapshot.
Use request identities and cancellation for superseded work. A late save, directory
read, route response, or transition completion cannot overwrite newer intent.

Keep state ownership at its source. Extract the current workspace handlers into
these APIs, then delete the UI-owned versions. Do not add another layout store that
mirrors `workspace-layout-store`, or another editor buffer beside `FileEditorModel`.
The coordinator calls child APIs; child models do not import the coordinator or
reach into another model's mutable state.

## Resource opening

The entry point carries the source conversation explicitly. Clicking a file in the
tree opens it in that conversation's column 3. A message link first selects its
source conversation, then opens its content and expands column 3 if needed.
Deduplicate within the conversation's content tabs by resource identity.

Do not use whichever conversation happens to be focused when an async operation
finishes. A file-open operation captures its owner at invocation. Share the document
model beneath the views, including unsaved changes and save conflicts. Closing a
view releases its view state; it does not discard a dirty document or terminate a
browser, terminal, or agent. Explicit resource termination remains a separate
domain command.

## Geometry and motion

Store user widths and visibility per local workbench. Store content and explorer
view state per conversation. Switching conversations must not resize the shell.
There are three draggable boundaries between four columns; available window width
constrains their total. The activity rail has a fixed width.

Measure effective space before clamping a drag. Preserve minimum readable sizes for
the conversation and content surfaces; do not let a sidebar consume them. On a
narrower viewport, derive effective widths from the saved preference without
overwriting it. Compact layouts use overlays and view switching under
`useIsCompactFormFactor`; they do not squeeze four desktop columns into a phone.

| Interaction                 | Rendering contract                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resize                      | Capture the pointer, coalesce updates to one per frame, follow its position without easing lag, and persist once at completion. Handle release, cancellation, lost capture, and window blur. |
| Expand/collapse             | Animate size and opacity over approximately 240 ms. Keep a stable track structure and retain the surface during exit.                                                                        |
| Maximize/restore            | Animate the same layout properties. Preserve the previous visibility and width preferences.                                                                                                  |
| Conversation, tab, activity | Retain the outgoing visual during a short transition and keep the target's dimensions stable. Preserve drafts, focus rules, and scroll positions.                                            |
| Menu/dialog                 | Animate both entrance and exit. Remove interaction and accessibility exposure from an outgoing surface immediately.                                                                          |
| Reduced motion              | Respect the system preference; use an immediate or minimal transition without delaying the command.                                                                                          |

Model the desired target independently from animation progress. Animation adapters
start from the currently rendered value when the target changes. Completion carries
a transition identity; ignore completion of an interrupted animation. Do not queue
animations behind each other or use a timeout to guess when a panel can unmount.

Restore known layout before the first visible paint. Loading is explicit state with
stable geometry. Retain cached content during refresh; do not show a temporary
empty panel before data arrives. Keep editors and embedded browsers mounted when
switching views where their lifecycle requires it. Reuse the retained-panel owner
and apply its memory policy to inactive ordinary views.

Measure drag performance on the actual desktop build, including a visible editor
and browser. Target the display refresh interval, with a 16.7 ms frame budget at
60 Hz. Avoid publishing pointer samples through the entire application tree. Treat
these as acceptance targets until a trace establishes results on named hardware.

## Glass material

Use translucent background fills and restrained blur. Text, icons, editor content,
and controls keep their normal opacity. Never set opacity on the whole window or
application subtree to simulate glass.

Give each column its own rounded glass surface, including navigation. The activity
rail uses the window backing, so it remains visually separate from column 1 without
a full-height divider.

The Electron window material and app theme must agree. Configure the native window
material in the desktop window owner and preserve it through theme/background
updates. On macOS, evaluate Electron vibrancy for the window backing. On supported
Windows versions, evaluate the native background material. Platforms without that
material use the same layout with an opaque theme surface. Keep reduced-transparency
and contrast preferences in the presentation model.

Use the native backing for the large application surface, with local backdrop blur
only where overlapping menus need it. Avoid stacking a blur over every scrolling
message or editor. Plain browser preview can blur page layers; it cannot reveal or
blur the user's desktop wallpaper. Native material acceptance requires Electron.

Bundle icon assets with the application and standalone preview. A missing CDN must
not remove navigation or operation icons. Keep icon-only controls labeled and
provide tooltips through the existing control primitives.

## First-phase integration

The first phase places existing real capabilities into this shell. The visual
alignment pass also implements the prototype's conversation splitting and panel
hierarchy. It does not replace the Markdown editor or redesign conversation content.

The layout tree remains in `workspace-layout-store`; `workbench/model.ts` owns shell
activity and geometry. The document registry in `file-pane/editor/registry.ts`
retains shared dirty buffers independently of file views. An unsubmitted global
`/new` form starts with content and files collapsed, giving the creation form the
remaining width. Keep the saved widths for manual expansion. Initialize that
visibility once per draft so returning from Settings does not undo a manual
expansion. Workspace draft tabs already own their content and explorer views.

1. Extract the model APIs from current layout and workspace handlers. Establish
   conversation-owned content/explorer state and shared document ownership first.
   Preserve existing chats, drafts, dirty files, and remembered workspace selection.
2. Introduce the titlebar, activity rail, and four fixed surface components. Reuse
   navigation, creation, conversation, editor, Diff, browser, and terminal content.
3. Connect all open/select/close paths to the models. Column 2 accepts conversations
   only, column 4 accepts the file tree only, and changes/Diff live in column 3.
   Fix destination rules at the panel registry, including menus and shortcuts.
4. Connect Settings and Schedules to activity switching. Restore Home without
   rebuilding conversations. Preserve route ownership under [Expo Router](expo-router.md).
5. Connect geometry, presence, theme, and native material adapters. Add persistence
   at the model's commit boundary, with no duplicated old/new state owners.
6. Verify behavior and visual motion in wide browser and Electron, then check compact
   routing and panel behavior. Run focused tests, typecheck, lint, and formatting.

Integration starts in `app/_layout.tsx`, `workspace-screen.tsx`, `split-container.tsx`,
the workspace layout owner, panel manifest, explorer state owner, and editor model
registry. The desktop window owner handles native material. Follow the established
platform file boundaries; do not gate layout with `Platform.OS`.

Acceptance includes same-project conversations with separate views; different-host
resources; independent chats without a directory; closing and reopening a running
conversation; shared dirty file edits; file/message/Diff opening destinations;
Settings round trips; persistence after restart; rapid resize/collapse reversals;
pointer cancellation; and reduced motion/transparency. Add these to the existing
relevant suites and QA flow. Do not run the full local test suite.
