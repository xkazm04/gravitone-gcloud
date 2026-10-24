import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { err, ok } from "@gt/domain/errors";
import { blobStore } from "../src/blob.ts";
import { applyNext, applyStatus, drainApplies, finishApply, redriveApply, takeApply, type Applier } from "../src/decision/apply.ts";
import { BACKOFF_MS, LEASE_MS, MAX_ATTEMPTS, planFinish, planTake, type ApplyRow } from "../src/decision/apply-core.ts";
import { commit, returnPacket } from "../src/decision/commit.ts";
import { openPacket, patchMany } from "../src/decision/driver.ts";
import { listPacketSummaries } from "../src/decision/view.ts";
import { liveEffects } from "../src/effects.ts";
import type { Store } from "../src/store.ts";
import { agent, cull, MODULES, operator, packet, pid, preview } from "./decision.fixtures.ts";
import { must, scratch, templateStores } from "./helpers.ts";

// THE APPLY OUTBOX (Phase 3 decision 2): bounded retries with backoff, a stuck
// ceiling, v1's sentence kept verbatim, claims that expire and lose politely,
// and the operator's redrive.

const T0 = Date.parse("2026-10-15T12:00:00.000Z");
let now = T0;
const tpl = templateStores(MODULES, { clock: () => new Date(now) });
const tmp = scratch("decision-apply");
afterAll(() => {
  tpl.dispose();
  tmp.dispose();
});
beforeEach(() => {
  now = T0;
});

const P = pid("run-0412");
const ALL = ["s1/a", "s1/b", "s1/c", "s2/a", "s2/b", "s2/c"];
const V1_REFUSAL = "Run run-0412 is committed; its verdicts are final.";

function committed(): Store {
  const s = tpl.fresh();
  must(s.tx((t) => openPacket(t, { packet: cull() }, agent)));
  must(s.tx((t) => patchMany(t, { ...operator, packetId: P, baseRev: 0, changes: ALL.map((c) => ({ key: `run-0412::${c}`, verdict: "keep" as const })) })));
  const shown = preview(s, P);
  must(must(s.tx((t) => commit(t, { ...operator, packetId: P, ticket: "t-1", ...shown }))));
  return s;
}

const fx = (s: Store) => liveEffects(s, blobStore(path.join(tmp.dir, "blobs")));
const failing = (code: "unavailable" | "refused", message: string): Applier => async () => err(code, message);
const fine: Applier = async () => ok(undefined);
const row = (s: Store) => must(s.read((r) => r.get("SELECT state, attempts, last_error AS lastError, next_at AS nextAt, holder FROM packet_applies WHERE packet_id = ?", P)));
const types = (s: Store, prefix: string) => must(s.read((r) => r.all("SELECT type, data FROM events WHERE type LIKE ? ORDER BY seq", `${prefix}%`)));

describe("kernel/decision - the apply core (pure)", () => {
  const at = (ms: number) => new Date(T0 + ms).toISOString();
  const base: ApplyRow = { packetId: "run-0412", act: "commit", ticket: "t", state: "pending", attempts: 1, lastError: null, nextAt: at(0), holder: "a", leaseUntil: at(LEASE_MS) };

  it("a held claim is skipped until its lease runs out, then retaken as the next attempt", () => {
    expect(planTake(base, at(LEASE_MS - 1)).kind).toBe("skip");
    expect(planTake(base, at(LEASE_MS))).toEqual({ kind: "claim", attempts: 2, leaseUntil: at(2 * LEASE_MS), reaped: true });
    expect(planTake({ ...base, holder: null, leaseUntil: null, nextAt: at(10) }, at(9)).kind, "not due").toBe("skip");
    expect(planTake({ ...base, state: "applied", holder: null, leaseUntil: null }, at(LEASE_MS)).kind).toBe("skip");
  });

  it("a finish counts only for the holder; failures back off along the ladder and stop at the ceiling", () => {
    expect(planFinish(base, "b", { ok: true }, at(1)).kind).toBe("lost");
    expect(planFinish(base, "a", { ok: false, error: "x", code: "unavailable" }, at(0))).toEqual({ kind: "retry", nextAt: at(BACKOFF_MS[0]!), error: "x" });
    expect(planFinish({ ...base, attempts: MAX_ATTEMPTS }, "a", { ok: false, error: "x", code: "unavailable" }, at(0))).toEqual({ kind: "stuck", error: "x", permanent: false });
    expect(planFinish(base, "a", { ok: false, error: "gone", code: "not-found" }, at(0))).toEqual({ kind: "stuck", error: "gone", permanent: true });
  });
});

describe("kernel/decision - the apply outbox", () => {
  it("a transient failure keeps the row pending, records v1's sentence verbatim, and backs off", async () => {
    const s = committed();
    const r = await applyNext(fx(s), { holder: "a", apply: failing("unavailable", "foundry store is held by another writer past 10000 ms") });
    expect(r).toEqual({ packetId: P, attempt: 1, result: "retry" });
    expect(row(s)).toEqual({ state: "pending", attempts: 1, lastError: "foundry store is held by another writer past 10000 ms", nextAt: new Date(T0 + BACKOFF_MS[0]!).toISOString(), holder: null });
    const failed = types(s, "decision.apply-failed");
    expect(failed).toHaveLength(1);
    expect(String(failed[0]?.["data"])).toContain("foundry store is held by another writer past 10000 ms");
    expect(await applyNext(fx(s), { holder: "a", apply: fine }), "not due before its backoff").toBeUndefined();
    now = T0 + BACKOFF_MS[0]!;
    expect(await applyNext(fx(s), { holder: "a", apply: fine })).toEqual({ packetId: P, attempt: 2, result: "applied" });
    expect(must(s.read((x) => applyStatus(x, P)))).toEqual({ act: "commit", state: "applied", attempts: 2, lastError: "foundry store is held by another writer past 10000 ms" });
  });

  it("is bounded: at the ceiling the row moves to stuck, and only a redrive brings it back", async () => {
    const s = committed();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const r = await applyNext(fx(s), { holder: "a", apply: failing("unavailable", "the render box is asleep") });
      expect(r?.result).toBe(i + 1 < MAX_ATTEMPTS ? "retry" : "stuck");
      now += 3_600_000;
    }
    expect(row(s)).toMatchObject({ state: "stuck", attempts: MAX_ATTEMPTS, lastError: "the render box is asleep" });
    expect(types(s, "decision.apply-stuck")).toHaveLength(1);
    expect(await applyNext(fx(s), { holder: "a", apply: fine })).toBeUndefined();
    expect(must(s.read((r) => listPacketSummaries(r))).packets[0]?.apply?.state).toBe("stuck");
    must(must(s.tx((t) => redriveApply(t, { ...operator, packetId: P }))));
    expect(await applyNext(fx(s), { holder: "a", apply: fine })).toEqual({ packetId: P, attempt: 1, result: "applied" });
    expect(must(s.tx((t) => redriveApply(t, { ...operator, packetId: P }))).ok, "only a stuck apply is redriven").toBe(false);
  });

  it("a permanent refusal from v1 escalates at once; a throw is a failed attempt with its message", async () => {
    const s = committed();
    expect((await applyNext(fx(s), { holder: "a", apply: failing("refused", V1_REFUSAL) }))?.result).toBe("stuck");
    expect(row(s)).toMatchObject({ state: "stuck", attempts: 1, lastError: V1_REFUSAL });
    const t = committed();
    const thrown = await applyNext(fx(t), { holder: "a", apply: async () => { throw new Error("EPERM: rename verdicts.json"); } });
    expect(thrown?.result).toBe("retry");
    expect(row(t)).toMatchObject({ lastError: "EPERM: rename verdicts.json" });
  });

  it("a claim is held until its lease runs out; then it is retaken as a counted attempt, and the slow holder loses politely", () => {
    const s = committed();
    const a = must(s.tx((t) => takeApply(t, { holder: "a" })));
    expect(a?.attempt).toBe(1);
    expect(a?.outcome.act === "commit" && a.outcome.result.kept).toHaveLength(6);
    expect(must(s.tx((t) => takeApply(t, { holder: "b" }))), "held").toBeUndefined();
    now += LEASE_MS;
    const b = must(s.tx((t) => takeApply(t, { holder: "b" })));
    expect([b?.holder, b?.attempt]).toEqual(["b", 2]);
    expect(types(s, "decision.apply-failed")).toHaveLength(1);
    expect(must(s.tx((t) => finishApply(t, { packetId: P, holder: "a" }, { ok: false, error: "EBUSY: verdicts.json", code: "unavailable" })))).toBe("lost");
    expect(row(s)).toMatchObject({ state: "pending", holder: "b" });
    const late = types(s, "decision.apply-late");
    expect(late, "the late report leaves a trace").toHaveLength(1);
    expect(String(late[0]?.["data"])).toContain("EBUSY: verdicts.json");
    expect(must(s.tx((t) => finishApply(t, { packetId: P, holder: "b" }, { ok: true })))).toBe("applied");
    expect(types(s, "decision.applied")).toHaveLength(1);
  });

  it("a claim stranded at the ceiling is not retaken: it is stuck", async () => {
    const s = committed();
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await applyNext(fx(s), { holder: "a", apply: failing("unavailable", "down") });
      now += 3_600_000;
    }
    must(s.tx((t) => takeApply(t, { holder: "dies" })));
    now += LEASE_MS;
    expect(must(s.tx((t) => takeApply(t, { holder: "b" })))).toBeUndefined();
    expect(row(s)).toMatchObject({ state: "stuck", attempts: MAX_ATTEMPTS, holder: null });
  });

  it("a returned review is delivered with its edit plan", async () => {
    const s = tpl.fresh();
    const A = pid("art-1");
    must(s.tx((t) => openPacket(t, { packet: { ...packet("art-1", "packet-review", [{ id: "draft-3" }]), lane: "article" } }, agent)));
    const plan = [{ section: "s2", directive: "less_weight" as const, text: "the anecdote runs long" }];
    must(must(s.tx((t) => returnPacket(t, { ...operator, packetId: A, baseRev: 0, ticket: "r-1", plan }))));
    let seen: unknown;
    await applyNext(fx(s), { holder: "a", apply: async (c) => { seen = c.outcome.act === "return" ? c.outcome.result.plan : undefined; return ok(undefined); } });
    expect(seen).toEqual(plan);
  });

  // fail-loud-classification-default: a row whose claim cannot be read takes the severe bucket
  // (stuck, with the reason), it does not throw out of the take. Before, the throw rolled the
  // claim back, the row kept its place at the head of the due order, and every later drain
  // threw on it again: one unreadable packet held every other packet's apply behind it.
  it("a claim that cannot be read is stuck with its reason, and the drain reaches the next packet", async () => {
    const s = tpl.fresh();
    for (const id of ["run-0411", "run-0412"]) {
      const p = pid(id);
      must(s.tx((t) => openPacket(t, { packet: cull(id) }, agent)));
      must(s.tx((t) => patchMany(t, { ...operator, packetId: p, baseRev: 0, changes: ALL.map((c) => ({ key: `${id}::${c}`, verdict: "keep" as const })) })));
      const shown = preview(s, p);
      must(must(s.tx((t) => commit(t, { ...operator, packetId: p, ticket: `t-${id}`, ...shown }))));
    }
    must(s.tx((t) => t.run("UPDATE packets SET body = ? WHERE id = ?", '{"id":"run-0411"}', "run-0411")));
    const reports = await drainApplies(fx(s), { holder: "a", apply: fine });
    expect(reports).toEqual([{ packetId: P, attempt: 1, result: "applied" }]);
    const poisoned = must(s.read((r) => r.get("SELECT state, attempts, last_error AS lastError, holder FROM packet_applies WHERE packet_id = ?", "run-0411")));
    expect(poisoned).toMatchObject({ state: "stuck", attempts: 1, holder: null });
    expect(String(poisoned?.["lastError"])).toContain("run-0411");
    const stuck = types(s, "decision.apply-stuck");
    expect(stuck).toHaveLength(1);
    expect(String(stuck[0]?.["data"])).toContain('"unreadable":true');
    expect(await drainApplies(fx(s), { holder: "a", apply: fine }), "a stuck row is not retaken").toEqual([]);
  });
});
