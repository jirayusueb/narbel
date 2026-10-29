import {
  VIEWS,
  arc,
  ellipse,
  line,
  onFace,
  pill,
  poly,
  rect,
  ring,
  spark,
} from "./fun";
import type { Icon, Layer, Motion, Shape, Track, Vec } from "./fun";
// narbel's stickers, adapted from the fun-isometric worked set (MIT, Kelvin Adithya, skills.klvn.dev/fun-isometric).
import {
  EASY,
  SNAP,
  clasp,
  float,
  hop,
  look,
  shackle,
  slide,
  sparkle,
  twinkle,
  wobble,
} from "./motions";

// colours are palette slots, so draw(..., palette) or play(..., { palette }) recolours the whole set
const LINE = 5;
// the house view: faces turned 18 degrees in their plane and leaned back 36, sides falling down left
const { tilt: FACE, extrude: EXT } = VIEWS.right;

// a white sparkle riding a parent, popped by whatever motion it is given
const glow = (
  parent: string,
  p: Vec,
  r: number,
  m: Motion | ReadonlyArray<Motion>,
  extra: { ip?: number; op?: number } = {}
): Layer => ({
  parent,
  a: p,
  p,
  m,
  ...extra,
  shapes: [{ d: spark(p[0], p[1], r), fill: "white" }],
});

const KEYHOLE =
  ellipse(0, -4, 17) +
  poly(
    [
      [-8, 6],
      [8, 6],
      [13, 42],
      [-13, 42],
    ],
    3
  );
const SHACKLE =
  "M-74 -40L-74 -122A74 74 0 0 1 74 -122L74 -40L42 -40L42 -122A42 42 0 0 0 -42 -122L-42 -40Z";

export const padlock: Icon = {
  name: "padlock",
  frames: 130,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: "lock", p: [256, 300], m: clasp, shapes: [] },
    {
      parent: "body",
      a: [-58, -62],
      p: [-58, -62],
      m: shackle,
      shapes: [{ d: SHACKLE, fill: "grey", depth: 0.7 }],
    },
    {
      id: "body",
      parent: "lock",
      tilt: FACE,
      shapes: [
        { d: rect(-112, -80, 224, 176, 24), fill: "ok", depth: 1 },
        { d: ellipse(0, 8, 36, 50), fill: "white", depth: 0.25 },
        { d: KEYHOLE, fill: "ink", line: false },
      ],
    },
    glow("lock", [-142, -70], 30, twinkle(0, true), { op: 30 }),
    glow("lock", [-142, -70], 30, twinkle(75), { ip: 75 }),
  ],
};

const BUBBLE = poly(
  [
    [-132, -96],
    [132, -96],
    [132, 74],
    [-36, 74],
    [-96, 120],
    [-80, 74],
    [-132, 74],
  ],
  [30, 30, 30, 4, 6, 4, 30]
);
const BOT: Vec = [-16, 30];
// it rocks on the bubble's bottom edge, placed so the face sits where it always did
const ROCK = onFace(BOT, [0, 74]);

export const chat: Icon = {
  name: "chat",
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    {
      id: "bot",
      a: ROCK,
      p: [252 + ROCK[0], 216 + ROCK[1]],
      m: wobble,
      shapes: [],
    },
    {
      id: "face",
      parent: "bot",
      tilt: BOT,
      shapes: [
        { d: pill(-8, -150, 16, 60), fill: "grey", depth: 0.5 },
        { d: ellipse(0, -152, 20), fill: "gold", depth: 0.6 },
        { d: BUBBLE, fill: "main", depth: 1 },
        { d: rect(-104, -70, 208, 118, 26), fill: "tint" },
        { d: arc(0, 4, 30, 25, 155) },
      ],
    },
    {
      id: "eyeL",
      parent: "face",
      shapes: [{ d: ellipse(-46, -20, 26, 30), fill: "white" }],
    },
    {
      id: "eyeR",
      parent: "face",
      shapes: [{ d: ellipse(46, -20, 26, 30), fill: "white" }],
    },
    {
      parent: "face",
      clip: "eyeL",
      m: { ...look, k: 1.6 },
      shapes: [{ d: ellipse(-40, -14, 15), fill: "ink", line: false }],
    },
    {
      parent: "face",
      clip: "eyeR",
      m: { ...look, k: 1.6 },
      shapes: [{ d: ellipse(52, -14, 15), fill: "ink", line: false }],
    },
    glow("bot", [150, -118], 26, sparkle(16)),
    glow("bot", [-156, -60], 16, sparkle(92)),
  ],
};

// A loop de loop written across the pad, in face space, sampled densely so the nib can be keyed onto it
const LOOPS = 4;
const SCRIBBLE: Array<Vec> = (() => {
  const [from, to] = [-Math.PI / 2, LOOPS * 2 * Math.PI + 0.7];
  const pts = Array.from({ length: 721 }, (_, i): Vec => {
    const t = from + ((to - from) * i) / 720;
    const tall = 30 * (1 + 0.14 * Math.sin(t / 2.6));
    const x = 5.6 * t + 15 * Math.sin(t);
    return [x, tall * Math.cos(t) - 0.14 * x];
  });
  const mid = (pts[0][0] + pts[720][0]) / 2;
  return pts.map(([x, y]) => [x - mid, y + 4]);
})();
// on screen the pad leans, so speed and trims are measured after the tilt
const SEEN = SCRIBBLE.map((p) => onFace(FACE, p));
const RUN = SEEN.reduce<Array<number>>(
  (acc, p, i) => (
    acc.push(
      i
        ? acc[i - 1] + Math.hypot(p[0] - SEEN[i - 1][0], p[1] - SEEN[i - 1][1])
        : 0
    ),
    acc
  ),
  []
);
const [WRITE, DONE, PIECES] = [16, 118, 8];
const frameAt = (s: number) => WRITE + ((DONE - WRITE) * s) / RUN[720];
const nibAt = (s: number): Vec => {
  let i = 1;
  while (i < 720 && RUN[i] < s) i++;
  const k = (s - RUN[i - 1]) / (RUN[i] - RUN[i - 1] || 1);
  return [
    +(SEEN[i - 1][0] + (SEEN[i][0] - SEEN[i - 1][0]) * k).toFixed(2),
    +(SEEN[i - 1][1] + (SEEN[i][1] - SEEN[i - 1][1]) * k).toFixed(2),
  ];
};
// cut into pieces with their own trims, so a trim's end never drifts from the nib on a long path
const CUTS = Array.from({ length: PIECES + 1 }, (_, j) =>
  RUN.findIndex((r) => r >= (RUN[720] * j) / PIECES)
);
const INK: ReadonlyArray<Shape> = CUTS.slice(0, -1).map((c, j) => ({
  d: line(...SCRIBBLE.slice(c, CUTS[j + 1] + 1)),
  line: 7,
  round: true,
  trim: [
    [frameAt(RUN[c]), 0],
    [frameAt(RUN[CUTS[j + 1]]), 1],
    [178, 1, 0],
    [179, 0],
  ],
}));
const SHINE = onFace(FACE, [104, -136]);
const START = SEEN[0];
const END = SEEN[720];
const LIFT: Vec = [12, -40];
const HOVER: Vec = [START[0] + LIFT[0], START[1] + LIFT[1]];
// the nib rides the line every two frames, rocking a little with each loop
const NIB: Track<Vec> = [
  [0, HOVER, EASY],
  ...Array.from(
    { length: (DONE - WRITE) / 2 },
    (_, i) =>
      [WRITE + i * 2, nibAt((RUN[720] * i * 2) / (DONE - WRITE))] as const
  ),
  [DONE, END, EASY],
  [
    DONE + 16,
    [END[0] + LIFT[0], END[1] + LIFT[1]],
    SNAP,
    [
      [-30, -40],
      [30, -40],
    ],
  ],
  [168, HOVER],
];
const TURN: Track<number> = [
  [0, 36, EASY],
  [WRITE, 30],
  ...Array.from(
    { length: (DONE - WRITE) / 2 - 1 },
    (_, i) =>
      [
        WRITE + (i + 1) * 2,
        30 + 4 * Math.sin(((i + 1) * 2 * LOOPS * 2 * Math.PI) / (DONE - WRITE)),
      ] as const
  ),
  [DONE, 30, EASY],
  [DONE + 16, 34, SNAP],
  [168, 36],
];

export const pen: Icon = {
  name: "pen",
  frames: 180,
  // the finished scribble, pen lifted and the sparkle out
  still: 136,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: "desk", p: [224, 322], shapes: [] },
    {
      parent: "desk",
      tilt: FACE,
      shapes: [{ d: rect(-116, -116, 232, 232, 28), fill: "tint", depth: 1 }],
    },
    {
      parent: "desk",
      tilt: FACE,
      a: [0, 4],
      p: onFace(FACE, [0, 4]),
      m: twinkle(148, true),
      shapes: INK,
    },
    {
      parent: "desk",
      p: NIB,
      r: TURN,
      shapes: [
        {
          d: poly(
            [
              [-21, -196],
              [21, -196],
              [21, -86],
              [-21, -86],
            ],
            [20, 20, 0, 0]
          ),
          fill: "main",
          depth: 1,
        },
        { d: rect(-21, -174, 42, 20), fill: "deep", depth: 1 },
        { d: rect(8, -168, 9, 58, 4.5), fill: "grey", depth: 0.4 },
        { d: rect(-21, -90, 42, 42, 6), fill: "deep", depth: 1 },
        {
          d: poly(
            [
              [-19, -50],
              [19, -50],
              [4, -6],
              [-4, -6],
            ],
            [4, 4, 3, 3]
          ),
          fill: "white",
          depth: 0.5,
        },
        { d: ellipse(0, -6, 5.5), fill: "ink", line: false },
      ],
    },
    glow("desk", SHINE, 26, [twinkle(DONE + 4), twinkle(150, true)]),
  ],
};

const PIN =
  "M0 118C-24 76 -96 22 -96 -42A96 96 0 0 1 96 -42C96 22 24 76 0 118Z";

export const pin: Icon = {
  name: "pin",
  frames: 180,
  line: LINE,
  extrude: [-3, 16],
  layers: [
    {
      id: "drop",
      a: [0, 118],
      p: [250, 362],
      m: { ...hop, at: 20 },
      shapes: [],
    },
    {
      parent: "drop",
      shapes: [
        { d: PIN, fill: "main", depth: 1, edges: [[0, 118]] },
        { d: ring(0, -42, 46, 22), fill: "white", depth: 0.3 },
      ],
    },
    glow("drop", [104, -128], 26, sparkle(48)),
    glow("drop", [-118, -20], 16, sparkle(110)),
  ],
};

const CLOUD =
  "M-112 64A54 54 0 0 1 -116 -38A72 72 0 0 1 20 -76A64 64 0 0 1 124 -18A44 44 0 0 1 112 64Z";

export const cloud: Icon = {
  name: "cloud",
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: "sky", p: [250, 270], m: float, shapes: [] },
    {
      parent: "sky",
      tilt: FACE,
      shapes: [{ d: CLOUD, fill: "white", depth: 1 }],
    },
    {
      parent: "sky",
      tilt: FACE,
      m: slide([0, -40], 30, 50, 50),
      shapes: [
        {
          d: poly(
            [
              [0, -66],
              [52, -10],
              [22, -10],
              [22, 50],
              [-22, 50],
              [-22, -10],
              [-52, -10],
            ],
            6
          ),
          fill: "ok",
          depth: 0.8,
        },
      ],
    },
  ],
};
