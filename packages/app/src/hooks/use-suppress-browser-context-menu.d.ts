/**
 * Type surface for the platform-split implementations (`.web.ts` suppresses the browser context
 * menu, `.native.ts` is a no-op). tsc resolves this `.d.ts`; Metro resolves the platform files.
 */
export function useSuppressBrowserContextMenu(): void;
