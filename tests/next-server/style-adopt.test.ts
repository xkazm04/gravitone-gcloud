// ADOPT -> LOCKED, THROUGH THE STORE (Phase 5 L48; the exit's "adopting a style to locked is
// driven end to end", on the server side, dry). v1's adopt draft (lib/foundry/adopt.ts: palette
// read by the recognizer off the first kept plate, recipe as slots, kept text-lane plates seeded
// as PENDING proofs) now lands IN PLACE on the proven style, in one store transaction, and
// styles.json is re-exported. Then the operator judges the seeded plates and locks - refused by
// the store until the gate holds. No vendor is called: the recognizer is a stand-in.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-style-adopt-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store", "gravitone.sqlite");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Actor } from "@gt/domain/event";
import { STYLE_TRIALS } from "@gt/domain/style.ratchet";
import { readStyle } from "@gt/kernel/styles/driver";
import { addProofsIn } from "@gt/kernel/styles/writers";

import { adoptInStore, type AdoptIO } from "../../lib/foundry/adopt.ts";
import { exportStyles, styleOp, styleStore } from "../../lib/foundry/catalogue.ts";
import { getCatalogue } from "../../lib/foundry/store.ts";
import type { LedgerRow, StyleDef } from "../../lib/foundry/types.ts";
import { closeKernel } from "../../lib/kernelStore.ts";

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const catDir = path.join(ROOT, "catalogue");
const OP: Actor = { kind: "operator", id: "op" };
const ev = (run: string, scene: string) => ({ run, scene, mechanism: "txt", verdict: "keep" as const, at: "2026-09-01T00:00:00.000Z" });
const def = (id: string, status: StyleDef["status"], evidence: StyleDef["evidence"]): StyleDef => ({ id, name: id, family: "f", status, origin: { kind: "readback" }, observables: { render_mode: "painterly" }, recipe: "Painted matte surfaces. Warm palette of ochre. Soft rim light.", negative: "photo", evidence });
const row = (style: string, scene: string, seed: number): LedgerRow => ({ run: "r1", scene, style, mechanism: "txt", seed, verdict: "keep", craft: null, style_score: null, has_text: null, at: "2026-09-01T00:00:00.000Z" });

mkdirSync(catDir, { recursive: true });
writeFileSync(path.join(catDir, "styles.json"), JSON.stringify({ styles: [def("painted", "proven", [ev("r1", "a"), ev("r1", "b")]), def("raw", "candidate", [])] }));
writeFileSync(path.join(catDir, "ledger.json"), JSON.stringify({ rows: [row("painted", "a", 1), row("painted", "b", 2)] }));

const PNG = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
const io = (palette: unknown): AdoptIO => ({
  readPlate: async () => ({ base64: PNG, mime: "image/png" }),
  readSidecar: async () => ({ mechanism: { reference: false }, workflow: { "1": { inputs: { unet_name: "flux-dev" } } } }),
  recognize: async () => palette,
});
const PALETTE = { palette: [{ name: "ink", hex: "#101010", role: "ground" }, { name: "ochre", hex: "#c08a3e", role: "objects" }, { name: "rose", hex: "#e05a7a", role: "accent" }] };

describe("adopt, in place, then lock", () => {
  it("a missing palette writes nothing; a candidate is refused before any recognizer call", async () => {
    const cat = await getCatalogue();
    const painted = cat.styles.find((s) => s.id === "painted");
    const raw = cat.styles.find((s) => s.id === "raw");
    if (painted === undefined || raw === undefined) throw new Error("the seeded catalogue did not import");
    await expect(adoptInStore(painted, cat.ledger, io({ palette: [] }))).rejects.toThrow("did not hold exactly one ground colour");
    const s = await styleStore();
    const r = readStyle(s, "painted");
    expect(r.ok && r.value.style.block).toBeUndefined();
    await expect(adoptInStore(raw, cat.ledger, io(PALETTE))).rejects.toThrow("only a proven style is adopted");
  });

  it("lands the look and the seeded proofs on the proven style, re-exports, and locks only through the gate", async () => {
    const cat = await getCatalogue();
    const painted = cat.styles.find((s) => s.id === "painted");
    if (painted === undefined) throw new Error("no painted");
    const { view } = await adoptInStore(painted, cat.ledger, io(PALETTE), OP);
    expect(view).toMatchObject({ status: "proven", palette: PALETTE.palette, block: { technique: "Painted matte surfaces.", finish: "Soft rim light." } });
    expect(view.proofs.map((p) => [p.state, p.lineage])).toEqual([["pending", "unknown"], ["pending", "unknown"]]);
    expect(view.lock).toMatchObject({ can: false, blocker: "2 proofs still undecided", legacySheet: true });
    const exported = readFileSync(path.join(catDir, "styles.json"), "utf8");
    expect(exported).toContain('"technique": "Painted matte surfaces."');

    const again = await adoptInStore(painted, cat.ledger, io(PALETTE), OP).then(() => "adopted twice", (e: unknown) => String(e));
    expect(again).toContain("already has a look");

    let rev = view.rev;
    const act = async (op: Parameters<typeof styleOp>[0]["op"]) => {
      const r = await styleOp({ styleId: "painted", baseRev: rev, op }, OP);
      rev = r.view.rev;
      return r;
    };
    const early = await act({ kind: "lock" });
    expect(early.kind === "refused" ? early.reason : early.kind).toBe("cannot lock: 2 proofs still undecided");
    for (const p of view.proofs) await act({ kind: "judge-proof", proofId: p.id, state: p === view.proofs[0] ? "approved" : "rejected", note: "the rim light reads" });
    // The seeded forge plates answer no trial problem, so the gate still wants coverage
    // (ruled 2026-10-17: no legacy one-approval gate for a sheet not locked in v1).
    const short = await act({ kind: "lock" });
    expect(short.kind === "refused" ? short.reason : short.kind).toContain("approve 3 more problems");
    // A proof job's landing (wave B's producer) - three trials under the current block - then the verdicts.
    const s = await styleStore();
    const digest = view.blockDigest ?? "";
    const landed = s.tx((t) => addProofsIn(t, "painted", STYLE_TRIALS.slice(0, 3).map((tr, i) => ({ id: `gen-${tr.id}`, label: tr.label, media: { sha256: String(i + 1).repeat(64), bytes: 8, mime: "image/png" }, state: "pending" as const, trialId: tr.id, blockDigest: digest, at: "2026-10-17T12:00:00.000Z" })), OP));
    if (!landed.ok) throw landed.error;
    exportStyles(s);
    rev = landed.value.rev;
    for (const tr of STYLE_TRIALS.slice(0, 3)) await act({ kind: "judge-proof", proofId: `gen-${tr.id}`, state: "approved" });
    const locked = await act({ kind: "lock" });
    expect(locked).toMatchObject({ kind: "applied", view: { status: "locked", lock: { lockedBy: "op" } } });
    // ...and the export follows every applied op, so a Python reader sees the lock.
    expect(readFileSync(path.join(catDir, "styles.json"), "utf8")).toContain('"locked": {');
  });
});
