import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";

export const REACTION_EMOJI = ["👍", "❤️", "😂", "🎉", "😮", "😢", "👀", "🚀"];

const VARIATION_SELECTOR = /\uFE0F/gu;
const bare = (emoji: string) => emoji.replaceAll(VARIATION_SELECTOR, "");

/** Maps what a client sent (with or without the emoji variation selector) to the stored form. */
export const parseReaction = (raw: string): Result<string, AppError> => {
  const found = REACTION_EMOJI.find((emoji) => bare(emoji) === bare(raw));
  return found
    ? ok(found)
    : err(
        AppError.validation("Unsupported reaction", {
          allowed: REACTION_EMOJI,
        })
      );
};
