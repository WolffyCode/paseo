// Decides the tree root by source priority: external (public face) > conversation cwd > desktop.
// Desktop paths are NOT assumed client-side; "needDesktop" defers to host expandUserPath via the
// data layer. Pure + testable so the priority rule is verifiable without rendering.

/** Outcome of root resolution: a concrete path, or a signal to resolve the host desktop. */
export type RootResolution = { kind: "path"; path: string } | { kind: "needDesktop" };

/** Resolve which directory the tree should root at, applying external > conversation > desktop. */
export function resolveTreeRoot(input: {
  externalRoot: string | null;
  conversationRoot: string | null;
}): RootResolution {
  const external = input.externalRoot?.trim();
  if (external) {
    return { kind: "path", path: external };
  }

  const conversation = input.conversationRoot?.trim();
  if (conversation) {
    return { kind: "path", path: conversation };
  }

  return { kind: "needDesktop" };
}
