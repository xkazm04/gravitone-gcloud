// THE STYLE ATELIER'S REAL SIDE (Phase 5 wave B, L54) - the four verbs over the kernel's `styles`
// module and the style producer, on a temp store and a temp catalogue: adopt (the palette read off
// a kept forge plate, dry: a stand-in palette that says so), generate-proofs as a PRICED job (one
// line per trial, the token bound to the style's revision, one job per confirm), judge, and a lock
// the server refuses until the gate holds. No vendor is reached: the engines handed in throw if
// called, and the one live drive below uses a fake that reports what a vendor would.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-style-real-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store", "gravitone.sqlite");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ok, type Result } from "@gt/domain/errors";
import type { Receipt } from "@gt/domain/produce";
import type { StyleAct, StyleActOutcome, StyleOp, StyleOpOutcome, StyleView } from "@gt/domain/styleView";
import type { Store } from "@gt/kernel/store";
import { readStyle } from "@gt/kernel/styles/driver";

import { makeRealStyle } from "../../app/(studio)/library/style/_port/real.ts";
import { closeKernel, kernel } from "../../lib/kernelStore.ts";
import { driveStyleJob, type StyleEngines } from "../../lib/producers/style.ts";
import { launchStyleAct, styleActReceipt, styleJobId } from "../../lib/producers/styleLaunch.ts";

const catDir = path.join(ROOT, "catalogue");
const NOW = Date.parse("2026-10-17T12:00:00.000Z");
const calls = { generate: 0, recognize: 0 };
const NEVER: StyleEngines = {
  generate: async () => {
    calls.generate++;
    throw new Error("a dry act reached the image vendor");
  },
  recognize: async () => {
    calls.recognize++;
    throw new Error("a dry act reached the recognizer");
  },
};

const store = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};
const side = makeRealStyle({ store, now: () => NOW, dryOnly: () => true, engines: NEVER });
const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw r.error;
  return r.value;
};
const view = async (id: string): Promise<StyleView> => must(await side.loadStyle({ id }));
const op = async (id: string, o: StyleOp): Promise<StyleOpOutcome> => must(await side.opStyle({ styleId: id, baseRev: (await view(id)).rev, op: o }, "op-1"));
const receipt = async (act: StyleAct): Promise<Receipt> => must(await side.actReceipt({ act, mode: "dry" }));
const confirm = async (act: StyleAct, token: string): Promise<StyleActOutcome> => must(await side.act({ act, mode: "dry", token }, "op-1"));
async function run(act: StyleAct): Promise<StyleView> {
  const done = await confirm(act, (await receipt(act)).token);
  if (done.kind !== "launched") throw new Error("stale");
  return done.view;
}

const keep = (run: string, scene: string) => ({ run, scene, mechanism: "text", verdict: "keep" as const, at: "2026-09-01T00:00:00.000Z" });
const def = (id: string, status: string, evidence: unknown[]) => ({ id, name: id === "painted" ? "Painted" : id, family: "animation", status, origin: { kind: "readback" }, observables: { render_mode: "painterly" }, recipe: "Painted matte surfaces. A warm palette of ochre. Soft rim light.", negative: "photograph", evidence });
const row = (scene: string, seed: number) => ({ run: "r1", scene, style: "painted", mechanism: "text", seed, verdict: "keep", craft: null, style_score: null, has_text: null, at: "2026-09-01T00:00:00.000Z" });
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

beforeAll(() => {
  mkdirSync(catDir, { recursive: true });
  writeFileSync(path.join(catDir, "styles.json"), JSON.stringify({ styles: [def("painted", "proven", [keep("r1", "a"), keep("r1", "b")]), def("raw", "candidate", []), def("lost", "proven", [keep("r9", "a"), keep("r9", "b")])] }));
  // `lost` has a kept row in the ledger and no plate on this machine.
  writeFileSync(path.join(catDir, "ledger.json"), JSON.stringify({ rows: [row("a", 1), row("b", 2), { ...row("a", 1), run: "r9", style: "lost" }] }));
  for (const [scene, seed] of [["a", 1], ["b", 2]] as const) {
    const dir = path.join(ROOT, "foundry-out", "runs", "r1", "scenes", scene, "candidates");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `painted--text--s${seed}.png`), PNG);
    writeFileSync(path.join(dir, `painted--text--s${seed}.json`), JSON.stringify({ mechanism: { reference: false }, workflow: { "1": { inputs: { unet_name: "flux2-klein-9b" } } } }));
  }
});

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const TRIALS = ["peak-and-fall", "wish-list", "booking-not-meal"];

describe("the real atelier, adopt to locked, dry", () => {
  it("refuses to adopt a candidate before anything is priced", async () => {
    const r = await side.actReceipt({ act: { kind: "adopt", fromStyleId: "raw" }, mode: "dry" });
    expect(r.ok ? null : r.error.message).toBe("raw is a candidate; only a proven style is adopted");
  });

  it("a job that ends failed answers its own sentence, and nothing is adopted (no plate, no look)", async () => {
    const rc = await receipt({ kind: "adopt", fromStyleId: "lost" });
    const r = await side.act({ act: { kind: "adopt", fromStyleId: "lost" }, mode: "dry", token: rc.token }, "op-1");
    expect(r.ok ? null : r.error.message).toMatch(/^lost was not adopted: The kept plate of lost is not on this machine/);
    expect((await view("lost")).block).toBeNull();
  });

  it("adopts in place through a priced receipt: the palette read says it is a stand-in, the kept plates are pending proofs", async () => {
    const before = await view("painted");
    expect(before).toMatchObject({ status: "proven", block: null });
    const rc = await receipt({ kind: "adopt", fromStyleId: "painted" });
    expect(rc.lines.map((l) => [l.label, l.usd])).toEqual([["palette readback", null]]);
    expect(rc.lines[0]?.unpricedReason).toBeTruthy();
    const done = await confirm({ kind: "adopt", fromStyleId: "painted" }, rc.token);
    if (done.kind !== "launched") throw new Error("stale");
    expect(done.jobId).toBe(styleJobId("painted", rc.token));
    expect(done.view.palette?.map((c) => c.name)).toEqual(["dry stand-in ground", "dry stand-in objects", "dry stand-in accent"]);
    expect(done.view.block).toMatchObject({ technique: "Painted matte surfaces.", subject: "", finish: "Soft rim light." });
    expect(done.view.proofs.map((p) => [p.state, p.source])).toEqual([
      ["pending", "forge:r1/scenes/a/candidates/painted--text--s1.png"],
      ["pending", "forge:r1/scenes/b/candidates/painted--text--s2.png"],
    ]);
    // A second confirm of the same receipt finds the job it made; nothing is adopted twice.
    const again = await confirm({ kind: "adopt", fromStyleId: "painted" }, rc.token);
    expect(again).toMatchObject({ kind: "launched", jobId: done.jobId, view: { rev: done.view.rev } });
    // The export the Python readers forge against moved with the store.
    const exported = JSON.parse(readFileSync(path.join(catDir, "styles.json"), "utf8")) as { _rev: number };
    expect(exported._rev).toBeGreaterThan(0);
  });

  it("prices one plate per trial, binds the token to the style's revision, and renders under the current block", async () => {
    const v = await view("painted");
    const act: StyleAct = { kind: "generate-proofs", styleId: "painted", baseRev: v.rev, trialIds: TRIALS };
    const stale = await receipt(act);
    expect(stale.lines.map((l) => l.label)).toEqual(["the fall · quantity", "the wish list · inventory", "the booking · analogy"]);
    expect(stale.lines.every((l) => l.usd !== null && l.usd > 0)).toBe(true);
    await op("painted", { kind: "set-elements", elements: ["a ledger"] });
    const moved = await confirm(act, stale.token);
    expect(moved.kind).toBe("stale");
    expect((await view("painted")).proofs).toHaveLength(2);
    const rendered = await run(act);
    const current = rendered.proofs.filter((p) => p.lineage === "current");
    expect(current.map((p) => p.trialId)).toEqual(TRIALS);
    expect(current.every((p) => p.state === "pending" && p.provider === "dry-run" && p.costUsd === 0 && p.label.endsWith("· dry stand-in"))).toBe(true);
  });

  it("refuses the lock with the gate's sentence, then admits it once three problems are approved and nothing is pending", async () => {
    const early = await op("painted", { kind: "lock" });
    expect(early).toMatchObject({ kind: "refused", reason: "cannot lock: 5 proofs still undecided" });
    for (const p of (await view("painted")).proofs) {
      const out = await op("painted", p.lineage === "current" ? { kind: "judge-proof", proofId: p.id, state: "approved" } : { kind: "judge-proof", proofId: p.id, state: "rejected", note: "a forge plate, not this look" });
      expect(out.kind).toBe("applied");
    }
    const locked = await op("painted", { kind: "lock" });
    expect(locked).toMatchObject({ kind: "applied", view: { status: "locked", lock: { lockedBy: "op-1" } } });
    expect(locked.view.refs).toHaveLength(3);
    expect(calls).toEqual({ generate: 0, recognize: 0 });
  });

  // The port's contract (./contract.ts) and the produce port's real side: a live read on a
  // dry-only process is refused before any price is drawn; the confirm is refused by the meter.
  it("refuses a live receipt where the process runs dry only, and a live confirm in the meter's words", async () => {
    const v = await view("painted");
    const act: StyleAct = { kind: "generate-proofs", styleId: "painted", baseRev: v.rev, trialIds: ["flywheel"] };
    const read = await side.actReceipt({ act, mode: "live" });
    expect(read.ok ? null : read.error.code).toBe("refused");
    const s = must(store());
    const rc = must(styleActReceipt(s, act, { mode: "live", now: NOW }));
    const r = await side.act({ act, mode: "live", token: rc.token }, "op-1");
    expect(r.ok ? null : r.error.code).toBe("refused");
    expect((await view("painted")).proofs.some((p) => p.trialId === "flywheel")).toBe(false);
  });
});

describe("the job renders what was priced, or nothing", () => {
  it("stops before paying when the block changed after the confirm, and writes no plate", async () => {
    const s = must(store());
    const dup = await op("painted", { kind: "duplicate" });
    const id = dup.kind === "applied" ? (dup.created ?? "") : "";
    const v = await view(id);
    if (v.block === null) throw new Error("the duplicate carries the look");
    const act: StyleAct = { kind: "generate-proofs", styleId: id, baseRev: v.rev, trialIds: ["flywheel"] };
    const rc = must(styleActReceipt(s, act, { mode: "dry", now: NOW }));
    const launched = must(launchStyleAct(s, act, rc.token, { mode: "dry", now: NOW, actor: { kind: "operator", id: "op-1" }, dryOnly: true }));
    if (launched.kind !== "launched") throw new Error("stale");
    await op(id, { kind: "set-block", block: { ...v.block, finish: "Glossy enamel." } });
    const report = must(await driveStyleJob(s, launched.jobId, { dryOnly: true, engines: NEVER }));
    expect(report.outcome).toBe("failed");
    expect(report.job?.error?.message).toMatch(/block changed since it was priced/);
    expect(must(readStyle(s, id)).style.proofs).toEqual([]);
  });

  // A live drive outlives its request: a crash after the answer has no caller left to tell, so the
  // side reports it (a rejection nobody handles is an unhandledRejection, and the job's id is lost).
  it("reports a live drive that crashed after the act answered launched", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const crashed = makeRealStyle({ store, now: () => NOW, dryOnly: () => false, engines: NEVER, drive: () => Promise.reject(new Error("the lane's lease was lost")) });
    const v = await view("painted");
    const act: StyleAct = { kind: "generate-proofs", styleId: "painted", baseRev: v.rev, trialIds: ["wish-list"] };
    const rc = must(await crashed.actReceipt({ act, mode: "live" }));
    expect(must(await crashed.act({ act, mode: "live", token: rc.token }, "op-1")).kind).toBe("launched");
    await new Promise((done) => setTimeout(done, 0));
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("the lane's lease was lost"));
    errors.mockRestore();
  });

  it("books a live plate with what the vendor reported (a fake vendor, never the router)", async () => {
    const s = must(store());
    const v = await view("painted-copy");
    const act: StyleAct = { kind: "generate-proofs", styleId: v.id, baseRev: v.rev, trialIds: ["the-exit"] };
    const rc = must(styleActReceipt(s, act, { mode: "live", now: NOW }));
    const launched = must(launchStyleAct(s, act, rc.token, { mode: "live", now: NOW, actor: { kind: "operator", id: "op-1" }, dryOnly: false }));
    if (launched.kind !== "launched") throw new Error("stale");
    const seen: string[] = [];
    const fake: StyleEngines = {
      generate: async (req) => {
        seen.push(req.prompt);
        return { images: [{ base64: PNG.toString("base64"), mime: "image/png" }], provenance: { provider: "google", model: "gemini-3.1-flash-image", modelBasis: "requested", costUsd: 0.045, durationMs: 1200 } };
      },
      recognize: NEVER.recognize,
    };
    const report = must(await driveStyleJob(s, launched.jobId, { dryOnly: false, engines: fake }));
    expect(report.outcome).toBe("done");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("Glossy enamel.");
    const proof = must(readStyle(s, v.id)).style.proofs.at(-1);
    expect(proof).toMatchObject({ trialId: "the-exit", provider: "google", costUsd: 0.045, state: "pending" });
    expect(proof?.label).not.toContain("stand-in");
    expect(existsSync(path.join(catDir, "styles.json"))).toBe(true);
  });
});
