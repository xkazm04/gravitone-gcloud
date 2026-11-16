import "server-only";

import type { CoverCard, CoverDeskView, CoverRecord } from "@gt/domain/cover";

import { coverFileHref } from "../../../../lib/sound/cover/href.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { jobExistsIn, reconcileCover, storesDisagree } from "../../../../lib/sound/cover/reconcile.ts";
import { listCovers } from "../../../../lib/sound/cover/store.ts";

// THE COVER DESK'S READ (spark track-mirror-studio, WP2): every cover newest first, each with the addresses its
// audio plays from (the file route, lib/sound/cover/href.ts), and the one in hand - `?cover=<id>`, else the
// newest. A take's address is keyed by its seed, the number a pick names; a take with no file yet has none.
type Q = Readonly<Record<string, string | readonly string[] | undefined>>;

const one = (v: string | readonly string[] | undefined): string | undefined => (typeof v === "string" ? v : v?.[0]);

export function coverCard(record: CoverRecord): CoverCard {
  const takeUrls: Record<number, string> = {};
  for (const t of record.takes) if (t.file !== undefined) takeUrls[t.seed] = coverFileHref(record.id, `take-${t.seed}`);
  return {
    record,
    sourceUrl: coverFileHref(record.id, "source"),
    takeUrls,
    ...(record.exportFile === undefined ? {} : { winnerUrl: coverFileHref(record.id, "winner") }),
    ...(record.remix === undefined ? {} : { remixUrl: coverFileHref(record.id, "remix") }),
  };
}

/** Each record as the job store has it: shown, not written. A server whose stores disagree, or whose kernel is
 *  down, cannot tell a lost job from a job it was never pointed at, and leaves the records as they are. */
function truthful(records: readonly CoverRecord[]): readonly CoverRecord[] {
  if (storesDisagree(process.env) !== undefined) return records;
  const k = kernel();
  if (!k.ok) return records;
  const exists = jobExistsIn(k.value.store);
  return records.map((r) => reconcileCover(r, exists));
}

export async function readCoverDesk(q: Q): Promise<CoverDeskView> {
  const records = [...(await listCovers())].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
  const covers = truthful(records).map(coverCard);
  const asked = one(q["cover"]);
  const current = covers.find((c) => c.record.id === asked) ?? covers[0];
  return { covers, ...(current === undefined ? {} : { current }) };
}
