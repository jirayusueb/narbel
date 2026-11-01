import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/OutboxWorker";
import type { EventConsumer } from "../../../../shared/infrastructure/outbox/OutboxWorker";
import type { HandleMemberInvited } from "../../application/usecases/HandleMemberInvited";
import { memberInvitedSchema } from "./memberInvitedSchema";

export class MemberInvitedConsumer {
  constructor(private readonly handler: HandleMemberInvited) {}

  readonly consume: EventConsumer = async (id, payload) => {
    const event = memberInvitedSchema.safeParse(payload);
    if (!event.success) {
      throw new UnreadableEventError(event.error.message);
    }
    await this.handler.execute(id, event.data);
  };
}
