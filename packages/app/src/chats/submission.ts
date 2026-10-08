import type { AgentInputDraft } from "@/composer/draft/input-draft";
import type { MessagePayload } from "@/composer/types";
import { splitComposerAttachmentsForSubmit } from "@/composer/attachments/submit";
import { encodeImages } from "@/utils/encode-images";

interface ChatAgentInput {
  payload: MessagePayload;
  controls: NonNullable<AgentInputDraft["composerState"]>;
  provider: string;
  clientMessageId: string;
}

export async function buildChatAgentInput({
  payload,
  controls,
  provider,
  clientMessageId,
}: ChatAgentInput) {
  const wire = splitComposerAttachmentsForSubmit(payload.attachments);
  const images = await encodeImages(wire.images);
  return {
    config: {
      provider,
      cwd: ".",
      model: controls.effectiveModelId || undefined,
      modeId: controls.selectedMode || undefined,
      thinkingOptionId: controls.effectiveThinkingOptionId || undefined,
      featureValues: controls.featureValues,
    },
    initialPrompt: payload.text,
    clientMessageId,
    images: images?.length ? images : undefined,
    attachments: wire.attachments,
  };
}
