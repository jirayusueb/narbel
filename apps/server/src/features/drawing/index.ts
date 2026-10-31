export {
  createDrawingConsumer,
  createDrawingModule,
  createDrawingRooms,
  createDrawingUseCases,
  type DrawingRooms,
  type DrawingUseCases,
} from "./ioc";
export { createLiveConsumer } from "./infrastructure/events/liveConsumer";
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
export { MAX_INLINE_IMAGE_BYTES } from "./domain/rules/UploadRules";
export {
  STYLE,
  STYLE_KEYS,
  type Style,
  type StyleKey,
} from "./domain/shapes/ElementStyle";
export { SHAPE_TYPES } from "./domain/shapes/ShapeRegistry";
