// THE PRODUCTION STREET'S SHAPES - pure (spark character-cores S1). A production (@gt/domain/productionGraph) read three
// ways for the street's three variants: by station (A, the river of stations), on the track's master clock (B, the
// timeline street: lanes over a ruler of sections, beats and lyric lines), and as scenes (C, the film strip: each take
// with the keyframe it starts from). Also the words the street says about a node, a drift and a swap's redo, so the
// three variants never say them three ways. Unit-tested in tests/next-server/scout-canvas-production.test.ts.

import { DRIFT_AXES, PRODUCTION_STATIONS, type Drift, type DriftAxis, type Production, type ProductionNode, type ProductionNodeState, type ProductionStation, type Redo, type TrackMap } from "@gt/domain/productionGraph";

import type { Tone } from "../tables.ts";

/* ── the variants ─────────────────────────────────────────────────────── */

export const VARIANTS = ["a", "b", "c"] as const;
export type Variant = (typeof VARIANTS)[number];
export const VARIANT_NAME: Readonly<Record<Variant, string>> = { a: "River", b: "Timeline", c: "Film strip" };
export const isVariant = (v: unknown): v is Variant => typeof v === "string" && (VARIANTS as readonly string[]).includes(v);
export const nextVariant = (v: Variant): Variant => VARIANTS[(VARIANTS.indexOf(v) + 1) % VARIANTS.length] ?? "a";

/* ── words ────────────────────────────────────────────────────────────── */

export const STATION_NAME: Readonly<Record<ProductionStation, string>> = { track: "Track", look: "Look", cast: "Cast", keyframe: "Keyframes", clip: "Clips", cut: "Cut" };

/** A node's state: its word and its signal. Stale is amber (a limit to know about, never rose: @gt/ui StaleBadge). */
export const NODE_STATE: Readonly<Record<ProductionNodeState, { readonly word: string; readonly tone: Tone }>> = {
  made: { word: "made", tone: "muted" },
  stale: { word: "stale", tone: "amber" },
  pending: { word: "pending", tone: "cyan" },
  failed: { word: "failed", tone: "rose" },
};

/** Seconds on the master clock as m:ss. */
export function clock(s: number): string {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export type Counts = Readonly<Record<ProductionNodeState, number>>;

export function counts(nodes: readonly ProductionNode[]): Counts {
  const c: Record<ProductionNodeState, number> = { made: 0, stale: 0, pending: 0, failed: 0 };
  for (const n of nodes) c[n.state]++;
  return c;
}

/** `12 made · 3 stale` - the states present, in the table's order. */
export const countLine = (c: Counts): string =>
  (Object.keys(NODE_STATE) as ProductionNodeState[]).filter((s) => c[s] > 0).map((s) => `${c[s]} ${NODE_STATE[s].word}`).join(" · ");

/** The axes the eye read as drifting. */
export const drifting = (d: Drift): DriftAxis[] => DRIFT_AXES.filter((a) => d[a] === "drifts");

/** The eye's reading as words: `identity holds · room drifts · wardrobe holds: <reason>`. */
export const driftName = (d: Drift): string => `${DRIFT_AXES.map((a) => `${a} ${d[a]}`).join(" · ")}: ${d.reason}`;

/** A node's accessible name: what it is, where it plays, its state and the eye's reading. */
export function nodeName(n: ProductionNode): string {
  const at = n.at === undefined ? "" : ` at ${clock(n.at)}`;
  return `${n.label}, ${STATION_NAME[n.station].toLowerCase()}${at}, ${NODE_STATE[n.state].word}${n.drift === undefined ? "" : `; ${driftName(n.drift)}`}`;
}

/** A still for a take or the cut: the image of the keyframe it starts from (a take's first keyframe input). */
export function posterOf(p: Production, n: ProductionNode): string | undefined {
  if (n.media?.kind === "image") return n.media.src;
  const by = new Map(p.nodes.map((m) => [m.id, m]));
  for (const id of n.madeFrom) {
    const m = by.get(id);
    if (m === undefined || (m.station !== "keyframe" && m.station !== "clip")) continue;
    const src = posterOf(p, m);
    if (src !== undefined) return src;
  }
  return undefined;
}

/** A tile's caption: the label without the take-start suffix (`K00 start` → `K00`). */
export const caption = (n: ProductionNode): string => n.label.replace(/ start$/, "").replace(/^P-/, "");

/** The facts the map prints under the basin's name and in a river's tip. */
export function basinFacts(p: Production): string[] {
  const c = counts(p.nodes);
  const takes = p.nodes.filter((n) => n.station === "clip").length;
  return [`${p.title} · cast ${p.cast.name}`, `${takes} takes · ${clock(p.track.seconds)} of track · ${countLine(c)}`];
}

/** `34 keyframes × ~4 min · 6 clips × ~25 min · 1 cut` - the redo as it would queue, the work's own units. */
export function receipt(r: Redo): string {
  const parts: string[] = [];
  if (r.keyframes.n > 0) parts.push(`${r.keyframes.n} keyframe${r.keyframes.n === 1 ? "" : "s"} × ~${r.keyframes.minEach} min`);
  if (r.clips.n > 0) parts.push(`${r.clips.n} clip${r.clips.n === 1 ? "" : "s"} × ~${r.clips.minEach} min`);
  if (r.cuts > 0) parts.push(`${r.cuts} cut${r.cuts === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/** The redo's machine time in minutes (the cut is assembly: counted as nothing). */
export const redoMinutes = (r: Redo): number => r.keyframes.n * r.keyframes.minEach + r.clips.n * r.clips.minEach;

/** `~5 h 36 min` */
export function hours(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `~${h} h${m > 0 ? ` ${m} min` : ""}` : `~${m} min`;
}

/** The ids that went stale between two readings of a production. */
export function becameStale(before: Production, after: Production): string[] {
  const was = new Map(before.nodes.map((n) => [n.id, n.state]));
  return after.nodes.filter((n) => n.state === "stale" && was.get(n.id) !== "stale").map((n) => n.id);
}

/* ── A: the river of stations ────────────────────────────────────────── */

export type StationCol = { readonly station: ProductionStation; readonly nodes: readonly ProductionNode[]; readonly counts: Counts };

/** The stations in their order, each with its nodes (keyframes and clips by their place on the clock). */
export function stationsOf(p: Production): StationCol[] {
  return PRODUCTION_STATIONS.map((station) => {
    const nodes = p.nodes.filter((n) => n.station === station).slice().sort((a, b) => (a.at ?? -1) - (b.at ?? -1));
    return { station, nodes, counts: counts(nodes) };
  });
}

/** How far downstream a node sits (its station's index): the ripple's delay, one step per station. */
export const stationIx = (n: ProductionNode): number => PRODUCTION_STATIONS.indexOf(n.station);

/* ── B: the timeline street ──────────────────────────────────────────── */

/** Where a node plays: its own `at`, else the earliest place a node made from it plays (a plate plays where it is used). */
export function playsAt(p: Production, n: ProductionNode): number | null {
  if (n.at !== undefined) return n.at;
  const used = p.nodes.filter((m) => m.madeFrom.includes(n.id) && m.at !== undefined).map((m) => m.at as number);
  return used.length > 0 ? Math.min(...used) : null;
}

export type Ruler = {
  readonly sections: readonly { readonly name: string; readonly x0: number; readonly x1: number }[];
  /** Beat ticks; every fourth is a bar. */
  readonly beats: readonly { readonly x: number; readonly bar: boolean }[];
  readonly lyrics: readonly { readonly x: number; readonly text: string }[];
  /** Clock marks every `step` seconds. */
  readonly marks: readonly { readonly x: number; readonly label: string }[];
};

const frac = (t: TrackMap, s: number): number => Math.max(0, Math.min(1, s / t.seconds));

/** The track's map as fractions of its length. */
export function rulerOf(t: TrackMap, step = 10): Ruler {
  const marks: { x: number; label: string }[] = [];
  for (let s = 0; s <= t.seconds; s += step) marks.push({ x: frac(t, s), label: clock(s) });
  return {
    sections: t.sections.map((s) => ({ name: s.name, x0: frac(t, s.start), x1: frac(t, s.end) })),
    beats: t.beats.map((b, i) => ({ x: frac(t, b), bar: i % 4 === 0 })),
    lyrics: t.lyrics.map((l) => ({ x: frac(t, l.t), text: l.text })),
    marks,
  };
}

export type LaneItem = { readonly node: ProductionNode; readonly x0: number; readonly x1: number };
export type Lane = { readonly station: ProductionStation; readonly items: readonly LaneItem[] };

/**
 * The stations as lanes above the ruler, track at the bottom: a keyframe at its `at`, a clip and the cut as spans, a
 * plate where it is first used, the look and the cast across the whole track (everything is made under them).
 */
export function lanesOf(p: Production): Lane[] {
  const t = p.track;
  const whole = new Set<ProductionStation>(["track", "cast"]);
  return PRODUCTION_STATIONS.filter((s) => s !== "track").map((station) => {
    const items = p.nodes
      .filter((n) => n.station === station)
      .map((n): LaneItem | null => {
        if (whole.has(station) || n.id === "look") return { node: n, x0: 0, x1: 1 };
        const at = playsAt(p, n);
        if (at === null) return null;
        const x0 = frac(t, at);
        return { node: n, x0, x1: n.dur === undefined ? x0 : frac(t, at + n.dur) };
      })
      .filter((x): x is LaneItem => x !== null)
      .sort((a, b) => a.x0 - b.x0);
    return { station, items };
  });
}

/** The section a moment falls in. */
export const sectionAt = (t: TrackMap, s: number): string => t.sections.find((x) => s >= x.start && s < x.end)?.name ?? "";

/* ── C: the film strip ───────────────────────────────────────────────── */

export type FilmScene = {
  readonly clip: ProductionNode;
  /** The keyframe the take starts from (its first keyframe input). */
  readonly first: ProductionNode | null;
  readonly keyframes: readonly ProductionNode[];
  readonly section: string;
};

/** Each take in clock order with the keyframes it was made from. */
export function scenesOf(p: Production): FilmScene[] {
  const by = new Map(p.nodes.map((n) => [n.id, n]));
  return p.nodes
    .filter((n) => n.station === "clip")
    .slice()
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
    .map((clip) => {
      const keyframes = clip.madeFrom.map((id) => by.get(id)).filter((n): n is ProductionNode => n !== undefined && n.station === "keyframe");
      return { clip, first: keyframes[0] ?? null, keyframes, section: sectionAt(p.track, clip.at ?? 0) };
    });
}

/** The keyframes no take is made from (the storyboard before the first take, and any orphan). */
export function unfed(p: Production): ProductionNode[] {
  const fed = new Set(p.nodes.filter((n) => n.station === "clip").flatMap((n) => n.madeFrom));
  return p.nodes.filter((n) => n.station === "keyframe" && !fed.has(n.id)).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
}
