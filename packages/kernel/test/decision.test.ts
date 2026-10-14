import { afterAll, describe, expect, it } from "vitest";
import type { Store } from "../src/store.ts";
import { verify } from "../src/events.ts";
import { commit, openPacket, patch, patchMany, returnPacket, undo } from "../src/decision/driver.ts";
import { currentDecisions, history, previewCommit, readPacket } from "../src/decision/read.ts";
import { agent, cull, MODULES, operator, packet, pid } from "./decision.fixtures.ts";
import { must, steppingClock, templateStores } from "./helpers.ts";

const tpl = templateStores(MODULES, { clock: steppingClock() });
afterAll(() => tpl.dispose());

const P = pid("run-0412");
const k = (c: string) => `run-0412::${c}`;

function opened(): Store {
  const s = tpl.fresh();
  must(s.tx((t) => openPacket(t, { packet: cull() }, agent)));
  return s;
}

const verdicts = (s: Store) => must(s.read((r) => Object.fromEntries(currentDecisions(r, P).decisions.map((d) => [d.key, d.verdict]))));
const events = (s: Store) => must(s.read((r) => r.all("SELECT type FROM events ORDER BY seq").map((x) => String(x["type"]))));

describe("kernel/decision - patches", () => {
  it("applies on the current revision, appends a row and its Event in the same transaction", () => {
    const s = opened();
    const r = must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 0 })));
    expect(r.ok && r.value.rev).toBe(1);
    expect(r.ok && r.value.changed.map((d) => [d.key, d.verdict, d.rev, d.by])).toEqual([[k("s1/a"), "keep", 1, "operator"]]);
    expect(events(s)).toEqual(["decision.opened", "decision.patched"]);
    expect(must(verify(s)).state).toBe("intact");
  });

  it("refuses a stale base with the 409 body: the named keys' current decisions and the revision", () => {
    const s = opened();
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 0 })));
    const stale = must(s.tx((t) => patch(t, { ...agent, key: k("s1/a"), verdict: "reject", reason: "style", baseRev: 0 })));
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.code).toBe("conflict");
    expect(stale.current?.rev).toBe(1);
    expect(stale.current?.decisions.map((d) => [d.key, d.verdict])).toEqual([[k("s1/a"), "keep"]]);
    expect(verdicts(s)).toEqual({ [k("s1/a")]: "keep" });
  });

  it("a write that changes nothing bumps nothing and logs nothing (v1)", () => {
    const s = opened();
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 0 })));
    const again = must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 1 })));
    expect(again.ok && again.value).toEqual({ rev: 1, changed: [] });
    expect(must(s.read((r) => history(r, P))).length).toBe(1);
    expect(events(s)).toEqual(["decision.opened", "decision.patched"]);
  });

  it("a row-wide ⇧X is ONE act: one revision, one Event, every key at that revision", () => {
    const s = opened();
    const r = must(s.tx((t) => patchMany(t, { ...operator, packetId: P, baseRev: 0, changes: ["s2/a", "s2/b", "s2/c"].map((c) => ({ key: k(c), verdict: "reject" as const, reason: "subject" as const })) })));
    expect(r.ok && r.value.changed.map((d) => d.rev)).toEqual([1, 1, 1]);
    expect(events(s).filter((e) => e === "decision.patched")).toHaveLength(1);
  });

  it("refuses the whole write when one key is foreign, named twice, or carries a reason without a reject", () => {
    const s = opened();
    const foreign = must(s.tx((t) => patchMany(t, { ...operator, packetId: P, baseRev: 0, changes: [{ key: k("s1/a"), verdict: "keep" }, { key: k("s9/z"), verdict: "keep" }] })));
    const twice = must(s.tx((t) => patchMany(t, { ...operator, packetId: P, baseRev: 0, changes: [{ key: k("s1/a"), verdict: "keep" }, { key: k("s1/a"), verdict: "reject" }] })));
    const reasoned = must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", reason: "text", baseRev: 0 })));
    const otherPacket = must(s.tx((t) => patchMany(t, { ...operator, packetId: P, baseRev: 0, changes: [{ key: "run-9::s1/a", verdict: "keep" }] })));
    for (const r of [foreign, twice, reasoned, otherPacket]) expect(!r.ok && r.error.code).toBe("invalid");
    expect(verdicts(s)).toEqual({});
  });

  it("the log is append-only in the schema: UPDATE and DELETE raise", () => {
    const s = opened();
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 0 })));
    expect(s.tx((t) => t.run("UPDATE decisions SET verdict = 'reject'")).ok).toBe(false);
    expect(s.tx((t) => t.run("DELETE FROM decisions")).ok).toBe(false);
  });
});

describe("kernel/decision - undo", () => {
  it("appends the inverse of the newest act, never deletes, and walks acts back one at a time", () => {
    const s = opened();
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 0 })));
    must(s.tx((t) => patchMany(t, { ...operator, packetId: P, baseRev: 1, changes: [{ key: k("s1/a"), verdict: "reject", reason: "style" }, { key: k("s1/b"), verdict: "keep" }] })));
    const u1 = must(s.tx((t) => undo(t, { ...operator, packetId: P, baseRev: 2 })));
    expect(u1.ok && u1.value.rev).toBe(3);
    expect(verdicts(s)).toEqual({ [k("s1/a")]: "keep", [k("s1/b")]: null });
    const u2 = must(s.tx((t) => undo(t, { ...operator, packetId: P, baseRev: 3 })));
    expect(u2.ok).toBe(true);
    expect(verdicts(s)).toEqual({ [k("s1/a")]: null, [k("s1/b")]: null });
    const none = must(s.tx((t) => undo(t, { ...operator, packetId: P, baseRev: 4 })));
    expect(!none.ok && none.error.code).toBe("refused");
    // Nothing was deleted: 1 + 2 forward rows, 2 + 1 inverse rows.
    expect(must(s.read((r) => history(r, P))).length).toBe(6);
  });

  it("an undo after a newer undone act restores the value from before ITS act", () => {
    const s = opened();
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 0 })));
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "reject", baseRev: 1 })));
    must(s.tx((t) => undo(t, { ...operator, packetId: P, baseRev: 2 })));
    expect(verdicts(s)[k("s1/a")]).toBe("keep");
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/b"), verdict: "keep", baseRev: 3 })));
    must(s.tx((t) => undo(t, { ...operator, packetId: P, baseRev: 4 })));
    must(s.tx((t) => undo(t, { ...operator, packetId: P, baseRev: 5 })));
    expect(verdicts(s)).toEqual({ [k("s1/a")]: null, [k("s1/b")]: null });
  });

  it("is refused on a committed packet", () => {
    const s = opened();
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 0 })));
    must(s.tx((t) => commit(t, { ...operator, packetId: P, ticket: "t-1" })));
    const r = must(s.tx((t) => undo(t, { ...operator, packetId: P, baseRev: 2 })));
    expect(!r.ok && r.error.code).toBe("refused");
  });
});

describe("kernel/decision - commit", () => {
  it("is one act, idempotent on its ticket, and a second ticket is a conflict", () => {
    const s = opened();
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 0 })));
    const first = must(must(s.tx((t) => commit(t, { ...operator, packetId: P, ticket: "t-1" }))));
    const retry = must(must(s.tx((t) => commit(t, { ...operator, packetId: P, ticket: "t-1" }))));
    expect(retry).toEqual(first);
    expect(first.kept).toEqual(["s1/a"]);
    expect(first.rejected).toHaveLength(5);
    const other = must(s.tx((t) => commit(t, { ...operator, packetId: P, ticket: "t-2" })));
    expect(!other.ok && other.error.code).toBe("conflict");
    expect(events(s).filter((e) => e === "decision.committed")).toHaveLength(1);
    expect(must(s.read((r) => readPacket(r, P))).state).toBe("committed");
  });

  it("refuses later patches: the commit is final", () => {
    const s = opened();
    must(s.tx((t) => commit(t, { ...operator, packetId: P, ticket: "t-1", undecidedAs: "leave" })));
    const r = must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 0 })));
    expect(!r.ok && r.error.code).toBe("refused");
  });

  it("matrix cull: undecided rejects are written as decisions of the commit, or left with 'leave'", () => {
    const s = opened();
    const r = must(must(s.tx((t) => commit(t, { ...operator, packetId: P, ticket: "t" }))));
    expect(r.rejected).toHaveLength(6);
    expect(r.rev).toBe(1);
    expect(Object.values(verdicts(s)).every((v) => v === "reject")).toBe(true);
    const s2 = opened();
    const left = must(must(s2.tx((t) => commit(t, { ...operator, packetId: P, ticket: "t", undecidedAs: "leave" }))));
    expect(left.undecided).toHaveLength(6);
    expect(verdicts(s2)).toEqual({});
  });

  it("a blind pair and a packet review refuse to commit with anything undecided", () => {
    for (const mode of ["blind-pair", "packet-review"] as const) {
      const s = tpl.fresh();
      const p = packet("pk-1", mode, [{ id: "a", row: "r1" }, { id: "b", row: "r1" }]);
      must(s.tx((t) => openPacket(t, { packet: p }, agent)));
      const r = s.tx((t) => commit(t, { ...operator, packetId: pid("pk-1"), ticket: "t" }));
      expect(r.ok, mode).toBe(true);
      expect(r.ok && !r.value.ok && r.value.error.code).toBe("refused");
    }
  });

  it("refuses when the verdicts moved since the preview (v1's token)", () => {
    const s = opened();
    const pre = must(s.read((r) => previewCommit(r, P)));
    expect(must(pre.plan).rejected).toHaveLength(6);
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 0 })));
    const r = must(s.tx((t) => commit(t, { ...operator, packetId: P, ticket: "t", expectRev: pre.rev })));
    expect(!r.ok && r.error.code).toBe("conflict");
  });

  it("only a packet review is sent back, and only while open", () => {
    const s = tpl.fresh();
    must(s.tx((t) => openPacket(t, { packet: packet("art-1", "packet-review", [{ id: "draft-3" }]) }, agent)));
    must(must(s.tx((t) => returnPacket(t, { ...operator, packetId: pid("art-1"), notes: "the second claim needs its source" }))));
    expect(must(s.read((r) => readPacket(r, pid("art-1")))).state).toBe("returned");
    const cullStore = opened();
    expect(must(cullStore.tx((t) => returnPacket(t, { ...operator, packetId: P, notes: "x" }))).ok).toBe(false);
  });

  it("history outlives the media: decisions name candidates, not blobs", () => {
    const s = opened();
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 0 })));
    const fks = must(s.read((r) => r.all("SELECT \"table\" AS tbl FROM pragma_foreign_key_list('decisions')").map((x) => x["tbl"])));
    expect(fks).toEqual(["packets"]);
  });
});
