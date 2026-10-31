import type { Database, DbExecutor } from "@narbel/db";
import { Elysia } from "elysia";
import type Redis from "ioredis";

import type { ICache } from "../../shared/application/interfaces/ICache";
import type { IFileStorage } from "../../shared/application/interfaces/IFileStorage";
import type { IPubSub } from "../../shared/application/interfaces/IPubSub";
import { UuidGenerator } from "../../shared/infrastructure/ids/UuidGenerator";
import { DrizzleProcessedEvents } from "../../shared/infrastructure/outbox/DrizzleProcessedEvents";
import { UnreadableEventError } from "../../shared/infrastructure/outbox/OutboxWorker";
import type { EventConsumer } from "../../shared/infrastructure/outbox/OutboxWorker";
import type { AfterCommit } from "../../shared/infrastructure/uow/DrizzleUnitOfWork";
import { DrizzleUnitOfWork } from "../../shared/infrastructure/uow/DrizzleUnitOfWork";
import type { BetterAuthPlugin } from "../auth";
import type {
  IBoardAccess,
  IBoardRecords,
} from "./application/ports/IBoardAccess";
import type { ICommentActivity } from "./application/ports/ICommentActivity";
import { AddBoardElements } from "./application/usecases/AddBoardElements";
import { AddBoardImage } from "./application/usecases/AddBoardImage";
import { AddPage } from "./application/usecases/AddPage";
import { ArrangeElements } from "./application/usecases/ArrangeElements";
import { ConnectBoardSync } from "./application/usecases/ConnectBoardSync";
import { CopyDrawing } from "./application/usecases/CopyDrawing";
import { DeleteBoardElements } from "./application/usecases/DeleteBoardElements";
import { DeleteDrawing } from "./application/usecases/DeleteDrawing";
import type { DeleteDrawingTx } from "./application/usecases/DeleteDrawing";
import { DeletePage } from "./application/usecases/DeletePage";
import { ExportBoardScene } from "./application/usecases/ExportBoardScene";
import { GetBoardChanges } from "./application/usecases/GetBoardChanges";
import { GetBoardFile } from "./application/usecases/GetBoardFile";
import { GetBoardScene } from "./application/usecases/GetBoardScene";
import { GetBoardVersion } from "./application/usecases/GetBoardVersion";
import { GetLibrary } from "./application/usecases/GetLibrary";
import { GroupElements } from "./application/usecases/GroupElements";
import { ListBoardVersions } from "./application/usecases/ListBoardVersions";
import { ListBoardViewers } from "./application/usecases/ListBoardViewers";
import { ListPages } from "./application/usecases/ListPages";
import { PresignBoardFileUpload } from "./application/usecases/PresignBoardFileUpload";
import { RenamePage } from "./application/usecases/RenamePage";
import { RenderBoardImage } from "./application/usecases/RenderBoardImage";
import { RestoreBoardVersion } from "./application/usecases/RestoreBoardVersion";
import { SaveLibrary } from "./application/usecases/SaveLibrary";
import {
  EditSelection,
  GetSelection,
  SelectElements,
} from "./application/usecases/Selection";
import { UpdateBoardElement } from "./application/usecases/UpdateBoardElement";
import { YjsBoardHub } from "./infrastructure/crdt/YjsBoardHub";
import { boardDeletedSchema } from "./infrastructure/events/boardDeletedSchema";
import { DrizzleBoardDocumentStore } from "./infrastructure/repositories/DrizzleBoardDocumentStore";
import { DrizzleBoardFileRepository } from "./infrastructure/repositories/DrizzleBoardFileRepository";
import { DrizzleBoardVersionRepository } from "./infrastructure/repositories/DrizzleBoardVersionRepository";
import { DrizzleDrawingRows } from "./infrastructure/repositories/DrizzleDrawingRows";
import { DrizzleLibraryRepository } from "./infrastructure/repositories/DrizzleLibraryRepository";
import { RedisBoardPresence } from "./infrastructure/services/RedisBoardPresence";
import { ResvgRasterizer } from "./infrastructure/services/ResvgRasterizer";
import { createBoardFileController } from "./presentation/http/BoardFileController";
import { createBoardPreviewController } from "./presentation/http/BoardPreviewController";
import { createBoardVersionController } from "./presentation/http/BoardVersionController";
import { createLibraryController } from "./presentation/http/LibraryController";
import { createBoardSyncController } from "./presentation/ws/BoardSyncController";

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

/** Builds the live rooms; `boardsIn` is boards' record of a board, bound to a document save's transaction. */
export const createDrawingRooms = ({
  db,
  pubsub,
  boardsIn,
}: {
  db: Database;
  pubsub: IPubSub;
  boardsIn: (tx: DbExecutor, afterCommit: AfterCommit) => IBoardRecords;
}): DrawingRooms =>
  new YjsBoardHub(new DrizzleBoardDocumentStore(db, boardsIn), pubsub);

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

/**
 * Reads boards' board-deleted off the outbox: drops the board's drawing rows, its live room and its
 * stored files, once per event.
 */
export const createDrawingConsumer = ({
  db,
  storage,
  rooms,
}: {
  db: Database;
  storage: IFileStorage;
  rooms: DrawingRooms;
}): EventConsumer => {
  const deleteDrawing = new DeleteDrawing(
    new DrizzleUnitOfWork<DeleteDrawingTx>(db, (tx) => ({
      drawings: new DrizzleDrawingRows(tx),
      processed: new DrizzleProcessedEvents(tx),
    })),
    rooms,
    storage
  );
  return async (id, payload) => {
    const event = boardDeletedSchema.safeParse(payload);
    if (!event.success) {
      throw new UnreadableEventError(event.error.message);
    }
    await deleteDrawing.execute(id, event.data);
  };
};
