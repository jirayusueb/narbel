import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/OutboxWorker";
import type { EventConsumer } from "../../../../shared/infrastructure/outbox/OutboxWorker";
import type { ForgetRemovedInvite } from "../../application/usecases/ForgetRemovedInvite";
import { memberRemovedSchema } from "./memberRemovedSchema";

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
