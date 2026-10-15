// THE EXTRACT DECISION ADAPTER (lib/decision/v1/sources/extract.ts): a look
// is a row (its gallery source the reference), its replicas and transfers the
// cells; v1's per-look verdict is imported onto every cell and read back off
// them (kept when any image is kept); v1's free tags map onto the extract
// reasons; and the commit reaches v1 through patchExtractVerdicts +
// commitExtractRun, idempotently, with every crash prefix recovering.

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-extract-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Decision } from "@gt/domain/decision";

import { __setFoundryFsPort } from "../../lib/foundry/fsPort.ts";
import { OBSERVABLE_FIELDS, type ExtractManifest, type ExtractVerdicts, type ExtractedStyle, type Observables } from "../../lib/foundry/extract/types.ts";
import type { StyleDef } from "../../lib/foundry/types.ts";
import { extractAdapter, importVerdict, lookDecision, type ExtractV1 } from "../../lib/decision/v1/sources/extract.ts";
import { RecordingPort } from "../golden-path/_effects.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const RUN = "2026-10-14-gallery";
const runDir = path.join(ROOT, "foundry-out", "extract", RUN);
const catDir = path.join(ROOT, "catalogue");
const blobDir = path.join(ROOT, "blobs");

afterEach(() => __setFoundryFsPort(null));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const obs = (over: Partial<Observables> = {}): Observables => ({ ...(Object.fromEntries(OBSERVABLE_FIELDS.map((f) => [f, "x"])) as Observables), ...over });
const round = (n: number, file: string | null, score: number | null) => ({ n, file, score, per_field: {}, recipe: "r", prompt: `p${n}`, critique: null, generator: "g", vision: "v", error: file ? null : "generation failed" });
const look = (id: string, members: string[], over: Partial<ExtractedStyle> = {}): ExtractedStyle => ({
  id,
  name: id.toUpperCase(),
  family: "photo",
  members,
  observables: obs(),
  recipe: "r",
  negative: "n",
  recipe_history: ["r"],
  grouped_by: "engine",
  replicas: [],
  transfers: [],
  ...over,
});

const STYLES: ExtractedStyle[] = [
  look("haze", ["s01"], {
    replicas: [{ source: "s01", rounds: [round(1, "rep/haze-1.jpg", 0.6), round(2, "rep/haze-2.jpg", 0.8)] }],
    transfers: [{ scene: 0, brief: "a harbour", file: "tr/haze-0.jpg", score: 0.7, per_field: {}, prompt: "tp", readback: null, generator: "g", vision: "v", error: null }],
  }),
  look("grain", ["s02"], { observables: obs({ render_mode: "ink" }), replicas: [{ source: "s02", rounds: [round(1, null, null)] }] }),
];

const manifest = (over: Partial<ExtractManifest> = {}): ExtractManifest => ({
  id: RUN,
  slug: "gallery",
  created: "2026-10-14T09:00:00.000Z",
  finished: "2026-10-14T10:00:00.000Z",
  status: "done",
  progress: { stage: "done", done: 1, total: 1 },
  options: { rounds: 2, replicas: 1, transfers: 1, target: 0.8, seed: 1, grouping: "engine" },
  sources: [
    { id: "s01", name: "a.png", file: "src/s01.png", mime: "image/png", width: 10, height: 10, aspect: "16:9", readback: null, error: null },
    { id: "s02", name: "b.png", file: "src/s02.png", mime: "image/png", width: 10, height: 10, aspect: "16:9", readback: null, error: null },
  ],
  styles: STYLES,
  engines: { vision: "qwen-vl" },
  log: [],
  ...over,
});

const VERDICTS: ExtractVerdicts = { grain: { verdict: "reject", at: "2026-10-14T11:00:00.000Z", reasons: ["muddy", "Style"], note: "too dark", by: "human" } };

function seed(): void {
  rmSync(path.join(ROOT, "foundry-out"), { recursive: true, force: true });
  rmSync(catDir, { recursive: true, force: true });
  mkdirSync(catDir, { recursive: true });
  for (const d of ["src", "rep", "tr"]) mkdirSync(path.join(runDir, d), { recursive: true });
  for (const f of ["src/s01.png", "src/s02.png", "rep/haze-1.jpg", "rep/haze-2.jpg", "tr/haze-0.jpg"]) writeFileSync(path.join(runDir, f), `bytes ${f}`);
  writeFileSync(path.join(runDir, "run.json"), JSON.stringify(manifest()));
  writeFileSync(path.join(runDir, "verdicts.json"), JSON.stringify(VERDICTS));
  // An older run already holds a `haze` (a rename) and a `fog` that reads the same (a near-duplicate).
  const older = (id: string, o: Observables): StyleDef => ({ id, name: `old ${id}`, family: "photo", status: "candidate", origin: { kind: "extracted", source: "older" }, observables: o, recipe: "r", negative: "n", evidence: [] });
  writeFileSync(path.join(catDir, "styles.json"), JSON.stringify({ styles: [older("haze", obs({ render_mode: "oil", medium: "paint" })), older("fog", obs())] }));
}

const SHA = "c".repeat(64);
const literal = (over: Partial<ExtractV1> = {}): ExtractV1 => ({
  run: manifest(),
  verdicts: VERDICTS,
  rev: 1,
  catalogue: { styles: [] },
  media: Object.fromEntries(["src/s01.png", "src/s02.png", "rep/haze-2.jpg", "tr/haze-0.jpg"].map((f) => [f, { sha256: SHA, bytes: 5, mime: "image/jpeg" }])),
  verdictsAt: "2026-10-14T12:00:00.000Z",
  ...over,
});

describe("extract adapter - the packet (pure)", () => {
  it("rows are looks with their gallery source as reference; cells are what the recipe drew", () => {
    const plan = must(extractAdapter.packet(literal()));
    expect(plan.packet.items.map((c) => [c.id, c.row])).toEqual([
      ["haze/replica-1", "haze"],
      ["haze/transfer-1", "haze"],
      ["grain/source", "grain"],
    ]);
    // The replica cell is the BEST round (0.8), commitExtractRun's own pick.
    expect(plan.urls["haze/replica-1"]).toBe(`/api/foundry/file?run=${RUN}&path=rep%2Fhaze-2.jpg&kind=extract`);
    expect(plan.present.rows[0]).toMatchObject({ id: "haze", ref: `/api/foundry/file?run=${RUN}&path=src%2Fs01.png&kind=extract`, inCatalogue: false });
    expect(plan.losses).toContainEqual(expect.objectContaining({ candidate: "grain/source", grade: "approximate" }));
    expect(plan.packet.items[0]?.grades).toEqual([{ field: "replica_score", value: 0.8, series: "qwen-vl", calibration: { status: "insufficient", short: "floor", nKeep: 0, nReject: 0 } }]);
  });

  it("v1's per-look verdict lands on every cell; a tag that names a reason becomes one, the rest stay in the note", () => {
    const plan = must(extractAdapter.packet(literal()));
    expect(plan.initial).toEqual([{ candidate: "grain/source", verdict: "reject", reasons: ["style"], note: "tags: muddy\ntoo dark", by: "operator", surface: "v1", at: "2026-10-14T11:00:00.000Z" }]);
    expect(importVerdict({ verdict: "keep", at: "x", reasons: ["style"] })).toMatchObject({ reasons: [], note: "tags: style" });
  });

  it("a look is kept when any image is kept, rejected only when every one is, undecided while any is open", () => {
    const d = (verdict: "keep" | "reject" | null, reasons: string[] = [], note?: string): Decision => ({ key: "p::x", verdict, reasons, ...(note === undefined ? {} : { note }), rev: 1, by: "operator", surface: "board", at: "2026-10-14T00:00:00.000Z" });
    expect(lookDecision([d("keep"), d("reject", ["craft"])]).verdict).toBe("keep");
    expect(lookDecision([d("reject", ["craft"]), d("reject", ["style"], "n")])).toMatchObject({ verdict: "reject", reasons: ["style", "craft"], note: "n" });
    expect(lookDecision([d("keep"), d(null)]).verdict).toBeNull();
    expect(lookDecision([d("keep"), undefined]).verdict).toBeNull();
  });
});

describe("extract adapter - consequence and apply over a temp v1 store", () => {
  it("previews the rename and the near-duplicate, says a rejected image of a kept look stays an exemplar, and commits", async () => {
    seed();
    const flow = await openFlow(extractAdapter, RUN, blobDir);
    expect(flow.plan.present.rows[0]).toMatchObject({ id: "haze", inCatalogue: true });
    flow.patch([{ candidate: "haze/replica-1", verdict: "keep" }, { candidate: "haze/transfer-1", verdict: "reject", reasons: ["subject"] }]);
    const p = must(flow.preview());
    expect(p.consequence.renames).toEqual([{ from: "haze", to: "haze-2" }]);
    expect(p.consequence.nearDuplicates).toEqual([{ candidate: "haze", of: "fog" }]);
    expect(p.consequence.writes).toContainEqual(expect.objectContaining({ candidate: "haze/transfer-1", detail: "still an exemplar of haze: v1 keeps a look whole" }));
    must(flow.commit());
    expect((await flow.deliver())?.result).toBe("applied");
    const run = JSON.parse(readFileSync(path.join(runDir, "run.json"), "utf8")) as ExtractManifest & { committed: { kept: string[]; written: string[] } };
    expect(run.status).toBe("committed");
    expect(run.committed).toMatchObject({ kept: ["haze"], rejected: ["grain"], written: ["haze-2"] });
    const v = JSON.parse(readFileSync(path.join(runDir, "verdicts.json"), "utf8")) as ExtractVerdicts;
    // grain was left as imported: v1's record is byte-identical, tags and all.
    expect(v["grain"]).toEqual(VERDICTS["grain"]);
    expect(v["haze"]).toMatchObject({ verdict: "keep", by: "human" });
  });

  it("refuses to preview a commit that keeps nothing, in v1's words", async () => {
    seed();
    const flow = await openFlow(extractAdapter, RUN, blobDir);
    flow.patch([{ candidate: "haze/replica-1", verdict: "reject" }, { candidate: "haze/transfer-1", verdict: "reject" }]);
    const p = flow.preview();
    expect(p.ok ? null : [p.error.code, p.error.message]).toEqual(["invalid", "Keep at least one style first."]);
  });

  it("a second delivery is a no-op, a different v1 outcome is refused, and every crash prefix recovers", async () => {
    seed();
    const flow = await openFlow(extractAdapter, RUN, blobDir);
    flow.patch([{ candidate: "haze/replica-1", verdict: "keep" }, { candidate: "haze/transfer-1", verdict: "keep" }]);
    must(flow.commit());
    const claim = flow.claim();
    const clean = new RecordingPort();
    __setFoundryFsPort(clean);
    must(await extractAdapter.apply(claim));
    __setFoundryFsPort(null);
    const snapshot = () => {
      const strip = (s: string) => s.replace(/"at":\s*"[^"]*"/g, '"at":""').replace(/"_rev":\s*\d+/g, '"_rev":0');
      return [readFileSync(path.join(catDir, "styles.json"), "utf8"), readFileSync(path.join(runDir, "verdicts.json"), "utf8"), readFileSync(path.join(runDir, "run.json"), "utf8")].map(strip);
    };
    const want = snapshot();
    must(await extractAdapter.apply(claim));
    expect(snapshot()).toEqual(want);
    for (let k = 1; k <= clean.applied; k++) {
      seed();
      __setFoundryFsPort(new RecordingPort({ crashAt: k }));
      expect((await extractAdapter.apply(claim)).ok, `crash at ${k}`).toBe(false);
      __setFoundryFsPort(null);
      must(await extractAdapter.apply(claim));
      expect(snapshot(), `retry after a crash at mutation ${k}`).toEqual(want);
    }
    const run = JSON.parse(readFileSync(path.join(runDir, "run.json"), "utf8")) as ExtractManifest;
    writeFileSync(path.join(runDir, "run.json"), JSON.stringify({ ...run, committed: { at: "x", kept: [], rejected: ["haze", "grain"] } }));
    const r = await extractAdapter.apply(claim);
    expect(r.ok ? "" : r.error.message).toContain("haze is not kept in v1, keep here");
  }, 30_000); // every crash prefix replays a commit: slow under a full parallel run
});
