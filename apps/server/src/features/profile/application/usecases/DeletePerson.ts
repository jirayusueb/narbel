import type { IdentityEvent } from "../../../../shared/application/events/IdentityEvent";
import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import type { IOutbox } from "../../../../shared/application/interfaces/IOutbox";
import type { IProfileRepository } from "../../../../shared/application/interfaces/IProfiles";

/**
 * Runs before Better Auth removes the user row, so a failure here aborts the delete. The avatar is
 * identity's own storage and goes now; every other context hears the event and cleans up its own.
 */
export class DeletePerson {
  constructor(
    private readonly profiles: Pick<IProfileRepository, "avatarKeyOf">,
    private readonly storage: Pick<IFileStorage, "delete">,
    private readonly outbox: Pick<IOutbox, "publish">
  ) {}

  async execute(person: { id: string; email: string }): Promise<void> {
    const avatarKey = await this.profiles.avatarKeyOf(person.id);
    if (avatarKey) {
      await this.storage.delete(avatarKey);
    }
    const event: IdentityEvent = {
      type: "event.person-deleted",
      version: 1,
      personId: person.id,
      email: person.email,
    };
    await this.outbox.publish(event);
  }
}
