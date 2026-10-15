// THE FLOOR'S PURE RULES over what the server read: which lane a run and a pile belong to, the
// order a lane draws its piles in, the calendar's slots from v1's live slots and the ledger's
// publications, and the page's URL state. Client-safe: types only from lib/ and @gt/domain.

import type { Event } from "@gt/domain/event";
import type { MediaLane } from "@gt/domain/lane";
import type { RailSlot } from "@gt/ui/components/floor/calendar.ts";
import { FLOOR_LANES, isFloorLane } from "@gt/ui/components/floor/floor.ts";

import type { LiveJob, LiveSlot, WeirItem } from "../../../../lib/ledger/v1/types.ts";
import { pileOrder } from "../../_shell/facts.ts";

export type LaneWork = { readonly jobs: readonly LiveJob[]; readonly piles: readonly WeirItem[] };

/**
 * Runs and piles by media lane, each lane's piles in NEXT order (../../_shell/facts.ts), so
 * a lane's first pile - what its digit opens - is its oldest waiting one. A pile with nothing
 * pending is not drawn: the Weir holds what awaits the operator, and v1 lists a finished cull
 * as committable until its commit runs.
 */
export function byLane(jobs: readonly LiveJob[], weir: readonly WeirItem[]): Readonly<Record<MediaLane, LaneWork>> {
  const empty = (): { jobs: LiveJob[]; piles: WeirItem[] } => ({ jobs: [], piles: [] });
  const out: Record<MediaLane, { jobs: LiveJob[]; piles: WeirItem[] }> = { image: empty(), article: empty(), audio: empty(), video: empty() };
  for (const j of jobs) out[j.media].jobs.push(j);
  for (const w of weir) if (w.pending > 0) out[w.media].piles.push(w);
  for (const l of FLOOR_LANES) out[l.id].piles.sort(pileOrder);
  return out;
}

/** v1's unsettled slots as the rail draws them. */
export function railSlot(s: LiveSlot): RailSlot {
  return { id: s.id, title: s.title, channel: s.channel, publishAt: s.publishAt, status: s.status, ...(s.error === undefined ? {} : { error: s.error }) };
}

const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/**
 * Published slots from the ledger: v1's live read drops a slot once it has published (it is
 * history, lib/ledger/v1 LiveSlot), and the ledger's `publish` act is that history. The title is
 * the slot's own, from its `slot.create` act; a publication whose slot the ledger never saw keeps
 * its slot id as the title rather than a guessed one.
 */
export function publishedSlots(publishes: readonly Event[], creates: readonly Event[]): RailSlot[] {
  const titles = new Map<string, string>();
  for (const c of creates) {
    const t = text(c.data["title"]);
    if (t !== null) titles.set(c.subject.id, t);
  }
  return publishes.map((p) => {
    const slotId = text(p.data["slotId"]) ?? p.subject.id;
    return { id: p.subject.id, title: titles.get(slotId) ?? slotId, channel: text(p.data["channel"]) ?? "unknown", publishAt: p.occurredAt ?? p.at, status: "published" };
  });
}

export type FloorUrl = { readonly lane: MediaLane | null; readonly cal: boolean; readonly day: string | null };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `?lane=image&cal=1&day=2026-10-15`; anything unknown is dropped, never guessed. */
export function parseFloorUrl(q: Readonly<Record<string, string | string[] | undefined>>): FloorUrl {
  const one = (k: string): string | null => {
    const v = q[k];
    return typeof v === "string" && v !== "" ? v : null;
  };
  const lane = one("lane");
  const day = one("day");
  return { lane: isFloorLane(lane) ? lane : null, cal: one("cal") === "1", day: day !== null && DAY.test(day) ? day : null };
}

export function floorSearch(u: FloorUrl): string {
  const q = new URLSearchParams();
  if (u.lane !== null) q.set("lane", u.lane);
  if (u.cal) q.set("cal", "1");
  if (u.cal && u.day !== null) q.set("day", u.day);
  const s = q.toString();
  return s === "" ? "" : `?${s}`;
}
