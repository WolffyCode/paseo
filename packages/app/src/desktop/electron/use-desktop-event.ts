import { useEffect } from "react";
import { getIsElectron } from "@/constants/platform";
import { useStableEvent } from "@/hooks/use-stable-event";
import { listenToDesktopEvent, type DesktopEventUnlisten } from "./events";

/** Calls `handler` for each `event` the desktop main process sends while the caller is mounted. */
export function useDesktopEvent<TPayload>(
  event: string,
  handler: (payload: TPayload) => void,
): void {
  const handleEvent = useStableEvent(handler);

  useEffect(() => {
    if (!getIsElectron()) {
      return;
    }
    let isDisposed = false;
    let unlisten: DesktopEventUnlisten | null = null;
    void listenToDesktopEvent<TPayload>(event, handleEvent).then(
      (dispose) => {
        if (isDisposed) {
          dispose();
          return undefined;
        }
        unlisten = dispose;
        return undefined;
      },
      (error: unknown) => {
        console.error("[desktop-event] subscribe failed", { event, error });
      },
    );
    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [event, handleEvent]);
}
