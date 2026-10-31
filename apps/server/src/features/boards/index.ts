export {
  boardRecordsIn,
  createAccessPolicy,
  createBoardsModule,
  createBoardsUseCases,
  type BoardsDeps,
  type BoardsUseCases,
} from "./ioc";
// drawing's file sweep reads Trash and the last edit straight from the table, as before the split
export { DrizzleBoardRepository } from "./infrastructure/repositories/DrizzleBoardRepository";
