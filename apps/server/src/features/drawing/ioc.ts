import type { Database, DbExecutor } from "@narbel/db";
import { Elysia } from "elysia";
import type Redis from "ioredis";

import type { ICache } from "../../shared/application/interfaces/i-cache";
import type { IFileStorage } from "../../shared/application/interfaces/i-file-storage";
import type { IPubSub } from "../../shared/application/interfaces/i-pub-sub";
import { UuidGenerator } from "../../shared/infrastructure/ids/uuid-generator";
import { DrizzleProcessedEvents } from "../../shared/infrastructure/outbox/drizzle-processed-events";
import type { AfterCommit } from "../../shared/infrastructure/uow/drizzle-unit-of-work";
import { DrizzleUnitOfWork } from "../../shared/infrastructure/uow/drizzle-unit-of-work";
import type { BetterAuthPlugin } from "../auth";
import type {
  IBoardAccess,
  IBoardRecords,
} from "./application/ports/i-board-access";
import type { ICommentActivity } from "./application/ports/i-comment-activity";
import { AddBoardElements } from "./application/usecases/add-board-elements";
import { AddBoardImage } from "./application/usecases/add-board-image";
import { AddPage } from "./application/usecases/add-page";
import { ArrangeElements } from "./application/usecases/arrange-elements";
import { ConnectBoardSync } from "./application/usecases/connect-board-sync";
import { CopyDrawing } from "./application/usecases/copy-drawing";
import { DeleteBoardElements } from "./application/usecases/delete-board-elements";
import { DeleteDrawing } from "./application/usecases/delete-drawing";
import type { DeleteDrawingTx } from "./application/usecases/delete-drawing";
import { DeletePage } from "./application/usecases/delete-page";
import { ExportBoardScene } from "./application/usecases/export-board-scene";
import { GetBoardChanges } from "./application/usecases/get-board-changes";
import { GetBoardFile } from "./application/usecases/get-board-file";
import { GetBoardScene } from "./application/usecases/get-board-scene";
import { GetBoardVersion } from "./application/usecases/get-board-version";
import { GetLibrary } from "./application/usecases/get-library";
import { GroupElements } from "./application/usecases/group-elements";
import { ListBoardVersions } from "./application/usecases/list-board-versions";
import { ListBoardViewers } from "./application/usecases/list-board-viewers";
import { ListPages } from "./application/usecases/list-pages";
import { PresignBoardFileUpload } from "./application/usecases/presign-board-file-upload";
import { RenamePage } from "./application/usecases/rename-page";
import { RenderBoardImage } from "./application/usecases/render-board-image";
import { RestoreBoardVersion } from "./application/usecases/restore-board-version";
import { SaveLibrary } from "./application/usecases/save-library";
import {
  EditSelection,
  GetSelection,
  SelectElements,
} from "./application/usecases/selection";
import { UpdateBoardElement } from "./application/usecases/update-board-element";
import { YjsBoardHub } from "./infrastructure/crdt/yjs-board-hub";
import { BoardDeletedConsumer } from "./infrastructure/events/board-deleted-consumer";
import { DrizzleBoardDocumentStore } from "./infrastructure/repositories/drizzle-board-document-store";
import { DrizzleBoardFileRepository } from "./infrastructure/repositories/drizzle-board-file-repository";
import { DrizzleBoardVersionRepository } from "./infrastructure/repositories/drizzle-board-version-repository";
import { DrizzleDrawingRows } from "./infrastructure/repositories/drizzle-drawing-rows";
import { DrizzleLibraryRepository } from "./infrastructure/repositories/drizzle-library-repository";
import { RedisBoardPresence } from "./infrastructure/services/redis-board-presence";
import { ResvgRasterizer } from "./infrastructure/services/resvg-rasterizer";
import { createBoardFileController } from "./presentation/http/board-file-controller";
import { createBoardPreviewController } from "./presentation/http/board-preview-controller";
import { createBoardVersionController } from "./presentation/http/board-version-controller";
import { createLibraryController } from "./presentation/http/library-controller";
import { createBoardSyncController } from "./presentation/ws/board-sync-controller";

/** The use cases drawing's transports (HTTP, WebSocket, MCP) drive. */
export interface DrawingUseCases {
  addBoardElements: AddBoardElements;
  addBoardImage: AddBoardImage;
  addPage: AddPage;
  arrangeElements: ArrangeElements;
  connectBoardSync: ConnectBoardSync;
  copyDrawing: CopyDrawing;
  deleteBoardElements: DeleteBoardElements;
  deletePage: DeletePage;
  editSelection: EditSelection;
  exportBoardScene: ExportBoardScene;
  getBoardChanges: GetBoardChanges;
  getBoardFile: GetBoardFile;
  getBoardScene: GetBoardScene;
  getBoardVersion: GetBoardVersion;
  getLibrary: GetLibrary;
  getSelection: GetSelection;
  groupElements: GroupElements;
  listBoardVersions: ListBoardVersions;
  listBoardViewers: ListBoardViewers;
  listPages: ListPages;
  presignBoardFileUpload: PresignBoardFileUpload;
  renamePage: RenamePage;
  renderBoardImage: RenderBoardImage;
  restoreBoardVersion: RestoreBoardVersion;
  saveLibrary: SaveLibrary;
  selectElements: SelectElements;
  updateBoardElement: UpdateBoardElement;
}

/** The live rooms of one server instance: every use case and the board-deleted consumer share them. */
export type DrawingRooms = YjsBoardHub;

/**
 * Builds the live rooms; `boardsIn` is boards' record of a board, bound to a document save's
 * transaction, and `wakeOutbox` asks for an outbox pass after a save published its text.
 */
export const createDrawingRooms = ({
  db,
  pubsub,
  boardsIn,
  wakeOutbox,
}: {
  db: Database;
  pubsub: IPubSub;
  boardsIn: (tx: DbExecutor, afterCommit: AfterCommit) => IBoardRecords;
  wakeOutbox: () => void;
}): DrawingRooms =>
  new YjsBoardHub(
    new DrizzleBoardDocumentStore(db, boardsIn, wakeOutbox),
    pubsub
  );

export interface DrawingDeps {
  db: Database;
  storage: IFileStorage;
  cache: ICache;
  /** shared by every server instance: who has which board open */
  redis: Redis;
  rooms: DrawingRooms;
  /** boards' AccessPolicy */
  access: IBoardAccess;
  /** discussion's comment activity, reported by get_changes */
  comments: ICommentActivity;
}

export const createDrawingUseCases = ({
  db,
  storage,
  cache,
  redis,
  rooms,
  access,
  comments,
}: DrawingDeps): DrawingUseCases => {
  const ids = new UuidGenerator();
  const files = new DrizzleBoardFileRepository(db);
  const versions = new DrizzleBoardVersionRepository(db);
  const presence = new RedisBoardPresence(redis);
  const library = new DrizzleLibraryRepository(db);
  return {
    addBoardElements: new AddBoardElements(access, rooms, ids),
    addBoardImage: new AddBoardImage(access, rooms, files, storage, ids),
    addPage: new AddPage(access, rooms, ids),
    arrangeElements: new ArrangeElements(access, rooms, ids),
    connectBoardSync: new ConnectBoardSync(access, rooms, presence),
    copyDrawing: new CopyDrawing(rooms, files, storage),
    deleteBoardElements: new DeleteBoardElements(access, rooms, ids),
    deletePage: new DeletePage(access, rooms),
    editSelection: new EditSelection(access, rooms, ids),
    exportBoardScene: new ExportBoardScene(access, rooms, files, storage),
    getBoardChanges: new GetBoardChanges(access, rooms, comments),
    getBoardFile: new GetBoardFile(access, files, storage),
    getBoardScene: new GetBoardScene(access, rooms),
    getBoardVersion: new GetBoardVersion(access, versions, rooms),
    getLibrary: new GetLibrary(library),
    getSelection: new GetSelection(access, rooms),
    groupElements: new GroupElements(access, rooms, ids),
    listBoardVersions: new ListBoardVersions(access, versions),
    listBoardViewers: new ListBoardViewers(access, presence),
    listPages: new ListPages(access, rooms),
    presignBoardFileUpload: new PresignBoardFileUpload(access, files, storage),
    renamePage: new RenamePage(access, rooms),
    renderBoardImage: new RenderBoardImage(
      access,
      rooms,
      files,
      storage,
      new ResvgRasterizer(),
      cache
    ),
    restoreBoardVersion: new RestoreBoardVersion(access, versions, rooms),
    saveLibrary: new SaveLibrary(library),
    selectElements: new SelectElements(access, rooms),
    updateBoardElement: new UpdateBoardElement(access, rooms, ids),
  };
};

export const createDrawingModule = (
  betterAuth: BetterAuthPlugin,
  uc: DrawingUseCases
) =>
  new Elysia({ name: "feature/drawing" })
    .use(createBoardSyncController(betterAuth, uc))
    .use(createBoardFileController(betterAuth, uc))
    .use(createBoardVersionController(betterAuth, uc))
    .use(createBoardPreviewController(betterAuth, uc))
    .use(createLibraryController(betterAuth, uc));

/** Wires the board-deleted consumer: the use case commits with its processed mark. */
export const createDrawingConsumer = ({
  db,
  storage,
  rooms,
}: {
  db: Database;
  storage: IFileStorage;
  rooms: DrawingRooms;
}) =>
  new BoardDeletedConsumer(
    new DeleteDrawing(
      new DrizzleUnitOfWork<DeleteDrawingTx>(db, (tx) => ({
        drawings: new DrizzleDrawingRows(tx),
        processed: new DrizzleProcessedEvents(tx),
      })),
      rooms,
      storage
    )
  );
