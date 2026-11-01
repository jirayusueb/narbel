import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { EventConsumer } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { UnassignRemovedMember } from "../../application/usecases/unassign-removed-member";
import { memberRemovedSchema } from "./member-removed-schema";

/** Reads boards' member-removed off the outbox: the unassign and the processed mark commit together. */
export class MemberRemovedConsumer {
  constructor(private readonly unassign: UnassignRemovedMember) {}

  readonly consume: EventConsumer = async (id, payload) => {
    const event = memberRemovedSchema.safeParse(payload);
    if (!event.success) {
      throw new UnreadableEventError(event.error.message);
    }
    await this.unassign.execute(id, event.data);
  };
}
