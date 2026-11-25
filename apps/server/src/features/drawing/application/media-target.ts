import type { IIdGenerator } from "../../../shared/application/interfaces/i-id-generator";
import { AppError } from "../../../shared/kernel/errors/app-error";
import { Drawing } from "../domain/entities/drawing";
import type { Element, ElementId } from "../domain/entities/element";
import { Page } from "../domain/entities/page";
import type { PageId } from "../domain/entities/page";
import { Geometry } from "../domain/rules/geometry";
import { Layout } from "../domain/rules/layout";
import { bumped } from "./connectors";
import type { SceneAccess } from "./ports/i-board-scenes";

/** Where an agent or a person asked a file-backed element (image, artifact) to go. */
export interface MediaTargetInput {
  pageId?: PageId;
  id?: ElementId;
  frameId?: ElementId;
  x?: number;
  y?: number;
}

export type MediaRefusal = "no-page" | "id-taken" | "no-frame";

export interface MediaTarget {
  page: Page;
  id: ElementId;
  frame: Element | null;
}

export const MEDIA_FAILURES: Record<MediaRefusal, () => AppError> = {
  "no-page": () => AppError.notFound("Page"),
  "id-taken": () =>
    AppError.validation("An element with that id already exists on the board"),
  "no-frame": () =>
    AppError.validation("frameId must reference a frame on the page"),
};

export const resolveMediaTarget = (
  scene: SceneAccess,
  ids: IIdGenerator,
  input: MediaTargetInput
): MediaTarget | MediaRefusal => {
  const page = Page.resolve(scene.pages(), input.pageId);
  if (!page) {
    return "no-page";
  }
  const id = input.id ?? ids.generate();
  if (Drawing.isElementIdTaken(id, (key) => scene.locate(key))) {
    return "id-taken";
  }
  const frame =
    input.frameId === undefined ? null : scene.get(page.id, input.frameId);
  if (
    input.frameId !== undefined &&
    (frame?.type !== "frame" || frame.isDeleted)
  ) {
    return "no-frame";
  }
  return { page, id, frame };
};

const insideFrame = (frame: Element, live: Element[]) => {
  const right = live
    .filter((e) => e.frameId === frame.id)
    .map((e) => Geometry.elementBounds(e))
    .map((b) => b.x + b.width);
  return {
    x:
      (right.length === 0 ? Number(frame.x) : Math.max(...right)) +
      Layout.FRAME_PADDING,
    y: Number(frame.y) + Layout.FRAME_PADDING,
  };
};

/**
 * Puts a sized element where the input asks: at x/y, else beside the page's content, else inside
 * the frame after its children (growing the frame unless it is locked). Answers the element put.
 */
export const placeMedia = (
  scene: SceneAccess,
  ids: IIdGenerator,
  target: MediaTarget,
  input: MediaTargetInput & { width: number; height: number },
  build: (spot: { x: number; y: number; frameId?: ElementId }) => Element
) => {
  const { page, frame } = target;
  const size = { width: input.width, height: input.height };
  const live = scene.all(page.id).filter((e) => !e.isDeleted);
  const beside = Layout.besideContent(
    live.map(Geometry.elementBounds),
    Layout.CLEARANCE
  );
  const spot = frame
    ? insideFrame(frame, live)
    : { x: beside.left, y: beside.top };
  const autoPlaced = input.x === undefined || input.y === undefined;
  const x = input.x ?? spot.x;
  const y = input.y ?? spot.y;
  const grows = autoPlaced && frame?.locked !== true;
  const inFrame =
    frame &&
    (grows ||
      Geometry.overlaps({ ...size, x, y }, Geometry.elementBounds(frame)));
  const element = build({ x, y, frameId: inFrame ? frame?.id : undefined });
  scene.put(page.id, element);
  if (frame && grows) {
    const fitted = Geometry.union([
      Geometry.elementBounds(frame),
      Layout.wrapFrame([{ ...size, x, y }]),
    ]);
    scene.put(page.id, bumped({ ...frame, ...fitted }, ids));
  }
  return element;
};
