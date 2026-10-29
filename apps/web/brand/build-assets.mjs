import fs from "node:fs";
// Generates logo.svg, logo-mark.svg, favicon.svg into ../public. See README.md.
import { createRequire } from "node:module";
import path from "node:path";

const here = import.meta.dirname;
const require = createRequire(
  path.join(process.env.FONTKIT_DIR ?? "/tmp/fk", "x.js")
);
const fontkit = require("fontkit");
const font = fontkit.openSync(
  path.resolve(
    here,
    "../../../node_modules/.bun/@fontsource-variable+roboto-serif@5.3.0/node_modules/@fontsource-variable/roboto-serif/files/roboto-serif-latin-wght-normal.woff2"
  )
);
const CITRUS = "#ddec61";
const INK = "#080808";

// Mark geometry mirrors src/shared/ui/brand.tsx.
const arch = "M7 27V15.5a8.5 8.5 0 0 1 17 0V27";
const mark = (c) =>
  `<path d="${arch}" stroke="${c}" stroke-width="5" stroke-linecap="round"/><circle cx="26.5" cy="5.5" r="3.75" fill="${c}"/>`;

// Wordmark outlines at default wght 400, tracking -0.04em, y flipped.
const ids = font.layout("narbel").glyphs.map((g) => g.id);
let cx = 0;
let d = "";
for (const id of ids) {
  const g = font.getGlyph(id);
  d += g.path.translate(cx, 0).toSVG();
  cx += g.advanceWidth - 0.04 * font.unitsPerEm;
}
const wordW = cx + 0.04 * font.unitsPerEm;
// Font units to px: the x-height lands near 18.6px beside a 32px mark.
const s = 0.036;
// Baseline sits on the bottom of the pen stroke.
const baseline = 29.5;
const gap = 10;
const wx = 32 + gap;
const wordmark = `<path transform="translate(${wx} ${baseline}) scale(${s} ${-s})" d="${d}" fill="${INK}"/>`;
const w = Math.ceil(wx + wordW * s + 1);

const write = (f, body) =>
  fs.writeFileSync(path.resolve(here, "../public", f), body);
write(
  "logo-mark.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">${mark(INK)}</svg>\n`
);
write(
  "logo.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -2 ${w + 2} 35" fill="none" role="img" aria-label="narbel">${mark(INK)}${wordmark}</svg>\n`
);
// Mark bbox 4.5..30.25 x 1.75..29.5 centred on a 32 tile at 0.7 scale.
const k = 0.7;
const tx = (32 - 25.75 * k) / 2 - 4.5 * k;
const ty = (32 - 27.75 * k) / 2 - 1.75 * k;
write(
  "favicon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="7" fill="${CITRUS}"/><g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${k})">${mark(INK)}</g></svg>\n`
);
console.log("ok", w);
