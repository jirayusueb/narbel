// Shared by the perf scripts: config, seeded S/M/L fixture boards, timing and a minimal sync client.
import { SQL } from "bun";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

export const API = process.env.API ?? "http://localhost:3000";
const EMAIL = process.env.EMAIL ?? "demo@narbel.dev";
const PASSWORD = process.env.PASSWORD ?? "demo1234";
export const db = new SQL(process.env.DATABASE_URL ?? "");

// No images: fake fileIds would only 404 and flood toasts. Image loading is measured with real uploads.
export const FIXTURES = [
  { title: "perf S", pages: 1, perPage: 50 },
  { title: "perf M", pages: 3, perPage: 350 },
  { title: "perf L", pages: 10, perPage: 500 },
];

const authPost = (path: string, body: object) =>
  fetch(`${API}/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

// A fresh database (an isolated perf run) has no account yet, so the first sign-in creates it.
export const signIn = async () => {
  let res = await authPost("sign-in/email", {
    email: EMAIL,
    password: PASSWORD,
  });
  if (res.status === 401) {
    res = await authPost("sign-up/email", {
      email: EMAIL,
      password: PASSWORD,
      name: "Perf",
    });
  }
  if (!res.ok) {
    throw new Error(`sign-in ${res.status}`);
  }
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
};

const element = (page: string, i: number) => {
  const id = `perf-${page}-${i}`;
  const kind = ["rectangle", "ellipse", "diamond", "text", "arrow"][i % 5];
  return {
    id,
    type: kind,
    x: (i % 25) * 160,
    y: Math.floor(i / 25) * 120,
    width: 120,
    height: 80,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: `a${i.toString(36).padStart(4, "0")}`,
    roundness: { type: 3 },
    seed: i,
    version: 3,
    versionNonce: i * 7,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...(kind === "text"
      ? {
          text: `Label ${i}`,
          originalText: `Label ${i}`,
          fontSize: 20,
          fontFamily: 5,
          textAlign: "left",
          verticalAlign: "top",
          containerId: null,
          autoResize: true,
          lineHeight: 1.25,
        }
      : {}),
    ...(kind === "arrow"
      ? {
          points: [
            [0, 0],
            [120, 80],
          ],
          startBinding: null,
          endBinding: null,
          startArrowhead: null,
          endArrowhead: "arrow",
          elbowed: false,
        }
      : {}),
  };
};

const fixtureState = (f: (typeof FIXTURES)[number]) => {
  const doc = new Y.Doc();
  const pages = doc.getArray<{ id: string; name: string }>("pages");
  const elements = doc.getMap("elements");
  doc.transact(() => {
    for (let p = 0; p < f.pages; p += 1) {
      const pageId = p === 0 ? "page:main" : `page:perf-${p}`;
      pages.push([{ id: pageId, name: `Page ${p + 1}` }]);
      for (let i = 0; i < f.perPage; i += 1) {
        elements.set(`${pageId}:perf-${p}-${i}`, element(String(p), i));
      }
    }
  });
  return Y.encodeStateAsUpdate(doc);
};

export const ensureFixture = async (
  cookie: string,
  f: (typeof FIXTURES)[number]
) => {
  const [owner] = await db`select id from "user" where email = ${EMAIL}`;
  const [existing] =
    await db`select id from board where owner_id = ${owner.id} and title = ${f.title}`;
  let id = existing?.id as string | undefined;
  if (!id) {
    const res = await fetch(`${API}/api/boards`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: f.title }),
    });
    const created = (await res.json()) as { id: string };
    ({ id } = created);
  }
  const state = fixtureState(f);
  await db`insert into board_document (board_id, state, updated_at) values (${id}, ${state}, now())
    on conflict (board_id) do update set state = excluded.state, updated_at = now()`;
  return { id, bytes: state.byteLength };
};

export const time = async (fn: () => Promise<unknown>) => {
  const t = performance.now();
  await fn();
  return performance.now() - t;
};

export const get = (cookie: string, path: string) => async () => {
  const res = await fetch(`${API}${path}`, { headers: { cookie } });
  await res.arrayBuffer();
  if (!res.ok) {
    throw new Error(`${path} ${res.status}`);
  }
};

// Connect, send SyncStep1 with an empty state vector, resolve when the server's SyncStep2 lands.
export const syncOnce = (cookie: string, boardId: string, keepOpen = false) => {
  const done = Promise.withResolvers<{ ms: number; ws: WebSocket }>();
  const t = performance.now();
  const ws = new WebSocket(
    `${API.replace(/^http/u, "ws")}/api/boards/sync/${boardId}`,
    {
      headers: { cookie },
    } as unknown as string[]
  );
  ws.binaryType = "arraybuffer";
  ws.addEventListener("open", () => {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, 0);
    syncProtocol.writeSyncStep1(e, new Y.Doc());
    ws.send(encoding.toUint8Array(e));
  });
  ws.addEventListener("message", (event) => {
    const d = decoding.createDecoder(new Uint8Array(event.data as ArrayBuffer));
    if (
      decoding.readVarUint(d) === 0 &&
      decoding.readVarUint(d) === syncProtocol.messageYjsSyncStep2
    ) {
      const ms = performance.now() - t;
      if (!keepOpen) {
        ws.close();
      }
      done.resolve({ ms, ws });
    }
  });
  ws.addEventListener("error", () => done.reject(new Error("ws error")));
  return done.promise;
};

export const stats = (xs: number[]) => {
  const s = xs.toSorted((a, b) => a - b);
  const q = (p: number) =>
    s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? Number.NaN;
  return {
    p50: +q(0.5).toFixed(1),
    p95: +q(0.95).toFixed(1),
    max: +q(1).toFixed(1),
  };
};
