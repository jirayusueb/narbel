import { z } from "zod";

import type { IdentityEvent } from "../../../../shared/application/events/IdentityEvent";

/** The identity event notification reads, validated where it enters: a payload it cannot read is dead. */
export const personDeletedSchema: z.ZodType<IdentityEvent> = z.object({
  type: z.literal("event.person-deleted"),
  version: z.literal(1),
  personId: z.string(),
  email: z.string(),
});
