import type { INotificationRepository } from "../../../../shared/application/interfaces/INotifications";
import type { IOutbox } from "../../../../shared/application/interfaces/IOutbox";
import type { IProfileReader } from "../../../../shared/application/interfaces/IProfiles";
import type { IBoardAccessRepository } from "./IBoardAccessRepository";
import type { IBoardRepository } from "./IBoardRepository";

/** Repositories bound to one transaction; writes through them commit or roll back together. */
export interface BoardTx {
  boards: IBoardRepository;
  grants: IBoardAccessRepository;
  notifications: INotificationRepository;
  outbox: IOutbox;
  profiles: IProfileReader;
}
