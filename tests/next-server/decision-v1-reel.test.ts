// THE REEL DECISION ADAPTER (lib/decision/v1/sources/reel.ts) AND A KEPT CUT ON THE CALENDAR
// (lib/producers/reelActs.ts) - over a temp reel folder, a temp exports root and an in-memory kernel.
//
// Pinned: each of a reel's three stops opens as its own packet with one cell; a reject owes a reason and an
// agent's keep is refused at the preview; the verdict is written into the folder by the apply alone, with the
// digest of what was judged; a subject made again is round 2, and the old verdict stops counting. A kept cut
// with a `calendar:` line becomes exactly one youtube slot carrying publish.json's words, over a copy of the
// judged bytes in the exports; a second delivery makes nothing more; a cut rendered again after the keep is
// never scheduled under it.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-reel-"));
  process.env["REELS_STORE_DIR"] = path.join(dir, "reels");
  process.env["PUBLISH_EXPORTS_DIR"] = path.join(dir, "exports");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["PUBLISH_MODE"] = "dry";
  return dir;
});

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ok } from "@gt/domain/errors";
import type { PacketId } from "@gt/domain/ids";
import { patchMany } from "@gt/kernel/decision/driver";
import { head } from "@gt/kernel/decision/read";
import { getSlot, listSlots } from "@gt/kernel/slots/read";
import type { Store } from "@gt/kernel/store";
import { encodeSchedule, proposeAt } from "@gt/ui/components/review/schedule.ts";

import { liveReelPiles, makeReelAdapter } from "../../lib/decision/v1/sources/reel.ts";
import { reelExportId, reelScheduleOf, reelSlotId } from "../../lib/producers/reelActs.ts";
import { parseStopRun, roundOf, type ReelVerdict, type ReelVerdicts } from "../../lib/reel/store.ts";
import { defaultPublish, refuseRejectedProof } from "../../pipeline/reel/stops.mts";
import { must, openFlow } from "./decision-v1-harness.ts";

const REELS = path.join(ROOT, "reels");
const EXPORTS = path.join(ROOT, "exports");
const blobDir = path.join(ROOT, "blobs");
const SLUG = "demo-race";
const dir = path.join(REELS, SLUG);
const sha = (s: string | Buffer): string => createHash("sha256").update(s).digest("hex");

let current: Store | undefined;
const adapter = makeReelAdapter({ store: () => ok(current as Store) });

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const IDEA = { title: "Every demo win, race by race", hook: "Who has won the most demo races?", path: "The lead changes hands twice in three seasons: Ada, then Bo in 2024, then Ada again." };
const SOURCE = { name: "Demo Results Archive", url: "https://example.invalid/results", licence: "CC BY 4.0", fetchedAt: "2026-11-01" };
const TABLE = { v: 1, unit: "wins", granularity: "race", cumulative: true, periods: ["2024-01", "2024-02"], entities: [{ id: "ada", name: "Ada", values: [1, 2] }], events: [], source: SOURCE };
const CONTINUITY = { ok: true, steps: 80, entities: 12, onScreen: 10, leadChanges: 2, movements: 21, events: 6, leaders: [{ entity: "Ada", from: "2024-01" }], failures: [] };
const GATES = { seek: { ok: true, detail: "max 0.000% pixels differ" }, legibility: { ok: true, detail: "smallest 31px" }, motion: { ok: true, detail: "motion in 56/60 s" }, length: { ok: true, detail: "1800 frames at 30 fps" }, renderer: "ANGLE (test)", renderMs: 1 };
const PUBLISH = { title: "Every demo win, race by race", description: "Who has won the most demo races?\n\nSource: Demo Results Archive (https://example.invalid/results)\nLicence: CC BY 4.0", tags: ["demo", "race", "statistics"] };
const CARD = "the card";
const SHEET = "the sheet";
const CUT = "the cut, 1800 frames";

function seed(): void {
  rmSync(REELS, { recursive: true, force: true });
  rmSync(EXPORTS, { recursive: true, force: true });
  mkdirSync(path.join(dir, "short", "proof"), { recursive: true });
  mkdirSync(path.join(dir, "short", "render"), { recursive: true });
  // A folder a session has only just started holds no reel.json: it is nobody's pile.
  mkdirSync(path.join(REELS, "just-started"), { recursive: true });
  const json = (rel: string, v: unknown) => writeFileSync(path.join(dir, rel), JSON.stringify(v));
  json("reel.json", { v: 1, slug: SLUG, stage: "planned", idea: IDEA, tableSha: "t1", cuts: { short: { stage: "cut", frames: 1800, dataSha: "d1" } }, updatedAt: "2026-11-17T09:00:00.000Z" });
  json("table.json", TABLE);
  json("continuity.json", CONTINUITY);
  json("short/render/gates.json", GATES);
  json("short/publish.json", PUBLISH);
  writeFileSync(path.join(dir, "data-card.png"), CARD);
  writeFileSync(path.join(dir, "short", "proof", "sheet.png"), SHEET);
  writeFileSync(path.join(dir, "short", "render", "strip.mp4"), CUT);
}
const verdicts = (): ReelVerdicts => JSON.parse(readFileSync(path.join(dir, "verdicts.json"), "utf8")) as ReelVerdicts;
const words = <T,>(r: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): string => (r.ok ? "ok" : `${r.error.code}: ${r.error.message}`);
const agentKeep = (store: Store, id: PacketId, cell: string) => must(store.tx((t) => patchMany(t, { by: "agent", surface: "cli", packetId: id, baseRev: head(t, id).rev, changes: [{ key: `${id}::${cell}`, verdict: "keep" }] })));

beforeEach(() => {
  seed();
  current = undefined;
});

describe("a reel's stops, named and counted (pure)", () => {
  it("a run id is a slug and a stop, the round only from 2 up", () => {
    expect(parseStopRun("f1-wins:data")).toEqual({ slug: "f1-wins", key: "data", kind: "data" });
    expect(parseStopRun("f1-wins:short:cut:2")).toEqual({ slug: "f1-wins", key: "short:cut", kind: "cut", cut: "short", round: 2 });
    for (const bad of ["f1-wins", "f1-wins:short", "f1-wins:tall:cut", "f1-wins:data:1", "../x:data", "a:b:data"]) expect(parseStopRun(bad), bad).toBeUndefined();
  });

  it("a verdict is of the bytes it judged: the same bytes are decided, other bytes are the next round", () => {
    const v: ReelVerdict = { verdict: "reject", reasons: ["legibility"], by: "operator", at: "2026-11-17T10:00:00.000Z", of: "aa", round: 1 };
    expect(roundOf(undefined, "aa")).toEqual({ round: 1, open: true });
    expect(roundOf(v, "aa")).toEqual({ round: 1, open: false });
    expect(roundOf(v, "bb")).toEqual({ round: 2, open: true });
  });

  it("a kept cut with no calendar line takes the day after the commit, 08:00 UTC, on youtube; another channel is refused", () => {
    expect(must(reelScheduleOf(undefined, "2026-11-17T21:40:00.000Z"))).toEqual({ channel: "youtube", publishAt: "2026-11-18T08:00:00.000Z" });
    expect(words(reelScheduleOf(encodeSchedule({ channel: "tiktok", publishAt: "2026-11-20T17:00:00.000Z" }), "2026-11-17T21:40:00.000Z"))).toBe("invalid: a reel cut goes out on youtube, not on tiktok");
    expect(words(reelScheduleOf("calendar: youtube friday", "2026-11-17T21:40:00.000Z"))).toBe('invalid: calendar: "friday" is not an ISO instant');
  });

  it("publish.json's defaults name the source and its licence, in a title a platform takes and three to eight tags", () => {
    const p = defaultPublish(IDEA, { unit: "wins", granularity: "race", source: SOURCE }, "short");
    expect(p.title).toBe(IDEA.title);
    expect(p.title.length).toBeLessThanOrEqual(100);
    expect(p.description).toContain("Source: Demo Results Archive (https://example.invalid/results)");
    expect(p.description).toContain("Licence: CC BY 4.0");
    expect(p.tags.length).toBeGreaterThanOrEqual(3);
    expect(p.tags.length).toBeLessThanOrEqual(8);
  });
});

describe("each stop is a packet of one", () => {
  it("opens with the stop's id, its one cell and what the cell shows", async () => {
    const data = must(adapter.packet(must(await adapter.read({ runId: `${SLUG}:data` }))));
    expect(data.packet).toMatchObject({ id: `pkt:reel:${SLUG}:data`, source: "reel", mode: "matrix-cull", lane: "video", runId: `${SLUG}:data` });
    expect(data.packet.items.map((c) => [c.id, c.media.sha256])).toEqual([["data", sha(CARD)]]);
    expect(data.present.items["data"]).toEqual({ label: IDEA.title, meta: "80 race steps · 10 on screen · 2 lead changes · 21 overtakes · 6 events", prompt: "Source: Demo Results Archive · CC BY 4.0" });
    expect(data.present.rows).toEqual([{ id: "data", label: "table", group: "data" }]);
    expect(data.urls["data"]).toBe(`/api/foundry/file?run=${SLUG}&path=data-card.png&kind=reel&v=${sha(CARD).slice(0, 12)}`);

    const proof = must(adapter.packet(must(await adapter.read({ runId: `${SLUG}:short:proof` }))));
    expect(proof.packet.id).toBe(`pkt:reel:${SLUG}:short:proof`);
    expect(proof.packet.items.map((c) => [c.id, c.media.sha256])).toEqual([["proof", sha(SHEET)]]);
    expect(proof.present.items["proof"]?.meta).toBe("short · 1080x1920 · 60 s · 12 frames");

    const cut = must(adapter.packet(must(await adapter.read({ runId: `${SLUG}:short:cut` }))));
    expect(cut.packet.id).toBe(`pkt:reel:${SLUG}:short:cut`);
    expect(cut.packet.items.map((c) => [c.id, c.media.sha256, c.media.mime])).toEqual([["cut", sha(CUT), "video/mp4"]]);
    expect(cut.present.items["cut"]?.meta).toBe("short · 60 s · ANGLE (test) · silent");
    expect(cut.present.oracle).toEqual({ passed: true, summary: "seek: max 0.000% pixels differ | legibility: smallest 31px | motion: motion in 56/60 s | length: 1800 frames at 30 fps" });
    expect(cut.urls["cut"]).toContain("path=short%2Frender%2Fstrip.mp4&kind=reel");
  });

  it("the cut with its bed is the one shown; a stop the reel has not reached, and a folder that is not a reel, are no pile", async () => {
    writeFileSync(path.join(dir, "short", "render", "final.mp4"), "the cut with its bed");
    expect(must(await adapter.read({ runId: `${SLUG}:short:cut` })).rel).toBe("short/render/final.mp4");
    expect(words(await adapter.read({ runId: `${SLUG}:long:cut` }))).toBe(`not-found: reel ${SLUG}: there is nothing to judge at the long:cut stop yet`);
    expect(words(await adapter.read({ runId: "just-started:data" }))).toContain("not-found: no reel just-started");
    const piles = must(await liveReelPiles());
    expect(piles.map((p) => p.packetId)).toEqual([`pkt:reel:${SLUG}:data`, `pkt:reel:${SLUG}:short:proof`, `pkt:reel:${SLUG}:short:cut`]);
    expect(piles[0]).toMatchObject({ source: "reel", title: `${IDEA.title} · table`, media: "video", pending: 1, href: `/board/${encodeURIComponent(`pkt:reel:${SLUG}:data`)}` });
  });
});

describe("the verdict, written back by the apply alone", () => {
  it("a reject without a reason is refused; an agent's keep is refused; an operator's keep commits and verdicts.json holds it", async () => {
    const flow = await openFlow(adapter, `${SLUG}:data`, blobDir);
    const id = flow.plan.packet.id;
    flow.patch([{ candidate: "data", verdict: "reject" }]);
    expect(words(flow.commit())).toBe("refused: decision: 1 rejected need a reason: data");
    agentKeep(flow.store, id, "data");
    expect(words(flow.preview())).toBe(`refused: reel ${SLUG}: only an operator keeps the data stop`);
    expect(existsSync(path.join(dir, "verdicts.json"))).toBe(false);

    // The same verdict again is no new decision, so the agent's keep is taken back before the operator's is given.
    flow.patch([{ candidate: "data", verdict: null }]);
    flow.patch([{ candidate: "data", verdict: "keep" }]);
    const p = must(flow.preview());
    expect(p.consequence.counts).toEqual({ kept: 1, rejected: 0, undecided: 0 });
    expect(p.consequence.writes.map((w) => [w.kind, w.detail])).toEqual([["index-row", "keep"]]);
    must(flow.commit());
    expect((await flow.deliver())?.result).toBe("applied");
    expect(verdicts()).toEqual({ v: 1, stops: { data: { verdict: "keep", reasons: [], by: "operator", at: expect.any(String) as string, of: sha(CARD), round: 1 } } });
    // Decided: the stop is no longer waiting, and its packet does not open again over the same card.
    expect(must(await liveReelPiles()).map((x) => x.id)).toEqual([`${SLUG}:short:proof`, `${SLUG}:short:cut`]);
    expect(words(await adapter.read({ runId: `${SLUG}:data` }))).toBe(`not-found: reel ${SLUG}: the data stop is decided (keep, round 1)`);
  });

  it("a rejected proof stops `cut` until the frames are shot again; the new sheet is round 2 of the stop", async () => {
    const flow = await openFlow(adapter, `${SLUG}:short:proof`, blobDir);
    flow.patch([{ candidate: "proof", verdict: "reject", reasons: ["layout", "legibility"], note: "the axis labels collide at 0:40" }]);
    expect(must(flow.preview()).consequence.writes.map((w) => w.detail)).toEqual(["reject (legibility, layout) · `cut` is refused until the frames are shot again"]);
    must(flow.commit());
    const claim = flow.claim();
    must(await adapter.apply(claim));
    must(await adapter.apply(claim));
    expect(verdicts().stops["short:proof"]).toMatchObject({ verdict: "reject", reasons: ["legibility", "layout"], note: "the axis labels collide at 0:40", by: "operator", of: sha(SHEET), round: 1 });
    expect(readFileSync(path.join(dir, "verdicts.log.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);
    await expect(refuseRejectedProof(dir, "short")).rejects.toThrow("the short proof was rejected on the Board - reject (legibility, layout): the axis labels collide at 0:40");

    writeFileSync(path.join(dir, "short", "proof", "sheet.png"), "the sheet, shot again");
    await expect(refuseRejectedProof(dir, "short")).resolves.toBeUndefined();
    const again = must(adapter.packet(must(await adapter.read({ runId: `${SLUG}:short:proof` }))));
    expect(again.packet.id).toBe(`pkt:reel:${SLUG}:short:proof:2`);
    expect(again.present.meta).toBe(`reel · ${SLUG} · round 2 · round 1 rejected: legibility, layout`);
    expect(must(await liveReelPiles()).map((x) => x.id)).toContain(`${SLUG}:short:proof:2`);
    // The first round's delivery, arriving late, changes nothing: the head is not rewritten.
    must(await adapter.apply(claim));
    expect(verdicts().stops["short:proof"]?.round).toBe(1);
    // Another verdict for a round the folder already holds is refused, never an overwrite.
    writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify({ v: 1, stops: { "short:proof": { ...verdicts().stops["short:proof"], verdict: "keep", reasons: [] } } }));
    expect(words(await adapter.apply(claim))).toBe(`refused: reel ${SLUG}: the short:proof stop already holds keep for round 1; this packet says reject (legibility, layout)`);
  });
});

describe("a kept cut on the Calendar", () => {
  const AT = "2026-11-20T17:00:00.000Z";

  it("an operator's keep with a schedule makes exactly one youtube slot from publish.json, over a copy of the judged cut; a second delivery makes nothing more", async () => {
    const flow = await openFlow(adapter, `${SLUG}:short:cut`, blobDir);
    current = flow.store;
    flow.patch([{ candidate: "cut", verdict: "keep", note: encodeSchedule({ channel: "youtube", publishAt: AT, notes: "pin the source in the first comment" }) }]);
    const c = must(flow.preview()).consequence;
    expect(c.writes.map((w) => [w.kind, w.target.replace(/^.*[\\/]/, ""), w.detail])).toEqual([
      ["index-row", "verdicts.json short:cut", "keep"],
      ["file", "reel-demo-race-short.mp4", "copied: short/render/strip.mp4"],
      ["index-row", "calendar · youtube · 20 Nov 17:00 UTC", "slot sl-reel-demo-race-short: Every demo win, race by race"],
    ]);
    must(flow.commit());
    const claim = flow.claim();
    must(await adapter.apply(claim));

    const slots = must(listSlots(flow.store));
    expect(slots).toHaveLength(1);
    expect(slots[0]?.slot).toMatchObject({ id: reelSlotId(SLUG, "short"), libraryItemId: `video:export:${reelExportId(SLUG, "short")}`, channel: "youtube", at: AT, state: "scheduled", title: PUBLISH.title, description: PUBLISH.description, tags: PUBLISH.tags });
    expect(readFileSync(path.join(EXPORTS, "reel-demo-race-short.mp4"), "utf8")).toBe(CUT);
    expect(JSON.parse(readFileSync(path.join(EXPORTS, "reel-demo-race-short.json"), "utf8"))).toEqual({ projectId: "reel", sha256: sha(CUT) });
    expect(existsSync(path.join(EXPORTS, "reel-demo-race-short.partial.mp4"))).toBe(false);
    expect(verdicts().stops["short:cut"]).toMatchObject({ verdict: "keep", by: "operator", of: sha(CUT), round: 1, note: `calendar: youtube ${AT}\npin the source in the first comment` });

    // Redelivered, and redelivered after the cut was rendered again: the same slot, the same export, the same verdict.
    must(await adapter.apply(claim));
    writeFileSync(path.join(dir, "short", "render", "strip.mp4"), "the cut, rendered again");
    must(await adapter.apply(claim));
    expect(must(listSlots(flow.store)).map((r) => r.slot.id)).toEqual([reelSlotId(SLUG, "short")]);
    expect(readFileSync(path.join(EXPORTS, "reel-demo-race-short.mp4"), "utf8")).toBe(CUT);
    expect(readFileSync(path.join(dir, "verdicts.log.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("a keep with no calendar line is slotted the day after its commit, 08:00 UTC", async () => {
    const flow = await openFlow(adapter, `${SLUG}:short:cut`, blobDir);
    current = flow.store;
    flow.patch([{ candidate: "cut", verdict: "keep" }]);
    expect(must(flow.preview()).consequence.writes[2]?.target).toBe("calendar · youtube · the day after the commit, 08:00 UTC");
    must(flow.commit());
    const claim = flow.claim();
    must(await adapter.apply(claim));
    if (claim.outcome.act !== "commit") throw new Error("expected a commit");
    expect(must(getSlot(flow.store, reelSlotId(SLUG, "short"))).slot.at).toBe(proposeAt(Date.parse(claim.outcome.result.at)));
  });

  it("a cut rendered again between the keep and its delivery is not scheduled, and the keep is not recorded", async () => {
    const flow = await openFlow(adapter, `${SLUG}:short:cut`, blobDir);
    current = flow.store;
    flow.patch([{ candidate: "cut", verdict: "keep", note: encodeSchedule({ channel: "youtube", publishAt: AT }) }]);
    must(flow.commit());
    const claim = flow.claim();
    writeFileSync(path.join(dir, "short", "render", "strip.mp4"), "the cut, rendered again");
    expect(words(await adapter.apply(claim))).toBe(`conflict: reel ${SLUG}: the short cut was rendered again after it was judged; what is in the folder now is not what was kept, so nothing was scheduled`);
    expect(must(listSlots(flow.store))).toEqual([]);
    expect(existsSync(path.join(EXPORTS, "reel-demo-race-short.mp4"))).toBe(false);
    expect(existsSync(path.join(EXPORTS, "reel-demo-race-short.partial.mp4"))).toBe(false);
    expect(existsSync(path.join(dir, "verdicts.json"))).toBe(false);
  });

  it("refuses at the preview: another channel, a line that does not read, words the platform would not take, no publish.json; a reject schedules nothing", async () => {
    const flow = await openFlow(adapter, `${SLUG}:short:cut`, blobDir);
    current = flow.store;
    flow.patch([{ candidate: "cut", verdict: "keep", note: encodeSchedule({ channel: "blog", publishAt: AT }) }]);
    expect(words(flow.preview())).toBe("invalid: a reel cut goes out on youtube, not on blog");
    flow.patch([{ candidate: "cut", verdict: "keep", note: "calendar: youtube soon" }]);
    expect(words(flow.preview())).toBe('invalid: calendar: "soon" is not an ISO instant');
    flow.patch([{ candidate: "cut", verdict: "keep" }]);
    writeFileSync(path.join(dir, "short", "publish.json"), JSON.stringify({ ...PUBLISH, title: "a <b> title" }));
    expect(words(flow.preview(must(await adapter.read({ runId: `${SLUG}:short:cut` }))))).toBe(`invalid: reel ${SLUG}: short/publish.json: title/description may not contain '<' or '>'`);
    rmSync(path.join(dir, "short", "publish.json"));
    const bare = must(await adapter.read({ runId: `${SLUG}:short:cut` }));
    expect(words(flow.preview(bare))).toBe(`invalid: reel ${SLUG}: short/publish.json is not written yet: run \`cut\` again`);
    expect(must(adapter.packet(bare)).losses.map((l) => l.grade)).toEqual(["dropped"]);

    flow.patch([{ candidate: "cut", verdict: "reject", reasons: ["pacing"] }]);
    must(flow.commit(bare));
    expect((await flow.deliver())?.result).toBe("applied");
    expect(must(listSlots(flow.store))).toEqual([]);
    expect(existsSync(EXPORTS)).toBe(false);
    expect(verdicts().stops["short:cut"]).toMatchObject({ verdict: "reject", reasons: ["pacing"], round: 1 });
  });
});
