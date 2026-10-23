import { z } from "zod";
import type { BlobRef } from "@gt/domain/blob";
import type { PacketList, PacketSummary, PacketView, PairView } from "@gt/domain/board";
import { parseAt } from "@gt/domain/door";
import { AppError } from "@gt/domain/errors";
import { packetIdSchema, runIdSchema, type CandidateId } from "@gt/domain/ids";
import { mediaLaneSchema, type MediaLane } from "@gt/domain/lane";
import { packetModeSchema, packetSourceSchema, packetStateSchema, type PacketState } from "@gt/domain/packet";
import { reasonVocabulary } from "@gt/domain/source";
import type { Reader } from "../store.ts";
import { applyStatus } from "./apply.ts";
import { returnedPlan } from "./commit.ts";
import { pairOutcomes, planUndo } from "./core.ts";
import { currentDecisions, head, items, must, pairsOf, readPacket, revealPicks, rows } from "./read.ts";

// THE BOARD'S READS - the two shapes the UI is built against (Phase 3's
// BoardPort: `loadPacket -> PacketView`, `listPackets -> PacketSummary[]`),
// assembled from the reads that already hold the rules: readPacket withholds a
// blind pair's grades, revealPicks is the only path to a machine pick. This
// file adds no rule of its own about what may be seen; it only joins.
//
// v1's Board assembled the same view in the browser from nine source modules
// (lib/board/source.ts SOURCE_ORDER), each fetching its own store, so the rail's
// counts and the sheet's items came from different reads at different moments.
// Here one read transaction answers both.

export type ViewOptions = {
  /** Where the browser fetches a candidate's bytes. The kernel holds blob refs,
   *  not routes; the app maps one to the other. */
  readonly mediaUrl: (media: BlobRef, candidate: CandidateId) => string;
};

/** The whole of one packet as the Board sheet draws it. */
export function readPacketView(r: Reader, packetId: string, opts: ViewOptions): PacketView {
  const h = head(r, packetId);
  const p = readPacket(r, packetId);
  const all = rows(r, packetId);
  const decisions = currentDecisions(r, packetId).decisions;
  const decided = decisions.filter((d) => d.verdict !== null).length;
  const pairs: PairView[] = [];
  if (p.mode === "blind-pair") {
    const arms = pairsOf(items(r, packetId));
    const armsOf = new Map<string, string>();
    for (const [row, [a, b]] of arms) armsOf.set(a, row).set(b, row);
    const outcomes = pairOutcomes(all, armsOf);
    const revealed = revealPicks(r, packetId);
    for (const [row, [a, b]] of arms) {
      const shown = revealed.get(row);
      const base = { row, a, b, outcome: outcomes.get(row) ?? null };
      pairs.push(shown === undefined ? base : { ...base, machine: { candidate: shown.candidate, agrees: shown.agrees } });
    }
  }
  const returned = returnedPlan(r, packetId);
  const apply = applyStatus(r, packetId);
  return {
    id: p.id,
    lane: p.lane,
    source: p.source,
    mode: p.mode,
    state: h.state,
    ...(p.title === undefined ? {} : { title: p.title }),
    ...(p.runId === undefined ? {} : { runId: p.runId }),
    ...(p.partId === undefined ? {} : { partId: p.partId }),
    rev: h.rev,
    items: p.items.map((c) => ({ id: c.id, ...(c.row === undefined ? {} : { row: c.row }), media: c.media, url: opts.mediaUrl(c.media, c.id), grades: c.grades })),
    decisions,
    undecided: p.items.length - decided,
    canUndo: h.state === "open" && planUndo(all) !== undefined,
    reasons: reasonVocabulary(p.source),
    pairs,
    ...(returned === undefined ? {} : { returned: must(returned).plan }),
    ...(apply === undefined ? {} : { apply }),
  };
}

export type ListOptions = {
  readonly state?: PacketState;
  readonly lane?: MediaLane;
  /** Default 100, at most 500 (bounded-enumeration: the rail never asks for "all"). */
  readonly limit?: number;
};

export const LIST_DEFAULT = 100;
export const LIST_MAX = 500;

const summaryRow = z.object({
  id: packetIdSchema,
  source: packetSourceSchema,
  lane: mediaLaneSchema,
  mode: packetModeSchema,
  state: packetStateSchema,
  rev: z.number().int().nonnegative(),
  title: z.string().nullable(),
  run_id: runIdSchema.nullable(),
  items: z.number().int().nonnegative(),
  decided: z.number().int().nonnegative(),
  opened_at: z.string(),
});

/**
 * The Weir rail: open piles first, newest first within a state, at most
 * `limit`, and whether the cut dropped any. `decided` counts candidates whose
 * newest decision is a verdict (an undo back to undecided does not count).
 */
export function listPacketSummaries(r: Reader, opts: ListOptions = {}): PacketList {
  const limit = opts.limit ?? LIST_DEFAULT;
  if (!Number.isInteger(limit) || limit < 1 || limit > LIST_MAX) throw new AppError("invalid", `decision: a packet list asks for 1..${LIST_MAX}, not ${limit}`);
  const state = opts.state ?? null;
  const lane = opts.lane ?? null;
  const found = r.all(
    `SELECT p.id, json_extract(p.body, '$.source') AS source, json_extract(p.body, '$.lane') AS lane, p.mode, p.state, p.rev,
            json_extract(p.body, '$.title') AS title, json_extract(p.body, '$.runId') AS run_id, p.opened_at,
            (SELECT count(*) FROM packet_items i WHERE i.packet_id = p.id) AS items,
            (SELECT count(*) FROM decisions d
              WHERE d.packet_id = p.id AND d.verdict IS NOT NULL
                AND d.seq = (SELECT max(d2.seq) FROM decisions d2 WHERE d2.packet_id = d.packet_id AND d2.candidate_id = d.candidate_id)) AS decided
       FROM packets p
      WHERE (? IS NULL OR p.state = ?) AND (? IS NULL OR json_extract(p.body, '$.lane') = ?)
      ORDER BY p.state = 'open' DESC, p.opened_at DESC, p.id
      LIMIT ?`,
    state, state, lane, lane, limit + 1,
  );
  const packets: PacketSummary[] = found.slice(0, limit).map((x) => {
    const s = must(parseAt("packet summary", summaryRow, x));
    const apply = applyStatus(r, s.id);
    return {
      id: s.id,
      lane: s.lane,
      source: s.source,
      mode: s.mode,
      state: s.state,
      ...(s.title === null ? {} : { title: s.title }),
      ...(s.run_id === null ? {} : { runId: s.run_id }),
      rev: s.rev,
      items: s.items,
      decided: s.decided,
      openedAt: s.opened_at,
      ...(apply === undefined ? {} : { apply }),
    };
  });
  return { packets, truncated: found.length > limit };
}
