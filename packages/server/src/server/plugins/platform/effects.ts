import type { Disposer, EffectScope } from "@getpaseo/plugin/v1/server";
import { executionError } from "./execution-errors.js";

export function createEffectScope(): EffectScope {
  const controller = new AbortController();
  const disposers = new Set<Disposer>();
  let closing: Promise<void> | null = null;
  const scope: EffectScope = {
    signal: controller.signal,
    use(dispose) {
      if (controller.signal.aborted) throw executionError("DISPOSED", "Effect scope is closed");
      let pending: Promise<void> | null = null;
      function release(): Promise<void> {
        if (!pending) {
          disposers.delete(release);
          pending = Promise.resolve().then(dispose);
        }
        return pending;
      }
      disposers.add(release);
      return release;
    },
    child() {
      const child = createEffectScope();
      scope.use(() => child.dispose());
      return child;
    },
    dispose() {
      if (!closing) {
        controller.abort();
        closing = (async () => {
          const errors: unknown[] = [];
          for (const dispose of [...disposers].toReversed()) {
            try {
              await dispose();
            } catch (error) {
              errors.push(error);
            }
          }
          if (errors.length) throw new AggregateError(errors, "Plugin cleanup failed");
        })();
      }
      return closing;
    },
  };
  return scope;
}
