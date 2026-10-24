import "server-only";

// THE FIXTURE CALENDAR'S SIDE: an in-memory slot table over ./fixtureData.ts, and the three
// verbs as pure transitions over the domain's own record and machine (@gt/domain/slot), so the
// fixture cannot reach a state the slot store will refuse. Every write goes back through
// `slotSchema` at the door; a transition the machine does not declare is refused in its words.
//
// The verbs, as v1 had them (lib/publish/schedule.ts, app/calendar/calendarModel.ts):
//   move         scheduled -> scheduled, missed | failed -> scheduled. A moved failure loses
//                its error (it is waiting again); a drift stays - its cause did not move.
//   cancel       soft: cancelled stays in history, struck. A failure cancelled KEEPS its
//                sentence (Director decision 1; the month draws it dim).
//   publish now  overrides the missed window; never a claim on its own - the publish takes it
//                and lets it go in one act (here: scheduled -> publishing -> published at
//                once). This side runs DRY: the publication is a plan, nothing is uploaded,
//                and the slot says so (v1 `dry: true`).
//   schedule     a new slot, refused as the engine refuses it (@gt/kernel/slots/write createSlot):
//                a channel nothing can publish on, an item the fixture Library does not hold, an
//                item another slot already holds on that channel - each in the engine's words.
// Every row carries a revision, bumped by each verb; a verb sent on an older one is refused as
// the slot store refuses it (`conflict`, the work's words), so a stale tab is caught here too.
// Time is a parameter throughout; the table is seeded at the first read's hour.

import { err, ok, type Result } from "@gt/domain/errors";
import { parseAt } from "@gt/domain/door";
import { channelSchema, exportIdOf, slotMachine, slotSchema, type Slot, type SlotState } from "@gt/domain/slot";
import type { RailSlot } from "@gt/ui/components/floor/calendar.ts";
import { canSchedule, type ChannelReady, type ScheduleDraft, type ScheduleItem } from "@gt/ui/components/floor/schedule.ts";
import { canCancel, canPublishNow, moveProblem } from "@gt/ui/components/floor/slot.ts";
import type { SlotView } from "@gt/ui/components/floor/SlotDetail.tsx";

import { ledgerFor } from "../../_shell/links.ts";
import { exportOnly } from "./real.ts";
import type { CalendarFacts } from "./contract.ts";
import { CHANNEL_SEED, ITEMS, PROJECTS, SLOTS, type FixtureMetric, type FixtureSlot } from "./fixtureData.ts";

const MIN_MS = 60_000;
const HOLDER = { bootId: "fixture", pid: 1, host: "fixture" } as const;

type Extra = { readonly project?: string; readonly metric?: FixtureMetric; readonly dry?: true; readonly publishedAt?: string };
export type FixtureRow = { readonly slot: Slot; readonly extra: Extra; readonly rev: number };

/** One fixture row through the schema door: a fixture that breaks an invariant fails here. */
export function seedRow(f: FixtureSlot, anchorMs: number): Result<FixtureRow> {
  const at = new Date(anchorMs + f.at * MIN_MS).toISOString();
  const raw = {
    id: f.id,
    libraryItemId: f.item,
    channel: f.channel,
    at,
    state: f.state,
    title: f.title,
    description: f.description,
    tags: f.tags,
    ...(f.state === "publishing" ? { claim: { holder: HOLDER, at } } : {}),
    ...(f.state === "missed" ? { missedAt: new Date(anchorMs + (f.at + 60) * MIN_MS).toISOString() } : {}),
    ...(f.state === "published" ? { publicationId: `pub-${f.id}` } : {}),
    ...(f.error === undefined ? {} : { error: f.error }),
    ...(f.drift === undefined ? {} : { drift: f.drift }),
  };
  const slot = parseAt(`fixture slot ${f.id}`, slotSchema, raw);
  if (!slot.ok) return slot;
  return ok({ slot: slot.value, rev: 1, extra: { ...(f.project === undefined ? {} : { project: f.project }), ...(f.metric === undefined ? {} : { metric: f.metric }), ...(f.state === "published" ? { publishedAt: at } : {}) } });
}

/** A state walk through the machine's table, refused at the first undeclared step. */
function walk(from: SlotState, path: readonly SlotState[]): Result<SlotState> {
  let at = from;
  for (const to of path) {
    const step = slotMachine.assert(at, to);
    if (!step.ok) return step;
    at = to;
  }
  return ok(at);
}

const door = (s: Omit<Slot, "id" | "libraryItemId"> & { readonly id: string; readonly libraryItemId: string }): Result<Slot> => parseAt(`fixture slot ${s.id}`, slotSchema, s);

/** The record without the fields a waiting slot does not carry. */
function waiting(s: Slot): Omit<Slot, "error" | "missedAt" | "claim" | "publicationId"> {
  const { error: _e, missedAt: _m, claim: _c, publicationId: _p, ...rest } = s;
  return rest;
}

export function applyMove(row: FixtureRow, at: string, nowMs: number): Result<FixtureRow> {
  const problem = moveProblem({ status: row.slot.state }, at, nowMs);
  if (problem !== null) return err("refused", `move ${row.slot.id}: ${problem}`);
  const to = walk(row.slot.state, ["scheduled"]);
  if (!to.ok) return to;
  const next = door({ ...waiting(row.slot), at, state: "scheduled" });
  return next.ok ? ok({ ...row, slot: next.value }) : next;
}

export function applyCancel(row: FixtureRow): Result<FixtureRow> {
  if (!canCancel({ status: row.slot.state })) return err("refused", `cancel ${row.slot.id}: a ${row.slot.state} slot is not cancelled`);
  const to = walk(row.slot.state, ["cancelled"]);
  if (!to.ok) return to;
  const { drift: _d, ...rest } = waiting(row.slot);
  const next = door({ ...rest, state: "cancelled", ...(row.slot.error === undefined ? {} : { error: row.slot.error }) });
  return next.ok ? ok({ ...row, slot: next.value }) : next;
}

export function applyPublishNow(row: FixtureRow, nowMs: number): Result<FixtureRow> {
  const s = row.slot;
  if (!canPublishNow({ status: s.state, channel: s.channel, ...(s.drift === undefined ? {} : { drift: s.drift }) })) return err("refused", `publish ${s.id}: a ${s.drift === undefined ? s.state : "drifted"} ${s.channel} slot is not published from here`);
  const path: readonly SlotState[] = s.state === "scheduled" ? ["publishing", "published"] : ["scheduled", "publishing", "published"];
  const to = walk(s.state, path);
  if (!to.ok) return to;
  const at = new Date(nowMs).toISOString();
  const next = door({ ...waiting(s), state: "published", publicationId: `pub-dry-${s.id}` });
  return next.ok ? ok({ slot: next.value, rev: row.rev, extra: { ...row.extra, dry: true, publishedAt: at } }) : next;
}

/* ── the table ──────────────────────────────────────────────────────────── */

let table: Map<string, FixtureRow> | null = null;

function rows(nowMs: number): Result<Map<string, FixtureRow>> {
  if (table !== null) return ok(table);
  const anchor = Math.floor(nowMs / (60 * MIN_MS)) * 60 * MIN_MS;
  const out = new Map<string, FixtureRow>();
  for (const f of SLOTS) {
    const r = seedRow(f, anchor);
    if (!r.ok) return r;
    out.set(f.id, r.value);
  }
  table = out;
  return ok(out);
}

export function railOfRow({ slot: s }: FixtureRow): RailSlot {
  return {
    id: s.id,
    title: s.title,
    channel: s.channel,
    publishAt: s.at,
    status: s.state,
    ...(s.error === undefined ? {} : { error: s.error }),
    ...(s.drift === undefined ? {} : { drift: s.drift }),
    ...(s.missedAt === undefined ? {} : { missedAt: s.missedAt }),
    item: s.libraryItemId,
  };
}

export function viewOf(row: FixtureRow): SlotView {
  const { slot: s, extra } = row;
  const item = ITEMS[s.libraryItemId];
  const project = extra.project === undefined ? undefined : PROJECTS[extra.project];
  const m = extra.metric;
  const base = extra.publishedAt === undefined ? null : Date.parse(extra.publishedAt);
  return {
    slot: railOfRow(row),
    rev: row.rev,
    libraryItemId: s.libraryItemId,
    description: s.description,
    tags: s.tags,
    ...(s.publicationId === undefined ? {} : { publicationId: s.publicationId }),
    ...(extra.dry === true ? { dry: true } : {}),
    media: item === undefined ? { kind: "none" } : "video" in item ? { kind: "video", src: item.video, poster: item.poster } : { kind: "post", ...(item.pr === undefined ? {} : { pr: item.pr }) },
    ...(m === undefined || base === null
      ? {}
      : {
          metrics: {
            at: new Date(base + m.after * MIN_MS).toISOString(),
            views: { value: m.views, ...(m.viewsFloor === true ? { floor: true } : {}) },
            likes: { value: m.likes },
            comments: { value: m.comments },
            shares: { value: m.shares },
            avgViewDurationS: m.avgViewDurationS,
            subsDelta: m.subsDelta,
          },
        }),
    ...(project === undefined || extra.project === undefined ? {} : { project: { title: project.title, href: `/projects/${encodeURIComponent(extra.project)}`, runs: `/projects/runs?project=${encodeURIComponent(extra.project)}`, steps: project.steps } }),
    ledger: ledgerFor(s.id),
    source: "fixture",
    mode: "dry",
  };
}

export function fixtureSlots(nowMs: number): Result<readonly RailSlot[]> {
  const t = rows(nowMs);
  return t.ok ? ok([...t.value.values()].map(railOfRow)) : t;
}

export function fixtureDetail(id: string, nowMs: number): Result<SlotView> {
  const t = rows(nowMs);
  if (!t.ok) return t;
  const row = t.value.get(id);
  return row === undefined ? err("not-found", `slot ${id}: not in the fixture calendar`) : ok(viewOf(row));
}

/** Apply one verb to the table and answer the slot as it now is; a stale `baseRev` writes nothing. */
export function fixtureAct(id: string, nowMs: number, act: (row: FixtureRow) => Result<FixtureRow>, baseRev?: number): Result<SlotView> {
  const t = rows(nowMs);
  if (!t.ok) return t;
  const row = t.value.get(id);
  if (row === undefined) return err("not-found", `slot ${id}: not in the fixture calendar`);
  if (baseRev !== undefined && baseRev !== row.rev) return err("conflict", `${row.slot.title}: it changed since it was opened - now ${row.slot.state} for ${row.slot.at}`, { detail: "stale" });
  const next = act(row);
  if (!next.ok) return next;
  const landed = { ...next.value, rev: row.rev + 1 };
  t.value.set(id, landed);
  return ok(viewOf(landed));
}

/* ── putting something on the calendar ─────────────────────────────────── */

const HOLDS: readonly SlotState[] = ["scheduled", "publishing", "published"];
let minted = 0;

/** A new slot, as the engine would take it (@gt/kernel/slots/write createSlot's refusals). */
export function fixtureSchedule(d: ScheduleDraft, nowMs: number): Result<SlotView> {
  const t = rows(nowMs);
  if (!t.ok) return t;
  const channel = channelSchema.safeParse(d.channel);
  const ch = fixtureChannels(t.value).find((c) => c.channel === d.channel);
  if (!channel.success || ch === undefined) return err("invalid", `${d.channel} is not a channel`);
  if (ch.state === "act") return err("refused", "a blog slot is made by its article's approve on the Board, not here");
  if (exportIdOf(d.item) === undefined) return err("refused", exportOnly(d.item, d.channel));
  if (!canSchedule(ch)) return err("conflict", `${d.channel} is not wired`, { detail: "channel_not_wired" });
  if (ITEMS[d.item] === undefined) return err("conflict", `unknown item ${d.item}`, { detail: "export_missing" });
  const held = [...t.value.values()].find((r) => r.slot.libraryItemId === d.item && r.slot.channel === d.channel && HOLDS.includes(r.slot.state));
  if (held !== undefined) return err("conflict", `${d.item} is already on ${d.channel} (slot ${held.slot.id}, ${held.slot.state} for ${held.slot.at})`);
  minted += 1;
  const slot = door({ id: `sl-new-${minted}`, libraryItemId: d.item, channel: channel.data, at: d.at, state: "scheduled", title: d.title, description: d.description, tags: [...d.tags] });
  if (!slot.ok) return slot;
  const row: FixtureRow = { slot: slot.value, rev: 1, extra: {} };
  t.value.set(slot.value.id, row);
  return ok(viewOf(row));
}

/** The fixture Library's exports, as the schedule form offers them. */
export function fixtureItems(): readonly ScheduleItem[] {
  return Object.entries(ITEMS).flatMap(([id, x]) => ("video" in x ? [{ id, title: x.title, meta: x.meta, poster: x.poster }] : []));
}

function fixtureChannels(table: ReadonlyMap<string, FixtureRow>): ChannelReady[] {
  return CHANNEL_SEED.map((c) => {
    const mine = [...table.values()].filter((r) => r.slot.channel === c.channel);
    const out = mine.filter((r) => r.slot.state === "published" && r.extra.publishedAt !== undefined).map((r) => r.extra.publishedAt ?? "").sort().at(-1);
    // A failure stands while nothing went out after it (the real side's standing, from the ledger).
    const fails = mine.filter((r) => r.slot.state === "failed" && r.slot.error !== undefined && (out === undefined || r.slot.at > out)).sort((a, b) => b.slot.at.localeCompare(a.slot.at));
    const fail = fails[0];
    return {
      channel: c.channel,
      state: c.state,
      env: c.env.map((name) => ({ name, present: false })),
      ...(c.note === undefined ? {} : { note: c.note }),
      command: c.channel === "blog" ? "node pipeline/article.mts status" : "npx tsx pipeline/publish.mts channels --json",
      ...(out === undefined ? {} : { lastOut: out }),
      ...(fail?.slot.error === undefined ? {} : { lastFailure: { at: fail.slot.at, error: fail.slot.error, inARow: fails.length } }),
    };
  });
}

export function fixtureFacts(nowMs: number): Result<CalendarFacts> {
  const t = rows(nowMs);
  // The fixture worker ticked half a minute ago and is due again: the timer as a healthy run shows it.
  const tick = { running: true, lastRunAt: new Date(nowMs - 30_000).toISOString(), nextDueAt: new Date(nowMs).toISOString() };
  return t.ok ? ok({ channels: fixtureChannels(t.value), mode: "dry", lastChannel: null, tick }) : t;
}
