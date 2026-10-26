import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonAt } from "@gt/domain/door";
import type { Actor } from "@gt/domain/event";
import type { StyleOp, StyleOpOutcome } from "@gt/domain/styleView";
import { openKernel, type Kernel } from "../src/kernel.ts";
import type { Store } from "../src/store.ts";
import { applyStyleOp, putStyleIn, readStyle } from "../src/styles/driver.ts";
import { draftFromV1Theme, importV1ThemeIn } from "../src/styles/v1theme.ts";
import { draftFromV1, importV1In, planImportV1In, readV1Catalogue } from "../src/styles/v1.ts";
import { must, steppingClock } from "./helpers.ts";

// THE STYLE STORE'S v1 DOORS (Phase 5 L48): a v1 theme and v1's styles.json catalogue coming in.
// The store's own writes, the ratchet, the lock gate and the export are styles.test.ts.

const OP: Actor = { kind: "operator", id: "op" };
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
const op = (s: Store, id: string, o: StyleOp): StyleOpOutcome => must(applyStyleOp(s, { styleId: id, baseRev: must(readStyle(s, id)).rev, op: o }, OP));

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
  it("names a second entry under an id already read, so the dry run and the run agree", () => {
    const s = store();
    const doc = must(parseJsonAt("v1 fixture", z.object({ styles: z.array(z.looseObject({})) }), v1));
    const twice = JSON.stringify({ styles: [doc.styles[0], { ...doc.styles[0], recipe: "Paint, again." }] });
    const cat = must(readV1Catalogue(twice));
    expect(cat.refused.map((r) => [r.index, r.message])).toEqual([[1, "styles.json styles[1]: painted-3d is already styles[0]"]]);
    const reports = cat.styles.map((x) => draftFromV1(x, () => undefined, "2026-10-17T00:00:00.000Z"));
    const dry = must(s.read((r) => planImportV1In(r, reports))).map((o) => o.result);
    expect(must(s.tx((t) => importV1In(t, reports, OP))).map((o) => o.result)).toEqual(dry);
    expect(must(readStyle(s, "painted-3d")).style.recipe).toBe("Paint.");
  });
});
