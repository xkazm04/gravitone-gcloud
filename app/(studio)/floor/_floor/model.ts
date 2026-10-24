// THE FLOOR'S PURE RULES over what the server read: which lane a run and a pile belong to, the
// order a lane draws its piles in, and the page's URL state. Client-safe: types only from lib/
// and @gt/domain. (The calendar's slots are the kernel's own rows since Phase 6 wave B: the v1
// live read and the ledger's `publish` acts the rail once joined are no longer read here.)

import type { MediaLane } from "@gt/domain/lane";
import { FLOOR_LANES, isFloorLane } from "@gt/ui/components/floor/floor.ts";

import type { LiveJob, WeirItem } from "../../../../lib/ledger/v1/types.ts";
import { pileOrder } from "../../_shell/facts.ts";
import type { ProduceJob } from "../../projects/_port/contract.ts";

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

/**
 * The runs the Floor's composers launched, as their lane's Foundry column draws them beside v1's
 * live work (./load.ts): a run with no medium has no lane to stand in, a project's run is the
 * project's (Runs shows it there), and a done or cancelled run is no longer work on the floor.
 * Each is a door to its job in Runs.
 */
export function floorRunsOf(jobs: readonly ProduceJob[]): LiveJob[] {
  return jobs.flatMap((j) =>
    j.media === undefined || j.projectId !== undefined || j.state === "done" || j.state === "cancelled"
      ? []
      : [{ source: "produce", id: j.id, title: j.title, lane: j.lane, media: j.media, state: j.state, ...(j.state === "running" ? { startedAt: new Date(j.s).toISOString() } : {}), attempt: j.attempt, ...(j.error === undefined ? {} : { error: j.error }), href: `/projects/runs?job=${encodeURIComponent(`kernel:${j.id}`)}` }],
  );
}

export type FloorUrl = {
  readonly lane: MediaLane | null;
  readonly cal: boolean;
  readonly day: string | null;
  /** Channels the month hides (`?off=tiktok,blog`), sorted, so one view has one URL. */
  readonly off: readonly string[];
  /** The slot whose record is open over the Floor (`?slot=<id>`), with or without the month. */
  readonly slot: string | null;
  /** The schedule sheet (`?new=1`), with the Library item it was asked for (`&item=<id>`). */
  readonly schedule: { readonly item: string | null } | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CHANNEL = /^[a-z][a-z0-9-]{0,31}$/;
const SLOT = /^[^\s/?#&]{1,400}$/;

/** `?lane=image&cal=1&day=2026-10-15&off=tiktok&slot=sl-x`; anything unknown is dropped, never guessed. */
export function parseFloorUrl(q: Readonly<Record<string, string | string[] | undefined>>): FloorUrl {
  const one = (k: string): string | null => {
    const v = q[k];
    return typeof v === "string" && v !== "" ? v : null;
  };
  const lane = one("lane");
  const day = one("day");
  const slot = one("slot");
  const item = one("item");
  const off = [...new Set((one("off") ?? "").split(",").filter((c) => CHANNEL.test(c)))].sort();
  return { lane: isFloorLane(lane) ? lane : null, cal: one("cal") === "1", day: day !== null && DAY.test(day) ? day : null, off, slot: slot !== null && SLOT.test(slot) ? slot : null, schedule: one("new") === "1" ? { item: item !== null && SLOT.test(item) ? item : null } : null };
}

export function floorSearch(u: FloorUrl): string {
  const q = new URLSearchParams();
  if (u.lane !== null) q.set("lane", u.lane);
  if (u.cal) q.set("cal", "1");
  if (u.cal && u.day !== null) q.set("day", u.day);
  if (u.cal && u.off.length > 0) q.set("off", [...u.off].sort().join(","));
  if (u.slot !== null) q.set("slot", u.slot);
  if (u.schedule !== null) q.set("new", "1");
  if (u.schedule !== null && u.schedule.item !== null) q.set("item", u.schedule.item);
  const s = q.toString();
  return s === "" ? "" : `?${s.replace(/%2C/g, ",")}`;
}

/** The slot level's address: the month stays open beneath it when it was. */
export const slotHref = (id: string, cal = true): string => `/floor?${cal ? "cal=1&" : ""}slot=${encodeURIComponent(id)}`;

/** The schedule sheet's address, over the month: a Library item's Schedule act links here. */
export const scheduleHref = (item?: string): string => `/floor?cal=1&new=1${item === undefined ? "" : `&item=${encodeURIComponent(item)}`}`;
