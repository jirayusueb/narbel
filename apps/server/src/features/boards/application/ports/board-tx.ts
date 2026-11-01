import type { IOutbox } from "../../../../shared/application/interfaces/i-outbox";
import type { IProfileReader } from "../../../../shared/application/interfaces/i-profiles";
import type { IBoardAccessRepository } from "./i-board-access-repository";
import type { IBoardRepository } from "./i-board-repository";

/** Repositories bound to one transaction; writes through them commit or roll back together. */
export interface BoardTx {
  boards: IBoardRepository;
  grants: IBoardAccessRepository;
  outbox: IOutbox;
  profiles: IProfileReader;
}
