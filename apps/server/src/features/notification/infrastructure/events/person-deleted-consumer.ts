import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { EventConsumer } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { ForgetDeletedPerson } from "../../application/usecases/forget-deleted-person";
import { personDeletedSchema } from "./person-deleted-schema";

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
