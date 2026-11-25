import { describe, expect, it } from "bun:test";

import { ArtifactElement } from "./artifact-element";

const identity = { id: "a1", seed: 7, versionNonce: 9, updated: 1000 };
const built = () =>
  ArtifactElement.buildArtifact(
    {
      x: 10,
      y: 20,
      width: 640,
      height: 480,
      fileId: "f1",
      format: "markdown",
      name: "notes.md",
    },
    identity
  );

describe("ArtifactElement", () => {
  it("builds an iframe whose only file reference is the top-level fileId", () => {
    const element = built();
    expect(element).toMatchObject({
      id: "a1",
      type: "iframe",
      fileId: "f1",
      frameId: null,
      x: 10,
      y: 20,
      width: 640,
      height: 480,
    });
    expect(element.rest.customData).toEqual({
      artifact: { format: "markdown", name: "notes.md" },
    });
  });

  it("reads the artifact back, and nothing from other iframes", () => {
    expect(ArtifactElement.infoOf(built())).toEqual({
      format: "markdown",
      name: "notes.md",
    });
    const magic = { ...built(), rest: { customData: { generationData: {} } } };
    expect(ArtifactElement.infoOf(magic)).toBeNull();
    expect(ArtifactElement.infoOf({ ...built(), fileId: null })).toBeNull();
  });
});
