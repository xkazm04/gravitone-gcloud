// THE FLOOR'S LANES AND PILES, as data (prototype index.html `LANES`, `MODE_NAME`, `tallyOf`,
// `renderFloor`'s row sizing). Pure and zod-free: every Floor component and the page's client
// island read it, so it may not reach @gt/domain's schemas (the client-closure guard).
//
// The lane list is a TWIN of @gt/domain/lane MEDIA_LANES, typed against it: a lane added to the
// domain fails the `satisfies` below until it has a keycap, a name and a shelf name here, and the
// unit test holds the order equal (⇧1-4 bind by position, so order is behaviour, not taste).

import type { MediaLane } from "@gt/domain/lane";

export type FloorLane = {
  readonly id: MediaLane;
  /** The digit that opens it and, with ⇧, focuses it. */
  readonly n: 1 | 2 | 3 | 4;
  readonly name: string;
  /** The ratified column's name for this lane (prototype `shelfName`). */
  readonly shelf: string;
};

export const FLOOR_LANES = [
  { id: "image", n: 1, name: "Image", shelf: "Library · styles" },
  { id: "article", n: 2, name: "Article", shelf: "Library · posts" },
  { id: "audio", n: 3, name: "Audio", shelf: "Library · kept takes" },
  { id: "video", n: 4, name: "Video", shelf: "Projects" },
] as const satisfies readonly FloorLane[];

export function isFloorLane(v: string | null | undefined): v is MediaLane {
  return FLOOR_LANES.some((l) => l.id === v);
}

/** The lane drawn at 1-based position `n` (the digit keys). */
export function laneAt(n: number): FloorLane | undefined {
  return FLOOR_LANES.find((l) => l.n === n);
}

/** The three desks a Weir pile can open (plan §2.2 Packet.mode). */
export type PileMode = "matrix-cull" | "blind-pair" | "packet-review";

export const MODE_NAME: { readonly [M in PileMode]: string } = {
  "matrix-cull": "matrix cull",
  "blind-pair": "blind pair",
  "packet-review": "packet review",
};

/**
 * Which desk a v1 pile opens. v1's projection says only `cull` (keep/reject over a set) or
 * `gate` (approve claimed improvements); the gate's desk follows its medium, as the prototype's
 * did: an article is read as a packet (approve, rework, reject), a Dojo gate is judged blind,
 * pair by pair (COMMON decision 7).
 */
export function modeOf(kind: "cull" | "gate", media: MediaLane): PileMode {
  if (kind === "cull") return "matrix-cull";
  return media === "article" ? "packet-review" : "blind-pair";
}

/**
 * The lanes' row sizes (prototype renderFloor `--rows`). One lane focused takes the height and
 * the rest fold to a summary row; with none focused, a lane whose ratified column holds
 * something grows, and an empty one keeps a floor so its piles never vanish.
 */
export function laneRows(focus: MediaLane | null, shelfFilled: (lane: MediaLane) => boolean): string {
  return FLOOR_LANES.map((l) =>
    focus !== null
      ? focus === l.id
        ? "minmax(0,1fr)"
        : "var(--h-lane-folded)"
      : shelfFilled(l.id)
        ? "minmax(0,1fr)"
        : "minmax(var(--h-lane-min),.7fr)",
  ).join(" ");
}

/** A share of done work for a progress rail, or null when there is nothing to divide. */
export function progressShare(p: { readonly done: number; readonly total: number } | undefined): number | null {
  if (p === undefined || !(p.total > 0)) return null;
  return Math.min(1, Math.max(0, p.done / p.total));
}
