import { describe, expect, it } from "bun:test";

import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { DeleteDrawing } from "./DeleteDrawing";
import type { DeleteDrawingTx } from "./DeleteDrawing";
import { FakeScenes } from "./fakes";

const deletedEvent = {
  type: "event.board-deleted" as const,
  version: 1 as const,
  boardId: "b1",
  ownerId: "owner",
};

const setup = () => {
  const rows: string[] = [];
  const prefixes: string[] = [];
  const seen = new Set<string>();
  const tx: DeleteDrawingTx = {
    drawings: {
      deleteAll: (boardId) => {
        rows.push(boardId);
        return Promise.resolve();
      },
    },
    processed: {
      claim: (consumer, id) => {
        const fresh = !seen.has(`${consumer}:${id}`);
        seen.add(`${consumer}:${id}`);
        return Promise.resolve(fresh);
      },
    },
  };
  const uow: IUnitOfWork<DeleteDrawingTx> = { run: (work) => work(tx) };
  const scenes = new FakeScenes();
  const storage = {
    deletePrefix: (prefix: string) => {
      prefixes.push(prefix);
      return Promise.resolve();
    },
  } as unknown as IFileStorage;
  return {
    rows,
    prefixes,
    seen,
    scenes,
    deleteDrawing: new DeleteDrawing(uow, scenes, storage),
  };
};

describe("DeleteDrawing", () => {
  it("drops the rows, the live room and the stored files once per event, under its own consumer name", async () => {
    const { rows, prefixes, seen, scenes, deleteDrawing } = setup();
    await deleteDrawing.execute("e1", deletedEvent);
    await deleteDrawing.execute("e1", deletedEvent);
    expect(rows).toEqual(["b1"]);
    expect(scenes.discarded).toEqual(["b1"]);
    expect(prefixes).toEqual(["boards/b1/"]);
    expect([...seen]).toEqual(["drawing:e1"]);
  });
});
