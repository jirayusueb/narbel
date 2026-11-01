import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { EventConsumer } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { ForgetRemovedInvite } from "../../application/usecases/forget-removed-invite";
import { memberRemovedSchema } from "./member-removed-schema";

export class MemberRemovedConsumer {
  constructor(private readonly handler: ForgetRemovedInvite) {}

  readonly consume: EventConsumer = async (id, payload) => {
    const event = memberRemovedSchema.safeParse(payload);
    if (!event.success) {
      throw new UnreadableEventError(event.error.message);
    }
    await this.handler.execute(id, event.data);
  };
}
