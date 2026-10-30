import { describe, expect, it } from "bun:test";

import type { SceneElement } from "../entities/SceneElement";
import { buildSceneSvg } from "./sceneSvg";

const rect = (extra: Partial<SceneElement> = {}): SceneElement => ({
  id: "r1",
  type: "rectangle",
  x: 100,
  y: 200,
  width: 200,
  height: 100,
  version: 1,
  versionNonce: 1,
  ...extra,
});

const build = (elements: SceneElement[], maxSize?: number) => {
  const scene = buildSceneSvg(elements, new Map(), maxSize);
  if (!scene) {
    throw new Error("expected a scene");
  }
  return scene;
};

describe("buildSceneSvg", () => {
  it("draws nothing for an empty or fully deleted page", () => {
    expect(buildSceneSvg([], new Map())).toBeNull();
    expect(buildSceneSvg([rect({ isDeleted: true })], new Map())).toBeNull();
  });

  it("fits the content bounds plus padding and scales the long side to maxSize", () => {
    const scene = build([rect()], 800);
    expect(scene.bounds).toEqual({ x: 100, y: 200, width: 200, height: 100 });
    expect(scene.width).toBe(800);
    expect(scene.height).toBe(Math.round((800 * 180) / 280));
    expect(scene.svg).toContain('viewBox="60 160 280 180"');
  });

  it("clamps maxSize into 256..4096", () => {
    expect(build([rect()], 10).width).toBe(256);
    expect(build([rect()], 99_999).width).toBeLessThanOrEqual(4096);
  });

  it("places a label inside its container, centered", () => {
    const label: SceneElement = {
      id: "t1",
      type: "text",
      containerId: "r1",
      text: "Hi",
      textAlign: "center",
      verticalAlign: "middle",
      fontSize: 20,
      x: 0,
      y: 0,
      version: 1,
      versionNonce: 1,
    };
    const { svg } = build([rect(), label]);
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('<tspan x="200" y="250">Hi</tspan>');
  });

  it("escapes text so it cannot inject markup", () => {
    const text: SceneElement = {
      id: "t1",
      type: "text",
      text: `<script>&"`,
      x: 0,
      y: 0,
      width: 50,
      height: 25,
      version: 1,
      versionNonce: 1,
    };
    const { svg } = build([text]);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&#60;script&#62;&#38;&#34;");
  });

  it("draws an arrowhead at the end of an arrow and none on a line", () => {
    const connector = (type: string): SceneElement => ({
      id: "a1",
      type,
      x: 0,
      y: 0,
      width: 100,
      height: 0,
      points: [
        [0, 0],
        [100, 0],
      ],
      endArrowhead: "triangle",
      version: 1,
      versionNonce: 1,
    });
    expect(build([connector("arrow")]).svg).toContain("<polygon");
    expect(build([connector("line")]).svg).not.toContain("<polygon");
  });

  it("draws no arrowhead for an explicit null and the default head when the field is absent", () => {
    const arrow = (extra: Partial<SceneElement>): SceneElement => ({
      id: "a1",
      type: "arrow",
      x: 0,
      y: 0,
      width: 100,
      height: 0,
      points: [
        [0, 0],
        [100, 0],
      ],
      version: 1,
      versionNonce: 1,
      ...extra,
    });
    expect(build([arrow({ endArrowhead: null })]).svg).not.toContain(
      "<polyline points"
    );
    expect(build([arrow({})]).svg).toContain("<polyline points");
  });

  it("draws an arrow's label at its own box, on the arrow's midpoint", () => {
    const arrow: SceneElement = {
      id: "a1",
      type: "arrow",
      x: 0,
      y: 0,
      width: 200,
      height: 0,
      points: [
        [0, 0],
        [200, 0],
      ],
      version: 1,
      versionNonce: 1,
    };
    const label: SceneElement = {
      id: "t1",
      type: "text",
      containerId: "a1",
      text: "go",
      textAlign: "center",
      verticalAlign: "middle",
      x: 90,
      y: -12.5,
      width: 20,
      height: 25,
      version: 1,
      versionNonce: 1,
    };
    expect(build([arrow, label]).svg).toContain(
      '<tspan x="100" y="0">go</tspan>'
    );
  });

  it("hides the line behind an arrow's label with a backdrop, and gives a box label none", () => {
    const arrow: SceneElement = {
      id: "a1",
      type: "arrow",
      x: 0,
      y: 0,
      width: 200,
      height: 0,
      points: [
        [0, 0],
        [200, 0],
      ],
      version: 1,
      versionNonce: 1,
    };
    const label = (containerId: string): SceneElement => ({
      id: "t1",
      type: "text",
      containerId,
      text: "go",
      textAlign: "center",
      verticalAlign: "middle",
      x: 90,
      y: -12.5,
      width: 20,
      height: 25,
      version: 1,
      versionNonce: 1,
    });
    const { svg } = build([arrow, label("a1")]);
    const backdrop =
      '<rect x="86" y="-16.5" width="28" height="33" fill="#ffffff"/>';
    expect(svg).toContain(backdrop);
    expect(svg.indexOf(backdrop)).toBeLessThan(svg.indexOf("<text "));
    expect(build([rect(), label("r1")]).svg.match(/<rect/gu)).toHaveLength(2);
  });

  it("rotates around the element center and grows the bounds to fit", () => {
    const scene = build([rect({ angle: Math.PI / 2 })]);
    expect(scene.svg).toContain('transform="rotate(90 200 250)"');
    expect(scene.bounds.width).toBeCloseTo(100);
    expect(scene.bounds.height).toBeCloseTo(200);
  });

  it("draws a placeholder for an image whose bytes are missing", () => {
    const image: SceneElement = {
      ...rect({ id: "i1", type: "image" }),
      fileId: "gone",
    };
    const { svg } = build([image]);
    expect(svg).not.toContain("<image");
    expect(svg).toContain("stroke-dasharray");
  });
});
