// A DAY'S AGENT SPEND REQUESTS ON THE BOARD (spark athena-control-mcp WP3) - lib/decision/v1/sources/spend.ts
// through the REAL kernel's decision driver, over a FAKE spend-request store and FAKE produce doors (the
// adapter's seam): one packet per day, a row per request whose one words cell IS the request id; the
// re-price beside the filed price; K launching ONE live job per request at the card's stop point, once
// however often the claim is delivered; X refused at the commit without a reason, and its reasons and
// note handed to decideSpendRequest; the day's Floor pile, which the header's NEXT reaches.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Nothing here opens a store, but the registry's live bindings must never find the operator's.
vi.hoisted(() => {
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  process.env["GRAVITONE_STORE_PATH"] = path.join(os.tmpdir(), `gt-dv1-spend-${process.pid}`, "gravitone.sqlite");
});

import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { spendPacketId, type SpendRequest, type SpendSubject } from "@gt/domain/mcp";
import type { Receipt } from "@gt/domain/produce";
import type { Decision } from "@gt/kernel/spend-requests/store";

import { nextPile } from "../../app/(studio)/_shell/facts.ts";
import { adapterFor } from "../../lib/decision/v1/registry.ts";
import { BOARD, INTERRUPTED, makeSpendAdapter, spendPilesOf, type Launched, type SpendDoors, type SpendStore } from "../../lib/decision/v1/sources/spend.ts";
import { firstSentence, totalWords } from "../../lib/decision/v1/sources/spendWords.ts";
import type { WeirItem } from "../../lib/ledger/v1/types.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const DAY = "2026-10-24";
const ATHENA: Actor = { kind: "agent", id: "athena" };
const blobDir = "unused-no-media";

function receipt(usd: number, o: { token?: string; provider?: string; model?: string; unpriced?: string } = {}): Receipt {
  const line = { key: "run", label: "run", lane: "gpu.local" as const, provider: o.provider ?? "fal", model: o.model ?? "flux-pro", units: 1, seconds: 60, usd: o.unpriced === undefined ? usd : null, ...(o.unpriced === undefined ? {} : { unpricedReason: o.unpriced }), src: "model" as const, queuePos: 1, start: `${DAY}T10:00:00.000Z`, end: `${DAY}T10:01:00.000Z` };
  return { token: o.token ?? `tok-${usd}`, subject: { kind: "run", lane: "image" }, mode: "live", lines: [line], totals: { seconds: 60, usd: o.unpriced === undefined ? usd : 0, unpriced: o.unpriced === undefined ? 0 : 1, src: "model" }, queuePos: 1, etaAt: `${DAY}T10:01:00.000Z`, overCeiling: false, readAt: `${DAY}T09:00:00.000Z` };
}

const run = (text: string): SpendSubject => ({ kind: "run", input: { lane: "image", text, styleId: "ink", mechanisms: [] } });

function request(id: string, subject: SpendSubject, r: Receipt, filedAt: string): SpendRequest {
  return { id, day: DAY, actor: ATHENA, subject, receipt: r, state: "requested", filedAt };
}

const CUT = Date.parse(`${DAY}T09:30:00.000Z`);
const A = "sr_aaaaaaaaaaaa";
const B = "sr_bbbbbbbbbbbb";

type World = {
  readonly rows: Map<string, SpendRequest>;
  readonly decided: { id: string; d: Decision; actor: Actor }[];
  readonly launches: { subject: SpendSubject; token: string; ceilingUsd: number | undefined; actor: Actor }[];
  store: SpendStore;
  doors: SpendDoors;
  /** What the door prices each request at now, by the run's text. */
  prices: Map<string, Receipt>;
  launchAnswer: (n: number) => Result<Launched>;
};

function world(): World {
  const rows = new Map<string, SpendRequest>([
    [A, request(A, run("A paper crane unfolds in the rain. Then it flies."), receipt(0.4, { provider: "fal", model: "flux-pro" }), `${DAY}T08:00:00.000Z`)],
    [B, request(B, run("A lighthouse rations the light"), receipt(1.2, { provider: "replicate", model: "sdxl" }), `${DAY}T09:30:00.000Z`)],
  ]);
  const w: World = {
    rows,
    decided: [],
    launches: [],
    prices: new Map(),
    launchAnswer: (n) => ok({ kind: "launched", jobIds: [`job:${n}`] }),
    store: undefined as unknown as SpendStore,
    doors: undefined as unknown as SpendDoors,
  };
  const put = (id: string, f: (r: SpendRequest) => SpendRequest): Result<SpendRequest> => {
    const r = rows.get(id);
    if (r === undefined) return err("not-found", `no spend request ${id}`);
    const next = f(r);
    rows.set(id, next);
    return ok(next);
  };
  w.store = {
    requested: (day) => ok([...rows.values()].filter((r) => r.day === day && r.state === "requested")),
    pending: () => ok([...rows.values()].filter((r) => r.state === "requested")),
    get: (id) => ok(rows.get(id)),
    decide: (id, d, actor) => {
      w.decided.push({ id, d, actor });
      return put(id, (r) => (d.verdict === "confirmed" ? { ...r, state: "confirmed" } : { ...r, state: "refused", reasons: d.reasons, ...(d.note === undefined ? {} : { note: d.note }) }));
    },
    launched: (id, jobIds) => put(id, (r) => ({ ...r, state: "launched", jobIds })),
    failed: (id, failure) => put(id, (r) => ({ ...r, state: "failed", failure })),
  };
  w.doors = {
    price: async (subject) => {
      const req = [...rows.values()].find((r) => r.subject === subject);
      return ok({ receipt: (subject.kind === "run" ? w.prices.get(subject.input.text) : undefined) ?? req?.receipt ?? receipt(0) });
    },
    launch: async (subject, r, ceilingUsd, actor) => {
      w.launches.push({ subject, token: r.token, ceilingUsd, actor });
      return w.launchAnswer(w.launches.length);
    },
  };
  return w;
}

const adapterOf = (w: World) => makeSpendAdapter({ store: () => ok(w.store), doors: () => w.doors });

describe("spend adapter - one packet per day, a words cell per request", () => {
  it("is the registry's spend adapter; a day of 2 requests opens one packet of 2 rows, the cell id the request id", async () => {
    expect(adapterFor("spend").ok).toBe(true);
    const w = world();
    const flow = await openFlow(adapterOf(w), DAY, blobDir);
    const { packet, present, initial, losses, urls } = flow.plan;
    // The bare day (@gt/domain/mcp spendPacketId) resolves to the day's pile at its newest request.
    expect(packet.id).toBe(`${spendPacketId(DAY)}/${CUT}`);
    expect([packet.source, packet.mode, packet.runId, packet.lane, packet.title]).toEqual(["spend", "matrix-cull", `${DAY}/${CUT}`, "image", `spend ${DAY}`]);
    expect(packet.items.map((c) => [c.id, c.row, c.media.mime])).toEqual([
      [A, A, "text/plain"],
      [B, B, "text/plain"],
    ]);
    expect([initial, losses, urls]).toEqual([[], [], { [A]: "", [B]: "" }]);
    expect(present.rows).toEqual([
      { id: A, label: "image · A paper crane unfolds in the rain.", group: "spend" },
      { id: B, label: "image · A lighthouse rations the light", group: "spend" },
    ]);
    expect(present.items[A]).toEqual({ label: "$0.40", meta: "fal/flux-pro", prompt: `agent:athena · ${DAY}T08:00:00.000Z` });
    expect(present.meta).toBe(`spend · ${DAY} · 2 · $1.60`);
  });

  it("a re-priced request shows both prices; an unreadable price keeps the filed one with the reason verbatim", async () => {
    const w = world();
    w.prices.set("A paper crane unfolds in the rain. Then it flies.", receipt(0.55));
    const flow = await openFlow(adapterOf(w), DAY, blobDir);
    expect(flow.plan.present.items[A]).toEqual({ label: "$0.55", meta: "fal/flux-pro", prompt: `filed $0.40 · now $0.55\nagent:athena · ${DAY}T08:00:00.000Z` });
    w.doors = { ...w.doors, price: async () => err("unavailable", "the forge is down") };
    const again = must(adapterOf(w).packet(must(await adapterOf(w).read({ runId: DAY }))));
    expect(again.present.items[B]?.label).toBe("$1.20");
    expect(again.present.items[B]?.prompt).toBe(`filed $1.20 · now: the forge is down\nagent:athena · ${DAY}T09:30:00.000Z`);
  });

  it("words an unpriced total by its reason, never $0; cuts a run to its first sentence", () => {
    expect(totalWords(receipt(0, { unpriced: "Suno credits: 10 per song" }))).toBe("Suno credits: 10 per song");
    expect(firstSentence("  One.  Two. ")).toBe("One.");
    expect(firstSentence("no stop here")).toBe("no stop here");
  });

  it("previews K as a live launch stopping at the shown price and X as the agent reading why", async () => {
    const w = world();
    const flow = await openFlow(adapterOf(w), DAY, blobDir);
    flow.patch([
      { candidate: A, verdict: "keep" },
      { candidate: B, verdict: "reject", reasons: ["price"] },
    ]);
    const p = must(flow.preview());
    expect(p.consequence.counts).toEqual({ kept: 1, rejected: 1, undecided: 0 });
    expect(p.consequence.writes.map((x) => [x.candidate, x.detail])).toEqual([
      [A, "launches live, stops at $0.40"],
      [B, "refused; athena reads why (price)"],
    ]);
    expect(p.consequence.outward).toEqual([{ kind: "live launch", sentence: "image · A paper crane unfolds in the rain. · fal/flux-pro · $0.40" }]);
  });
});

describe("spend apply", () => {
  it("K launches exactly one live job per kept request at ceilingUsd = the shown price; the same claim twice launches once", async () => {
    const w = world();
    w.prices.set("A paper crane unfolds in the rain. Then it flies.", receipt(0.55, { token: "tok-now" }));
    const adapter = adapterOf(w);
    const flow = await openFlow(adapter, DAY, blobDir);
    flow.patch([
      { candidate: A, verdict: "keep" },
      { candidate: B, verdict: "reject", reasons: ["duplicate"] },
    ]);
    expect(flow.commit().ok).toBe(true);
    const claim = flow.claim();
    expect((await adapter.apply(claim)).ok).toBe(true);
    expect(w.launches).toEqual([{ subject: w.rows.get(A)?.subject, token: "tok-now", ceilingUsd: 0.55, actor: BOARD }]);
    expect(w.decided[0]).toEqual({ id: A, d: { verdict: "confirmed" }, actor: { kind: "operator", id: "board" } });
    expect(w.rows.get(A)).toMatchObject({ state: "launched", jobIds: ["job:1"] });
    // Redelivered: the request holds its outcome, so nothing launches again and nothing is decided again.
    expect((await adapter.apply(claim)).ok).toBe(true);
    expect(w.launches).toHaveLength(1);
    expect(w.decided).toHaveLength(2);
  });

  it("X without a reason is refused at the commit; the reasons and note round-trip into decideSpendRequest", async () => {
    const w = world();
    const adapter = adapterOf(w);
    const flow = await openFlow(adapter, DAY, blobDir);
    flow.patch([
      { candidate: A, verdict: "reject" },
      { candidate: B, verdict: "reject", reasons: ["vendor", "local"], note: "the local lane renders this" },
    ]);
    const refused = flow.commit();
    expect(!refused.ok && refused.error.message).toBe(`decision: 1 rejected need a reason: ${A}`);
    flow.patch([{ candidate: A, verdict: "reject", reasons: ["timing"] }]);
    expect(flow.commit().ok).toBe(true);
    expect((await adapter.apply(flow.claim())).ok).toBe(true);
    expect(w.decided).toEqual([
      { id: A, d: { verdict: "refused", reasons: ["timing"] }, actor: BOARD },
      { id: B, d: { verdict: "refused", reasons: ["vendor", "local"], note: "the local lane renders this" }, actor: BOARD },
    ]);
    expect(w.rows.get(B)).toMatchObject({ state: "refused", reasons: ["vendor", "local"], note: "the local lane renders this" });
    expect(w.launches).toEqual([]);
  });

  it("a launch the door refuses (dry-only) fails the request verbatim; a stale token re-reads once at the same stop point", async () => {
    const w = world();
    w.launchAnswer = () => err("refused", "dry-only: this process may only run dry (GRAVITONE_DRY_ONLY=1)");
    const adapter = adapterOf(w);
    const flow = await openFlow(adapter, DAY, blobDir);
    flow.patch([
      { candidate: A, verdict: "keep" },
      { candidate: B, verdict: "keep" },
    ]);
    expect(flow.commit().ok).toBe(true);
    const claim = flow.claim();
    w.launchAnswer = (n) => (n === 1 ? err("refused", "dry-only: this process may only run dry (GRAVITONE_DRY_ONLY=1)") : n === 2 ? ok({ kind: "stale", fresh: receipt(9, { token: "tok-fresh" }) }) : ok({ kind: "launched", jobIds: ["job:x"] }));
    expect((await adapter.apply(claim)).ok).toBe(true);
    expect(w.rows.get(A)).toMatchObject({ state: "failed", failure: "dry-only: this process may only run dry (GRAVITONE_DRY_ONLY=1)" });
    expect(w.launches.slice(1).map((l) => [l.token, l.ceilingUsd])).toEqual([
      ["tok-1.2", 1.2],
      ["tok-fresh", 1.2],
    ]);
    expect(w.rows.get(B)).toMatchObject({ state: "launched", jobIds: ["job:x"] });
  });

  it("a request no longer requested is skipped and named, never re-launched; an agent's K is no confirm", async () => {
    const w = world();
    const adapter = adapterOf(w);
    const flow = await openFlow(adapter, DAY, blobDir);
    flow.patch([
      { candidate: A, verdict: "keep" },
      { candidate: B, verdict: "keep" },
    ]);
    expect(flow.commit().ok).toBe(true);
    const claim = flow.claim();
    w.rows.set(A, { ...(w.rows.get(A) as SpendRequest), state: "refused", reasons: ["price"] });
    w.rows.set(B, { ...(w.rows.get(B) as SpendRequest), state: "confirmed" });
    expect(await adapter.apply(claim)).toMatchObject({ ok: false, error: { code: "refused", message: `spend ${DAY}/${CUT}: skipped ${A} is refused; this packet keeps it` } });
    expect(w.launches).toEqual([]);
    expect(w.rows.get(B)).toMatchObject({ state: "failed", failure: INTERRUPTED });
    const byAgent = { ...claim, decisions: claim.decisions.map((d) => ({ ...d, by: "agent" as const })) };
    w.rows.set(A, { ...(w.rows.get(A) as SpendRequest), state: "requested" });
    expect(await adapter.apply(byAgent)).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(w.launches).toEqual([]);
    expect(w.rows.get(A)?.state).toBe("requested");
  });
});

describe("spend - a day is an aggregate", () => {
  it("a request filed while the packet is open waits for the next; one filed after the commit opens a second packet that day", async () => {
    const w = world();
    const adapter = adapterOf(w);
    const flow = await openFlow(adapter, DAY, blobDir);
    const late = request("sr_dddddddddddd", run("A late ask."), receipt(2), `${DAY}T11:00:00.000Z`);
    w.rows.set(late.id, late);
    // The open packet's own run still reads its two rows; the preview counts only those.
    const open = must(await adapter.read({ runId: `${DAY}/${CUT}` }));
    expect(open.rows.map((r) => r.req.id)).toEqual([A, B]);
    flow.patch([
      { candidate: A, verdict: "keep" },
      { candidate: B, verdict: "reject", reasons: ["brief"] },
    ]);
    expect(must(flow.preview(open)).consequence.counts).toEqual({ kept: 1, rejected: 1, undecided: 0 });
    expect(flow.commit(open).ok).toBe(true);
    expect((await adapter.apply(flow.claim())).ok).toBe(true);
    const next = must(adapter.packet(must(await adapter.read({ runId: DAY }))));
    expect(next.packet.id).toBe(`pkt:spend:${DAY}/${Date.parse(late.filedAt)}`);
    expect(next.packet.items.map((c) => c.id)).toEqual([late.id]);
    expect(must(spendPilesOf(w.store)).map((p) => [p.packetId, p.pending])).toEqual([[`pkt:spend:${DAY}`, 1]]);
  });

  it("a day with nothing waiting opens nothing; a ref that is no day is refused", async () => {
    const w = world();
    for (const [id, r] of w.rows) w.rows.set(id, { ...r, state: "refused", reasons: ["price"] });
    expect(await adapterOf(w).read({ runId: DAY })).toMatchObject({ ok: false, error: { code: "not-found" } });
    expect(await adapterOf(w).read({ runId: "yesterday" })).toMatchObject({ ok: false, error: { code: "invalid" } });
  });
});

describe("spend on the Floor", () => {
  it("one spend pile per day with pending requests, pending 2, which nextPile returns", () => {
    const w = world();
    const other = request("sr_cccccccccccc", run("x"), receipt(1), "2026-10-23T23:00:00.000Z");
    w.rows.set(other.id, { ...other, day: "2026-10-23", state: "launched" });
    const piles = must(spendPilesOf(w.store));
    expect(piles).toEqual([{ source: "spend", id: DAY, title: `spend ${DAY}`, media: "image", kind: "cull", since: `${DAY}T08:00:00.000Z`, decided: 0, pending: 2, href: `/board/pkt:spend:${DAY}`, packetId: `pkt:spend:${DAY}` }]);
    const older: WeirItem = { source: "forge", id: "r1", title: "r1", media: "image", kind: "cull", since: `${DAY}T09:00:00.000Z`, decided: 3, pending: 0, href: "/" };
    expect(nextPile([older, ...piles])?.packetId).toBe(`pkt:spend:${DAY}`);
  });
});
