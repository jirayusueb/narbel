export {
  createDrawingConsumer,
  createDrawingModule,
  createDrawingRooms,
  createDrawingUseCases,
  type DrawingRooms,
  type DrawingUseCases,
} from "./ioc";
export { LiveConsumer } from "./infrastructure/events/live-consumer";
export { backfillBoardText } from "./infrastructure/repositories/backfill-board-text";
export { sweepBoardFiles } from "./infrastructure/gc/sweep-board-files";
export { RedisBoardPresence } from "./infrastructure/services/redis-board-presence";
// the MCP transport describes its tools with these
export { roundCoord } from "./application/dtos/scene-dto";
export {
  DEFAULT_MAX_SIZE,
  MAX_MAX_SIZE,
  MIN_MAX_SIZE,
} from "./domain/rendering/scene-svg";
export { UploadRules } from "./domain/rules/upload-rules";
export { ElementStyle } from "./domain/shapes/element-style";
export type { Style, StyleKey } from "./domain/shapes/element-style";
export { ShapeRegistry } from "./domain/shapes/shape-registry";
