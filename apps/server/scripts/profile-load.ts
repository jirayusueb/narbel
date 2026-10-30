import { deflateRawSync } from "node:zlib";

// What the server costs under load, per scenario: Postgres transactions, rows touched and WAL bytes,
// Redis publishes, API CPU time, socket messages and MCP latency. Run it against an API with its own
// Postgres and Redis so nothing else moves the counters:
//
//   cd apps/server && API=http://localhost:3600 API_PID=<pid> ORIGIN=http://localhost:3605 \
//     DATABASE_URL=postgresql://postgres:perf@localhost:5433/narbel REDIS_CONTAINER=narbel-perf-redis \
//     bun scripts/profile-load.ts > /tmp/profile-load.json
import { $ } from "bun";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

import { API, FIXTURES, db, ensureFixture, signIn, stats } from "./perf-kit";

const API_PID = process.env.API_PID ?? "";
const ORIGIN = process.env.ORIGIN ?? "";
const REDIS = process.env.REDIS_CONTAINER ?? "";
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const cpuSeconds = async () => {
  const out = (await $`ps -p ${API_PID} -o time=`.text()).trim();
  const [m, s] = out.split(":").map(Number);
  return (m ?? 0) * 60 + (s ?? 0);
};

const publishes = async () => {
  const info = await $`docker exec ${REDIS} redis-cli info commandstats`.text();
  return Number(
    /cmdstat_publish:calls=(?<calls>\d+)/u.exec(info)?.groups?.calls ?? 0
  );
};

const dbCounters = async () => {
  const [row] =
    await db`select xact_commit + xact_rollback as xacts, tup_inserted as ins,
    tup_updated as upd, tup_deleted as del, pg_current_wal_lsn()::text as lsn
    from pg_stat_database where datname = current_database()`;
  return row as {
    xacts: number;
    ins: number;
    upd: number;
    del: number;
    lsn: string;
  };
};

// Counters are flushed lazily by backends; settle before and after so the window holds the work.
const measure = async (label: string, work: () => Promise<unknown>) => {
  await Bun.sleep(1500);
  const [c0, p0, cpu0] = await Promise.all([
    dbCounters(),
    publishes(),
    cpuSeconds(),
  ]);
  const t = performance.now();
  const extra = ((await work()) ?? {}) as Record<string, unknown>;
  const wallMs = performance.now() - t;
  await Bun.sleep(2500);
  const [c1, p1, cpu1] = await Promise.all([
    dbCounters(),
    publishes(),
    cpuSeconds(),
  ]);
  const [wal] =
    await db`select pg_wal_lsn_diff(${c1.lsn}, ${c0.lsn})::bigint as bytes`;
  return {
    scenario: label,
    wallS: +(wallMs / 1000).toFixed(1),
    // the counter reads themselves are 2 transactions per sample
    xacts: Number(c1.xacts) - Number(c0.xacts) - 2,
    rowsIns: Number(c1.ins) - Number(c0.ins),
    rowsUpd: Number(c1.upd) - Number(c0.upd),
    rowsDel: Number(c1.del) - Number(c0.del),
    walKB: Math.round(Number(wal.bytes) / 1024),
    redisPublishes: p1 - p0,
    apiCpuS: +(cpu1 - cpu0).toFixed(2),
    ...extra,
  };
};

// A synced peer: applies the server's state, then sends its own updates and awareness.
const peer = async (cookie: string, boardId: string) => {
  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const ws = new WebSocket(
    `${API.replace(/^http/u, "ws")}/api/boards/sync/${boardId}`,
    {
      headers: { cookie },
    } as unknown as string[]
  );
  ws.binaryType = "arraybuffer";
  const received = { messages: 0, bytes: 0 };
  const synced = Promise.withResolvers<number>();
  const send = (type: number, write: (e: encoding.Encoder) => void) => {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, type);
    write(e);
    ws.send(encoding.toUint8Array(e));
  };
  ws.addEventListener("open", () =>
    send(MESSAGE_SYNC, (e) => syncProtocol.writeSyncStep1(e, doc))
  );
  ws.addEventListener("message", (event) => {
    const bytes = new Uint8Array(event.data as ArrayBuffer);
    received.messages += 1;
    received.bytes += bytes.byteLength;
    const d = decoding.createDecoder(bytes);
    if (decoding.readVarUint(d) !== MESSAGE_SYNC) {
      return;
    }
    const reply = encoding.createEncoder();
    encoding.writeVarUint(reply, MESSAGE_SYNC);
    const kind = syncProtocol.readSyncMessage(d, reply, doc, "server");
    if (kind === syncProtocol.messageYjsSyncStep2) {
      synced.resolve(bytes.byteLength);
    }
  });
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== "server") {
      send(MESSAGE_SYNC, (e) => syncProtocol.writeUpdate(e, update));
    }
  });
  const step2Bytes = await synced.promise;
  return {
    doc,
    received,
    step2Bytes,
    pointer: (x: number) => {
      awareness.setLocalStateField("pointer", { x, y: x });
      send(MESSAGE_AWARENESS, (e) =>
        encoding.writeVarUint8Array(
          e,
          awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID])
        )
      );
    },
    close: () => ws.close(),
  };
};

const mcp = async (key: string, name: string, args: object) => {
  const t = performance.now();
  const res = await fetch(`${API}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-api-key": key,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const text = await res.text();
  const ms = performance.now() - t;
  const body = JSON.parse(text) as { result?: { isError?: boolean } };
  if (!res.ok || body.result?.isError) {
    throw new Error(`${name} failed: ${text.slice(0, 200)}`);
  }
  return { ms, bytes: text.length };
};

const cookie = await signIn();
const boards: Record<string, string> = {};
const sizes: Record<string, number> = {};
for (const f of FIXTURES) {
  const { id, bytes } = await ensureFixture(cookie, f);
  boards[f.title] = id;
  sizes[f.title] = bytes;
}
const L = boards["perf L"] ?? "";
const results: Record<string, unknown>[] = [
  await measure("idle 30 s, no clients", () => Bun.sleep(30_000)),
  await measure("open perf L once (cold room)", async () => {
    const p = await peer(cookie, L);
    p.close();
    const [row] =
      await db`select state from board_document where board_id = ${L}`;
    return {
      step2KB: Math.round(p.step2Bytes / 1024),
      deflateKB: Math.round(deflateRawSync(row.state).byteLength / 1024),
    };
  }),
  await measure(
    "1 editor moves a shape on perf L at 10 Hz for 20 s",
    async () => {
      const p = await peer(cookie, L);
      const elements = p.doc.getMap<Record<string, unknown>>("elements");
      const key = "page:main:perf-0-0";
      for (let i = 0; i < 200; i += 1) {
        const el = elements.get(key) ?? {};
        elements.set(key, {
          ...el,
          x: i,
          version: Number(el.version ?? 0) + 1,
        });
        await Bun.sleep(100);
      }
      p.close();
      return { updatesSent: 200 };
    }
  ),
  // How people edit: a burst, then a pause long enough for the debounced save, again and again.
  await measure(
    "1 editor on perf L: 6 bursts of 1 s at 10 Hz, 2 s pauses",
    async () => {
      const p = await peer(cookie, L);
      const elements = p.doc.getMap<Record<string, unknown>>("elements");
      const key = "page:main:perf-0-1";
      for (let burst = 0; burst < 6; burst += 1) {
        for (let i = 0; i < 10; i += 1) {
          const el = elements.get(key) ?? {};
          elements.set(key, {
            ...el,
            x: burst * 10 + i,
            version: Number(el.version ?? 0) + 1,
          });
          await Bun.sleep(100);
        }
        await Bun.sleep(2000);
      }
      p.close();
      return { updatesSent: 60 };
    }
  ),
  await measure(
    "cursor at 60 Hz for 10 s, 1 sender + 3 viewers on perf S",
    async () => {
      const S = boards["perf S"] ?? "";
      const sender = await peer(cookie, S);
      const viewers = await Promise.all([1, 2, 3].map(() => peer(cookie, S)));
      for (const v of viewers) {
        v.received.messages = 0;
      }
      for (let i = 0; i < 600; i += 1) {
        sender.pointer(i);
        await Bun.sleep(1000 / 60);
      }
      await Bun.sleep(300);
      const perViewer = viewers.map((v) => v.received.messages);
      for (const v of [sender, ...viewers]) {
        v.close();
      }
      return { pointerSent: 600, viewerMessages: perViewer.join("/") };
    }
  ),
];

const keyRes = await fetch(`${API}/api/auth/api-key/create`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie, origin: ORIGIN },
  body: JSON.stringify({ name: `perf-${Date.now()}` }),
});
const { key } = (await keyRes.json()) as { key: string };
const M = boards["perf M"] ?? "";
const S = boards["perf S"] ?? "";
const N = 30;
for (const [label, name, args] of [
  ["mcp list_boards", "list_boards", {}],
  ["mcp get_board perf M (no peers)", "get_board", { boardId: M }],
  [
    "mcp add_elements 1 shape on perf S",
    "add_elements",
    { boardId: S, elements: [{ type: "rectangle", x: 0, y: 0 }] },
  ],
] as const) {
  const latencies: number[] = [];
  let bytes = 0;
  const row = await measure(`${label} x${N}`, async () => {
    for (let i = 0; i < N; i += 1) {
      const call = await mcp(key, name, args);
      latencies.push(call.ms);
      ({ bytes } = call);
    }
  });
  results.push({
    ...row,
    xactsPerCall: +(row.xacts / N).toFixed(1),
    responseKB: +(bytes / 1024).toFixed(1),
    ...stats(latencies),
  });
}

// An agent thinks for seconds between calls; this is the pace a real MCP client reads a board at.
const paced: number[] = [];
const pacedRow = await measure(
  "mcp get_board perf L, 3 s apart x6",
  async () => {
    for (let i = 0; i < 6; i += 1) {
      paced.push((await mcp(key, "get_board", { boardId: L })).ms);
      await Bun.sleep(3000);
    }
  }
);
results.push({ ...pacedRow, ...stats(paced) });

console.log(
  JSON.stringify(
    { at: new Date().toISOString(), api: API, fixtureBytes: sizes, results },
    null,
    2
  )
);
await db.close();
// open sockets and fetch keep-alive would hold the process
process.exit(0);
