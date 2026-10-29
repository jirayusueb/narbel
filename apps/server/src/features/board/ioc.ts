import type { Database } from "@narbel/db";
import { Elysia } from "elysia";

import { UuidGenerator } from "../../shared/infrastructure/ids/UuidGenerator";
import type { BetterAuthPlugin } from "../auth";
import { AddBoardElements } from "./application/usecases/AddBoardElements";
import { ConnectBoardSync } from "./application/usecases/ConnectBoardSync";
import { CreateBoard } from "./application/usecases/CreateBoard";
import { DeleteBoard } from "./application/usecases/DeleteBoard";
import { DeleteBoardElements } from "./application/usecases/DeleteBoardElements";
import { GetBoard } from "./application/usecases/GetBoard";
import { GetBoardFile } from "./application/usecases/GetBoardFile";
import { GetBoardScene } from "./application/usecases/GetBoardScene";
import { ListBoards } from "./application/usecases/ListBoards";
import { RenameBoard } from "./application/usecases/RenameBoard";
import { UpdateBoardElement } from "./application/usecases/UpdateBoardElement";
import { UploadBoardFile } from "./application/usecases/UploadBoardFile";
import { YjsBoardHub } from "./infrastructure/crdt/YjsBoardHub";
import { DrizzleBoardDocumentStore } from "./infrastructure/repositories/DrizzleBoardDocumentStore";
import { DrizzleBoardFileRepository } from "./infrastructure/repositories/DrizzleBoardFileRepository";
import { DrizzleBoardRepository } from "./infrastructure/repositories/DrizzleBoardRepository";
import { BunS3FileStorage } from "./infrastructure/services/BunS3FileStorage";
import type { S3Config } from "./infrastructure/services/BunS3FileStorage";
import { createBoardController } from "./presentation/http/BoardController";
import { createBoardFileController } from "./presentation/http/BoardFileController";
import { createMcpController } from "./presentation/mcp/McpController";
import { createBoardSyncController } from "./presentation/ws/BoardSyncController";

export interface BoardDeps {
  db: Database;
  s3: S3Config;
  betterAuth: BetterAuthPlugin;
}

const createUseCases = ({ db, s3 }: Pick<BoardDeps, "db" | "s3">) => {
  const boards = new DrizzleBoardRepository(db);
  const files = new DrizzleBoardFileRepository(db);
  const storage = new BunS3FileStorage(s3);
  const hub = new YjsBoardHub(new DrizzleBoardDocumentStore(db));
  const ids = new UuidGenerator();
  return {
    createBoard: new CreateBoard(boards, ids),
    listBoards: new ListBoards(boards),
    getBoard: new GetBoard(boards),
    renameBoard: new RenameBoard(boards),
    deleteBoard: new DeleteBoard(boards, hub, storage),
    uploadBoardFile: new UploadBoardFile(boards, files, storage),
    getBoardFile: new GetBoardFile(boards, files, storage),
    getBoardScene: new GetBoardScene(boards, hub),
    addBoardElements: new AddBoardElements(boards, hub, ids),
    updateBoardElement: new UpdateBoardElement(boards, hub, ids),
    deleteBoardElements: new DeleteBoardElements(boards, hub, ids),
    connectBoardSync: new ConnectBoardSync(boards, hub),
  };
};

export type BoardUseCases = ReturnType<typeof createUseCases>;

export const createBoardModule = (deps: BoardDeps) => {
  const uc = createUseCases(deps);
  return new Elysia({ name: "feature/board" })
    .use(createBoardSyncController(deps.betterAuth, uc))
    .use(createBoardFileController(deps.betterAuth, uc))
    .use(createBoardController(deps.betterAuth, uc))
    .use(createMcpController(deps.betterAuth, uc));
};
