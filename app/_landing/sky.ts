// THE SKY'S DATA AND DRAWING — pure, no DOM. Ported from the Almanac door
// (contest landing-nextgen-brand-r2, variant 2); coordinates are the design's.
//
// Every star is one of the 19 REAL pictures this repo's own pipeline generated
// (public/presets, public/deck-art). The figures drawn around them (a lyre, a
// prism, a pair of dividers, a balance) are STYLISED and the door says so in
// the accessible name; they are not product output.
//
// The door itself was retired on 2026-10-07 (the landing is now the Paper
// Cosmos, ./cosmos). This file stays because the brand kit's identity sheet
// (app/kit/Identity.tsx) still draws the atlas from it; "the door" below means
// that drawing.

/** A constellation's tint is a CSS value, never a hex: it resolves through the
 *  world's tokens. `--al-tint-*` are the four hues the design gives the four
 *  groups; they are NOT in WORLD_ALMANAC yet (owner decision, reported), so each
 *  falls back to a hue that already exists. Adding the four tokens changes the
 *  door with no edit here. */
const tint = (id: string, fallback: string) => `var(--al-tint-${id}, var(${fallback}))`;

export interface Star {
  /** Public path of the picture. */
  src: string;
  name: string;
  /** Local position in the constellation's frame, and eyepiece size (landscape units). */
  lx: number;
  ly: number;
  size: number;
  pick: boolean;
  /** Catalogue number, GRV·NN. */
  cat: string;
  /** Constellation index and index within it. */
  ci: number;
  i: number;
  /** Plate picture is 16:9 (style plates) rather than 4:3 (card stills). */
  wide: boolean;
}

export interface Constellation {
  id: "templates" | "bracket" | "disciplines" | "engines";
  name: string;
  tint: string;
  /** What the stylised figure is, for the label. */
  figure: string;
  stars: Star[];
}

type Raw = [file: string, name: string, lx: number, ly: number, size: number, pick?: 1];

const RAW: { id: Constellation["id"]; name: string; tint: string; figure: string; dir: string; wide?: true; items: Raw[] }[] = [
  {
    id: "templates", name: "Templates", tint: tint("templates", "--al-white"), figure: "lyre", dir: "/deck-art/",
    items: [
      ["template-trailer.webp", "Trailer", 0, -190, 108, 1],
      ["template-cinematic.webp", "Cinematic", -145, -125, 80],
      ["template-teaser.webp", "Teaser", 145, -125, 80],
      ["template-short-form-clip.webp", "Short-form clip", -160, 30, 74],
      ["template-free-form.webp", "Free-form", 160, 30, 74],
      ["template-mid-educational-video.webp", "Mid educational", -68, 165, 76],
      ["template-short-educational-video.webp", "Short educational", 68, 165, 76],
    ],
  },
  {
    id: "bracket", name: "Bracket", tint: tint("bracket", "--al-gold"), figure: "prism", dir: "/presets/", wide: true,
    items: [
      ["blueprint.jpg", "Blueprint", 172, -157, 78],
      ["chalk-argument.jpg", "Chalk Argument", 346, -200, 76],
      ["signal-ledger.jpg", "Signal Ledger", 223, -38, 76],
      ["paper-relief.jpg", "Paper Relief", 404, -33, 104, 1],
      ["newsprint-cutout.jpg", "Newsprint Cutout", 207, 91, 76],
      ["data-neon.jpg", "Data Neon", 377, 120, 78],
    ],
  },
  {
    id: "disciplines", name: "Disciplines", tint: tint("disciplines", "--al-ash"), figure: "dividers", dir: "/deck-art/",
    items: [
      ["discipline-educational.webp", "Educational", 0, -140, 104, 1],
      ["discipline-free.webp", "Free", -130, 130, 82],
      ["discipline-trailer.webp", "Trailer", 130, 130, 82],
    ],
  },
  {
    id: "engines", name: "Engines", tint: tint("engines", "--al-vellum"), figure: "balance", dir: "/deck-art/",
    items: [
      ["engine-adjudication.webp", "Adjudication", -165, 80, 82],
      ["engine-reversal-chain.webp", "Reversal chain", 0, -135, 104, 1],
      ["engine-derived-short.webp", "Derived short", 165, 80, 82],
    ],
  },
];

let count = 0;
export const CONS: Constellation[] = RAW.map((c, ci) => ({
  id: c.id,
  name: c.name,
  tint: c.tint,
  figure: c.figure,
  stars: c.items.map((a, i) => {
    count++;
    return {
      src: c.dir + a[0], name: a[1], lx: a[2], ly: a[3], size: a[4], pick: !!a[5],
      cat: `GRV·${count < 10 ? "0" : ""}${count}`, ci, i, wide: !!c.wide,
    };
  }),
}));
export const ALL: Star[] = CONS.flatMap((c) => c.stars);
export const PICKS = ALL.filter((s) => s.pick).length;

/** Local bounding boxes of each figure: [x0, y0, x1, y1]. */
export const BOX: Record<Constellation["id"], [number, number, number, number]> = {
  templates: [-195, -235, 195, 232],
  bracket: [-430, -262, 466, 182],
  disciplines: [-185, -222, 185, 172],
  engines: [-222, -180, 222, 176],
};
/** The camera frames the bracket without its long incoming ray. */
export const CAMBOX: Partial<typeof BOX> = { bracket: [-130, -262, 466, 182] };
export const CUT_ORDER: Constellation["id"][] = ["templates", "bracket", "disciplines", "engines"];

export type LayoutKey = "L" | "P";
interface Place { x: number; y: number; sx: number; sy: number; lab: [number, number, "mid" | "end" | ""] }
export interface Layout {
  W: number;
  H: number;
  /** Centre-stage anchor, chart units. */
  marq: [number, number];
  /** Hover-name size as a fraction of stage width. */
  ns: number;
  t: Record<Constellation["id"], Place>;
}
export const LAYS: Record<LayoutKey, Layout> = {
  L: {
    W: 1600, H: 1000, marq: [808, 350], ns: 0.066,
    t: {
      templates: { x: 330, y: 345, sx: 1, sy: 1, lab: [330, 598, "mid"] },
      bracket: { x: 500, y: 745, sx: 1, sy: 1, lab: [452, 826, "mid"] },
      disciplines: { x: 1250, y: 300, sx: 1, sy: 1, lab: [1562, 280, "end"] },
      engines: { x: 1300, y: 720, sx: 1, sy: 1, lab: [1300, 688, "mid"] },
    },
  },
  P: {
    W: 1000, H: 2250, marq: [500, 300], ns: 0.1,
    t: {
      templates: { x: 500, y: 640, sx: 2, sy: 0.95, lab: [40, 880, ""] },
      bracket: { x: 480, y: 1180, sx: 1, sy: 1.6, lab: [40, 1282, ""] },
      disciplines: { x: 500, y: 1530, sx: 2, sy: 1, lab: [40, 1440, ""] },
      engines: { x: 500, y: 1860, sx: 1.8, sy: 0.85, lab: [975, 1762, "end"] },
    },
  },
};

export const posOf = (L: Layout, s: Star) => {
  const t = L.t[CONS[s.ci].id];
  return { x: t.x + s.lx * t.sx, y: t.y + s.ly * t.sy };
};
export const sizeOf = (k: LayoutKey, s: Star) => (k === "L" ? s.size : s.pick ? 150 : 118);

// ── the figures ─────────────────────────────────────────────────────────────

export interface Stroke { d: string; cls?: "fine" | "ray" }
const circ = (cx: number, cy: number, r: number) =>
  `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`;
const P = (d: string, cls?: Stroke["cls"]): Stroke => ({ d, cls });

function lyre(): Stroke[] {
  const s = [
    P("M -30 205 C -130 200 -190 110 -160 30 C -135 -40 -80 -80 -145 -125 C -180 -150 -182 -188 -158 -212"),
    P("M 30 205 C 130 200 190 110 160 30 C 135 -40 80 -80 145 -125 C 180 -150 182 -188 158 -212"),
    P("M -126 -106 Q 0 -140 126 -106"),
    P("M -110 150 Q -100 215 0 215 Q 100 215 110 150 Q 0 132 -110 150"),
  ];
  for (let x = -44; x <= 44; x += 22) {
    const yt = -106 - 17 * (1 - (x / 126) * (x / 126));
    s.push(P(`M ${x} ${yt.toFixed(1)} L ${x} 146`, "fine"));
  }
  s.push(P("M 0 -123 L 0 -150", "fine"), P(circ(-126, -106, 5), "fine"), P(circ(126, -106, 5), "fine"),
    P("M -150 -40 Q -118 -48 -98 -70", "fine"), P("M 150 -40 Q 118 -48 98 -70", "fine"));
  return s;
}

function prism(): { strokes: Stroke[]; dot: [number, number, number] } {
  const b = [
    P("M -100 40 L 0 40 L -50 -47 Z"),
    P("M -90 33 L -10 33", "fine"), P("M -80 25 L -20 25", "fine"), P("M -70 16 L -30 16", "fine"), P("M -60 7 L -40 7", "fine"),
    P("M -420 -70 L -75 -3"), P("M -75 -3 L -25 -3", "fine"),
  ];
  const br = [[172, -157], [346, -200], [223, -38], [404, -33], [207, 91], [377, 120]];
  br.forEach((p) => b.push(P(`M -25 -3 L ${p[0]} ${p[1]}`, "ray")));
  br.forEach((p) => {
    const dx = p[0] + 25, dy = p[1] + 3, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    b.push(P(`M ${(p[0] + ux * 62).toFixed(1)} ${(p[1] + uy * 62).toFixed(1)} L ${(p[0] + ux * 95).toFixed(1)} ${(p[1] + uy * 95).toFixed(1)}`, "fine"));
  });
  for (let k = 1; k < 6; k++) {
    const xx = -420 + k * 57, yy = -70 + k * 11.2;
    b.push(P(`M ${xx - 2} ${yy - 9} L ${xx + 2} ${yy + 9}`, "fine"));
  }
  return { strokes: b, dot: [-420, -70, 3.2] };
}

function dividers(): Stroke[] {
  const d = [
    P(circ(0, -205, 12)), P("M 0 -193 L 0 -165"),
    P("M -9 -128 L -130 130 M 7 -122 L -130 130"),
    P("M 9 -128 L 130 130 M -7 -122 L 130 130"),
    P("M -67 0 L 67 0", "fine"), P(circ(0, 0, 5), "fine"),
    P("M -172 106 A 300 300 0 0 0 172 106"),
  ];
  for (let a = 58; a <= 122; a += 4) {
    const r1 = 300, r2 = a % 12 === 2 ? 318 : 309, ra = (a * Math.PI) / 180;
    d.push(P(`M ${(r1 * Math.cos(ra)).toFixed(1)} ${(-140 + r1 * Math.sin(ra)).toFixed(1)} L ${(r2 * Math.cos(ra)).toFixed(1)} ${(-140 + r2 * Math.sin(ra)).toFixed(1)}`, "fine"));
  }
  return d;
}

function balance(): Stroke[] {
  return [
    P("M 0 -92 L 0 -40"), P("M 0 48 L 0 162"),
    P("M -62 166 L 62 166"), P("M -38 166 Q 0 140 38 166", "fine"),
    P("M -174 -70 L 174 -70"), P("M -150 -64 L 150 -64", "fine"),
    P("M -12 -70 L 0 -92 L 12 -70"),
    P("M -168 -70 L -208 108 M -168 -70 L -122 108", "fine"),
    P("M 168 -70 L 208 108 M 168 -70 L 122 108", "fine"),
    P("M -218 108 Q -165 150 -112 108"), P("M 218 108 Q 165 150 112 108"),
    P(circ(-176, -70, 5), "fine"), P(circ(176, -70, 5), "fine"),
  ];
}

const PRISM = prism();
export const FIGURES: Record<Constellation["id"], { strokes: Stroke[]; dot?: [number, number, number] }> = {
  templates: { strokes: lyre() },
  bracket: { strokes: PRISM.strokes, dot: PRISM.dot },
  disciplines: { strokes: dividers() },
  engines: { strokes: balance() },
};

// ── the chart ───────────────────────────────────────────────────────────────

export function mulberry(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Catmull-Rom through the picks, as cubic Béziers: the cut. */
export function catmull(p: { x: number; y: number }[]): string {
  let d = `M ${p[0].x} ${p[0].y}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2, t = 0.5 / 1.6;
    d += ` C ${(p1.x + (p2.x - p0.x) * t).toFixed(1)} ${(p1.y + (p2.y - p0.y) * t).toFixed(1)} ${(p2.x - (p3.x - p1.x) * t).toFixed(1)} ${(p2.y - (p3.y - p1.y) * t).toFixed(1)} ${p2.x} ${p2.y}`;
  }
  return d;
}

export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const A = (a: number, b: number) => 1 - 3 * b + 3 * a, B = (a: number, b: number) => 3 * b - 6 * a, C = (a: number) => 3 * a;
  const calc = (t: number, a: number, b: number) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const slope = (t: number, a: number, b: number) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const s = slope(t, x1, x2);
      if (!s) break;
      t -= (calc(t, x1, x2) - x) / s;
    }
    return calc(t, y1, y2);
  };
}

export interface Graticule {
  circles: { cx: number; cy: number; r: number; major: boolean }[];
  hours: { d: string; major: boolean }[];
  /** Labels along one hour line: chart position and text. */
  labels: { x: number; y: number; text: string }[];
}

/** Declination circles around an off-chart pole and the hour lines from it. */
export function graticule(k: LayoutKey, L: Layout): Graticule {
  const { W, H } = L;
  const px = W / 2, py = -W, rmin = W, rmax = Math.hypot(W * 1.2, H + W + 400), step = (H + 300) / 7;
  const circles: Graticule["circles"] = [];
  let j = 0;
  for (let r = rmin + step * 0.5; r < rmax; r += step, j++) circles.push({ cx: px, cy: py, r, major: j % 2 === 0 });
  const hours: Graticule["hours"] = [];
  for (let a = 40; a <= 140; a += k === "L" ? 5 : 6) {
    const ra = (a * Math.PI) / 180;
    hours.push({
      d: `M ${(px + rmin * 0.9 * Math.cos(ra)).toFixed(1)} ${(py + rmin * 0.9 * Math.sin(ra)).toFixed(1)} L ${(px + rmax * Math.cos(ra)).toFixed(1)} ${(py + rmax * Math.sin(ra)).toFixed(1)}`,
      major: a % 15 === 0,
    });
  }
  const labels: Graticule["labels"] = [];
  if (k === "L") {
    const clearAt = (x: number, y: number) => {
      if (Math.abs(x - L.marq[0]) < 330 && Math.abs(y - L.marq[1]) < 140) return false;
      return ALL.every((s) => { const p = posOf(L, s); return Math.hypot(p.x - x - 20, p.y - y + 6) > sizeOf(k, s) / 2 + 60; });
    };
    const la = (110 * Math.PI) / 180, dec = [60, 45, 30, 15, 0, -15, -30];
    j = 0;
    for (let r = rmin + step * 0.5; r < rmax && j < dec.length; r += step * 2, j += 2) {
      const tx = px + r * Math.cos(la), ty = py + r * Math.sin(la);
      if (ty > 200 && ty < H - 40 && tx > 30 && clearAt(tx, ty)) labels.push({ x: tx + 6, y: ty - 6, text: `${dec[j] > 0 ? "+" : ""}${dec[j]}°` });
    }
    const rr = rmin + step * 0.5 + step;
    ["XIX", "XX", "XXI", "XXII", "XXIII"].forEach((h, i) => {
      const aa = ((70 + i * 10) * Math.PI) / 180, tx = px + rr * Math.cos(aa), ty = py + rr * Math.sin(aa);
      if (tx > 40 && tx < W - 60 && clearAt(tx, ty + 12)) labels.push({ x: tx + 5, y: ty + 18, text: `${h}h` });
    });
  }
  return { circles, hours, labels };
}

/** The faint candidates: the stars nobody picked yet. Seeded, so it never moves. */
export function faintStars(L: Layout) {
  const rnd = mulberry(7);
  return CONS.map((c) => {
    const t = L.t[c.id], b = BOX[c.id];
    const dots: { cx: number; cy: number; r: number; o: number }[] = [];
    for (let q = 0; q < 26; q++) {
      const lx = b[0] + (b[2] - b[0]) * rnd(), ly = b[1] + (b[3] - b[1]) * rnd();
      dots.push({ cx: t.x + lx * t.sx * 1.08, cy: t.y + ly * t.sy * 1.08, r: 0.9 + rnd() * 1.9, o: 0.25 + rnd() * 0.45 });
    }
    return { id: c.id, dots };
  });
}
