import { err, okEmpty } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { Drawing } from "../entities/drawing";
import type { Element } from "../entities/element";
import { ElementStyle } from "../shapes/element-style";
import { ShapeRegistry } from "../shapes/shape-registry";
import type { Shape } from "../shapes/shape-registry";
import { Bindings } from "./bindings";
import { Geometry } from "./geometry";
import type { Bounds } from "./geometry";
import { Layout } from "./layout";
import type { LayoutDirection } from "./layout";

export interface Built {
  shape: Shape;
  /** the agent gave startElementId/endElementId to a shape that cannot connect */
  strayEnds: boolean;
  element: Element;
}

export type PlacementRefusal =
  | "not-connector"
  | "missing-ref"
  | "missing-frame"
  | "frame-empty";

const isPlaced = (shape: Shape) =>
  shape.x !== undefined && shape.y !== undefined;

const live = (e: Element) => !e.isDeleted;

export class Placement {
  private constructor() {
    // static rules only
  }

  static arrange(
    batch: Built[],
    existing: Element[],
    direction: LayoutDirection = "down"
  ): Built[] {
    const loose = batch.filter(
      ({ shape, element }) =>
        !(
          isPlaced(shape) ||
          Bindings.connectorCapable(element) ||
          element.type === "frame"
        )
    );
    if (loose.length === 0) {
      return batch;
    }
    const byId = new Map(
      [...existing.filter(live), ...batch.map((b) => b.element)].map((e) => [
        e.id,
        e,
      ])
    );
    const unsized = new Set(
      batch
        .filter(({ shape }) => shape.type === "frame" && !isPlaced(shape))
        .map(({ element }) => element.id)
    );
    const fixed: Bounds[] = [
      ...existing.filter(live),
      ...batch.filter(({ shape }) => isPlaced(shape)).map((b) => b.element),
    ].map(Geometry.elementBounds);
    const groups = new Map<string | undefined, Built[]>();
    for (const built of loose) {
      groups.set(ShapeRegistry.frameIdOf(built.shape), [
        ...(groups.get(ShapeRegistry.frameIdOf(built.shape)) ?? []),
        built,
      ]);
    }
    const at = new Map<string, { x: number; y: number }>();
    for (const [frameId, members] of groups) {
      const ids = new Set(members.map(({ element }) => element.id));
      const edges = batch.flatMap(({ shape }) => {
        const { startElementId, endElementId } = ShapeRegistry.endsOf(shape);
        return startElementId &&
          endElementId &&
          ids.has(startElementId) &&
          ids.has(endElementId)
          ? [
              {
                from: startElementId,
                to: endElementId,
                label:
                  shape.type === "arrow" && shape.text
                    ? ShapeRegistry.arrowLabelSize(
                        shape.text,
                        shape.fontSize ?? ElementStyle.STYLE.fontSize.default
                      )
                    : undefined,
              },
            ]
          : [];
      });
      const positions = Layout.layered(
        members.map(({ element }) => ({
          id: element.id,
          width: Number(element.width),
          height: Number(element.height),
        })),
        edges,
        direction
      );
      const frame = frameId === undefined ? undefined : byId.get(frameId);
      const inside = frame !== undefined && !unsized.has(frame.id);
      const pad = frameId === undefined ? 0 : Layout.FRAME_PADDING;
      const start = inside
        ? { left: Number(frame.x) + pad, top: Number(frame.y) + pad }
        : (() => {
            const beside = Layout.besideContent(fixed, Layout.CLEARANCE);
            return { left: beside.left + pad, top: beside.top + pad };
          })();
      const placed = members.map(({ element }) => {
        const p = positions.get(element.id) ?? { x: 0, y: 0 };
        const x = start.left + p.x;
        const y = start.top + p.y;
        at.set(element.id, { x, y });
        return {
          x,
          y,
          width: Number(element.width),
          height: Number(element.height),
        };
      });
      if (!inside) {
        fixed.push(
          pad === 0 ? Geometry.union(placed) : Layout.wrapFrame(placed)
        );
      }
    }
    return batch.map((built) => {
      const p = at.get(built.element.id);
      return p ? { ...built, element: { ...built.element, ...p } } : built;
    });
  }

  static checkReferences(
    batch: Built[],
    known: Map<string, Element>
  ): Result<undefined, PlacementRefusal> {
    for (const { shape, strayEnds } of batch) {
      if (strayEnds) {
        return err("not-connector");
      }
      const { startElementId, endElementId } = ShapeRegistry.endsOf(shape);
      if (
        [startElementId, endElementId].some(
          (ref) => ref !== undefined && !known.has(ref)
        )
      ) {
        return err("missing-ref");
      }
      const frameId = ShapeRegistry.frameIdOf(shape);
      if (frameId !== undefined) {
        const frame = known.get(frameId);
        if (frame?.type !== "frame" || frame.isDeleted) {
          return err("missing-frame");
        }
      }
    }
    const hasChildren = ({ element }: Built) =>
      batch.some(({ shape }) => ShapeRegistry.frameIdOf(shape) === element.id);
    return batch.some(
      (built) =>
        built.shape.type === "frame" &&
        !isPlaced(built.shape) &&
        !hasChildren(built)
    )
      ? err("frame-empty")
      : okEmpty();
  }

  static attachAll(
    placed: Built[],
    known: Map<string, Element>,
    touched: Set<string>
  ) {
    for (const { shape, element } of placed) {
      const ends = ShapeRegistry.endsOf(shape);
      if (
        ends.startElementId === undefined &&
        ends.endElementId === undefined
      ) {
        continue;
      }
      const latest = known.get(element.id) ?? element;
      for (const write of Bindings.attachConnector(latest, ends, known)
        .writes) {
        known.set(write.id, write);
        touched.add(write.id);
      }
    }
  }

  static fitFrames(
    batch: Built[],
    known: Map<string, Element>,
    touched: Set<string>
  ) {
    const fitted = batch.filter(
      ({ shape }) => shape.type === "frame" && !isPlaced(shape)
    );
    for (const { element } of fitted) {
      const children = [...known.values()].filter(
        (e) => e.frameId === element.id && !e.isDeleted
      );
      known.set(element.id, {
        ...(known.get(element.id) ?? element),
        ...Layout.wrapFrame(children.map(Geometry.elementBounds)),
      });
    }
    for (const { element } of fitted) {
      for (const arrow of Bindings.rerouteAround(
        known.get(element.id) ?? element,
        known
      )) {
        known.set(arrow.id, arrow);
        touched.add(arrow.id);
        const label = known.get(Drawing.labelIdOf(arrow) ?? "");
        if (label) {
          known.set(label.id, ShapeRegistry.fitLabel(label, arrow));
        }
      }
    }
  }

  /** A placed child outside its sized frame would be clipped away in the browser, so it stays unframed. */
  static unframeStrays(placed: Built[], known: Map<string, Element>) {
    const unsized = new Set(
      placed
        .filter(({ shape }) => shape.type === "frame" && !isPlaced(shape))
        .map(({ element }) => element.id)
    );
    return placed.map((built) => {
      const { shape, element } = built;
      const frameId = ShapeRegistry.frameIdOf(shape);
      const frame = frameId === undefined ? undefined : known.get(frameId);
      const stray =
        isPlaced(shape) &&
        frame !== undefined &&
        !unsized.has(frame.id) &&
        !Geometry.overlaps(
          Geometry.elementBounds(element),
          Geometry.elementBounds(frame)
        );
      return stray
        ? { ...built, element: { ...element, frameId: null } }
        : built;
    });
  }
}
