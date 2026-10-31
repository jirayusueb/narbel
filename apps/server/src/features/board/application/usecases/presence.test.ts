import { describe, expect, it } from "bun:test";

import type { IBoardPresence, Viewer } from "../ports/IBoardPresence";
import type { IBoardSyncGateway } from "../ports/IBoardSyncGateway";
import { ConnectBoardSync, TOUCH_INTERVAL_MS } from "./ConnectBoardSync";
import { setupAccess } from "./fakes";
import { ListBoardViewers } from "./ListBoardViewers";

class FakePresence implements IBoardPresence {
  readonly calls: string[] = [];
  readonly open = new Map<string, Viewer>();
  join(_: string, id: string, viewer: Viewer) {
    this.calls.push("join");
    this.open.set(id, viewer);
    return Promise.resolve();
  }
  leave(_: string, id: string) {
    this.calls.push("leave");
    this.open.delete(id);
    return Promise.resolve();
  }
  list = () => Promise.resolve([...this.open.values()]);
  countStrict = () => Promise.resolve(this.open.size);
}

const gateway: IBoardSyncGateway = {
  connect: () => Promise.resolve({ receive: () => {}, close: () => {} }),
};
const peer = { send: () => {}, close: () => {} };

describe("board presence", () => {
  it("refreshes at most once per interval and leaves on close", async () => {
    const { guard } = setupAccess();
    const presence = new FakePresence();
    let now = 0;
    const connect = new ConnectBoardSync(guard, gateway, presence, () => now);
    const result = await connect.execute({
      actor: { userId: "owner", name: "Olive" },
      boardId: "b1",
      peer,
    });
    const session = result.isOk() ? result.value : undefined;
    if (!session) {
      throw new Error("expected a session");
    }

    now = TOUCH_INTERVAL_MS - 1;
    session.receive(new Uint8Array());
    now = TOUCH_INTERVAL_MS;
    session.receive(new Uint8Array());
    session.receive(new Uint8Array());
    session.close();

    expect(presence.calls).toEqual(["join", "join", "leave"]);
    expect(presence.open.size).toBe(0);
  });

  it("does not join a viewer the guard rejects", async () => {
    const { guard } = setupAccess();
    const presence = new FakePresence();
    const result = await new ConnectBoardSync(guard, gateway, presence).execute(
      { actor: { userId: "stranger" }, boardId: "b1", peer }
    );
    expect(result.isErr()).toBe(true);
    expect(presence.calls).toEqual([]);
  });

  it("dedupes by user, counts anonymous viewers, and guards like get_board", async () => {
    const { guard } = setupAccess();
    const presence = new FakePresence();
    await presence.join("b1", "c1", { userId: "owner", name: "Olive" });
    await presence.join("b1", "c2", { userId: "owner", name: "Olive" });
    await presence.join("b1", "c3", { userId: null, name: null });
    await presence.join("b1", "c4", { userId: null, name: null });
    const list = new ListBoardViewers(guard, presence);

    const ok = await list.execute({
      actor: { userId: "owner" },
      boardId: "b1",
    });
    expect(ok.isOk() && ok.value).toEqual({
      viewers: [{ userId: "owner", name: "Olive" }],
      anonymous: 2,
    });

    const denied = await list.execute({
      actor: { userId: "stranger" },
      boardId: "b1",
    });
    expect(denied.isErr() && denied.error.code).toBe("NotFound");
  });
});
