import "server-only";

// THE CALENDAR'S REAL SIDE (Phase 6 wave B, L63) - over the kernel's slot store
// (@gt/kernel/slots, L57): the rail and the month read the slot table, a slot's record joins its
// publication, its metrics and the Library item it publishes, and every verb is one kernel
// transaction with its `slot.*` event. What wave A refused here ("the slot store is not the
// kernel's yet") is answered now; the contract (./contract.ts) did not move.
//
// What this side has to decide that the fixture does not:
//   the read      a read never sweeps (COMMON decision 2): a slot whose hour passed since the last
//                 tick reads `scheduled` until the worker's next one, and the rail draws it as
//                 overdue. Cancelled and published slots are rows like any other, so the history
//                 the v1 live read dropped is drawn without a second source (v1's rail joined the
//                 ledger's `publish` acts back in; the publication is the slot's own row now).
//   the player    the Library's media facts, computed at ingest: the export plays from
//                 /api/blob/<sha> and its poster is the keyframe the media-facts job cut (v1
//                 app/calendar/poster.tsx grabbed a frame in the browser). A blog slot shows its
//                 pull request, the publication's url, once the approve opened it.
//   the metrics   v1's semantics (@gt/domain/publication publicationTotals): the latest non-null
//                 reading per metric, null drawn as unmeasured, a dry run with no numbers at all.
//   a stale verb  the store answers a verb on a moved revision with `conflict`; it is re-worded
//                 here from the slot as it now is, so the operator reads what happened to it.
//   v1 not moved  a v1 schedule.json with no MIGRATED marker beside it is a calendar the importer
//                 has not taken in yet: said as a problem with the command, never drawn as empty.

import { existsSync } from "node:fs";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { publicationTotals, type Publication } from "@gt/domain/publication";
import { channelSchema, exportIdOf, type Slot } from "@gt/domain/slot";
import { libraryDetail } from "@gt/kernel/library/detail";
import { queryLibrary } from "@gt/kernel/library/query";
import { getSlot, listSlots, publicationOfIn, snapshotsIn } from "@gt/kernel/slots/read";
import type { SlotRow } from "@gt/kernel/slots/schema";
import { cancelSlot, createSlot, moveSlot, publishNow, type Readiness as Ready } from "@gt/kernel/slots/write";
import type { Store } from "@gt/kernel/store";
import type { RailSlot } from "@gt/ui/components/floor/calendar.ts";
import type { ScheduleDraft, ScheduleItem } from "@gt/ui/components/floor/schedule.ts";
import { canPublishNow } from "@gt/ui/components/floor/slot.ts";
import type { SlotMetrics, SlotView } from "@gt/ui/components/floor/SlotDetail.tsx";

import { outPath } from "../../../../lib/fixtures/roots.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { blobRoute } from "../../../../lib/library/media.ts";
import { ledgerFor } from "../../_shell/links.ts";
import type { CalendarFacts, Problem } from "./contract.ts";
import { readinessOf, storeFactsIn, type Readiness } from "./readiness.ts";

const POSTER_TYPE = "image/jpeg";
/** How many Library exports the schedule form offers (bounded-enumeration). */
export const ITEMS_CAP = 120;

/** Who acts: the signed-in operator's uid, else the operator. */
export type Who = { readonly who?: string };
const actorOf = (w: Who): Actor => ({ kind: "operator", id: w.who ?? "operator" });

const store = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

/** A slot as the rail and the month draw it; `dry` from the row, which mirrors its publication. */
export function railOfSlot(row: Pick<SlotRow, "slot" | "dry">): RailSlot {
  const s = row.slot;
  return {
    id: s.id,
    title: s.title,
    channel: s.channel,
    publishAt: s.at,
    status: s.state,
    item: s.libraryItemId,
    ...(s.error === undefined ? {} : { error: s.error }),
    ...(s.drift === undefined ? {} : { drift: s.drift }),
    ...(s.missedAt === undefined ? {} : { missedAt: s.missedAt }),
    ...(row.dry === true ? { dry: true } : {}),
  };
}

/** The v1 publish root (lib/publish/store.ts storeRoot's rule, read here without the v1 store). */
const v1Root = (): string => {
  const env = process.env["PUBLISH_STORE_DIR"]?.trim();
  return env !== undefined && env !== "" ? path.resolve(env) : outPath("publish");
};

/** A v1 calendar the importer has not taken in whole (it marks MIGRATED only when it refused
 *  nothing): a problem with its command, never an empty or a complete-looking month. */
export function unimported(root: string): Problem | null {
  if (!existsSync(path.join(root, "schedule.json")) || existsSync(path.join(root, "MIGRATED"))) return null;
  return { source: "calendar", error: `${root} has no MIGRATED marker - node pipeline/import/slots.mts lists what is not imported` };
}

export async function realSlots(): Promise<{ readonly slots: readonly RailSlot[]; readonly problems: readonly Problem[]; readonly facts?: CalendarFacts }> {
  const pending = unimported(v1Root());
  const c = ctx();
  const problems = pending === null ? [] : [pending];
  if (!c.ok) return { slots: [], problems: [...problems, { source: "calendar", error: c.error.message }] };
  const { channels, mode, lastChannel, tick } = c.value.ready;
  return { slots: c.value.rows.map(railOfSlot), problems, facts: { channels, mode, lastChannel, ...(tick === undefined ? {} : { tick }) } };
}

/* ── one slot, whole ──────────────────────────────────────────────────────── */

function metricsOf(pub: Publication, store: Store): Result<SlotMetrics | undefined> {
  if (pub.dry) return ok(undefined);
  const snaps = store.read((r) => snapshotsIn(r, pub.id));
  if (!snaps.ok) return snaps;
  const last = snaps.value.at(-1);
  if (last === undefined) return ok(undefined);
  const t = publicationTotals(pub, snaps.value).totals;
  return ok({ at: last.at, views: { value: t.views }, likes: { value: t.likes }, comments: { value: t.comments }, shares: { value: t.shares }, avgViewDurationS: t.avgViewDurationS, subsDelta: t.subsDelta });
}

function mediaOf(store: Store, s: Slot, pub: Publication | undefined): Result<SlotView["media"]> {
  if (s.channel === "blog") return ok({ kind: "post", ...(pub?.url === undefined ? {} : { pr: pub.url }) });
  const d = libraryDetail(store, s.libraryItemId);
  if (!d.ok) return d.error.code === "not-found" ? ok({ kind: "none" }) : d;
  const media = d.value.item.media;
  const src = media === undefined || !media.mime.startsWith("video/") ? null : blobRoute(media.sha256, media.mime);
  if (src === null) return ok({ kind: "none" });
  const posterSha = d.value.media?.posterSha ?? null;
  const poster = posterSha === null ? null : blobRoute(posterSha, POSTER_TYPE);
  return ok({ kind: "video", src, ...(poster === null ? {} : { poster }) });
}

function projectOf(store: Store, partId: string | undefined): Result<SlotView["project"]> {
  if (partId === undefined) return ok(undefined);
  return store.read((r) => {
    const row = r.get("SELECT p.id AS id, json_extract(p.record, '$.title') AS title FROM parts x JOIN projects p ON p.id = x.project_id WHERE x.part_id = ? AND p.listed = 1 LIMIT 1", partId);
    if (row === undefined) return undefined;
    const id = String(row["id"]);
    const title = typeof row["title"] === "string" ? row["title"] : id;
    return { title, href: `/projects/${encodeURIComponent(id)}`, runs: `/projects/runs?project=${encodeURIComponent(id)}`, steps: [] };
  });
}

export function viewOfRow(store: Store, row: SlotRow, mode: "dry" | "live"): Result<SlotView> {
  const s = row.slot;
  const pub = store.read((r) => publicationOfIn(r, s.id));
  if (!pub.ok) return pub;
  const p = pub.value;
  const media = mediaOf(store, s, p);
  if (!media.ok) return media;
  const metrics = p === undefined ? ok(undefined) : metricsOf(p, store);
  if (!metrics.ok) return metrics;
  const project = projectOf(store, s.partId);
  if (!project.ok) return project;
  return ok({
    slot: railOfSlot(row),
    rev: row.rev,
    libraryItemId: s.libraryItemId,
    description: s.description,
    tags: s.tags,
    ...(s.publicationId === undefined ? {} : { publicationId: s.publicationId }),
    ...(p?.dry === true ? { dry: true } : {}),
    media: media.value,
    ...(metrics.value === undefined ? {} : { metrics: metrics.value }),
    ...(project.value === undefined ? {} : { project: project.value }),
    ledger: ledgerFor(s.id),
    source: "real",
    mode,
  });
}

/** The channel's own mode: live only where the readiness seam says this channel uploads. */
const modeFor = (ready: Readiness, channel: string): "dry" | "live" => (ready.channels.find((c) => c.channel === channel)?.state === "live" ? "live" : "dry");

/** A verb's answer, read back and drawn; a stale revision re-worded from the slot as it now is. */
function answer(store: Store, ready: Readiness, verb: string, r: Result<SlotRow>, id: string): Result<SlotView> {
  if (r.ok) return viewOfRow(store, r.value, modeFor(ready, r.value.slot.channel));
  if (r.error.code !== "conflict" || r.error.detail !== "stale") return r;
  const now = getSlot(store, id);
  if (!now.ok) return r;
  const n = now.value.slot;
  return err("conflict", `${verb} ${n.title}: it changed since it was opened - now ${n.state} for ${n.at}`, { detail: "stale" });
}

type Ctx = { readonly store: Store; readonly rows: readonly SlotRow[]; readonly ready: Readiness };

/** The store, the calendar as it stands, and the readiness read against it - once per act. */
function ctx(): Result<Ctx> {
  const s = store();
  if (!s.ok) return s;
  const rows = listSlots(s.value);
  if (!rows.ok) return rows;
  const facts = s.value.read(storeFactsIn);
  if (!facts.ok) return facts;
  const ready = readinessOf(rows.value, facts.value);
  return ready.ok ? ok({ store: s.value, rows: rows.value, ready: ready.value }) : ready;
}

/**
 * Facts the engine checks creation and publish-now against (@gt/kernel/slots/write Readiness).
 * `itemExists` is answered from this same store's Library index, which is safe only because the
 * engine asks it BEFORE its write opens (createSlot's drift check, publishNow's readinessFor -
 * L63's finding, now the kernel's own order): a read cannot run inside a write on one store.
 * Until then this side pre-read the named items in a read of its own; the kernel owns that order
 * now, so the answer is read where it is asked. A read that fails is the store's failure, not a
 * missing item: it throws, and the action core classifies it, rather than refusing the slot as
 * `export_missing`.
 */
function engineReady(c: Ctx): Ready {
  const itemExists = (id: string): boolean => {
    const r = c.store.read((x) => x.get("SELECT 1 AS y FROM library_docs WHERE id = ?", id) !== undefined);
    if (!r.ok) throw r.error;
    return r.value;
  };
  return { wired: c.ready.wired, itemExists };
}

export function realDetail(id: string): Result<SlotView> {
  const c = ctx();
  if (!c.ok) return c;
  const row = getSlot(c.value.store, id);
  return row.ok ? viewOfRow(c.value.store, row.value, modeFor(c.value.ready, row.value.slot.channel)) : row;
}

export type VerbIn = { readonly id: string; readonly baseRev?: number; readonly nowMs: number; readonly who: Who };
const opts = (v: VerbIn) => (v.baseRev === undefined ? {} : { baseRev: v.baseRev });

export function realMove(v: VerbIn & { readonly at: string }): Result<SlotView> {
  const c = ctx();
  if (!c.ok) return c;
  const { store: st, ready } = c.value;
  return answer(st, ready, "move", moveSlot(st, v.id, v.at, actorOf(v.who), { now: v.nowMs, windowMs: ready.windowMs }, opts(v)), v.id);
}

export function realCancel(v: VerbIn): Result<SlotView> {
  const c = ctx();
  if (!c.ok) return c;
  const { store: st, ready } = c.value;
  return answer(st, ready, "cancel", cancelSlot(st, v.id, actorOf(v.who), opts(v)), v.id);
}

export function realPublishNow(v: VerbIn): Result<SlotView> {
  const c = ctx();
  if (!c.ok) return c;
  const { store: st, ready } = c.value;
  const row = getSlot(st, v.id);
  if (!row.ok) return row;
  const s = row.value.slot;
  // A blog slot goes out as its article approve's pull request (owner ruling 4): publish-now
  // would only make it due for a tick that never claims it, and it would be marked missed.
  if (!canPublishNow({ status: s.state, channel: s.channel, ...(s.drift === undefined ? {} : { drift: s.drift }) })) {
    return err("refused", `publish ${s.title}: a ${s.drift ?? s.state} ${s.channel} slot is not published from here`);
  }
  return answer(st, ready, "publish", publishNow(st, v.id, actorOf(v.who), { now: v.nowMs, ready: engineReady(c.value) }, opts(v)), v.id);
}

/** A video channel's refusal of an item that is not an export (the adapter's sentence). */
export const exportOnly = (item: string, channel: string): string => `${item} is not an export; ${channel} publishes exports`;

export function realSchedule(d: ScheduleDraft, who: Who): Result<SlotView> {
  const c = ctx();
  if (!c.ok) return c;
  const { store: st, ready } = c.value;
  const channel = channelSchema.safeParse(d.channel);
  if (!channel.success) return err("invalid", `${d.channel} is not a channel`);
  if (channel.data === "blog") return err("refused", "a blog slot is made by its article's approve on the Board, not here");
  // Every other channel publishes an export (lib/producers/publish.ts youtubeAdapter refuses
  // anything else at its tick, in these words): another Library item would be a slot that can only fail.
  if (exportIdOf(d.item) === undefined) return err("refused", exportOnly(d.item, channel.data));
  const made = createSlot(st, { libraryItemId: d.item, channel: channel.data, at: d.at, title: d.title, description: d.description, tags: d.tags }, actorOf(who), engineReady(c.value));
  return made.ok ? viewOfRow(st, made.value, modeFor(ready, channel.data)) : made;
}

/** The Library's exports, newest first: what a slot can publish (v1 listExports, now the index). */
export function realItems(): Result<readonly ScheduleItem[]> {
  const s = store();
  if (!s.ok) return s;
  const page = queryLibrary(s.value, { kind: "video", sort: "newest", limit: ITEMS_CAP });
  if (!page.ok) return page;
  return ok(
    page.value.items
      .filter((row) => exportIdOf(row.id) !== undefined)
      .map((row) => {
        const poster = blobRoute(row.cover.blobSha, row.cover.mime);
        return { id: row.id, title: row.title, meta: row.meta, ...(poster === null ? {} : { poster }) };
      }),
  );
}
