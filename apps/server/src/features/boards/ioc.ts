import type { Database, DbExecutor } from "@narbel/db";
import { Elysia } from "elysia";
import type Redis from "ioredis";

import type { ICache } from "../../shared/application/interfaces/ICache";
import { transactionalCache } from "../../shared/infrastructure/cache/TransactionalCache";
import { UuidGenerator } from "../../shared/infrastructure/ids/UuidGenerator";
import { DrizzleOutbox } from "../../shared/infrastructure/outbox/DrizzleOutbox";
import type { AfterCommit } from "../../shared/infrastructure/uow/DrizzleUnitOfWork";
import { DrizzleUnitOfWork } from "../../shared/infrastructure/uow/DrizzleUnitOfWork";
import type { BetterAuthPlugin } from "../auth";
import { DrizzleProfileRepository } from "../profile";
import { AccessPolicy } from "./application/AccessPolicy";
import type { BoardTx } from "./application/ports/BoardTx";
import type {
  IDrawingCopier,
  ILiveDrawings,
} from "./application/ports/IDrawings";
import { CreateBoard } from "./application/usecases/CreateBoard";
import { DuplicateBoard } from "./application/usecases/DuplicateBoard";
import { GetBoard } from "./application/usecases/GetBoard";
import { GetBoardAccess } from "./application/usecases/GetBoardAccess";
import { InviteBoardMember } from "./application/usecases/InviteBoardMember";
import { ListBoardMembers } from "./application/usecases/ListBoardMembers";
import { ListBoards } from "./application/usecases/ListBoards";
import { ListSharedBoards } from "./application/usecases/ListSharedBoards";
import { ListTrash } from "./application/usecases/ListTrash";
import { PurgeBoard } from "./application/usecases/PurgeBoard";
import { RemoveBoardMember } from "./application/usecases/RemoveBoardMember";
import { RenameBoard } from "./application/usecases/RenameBoard";
import { RestoreBoard } from "./application/usecases/RestoreBoard";
import { TrashBoard } from "./application/usecases/TrashBoard";
import { UnlockBoard } from "./application/usecases/UnlockBoard";
import { UpdateBoardAccess } from "./application/usecases/UpdateBoardAccess";
import { CachedBoardRepository } from "./infrastructure/repositories/CachedBoardRepository";
import { DrizzleBoardAccessRepository } from "./infrastructure/repositories/DrizzleBoardAccessRepository";
import { DrizzleBoardRepository } from "./infrastructure/repositories/DrizzleBoardRepository";
import { HmacUnlockTokens } from "./infrastructure/services/HmacUnlockTokens";
import { RedisAttemptLimiter } from "./infrastructure/services/RedisAttemptLimiter";
import { ScryptPasswordHasher } from "./infrastructure/services/ScryptPasswordHasher";
import { createBoardAccessController } from "./presentation/http/BoardAccessController";
import {
  createBoardController,
  createSharedBoardsController,
} from "./presentation/http/BoardController";

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
  { db, cache, secret }: Pick<BoardsDeps, "db" | "cache" | "secret">,
  grantsIn: DbExecutor = db
) =>
  new AccessPolicy(
    new CachedBoardRepository(new DrizzleBoardRepository(db), cache),
    new DrizzleBoardAccessRepository(grantsIn),
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
  const grants = new DrizzleBoardAccessRepository(db);
  const profiles = new DrizzleProfileRepository(db, apiOrigin);
  const ids = new UuidGenerator();
  const uow = new DrizzleUnitOfWork<BoardTx>(
    db,
    (tx: DbExecutor, afterCommit) => {
      // invites queue an email and access changes publish events; either goes out now, not at the next poll
      afterCommit(wakeOutbox);
      return {
        boards: new CachedBoardRepository(
          new DrizzleBoardRepository(tx),
          transactionalCache(cache, afterCommit)
        ),
        grants: new DrizzleBoardAccessRepository(tx),
        outbox: new DrizzleOutbox(tx, ids),
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
