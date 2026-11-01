import { AppError } from "../../../../shared/kernel/errors/app-error";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";

export const REACTION_EMOJI = ["👍", "❤️", "😂", "🎉", "😮", "😢", "👀", "🚀"];

const VARIATION_SELECTOR = /\uFE0F/gu;
const bare = (emoji: string) => emoji.replaceAll(VARIATION_SELECTOR, "");

export class Reaction {
  private constructor(readonly value: string) {}

  /** Maps what a client sent (with or without the emoji variation selector) to the stored form. */
  static parse(raw: string): Result<Reaction, AppError> {
    const found = REACTION_EMOJI.find((emoji) => bare(emoji) === bare(raw));
    return found
      ? ok(new Reaction(found))
      : err(
          AppError.validation("Unsupported reaction", {
            allowed: REACTION_EMOJI,
          })
        );
  }
}
