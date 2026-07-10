import { page } from "vitest/browser";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { buildEditorTheme } from "./editor-theme.web";

// A real-browser contract for the narrow-panel editor: long source lines stay unwrapped and produce a
// usable themed horizontal scrollbar inside CodeMirror, instead of widening into an outer clipped view.
describe("editor chrome in a narrow panel", () => {
  let view: EditorView | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    view?.destroy();
    host?.remove();
    view = null;
    host = null;
  });

  it("keeps a long line unwrapped and horizontally scrollable with the thin dark scrollbar", async () => {
    await page.viewport(800, 600);
    host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:220px;height:160px;overflow:hidden";
    document.body.appendChild(host);
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: `const longValue = "${"long-segment-".repeat(50)}";`,
        extensions: buildEditorTheme("dark"),
      }),
    });

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const scrollerStyle = getComputedStyle(view.scrollDOM);
    expect(getComputedStyle(view.contentDOM).whiteSpace).toBe("pre");
    expect(scrollerStyle.overflowX).toBe("auto");
    expect(scrollerStyle.scrollbarWidth).toBe("thin");
    expect(scrollerStyle.scrollbarColor).toBe("rgb(75, 82, 99) rgb(40, 44, 52)");
    expect(view.scrollDOM.scrollWidth).toBeGreaterThan(view.scrollDOM.clientWidth);

    view.scrollDOM.scrollLeft = 120;
    expect(view.scrollDOM.scrollLeft).toBeGreaterThan(0);
  });
});
