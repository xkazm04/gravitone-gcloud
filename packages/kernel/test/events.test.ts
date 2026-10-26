import { afterAll, describe, expect, it } from "vitest";
import { AppError } from "@gt/domain/errors";
import type { EventInput } from "@gt/domain/event";
import { append, chainHead, eventsMigrations, verify } from "../src/events.ts";
import { must, templateStores } from "./helpers.ts";

const tpl = templateStores([eventsMigrations]);
afterAll(() => {
  const ms = [...tpl.setupMs].sort((a, b) => a - b);
  const p50 = ms[Math.floor(ms.length / 2)] ?? 0;
  console.log(`[template-copy] ${ms.length} stores, setup p50 ${p50.toFixed(2)} ms, max ${(ms.at(-1) ?? 0).toFixed(2)} ms; migrating from empty took ${tpl.buildMs.toFixed(2)} ms`);
  tpl.dispose();
});

const ev = (i: number, extra: Partial<EventInput> = {}): EventInput => ({
  actor: { kind: "machine", id: "box.render" },
  type: "job.done",
  subject: { kind: "job", id: `j${i}` },
  data: { i },
  ...extra,
});

describe("events", () => {
  it("chains each row to the one before, from the genesis hash", () => {
    const s = tpl.fresh();
    const [a, b] = must(s.tx((t) => [append(t, ev(1)), append(t, ev(2, { lane: "box.render", cost: { usd: 0.0123, src: "real" } }))]));
    expect(a?.seq).toBe(1);
    expect(a?.prevHash).toBe("0".repeat(64));
    expect(b?.seq).toBe(2);
    expect(b?.prevHash).toBe(a?.hash);
    expect(b?.cost).toEqual({ usd: 0.0123, src: "real" });
    expect(must(verify(s))).toEqual({ state: "intact", count: 2, head: { seq: 2, hash: b?.hash } });
  });

  it("is written in the caller's transaction: a rollback takes the event with the state change", () => {
    const s = tpl.fresh();
    must(s.tx((t) => t.exec("CREATE TABLE widgets (id TEXT PRIMARY KEY)")));
    const r = s.tx((t) => {
      t.run("INSERT INTO widgets VALUES ('w1')");
      append(t, ev(1));
      throw new AppError("refused", "changed my mind");
    });
    expect(r.ok).toBe(false);
    expect(must(s.read((x) => [x.get("SELECT count(*) AS n FROM widgets")?.["n"], x.get("SELECT count(*) AS n FROM events")?.["n"]]))).toEqual([0, 0]);
  });

  it("an invalid event aborts the whole transaction, state change included", () => {
    const s = tpl.fresh();
    must(s.tx((t) => t.exec("CREATE TABLE widgets (id TEXT PRIMARY KEY)")));
    const r = s.tx((t) => {
      t.run("INSERT INTO widgets VALUES ('w1')");
      append(t, ev(1, { type: "Not A Type" }));
    });
    expect(!r.ok && r.error.code).toBe("invalid");
    expect(must(s.read((x) => x.get("SELECT count(*) AS n FROM widgets")?.["n"]))).toBe(0);
  });

  it("omits absent lane and cost rather than storing them as undefined", () => {
    const s = tpl.fresh();
    const e = must(s.tx((t) => append(t, ev(1))));
    expect("lane" in e).toBe(false);
    expect("cost" in e).toBe(false);
  });

  it("refuses UPDATE and DELETE: the table is append-only by schema", () => {
    const s = tpl.fresh();
    must(s.tx((t) => append(t, ev(1))));
    const u = s.tx((t) => t.run("UPDATE events SET type = 'job.fail'"));
    const d = s.tx((t) => t.run("DELETE FROM events"));
    expect(!u.ok && u.error.message).toMatch(/append-only/);
    expect(!d.ok && d.error.message).toMatch(/append-only/);
  });

  it("verify names the first row whose data was tampered with raw SQL", () => {
    const s = tpl.fresh();
    must(s.tx((t) => {
      for (let i = 1; i <= 5; i++) append(t, ev(i));
    }));
    // The tamperer has the file: drop the guard, edit row 3's data.
    must(s.tx((t) => t.exec(`DROP TRIGGER events_no_update; UPDATE events SET data = '{"i":33}' WHERE seq = 3;`)));
    expect(must(verify(s))).toEqual({ state: "tampered", seq: 3, reason: "hash mismatch: the row's content changed after it was written" });
  });

  it("verify sees a deleted middle row at the gap, and a cut tail only against an anchor", () => {
    const s = tpl.fresh();
    must(s.tx((t) => {
      for (let i = 1; i <= 5; i++) append(t, ev(i));
    }));
    const anchor = must(chainHead(s));
    if (anchor === null) throw new Error("expected a head");
    must(s.tx((t) => t.exec("DROP TRIGGER events_no_delete; DELETE FROM events WHERE seq = 5;")));
    expect(must(verify(s)).state).toBe("intact");
    expect(must(verify(s, anchor))).toMatchObject({ state: "tampered", seq: 5, reason: expect.stringMatching(/^truncated/) });
    must(s.tx((t) => t.run("DELETE FROM events WHERE seq = 2")));
    expect(must(verify(s))).toMatchObject({ state: "tampered", seq: 2, reason: expect.stringMatching(/^missing/) });
  });

  it("a tail cut and re-written as a valid chain verifies alone, and is caught by the anchor it no longer holds", () => {
    const s = tpl.fresh();
    must(s.tx((t) => {
      for (let i = 1; i <= 5; i++) append(t, ev(i));
    }));
    const anchor = must(chainHead(s));
    if (anchor === null) throw new Error("expected a head");
    must(s.tx((t) => t.exec("DROP TRIGGER events_no_delete; DELETE FROM events WHERE seq >= 3;")));
    must(s.tx((t) => {
      for (let i = 3; i <= 6; i++) append(t, ev(100 + i));
    }));
    expect(must(verify(s))).toMatchObject({ state: "intact", count: 6 });
    expect(must(verify(s, anchor))).toEqual({ state: "tampered", seq: 5, reason: "the row at the anchor's seq is not the anchored row" });
  });

  it("verify reports a row that no longer parses, rather than throwing", () => {
    const s = tpl.fresh();
    must(s.tx((t) => append(t, ev(1))));
    must(s.tx((t) => t.exec("DROP TRIGGER events_no_update; UPDATE events SET data = 'not json' WHERE seq = 1;")));
    expect(must(verify(s))).toMatchObject({ state: "tampered", seq: 1, reason: expect.stringMatching(/^unreadable/) });
  });

  it("an empty ledger is intact with no head", () => {
    const s = tpl.fresh();
    expect(must(verify(s))).toEqual({ state: "intact", count: 0, head: null });
    expect(must(chainHead(s))).toBeNull();
  });
});
