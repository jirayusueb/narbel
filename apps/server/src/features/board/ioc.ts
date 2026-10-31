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
import { DrizzleNotificationRepository } from "../notification";
import { DrizzleProfileRepository } from "../profile";
import { BoardAccessGuard } from "./application/BoardAccess";
import type { BoardTx } from "./application/ports/BoardTx";
import { AddBoardElements } from "./application/usecases/AddBoardElements";
import { AddBoardImage } from "./application/usecases/AddBoardImage";
import { AddComment } from "./application/usecases/AddComment";
import { AddPage } from "./application/usecases/AddPage";
import { ArrangeElements } from "./application/usecases/ArrangeElements";
import { AssignComment } from "./application/usecases/AssignComment";
import { ConnectBoardSync } from "./application/usecases/ConnectBoardSync";
import { CreateBoard } from "./application/usecases/CreateBoard";
import { DeleteBoard } from "./application/usecases/DeleteBoard";
import { DeleteBoardElements } from "./application/usecases/DeleteBoardElements";
import { DeleteComment } from "./application/usecases/DeleteComment";
import { DeletePage } from "./application/usecases/DeletePage";
import { EditComment } from "./application/usecases/EditComment";
import { ExportBoardScene } from "./application/usecases/ExportBoardScene";
import { GetBoard } from "./application/usecases/GetBoard";
import { GetBoardAccess } from "./application/usecases/GetBoardAccess";
import { GetBoardChanges } from "./application/usecases/GetBoardChanges";
import { GetBoardFile } from "./application/usecases/GetBoardFile";
import { GetBoardScene } from "./application/usecases/GetBoardScene";
import { GroupElements } from "./application/usecases/GroupElements";
import { InviteBoardMember } from "./application/usecases/InviteBoardMember";
import { ListBoardMembers } from "./application/usecases/ListBoardMembers";
import { ListBoards } from "./application/usecases/ListBoards";
import { ListBoardViewers } from "./application/usecases/ListBoardViewers";
import { ListComments } from "./application/usecases/ListComments";
import { ListPages } from "./application/usecases/ListPages";
import { ListReplies } from "./application/usecases/ListReplies";
import { ListSharedBoards } from "./application/usecases/ListSharedBoards";
import { PresignBoardFileUpload } from "./application/usecases/PresignBoardFileUpload";
import { RemoveBoardMember } from "./application/usecases/RemoveBoardMember";
import { RenameBoard } from "./application/usecases/RenameBoard";
import { RenamePage } from "./application/usecases/RenamePage";
import { RenderBoardImage } from "./application/usecases/RenderBoardImage";
import { ReplyToComment } from "./application/usecases/ReplyToComment";
import { ResolveComment } from "./application/usecases/ResolveComment";
import { SearchBoards } from "./application/usecases/SearchBoards";
import {
  EditSelection,
  GetSelection,
  SelectElements,
} from "./application/usecases/Selection";
import { SetCommentReaction } from "./application/usecases/SetCommentReaction";
import { UnlockBoard } from "./application/usecases/UnlockBoard";
import { UpdateBoardAccess } from "./application/usecases/UpdateBoardAccess";
import { UpdateBoardElement } from "./application/usecases/UpdateBoardElement";
import { YjsBoardHub } from "./infrastructure/crdt/YjsBoardHub";
import { CachedBoardDocumentStore } from "./infrastructure/repositories/CachedBoardDocumentStore";
import { CachedBoardRepository } from "./infrastructure/repositories/CachedBoardRepository";
import { DrizzleBoardAccessRepository } from "./infrastructure/repositories/DrizzleBoardAccessRepository";
import { DrizzleBoardCommentRepository } from "./infrastructure/repositories/DrizzleBoardCommentRepository";
import { DrizzleBoardDocumentStore } from "./infrastructure/repositories/DrizzleBoardDocumentStore";
import { DrizzleBoardFileRepository } from "./infrastructure/repositories/DrizzleBoardFileRepository";
import { DrizzleBoardRepository } from "./infrastructure/repositories/DrizzleBoardRepository";
import { DrizzleBoardSearch } from "./infrastructure/repositories/DrizzleBoardSearch";
import { HmacUnlockTokens } from "./infrastructure/services/HmacUnlockTokens";
import { RedisAttemptLimiter } from "./infrastructure/services/RedisAttemptLimiter";
import { RedisBoardPresence } from "./infrastructure/services/RedisBoardPresence";
import { ResvgRasterizer } from "./infrastructure/services/ResvgRasterizer";
import { ScryptPasswordHasher } from "./infrastructure/services/ScryptPasswordHasher";
import { createBoardAccessController } from "./presentation/http/BoardAccessController";
import { createBoardCommentController } from "./presentation/http/BoardCommentController";
import {
  createBoardController,
  createSharedBoardsController,
} from "./presentation/http/BoardController";
import { createBoardFileController } from "./presentation/http/BoardFileController";
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
}

const createUseCases = ({
  db,
  storage,
  webOrigin,
  apiOrigin,
  secret,
  cache,
  pubsub,
  redis,
}: Omit<BoardDeps, "betterAuth">) => {
  const boards = new CachedBoardRepository(
    new DrizzleBoardRepository(db),
    cache
  );
  const grants = new DrizzleBoardAccessRepository(db);
  const comments = new DrizzleBoardCommentRepository(db);
  const profiles = new DrizzleProfileRepository(db, apiOrigin);
  const files = new DrizzleBoardFileRepository(db);
  const hub = new YjsBoardHub(
    new CachedBoardDocumentStore(new DrizzleBoardDocumentStore(db), cache),
    pubsub
  );
  const ids = new UuidGenerator();
  const uow = new DrizzleUnitOfWork<BoardTx>(
    db,
    (tx: DbExecutor, afterCommit) => ({
      boards: new CachedBoardRepository(
        new DrizzleBoardRepository(tx),
        transactionalCache(cache, afterCommit)
      ),
      grants: new DrizzleBoardAccessRepository(tx),
      comments: new DrizzleBoardCommentRepository(tx),
      notifications: new DrizzleNotificationRepository(
        tx,
        pubsub,
        ids,
        afterCommit
      ),
      outbox: new DrizzleOutbox(tx, ids),
      profiles: new DrizzleProfileRepository(tx, apiOrigin),
    })
  );
  const hasher = new ScryptPasswordHasher();
  const unlockTokens = new HmacUnlockTokens(secret);
  const guard = new BoardAccessGuard(boards, grants, unlockTokens);
  const presence = new RedisBoardPresence(redis);
  return {
    createBoard: new CreateBoard(boards, ids),
    listBoards: new ListBoards(boards),
    listSharedBoards: new ListSharedBoards(boards),
    searchBoards: new SearchBoards(new DrizzleBoardSearch(db)),
    getBoard: new GetBoard(guard),
    renameBoard: new RenameBoard(guard, boards),
    deleteBoard: new DeleteBoard(guard, uow, hub, storage),
    presignBoardFileUpload: new PresignBoardFileUpload(guard, files, storage),
    getBoardFile: new GetBoardFile(guard, files, storage),
    getBoardScene: new GetBoardScene(guard, hub),
    renderBoardImage: new RenderBoardImage(
      guard,
      hub,
      files,
      storage,
      new ResvgRasterizer()
    ),
    addBoardElements: new AddBoardElements(guard, hub, ids),
    addBoardImage: new AddBoardImage(guard, hub, files, storage, ids),
    exportBoardScene: new ExportBoardScene(guard, hub, files, storage),
    updateBoardElement: new UpdateBoardElement(guard, hub, ids),
    deleteBoardElements: new DeleteBoardElements(guard, hub, ids),
    groupElements: new GroupElements(guard, hub, ids),
    arrangeElements: new ArrangeElements(guard, hub, ids),
    listPages: new ListPages(guard, hub),
    addPage: new AddPage(guard, hub, ids),
    renamePage: new RenamePage(guard, hub),
    deletePage: new DeletePage(guard, hub),
    getBoardChanges: new GetBoardChanges(guard, hub, comments, profiles),
    getSelection: new GetSelection(guard, hub),
    selectElements: new SelectElements(guard, hub),
    editSelection: new EditSelection(guard, hub, ids),
    connectBoardSync: new ConnectBoardSync(guard, hub, presence),
    listBoardViewers: new ListBoardViewers(guard, presence),
    getBoardAccess: new GetBoardAccess(guard, grants, webOrigin),
    updateBoardAccess: new UpdateBoardAccess(
      guard,
      uow,
      hasher,
      ids,
      webOrigin
    ),
    removeBoardMember: new RemoveBoardMember(guard, uow),
    inviteBoardMember: new InviteBoardMember(guard, uow),
    listBoardMembers: new ListBoardMembers(guard, grants, profiles),
    unlockBoard: new UnlockBoard(
      boards,
      hasher,
      unlockTokens,
      new RedisAttemptLimiter(redis)
    ),
    listComments: new ListComments(guard, comments, profiles),
    listReplies: new ListReplies(guard, comments, profiles),
    addComment: new AddComment(guard, uow, ids),
    replyToComment: new ReplyToComment(guard, uow, ids),
    editComment: new EditComment(guard, uow),
    resolveComment: new ResolveComment(guard, uow),
    assignComment: new AssignComment(guard, uow),
    setCommentReaction: new SetCommentReaction(guard, comments, profiles),
    deleteComment: new DeleteComment(guard, comments),
  };
};

export type BoardUseCases = ReturnType<typeof createUseCases>;

export const createBoardModule = ({ betterAuth, ...deps }: BoardDeps) => {
  const uc = createUseCases(deps);
  return new Elysia({ name: "feature/board" })
    .use(createBoardSyncController(betterAuth, uc))
    .use(createBoardFileController(betterAuth, uc))
    .use(createBoardCommentController(betterAuth, uc))
    .use(createBoardAccessController(betterAuth, uc))
    .use(createBoardController(betterAuth, uc))
    .use(createSharedBoardsController(betterAuth, uc))
    .use(createMcpController(betterAuth, uc));
};
