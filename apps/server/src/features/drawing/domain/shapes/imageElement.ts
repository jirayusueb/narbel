import type { Element } from "../entities/Element";
import { ShapeRegistry } from "./ShapeRegistry";
import type { ElementIdentity } from "./ShapeRegistry";

const MAX_SIDE = 800;
const UNKNOWN_SIZE = { width: 400, height: 300 };

interface Size {
  width: number;
  height: number;
}

export class ImageElement {
  private constructor() {
    // static rules only
  }

  static imageSize(
    natural: Size | undefined,
    given: { width?: number; height?: number }
  ): Size {
    const base = natural ?? UNKNOWN_SIZE;
    if (given.width !== undefined && given.height !== undefined) {
      return { width: given.width, height: given.height };
    }
    let scale = Math.min(1, MAX_SIDE / Math.max(base.width, base.height));
    if (given.width === undefined) {
      if (given.height !== undefined) {
        scale = given.height / base.height;
      }
    } else {
      scale = given.width / base.width;
    }
    return {
      width: Math.max(1, Math.round(base.width * scale)),
      height: Math.max(1, Math.round(base.height * scale)),
    };
  }

  static buildImage(
    input: Size & { x: number; y: number; fileId: string; frameId?: string },
    identity: ElementIdentity
  ): Element {
    const base = ShapeRegistry.buildElement(
      {
        type: "rectangle",
        x: input.x,
        y: input.y,
        width: input.width,
        height: input.height,
      },
      identity
    );
    return {
      ...base,
      type: "image",
      fileId: input.fileId,
      scale: [1, 1],
      frameId: input.frameId ?? null,
      rest: { ...base.rest, status: "saved" },
    };
  }
}
