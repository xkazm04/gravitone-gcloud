// THE FORGE DECISION ADAPTER (lib/decision/v1/sources/forge.ts): the pure
// halves over literal v1 records, then the apply through the REAL kernel over a
// temp v1 store - the operator's verdicts reach v1's verdicts.json, its
// commit deletes the rejected and indexes the decided, a second delivery is a
// no-op, a v1 holding another outcome is refused, and every crash prefix of
// v1's own commit converges on the uninterrupted end state on retry.

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// lib/foundry/store.ts fixes its run root from process.cwd() at import, and
// the catalogue from FOUNDRY_DIR at call time: both point into a temp dir
// BEFORE anything imports it.
const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-forge-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  // The style store (Phase 5): its own directory, so a seed can close and replace it.
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "style-store", "gravitone.sqlite");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CALIBRATION_METHOD, type GraderCalibrationFile } from "../../lib/foundry/calibration.ts";
import { __setFoundryFsPort } from "../../lib/foundry/fsPort.ts";
import { closeKernel, kernel } from "../../lib/kernelStore.ts";
import type { Candidate, RunManifest, StyleDef, Verdicts } from "../../lib/foundry/types.ts";
import { forgeAdapter, gradesOf, measuredSeries, seriesMismatch, importVerdict, type ForgeV1 } from "../../lib/decision/v1/sources/forge.ts";
import { RecordingPort } from "../golden-path/_effects.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const RUN = "2026-10-14-sweep";
const runDir = path.join(ROOT, "foundry-out", "runs", RUN);
const catDir = path.join(ROOT, "catalogue");
const SHA = "a".repeat(64);
const blobDir = path.join(ROOT, "blobs");

afterEach(() => __setFoundryFsPort(null));
afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const style = (id: string, evidence: StyleDef["evidence"] = []): StyleDef => ({ id, name: `Haze ${id}`, family: "f", status: "candidate", origin: { kind: "authored" }, observables: {}, recipe: "r", negative: "n", evidence });

const cand = (id: string, scene: string, mechanism: string, seed: number, status: Candidate["status"], craft: number | null = 0.7): Candidate => ({
  id,
  scene,
  style: "haze",
  mechanism,
  seed,
  file: `${id}.png`,
  sidecar: `${id}.json`,
  status,
  grade: status === "graded" || status === "unmeasured" ? { grader: "qwen3-vl", grader_digest: "d1", at: "2026-10-14T10:00:00+00:00", craft: craft === null ? null : { score: craft, per_field: {}, annotation: {} }, style: null, veto: { has_text: false }, unmeasured: [] } : null,
  error: null,
});

const CANDS: Candidate[] = [
  cand("sc0/haze--ref--s0", "sc0", "ref", 0, "graded"),
  cand("sc0/haze--txt--s0", "sc0", "txt", 0, "graded"),
  cand("sc1/haze--ref--s1", "sc1", "ref", 1, "graded"),
  cand("sc1/haze--txt--s1", "sc1", "txt", 1, "unmeasured"),
  cand("sc1/haze--ref--s2", "sc1", "ref", 2, "failed"),
  cand("sc1/haze--txt--s3", "sc1", "txt", 3, "generated"), // its file is never written
];

const VERDICTS: Verdicts = {
  "sc0/haze--ref--s0": { verdict: "keep", at: "2026-10-14T11:00:00.000Z", by: "human" },
  "sc0/haze--txt--s0": { verdict: "reject", at: "2026-10-14T11:01:00.000Z", note: "reasons: style, motion\nmuddy", by: "human" },
  "sc1/haze--txt--s1": { verdict: "keep", at: "", by: "model" },
};

const manifest = (over: Partial<RunManifest> = {}): RunManifest => ({
  id: RUN,
  created: "2026-10-14T09:00:00+00:00",
  finished: "2026-10-14T10:30:00+00:00",
  plan: { id: "p", scenes: [{ id: "sc0", frame: "f0" }, { id: "sc1", frame: "f1" }], styles: ["haze"], mechanisms: [{ id: "ref", reference: true }, { id: "txt", reference: false }], seeds: [0, 1, 2, 3] },
  styles: { haze: style("haze") },
  status: "done",
  progress: { stage: "done", done: 6, total: 6 },
  scenes: [
    { id: "sc0", frame: "f0", note: "the alley", source: "sources/sc0.png", annotation: null, annotation_from: null },
    { id: "sc1", frame: "f1", note: "", source: "sources/sc1.png", annotation: null, annotation_from: null },
  ],
  candidates: CANDS,
  log: [],
  ...over,
});

/** The v1 store from nothing: run dir, plates, verdicts, the catalogue. Every call starts from the same bytes. */
function seed(verdicts: Verdicts = VERDICTS): void {
  // The style store is v1's catalogue now (Phase 5): closed and replaced with the rest, so the
  // seeded styles.json is what its first touch imports.
  closeKernel();
  rmSync(path.join(ROOT, "style-store"), { recursive: true, force: true });
  rmSync(path.join(ROOT, "foundry-out"), { recursive: true, force: true });
  rmSync(catDir, { recursive: true, force: true });
  mkdirSync(catDir, { recursive: true });
  for (const c of CANDS) {
    if (c.status === "failed" || c.id.endsWith("s3")) continue;
    mkdirSync(path.join(runDir, c.scene), { recursive: true });
    writeFileSync(path.join(runDir, c.file), `png ${c.id}`);
    writeFileSync(path.join(runDir, c.sidecar), "{}");
  }
  writeFileSync(path.join(runDir, "run.json"), JSON.stringify(manifest()));
  writeFileSync(path.join(runDir, "verdicts.json"), JSON.stringify(verdicts));
  // A human kept haze on one scene of an older run, so one more kept scene here proves it.
  writeFileSync(path.join(catDir, "styles.json"), JSON.stringify({ styles: [style("haze", [{ run: "older", scene: "x", mechanism: "ref", verdict: "keep", at: "2026-09-01T00:00:00.000Z" }])] }));
}

const literal = (over: Partial<ForgeV1> = {}): ForgeV1 => ({
  run: manifest(),
  verdicts: VERDICTS,
  rev: 3,
  catalogue: { styles: [style("haze")], ledger: [] },
  calibration: null,
  media: Object.fromEntries(CANDS.filter((c) => c.status !== "failed" && !c.id.endsWith("s3")).map((c) => [c.id, { sha256: SHA, bytes: 9, mime: "image/png" }])),
  verdictsAt: "2026-10-14T12:00:00.000Z",
  ...over,
});

describe("forge adapter - the packet (pure)", () => {
  it("opens the cull's judgeable plates by scene, drops a plate with no file and says so", () => {
    const plan = must(forgeAdapter.packet(literal()));
    expect(plan.packet.id).toBe(`pkt:forge:${RUN}`);
    expect(plan.packet.mode).toBe("matrix-cull");
    expect(plan.packet.items.map((c) => [c.id, c.row])).toEqual([
      ["sc0/haze--ref--s0", "sc0"],
      ["sc0/haze--txt--s0", "sc0"],
      ["sc1/haze--ref--s1", "sc1"],
      ["sc1/haze--txt--s1", "sc1"],
    ]);
    expect(plan.losses).toContainEqual(expect.objectContaining({ candidate: "sc1/haze--txt--s3", grade: "dropped" }));
    expect(plan.present.rows).toEqual([
      { id: "sc0", label: "the alley", ref: `/api/foundry/file?run=${RUN}&path=sources%2Fsc0.png` },
      { id: "sc1", label: "f1", ref: `/api/foundry/file?run=${RUN}&path=sources%2Fsc1.png` },
    ]);
    expect(plan.urls["sc0/haze--ref--s0"]).toBe(`/api/foundry/file?run=${RUN}&path=sc0%2Fhaze--ref--s0.png`);
  });

  it("imports v1's verdicts with their reasons, their author and their instant - and names what did not fit", () => {
    const plan = must(forgeAdapter.packet(literal()));
    expect(plan.initial).toEqual([
      { candidate: "sc0/haze--ref--s0", verdict: "keep", reasons: [], by: "operator", surface: "v1", at: "2026-10-14T11:00:00.000Z" },
      // `motion` is not a forge reason: it stays in the note, verbatim, and the loss is named.
      { candidate: "sc0/haze--txt--s0", verdict: "reject", reasons: ["style"], note: "reasons: motion\nmuddy", by: "operator", surface: "v1", at: "2026-10-14T11:01:00.000Z" },
      // A model's keep is the agent's; v1 wrote no instant, so the map's write time stands in.
      { candidate: "sc1/haze--txt--s1", verdict: "keep", reasons: [], by: "agent", surface: "v1", at: "2026-10-14T12:00:00.000Z" },
    ]);
    expect(plan.losses.map((l) => l.candidate)).toEqual(expect.arrayContaining(["sc0/haze--txt--s0", "sc1/haze--txt--s1"]));
  });

  it("a keep never carries reasons: a reasons line on a keep stays in the note", () => {
    expect(importVerdict({ verdict: "keep", at: "x", note: "reasons: style\nfine" })).toMatchObject({ reasons: [], note: "reasons: style\nfine" });
  });

  it("a keep's reasons are disclosed as a keep's, never as words outside the forge list", () => {
    const keep = "sc0/haze--ref--s0";
    const plan = must(forgeAdapter.packet(literal({ verdicts: { ...VERDICTS, [keep]: { verdict: "keep", at: "2026-10-14T11:00:00.000Z", note: "reasons: style\nfine", by: "human" } } })));
    expect(plan.losses.filter((l) => l.candidate === keep).map((l) => l.reason)).toEqual(["v1 reason(s) on a keep (style) ride in the note; only a reject carries reasons"]);
    expect(plan.losses.find((l) => l.candidate === "sc0/haze--txt--s0")?.reason).toBe("v1 reason(s) motion are not forge reasons; kept in the note");
  });

  it("refuses a run v1 itself would not commit, in v1's words", () => {
    const running = forgeAdapter.packet(literal({ run: manifest({ status: "grading" }) }));
    expect(running.ok ? "" : running.error.message).toContain("The forge is still running this run.");
    const done = forgeAdapter.packet(literal({ run: manifest({ status: "committed" }) }));
    expect(done.ok ? "" : done.error.message).toContain("This run is already committed.");
  });

  it("grades carry v1's measured calibration: the mechanism's bucket when measured, the pooled one otherwise", () => {
    const fc = (status: "calibrated" | "inverted" | "chance", auc: number, ci: [number, number]) => ({ n_keep: 20, n_reject: 20, auc, ci, status });
    const thin = { n_keep: 2, n_reject: 1, auc: null, ci: null, status: "insufficient" as const, short: "floor" as const };
    const file: GraderCalibrationFile = {
      method: CALIBRATION_METHOD,
      ledger_rows: 40,
      series: {
        "qwen3-vl@d1": {
          series: "qwen3-vl@d1",
          n: 40,
          other_graders: {},
          fields: {
            craft: { all: fc("inverted", 0.29, [0.18, 0.41]), by_mechanism: { ref: fc("calibrated", 0.8, [0.7, 0.9]), txt: thin } },
            style_score: { all: thin, by_mechanism: {} },
            has_text: { all: fc("chance", 0.5, [0.4, 0.6]), by_mechanism: {} },
          },
        },
      },
    };
    const [ref, txt] = [CANDS[0], CANDS[1]].map((c) => gradesOf(c, file));
    expect(ref?.find((g) => g.field === "craft")?.calibration.status).toBe("calibrated");
    expect(txt?.find((g) => g.field === "craft")?.calibration.status).toBe("inverted");
    expect(txt?.find((g) => g.field === "has_text")).toMatchObject({ value: 0, series: "qwen3-vl@d1", calibration: { status: "chance" } });
    // No file yet: every grade is honest about being unmeasured.
    expect(gradesOf(CANDS[0] as Candidate, null).every((g) => g.calibration.status === "insufficient")).toBe(true);
  });
});

describe("forge adapter - the cull order and the series mismatch (pure)", () => {
  const fc = (status: "calibrated" | "inverted", auc: number, ci: [number, number]) => ({ n_keep: 20, n_reject: 20, auc, ci, status });
  const calibratedCraft = (series: string, n: number, craft: ReturnType<typeof fc>): GraderCalibrationFile["series"][string] => ({
    series,
    n,
    other_graders: {},
    fields: { craft: { all: craft, by_mechanism: {} }, style_score: { all: { n_keep: 0, n_reject: 0, auc: null, ci: null, status: "insufficient", short: "floor" }, by_mechanism: {} }, has_text: { all: { n_keep: 0, n_reject: 0, auc: null, ci: null, status: "insufficient", short: "floor" }, by_mechanism: {} } },
  });
  const file = (craft: ReturnType<typeof fc>, extra: GraderCalibrationFile["series"] = {}): GraderCalibrationFile => ({
    method: CALIBRATION_METHOD,
    ledger_rows: 40,
    series: { "qwen3-vl@d1": calibratedCraft("qwen3-vl@d1", 40, craft), ...extra },
  });
  // sc0 ref craft .7 (list order first) and sc1 ref craft .9: a calibrated craft ranks sc1 first.
  const run = () => manifest({ candidates: CANDS.map((c) => (c.id === "sc1/haze--ref--s1" && c.grade?.craft ? { ...c, grade: { ...c.grade, craft: { ...c.grade.craft, score: 0.9 } } } : c)) });
  const ids = (cal: GraderCalibrationFile | null) => must(forgeAdapter.packet(literal({ run: run(), calibration: cal }))).packet.items.map((c) => c.id);
  const LIST = ["sc0/haze--ref--s0", "sc0/haze--txt--s0", "sc1/haze--ref--s1", "sc1/haze--txt--s1"];

  it("a calibrated series reorders the plates, best first", () => {
    expect(ids(file(fc("calibrated", 0.8, [0.7, 0.9])))).toEqual(["sc1/haze--ref--s1", "sc0/haze--ref--s0", "sc0/haze--txt--s0", "sc1/haze--txt--s1"]);
  });

  it("an inverted series, no calibration, or an empty series keeps the run's list order", () => {
    expect(ids(file(fc("inverted", 0.29, [0.18, 0.41])))).toEqual(LIST);
    expect(ids(null)).toEqual(LIST);
    expect(ids({ method: CALIBRATION_METHOD, ledger_rows: 0, series: {} })).toEqual(LIST);
  });

  it("a series other than the measured one marks the packet; the measured one does not", () => {
    const plates = CANDS.filter((c) => c.grade !== null);
    expect(seriesMismatch(plates, file(fc("calibrated", 0.8, [0.7, 0.9])))).toBeUndefined();
    expect(seriesMismatch(plates, null)).toBeUndefined();
    // another grader measured on more rows: the plates' own series no longer match it.
    const moved = file(fc("calibrated", 0.8, [0.7, 0.9]), { "qwen3-vl@d2": calibratedCraft("qwen3-vl@d2", 90, fc("calibrated", 0.8, [0.7, 0.9])) });
    expect(measuredSeries(moved)).toBe("qwen3-vl@d2");
    expect(seriesMismatch(plates, moved)).toEqual({ measured: "qwen3-vl@d2", graded: ["qwen3-vl@d1"] });
    expect(must(forgeAdapter.packet(literal({ calibration: moved }))).present.series).toEqual({ measured: "qwen3-vl@d2", graded: ["qwen3-vl@d1"] });
    expect(must(forgeAdapter.packet(literal({ calibration: file(fc("calibrated", 0.8, [0.7, 0.9])) }))).present.series).toBeUndefined();
  });
});

describe("forge adapter - the consequence (pure + planForgeCommit)", () => {
  it("is v1's own plan over the kernel's decisions, and its token moves with v1 but not with the revision", async () => {
    seed();
    const flow = await openFlow(forgeAdapter, RUN, blobDir);
    flow.patch([{ candidate: "sc1/haze--ref--s1", verdict: "keep" }, { candidate: "sc1/haze--txt--s1", verdict: "reject", reasons: ["craft"] }]);
    const p = must(flow.preview());
    expect(p.consequence.counts).toEqual({ kept: 2, rejected: 2, undecided: 0 });
    expect(p.consequence.deletes.map((d) => d.target)).toEqual([
      `foundry-out/runs/${RUN}/sc0/haze--txt--s0.png`,
      `foundry-out/runs/${RUN}/sc0/haze--txt--s0.json`,
      `foundry-out/runs/${RUN}/sc1/haze--txt--s1.png`,
      `foundry-out/runs/${RUN}/sc1/haze--txt--s1.json`,
    ]);
    // haze: a human keep on the older run's scene x and on sc0 and sc1 here.
    expect(p.consequence.promotions.map((x) => x.target)).toEqual(["haze"]);
    expect(p.consequence.writes.filter((w) => w.target === "pipeline/foundry/ledger.json")).toHaveLength(4);
    // A v1 plate re-rendered under the same map is a different v1: a different token.
    const moved = { ...flow.v1, media: { ...flow.v1.media, "sc0/haze--ref--s0": { sha256: "b".repeat(64), bytes: 9, mime: "image/png" } } };
    expect(must(flow.preview(moved)).consequence.token).not.toBe(p.consequence.token);
    // An undo and a redo land on the same decisions: the same token.
    flow.patch([{ candidate: "sc1/haze--ref--s1", verdict: null }]);
    flow.patch([{ candidate: "sc1/haze--ref--s1", verdict: "keep" }]);
    expect(must(flow.preview()).consequence.token).toBe(p.consequence.token);
  });
});

/** Rows in the style store's append-only op log. */
function styleOps(): number {
  const k = kernel();
  if (!k.ok) throw k.error;
  const r = k.value.store.read((x) => x.get("SELECT count(*) AS n FROM style_ops")?.["n"]);
  if (!r.ok) throw r.error;
  return Number(r.value);
}

/** The v1 end state a commit leaves, without its instants (each run stamps its own `at`). */
function endState(): unknown {
  const read = (f: string) => JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
  const noAt = (v: unknown): unknown => (Array.isArray(v) ? v.map(noAt) : v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "at" && k !== "_rev").map(([k, x]) => [k, noAt(x)])) : v);
  const run = read(path.join(runDir, "run.json"));
  return noAt({
    ledger: read(path.join(catDir, "ledger.json")),
    styles: read(path.join(catDir, "styles.json")),
    verdicts: read(path.join(runDir, "verdicts.json")),
    status: run["status"],
    committed: run["committed"],
    files: ["sc0", "sc1"].flatMap((s) => readdirSync(path.join(runDir, s)).map((f) => `${s}/${f}`)).sort(),
  });
}

describe("forge adapter - the apply (v1's own writers, through the kernel's outbox)", () => {
  it("a commit reaches v1: the operator's verdicts, the deletions, the indices; the untouched import stays byte-identical", async () => {
    seed();
    const flow = await openFlow(forgeAdapter, RUN, blobDir);
    flow.patch([{ candidate: "sc1/haze--ref--s1", verdict: "keep" }, { candidate: "sc1/haze--txt--s1", verdict: "reject", reasons: ["craft"], note: "soft" }]);
    must(flow.commit());
    const report = await flow.deliver();
    expect(report?.result).toBe("applied");
    const verdicts = JSON.parse(readFileSync(path.join(runDir, "verdicts.json"), "utf8")) as Verdicts;
    expect(verdicts["sc0/haze--txt--s0"]).toEqual(VERDICTS["sc0/haze--txt--s0"]);
    expect(verdicts["sc1/haze--txt--s1"]).toMatchObject({ verdict: "reject", note: "reasons: craft\nsoft", by: "human" });
    expect(verdicts["sc1/haze--ref--s1"]).toMatchObject({ verdict: "keep", by: "human" });
    const run = JSON.parse(readFileSync(path.join(runDir, "run.json"), "utf8")) as RunManifest;
    expect(run.status).toBe("committed");
    // The plate whose file vanished was never in the packet: v1 counts it undecided and leaves it.
    expect(run.committed).toMatchObject({ deleted: 2, kept: 2, undecided: 1 });
    expect(existsSync(path.join(runDir, "sc0/haze--txt--s0.png"))).toBe(false);
    expect(existsSync(path.join(runDir, "sc0/haze--ref--s0.png"))).toBe(true);
    const styles = JSON.parse(readFileSync(path.join(catDir, "styles.json"), "utf8")) as { styles: StyleDef[] };
    expect(styles.styles[0]?.status).toBe("proven");
  });

  it("a second delivery of the same outcome is a no-op; v1 holding another outcome is a refusal", async () => {
    seed();
    const flow = await openFlow(forgeAdapter, RUN, blobDir);
    flow.patch([{ candidate: "sc1/haze--ref--s1", verdict: "keep" }]);
    must(flow.commit());
    const claim = flow.claim();
    must(await forgeAdapter.apply(claim));
    const before = endState();
    const ops = styleOps();
    must(await forgeAdapter.apply(claim));
    expect(endState()).toEqual(before);
    // The style store's op log is the catalogue's history now (the journal stopped): no new row.
    expect(styleOps()).toBe(ops);
    // Someone flips a committed verdict in v1's file: the kernel's outcome is no longer v1's.
    const v = JSON.parse(readFileSync(path.join(runDir, "verdicts.json"), "utf8")) as Verdicts;
    writeFileSync(path.join(runDir, "verdicts.json"), JSON.stringify({ ...v, "sc0/haze--ref--s0": { verdict: "reject", at: "2026-10-14T13:00:00.000Z" } }));
    const refused = await forgeAdapter.apply(claim);
    expect(refused.ok ? "" : refused.error.code).toBe("refused");
    expect(refused.ok ? "" : refused.error.message).toContain("sc0/haze--ref--s0 is reject in v1, keep here");
  });

  it("v1's own refusal comes back verbatim and classed: a run still forging is retried, not dropped", async () => {
    seed();
    const flow = await openFlow(forgeAdapter, RUN, blobDir);
    flow.patch([{ candidate: "sc1/haze--ref--s1", verdict: "keep" }]);
    must(flow.commit());
    const claim = flow.claim();
    writeFileSync(path.join(runDir, "run.json"), JSON.stringify(manifest({ status: "grading" })));
    const r = await forgeAdapter.apply(claim);
    expect(r.ok ? null : [r.error.code, r.error.message]).toEqual(["conflict", "The forge is still running this run."]);
  });

  it("every crash prefix of v1's patch-then-commit converges on the uninterrupted end state when the outbox retries", async () => {
    seed();
    const flow = await openFlow(forgeAdapter, RUN, blobDir);
    flow.patch([{ candidate: "sc1/haze--ref--s1", verdict: "keep" }, { candidate: "sc1/haze--txt--s1", verdict: "reject", reasons: ["craft"] }]);
    must(flow.commit());
    const claim = flow.claim();
    const clean = new RecordingPort();
    __setFoundryFsPort(clean);
    must(await forgeAdapter.apply(claim));
    __setFoundryFsPort(null);
    const want = endState();
    const K = clean.applied;
    expect(K).toBeGreaterThan(5);
    for (let k = 1; k <= K; k++) {
      seed();
      __setFoundryFsPort(new RecordingPort({ crashAt: k }));
      const crashed = await forgeAdapter.apply(claim);
      expect(crashed.ok, `crash at ${k} reports a failure`).toBe(false);
      __setFoundryFsPort(null);
      must(await forgeAdapter.apply(claim));
      expect(endState(), `retry after a crash at mutation ${k}`).toEqual(want);
    }
  }, 30_000); // every crash prefix replays a commit: slow under a full parallel run
});
