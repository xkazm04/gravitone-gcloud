// THE DAY-LINE'S GEOMETRY - pure: time to x, the axis, the night bands, and the packing of
// bars into sub-tracks (prototype projects.js `ZOOMS`, `pack`, `seatLabels`, `renderRuns`).
//
// ONE GEOMETRY, SHARED BY EVERYTHING THAT DRAWS OR AIMS AT A BAR (canvas-graph:
// edge-management, "shared anchor geometry"). The prototype measured the DOM after painting
// (`el.offsetLeft`, `.closest(".dl-row").offsetTop`) to find where a dependency curve should
// start - a second copy of each bar's position, read back from layout. Here `pack` decides
// every bar's track, left and width, `barBox` turns that into the box the bar is drawn in,
// and `anchors` takes the same box: a link cannot miss its bar because there is only one
// answer to where the bar is.
//
// BOUNDED, NOT JUST VIRTUALISED. A week of finished work can be thousands of bars. Three
// limits keep the DOM small and each says what it hides:
//   1. a lane draws at most its visible tracks (its capacity, or 2 when it holds one job at a
//      time); everything packed below them is counted behind the lane's +N, as the prototype
//      did, and drawn only when the operator opens the lane;
//   2. `inWindow` keeps only the bars that intersect the scrolled viewport plus one viewport
//      on each side - the time axis is the long one, so that is the axis that is windowed;
//   3. the page's own read is capped (the server takes at most one ledger page of ended runs).
// Packing still runs over every bar, so the +N and the accessible totals count the real
// world, not the drawn subset (canvas-graph: canvas-accessibility, "the name counts the
// graph, not the drawing").
//
// The numbers below are the prototype's, verbatim: they are geometry the packer computes
// with, so they live with the packer; the stylesheet only paints the boxes it is handed.

export const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Pixels per hour at each zoom (projects.js `ZOOMS`). */
export const ZOOMS = [
  { id: "12h", pph: 132 },
  { id: "24h", pph: 66 },
  { id: "3d", pph: 24 },
  { id: "week", pph: 11 },
] as const;
export type Zoom = (typeof ZOOMS)[number]["id"];
export const DEFAULT_ZOOM: Zoom = "24h";

export function isZoom(v: unknown): v is Zoom {
  return ZOOMS.some((z) => z.id === v);
}

export function pphOf(zoom: Zoom): number {
  return ZOOMS.find((z) => z.id === zoom)?.pph ?? 66;
}

/** The track geometry (projects.js: th 30, +4 between tracks, 6 above the first, rows at least 58). */
export const GEOMETRY = {
  trackH: 30,
  trackGap: 4,
  rowPad: 6,
  rowMin: 58,
  rowFoot: 12,
  barMin: 8,
  gateMin: 14,
  gap: 4,
  /** Room a label needs beyond its text to sit inside its bar. */
  labelPad: 16,
} as const;

/** A half-open time span in epoch ms. */
export type Span = { readonly from: number; readonly to: number };

export const xAt = (span: Span, pph: number, t: number): number => ((t - span.from) / HOUR_MS) * pph;
export const widthOf = (span: Span, pph: number): number => Math.ceil(xAt(span, pph, span.to));

// ---- the axis --------------------------------------------------------------------------

// Fixed moments in UTC, in a locale the app chose (status-vocabulary: timestamp-display -
// never the host's locale or zone; the axis corner says UTC because the axis is UTC).
const DAY_FMT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** `14:05`, UTC. */
export const hm = (t: number): string => new Date(t).toISOString().slice(11, 16);
/** `Wed 15 Oct`, UTC. */
export const dayLabel = (t: number): string => DAY_FMT.format(new Date(t));

export type Tick = { readonly at: number; readonly x: number; readonly label: string; readonly day?: string };

/** Hour ticks: every hour from 60 px/h, every 3 h from 20, else every 6; midnight names its day. */
export function ticks(span: Span, pph: number): Tick[] {
  const step = (pph >= 60 ? 1 : pph >= 20 ? 3 : 6) * HOUR_MS;
  const out: Tick[] = [];
  for (let t = Math.ceil(span.from / step) * step; t <= span.to; t += step) {
    const midnight = t % DAY_MS === 0;
    out.push({ at: t, x: xAt(span, pph, t), label: hm(t), ...(midnight ? { day: dayLabel(t) } : {}) });
  }
  return out;
}

/** Night bands, 22:00 UTC for eight hours, clipped to the span. */
export function nights(span: Span, pph: number): { readonly x: number; readonly w: number }[] {
  const out: { x: number; w: number }[] = [];
  for (let d = Math.floor(span.from / DAY_MS) * DAY_MS - DAY_MS; d < span.to; d += DAY_MS) {
    const a = Math.max(span.from, d + 22 * HOUR_MS);
    const b = Math.min(span.to, d + 30 * HOUR_MS);
    if (b > a) out.push({ x: xAt(span, pph, a), w: ((b - a) / HOUR_MS) * pph });
  }
  return out;
}

// ---- packing ---------------------------------------------------------------------------

/** Anything with a place in time. `gate` marks are drawn wider at minimum (a ◆ needs room). */
export type Timed = { readonly id: string; readonly s: number; readonly e: number; readonly mark?: "bar" | "gate" };

export type Placed = { readonly id: string; readonly track: number; readonly l: number; readonly w: number };

export type Packing = {
  /** Every item with its track, drawn or not. */
  readonly placed: readonly Placed[];
  /** Tracks the packing needed. */
  readonly tracks: number;
  /** Tracks drawn: all when open, else at most the lane's visible tracks. */
  readonly shown: number;
  /** Ids packed below the visible tracks: the lane's +N. */
  readonly over: readonly string[];
};

/** A lane shows its capacity in tracks, or two when it runs one job at a time (projects.js `vis`). */
export const visibleTracks = (cap: number): number => (cap > 1 ? cap : 2);

/**
 * Pack bars into sub-tracks in SCREEN space: a bar's footprint is its drawn width (never
 * narrower than the minimum) plus a gap, so two bars apart in time that touch on screen still
 * stack. Higher `prio` packs first (the selection, then its thread), so what the operator is
 * looking at lands in a visible track and never behind the +N.
 */
export function pack(items: readonly Timed[], x: (t: number) => number, opts: { readonly cap: number; readonly open: boolean; readonly prio?: (id: string) => number }): Packing {
  const prio = opts.prio ?? (() => 0);
  const sorted = [...items].sort((a, b) => prio(b.id) - prio(a.id) || a.s - b.s || a.id.localeCompare(b.id));
  const tracks: [number, number][][] = [];
  const placed: Placed[] = [];
  for (const it of sorted) {
    const l = x(it.s);
    const w = Math.max(it.mark === "gate" ? GEOMETRY.gateMin : GEOMETRY.barMin, x(it.e) - l);
    const r = l + w + GEOMETRY.gap;
    let k = tracks.findIndex((t) => t.every(([a, b]) => b <= l || a >= r));
    if (k < 0) {
      k = tracks.length;
      tracks.push([]);
    }
    tracks[k]?.push([l, r]);
    placed.push({ id: it.id, track: k, l, w });
  }
  const vis = visibleTracks(opts.cap);
  const n = Math.max(1, tracks.length);
  const over = placed.filter((p) => p.track >= vis).map((p) => p.id);
  return { placed, tracks: n, shown: opts.open ? n : Math.min(n, vis), over };
}

export type Box = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };

/** The box a placed bar is drawn in, relative to its row. */
export const barBox = (p: Placed): Box => ({ left: p.l, top: GEOMETRY.rowPad + p.track * (GEOMETRY.trackH + GEOMETRY.trackGap), width: p.w, height: GEOMETRY.trackH });

/** A row's height for the tracks it draws (projects.js: `max(58, n * (th + 4) + 12)`). */
export const rowHeight = (shown: number): number => Math.max(GEOMETRY.rowMin, shown * (GEOMETRY.trackH + GEOMETRY.trackGap) + GEOMETRY.rowFoot);

export type Point = { readonly x: number; readonly y: number };

/** Where a link leaves a bar (its right edge) and enters one (its left edge), mid-height, in track coordinates. */
export function anchors(box: Box, rowTop: number): { readonly out: Point; readonly in: Point } {
  const y = rowTop + box.top + box.height / 2;
  return { out: { x: box.left + box.width, y }, in: { x: box.left, y } };
}

/** The bars that intersect [x0, x1]: the time axis is windowed, one viewport either side. */
export function inWindow<P extends Pick<Placed, "l" | "w">>(placed: readonly P[], x0: number, x1: number): P[] {
  return placed.filter((p) => p.l <= x1 && p.l + p.w >= x0);
}

/**
 * Where a bar's label sits (projects.js `seatLabels`): inside when it fits, beside it when the
 * track is free to the right, else only on hover or focus. `measure` is the label's width.
 */
export function seatLabels(placed: readonly Placed[], measure: (id: string) => number): ReadonlyMap<string, "in" | "beside" | "hover"> {
  const out = new Map<string, "in" | "beside" | "hover">();
  const byTrack = new Map<number, Placed[]>();
  for (const p of placed) byTrack.set(p.track, [...(byTrack.get(p.track) ?? []), p]);
  for (const list of byTrack.values()) {
    list.sort((a, b) => a.l - b.l);
    list.forEach((p, i) => {
      const tw = measure(p.id);
      const next = list[i + 1]?.l ?? Number.POSITIVE_INFINITY;
      out.set(p.id, p.w >= tw + GEOMETRY.labelPad ? "in" : next - (p.l + p.w) - 6 >= tw + 6 ? "beside" : "hover");
    });
  }
  return out;
}

/** The label's width without a DOM: 12.5 px sans averages 7.2 px a character on this type. */
export const approxLabelWidth = (text: string): number => Math.ceil(text.length * 7.2);

/** How much of a lane is held now: running jobs over capacity, 0..1. */
export const occupancy = (running: number, cap: number): number => (cap <= 0 ? 0 : Math.min(1, running / cap));
