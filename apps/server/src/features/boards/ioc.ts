import type { Database, DbExecutor } from "@narbel/db";
import { Elysia } from "elysia";
import type Redis from "ioredis";

import type { ICache } from "../../shared/application/interfaces/i-cache";
import { transactionalCache } from "../../shared/infrastructure/cache/transactional-cache";
import { UuidGenerator } from "../../shared/infrastructure/ids/uuid-generator";
import { DrizzleOutbox } from "../../shared/infrastructure/outbox/drizzle-outbox";
import { wakeWhenQueued } from "../../shared/infrastructure/outbox/waking-outbox";
import type { AfterCommit } from "../../shared/infrastructure/uow/drizzle-unit-of-work";
import { DrizzleUnitOfWork } from "../../shared/infrastructure/uow/drizzle-unit-of-work";
import type { BetterAuthPlugin } from "../auth";
import { DrizzleProfileRepository } from "../profile";
import { AccessPolicy } from "./application/access-policy";
import type { BoardTx } from "./application/ports/board-tx";
import type {
  IDrawingCopier,
  ILiveDrawings,
} from "./application/ports/i-drawings";
import { CreateBoard } from "./application/usecases/create-board";
import { DuplicateBoard } from "./application/usecases/duplicate-board";
import { GetBoard } from "./application/usecases/get-board";
import { GetBoardAccess } from "./application/usecases/get-board-access";
import { InviteBoardMember } from "./application/usecases/invite-board-member";
import { ListBoardMembers } from "./application/usecases/list-board-members";
import { ListBoards } from "./application/usecases/list-boards";
import { ListSharedBoards } from "./application/usecases/list-shared-boards";
import { ListTrash } from "./application/usecases/list-trash";
import { PurgeBoard } from "./application/usecases/purge-board";
import { RemoveBoardMember } from "./application/usecases/remove-board-member";
import { RenameBoard } from "./application/usecases/rename-board";
import { RestoreBoard } from "./application/usecases/restore-board";
import { TrashBoard } from "./application/usecases/trash-board";
import { UnlockBoard } from "./application/usecases/unlock-board";
import { UpdateBoardAccess } from "./application/usecases/update-board-access";
import { CachedBoardRepository } from "./infrastructure/repositories/cached-board-repository";
import { DrizzleBoardAccessRepository } from "./infrastructure/repositories/drizzle-board-access-repository";
import { DrizzleBoardRepository } from "./infrastructure/repositories/drizzle-board-repository";
import { HmacUnlockTokens } from "./infrastructure/services/hmac-unlock-tokens";
import { RedisAttemptLimiter } from "./infrastructure/services/redis-attempt-limiter";
import { ScryptPasswordHasher } from "./infrastructure/services/scrypt-password-hasher";
import { createBoardAccessController } from "./presentation/http/board-access-controller";
import {
  createBoardController,
  createSharedBoardsController,
} from "./presentation/http/board-controller";

/** The use cases boards' transports (HTTP, MCP) drive. */
export interface BoardsUseCases {
  createBoard: CreateBoard;
  duplicateBoard: DuplicateBoard;
  getBoard: GetBoard;
  getBoardAccess: GetBoardAccess;
  inviteBoardMember: InviteBoardMember;
  listBoardMembers: ListBoardMembers;
  listBoards: ListBoards;
  listSharedBoards: ListSharedBoards;
  listTrash: ListTrash;
  purgeBoard: PurgeBoard;
  removeBoardMember: RemoveBoardMember;
  renameBoard: RenameBoard;
  restoreBoard: RestoreBoard;
  trashBoard: TrashBoard;
  unlockBoard: UnlockBoard;
  updateBoardAccess: UpdateBoardAccess;
}

export interface BoardsDeps {
  db: Database;
  /** where the web app lives; invite and share links point here */
  webOrigin: string;
  /** where browsers reach this API; avatar urls point here */
  apiOrigin: string;
  /** signs unlock cookies */
  secret: string;
  /** shared by every server instance: cache-aside reads */
  cache: ICache;
  /** shared by every server instance: unlock failure counts */
  redis: Redis;
  /** asks the outbox worker for a pass now; invites and access changes wake it after they commit */
  wakeOutbox: () => void;
  /** drawing's live rooms: Trash sends their peers away */
  drawings: ILiveDrawings;
  /** drawing's half of a duplicate */
  copier: IDrawingCopier;
}

/**
 * The policy other contexts ask, built from the same stores the boards use cases read. `grantsIn`
 * binds its grant reads to a caller's transaction.
 */
export const createAccessPolicy = (
  {
    db,
    cache,
    secret,
    apiOrigin,
  }: Pick<BoardsDeps, "db" | "cache" | "secret" | "apiOrigin">,
  grantsIn: DbExecutor = db
) =>
  new AccessPolicy(
    new CachedBoardRepository(new DrizzleBoardRepository(db), cache),
    new DrizzleBoardAccessRepository(
      grantsIn,
      new DrizzleProfileRepository(grantsIn, apiOrigin)
    ),
    new HmacUnlockTokens(secret)
  );

/** Boards' record of a board for drawing's document saves: bound to the save's transaction, cache dropped after it commits. */
export const boardRecordsIn =
  (cache: ICache) => (tx: DbExecutor, afterCommit: AfterCommit) =>
    new CachedBoardRepository(
      new DrizzleBoardRepository(tx),
      transactionalCache(cache, afterCommit)
    );

export const createBoardsUseCases = ({
  db,
  webOrigin,
  apiOrigin,
  secret,
  cache,
  redis,
  wakeOutbox,
  drawings,
  copier,
}: BoardsDeps): BoardsUseCases => {
  const boards = new CachedBoardRepository(
    new DrizzleBoardRepository(db),
    cache
  );
  const grants = new DrizzleBoardAccessRepository(
    db,
    new DrizzleProfileRepository(db, apiOrigin)
  );
  const profiles = new DrizzleProfileRepository(db, apiOrigin);
  const ids = new UuidGenerator();
  const uow = new DrizzleUnitOfWork<BoardTx>(
    db,
    (tx: DbExecutor, afterCommit) => {
      // invites queue an email and access changes publish events; either goes out now, not at the next poll
      const outbox = wakeWhenQueued(
        new DrizzleOutbox(tx, ids),
        afterCommit,
        wakeOutbox
      );
      return {
        boards: new CachedBoardRepository(
          new DrizzleBoardRepository(tx),
          transactionalCache(cache, afterCommit)
        ),
        grants: new DrizzleBoardAccessRepository(
          tx,
          new DrizzleProfileRepository(tx, apiOrigin)
        ),
        outbox,
        profiles: new DrizzleProfileRepository(tx, apiOrigin),
      };
    }
  );
  const unlockTokens = new HmacUnlockTokens(secret);
  const hasher = new ScryptPasswordHasher();
  const policy = new AccessPolicy(boards, grants, unlockTokens);
  return {
    createBoard: new CreateBoard(boards, ids),
    duplicateBoard: new DuplicateBoard(policy, boards, copier, ids),
    getBoard: new GetBoard(policy),
    getBoardAccess: new GetBoardAccess(policy, grants, webOrigin),
    inviteBoardMember: new InviteBoardMember(policy, uow),
    listBoardMembers: new ListBoardMembers(policy, grants, profiles),
    listBoards: new ListBoards(boards),
    listSharedBoards: new ListSharedBoards(boards),
    listTrash: new ListTrash(boards),
    purgeBoard: new PurgeBoard(policy, uow),
    removeBoardMember: new RemoveBoardMember(policy, uow),
    renameBoard: new RenameBoard(policy, boards),
    restoreBoard: new RestoreBoard(policy, boards),
    trashBoard: new TrashBoard(policy, boards, drawings),
    unlockBoard: new UnlockBoard(
      boards,
      hasher,
      unlockTokens,
      new RedisAttemptLimiter(redis)
    ),
    updateBoardAccess: new UpdateBoardAccess(
      policy,
      uow,
      hasher,
      ids,
      webOrigin
    ),
  };
};

export const createBoardsModule = (
  betterAuth: BetterAuthPlugin,
  uc: BoardsUseCases
) =>
  new Elysia({ name: "feature/boards" })
    .use(createBoardAccessController(betterAuth, uc))
    .use(createBoardController(betterAuth, uc))
    .use(createSharedBoardsController(betterAuth, uc));
