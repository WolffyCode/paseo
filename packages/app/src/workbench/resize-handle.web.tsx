import {
  useEffect,
  useRef,
  type PointerEvent,
  type KeyboardEvent,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import { useStableEvent } from "@/hooks/use-stable-event";
import type { WorkbenchBoundary, WorkbenchModel } from "./model";

export interface WorkbenchResizeHandleProps {
  model: WorkbenchModel;
  boundary: WorkbenchBoundary;
}
const HANDLE_STYLE: CSSProperties = {
  flex: 1,
  minHeight: "100%",
  width: 6,
  cursor: "col-resize",
  touchAction: "none",
  alignSelf: "stretch",
};
const LABEL_KEYS: Record<WorkbenchBoundary, string> = {
  navigation: "workbench.resize.navigation",
  content: "workbench.resize.content",
  files: "workbench.resize.files",
};

export function WorkbenchResizeHandle({ model, boundary }: WorkbenchResizeHandleProps) {
  const { t } = useTranslation();
  const frame = useRef<number | null>(null);
  const coordinate = useRef(0);
  const dragging = useRef(false);
  function flush() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (dragging.current) model.updateResize(coordinate.current);
  }
  const cancel = useStableEvent(() => {
    if (!dragging.current) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    dragging.current = false;
    model.cancelResize();
  });
  useEffect(() => {
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      cancel();
    };
  }, [cancel]);
  const begin = useStableEvent((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging.current = true;
    coordinate.current = event.clientX;
    model.beginResize(boundary, event.clientX);
    event.currentTarget.setPointerCapture(event.pointerId);
  });
  const move = useStableEvent((event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    coordinate.current = event.clientX;
    if (frame.current === null) frame.current = requestAnimationFrame(flush);
  });
  const commit = useStableEvent((event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    coordinate.current = event.clientX;
    flush();
    dragging.current = false;
    model.commitResize();
    event.currentTarget.releasePointerCapture(event.pointerId);
  });
  const keyDown = useStableEvent((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    model.beginResize(boundary, 0);
    model.updateResize(event.key === "ArrowRight" ? 16 : -16);
    model.commitResize();
  });
  const label = t(LABEL_KEYS[boundary]);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      data-testid={`workbench-resize-${boundary}`}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={commit}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={keyDown}
      style={HANDLE_STYLE}
    />
  );
}
