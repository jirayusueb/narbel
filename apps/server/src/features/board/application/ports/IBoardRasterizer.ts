export interface IBoardRasterizer {
  /** Renders a standalone SVG document to PNG bytes at the SVG's own pixel size. */
  rasterize(svg: string): Promise<Uint8Array>;
}
