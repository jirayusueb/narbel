// Measures what opening a board costs the server: the HTTP requests the editor fires and the
// WebSocket sync handshake, cold (first peer loads the doc) and warm (room already loaded).
// Fixtures are seeded straight into board_document so their size is controlled.
//
//   cd apps/server && bun scripts/profile-board-open.ts [runs=20]
//
// Env: API (default http://localhost:3000), EMAIL/PASSWORD (default demo account), DATABASE_URL.
import {
  FIXTURES,
  db,
  ensureFixture,
  get,
  signIn,
  stats,
  syncOnce,
  time,
} from "./perf-kit";

const RUNS = Number(process.argv[2] ?? 20);

const cookie = await signIn();
const rows: Record<string, unknown>[] = [];
for (const f of FIXTURES) {
  const { id, bytes } = await ensureFixture(cookie, f);
  const series: Record<string, number[]> = {};
  const add = (k: string, v: number) => (series[k] ??= []).push(v);
  await syncOnce(cookie, id);
  for (let r = 0; r < RUNS; r += 1) {
    // the room unloads once its last peer leaves and the persist debounce settles
    await Bun.sleep(1200);
    add("board GET", await time(get(cookie, `/api/boards/${id}`)));
    const fanOut = performance.now();
    const [me, members, comments, unread, ws] = await Promise.all([
      time(get(cookie, "/api/me")),
      time(get(cookie, `/api/boards/${id}/members`)),
      time(
        get(
          cookie,
          `/api/boards/${id}/comments?status=open&limit=100&pageId=page:main`
        )
      ),
      time(get(cookie, "/api/notifications?limit=1")),
      syncOnce(cookie, id).then((x) => x.ms),
    ]);
    add("editor fan-out (wall)", performance.now() - fanOut);
    add("me", me);
    add("members", members);
    add("comments", comments);
    add("unread", unread);
    add("ws sync cold", ws);
  }
  const holder = await syncOnce(cookie, id, true);
  for (let r = 0; r < RUNS; r += 1) {
    const warm = await syncOnce(cookie, id);
    add("ws sync warm", warm.ms);
  }
  holder.ws.close();
  for (const [k, v] of Object.entries(series)) {
    rows.push({
      fixture: `${f.title} (${f.pages * f.perPage} el, ${(bytes / 1024).toFixed(0)} KB)`,
      step: k,
      ...stats(v),
    });
  }
}
console.table(rows);
await db.close();
