import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Nothing here may open the operator's store or read the operator's calendar: the kernel, the v1
// publish root and every channel variable are pointed at, or cleared to, this file's own world
// before a module that reads them is imported.
const W = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "floor-real-"));
  process.env["GRAVITONE_STORE_PATH"] = join(dir, "store.sqlite");
  process.env["PUBLISH_STORE_DIR"] = join(dir, "publish");
  for (const v of ["PUBLISH_MODE", "PUBLISH_MISSED_MIN", "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN", "TIKTOK_ACCESS_TOKEN", "INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_USER_ID", "GRAVITONE_DRY_ONLY", "GRAVITONE_PRODUCE_SIDE"]) delete process.env[v];
  // Nor the machine's PATH: the readiness probes ffmpeg and ffprobe through a shell (`where`, lib/
  // publish/channels.ts onPath) unless the posture forbids spawning. No case here reads that row,
  // and on a loaded box the two shells alone ran the first realSlots() past its 5 s (6.8 s measured).
  process.env["LOCAL_BINARIES"] = "off";
  return { dir };
});

import type { Actor } from "@gt/domain/event";
import type { LibraryItemInput } from "@gt/domain/libraryItem";
import { putMediaFacts, upsertItems } from "@gt/kernel/library/write";
import { recordFailure, recordMetric, recordPublication } from "@gt/kernel/slots/outcome";
import { getSlot } from "@gt/kernel/slots/read";
import { sweep } from "@gt/kernel/slots/sweep";
import { createSlot } from "@gt/kernel/slots/write";
import type { Store } from "@gt/kernel/store";

import { realCancel, realDetail, realItems, realMove, realPublishNow, realSchedule, realSlots, unimported } from "../../app/(studio)/floor/_calendar/real.ts";
import { NO_STORE_FACTS, readinessOf, standingWords } from "../../app/(studio)/floor/_calendar/readiness.ts";
import { closeKernel, kernel } from "../../lib/kernelStore.ts";
import { projectPublish, publishSource } from "../../lib/ledger/v1/sources/publish.ts";

// THE CALENDAR'S REAL SIDE over a kernel of its own (Phase 6 wave B, L63): the rail and the month
// read the slot table, a record joins its publication, metrics and Library media, the verbs are
// kernel transactions carrying the revision the operator saw, and a new slot is refused in the
// engine's words. The readiness is the v1 seam's, with names and never values.

const A = "video:export:aaaa1111";
const B = "video:export:bbbb2222";
const C = "video:export:cccc3333";
const sha = (c: string): string => c.repeat(64);
const OP = { who: "op-1" };
const PUB: Actor = { kind: "machine", id: "publisher" };
const NOW = Date.now();
const iso = (min: number): string => new Date(NOW + min * 60_000).toISOString();
const ctx = { now: new Date(NOW), universe: "real" as const };
/** This process's environment (channel variables cleared above) with `over` set. */
const envWith = (over: Readonly<Record<string, string>>): NodeJS.ProcessEnv => ({ ...process.env, ...over });

let store: Store;

const video = (id: string, s: string): LibraryItemInput => ({
  kind: "video",
  id,
  title: `export ${id.slice(-4)}`,
  state: "ratified",
  collections: [],
  origin: "studio",
  rights: { use: "publishable" },
  source: "real",
  lineage: [],
  vocabulary: { format: "film", captions: "none" },
  media: { sha256: s, bytes: 1, mime: "video/mp4" },
});

function must<T>(r: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: Error }): T {
  if (!r.ok) throw r.error;
  return r.value;
}

/** Put a due slot through a real claim, then end it the way the publisher would. */
function claimed(id: string): number {
  const rep = must(sweep(store, { now: Date.now(), windowMs: 3_600_000, wired: new Set(["youtube", "tiktok", "instagram", "blog"]), itemExists: () => true }, { claim: true, only: new Set([id]) }));
  const c = rep.claimed.find((x) => x.slot.id === id);
  if (c === undefined) throw new Error(`${id} was not claimed`);
  return c.fence;
}

beforeAll(() => {
  store = must(kernel()).store;
  must(upsertItems(store, [{ item: video(A, sha("a")), meta: "film · 1.0 MB", extras: {}, feed: "t" }, { item: video(B, sha("b")), meta: "film · 2.0 MB", extras: {}, feed: "t" }, { item: video(C, sha("d")), meta: "ad · 3.0 MB", extras: {}, feed: "t" }], { styleOf: () => undefined }));
  must(putMediaFacts(store, [{ sha: sha("a"), decodable: true, mime: "video/mp4", w: 64, h: 36, durationS: 2, posterSha: sha("c"), meanLuma: 120, nearBlack: false, probedAt: iso(-60), error: null }]));
  // A failed youtube slot, a published tiktok slot with one reading, a dry one, and a blog slot.
  must(createSlot(store, { id: "sl-fail", libraryItemId: B, channel: "youtube", at: iso(-5), title: "Chokepoint", description: "strait", tags: [] }, { kind: "operator", id: "op" }));
  must(recordFailure(store, "sl-fail", claimed("sl-fail"), "upload: 403 quotaExceeded - The request cannot be completed because you have exceeded your quota.", PUB));
  must(createSlot(store, { id: "sl-out", libraryItemId: A, channel: "tiktok", at: iso(-6), title: "Harbor · vertical", description: "", tags: [] }, { kind: "operator", id: "op" }));
  const out = must(recordPublication(store, "sl-out", claimed("sl-out"), { platformId: "tt-777", url: "https://www.tiktok.com/@gt/video/777", visibility: "private", dry: false, publishedAt: iso(-4) }, PUB));
  must(recordMetric(store, { publicationId: out.publication.id, at: iso(-1), views: 1200, watchTimeS: null, avgViewDurationS: null, likes: 40, comments: null, shares: 3, subsDelta: null }, PUB));
  must(createSlot(store, { id: "sl-dry", libraryItemId: B, channel: "tiktok", at: iso(-7), title: "Chokepoint · vertical", description: "", tags: [] }, { kind: "operator", id: "op" }));
  must(recordPublication(store, "sl-dry", claimed("sl-dry"), { platformId: null, visibility: "private", dry: true, publishedAt: iso(-3) }, PUB));
  must(createSlot(store, { id: "sl-blog", libraryItemId: "article:run-1", channel: "blog", at: iso(24 * 60), title: "Routing, explained", description: "", tags: [] }, { kind: "operator", id: "op" }));
});

afterAll(() => {
  closeKernel();
});

describe("the rail and the month read the slot table", () => {
  it("draws every slot - failed with its sentence, published, the blog - with the item it publishes", async () => {
    const r = await realSlots();
    expect(r.problems).toEqual([]);
    const by = new Map(r.slots.map((s) => [s.id, s]));
    expect(by.get("sl-fail")).toMatchObject({ status: "failed", channel: "youtube", item: B, error: "upload: 403 quotaExceeded - The request cannot be completed because you have exceeded your quota." });
    expect(by.get("sl-out")?.status).toBe("published");
    expect(by.get("sl-blog")?.channel).toBe("blog");
  });

  it("marks a slot published by a dry run, so the schedule form does not read it as holding its item", async () => {
    const r = await realSlots();
    const by = new Map(r.slots.map((s) => [s.id, s]));
    expect(by.get("sl-dry")).toMatchObject({ status: "published", dry: true });
    expect(by.get("sl-out")).not.toHaveProperty("dry");
  });

  it("says a v1 calendar the importer has not taken in, and stops saying it once MIGRATED is beside it", () => {
    const root = path.join(W.dir, "v1");
    mkdirSync(root, { recursive: true });
    expect(unimported(root)).toBeNull();
    writeFileSync(path.join(root, "schedule.json"), "{}");
    expect(unimported(root)?.error).toBe(`${root} has no MIGRATED marker - node pipeline/import/slots.mts lists what is not imported`);
    writeFileSync(path.join(root, "MIGRATED"), "MIGRATED");
    expect(unimported(root)).toBeNull();
  });
});

describe("readiness", () => {
  it("names each channel's variables and whether they are set, never their values; blog goes by approve", () => {
    const f = must(readinessOf([], NO_STORE_FACTS, envWith({ YOUTUBE_CLIENT_ID: "very-secret-id" })));
    expect(f.channels.map((c) => [c.channel, c.state])).toEqual([["youtube", "dry"], ["tiktok", "not_wired"], ["instagram", "not_wired"], ["blog", "act"]]);
    expect(f.channels[0]?.env).toEqual([{ name: "YOUTUBE_CLIENT_ID", present: true }, { name: "YOUTUBE_CLIENT_SECRET", present: false }, { name: "YOUTUBE_REFRESH_TOKEN", present: false }]);
    expect(JSON.stringify(f)).not.toContain("very-secret-id");
    expect([...f.wired].sort()).toEqual(["blog", "youtube"]);
  });

  it("holds YouTube dry under GRAVITONE_DRY_ONLY even when PUBLISH_MODE asks for live", () => {
    const env = { PUBLISH_MODE: "live", YOUTUBE_CLIENT_ID: "x", YOUTUBE_CLIENT_SECRET: "y", YOUTUBE_REFRESH_TOKEN: "z" };
    expect(must(readinessOf([], NO_STORE_FACTS, envWith(env))).mode).toBe("live");
    expect(must(readinessOf([], NO_STORE_FACTS, envWith({ ...env, GRAVITONE_DRY_ONLY: "1" }))).mode).toBe("dry");
  });

  it("refuses a PUBLISH_MODE typo in its words rather than reading it as either mode", () => {
    const r = readinessOf([], NO_STORE_FACTS, envWith({ PUBLISH_MODE: "lvie" }));
    expect(r.ok ? null : r.error.message).toBe("PUBLISH_MODE must be 'dry' or 'live', got 'lvie'");
  });

  it("carries each channel's standing from the ledger: last out, a standing failure verbatim with its run", async () => {
    const f = (await realSlots()).facts;
    const yt = f?.channels.find((c) => c.channel === "youtube");
    const tt = f?.channels.find((c) => c.channel === "tiktok");
    expect([yt?.lastFailure?.error.slice(0, 25), yt?.lastFailure?.inARow]).toEqual(["upload: 403 quotaExceeded", 1]);
    expect([tt?.lastOut !== undefined, tt?.lastFailure]).toEqual([true, undefined]);
  });

  it("draws a failure only while it stands: a channel that went out since wears no red", () => {
    const base = { channel: "youtube" as const, attempts: 3, lastAttemptAt: "2026-10-17T10:00:00.000Z", lastSuccessAt: "2026-10-17T10:00:00.000Z", lastError: "auth: invalid_grant" };
    expect(standingWords({ ...base, failuresSinceSuccess: 0 })).toEqual({ lastOut: "2026-10-17T10:00:00.000Z" });
    expect(standingWords({ ...base, lastSuccessAt: null, failuresSinceSuccess: 3 }).lastFailure).toEqual({ at: "2026-10-17T10:00:00.000Z", error: "auth: invalid_grant", inARow: 3 });
  });

  it("says the publish timer is not running when no worker holds it, rather than inventing a tick", async () => {
    expect((await realSlots()).facts?.tick).toEqual({ running: false, lastRunAt: null, nextDueAt: null });
  });
});

describe("one slot, whole", () => {
  it("a published slot shows its publication and its metrics with null kept unmeasured", () => {
    const v = must(realDetail("sl-out"));
    expect([v.source, v.dry, v.publicationId === undefined]).toEqual(["real", undefined, false]);
    expect([v.metrics?.views, v.metrics?.comments, v.metrics?.shares]).toEqual([{ value: 1200 }, { value: null }, { value: 3 }]);
    expect(v.media).toEqual({ kind: "video", src: `/api/blob/${sha("a")}?type=video%2Fmp4`, poster: `/api/blob/${sha("c")}?type=image%2Fjpeg` });
  });

  it("a dry publication says so and has no numbers; a blog slot is its pull request card", () => {
    const d = must(realDetail("sl-dry"));
    expect([d.dry, d.metrics]).toEqual([true, undefined]);
    expect(must(realDetail("sl-blog")).media).toEqual({ kind: "post" });
  });
});

describe("the verbs, at the slot's revision", () => {
  it("schedules an export: one kernel transaction, the operator named on its slot.create", () => {
    const v = must(realSchedule({ item: A, channel: "youtube", at: iso(120), title: "Glass Harbor", description: "d", tags: ["heist"] }, OP));
    expect([v.slot.status, v.rev, v.source, v.mode]).toEqual(["scheduled", 1, "real", "dry"]);
    const ev = must(store.read((r) => r.get("SELECT actor_id AS a FROM events WHERE type = 'slot.create' AND subject_id = ?", v.slot.id)));
    expect(ev?.["a"]).toBe("op-1");
  });

  it("refuses an item already on the channel, an unwired channel, an unknown item and a blog slot - in the engine's words", () => {
    const words = (r: { ok: boolean; error?: { message: string } }) => (r.ok ? null : (r.error?.message ?? ""));
    const d = { item: A, channel: "youtube", at: iso(180), title: "again", description: "", tags: [] };
    expect(words(realSchedule(d, OP))).toMatch(new RegExp(`^${A} is already on youtube \\(slot sl-`));
    expect(words(realSchedule({ ...d, item: B, channel: "instagram" }, OP))).toBe("instagram is not wired");
    expect(words(realSchedule({ ...d, item: "video:export:none" }, OP))).toBe("unknown item video:export:none");
    expect(words(realSchedule({ ...d, channel: "blog" }, OP))).toMatch(/approve on the Board/);
  });

  it("a move on a stale revision writes nothing and says what the slot is now; on its own revision it moves", () => {
    const made = must(realSchedule({ item: B, channel: "youtube", at: iso(300), title: "Chokepoint again", description: "", tags: [] }, OP));
    const moved = must(realMove({ id: made.slot.id, at: iso(400), baseRev: 1, nowMs: Date.now(), who: OP }));
    expect([moved.slot.publishAt, moved.rev]).toEqual([iso(400), 2]);
    const stale = realCancel({ id: made.slot.id, baseRev: 1, nowMs: Date.now(), who: OP });
    expect(stale.ok ? null : [stale.error.code, stale.error.message]).toEqual(["conflict", `cancel Chokepoint again: it changed since it was opened - now scheduled for ${iso(400)}`]);
    expect(must(getSlot(store, made.slot.id)).rev).toBe(2);
  });

  it("cancelling a failed slot keeps the platform's sentence", () => {
    const v = must(realCancel({ id: "sl-fail", nowMs: Date.now(), who: OP }));
    expect([v.slot.status, v.slot.error]).toEqual(["cancelled", "upload: 403 quotaExceeded - The request cannot be completed because you have exceeded your quota."]);
  });

  it("publish now is never a claim: the slot is due now and waits for the tick; a blog slot is refused", () => {
    const fresh = must(realSchedule({ item: C, channel: "youtube", at: iso(700), title: "Now", description: "", tags: [] }, OP));
    const now = Date.now();
    const v = must(realPublishNow({ id: fresh.slot.id, nowMs: now, who: OP }));
    expect([v.slot.status, must(getSlot(store, fresh.slot.id)).fence]).toEqual(["scheduled", undefined]);
    expect(Date.parse(v.slot.publishAt)).toBe(now);
    const blog = realPublishNow({ id: "sl-blog", nowMs: now, who: OP });
    expect(blog.ok ? null : [blog.error.code, blog.error.message]).toEqual(["refused", "publish Routing, explained: a scheduled blog slot is not published from here"]);
  });

  it("offers the Library's exports, with their keyframe as the poster", () => {
    const items = must(realItems());
    expect(items.map((i) => i.id).sort()).toEqual([A, B, C]);
    expect(items.find((i) => i.id === A)?.poster).toBe(`/api/blob/${sha("c")}?type=image%2Fjpeg`);
  });
});

describe("the ledger's calendar row", () => {
  it("reads the kernel's unsettled slots while this process holds the kernel, each a door to its record", async () => {
    const r = must(await publishSource.read());
    const slots = projectPublish(r, ctx).slots ?? [];
    expect(slots.some((s) => s.id === "sl-out" || s.id === "sl-dry")).toBe(false);
    const open = slots.find((s) => s.title === "Glass Harbor");
    expect(open?.href).toBe(`/floor?cal=1&slot=${encodeURIComponent(open?.id ?? "")}`);
    expect(open?.status).toBe("scheduled");
  });
});
