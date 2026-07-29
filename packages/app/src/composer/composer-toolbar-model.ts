export type ComposerToolbarControl = "model" | "thinking" | "mode" | "features";

export interface ComposerToolbarLayoutInput {
  readonly isCompact: boolean;
  readonly hasModel: boolean;
  readonly hasThinking: boolean;
  readonly hasMode: boolean;
  readonly hasFeatures: boolean;
}

export interface ComposerToolbarLayout {
  readonly persistent: readonly ComposerToolbarControl[];
  readonly overflow: readonly ComposerToolbarControl[];
}

/** Keep compact Composer geometry stable while preserving every available runtime control in the + menu. */
export function deriveComposerToolbarLayout(
  input: ComposerToolbarLayoutInput,
): ComposerToolbarLayout {
  const available = [
    input.hasModel ? "model" : null,
    input.hasThinking ? "thinking" : null,
    input.hasMode ? "mode" : null,
    input.hasFeatures ? "features" : null,
  ].filter((control): control is ComposerToolbarControl => control !== null);

  if (!input.isCompact) {
    return { persistent: available, overflow: [] };
  }

  return {
    persistent: input.hasModel ? ["model"] : [],
    overflow: available.filter((control) => control !== "model"),
  };
}
