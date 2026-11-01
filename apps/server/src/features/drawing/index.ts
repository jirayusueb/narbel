export {
  createDrawingConsumer,
  createDrawingModule,
  createDrawingRooms,
  createDrawingUseCases,
  type DrawingRooms,
  type DrawingUseCases,
} from "./ioc";
export { LiveConsumer } from "./infrastructure/events/LiveConsumer";
export { backfillBoardText } from "./infrastructure/repositories/backfillBoardText";
export { sweepBoardFiles } from "./infrastructure/gc/sweepBoardFiles";
export { RedisBoardPresence } from "./infrastructure/services/RedisBoardPresence";
// the MCP transport describes its tools with these
export { roundCoord } from "./application/dtos/SceneDto";
export {
  DEFAULT_MAX_SIZE,
  MAX_MAX_SIZE,
  MIN_MAX_SIZE,
} from "./domain/rendering/sceneSvg";
export { UploadRules } from "./domain/rules/UploadRules";
export { ElementStyle } from "./domain/shapes/ElementStyle";
export type { Style, StyleKey } from "./domain/shapes/ElementStyle";
export { ShapeRegistry } from "./domain/shapes/ShapeRegistry";
