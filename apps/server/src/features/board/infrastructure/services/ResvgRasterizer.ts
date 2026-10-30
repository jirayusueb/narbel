import path from "node:path";

import { renderAsync } from "@resvg/resvg-js";

import type { IBoardRasterizer } from "../../application/ports/IBoardRasterizer";
import { FONT_FAMILY } from "../../domain/rendering/sceneSvg";

// Relative to the server app root (the cwd for dev, tests and the container), because the
// bundle's own location differs from the source tree.
const FONT_FILES = ["Sarabun-Regular.ttf", "Sarabun-Bold.ttf"].map((f) =>
  path.join(process.cwd(), "assets", "fonts", f)
);

/** Explicit font files only: scanning system fonts costs over a second per render. */
export class ResvgRasterizer implements IBoardRasterizer {
  async rasterize(svg: string) {
    const rendered = await renderAsync(svg, {
      font: {
        loadSystemFonts: false,
        fontFiles: FONT_FILES,
        defaultFontFamily: FONT_FAMILY,
      },
      fitTo: { mode: "original" },
    });
    return rendered.asPng();
  }
}
