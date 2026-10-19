# Browser Capture Harness

The desktop capture harness is the real-Electron verification path for browser screenshots.
It validates the compositor behavior that unit tests cannot see:

- the resident automation `<webview>` starts in the production parking state;
- the parked guest remains paintable and has a copyable viewport frame;
- a never-presented resident webview guest defaults to 1280x800 logical pixels;
- multiple resident webviews are parked as an overlapping stack without per-capture
  stacking changes;
- a newly attached resident webview whose first useful frame is delayed can be captured
  by retrying until the frame appears;
- both viewport `capturePage` and full-page CDP screenshots return real pixels from
  the permanent production parking state;
- parked guests remain capturable with Chromium background throttling enabled;
- the real-Electron host-composer sentinel proves guest Enter cannot submit a focused
  host composer;
- the automation group loads the compiled production keyboard boundary and guest
  preload, then proves that initial page window handlers get first refusal, unhandled
  shortcuts synchronously suppress editable browser defaults before crossing the host
  boundary, shortcuts marked unavailable in editable targets retain the browser field's
  native behavior, handlers registered after preload still get first refusal, focused
  iframes share the same boundary, digit wildcard shortcuts cross, and background automation
  stays in the guest.

Run it with the repo Electron:

```bash
npm run capture-harness --workspace=@getpaseo/desktop
```

Build the desktop main process before the automation group so its production guest
preload is available:

```bash
npm run build:main --workspace=@getpaseo/desktop
PASEO_CAPTURE_HARNESS_GROUP=automation npm run capture-harness --workspace=@getpaseo/desktop
```

Run the shared browser profile fixture with:

```bash
PASEO_CAPTURE_HARNESS_GROUP=browser-profile npm run capture-harness --workspace=@getpaseo/desktop
```

On macOS, test native titlebar dragging after scrolling with:

```bash
PASEO_CAPTURE_HARNESS_GROUP=titlebar-drag npm run capture-harness --workspace=@getpaseo/desktop
```

This group needs Xcode Command Line Tools and Accessibility permission for the
terminal running it. It sends real mouse input to its test window and checks
window movement, including button clicks and a portal over the titlebar. Leave
the mouse idle during this group. It reads the app's production CSS and writes
screenshots and window bounds to the output directory.

The browser profile group runs two Electron processes in sequence. It verifies that each
renderer-side `did-attach` identity maps to the correct main-process guest, that two live
tabs share cookies and local storage through one persistent session, and that the data is
still present after the first Electron process exits and the second starts.

The automation group uses a real guest webview to verify the page-side ref contract:
ARIA-like snapshot text includes headings, static text, and controls; refs survive
`pushState` when the element still matches; same-URL rerenders stale old refs; and a
file-input ref can be resolved to a CDP backend node id for upload. It also verifies
page-context evaluation, including passing a resolved ref element as the function argument.
Keyboard containment runs last because the host-composer sentinel intentionally leaves
native focus in the host. It reuses an existing fixture button: adding a test-only control
changes the inline fixture geometry exercised by the earlier actionability checks.

On macOS the harness process must set `app.setActivationPolicy("accessory")` and
hide the Dock icon before creating any window. `showInactive()` only prevents window
focus; a normal Electron app launch can still activate the app and steal focus.
Harness windows are then created hidden, positioned in a screen corner, skipped from
the taskbar where Electron supports it, and revealed with `showInactive()` from
`ready-to-show`. Do not replace this with `show()`, `focus()`, or `app.focus()`:
the compositor only needs visible inactive windows, and harness runs must not steal
focus from the person using the machine.

The harness writes PNG evidence and `results.json` to:

```text
packages/desktop/capture-harness/out/
```

A passing run prints `PASS` lines for the production P1 default-throttling parking state,
including fresh, settled, 75-second soak, multi-tab, viewport, and full-page checks. The
PNG sizes may be device-pixel scaled; on a Retina display the 1280x800 logical viewport
is usually saved as 2560x1600.

The existing `npm run test:e2e:browser-tabs --workspace=@getpaseo/desktop` journey
verifies that a hidden window stops guest animation, captures fresh viewport pixels,
and resumes animation after restoring the window. Its artifacts include the screenshot
and animation measurements. Full-page content correctness remains separately tracked in
[the full-page repetition bug](https://github.com/getpaseo/paseo/issues/3196).

## Mechanism

Electron captures copy from the guest web contents' compositor surface. A guest
under `display:none`, `visibility:hidden`, or an opacity-zero ancestor can lose its
copyable surface.

Presented browsers are ordinary descendants of the pane's content host. Their
ancestors own positioning and clipping; do not place a presented guest or its
surface in a body-level fixed layer. Resizing a column must not reparent the guest.
Responsive guests fill their content host, while device previews use an explicit
viewport size.

A mounted browser registers a paint requirement with its retained ancestors.
Inactive retained surfaces become non-interactive 1x1 clipped containers, and the
guest keeps its last positive viewport dimensions. Column collapse uses the same
paintable state. This preserves background frames without moving the guest on tab
switches. Resources without a mounted pane use the separate parking host; the
parking host never presents an active browser over the app.

Electron may recreate a guest when its DOM subtree moves between owners. Register
every `did-attach` identity, and verify state retention through actual Electron
interactions when changing ownership. A plain browser DOM test cannot establish
that a guest WebContents survived a move. Menus remain in `overlay-root`, above
pane content. Focusing a guest also updates its native first-responder ownership.

There is no renderer prep/restore handshake or lifetime background-throttling override.
Screenshot capture temporarily enables frame production inside the shared serialized queue,
restores the previous throttling policy on success or failure, and retains a 5-second capture budget.
The browser tool takes one viewport frame through Electron's frame subscription and releases the
subscription on completion or cancellation. A resized resident guest can produce fresh pixels
while `capturePage()` leaves its surface-copy request pending; waiting for animation frames or
retrying the copy does not repair that state. Full-page screenshots retain the CDP path with layout
metrics and screenshot clip.
