// A DROP IS A REQUEST — the pure half of asking.
//
// `admits()` is the authority's answer to "what would happen if", and it is
// asked ONCE per candidate placement at the moment a drag starts, never per
// pointer move: `buildVerdicts` makes every call it will ever make for that drag
// up front (items x columns), and the pointer then only looks answers up.
//
// The authority is not asked about two things:
//   · the card's own column — dropping a card on its own stage and band is a
//     LANE change (`isLaneOnly`), usually the interface's own business, and
//     `admits(item, to, band)` has no lane in its signature to answer about;
//   · the card's own cell — that is "home", a drop that means nothing.
// `move()` is still the authority for a lane change; only the preview is local.

import {
  isLaneOnly,
  type MoveCost,
  type MoveOffer,
  type MoveRequest,
  type PipelineEntry,
  type PipelineItem,
  type PipelineSource,
} from "@/lib/board/pipeline";

import type { Layout } from "./geometry";
import type { Verdict } from "./types";

type Admits = Pick<PipelineSource, "admits">;

export interface Verdicts {
  /** What dropping the whole set on (lane, col) would do. Memoized. */
  verdictFor(lane: number, col: number): Verdict;
  /** How many times the authority was asked — all of them before the first move. */
  asked: number;
}

const offerToVerdict = (o: MoveOffer): Verdict =>
  o.kind === "ok" ? { kind: "ok", laneOnly: false } : o.kind === "needs" ? { kind: "needs", need: o.needs, prompt: o.prompt, cost: o.cost } : { kind: "refused", reason: o.reason };

const RANK: Record<Verdict["kind"], number> = { home: 0, ok: 1, needs: 2, refused: 3 };

export function buildVerdicts(source: Admits, layout: Layout, ids: readonly string[]): Verdicts {
  const nC = layout.columns.length;
  const rows: { slot: { lane: number; col: number }; offers: (Verdict | null)[] }[] = [];
  let asked = 0;
  for (const id of ids) {
    const entry = layout.entryOf.get(id);
    const slot = layout.slotOf.get(id);
    if (!entry || !slot) continue;
    const offers: (Verdict | null)[] = [];
    for (let c = 0; c < nC; c++) {
      if (c === slot.col) {
        offers.push(null);
        continue;
      }
      const col = layout.columns[c];
      asked++;
      offers.push(offerToVerdict(source.admits(entry.item, col.stage, col.band)));
    }
    rows.push({ slot, offers });
  }

  const memo = new Map<number, Verdict>();
  return {
    get asked() {
      return asked;
    },
    verdictFor(lane, col) {
      const key = lane * nC + col;
      const hit = memo.get(key);
      if (hit) return hit;
      let out: Verdict = { kind: "home" };
      let refused = 0;
      for (const r of rows) {
        const v: Verdict = r.offers[col] ?? (r.slot.lane === lane ? { kind: "home" } : { kind: "ok", laneOnly: true });
        if (v.kind === "refused") refused++;
        if (RANK[v.kind] > RANK[out.kind]) out = v;
      }
      if (out.kind === "refused" && rows.length > 1) out = { kind: "refused", reason: `${out.reason} (${refused} of ${rows.length})` };
      memo.set(key, out);
      return out;
    },
  };
}

/** The request for one card landing in the lane named `laneKey`, column `col`.
 *  The lane is sent only when it differs from the card's own — and it is a KEY,
 *  not an index, because the board can be re-laid-out (a poll) between the
 *  moment a drop is decided and the moment it is submitted. */
export function requestFor(
  layout: Layout,
  item: PipelineItem,
  laneKey: string,
  col: number,
  answers: Pick<MoveRequest, "note" | "label" | "live"> = {},
): MoveRequest {
  const c = layout.columns[col];
  const own = layout.slotOf.get(item.id);
  return {
    itemId: item.id,
    to: c.stage,
    band: c.band,
    ...(own && layout.lanes[own.lane].key !== laneKey ? { lane: laneKey } : {}),
    ...answers,
  };
}

/** Is this request a lane change only? (Re-exported so the canvas has one door.) */
export const laneOnly = (entry: PipelineEntry, req: MoveRequest): boolean => isLaneOnly(entry.placement, req);

/** A cost, in the figures the authority gave and no others. */
export function costLine(cost: MoveCost | undefined): string {
  if (!cost) return "";
  const range = (lo: number | undefined, hi: number | undefined, f: (n: number) => string) =>
    lo === undefined && hi === undefined ? "" : lo === undefined ? f(hi!) : hi === undefined || hi === lo ? f(lo) : `${f(lo)}–${f(hi)}`;
  const parts = [
    range(cost.usdLow, cost.usdHigh, (n) => `$${n.toFixed(2)}`),
    range(cost.turnsLow, cost.turnsHigh, (n) => `${n}`) && `${range(cost.turnsLow, cost.turnsHigh, (n) => `${n}`)} turns`,
    cost.seconds !== undefined ? `~${Math.round(cost.seconds)} s` : "",
  ].filter(Boolean);
  return [...parts, cost.note].join(" · ");
}
