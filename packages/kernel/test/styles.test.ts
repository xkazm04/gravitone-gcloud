import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonAt } from "@gt/domain/door";
import type { Actor } from "@gt/domain/event";
import type { StyleProof } from "@gt/domain/style";
import { blockDigest, STYLE_TRIALS } from "@gt/domain/style.ratchet";
import type { StyleOp, StyleOpOutcome } from "@gt/domain/styleView";
import { verify } from "../src/events.ts";
import { openKernel, type Kernel } from "../src/kernel.ts";
import type { Store } from "../src/store.ts";
import type { StyleDraft } from "../src/styles/core.ts";
import { applyStyleOp, catalogueRevIn, putStyleIn, readStyle } from "../src/styles/driver.ts";
import { draftFromV1Theme, importV1ThemeIn } from "../src/styles/v1theme.ts";
import { exportStylesJson, writeStylesExport } from "../src/styles/export.ts";
import { draftFromV1, importV1In, readV1Catalogue } from "../src/styles/v1.ts";
import { addProofsIn, adoptStyleIn, createStyleIn, recordForgeEvidenceIn } from "../src/styles/writers.ts";
import { must, scratch, steppingClock } from "./helpers.ts";

// THE STYLE STORE (Phase 5 L48): one record per style, one transaction + one event per write,
// the ratchet enforced at the write (and, beneath it, by a trigger), the export byte-stable.

const OP: Actor = { kind: "operator", id: "op" };
const FORGE: Actor = { kind: "machine", id: "foundry/forge-commit" };
const SHA = (n: number) => n.toString(16).padStart(64, "0");
const BLOB = (n: number) => ({ sha256: SHA(n), bytes: 1000 + n, mime: "image/png" });
const BLOCK = {
  technique: "Flat vector shapes with clean geometric edges",
  subject: "Simple iconic objects",
  palette: [
    { name: "ink", hex: "#0b0d12", role: "ground" as const },
    { name: "bone", hex: "#e8e1d4", role: "objects" as const },
    { name: "neon", hex: "#2fb7ff", role: "accent" as const },
  ],
  finish: "Matte, no texture",
};

let open: Kernel[] = [];
afterEach(() => {
  for (const k of open) k.close();
  open = [];
});
function store(): Store {
  const k = must(openKernel(":memory:", { clock: steppingClock("2026-10-17T08:00:00.000Z") }));
  open.push(k);
  return k.store;
}
const draft = (id: string, over: Partial<StyleDraft> = {}): StyleDraft => ({
  id,
  name: id,
  family: "animation",
  origin: { kind: "readback", source: "arcane-fights" },
  observables: { render_mode: "painterly" },
  recipe: "Stylised 3D characters with hand-painted matte textures.",
  negative: "photograph",
  elements: [],
  evidence: [],
  exemplars: [],
  proofs: [],
  ...over,
});
const keep = (style: string, scene: string, by?: "human" | "model") => ({ style, scene, mechanism: "ref-early", verdict: "keep" as const, ...(by ? { by } : {}) });
const count = (s: Store, sql: string) => Number(must(s.read((r) => r.get(sql)))?.["n"]);
const op = (s: Store, id: string, o: StyleOp): StyleOpOutcome => must(applyStyleOp(s, { styleId: id, baseRev: must(readStyle(s, id)).rev, op: o }, OP));

/** A proven, adopted style with `n` pending proofs on distinct trials, under the current block. */
function adopted(s: Store, id = "painted-3d", n = 3): void {
  must(s.tx((t) => createStyleIn(t, draft(id), FORGE, { kind: "test", replace: false })));
  must(s.tx((t) => recordForgeEvidenceIn(t, "run-a", t.at, [keep(id, "wow-archer"), keep(id, "lotr-cavalry")], FORGE)));
  const proofs: StyleProof[] = STYLE_TRIALS.slice(0, n).map((tr, i) => ({ id: `p${i}`, label: tr.label, media: BLOB(i + 1), state: "pending", trialId: tr.id, blockDigest: blockDigest(BLOCK), at: `2026-10-17T09:0${i}:00.000Z` }));
  must(s.tx((t) => adoptStyleIn(t, id, { block: BLOCK, proofs }, OP)));
}

describe("the forge commit's catalogue half (v1 commitRun, kept)", () => {
  it("promotes on operator keeps in two distinct run/scene cells; an agent's keep is evidence, not a vote", () => {
    const s = store();
    must(s.tx((t) => createStyleIn(t, draft("a"), FORGE, { kind: "test", replace: false })));
    const r1 = must(s.tx((t) => recordForgeEvidenceIn(t, "run-1", t.at, [keep("a", "x"), keep("a", "y", "model")], FORGE)));
    expect(r1.promoted).toEqual([]);
    expect(must(readStyle(s, "a")).style.status).toBe("candidate");
    const r2 = must(s.tx((t) => recordForgeEvidenceIn(t, "run-2", t.at, [keep("a", "y")], FORGE)));
    expect(r2.promoted).toEqual(["a"]);
    expect(must(readStyle(s, "a")).style.status).toBe("proven");
  });
  it("a retried commit REPLACES its run's rows - the same rows, never doubled, no new event", () => {
    const s = store();
    must(s.tx((t) => createStyleIn(t, draft("a"), FORGE, { kind: "test", replace: false })));
    const rows = [keep("a", "x"), keep("a", "y")];
    must(s.tx((t) => recordForgeEvidenceIn(t, "run-1", "2026-10-17T08:00:00.000Z", rows, FORGE)));
    const events = count(s, "SELECT count(*) AS n FROM events");
    // ...even when the retry stamps its own instant: the verdicts are what the commit writes.
    const again = must(s.tx((t) => recordForgeEvidenceIn(t, "run-1", "2026-10-17T09:30:00.000Z", rows, FORGE)));
    expect(again.touched).toEqual([]);
    expect(must(readStyle(s, "a")).style.evidence).toHaveLength(2);
    expect(count(s, "SELECT count(*) AS n FROM events")).toBe(events);
  });
  it("a retry after ANOTHER run committed is still the same write: no revision, no event, the order kept", () => {
    const s = store();
    must(s.tx((t) => createStyleIn(t, draft("a"), FORGE, { kind: "test", replace: false })));
    must(s.tx((t) => recordForgeEvidenceIn(t, "run-1", t.at, [keep("a", "x")], FORGE)));
    must(s.tx((t) => recordForgeEvidenceIn(t, "run-2", t.at, [keep("a", "y")], FORGE)));
    const before = must(readStyle(s, "a"));
    const events = count(s, "SELECT count(*) AS n FROM events");
    const again = must(s.tx((t) => recordForgeEvidenceIn(t, "run-1", t.at, [keep("a", "x")], FORGE)));
    expect(again.touched).toEqual([]);
    expect(must(readStyle(s, "a")).rev).toBe(before.rev);
    expect(must(readStyle(s, "a")).style.evidence.map((e) => e.run)).toEqual(["run-1", "run-2"]);
    expect(count(s, "SELECT count(*) AS n FROM events")).toBe(events);
  });
  it("refuses a commit naming a style the store does not hold, writing nothing", () => {
    const s = store();
    const r = s.tx((t) => recordForgeEvidenceIn(t, "run-1", t.at, [keep("ghost", "x")], FORGE));
    expect(r.ok ? "" : r.error.message).toContain("pipeline/import/styles.mts");
  });
});

describe("the ratchet, at the write", () => {
  it("a re-commit that would take a proven style's keeps away is refused with the ratchet's sentence", () => {
    const s = store();
    must(s.tx((t) => createStyleIn(t, draft("a"), FORGE, { kind: "test", replace: false })));
    must(s.tx((t) => recordForgeEvidenceIn(t, "run-1", t.at, [keep("a", "x"), keep("a", "y")], FORGE)));
    const r = s.tx((t) => recordForgeEvidenceIn(t, "run-1", t.at, [{ ...keep("a", "x"), verdict: "reject" }], FORGE));
    expect(r.ok ? "" : `${r.error.code}: ${r.error.message}`).toBe("refused: the ratchet is one-way — a proven style cannot become candidate");
    expect(must(readStyle(s, "a")).style.status).toBe("proven");
  });
  it("beneath it, the trigger refuses a demoting UPDATE from a writer that skipped the ratchet", () => {
    const s = store();
    adopted(s);
    const r = s.tx((t) => t.run("UPDATE styles SET status = 'candidate', record = json_set(record, '$.status', 'candidate') WHERE id = 'painted-3d'"));
    expect(r.ok ? "" : r.error.message).toContain("the style ratchet is one-way");
  });
  it("style ops are append-only and a style is never deleted", () => {
    const s = store();
    adopted(s);
    expect(s.tx((t) => t.run("DELETE FROM style_ops")).ok).toBe(false);
    expect(s.tx((t) => t.run("UPDATE style_ops SET by = 'x'")).ok).toBe(false);
    expect(s.tx((t) => t.run("DELETE FROM styles")).ok).toBe(false);
  });
});

describe("adopt, in place (v1 adopt.ts)", () => {
  it("refuses a candidate, and a second adopt of a style that already has a look", () => {
    const s = store();
    must(s.tx((t) => createStyleIn(t, draft("c"), FORGE, { kind: "test", replace: false })));
    const r = s.tx((t) => adoptStyleIn(t, "c", { block: BLOCK, proofs: [] }, OP));
    expect(r.ok ? "" : r.error.message).toContain("only a proven style is adopted");
    adopted(s, "p");
    const again = s.tx((t) => adoptStyleIn(t, "p", { block: BLOCK, proofs: [] }, OP));
    expect(again.ok ? "" : again.error.message).toContain("duplicate it");
  });
});

describe("a judgement that changes nothing", () => {
  it("is refused as unchanged when only the note's whitespace differs, or an empty note meets none", () => {
    const s = store();
    adopted(s, "p", 2);
    op(s, "p", { kind: "judge-proof", proofId: "p0", state: "approved", note: "reads as one scene" });
    for (const [proofId, note] of [["p0", "  reads as one scene "], ["p1", ""]] as const) {
      const rev = must(readStyle(s, "p")).rev;
      const r = applyStyleOp(s, { styleId: "p", baseRev: rev, op: { kind: "judge-proof", proofId, state: proofId === "p0" ? "approved" : "pending", note } }, OP);
      expect(r.ok ? r.value.kind : r.error.code).toBe("invalid");
      expect(must(readStyle(s, "p")).rev).toBe(rev);
    }
  });
});

describe("the lock gate (v1 canLock / lockBlocker), refused at the write", () => {
  it("refuses with the work's sentence until no proof is pending and three problems are approved", () => {
    const s = store();
    adopted(s, "p", 3);
    const refused = op(s, "p", { kind: "lock" });
    expect(refused.kind === "refused" ? refused.reason : "").toBe("cannot lock: 3 proofs still undecided");
    op(s, "p", { kind: "judge-proof", proofId: "p0", state: "approved" });
    op(s, "p", { kind: "judge-proof", proofId: "p1", state: "approved" });
    op(s, "p", { kind: "judge-proof", proofId: "p2", state: "rejected", note: "the analogy reads as one scene" });
    const short = op(s, "p", { kind: "lock" });
    expect(short.kind === "refused" ? short.reason : "").toBe("cannot lock: approve 1 more problem — 2 of 3 covered; missing analogy, mechanism, flow");
    op(s, "p", { kind: "judge-proof", proofId: "p2", state: "approved" });
    const locked = op(s, "p", { kind: "lock" });
    expect(locked.kind).toBe("applied");
    expect(locked.view.status).toBe("locked");
    expect(locked.view.lock).toMatchObject({ can: false, blocker: null, lockedBy: "op" });
  });
  it("a locked style's block is frozen, its last approval kept, and there is no unlock; duplicate is the way out", () => {
    const s = store();
    adopted(s, "p", 3);
    for (const id of ["p0", "p1", "p2"]) op(s, "p", { kind: "judge-proof", proofId: id, state: "approved" });
    op(s, "p", { kind: "lock" });
    const block = op(s, "p", { kind: "set-block", block: { ...BLOCK, finish: "Glossy" } });
    expect(block.kind === "refused" ? block.reason : "").toContain("duplicate it into a new draft to change the block");
    op(s, "p", { kind: "judge-proof", proofId: "p0", state: "rejected" });
    op(s, "p", { kind: "judge-proof", proofId: "p1", state: "rejected" });
    const last = op(s, "p", { kind: "judge-proof", proofId: "p2", state: "rejected" });
    expect(last.kind === "refused" ? last.reason : "").toContain("keep at least one approval");
    const dup = op(s, "p", { kind: "duplicate" });
    expect(dup).toMatchObject({ kind: "applied", created: "p-copy" });
    const copy = must(readStyle(s, "p-copy")).style;
    expect(copy).toMatchObject({ status: "candidate", block: BLOCK, proofs: [], evidence: [], duplicatedFrom: "p" });
    expect(op(s, "p-copy", { kind: "set-block", block: { ...BLOCK, finish: "Glossy" } }).kind).toBe("applied");
  });
  it("approvals under an earlier block stop counting, and the blocker says so", () => {
    const s = store();
    adopted(s, "p", 3);
    for (const id of ["p0", "p1", "p2"]) op(s, "p", { kind: "judge-proof", proofId: id, state: "approved" });
    const out = op(s, "p", { kind: "set-block", block: { ...BLOCK, finish: "Glossy" } });
    expect(out.view.proofs.map((p) => p.lineage)).toEqual(["stale", "stale", "stale"]);
    expect(out.view.lock.blocker).toBe("approve 3 more problems — 0 of 3 covered; missing quantity, inventory, analogy, mechanism, flow (3 approved under an earlier block no longer count)");
    expect(out.view.refs).toEqual([]);
    expect(out.view.status).toBe("proven");
  });
  it("a legacy sheet not yet locked meets the coverage gate like any other (ruled 2026-10-17)", () => {
    const s = store();
    must(s.tx((t) => createStyleIn(t, draft("L"), FORGE, { kind: "test", replace: false })));
    must(s.tx((t) => recordForgeEvidenceIn(t, "run-a", t.at, [keep("L", "x"), keep("L", "y")], FORGE)));
    must(s.tx((t) => adoptStyleIn(t, "L", { block: BLOCK, proofs: [{ id: "old", label: "v1", media: BLOB(9), state: "pending", at: "2026-09-01T00:00:00.000Z" }] }, OP)));
    const judged = op(s, "L", { kind: "judge-proof", proofId: "old", state: "approved" });
    expect(judged.view.lock).toMatchObject({ legacySheet: true, can: false });
    const r = op(s, "L", { kind: "lock" });
    expect(r.kind === "refused" ? r.reason : r.kind).toBe("cannot lock: approve 3 more problems — 0 of 3 covered; missing quantity, inventory, analogy, mechanism, flow");
  });
  it("an approval is a kept cell: an atelier style earns `proven` on two trial problems", () => {
    const s = store();
    must(s.tx((t) => createStyleIn(t, draft("atelier", { origin: { kind: "preset", presetId: "flat-vector" }, block: BLOCK }), OP, { kind: "test", replace: false })));
    const proofs: StyleProof[] = STYLE_TRIALS.slice(0, 2).map((tr, i) => ({ id: `q${i}`, label: tr.label, media: BLOB(i + 20), state: "pending", trialId: tr.id, blockDigest: blockDigest(BLOCK), at: "2026-10-17T09:00:00.000Z" }));
    must(s.tx((t) => addProofsIn(t, "atelier", proofs, OP)));
    expect(op(s, "atelier", { kind: "judge-proof", proofId: "q0", state: "approved" }).view.status).toBe("candidate");
    const two = op(s, "atelier", { kind: "judge-proof", proofId: "q1", state: "approved" });
    expect(two.view.status).toBe("proven");
    // ...and taking the approval back does not demote: the keep was given.
    expect(op(s, "atelier", { kind: "judge-proof", proofId: "q1", state: "rejected" }).view.status).toBe("proven");
  });
  it("only an undecided plate leaves the sheet: a rejection stays, an approval is undecided first", () => {
    const s = store();
    adopted(s, "p", 3);
    op(s, "p", { kind: "judge-proof", proofId: "p0", state: "rejected", note: "the fall reads as a cliff" });
    op(s, "p", { kind: "judge-proof", proofId: "p1", state: "approved" });
    const rejected = op(s, "p", { kind: "remove-proof", proofId: "p0" });
    expect(rejected.kind === "refused" ? rejected.reason : rejected.kind).toContain("a rejection stays on the sheet");
    const approved = op(s, "p", { kind: "remove-proof", proofId: "p1" });
    expect(approved.kind === "refused" ? approved.reason : approved.kind).toContain("undecide the approval first");
    const gone = op(s, "p", { kind: "remove-proof", proofId: "p2" });
    expect(gone.kind).toBe("applied");
    expect(gone.view.proofs.map((p) => p.id)).toEqual(["p0", "p1"]);
  });
  it("refuses proofs rendered under an earlier block", () => {
    const s = store();
    adopted(s, "p", 1);
    const r = s.tx((t) => addProofsIn(t, "p", [{ id: "late", label: "x", media: BLOB(7), state: "pending", trialId: "flywheel", blockDigest: "00000000", at: "2026-10-17T10:00:00.000Z" }], OP));
    expect(r.ok ? "" : r.error.code).toBe("conflict");
  });
});

describe("a v1 theme in (the wave B import's entry point)", () => {
  const theme = (over: Record<string, unknown> = {}) => ({
    id: "th-1", name: "Ink", origin: "preset", presetId: "flat-vector", block: BLOCK, elements: ["chart"], createdAt: 0, updatedAt: 0,
    proofs: [{ id: "old", label: "v1", state: "approved", createdAt: Date.parse("2026-09-01T00:00:00.000Z") }],
    ...over,
  });
  it("a theme v1 already locked imports LOCKED, grandfathered, under the id projects already name", () => {
    const s = store();
    const d = must(draftFromV1Theme(theme({ lockedAt: Date.parse("2026-09-02T00:00:00.000Z") }), () => BLOB(3)));
    expect(must(s.tx((t) => importV1ThemeIn(t, d, OP)))).toBe("created");
    const row = must(readStyle(s, "v1-theme:th-1"));
    expect(row.style).toMatchObject({ status: "locked", lock: { by: "v1", grandfathered: true }, origin: { kind: "preset", presetId: "flat-vector" } });
    expect(must(s.tx((t) => importV1ThemeIn(t, d, OP)))).toBe("same");
    const ev = must(s.read((r) => r.get("SELECT data FROM events WHERE type = 'style.imported'")));
    expect(String(ev?.["data"])).toContain('"grandfathered":true');
  });
  it("a theme not yet locked imports as a draft and meets the new gate", () => {
    const s = store();
    const d = must(draftFromV1Theme(theme(), () => BLOB(3)));
    must(s.tx((t) => importV1ThemeIn(t, d, OP)));
    const out = op(s, "v1-theme:th-1", { kind: "lock" });
    expect(out.kind === "refused" ? out.reason : out.kind).toContain("cannot lock: approve 3 more problems");
    expect(out.view).toMatchObject({ status: "candidate", lock: { legacySheet: true } });
  });
  it("a lock made here never claims the grandfather rule, and a write cannot add it", () => {
    const s = store();
    const d = must(draftFromV1Theme(theme({ lockedAt: Date.parse("2026-09-02T00:00:00.000Z") }), () => BLOB(3)));
    must(s.tx((t) => importV1ThemeIn(t, d, OP)));
    const before = must(readStyle(s, "v1-theme:th-1"));
    const r = s.tx((t) => putStyleIn(t, before, { ...before.style, lock: { at: before.style.lock?.at ?? "", by: "v1" } }, { kind: "x", op: null, by: OP, type: "style.edited", data: {} }));
    expect(r.ok ? "" : r.error.message).toContain("a lock is one-way");
  });
});

describe("one transaction, one event, one revision", () => {
  it("a stale base writes nothing and answers the truth", () => {
    const s = store();
    adopted(s, "p", 1);
    const rev = must(readStyle(s, "p")).rev;
    const stale = must(applyStyleOp(s, { styleId: "p", baseRev: rev - 1, op: { kind: "rename", name: "Other" } }, OP));
    expect(stale).toMatchObject({ kind: "conflict", view: { rev, name: "p" } });
    const done = must(applyStyleOp(s, { styleId: "p", baseRev: rev, op: { kind: "rename", name: "Other" } }, OP));
    expect(done).toMatchObject({ kind: "applied", view: { rev: rev + 1, name: "Other" } });
  });
  it("every write is a log row and a chained event naming the style", () => {
    const s = store();
    adopted(s, "p", 1);
    op(s, "p", { kind: "judge-proof", proofId: "p0", state: "approved" });
    const types = must(s.read((r) => r.all("SELECT type FROM events WHERE subject_kind = 'style' ORDER BY seq"))).map((e) => e["type"]);
    expect(types).toEqual(["style.created", "style.evidence", "style.adopted", "style.judged"]);
    expect(count(s, "SELECT count(*) AS n FROM style_ops")).toBe(4);
    expect(must(verify(s)).state).toBe("intact");
  });
});

describe("the git export (styles.json for the Python readers)", () => {
  it("is byte-stable for an unchanged store, stamps the catalogue revision, and speaks v1's evidence words", () => {
    const s = store();
    adopted(s, "p", 1);
    must(s.tx((t) => recordForgeEvidenceIn(t, "run-b", t.at, [keep("p", "z", "model")], FORGE)));
    const a = must(exportStylesJson(s));
    expect(must(exportStylesJson(s))).toBe(a);
    const doc = must(parseJsonAt("export", z.looseObject({}), a));
    expect(doc).toMatchObject({ _rev: must(s.read(catalogueRevIn)), styles: [{ id: "p", status: "proven", block: BLOCK }] });
    expect(a).toContain('"by": "model"');
    expect(a).not.toContain('"by": "operator"');
  });
  it("writes the file once, skips identical bytes, and refuses to replace a catalogue it never imported", () => {
    const s = store();
    adopted(s, "p", 1);
    const dir = scratch("styles-export");
    try {
      const file = path.join(dir.dir, "styles.json");
      expect(must(writeStylesExport(s, file))).toMatchObject({ changed: true, styles: 1 });
      expect(must(writeStylesExport(s, file)).changed).toBe(false);
      writeFileSync(file, JSON.stringify({ styles: [{ id: "p" }, { id: "hand-added" }] }));
      const r = writeStylesExport(s, file);
      expect(r.ok ? "" : r.error.message).toContain("hand-added");
      expect(readFileSync(file, "utf8")).toContain("hand-added");
      expect(existsSync(`${file}.tmp`)).toBe(false);
    } finally {
      dir.dispose();
    }
  });
  it("replaces the file only after the transaction has committed", () => {
    const s = store();
    adopted(s, "p", 1);
    const dir = scratch("styles-export-after-tx");
    try {
      const file = path.join(dir.dir, "styles.json");
      const seen: boolean[] = [];
      const spy: Store = {
        ...s,
        tx: (fn) => {
          const r = s.tx(fn);
          seen.push(existsSync(file));
          return r;
        },
      };
      expect(must(writeStylesExport(spy, file)).changed).toBe(true);
      expect(seen).toEqual([false]);
      expect(existsSync(file)).toBe(true);
    } finally {
      dir.dispose();
    }
  });
  it("answers a file it cannot write as `unavailable`, never a throw, and leaves no temp", () => {
    const s = store();
    adopted(s, "p", 1);
    const dir = scratch("styles-export-unwritable");
    try {
      const file = path.join(dir.dir, "no-such-dir", "styles.json");
      const r = writeStylesExport(s, file);
      expect(r.ok ? "" : `${r.error.code}: ${r.error.message}`).toBe(`unavailable: cannot write ${file}`);
      expect(existsSync(path.dirname(file))).toBe(false);
    } finally {
      dir.dispose();
    }
  });
  it("reads the catalogue once per export: one list, one revision", () => {
    const s = store();
    adopted(s, "p", 1);
    must(s.tx((t) => createStyleIn(t, draft("q"), FORGE, { kind: "test", replace: false })));
    const dir = scratch("styles-export-reads");
    try {
      const file = path.join(dir.dir, "styles.json");
      const sql: string[] = [];
      const spy: Store = {
        ...s,
        tx: (fn) => s.tx((t) => fn({ ...t, at: t.at, get: (q, ...p) => (sql.push(q), t.get(q, ...p)), all: (q, ...p) => (sql.push(q), t.all(q, ...p)) })),
      };
      expect(must(writeStylesExport(spy, file))).toMatchObject({ changed: true, styles: 2 });
      expect(readFileSync(file, "utf8")).toBe(must(exportStylesJson(s)));
      expect(sql.filter((q) => q.includes("FROM styles"))).toHaveLength(1);
      expect(sql.filter((q) => q.includes("FROM style_ops"))).toHaveLength(1);
    } finally {
      dir.dispose();
    }
  });
});

describe("v1's catalogue in (the one-time import, and the hand-edit path after it)", () => {
  const v1 = JSON.stringify({
    styles: [
      { id: "painted-3d", name: "Painted 3D", family: "animation", status: "proven", origin: { kind: "readback" }, observables: { render_mode: "painterly" }, recipe: "Paint.", negative: "photo",
        evidence: [{ run: "r1", scene: "a", mechanism: "m", verdict: "keep", at: "2026-08-26T18:21:52.962Z" }, { run: "r2", scene: "b", mechanism: "m", verdict: "keep", at: "" }] },
      { id: "x", name: "X", family: "f", status: "candidate", origin: { kind: "extracted", source: "e1" }, observables: {}, recipe: "R.", negative: "", evidence: [],
        exemplars: [{ kind: "extract", run: "e1", file: "sources/s01.png", role: "source" }, { kind: "extract", run: "e1", file: "gone.png", role: "replica", settled: "no-usable-fix" }] },
      { id: "broken", name: "" },
    ],
  });
  it("creates, then is idempotent, then carries a hand edit of the catalogue half only", () => {
    const s = store();
    const cat = must(readV1Catalogue(v1));
    expect(cat.refused.map((r) => r.index)).toEqual([2]);
    const media = (run: string, file: string) => (file === "gone.png" ? undefined : BLOB(run.length + file.length));
    const reports = cat.styles.map((x) => draftFromV1(x, media, "2026-10-17T00:00:00.000Z"));
    expect(reports[1]?.missing).toEqual(["e1/gone.png"]);
    expect(must(s.tx((t) => importV1In(t, reports, OP))).map((o) => o.result)).toEqual(["created", "created"]);
    expect(must(readStyle(s, "painted-3d")).style).toMatchObject({ status: "proven", evidence: [{ by: "operator" }, { by: "operator", at: "2026-10-17T00:00:00.000Z" }] });
    expect(must(s.tx((t) => importV1In(t, reports, OP))).map((o) => o.result)).toEqual(["same", "same"]);
    const edited = must(readV1Catalogue(v1.replace('"recipe":"Paint."', '"recipe":"Paint, thicker."').replace('"evidence":[{"run":"r1"', '"evidence":[{"run":"r9"')));
    const out = must(s.tx((t) => importV1In(t, edited.styles.map((x) => draftFromV1(x, media, "2026-10-17T00:00:00.000Z")), OP)));
    expect(out.map((o) => o.result)).toEqual(["edited", "same"]);
    expect(must(readStyle(s, "painted-3d")).style).toMatchObject({ recipe: "Paint, thicker.", evidence: [{ run: "r1" }, { run: "r2" }] });
  });
});

