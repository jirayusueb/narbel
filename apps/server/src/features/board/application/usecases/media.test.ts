import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import { MAX_INLINE_IMAGE_BYTES } from "../../domain/rules/UploadRules";
import type { IBoardFileRepository } from "../ports/IBoardFileRepository";
import { AddBoardElements } from "./AddBoardElements";
import { AddBoardImage } from "./AddBoardImage";
import { DeleteBoardElements } from "./DeleteBoardElements";
import { ExportBoardScene } from "./ExportBoardScene";
import { ids, setupAccess } from "./fakes";
import type { FakeScenes } from "./fakes";
import { RenderBoardImage } from "./RenderBoardImage";
import { UpdateBoardElement } from "./UpdateBoardElement";

const actor = { userId: "owner" };

const be32 = (n: number) => {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(n);
  return [...out];
};
export const png = (width: number, height: number, pad = 0) =>
  Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...be32(13),
    0x49,
    0x48,
    0x44,
    0x52,
    ...be32(width),
    ...be32(height),
    8,
    6,
    0,
    0,
    0,
    ...Array.from({ length: pad }, () => 0),
  ]);

const setup = () => {
  const base = setupAccess();
  const stored = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  const rows = new Map<
    string,
    { id: string; mimeType: string; size: number }
  >();
  const deleting = new Set<string>();
  const files: IBoardFileRepository = {
    findById: (b, f) => Promise.resolve(rows.get(`${b}/${f}`) ?? null),
    save: (b, f) => {
      if (deleting.has(`${b}/${f.id}`)) {
        return Promise.resolve(false);
      }
      rows.set(`${b}/${f.id}`, f);
      return Promise.resolve(true);
    },
  };
  const storage: IFileStorage = {
    presignUpload: () => "",
    put: (key, bytes, mimeType) => {
      stored.set(key, { bytes, mimeType });
      return Promise.resolve();
    },
    stream: (key) =>
      new ReadableStream({
        start(c) {
          c.enqueue(stored.get(key)?.bytes);
          c.close();
        },
      }),
    stat: (key) => {
      const s = stored.get(key);
      return Promise.resolve(
        s ? { size: s.bytes.length, type: s.mimeType } : null
      );
    },
    delete: () => Promise.resolve(),
    deletePrefix: () => Promise.resolve(),
  };
  return {
    ...base,
    stored,
    rows,
    deleting,
    add: new AddBoardImage(base.guard, base.scenes, files, storage, ids),
    exportScene: new ExportBoardScene(base.guard, base.scenes, files, storage),
    render: new RenderBoardImage(base.guard, base.scenes, files, storage, {
      rasterize: (svg) => Promise.resolve(new TextEncoder().encode(svg)),
    }),
  };
};

const reindex = (scenes: FakeScenes, id: string, index: string) => {
  const key = `page:main:${id}`;
  const element = scenes.elements.get(key);
  if (element) {
    scenes.elements.set(key, { ...element, index });
  }
};

describe("AddBoardImage", () => {
  it("stores the bytes under their SHA-1, registers the file and places the element", async () => {
    const t = setup();
    const bytes = png(3, 2);
    const sha1 = createHash("sha1").update(bytes).digest("hex");
    const result = await t.add.execute({ actor, boardId: "b1", bytes });
    expect(result.isOk() && result.value).toMatchObject({
      fileId: sha1,
      width: 3,
      height: 2,
    });
    expect([...t.stored.keys()]).toEqual([`boards/b1/${sha1}`]);
    expect(t.stored.get(`boards/b1/${sha1}`)?.mimeType).toBe("image/png");
    expect(t.rows.get(`b1/${sha1}`)).toEqual({
      id: sha1,
      mimeType: "image/png",
      size: bytes.length,
    });
    expect(t.scenes.files.get(sha1)?.mimeType).toBe("image/png");
    const [element] = [...t.scenes.elements.values()];
    expect(element).toMatchObject({
      type: "image",
      fileId: sha1,
      status: "saved",
      scale: [1, 1],
      width: 3,
      height: 2,
      x: 0,
      y: 0,
    });
  });

  it("stores the same bytes once and gives the same fileId", async () => {
    const t = setup();
    const a = await t.add.execute({ actor, boardId: "b1", bytes: png(3, 2) });
    const b = await t.add.execute({ actor, boardId: "b1", bytes: png(3, 2) });
    expect(a.isOk() && b.isOk() && a.value.fileId === b.value.fileId).toBe(
      true
    );
    expect(t.stored.size).toBe(1);
    expect(t.scenes.files.size).toBe(1);
    expect(t.scenes.elements.size).toBe(2);
  });

  it("sizes by natural size capped at 800, or by the one side given", async () => {
    const t = setup();
    const big = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(1600, 400),
    });
    expect(big.isOk() && big.value).toMatchObject({ width: 800, height: 200 });
    const byWidth = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(100, 50),
      width: 300,
    });
    expect(byWidth.isOk() && byWidth.value).toMatchObject({
      width: 300,
      height: 150,
    });
    const both = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(100, 50),
      width: 10,
      height: 90,
    });
    expect(both.isOk() && both.value).toMatchObject({ width: 10, height: 90 });
  });

  it("places an unplaced image to the right of the page content", async () => {
    const t = setup();
    await new AddBoardElements(t.guard, t.scenes, ids).execute({
      actor,
      boardId: "b1",
      shapes: [{ type: "rectangle", x: 10, y: 40, width: 100, height: 100 }],
    });
    await t.add.execute({ actor, boardId: "b1", bytes: png(3, 2), id: "img" });
    expect(t.scenes.elements.get("page:main:img")).toMatchObject({
      x: 230,
      y: 40,
    });
  });

  it("refuses an image the cleanup job is deleting before writing any byte or element", async () => {
    const t = setup();
    const bytes = png(3, 2);
    const sha1 = createHash("sha1").update(bytes).digest("hex");
    t.deleting.add(`b1/${sha1}`);
    const result = await t.add.execute({ actor, boardId: "b1", bytes });
    expect(result.isErr() && result.error.code).toBe("Conflict");
    expect(t.stored.size).toBe(0);
    expect(t.rows.size).toBe(0);
    expect(t.scenes.elements.size).toBe(0);
  });

  it("rejects over-cap data before touching storage", async () => {
    const t = setup();
    const result = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(3, 2, MAX_INLINE_IMAGE_BYTES),
    });
    expect(result.isErr() && result.error.code).toBe("PayloadTooLarge");
    expect(t.stored.size).toBe(0);
    expect(t.rows.size).toBe(0);
  });

  it("rejects bytes that are not an image, a taken id and a frameId that is not a frame", async () => {
    const t = setup();
    const junk = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: Uint8Array.of(1, 2, 3),
    });
    expect(junk.isErr() && junk.error.code).toBe("UnsupportedMediaType");
    expect(t.stored.size).toBe(0);
    await t.add.execute({ actor, boardId: "b1", bytes: png(3, 2), id: "img" });
    const taken = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(3, 2),
      id: "img",
    });
    expect(taken.isErr() && taken.error.code).toBe("ValidationFailed");
    const noFrame = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(3, 2),
      frameId: "img",
    });
    expect(noFrame.isErr() && noFrame.error.code).toBe("ValidationFailed");
  });

  it("places an image without x/y inside its frame, after the children, and grows the frame", async () => {
    const t = setup();
    await new AddBoardElements(t.guard, t.scenes, ids).execute({
      actor,
      boardId: "b1",
      shapes: [
        {
          id: "f",
          type: "frame",
          name: "F",
          x: 0,
          y: 0,
          width: 300,
          height: 200,
        },
        {
          id: "c",
          type: "rectangle",
          x: 40,
          y: 40,
          width: 100,
          height: 100,
          frameId: "f",
        },
        { id: "far", type: "rectangle", x: 5000, y: 0, width: 10, height: 10 },
      ],
    });
    const before = t.scenes.elements.get("page:main:f")?.version ?? 0;
    const result = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(200, 100),
      id: "img",
      frameId: "f",
    });
    expect(result.isOk()).toBe(true);
    expect(t.scenes.elements.get("page:main:img")).toMatchObject({
      x: 180,
      y: 40,
      frameId: "f",
    });
    const frame = t.scenes.elements.get("page:main:f");
    expect(frame).toMatchObject({ x: 0, y: 0, width: 420, height: 200 });
    expect(Number(frame?.version)).toBeGreaterThan(Number(before));
  });

  it("keeps an explicit x/y inside a frame", async () => {
    const t = setup();
    await new AddBoardElements(t.guard, t.scenes, ids).execute({
      actor,
      boardId: "b1",
      shapes: [
        {
          id: "f",
          type: "frame",
          name: "F",
          x: 0,
          y: 0,
          width: 300,
          height: 200,
        },
      ],
    });
    await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(20, 10),
      id: "img",
      frameId: "f",
      x: 7,
      y: 9,
    });
    expect(t.scenes.elements.get("page:main:img")).toMatchObject({
      x: 7,
      y: 9,
    });
    expect(t.scenes.elements.get("page:main:f")?.width).toBe(300);
  });

  it("refuses a reader", async () => {
    const t = setup();
    const result = await t.add.execute({
      actor: { userId: "stranger" },
      boardId: "b1",
      bytes: png(3, 2),
    });
    expect(result.isErr()).toBe(true);
    expect(t.stored.size).toBe(0);
  });

  it("writes nothing to storage when the page, the id or the frame is refused", async () => {
    const t = setup();
    const noPage = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(3, 2),
      pageId: "nope",
    });
    expect(noPage.isErr()).toBe(true);
    const noFrame = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(3, 4),
      frameId: "nope",
    });
    expect(noFrame.isErr()).toBe(true);
    expect(t.stored.size).toBe(0);
    expect(t.rows.size).toBe(0);
    expect(t.scenes.files.size).toBe(0);
  });

  it("refuses a deleted frame", async () => {
    const t = setup();
    await new AddBoardElements(t.guard, t.scenes, ids).execute({
      actor,
      boardId: "b1",
      shapes: [{ id: "f", type: "frame", x: 0, y: 0, width: 300, height: 200 }],
    });
    await new DeleteBoardElements(t.guard, t.scenes, ids).execute({
      actor,
      boardId: "b1",
      ids: ["f"],
    });
    const result = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(3, 2),
      frameId: "f",
    });
    expect(result.isErr()).toBe(true);
    expect(t.scenes.elements.get("page:main:f")?.isDeleted).toBe(true);
    expect(t.stored.size).toBe(0);
  });

  it("leaves the object of a file that is already registered alone", async () => {
    const t = setup();
    const bytes = png(3, 2);
    const sha1 = createHash("sha1").update(bytes).digest("hex");
    const key = `boards/b1/${sha1}`;
    const browserCopy = Uint8Array.of(1, 2, 3);
    t.stored.set(key, { bytes: browserCopy, mimeType: "image/png" });
    t.rows.set(`b1/${sha1}`, { id: sha1, mimeType: "image/png", size: 3 });
    await t.add.execute({ actor, boardId: "b1", bytes });
    expect(t.stored.get(key)?.bytes).toBe(browserCopy);
    expect(t.rows.get(`b1/${sha1}`)?.size).toBe(3);
    expect(t.scenes.files.has(sha1)).toBe(true);
  });

  it("does not grow a locked frame", async () => {
    const t = setup();
    await new AddBoardElements(t.guard, t.scenes, ids).execute({
      actor,
      boardId: "b1",
      shapes: [
        { id: "f", type: "frame", x: 0, y: 0, width: 300, height: 200 },
        {
          id: "c",
          type: "rectangle",
          x: 40,
          y: 40,
          width: 100,
          height: 100,
          frameId: "f",
        },
      ],
    });
    await new UpdateBoardElement(t.guard, t.scenes, ids).execute({
      actor,
      boardId: "b1",
      id: "f",
      patch: { locked: true },
    });
    const before = t.scenes.elements.get("page:main:f");
    await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(200, 100),
      id: "img",
      frameId: "f",
    });
    expect(t.scenes.elements.get("page:main:f")).toBe(before);
  });

  it("drops frameId when an explicit x/y puts the image outside the frame", async () => {
    const t = setup();
    await new AddBoardElements(t.guard, t.scenes, ids).execute({
      actor,
      boardId: "b1",
      shapes: [{ id: "f", type: "frame", x: 0, y: 0, width: 300, height: 200 }],
    });
    await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(20, 10),
      id: "img",
      frameId: "f",
      x: 5000,
      y: 5000,
    });
    expect(t.scenes.elements.get("page:main:img")?.frameId).toBeNull();
  });

  it("rejects an image that declares more than 16 million pixels", async () => {
    const t = setup();
    const bomb = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(5000, 5000),
    });
    expect(bomb.isErr() && bomb.error.code).toBe("ValidationFailed");
    expect(t.stored.size).toBe(0);
    const edge = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(4000, 4000),
    });
    expect(edge.isOk()).toBe(true);
  });
});

describe("ExportBoardScene", () => {
  it("exports live elements in z-order with labels, and files only on request", async () => {
    const t = setup();
    await new AddBoardElements(t.guard, t.scenes, ids).execute({
      actor,
      boardId: "b1",
      shapes: [
        { type: "rectangle", x: 0, y: 0, text: "hi", id: "a" },
        { type: "ellipse", x: 0, y: 0, id: "gone" },
      ],
    });
    const gone = t.scenes.elements.get("page:main:gone");
    if (gone) {
      t.scenes.elements.set("page:main:gone", {
        ...gone,
        isDeleted: true,
        version: 2,
      });
    }
    await t.add.execute({ actor, boardId: "b1", bytes: png(3, 2), id: "img" });
    reindex(t.scenes, "a", "a1");
    reindex(t.scenes, "img", "a0");

    const plain = await t.exportScene.execute({ actor, boardId: "b1" });
    const doc = plain.isOk() ? plain.value : undefined;
    expect(doc).toMatchObject({
      type: "excalidraw",
      version: 2,
      source: "narbel",
      files: {},
    });
    expect(doc?.elements.slice(0, 2).map((e) => e.id)).toEqual(["img", "a"]);
    expect(doc?.elements).toHaveLength(3);
    expect(doc?.elements[2]).toMatchObject({ type: "text", containerId: "a" });
    expect(doc?.elements.some((e) => e.id === "gone")).toBe(false);

    const full = await t.exportScene.execute({
      actor,
      boardId: "b1",
      includeFiles: true,
    });
    const files = full.isOk() ? Object.values(full.value.files) : [];
    expect(files).toHaveLength(1);
    expect(files[0]?.dataURL).toStartWith("data:image/png;base64,");
  });

  it("embeds at most 8 MiB of files and names the ones it left out", async () => {
    const t = setup();
    const added = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(3, 2),
    });
    const fileId = added.isOk() ? added.value.fileId : "";
    const key = `boards/b1/${fileId}`;
    t.stored.set(key, {
      bytes: new Uint8Array(9 * 1024 * 1024),
      mimeType: "image/png",
    });
    const full = await t.exportScene.execute({
      actor,
      boardId: "b1",
      includeFiles: true,
    });
    expect(full.isOk() && full.value.files).toEqual({});
    expect(full.isOk() && full.value.omittedFiles).toEqual([fileId]);
    const plain = await t.exportScene.execute({ actor, boardId: "b1" });
    expect(plain.isOk() && plain.value.omittedFiles).toEqual([]);
  });
});

describe("images declared over the pixel limit", () => {
  const uploadOversized = async () => {
    const t = setup();
    const small = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(3, 2),
      id: "small",
    });
    const big = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(4, 2),
      id: "big",
    });
    const smallId = small.isOk() ? small.value.fileId : "";
    const bigId = big.isOk() ? big.value.fileId : "";
    // the presigned PUT path stores whatever the browser sends
    t.stored.set(`boards/b1/${bigId}`, {
      bytes: png(5000, 5000),
      mimeType: "image/png",
    });
    return { t, smallId, bigId };
  };

  it("get_board_image leaves them out of the picture and lists them", async () => {
    const { t, bigId } = await uploadOversized();
    const result = await t.render.execute({ actor, boardId: "b1" });
    const value = result.isOk() ? result.value : undefined;
    expect(value?.omittedFiles).toEqual([bigId]);
    const svg = new TextDecoder().decode(value?.image?.png);
    expect(svg).toContain("data:image/png;base64,");
    expect(svg.match(/data:image\/png/gu)).toHaveLength(1);
  });

  it("export_scene omits them from files", async () => {
    const { t, smallId, bigId } = await uploadOversized();
    const result = await t.exportScene.execute({
      actor,
      boardId: "b1",
      includeFiles: true,
    });
    expect(result.isOk() && Object.keys(result.value.files)).toEqual([smallId]);
    expect(result.isOk() && result.value.omittedFiles).toEqual([bigId]);
  });
});

describe("JPEGs whose size marker sits behind large segments", () => {
  // SOI, `segments` APP1 segments of 60000 bytes, then a SOF0 declaring 3x2
  const jpegAfter = (segments: number) =>
    Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      ...Array.from({ length: segments }, () =>
        Buffer.concat([
          Buffer.from([0xff, 0xe1, 0xea, 0x60]),
          Buffer.alloc(60_000 - 2),
        ])
      ),
      Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x03]),
      Buffer.from([0x01, 0x01, 0x11, 0x00]),
    ]);
  const render = async (bytes: Uint8Array) => {
    const t = setup();
    const added = await t.add.execute({
      actor,
      boardId: "b1",
      bytes: png(3, 2),
      id: "photo",
    });
    const fileId = added.isOk() ? added.value.fileId : "";
    t.stored.set(`boards/b1/${fileId}`, { bytes, mimeType: "image/jpeg" });
    const result = await t.render.execute({ actor, boardId: "b1" });
    return { fileId, omitted: result.isOk() ? result.value.omittedFiles : [] };
  };

  it("keeps one whose SOF is past the first 64 KiB", async () => {
    const { omitted } = await render(jpegAfter(2));
    expect(omitted).toEqual([]);
  });

  it("drops one still unresolved at the 1 MiB cap", async () => {
    const { fileId, omitted } = await render(jpegAfter(20));
    expect(omitted).toEqual([fileId]);
  });
});
