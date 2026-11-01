import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/OutboxWorker";
import type { EventConsumer } from "../../../../shared/infrastructure/outbox/OutboxWorker";
import type { ForgetDeletedPerson } from "../../application/usecases/ForgetDeletedPerson";
import { personDeletedSchema } from "./personDeletedSchema";

export class PersonDeletedConsumer {
  constructor(private readonly handler: ForgetDeletedPerson) {}

  readonly consume: EventConsumer = async (id, payload) => {
    const event = personDeletedSchema.safeParse(payload);
    if (!event.success) {
      throw new UnreadableEventError(event.error.message);
    }
    await this.handler.execute(id, event.data);
  };
}
