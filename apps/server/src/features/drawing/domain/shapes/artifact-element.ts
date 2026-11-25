import type { Element, ElementId } from "../entities/element";
import type { ArtifactFormat } from "../rules/upload-rules";
import { ShapeRegistry } from "./shape-registry";
import type { ElementIdentity } from "./shape-registry";

export interface ArtifactInfo {
  format: ArtifactFormat;
  name: string;
}

/** An HTML or Markdown file shown live on the canvas: an Excalidraw iframe whose file the web renders. */
export class ArtifactElement {
  static readonly DEFAULT_SIZE = { width: 640, height: 480 } as const;

  private constructor() {
    // static rules only
  }

  static buildArtifact(
    input: ArtifactInfo & {
      x: number;
      y: number;
      width: number;
      height: number;
      fileId: string;
      frameId?: ElementId;
    },
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
    const artifact: ArtifactInfo = { format: input.format, name: input.name };
    return {
      ...base,
      type: "iframe",
      fileId: input.fileId,
      frameId: input.frameId ?? null,
      rest: { ...base.rest, customData: { artifact } },
    };
  }

  /** The artifact an element shows, or null for any other element. */
  static infoOf(element: Element): ArtifactInfo | null {
    if (element.type !== "iframe" || typeof element.fileId !== "string") {
      return null;
    }
    const custom = element.rest.customData as
      | { artifact?: Partial<ArtifactInfo> }
      | undefined;
    const artifact = custom?.artifact;
    if (
      (artifact?.format !== "html" && artifact?.format !== "markdown") ||
      typeof artifact.name !== "string"
    ) {
      return null;
    }
    return { format: artifact.format, name: artifact.name };
  }
}
