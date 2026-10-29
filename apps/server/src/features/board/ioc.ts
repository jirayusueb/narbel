import type { Database } from "@narbel/db";
import { Elysia } from "elysia";
import type { ICache } from "../../shared/application/interfaces/ICache";
import type { IPubSub } from "../../shared/application/interfaces/IPubSub";
import { UuidGenerator } from "../../shared/infrastructure/ids/UuidGenerator";
import type { BetterAuthPlugin } from "../auth";
import { BoardAccessGuard } from "./application/BoardAccess";
import { AddBoardElements } from "./application/usecases/AddBoardElements";
import { AddComment } from "./application/usecases/AddComment";
import { AddPage } from "./application/usecases/AddPage";
import { ConnectBoardSync } from "./application/usecases/ConnectBoardSync";
import { CreateBoard } from "./application/usecases/CreateBoard";
import { DeleteBoard } from "./application/usecases/DeleteBoard";
import { DeleteBoardElements } from "./application/usecases/DeleteBoardElements";
import { DeleteComment } from "./application/usecases/DeleteComment";
import { DeletePage } from "./application/usecases/DeletePage";
import { GetBoard } from "./application/usecases/GetBoard";
import { GetBoardAccess } from "./application/usecases/GetBoardAccess";
import { GetBoardFile } from "./application/usecases/GetBoardFile";
import { GetBoardScene } from "./application/usecases/GetBoardScene";
import { InviteBoardMember } from "./application/usecases/InviteBoardMember";
import { ListBoards } from "./application/usecases/ListBoards";
import { ListComments } from "./application/usecases/ListComments";
import { ListPages } from "./application/usecases/ListPages";
import { ListSharedBoards } from "./application/usecases/ListSharedBoards";
import { PresignBoardFileUpload } from "./application/usecases/PresignBoardFileUpload";
import { RemoveBoardMember } from "./application/usecases/RemoveBoardMember";
import { RenameBoard } from "./application/usecases/RenameBoard";
import { RenamePage } from "./application/usecases/RenamePage";
import { ResolveComment } from "./application/usecases/ResolveComment";
import {
  EditSelection,
  GetSelection,
  SelectElements,
} from "./application/usecases/Selection";
import { UnlockBoard } from "./application/usecases/UnlockBoard";
import { UpdateBoardAccess } from "./application/usecases/UpdateBoardAccess";
import { UpdateBoardElement } from "./application/usecases/UpdateBoardElement";
import { YjsBoardHub } from "./infrastructure/crdt/YjsBoardHub";
import { CachedBoardCommentRepository } from "./infrastructure/repositories/CachedBoardCommentRepository";
import { CachedBoardDocumentStore } from "./infrastructure/repositories/CachedBoardDocumentStore";
import { CachedBoardRepository } from "./infrastructure/repositories/CachedBoardRepository";
import { DrizzleBoardAccessRepository } from "./infrastructure/repositories/DrizzleBoardAccessRepository";
import { DrizzleBoardCommentRepository } from "./infrastructure/repositories/DrizzleBoardCommentRepository";
import { DrizzleBoardDocumentStore } from "./infrastructure/repositories/DrizzleBoardDocumentStore";
import { DrizzleBoardFileRepository } from "./infrastructure/repositories/DrizzleBoardFileRepository";
import { DrizzleBoardRepository } from "./infrastructure/repositories/DrizzleBoardRepository";
import { BunS3FileStorage } from "./infrastructure/services/BunS3FileStorage";
import type { S3Config } from "./infrastructure/services/BunS3FileStorage";
import { HmacUnlockTokens } from "./infrastructure/services/HmacUnlockTokens";
import { MemoryAttemptLimiter } from "./infrastructure/services/MemoryAttemptLimiter";
import { ResendEmailSender } from "./infrastructure/services/ResendEmailSender";
import type { ResendConfig } from "./infrastructure/services/ResendEmailSender";
import { ScryptPasswordHasher } from "./infrastructure/services/ScryptPasswordHasher";
import { createBoardAccessController } from "./presentation/http/BoardAccessController";
import { createBoardCommentController } from "./presentation/http/BoardCommentController";
import { createBoardController } from "./presentation/http/BoardController";
import { createBoardFileController } from "./presentation/http/BoardFileController";
import { createMcpController } from "./presentation/mcp/McpController";
import { createBoardSyncController } from "./presentation/ws/BoardSyncController";

export interface BoardDeps {
  db: Database;
  s3: S3Config;
  resend: ResendConfig;
  /** where the web app lives; invite and share links point here */
  webOrigin: string;
  /** signs unlock cookies */
  secret: string;
  /** shared by every server instance: cache-aside reads and the realtime sync bus */
  cache: ICache;
  pubsub: IPubSub;
  betterAuth: BetterAuthPlugin;
}

const createUseCases = ({
  db,
  s3,
  resend,
  webOrigin,
  secret,
  cache,
  pubsub,
}: Omit<BoardDeps, "betterAuth">) => {
  const boards = new CachedBoardRepository(new DrizzleBoardRepository(db), cache);
  const grants = new DrizzleBoardAccessRepository(db);
  const comments = new CachedBoardCommentRepository(
    new DrizzleBoardCommentRepository(db),
    cache
  );
  const files = new DrizzleBoardFileRepository(db);
  const storage = new BunS3FileStorage(s3);
  const hub = new YjsBoardHub(
    new CachedBoardDocumentStore(new DrizzleBoardDocumentStore(db), cache),
    pubsub
  );
  const ids = new UuidGenerator();
  const hasher = new ScryptPasswordHasher();
  const unlockTokens = new HmacUnlockTokens(secret);
  const guard = new BoardAccessGuard(boards, grants, unlockTokens);
  return {
    createBoard: new CreateBoard(boards, ids),
    listBoards: new ListBoards(boards),
    listSharedBoards: new ListSharedBoards(boards),
    getBoard: new GetBoard(guard),
    renameBoard: new RenameBoard(guard, boards),
    deleteBoard: new DeleteBoard(guard, boards, hub, storage),
    presignBoardFileUpload: new PresignBoardFileUpload(guard, files, storage),
    getBoardFile: new GetBoardFile(guard, files, storage),
    getBoardScene: new GetBoardScene(guard, hub),
    addBoardElements: new AddBoardElements(guard, hub, ids),
    updateBoardElement: new UpdateBoardElement(guard, hub, ids),
    deleteBoardElements: new DeleteBoardElements(guard, hub, ids),
    listPages: new ListPages(guard, hub),
    addPage: new AddPage(guard, hub, ids),
    renamePage: new RenamePage(guard, hub),
    deletePage: new DeletePage(guard, hub),
    getSelection: new GetSelection(guard, hub),
    selectElements: new SelectElements(guard, hub),
    editSelection: new EditSelection(guard, hub, ids),
    connectBoardSync: new ConnectBoardSync(guard, hub),
    getBoardAccess: new GetBoardAccess(guard, grants, webOrigin),
    updateBoardAccess: new UpdateBoardAccess(
      guard,
      boards,
      grants,
      hasher,
      ids,
      webOrigin
    ),
    removeBoardMember: new RemoveBoardMember(guard, grants),
    inviteBoardMember: new InviteBoardMember(
      guard,
      grants,
      new ResendEmailSender(resend),
      webOrigin
    ),
    unlockBoard: new UnlockBoard(
      boards,
      hasher,
      unlockTokens,
      new MemoryAttemptLimiter()
    ),
    listComments: new ListComments(guard, comments),
    addComment: new AddComment(guard, comments, ids),
    resolveComment: new ResolveComment(guard, comments),
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
    .use(createMcpController(betterAuth, uc));
};
