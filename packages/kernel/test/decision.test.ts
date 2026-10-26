import { afterAll, describe, expect, it } from "vitest";
import type { Store } from "../src/store.ts";
import { verify } from "../src/events.ts";
import { commit, returnPacket } from "../src/decision/commit.ts";
import { openPacket, patch, patchMany, undo } from "../src/decision/driver.ts";
import { currentDecisions, history, previewCommit, readPacket } from "../src/decision/read.ts";
import { agent, cull, MODULES, operator, packet, pid, preview, V1 } from "./decision.fixtures.ts";
import { must, steppingClock, templateStores } from "./helpers.ts";

const tpl = templateStores(MODULES, { clock: steppingClock() });
afterAll(() => tpl.dispose());

const P = pid("run-0412");
const k = (c: string) => `run-0412::${c}`;
const ALL = ["s1/a", "s1/b", "s1/c", "s2/a", "s2/b", "s2/c"];

function opened(): Store {
  const s = tpl.fresh();
  must(s.tx((t) => openPacket(t, { packet: cull() }, agent)));
  return s;
}

/** Keep s1/a, reject the rest, as one act. */
function decided(): Store {
  const s = opened();
  must(s.tx((t) => patchMany(t, { ...operator, packetId: P, baseRev: 0, changes: ALL.map((c) => ({ key: k(c), verdict: c === "s1/a" ? ("keep" as const) : ("reject" as const) })) })));
  return s;
}

const verdicts = (s: Store) => must(s.read((r) => Object.fromEntries(currentDecisions(r, P).decisions.map((d) => [d.key, d.verdict]))));
const events = (s: Store) => must(s.read((r) => r.all("SELECT type FROM events ORDER BY seq").map((x) => String(x["type"]))));
const commitAs = (s: Store, ticket: string, extra: { undecidedAs?: "reject" | "leave" } = {}) => {
  const shown = preview(s, P);
  return must(s.tx((t) => commit(t, { ...operator, packetId: P, ticket, ...shown, ...extra })));
};

describe("kernel/decision - patches", () => {
  it("applies on the current revision, appends a row and its Event in the same transaction", () => {
    const s = opened();
    const r = must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 0 })));
    expect(r.ok && r.value.rev).toBe(1);
    expect(r.ok && r.value.changed.map((d) => [d.key, d.verdict, d.reasons, d.rev, d.by])).toEqual([[k("s1/a"), "keep", [], 1, "operator"]]);
    expect(events(s)).toEqual(["decision.opened", "decision.patched"]);
    expect(must(verify(s)).state).toBe("intact");
  });

  it("refuses a stale base with the 409 body: the named keys' current decisions and the revision", () => {
    const s = opened();
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 0 })));
    const stale = must(s.tx((t) => patch(t, { ...agent, key: k("s1/a"), verdict: "reject", reasons: ["style"], baseRev: 0 })));
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.code).toBe("conflict");
    expect(stale.current?.rev).toBe(1);
    expect(stale.current?.decisions.map((d) => [d.key, d.verdict])).toEqual([[k("s1/a"), "keep"]]);
    expect(verdicts(s)).toEqual({ [k("s1/a")]: "keep" });
  });

  it("a write that changes nothing bumps nothing and logs nothing (v1); a new reason or note is a change", () => {
    const s = opened();
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 0 })));
    const again = must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 1 })));
    expect(again.ok && again.value).toEqual({ rev: 1, changed: [] });
    expect(must(s.read((r) => history(r, P))).length).toBe(1);
    const noted = must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", note: "the horse reads", baseRev: 1 })));
    expect(noted.ok && noted.value.changed.map((d) => d.note)).toEqual(["the horse reads"]);
  });

  it("reasons are the source's: a forge reject takes the forge's words, in list order, and refuses another source's", () => {
    const s = opened();
    const r = must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "reject", reasons: ["craft", "style"], baseRev: 0 })));
    expect(r.ok && r.value.changed[0]?.reasons).toEqual(["style", "craft"]);
    for (const bad of [["smeared-transients"], ["style", "style"]]) {
      const x = must(s.tx((t) => patch(t, { ...operator, key: k("s1/b"), verdict: "reject", reasons: bad, baseRev: 1 })));
      expect(!x.ok && x.error.code, bad.join()).toBe("invalid");
    }
    const article = tpl.fresh();
    must(article.tx((t) => openPacket(t, { packet: packet("art-1", "packet-review", [{ id: "draft-3" }]) }, agent)));
    const dims = must(article.tx((t) => patch(t, { ...operator, key: "art-1::draft-3", verdict: "reject", reasons: ["truth", "depth"], baseRev: 0 })));
    expect(dims.ok && dims.value.changed[0]?.reasons).toEqual(["depth", "truth"]);
  });

  it("a row-wide ⇧X is ONE act: one revision, one Event, every key at that revision", () => {
    const s = opened();
    const r = must(s.tx((t) => patchMany(t, { ...operator, packetId: P, baseRev: 0, changes: ["s2/a", "s2/b", "s2/c"].map((c) => ({ key: k(c), verdict: "reject" as const, reasons: ["subject"] })) })));
    expect(r.ok && r.value.changed.map((d) => d.rev)).toEqual([1, 1, 1]);
    expect(events(s).filter((e) => e === "decision.patched")).toHaveLength(1);
  });

  it("refuses the whole write when one key is foreign, named twice, or carries a reason without a reject", () => {
    const s = opened();
    const foreign = must(s.tx((t) => patchMany(t, { ...operator, packetId: P, baseRev: 0, changes: [{ key: k("s1/a"), verdict: "keep" }, { key: k("s9/z"), verdict: "keep" }] })));
    const twice = must(s.tx((t) => patchMany(t, { ...operator, packetId: P, baseRev: 0, changes: [{ key: k("s1/a"), verdict: "keep" }, { key: k("s1/a"), verdict: "reject" }] })));
    const reasoned = must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", reasons: ["text"], baseRev: 0 })));
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
    must(s.tx((t) => patchMany(t, { ...operator, packetId: P, baseRev: 1, changes: [{ key: k("s1/a"), verdict: "reject", reasons: ["style"] }, { key: k("s1/b"), verdict: "keep" }] })));
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

  it("restores the reasons and the note the act overwrote, not just the verdict", () => {
    const s = opened();
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "reject", reasons: ["text"], note: "glyph soup on the banner", baseRev: 0 })));
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 1 })));
    must(s.tx((t) => undo(t, { ...operator, packetId: P, baseRev: 2 })));
    const d = must(s.read((r) => currentDecisions(r, P))).decisions[0];
    expect([d?.verdict, d?.reasons, d?.note]).toEqual(["reject", ["text"], "glyph soup on the banner"]);
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
    const s = decided();
    must(commitAs(s, "t-1"));
    const r = must(s.tx((t) => undo(t, { ...operator, packetId: P, baseRev: 1 })));
    expect(!r.ok && r.error.code).toBe("refused");
  });
});

describe("kernel/decision - commit", () => {
  it("is one act, idempotent on its ticket, and a second ticket is a conflict", () => {
    const s = decided();
    const first = must(commitAs(s, "t-1"));
    const retry = must(commitAs(s, "t-1"));
    expect(retry).toEqual(first);
    expect(first.kept).toEqual(["s1/a"]);
    expect(first.rejected).toHaveLength(5);
    const other = commitAs(s, "t-2");
    expect(!other.ok && other.error.code).toBe("conflict");
    expect(events(s).filter((e) => e === "decision.committed")).toHaveLength(1);
    expect(must(s.read((r) => readPacket(r, P))).state).toBe("committed");
  });

  it("refuses later patches: the commit is final", () => {
    const s = decided();
    must(commitAs(s, "t-1"));
    const r = must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "reject", baseRev: 1 })));
    expect(!r.ok && r.error.code).toBe("refused");
  });

  it("refuses while anything is undecided, in every mode, naming the undecided keys", () => {
    const s = opened();
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 0 })));
    const r = commitAs(s, "t");
    expect(!r.ok && r.error.code).toBe("refused");
    expect(!r.ok && r.error.detail).toBe(JSON.stringify(["s1/b", "s1/c", "s2/a", "s2/b", "s2/c"]));
    expect(must(s.read((x) => previewCommit(x, P))).plan.ok).toBe(false);
    for (const mode of ["blind-pair", "packet-review"] as const) {
      const m = tpl.fresh();
      must(m.tx((t) => openPacket(t, { packet: packet("pk-1", mode, [{ id: "a", row: "r1" }, { id: "b", row: "r1" }]) }, agent)));
      const shown = preview(m, pid("pk-1"));
      const x = must(m.tx((t) => commit(t, { ...operator, packetId: pid("pk-1"), ticket: "t", ...shown, undecidedAs: "reject" })));
      expect(!x.ok && x.error.code, mode).toBe("refused");
    }
  });

  it("a matrix cull swept only on an explicit undecidedAs: written as the commit's own rejects, or left", () => {
    const s = opened();
    const r = must(commitAs(s, "t", { undecidedAs: "reject" }));
    expect(r.rejected).toHaveLength(6);
    expect(r.rev).toBe(1);
    expect(Object.values(verdicts(s)).every((v) => v === "reject")).toBe(true);
    const s2 = opened();
    const left = must(commitAs(s2, "t", { undecidedAs: "leave" }));
    expect(left.undecided).toHaveLength(6);
    expect(verdicts(s2)).toEqual({});
  });

  it("refuses a stale preview: the decisions moved, or v1 moved under unchanged decisions", () => {
    const s = decided();
    const shown = preview(s, P);
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/b"), verdict: "keep", baseRev: 1 })));
    const moved = must(s.tx((t) => commit(t, { ...operator, packetId: P, ticket: "t", ...shown })));
    expect(!moved.ok && [moved.error.code, moved.error.detail]).toEqual(["conflict", "stale-preview"]);
    const now = preview(s, P);
    const v1Moved = must(s.tx((t) => commit(t, { ...operator, packetId: P, ticket: "t", token: now.token, v1Digest: `${V1}-after-another-commit` })));
    expect(!v1Moved.ok && v1Moved.error.detail).toBe("stale-preview");
    // An undo that lands back on the previewed verdicts leaves the preview true.
    must(s.tx((t) => undo(t, { ...operator, packetId: P, baseRev: 2 })));
    expect(must(s.tx((t) => commit(t, { ...operator, packetId: P, ticket: "t", ...shown }))).ok).toBe(true);
  });

  it("a source whose reject needs a reason refuses a reasonless one at the commit - never at the write - and a sweep", () => {
    const S = pid("pkt:seeds:2026-10-23");
    const sk = (c: string) => `${S}::${c}`;
    const s = tpl.fresh();
    must(s.tx((t) => openPacket(t, { packet: packet(S, "matrix-cull", [{ id: "sd-001" }, { id: "sd-002" }, { id: "sd-003" }, { id: "sd-004" }], "seeds") }, agent)));
    const bare = must(s.tx((t) => patchMany(t, { ...operator, packetId: S, baseRev: 0, changes: [{ key: sk("sd-001"), verdict: "keep" }, { key: sk("sd-002"), verdict: "reject" }, { key: sk("sd-004"), verdict: "reject" }] })));
    expect(bare.ok).toBe(true);
    const at = () => preview(s, S);
    const p0 = at();
    const swept = must(s.tx((t) => commit(t, { ...operator, packetId: S, ticket: "t", ...p0, undecidedAs: "reject" })));
    expect(!swept.ok && swept.error.message).toBe("decision: 3 rejected need a reason: sd-002, sd-003, sd-004");
    must(s.tx((t) => patch(t, { ...operator, key: sk("sd-003"), verdict: "keep", baseRev: 1 })));
    const p1 = at();
    const refused = must(s.tx((t) => commit(t, { ...operator, packetId: S, ticket: "t", ...p1 })));
    expect(!refused.ok && [refused.error.code, refused.error.message, refused.error.detail]).toEqual(["refused", "decision: 2 rejected need a reason: sd-002, sd-004", JSON.stringify(["sd-002", "sd-004"])]);
    expect(must(s.read((x) => previewCommit(x, S))).plan.ok).toBe(false);
    must(s.tx((t) => patchMany(t, { ...operator, packetId: S, baseRev: 2, changes: [{ key: sk("sd-002"), verdict: "reject", reasons: ["generic"] }, { key: sk("sd-004"), verdict: "reject", reasons: ["audience"], note: "this reads as adult" }] })));
    const p2 = at();
    expect(must(must(s.tx((t) => commit(t, { ...operator, packetId: S, ticket: "t", ...p2 })))).rejected).toEqual(["sd-002", "sd-004"]);
    // Every other source commits a bare reject, as it always did.
    expect(must(commitAs(decided(), "t")).rejected).toHaveLength(5);
  });

  it("writes the apply outbox row in the commit's transaction", () => {
    const s = decided();
    must(commitAs(s, "t-1"));
    const row = must(s.read((r) => r.get("SELECT act, ticket, state, attempts FROM packet_applies WHERE packet_id = ?", P)));
    expect(row).toEqual({ act: "commit", ticket: "t-1", state: "pending", attempts: 0 });
  });

  it("history outlives the media: decisions name candidates, not blobs", () => {
    const s = opened();
    must(s.tx((t) => patch(t, { ...operator, key: k("s1/a"), verdict: "keep", baseRev: 0 })));
    const fks = must(s.read((r) => r.all("SELECT \"table\" AS tbl FROM pragma_foreign_key_list('decisions')").map((x) => x["tbl"])));
    expect(fks).toEqual(["packets"]);
  });
});

describe("kernel/decision - return with an edit plan", () => {
  const A = pid("art-1");
  const plan = [{ section: "s2", directive: "remove" as const, text: "the second claim has no source" }];
  const review = () => {
    const s = tpl.fresh();
    must(s.tx((t) => openPacket(t, { packet: packet("art-1", "packet-review", [{ id: "draft-3" }]) }, agent)));
    return s;
  };

  it("sends a review back with its plan, once per ticket, and queues the apply", () => {
    const s = review();
    const first = must(must(s.tx((t) => returnPacket(t, { ...operator, packetId: A, baseRev: 0, ticket: "r-1", plan }))));
    expect(first.plan).toEqual(plan);
    expect(must(s.read((r) => readPacket(r, A))).state).toBe("returned");
    expect(must(must(s.tx((t) => returnPacket(t, { ...operator, packetId: A, baseRev: 0, ticket: "r-1", plan }))))).toEqual(first);
    const other = must(s.tx((t) => returnPacket(t, { ...operator, packetId: A, baseRev: 0, ticket: "r-2", plan })));
    expect(!other.ok && other.error.code).toBe("conflict");
    expect(must(s.read((r) => r.get("SELECT act, state FROM packet_applies WHERE packet_id = ?", A)))).toEqual({ act: "return", state: "pending" });
  });

  it("refuses an empty plan, a stale revision, and any mode but a review", () => {
    const s = review();
    expect(must(s.tx((t) => returnPacket(t, { ...operator, packetId: A, baseRev: 0, ticket: "r", plan: [] }))).ok).toBe(false);
    expect(must(s.tx((t) => returnPacket(t, { ...operator, packetId: A, baseRev: 3, ticket: "r", plan }))).ok).toBe(false);
    const c = opened();
    const x = must(c.tx((t) => returnPacket(t, { ...operator, packetId: P, baseRev: 0, ticket: "r", plan })));
    expect(!x.ok && x.error.code).toBe("refused");
  });
});
