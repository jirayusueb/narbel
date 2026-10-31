import type { Database, DbExecutor } from "@narbel/db";
import { Elysia } from "elysia";
import type Redis from "ioredis";

import type { ICache } from "../../shared/application/interfaces/ICache";
import type { IFileStorage } from "../../shared/application/interfaces/IFileStorage";
import type { IPubSub } from "../../shared/application/interfaces/IPubSub";
import { transactionalCache } from "../../shared/infrastructure/cache/TransactionalCache";
import { UuidGenerator } from "../../shared/infrastructure/ids/UuidGenerator";
import { DrizzleOutbox } from "../../shared/infrastructure/outbox/DrizzleOutbox";
import { DrizzleUnitOfWork } from "../../shared/infrastructure/uow/DrizzleUnitOfWork";
import type { BetterAuthPlugin } from "../auth";
import {
  AddComment,
  AssignComment,
  CommentActivityFeed,
  DeleteComment,
  DrizzleCommentRepository,
  EditComment,
  ListComments,
  ListReplies,
  ReplyToComment,
  ResolveComment,
  SetCommentReaction,
  createBoardCommentController,
} from "../discussion";
import type { DiscussionTx } from "../discussion";
import { DrizzleNotificationRepository } from "../notification";
import { DrizzleProfileRepository } from "../profile";
import { AccessPolicy } from "./application/AccessPolicy";
import type { BoardTx } from "./application/ports/BoardTx";
import { AddBoardElements } from "./application/usecases/AddBoardElements";
import { AddBoardImage } from "./application/usecases/AddBoardImage";
import { AddPage } from "./application/usecases/AddPage";
import { ArrangeElements } from "./application/usecases/ArrangeElements";
import { ConnectBoardSync } from "./application/usecases/ConnectBoardSync";
import { CreateBoard } from "./application/usecases/CreateBoard";
import { DeleteBoardElements } from "./application/usecases/DeleteBoardElements";
import { DeletePage } from "./application/usecases/DeletePage";
import { DuplicateBoard } from "./application/usecases/DuplicateBoard";
import { ExportBoardScene } from "./application/usecases/ExportBoardScene";
import { GetBoard } from "./application/usecases/GetBoard";
import { GetBoardAccess } from "./application/usecases/GetBoardAccess";
import { GetBoardChanges } from "./application/usecases/GetBoardChanges";
import { GetBoardFile } from "./application/usecases/GetBoardFile";
import { GetBoardScene } from "./application/usecases/GetBoardScene";
import { GetBoardVersion } from "./application/usecases/GetBoardVersion";
import { GetLibrary } from "./application/usecases/GetLibrary";
import { GroupElements } from "./application/usecases/GroupElements";
import { InviteBoardMember } from "./application/usecases/InviteBoardMember";
import { ListBoardMembers } from "./application/usecases/ListBoardMembers";
import { ListBoards } from "./application/usecases/ListBoards";
import { ListBoardVersions } from "./application/usecases/ListBoardVersions";
import { ListBoardViewers } from "./application/usecases/ListBoardViewers";
import { ListPages } from "./application/usecases/ListPages";
import { ListSharedBoards } from "./application/usecases/ListSharedBoards";
import { ListTrash } from "./application/usecases/ListTrash";
import { PresignBoardFileUpload } from "./application/usecases/PresignBoardFileUpload";
import { PurgeBoard } from "./application/usecases/PurgeBoard";
import { RemoveBoardMember } from "./application/usecases/RemoveBoardMember";
import { RenameBoard } from "./application/usecases/RenameBoard";
import { RenamePage } from "./application/usecases/RenamePage";
import { RenderBoardImage } from "./application/usecases/RenderBoardImage";
import { RestoreBoard } from "./application/usecases/RestoreBoard";
import { RestoreBoardVersion } from "./application/usecases/RestoreBoardVersion";
import { SaveLibrary } from "./application/usecases/SaveLibrary";
import { SearchBoards } from "./application/usecases/SearchBoards";
import {
  EditSelection,
  GetSelection,
  SelectElements,
} from "./application/usecases/Selection";
import { TrashBoard } from "./application/usecases/TrashBoard";
import { UnlockBoard } from "./application/usecases/UnlockBoard";
import { UpdateBoardAccess } from "./application/usecases/UpdateBoardAccess";
import { UpdateBoardElement } from "./application/usecases/UpdateBoardElement";
import { YjsBoardHub } from "./infrastructure/crdt/YjsBoardHub";
import { CachedBoardDocumentStore } from "./infrastructure/repositories/CachedBoardDocumentStore";
import { CachedBoardRepository } from "./infrastructure/repositories/CachedBoardRepository";
import { DrizzleBoardAccessRepository } from "./infrastructure/repositories/DrizzleBoardAccessRepository";
import { DrizzleBoardDocumentStore } from "./infrastructure/repositories/DrizzleBoardDocumentStore";
import { DrizzleBoardFileRepository } from "./infrastructure/repositories/DrizzleBoardFileRepository";
import { DrizzleBoardRepository } from "./infrastructure/repositories/DrizzleBoardRepository";
import { DrizzleBoardSearch } from "./infrastructure/repositories/DrizzleBoardSearch";
import { DrizzleBoardVersionRepository } from "./infrastructure/repositories/DrizzleBoardVersionRepository";
import { DrizzleLibraryRepository } from "./infrastructure/repositories/DrizzleLibraryRepository";
import { HmacUnlockTokens } from "./infrastructure/services/HmacUnlockTokens";
import { RedisAttemptLimiter } from "./infrastructure/services/RedisAttemptLimiter";
import { RedisBoardPresence } from "./infrastructure/services/RedisBoardPresence";
import { ResvgRasterizer } from "./infrastructure/services/ResvgRasterizer";
import { ScryptPasswordHasher } from "./infrastructure/services/ScryptPasswordHasher";
import { createBoardAccessController } from "./presentation/http/BoardAccessController";
import {
  createBoardController,
  createSharedBoardsController,
} from "./presentation/http/BoardController";
import { createBoardFileController } from "./presentation/http/BoardFileController";
import { createBoardVersionController } from "./presentation/http/BoardVersionController";
import { createLibraryController } from "./presentation/http/LibraryController";
import { createMcpController } from "./presentation/mcp/McpController";
import { createBoardSyncController } from "./presentation/ws/BoardSyncController";

export interface BoardDeps {
  db: Database;
  storage: IFileStorage;
  /** where the web app lives; invite and share links point here */
  webOrigin: string;
  /** where browsers reach this API; avatar urls point here */
  apiOrigin: string;
  /** signs unlock cookies */
  secret: string;
  /** shared by every server instance: cache-aside reads and the realtime sync bus */
  cache: ICache;
  pubsub: IPubSub;
  /** shared by every server instance: unlock failure counts and who has which board open */
  redis: Redis;
  betterAuth: BetterAuthPlugin;
  /** asks the outbox worker for a pass now; comment events wake it after they commit */
  wakeOutbox: () => void;
}

/** The policy other contexts ask, built from the same stores the board module reads. */
export const createAccessPolicy = ({
  db,
  cache,
  secret,
}: Pick<BoardDeps, "db" | "cache" | "secret">) =>
  new AccessPolicy(
    new CachedBoardRepository(new DrizzleBoardRepository(db), cache),
    new DrizzleBoardAccessRepository(db),
    new HmacUnlockTokens(secret)
  );

const createUseCases = ({
  db,
  storage,
  webOrigin,
  apiOrigin,
  secret,
  cache,
  pubsub,
  redis,
  wakeOutbox,
}: Omit<BoardDeps, "betterAuth">) => {
  const boards = new CachedBoardRepository(
    new DrizzleBoardRepository(db),
    cache
  );
  const grants = new DrizzleBoardAccessRepository(db);
  const comments = new DrizzleCommentRepository(db);
  const profiles = new DrizzleProfileRepository(db, apiOrigin);
  const files = new DrizzleBoardFileRepository(db);
  const hub = new YjsBoardHub(
    new CachedBoardDocumentStore(new DrizzleBoardDocumentStore(db), cache),
    pubsub
  );
  const versions = new DrizzleBoardVersionRepository(db);
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
        notifications: new DrizzleNotificationRepository(
          tx,
          pubsub,
          ids,
          afterCommit
        ),
        outbox: new DrizzleOutbox(tx, ids),
        profiles: new DrizzleProfileRepository(tx, apiOrigin),
      };
    }
  );
  const unlockTokens = new HmacUnlockTokens(secret);
  // comment use cases commit with their own aggregate set: the comment, its outbox events, member and profile reads
  const discussionUow = new DrizzleUnitOfWork<DiscussionTx>(
    db,
    (tx: DbExecutor, afterCommit) => {
      afterCommit(wakeOutbox);
      return {
        comments: new DrizzleCommentRepository(tx),
        members: new AccessPolicy(
          boards,
          new DrizzleBoardAccessRepository(tx),
          unlockTokens
        ),
        outbox: new DrizzleOutbox(tx, ids),
        profiles: new DrizzleProfileRepository(tx, apiOrigin),
      };
    }
  );
  const hasher = new ScryptPasswordHasher();
  const policy = new AccessPolicy(boards, grants, unlockTokens);
  const presence = new RedisBoardPresence(redis);
  const library = new DrizzleLibraryRepository(db);
  return {
    createBoard: new CreateBoard(boards, ids),
    getLibrary: new GetLibrary(library),
    saveLibrary: new SaveLibrary(library),
    listBoards: new ListBoards(boards),
    listSharedBoards: new ListSharedBoards(boards),
    searchBoards: new SearchBoards(new DrizzleBoardSearch(db)),
    getBoard: new GetBoard(policy),
    renameBoard: new RenameBoard(policy, boards),
    trashBoard: new TrashBoard(policy, boards, hub),
    restoreBoard: new RestoreBoard(policy, boards),
    listTrash: new ListTrash(boards),
    purgeBoard: new PurgeBoard(policy, uow, hub, storage),
    duplicateBoard: new DuplicateBoard(
      policy,
      boards,
      hub,
      files,
      storage,
      ids
    ),
    presignBoardFileUpload: new PresignBoardFileUpload(policy, files, storage),
    getBoardFile: new GetBoardFile(policy, files, storage),
    getBoardScene: new GetBoardScene(policy, hub),
    listBoardVersions: new ListBoardVersions(policy, versions),
    getBoardVersion: new GetBoardVersion(policy, versions, hub),
    restoreBoardVersion: new RestoreBoardVersion(policy, versions, hub),
    renderBoardImage: new RenderBoardImage(
      policy,
      hub,
      files,
      storage,
      new ResvgRasterizer(),
      cache
    ),
    addBoardElements: new AddBoardElements(policy, hub, ids),
    addBoardImage: new AddBoardImage(policy, hub, files, storage, ids),
    exportBoardScene: new ExportBoardScene(policy, hub, files, storage),
    updateBoardElement: new UpdateBoardElement(policy, hub, ids),
    deleteBoardElements: new DeleteBoardElements(policy, hub, ids),
    groupElements: new GroupElements(policy, hub, ids),
    arrangeElements: new ArrangeElements(policy, hub, ids),
    listPages: new ListPages(policy, hub),
    addPage: new AddPage(policy, hub, ids),
    renamePage: new RenamePage(policy, hub),
    deletePage: new DeletePage(policy, hub),
    getBoardChanges: new GetBoardChanges(
      policy,
      hub,
      new CommentActivityFeed(comments, profiles)
    ),
    getSelection: new GetSelection(policy, hub),
    selectElements: new SelectElements(policy, hub),
    editSelection: new EditSelection(policy, hub, ids),
    connectBoardSync: new ConnectBoardSync(policy, hub, presence),
    listBoardViewers: new ListBoardViewers(policy, presence),
    getBoardAccess: new GetBoardAccess(policy, grants, webOrigin),
    updateBoardAccess: new UpdateBoardAccess(
      policy,
      uow,
      hasher,
      ids,
      webOrigin
    ),
    removeBoardMember: new RemoveBoardMember(policy, uow),
    inviteBoardMember: new InviteBoardMember(policy, uow),
    listBoardMembers: new ListBoardMembers(policy, grants, profiles),
    unlockBoard: new UnlockBoard(
      boards,
      hasher,
      unlockTokens,
      new RedisAttemptLimiter(redis)
    ),
    listComments: new ListComments(policy, comments, profiles),
    listReplies: new ListReplies(policy, comments, profiles),
    addComment: new AddComment(policy, discussionUow, ids),
    replyToComment: new ReplyToComment(policy, discussionUow, ids),
    editComment: new EditComment(policy, discussionUow),
    resolveComment: new ResolveComment(policy, discussionUow),
    assignComment: new AssignComment(policy, discussionUow),
    setCommentReaction: new SetCommentReaction(policy, comments, profiles),
    deleteComment: new DeleteComment(policy, comments),
  };
};

export type BoardUseCases = ReturnType<typeof createUseCases>;

export const createBoardModule = ({ betterAuth, ...deps }: BoardDeps) => {
  const uc = createUseCases(deps);
  return new Elysia({ name: "feature/board" })
    .use(createBoardSyncController(betterAuth, uc))
    .use(createBoardFileController(betterAuth, uc))
    .use(createBoardVersionController(betterAuth, uc))
    .use(createBoardCommentController(betterAuth, uc))
    .use(createBoardAccessController(betterAuth, uc))
    .use(createBoardController(betterAuth, uc))
    .use(createLibraryController(betterAuth, uc))
    .use(createSharedBoardsController(betterAuth, uc))
    .use(createMcpController(betterAuth, uc));
};
