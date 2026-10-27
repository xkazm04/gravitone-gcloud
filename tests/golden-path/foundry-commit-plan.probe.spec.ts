// LANE — SERVER COMMIT PLAN AND PREVIEW-APPLY LOCK (dynamic probe).
//
// Acceptance cases for Card 5:
// 1. previewCommit then commitRun on the same run -> commitRun's {kept, deleted, undecided} equal plan.counts, and the set of files missing afterwards equals plan.delete exactly.
// 2. with FOUNDRY_DIR=<tmp> and <tmp>/styles.json pre-created as a DIRECTORY, commitRun(<run with 1 rejected candidate>) rejects -> the rejected candidate's .png still exists (indices written before file deletions, making the banner "The commit failed and nothing was deleted" true).
// 3. previewExtractCommit(<done extract run keeping style 'haze'>) against a FOUNDRY_DIR catalogue already holding id 'haze' -> plan.written deep-equals [{from:'haze', to:'haze-2'}] and styles.json is byte-identical after the preview call.
// 4. previewExtractCommit where the kept style's observables equal an existing catalogue style 'old-haze' on every field -> plan.similar['haze'] contains 'old-haze' (uses nearDuplicates from lib/foundry/extract/vocabulary.ts).
// 5. commitExtractRun succeeds; run.json's status is reset to 'done' (crash after catalogue write) and commitExtractRun is called again -> styles.json holds exactly one entry with origin.source === <run id>, not 'haze' plus 'haze-2' (replace by origin on retry).
// 6. previewCommit (what v1's GET app/api/foundry/runs/[id]/commit answered) carries promotions, delete, counts and token; commitRun without a token still commits.
// 7. previewExtractCommit (v1's GET app/api/foundry/extract/[id]/commit) carries written, similar and token.
//    Phase 6 wave C (L70): both routes retired with the v1 Foundry; the forge and extract commits
//    are the Board packet's acts over the same store doors, so 6 and 7 drive those doors. The
//    routes' access-header half retired with them.
// 8. GUARD (declared, green before): commitRun(id, 'leave') still leaves undecided candidates' files on disk and out of ledger.json.
// 9. (Critic revision): Bind confirm to preview via token: token = (await previewCommit(run)).token (or previewExtractCommit); if verdicts/manifest change before commit, e.g. putVerdicts flips one keep to reject, calling commitRun(run, 'reject', token) rejects with FoundryError 409 and candidate files, ledger.json and styles.json remain byte-identical.
// 10. (sweep 2026-10-24) the token sees WHO kept: a model's keep becoming a human's changes the
//     plan's promotions, so it must change the token too, or a preview that showed no promotion
//     commits one; a record with no `by` and one with by:"human" (both a human's) keep one token.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR } from "@/lib/apiAuth";
import { EXTRACT_ROOT, commitExtractRun, previewExtractCommit } from "@/lib/foundry/extract/store";
import { OBSERVABLE_FIELDS } from "@/lib/foundry/extract/types";
import type { ExtractManifest, ExtractedStyle, Observables } from "@/lib/foundry/extract/types";
import { OUT_ROOT, resolveInRun, FoundryError, commitRun, previewCommit, putVerdicts } from "@/lib/foundry/store";
import type { Candidate, LedgerRow, RunManifest, StyleDef, Verdicts } from "@/lib/foundry/types";
import { deriveForgeCommit, planForgeCommit } from "@/lib/foundry/commitPlan";

import { keepEnv, probeFoundryDir, stripComments } from "./_helpers";

const ENV_KEYS = [ACCESS_SECRET_VAR] as const;
keepEnv(ENV_KEYS);
const foundryDir = probeFoundryDir();

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const observables = (val = "x"): Observables =>
  Object.fromEntries(OBSERVABLE_FIELDS.map((f) => [f, val])) as Observables;

function styleDef(id: string, obs: Partial<Observables> = {}): StyleDef {
  return {
    id,
    name: id,
    family: "f",
    status: "candidate",
    origin: { kind: "authored" },
    observables: obs,
    recipe: "r",
    negative: "n",
    evidence: [],
  };
}

function forgeRun(
  id: string,
  specs: { scene: string; style: string; verdict?: "keep" | "reject"; seed?: number }[],
): { id: string; candidates: Candidate[] } {
  const dir = path.join(OUT_ROOT, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const candidates: Candidate[] = [];
  const verdicts: Verdicts = {};
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    const cid = `${s.scene}/${s.style}--ref--s${s.seed ?? i}`;
    const relFile = `${cid}.png`;
    const relSidecar = `${cid}.json`;
    const absFile = path.join(dir, relFile);
    const absSidecar = path.join(dir, relSidecar);
    mkdirSync(path.dirname(absFile), { recursive: true });
    writeFileSync(absFile, `img-data-${i}`);
    writeFileSync(absSidecar, JSON.stringify({ seed: i }));
    candidates.push({
      id: cid,
      scene: s.scene,
      style: s.style,
      mechanism: "ref",
      seed: s.seed ?? i,
      file: relFile,
      sidecar: relSidecar,
      status: "graded",
      grade: null,
      error: null,
    });
    if (s.verdict) {
      verdicts[cid] = { verdict: s.verdict, at: new Date().toISOString() };
    }
  }
  const styles: Record<string, StyleDef> = {};
  for (const s of specs) {
    if (!styles[s.style]) styles[s.style] = styleDef(s.style);
  }
  const run: RunManifest = {
    id,
    created: new Date().toISOString(),
    plan: {
      id: "p",
      scenes: specs.map((c) => ({ id: c.scene, frame: "f" })),
      styles: Object.keys(styles),
      mechanisms: [{ id: "ref", reference: true }],
      seeds: candidates.map((c) => c.seed),
    },
    styles,
    status: "done",
    progress: { stage: "done", done: candidates.length, total: candidates.length },
    scenes: specs.map((c) => ({
      id: c.scene,
      frame: "f",
      note: "",
      source: "s.png",
      annotation: null,
      annotation_from: null,
    })),
    candidates,
    log: [],
  };
  writeFileSync(path.join(dir, "run.json"), JSON.stringify(run), "utf8");
  writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify(verdicts), "utf8");
  return { id, candidates };
}

const extractStyle = (id: string, obs: Observables = observables()): ExtractedStyle => ({
  id,
  name: id,
  family: "f",
  members: ["s01"],
  observables: obs,
  recipe: "r",
  negative: "n",
  recipe_history: ["r"],
  grouped_by: "singleton",
  replicas: [],
  transfers: [],
});

function extractRun(id: string, styleId: string, obs?: Observables): string {
  const dir = path.join(EXTRACT_ROOT, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const m: ExtractManifest = {
    id,
    slug: id,
    created: new Date().toISOString(),
    status: "done",
    progress: { stage: "done", done: 1, total: 1 },
    options: { rounds: 1, replicas: 1, transfers: 0, target: 0.9, seed: 1, grouping: "none" },
    sources: [
      {
        id: "s01",
        name: "a.png",
        file: "sources/s01.png",
        mime: "image/png",
        width: 8,
        height: 8,
        aspect: "1:1",
        readback: null,
        error: null,
      },
    ],
    styles: [extractStyle(styleId, obs)],
    engines: {},
    log: [],
  };
  writeFileSync(path.join(dir, "run.json"), JSON.stringify(m), "utf8");
  return id;
}

function cleanupRun(id: string) {
  rmSync(path.join(OUT_ROOT, id), { recursive: true, force: true });
}

function cleanupExtract(id: string) {
  rmSync(path.join(EXTRACT_ROOT, id), { recursive: true, force: true });
}

/* ── Acceptance Cases ─────────────────────────────────────────────────────── */

test("Case 1: previewCommit then commitRun on the same run -> commitRun's {kept, deleted, undecided} equal plan.counts, and the set of files missing afterwards equals plan.delete exactly", async () => {
  expect(typeof previewCommit, "previewCommit must be exported").toBe("function");

  writeFileSync(path.join(foundryDir(), "styles.json"), JSON.stringify({ styles: [styleDef("haze")] }), "utf8");
  writeFileSync(path.join(foundryDir(), "ledger.json"), JSON.stringify({ rows: [] }), "utf8");

  const runId = `probe-case1-${Date.now().toString(36)}`;
  const { candidates } = forgeRun(runId, [
    { scene: "sc0", style: "haze", verdict: "keep" },
    { scene: "sc1", style: "haze", verdict: "reject" },
    { scene: "sc2", style: "haze" }, // undecided
  ]);

  try {
    const plan = await previewCommit(runId, "reject");
    expect(plan).toBeDefined();
    expect(plan.counts).toBeDefined();
    expect(plan.delete).toBeDefined();

    // Verify files exist before commit
    const allFiles: string[] = [];
    for (const c of candidates) {
      allFiles.push(resolveInRun(runId, c.file));
      allFiles.push(resolveInRun(runId, c.sidecar));
    }
    for (const f of allFiles) {
      expect(existsSync(f), `File ${f} should exist before commit`).toBe(true);
    }

    const res = await commitRun(runId, "reject");

    // commitRun's {kept, deleted, undecided} equal plan.counts
    expect({ kept: res.kept, deleted: res.deleted, undecided: res.undecided }).toEqual(plan.counts);

    // and the set of files missing afterwards equals plan.delete exactly
    const missingAfterwards = allFiles
      .filter((f) => !existsSync(f))
      .map((f) => path.relative(path.join(OUT_ROOT, runId), f).replace(/\\/g, "/"))
      .sort();

    const expectedDelete = [...plan.delete].sort();
    expect(missingAfterwards).toEqual(expectedDelete);
  } finally {
    cleanupRun(runId);
  }
});

test("Case 2: with FOUNDRY_DIR=<tmp> and <tmp>/styles.json pre-created as a DIRECTORY, commitRun(<run with 1 rejected candidate>) rejects -> the rejected candidate's .png still exists", async () => {
  const runId = `probe-case2-${Date.now().toString(36)}`;
  const { candidates } = forgeRun(runId, [
    { scene: "sc0", style: "haze", verdict: "reject" },
  ]);

  // Pre-create styles.json as a DIRECTORY
  mkdirSync(path.join(foundryDir(), "styles.json"), { recursive: true });

  try {
    const pngPath = resolveInRun(runId, candidates[0].file);
    expect(existsSync(pngPath)).toBe(true);

    await expect(commitRun(runId, "reject")).rejects.toThrow();

    // The rejected candidate's .png must still exist!
    expect(existsSync(pngPath), "Rejected candidate .png must still exist after failed commit").toBe(true);
  } finally {
    cleanupRun(runId);
  }
});

test("Case 3: previewExtractCommit(<done extract run keeping style 'haze'>) against a FOUNDRY_DIR catalogue already holding id 'haze' -> plan.written deep-equals [{from:'haze', to:'haze-2'}] and styles.json is byte-identical after preview call", async () => {
  expect(typeof previewExtractCommit, "previewExtractCommit must be exported").toBe("function");

  const initialCatalogue = JSON.stringify({ styles: [styleDef("haze")] });
  const stylesPath = path.join(foundryDir(), "styles.json");
  writeFileSync(stylesPath, initialCatalogue, "utf8");

  const exRunId = `probe-case3-${Date.now().toString(36)}`;
  extractRun(exRunId, "haze");
  writeFileSync(
    path.join(EXTRACT_ROOT, exRunId, "verdicts.json"),
    JSON.stringify({ haze: { verdict: "keep", at: new Date().toISOString() } }),
    "utf8",
  );

  try {
    const plan = await previewExtractCommit(exRunId);
    expect(plan.written).toEqual([{ from: "haze", to: "haze-2" }]);

    const afterBytes = readFileSync(stylesPath, "utf8");
    expect(afterBytes).toBe(initialCatalogue);
  } finally {
    cleanupExtract(exRunId);
  }
});

test("Case 4: previewExtractCommit where kept style's observables equal an existing catalogue style 'old-haze' on every field -> plan.similar['haze'] contains 'old-haze'", async () => {
  expect(typeof previewExtractCommit, "previewExtractCommit must be exported").toBe("function");

  const obs = observables("match-all");
  writeFileSync(
    path.join(foundryDir(), "styles.json"),
    JSON.stringify({ styles: [styleDef("old-haze", obs)] }),
    "utf8",
  );

  const exRunId = `probe-case4-${Date.now().toString(36)}`;
  extractRun(exRunId, "haze", obs);
  writeFileSync(
    path.join(EXTRACT_ROOT, exRunId, "verdicts.json"),
    JSON.stringify({ haze: { verdict: "keep", at: new Date().toISOString() } }),
    "utf8",
  );

  try {
    const plan = await previewExtractCommit(exRunId);
    expect(plan.similar).toBeDefined();
    expect(plan.similar["haze"]).toBeDefined();
    expect(plan.similar["haze"]).toContain("old-haze");
  } finally {
    cleanupExtract(exRunId);
  }
});

test("Case 5: commitExtractRun succeeds; run.json's status reset to 'done' and commitExtractRun called again -> styles.json holds exactly one entry with origin.source === <run id>, not 'haze' plus 'haze-2'", async () => {
  writeFileSync(path.join(foundryDir(), "styles.json"), JSON.stringify({ styles: [] }), "utf8");

  const exRunId = `probe-case5-${Date.now().toString(36)}`;
  extractRun(exRunId, "haze");
  writeFileSync(
    path.join(EXTRACT_ROOT, exRunId, "verdicts.json"),
    JSON.stringify({ haze: { verdict: "keep", at: new Date().toISOString() } }),
    "utf8",
  );

  try {
    await commitExtractRun(exRunId);

    // Reset status to 'done' (crash after catalogue write)
    const runFile = path.join(EXTRACT_ROOT, exRunId, "run.json");
    const m = JSON.parse(readFileSync(runFile, "utf8")) as ExtractManifest;
    m.status = "done";
    delete m.committed;
    writeFileSync(runFile, JSON.stringify(m), "utf8");

    // Commit again on retry
    await commitExtractRun(exRunId);

    const catalogue = JSON.parse(readFileSync(path.join(foundryDir(), "styles.json"), "utf8")) as { styles: StyleDef[] };
    const matching = catalogue.styles.filter((s) => s.origin?.source === exRunId);
    expect(matching.length).toBe(1);
    expect(matching[0].id).toBe("haze");
  } finally {
    cleanupExtract(exRunId);
  }
});

test("Case 6: previewCommit carries promotions, delete, counts and token; commitRun without a token still commits", async () => {
  writeFileSync(path.join(foundryDir(), "styles.json"), JSON.stringify({ styles: [styleDef("haze")] }), "utf8");
  writeFileSync(path.join(foundryDir(), "ledger.json"), JSON.stringify({ rows: [] }), "utf8");

  const runId = `probe-case6-${Date.now().toString(36)}`;
  forgeRun(runId, [
    { scene: "sc0", style: "haze", verdict: "keep" },
    { scene: "sc1", style: "haze", verdict: "reject" },
  ]);

  try {
    const plan = await previewCommit(runId);
    expect(Array.isArray(plan.promotions)).toBe(true);
    expect(Array.isArray(plan.delete)).toBe(true);
    expect(typeof plan.counts).toBe("object");
    expect(typeof plan.token).toBe("string");

    const done = await commitRun(runId, "reject");
    expect(done).toHaveProperty("kept");
    expect(done).toHaveProperty("deleted");
  } finally {
    cleanupRun(runId);
  }
});

test("Case 7: previewExtractCommit carries written, similar and token", async () => {
  writeFileSync(path.join(foundryDir(), "styles.json"), JSON.stringify({ styles: [] }), "utf8");

  const exRunId = `probe-case7-${Date.now().toString(36)}`;
  extractRun(exRunId, "haze");
  writeFileSync(
    path.join(EXTRACT_ROOT, exRunId, "verdicts.json"),
    JSON.stringify({ haze: { verdict: "keep", at: new Date().toISOString() } }),
    "utf8",
  );

  try {
    const plan = await previewExtractCommit(exRunId);
    expect(Array.isArray(plan.written)).toBe(true);
    expect(typeof plan.similar).toBe("object");
    expect(typeof plan.token).toBe("string");
  } finally {
    cleanupExtract(exRunId);
  }
});

test("Case 8: GUARD (declared, green before): commitRun(id, 'leave') still leaves undecided candidates' files on disk and out of ledger.json", async () => {
  writeFileSync(path.join(foundryDir(), "styles.json"), JSON.stringify({ styles: [styleDef("haze")] }), "utf8");
  writeFileSync(path.join(foundryDir(), "ledger.json"), JSON.stringify({ rows: [] }), "utf8");

  const runId = `probe-case8-${Date.now().toString(36)}`;
  const { candidates } = forgeRun(runId, [
    { scene: "sc0", style: "haze", verdict: "keep" },
    { scene: "sc1", style: "haze" }, // undecided
  ]);

  try {
    const res = await commitRun(runId, "leave");
    expect(res.kept).toBe(1);
    expect(res.deleted).toBe(0);
    expect(res.undecided).toBe(1);

    // Both kept and undecided files must still exist on disk!
    const keptFile = resolveInRun(runId, candidates[0].file);
    const undecidedFile = resolveInRun(runId, candidates[1].file);
    expect(existsSync(keptFile), "Kept candidate file must remain on disk").toBe(true);
    expect(existsSync(undecidedFile), "Undecided candidate file must remain on disk when undecidedAs is 'leave'").toBe(true);

    // And out of ledger.json
    const ledger = JSON.parse(readFileSync(path.join(foundryDir(), "ledger.json"), "utf8")) as { rows: { run: string; scene: string }[] };
    expect(ledger.rows.filter((r) => r.run === runId).length).toBe(1);
    expect(ledger.rows.some((r) => r.run === runId && r.scene === "sc0")).toBe(true);
    expect(ledger.rows.some((r) => r.run === runId && r.scene === "sc1")).toBe(false);
  } finally {
    cleanupRun(runId);
  }
});

test("Case 9: Bind confirm to preview via token: token = (await previewCommit(run)).token; if verdicts change before commit, calling commitRun(run, 'reject', token) rejects with FoundryError 409 and candidate files, ledger.json and styles.json remain byte-identical", async () => {
  expect(typeof previewCommit, "previewCommit must be exported").toBe("function");

  const initialCatalogue = JSON.stringify({ styles: [styleDef("haze")] });
  const initialLedger = JSON.stringify({ rows: [] });
  writeFileSync(path.join(foundryDir(), "styles.json"), initialCatalogue, "utf8");
  writeFileSync(path.join(foundryDir(), "ledger.json"), initialLedger, "utf8");

  const runId = `probe-case9-${Date.now().toString(36)}`;
  const { candidates } = forgeRun(runId, [
    { scene: "sc0", style: "haze", verdict: "keep" },
    { scene: "sc1", style: "haze", verdict: "keep" },
  ]);

  try {
    const plan = await previewCommit(runId, "reject");
    expect(plan.token).toBeDefined();

    // Now verdicts change before commit: flip one keep to reject
    await putVerdicts(runId, {
      [candidates[0].id]: { verdict: "keep", at: new Date().toISOString() },
      [candidates[1].id]: { verdict: "reject", at: new Date().toISOString() },
    });

    let thrownError: unknown = null;
    try {
      // Calling commitRun with outdated token
      await commitRun(runId, "reject", plan.token);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeDefined();
    expect(thrownError).toBeInstanceOf(FoundryError);
    expect((thrownError as FoundryError).status).toBe(409);

    // Candidate files, ledger.json and styles.json remain byte-identical
    for (const c of candidates) {
      expect(existsSync(resolveInRun(runId, c.file)), `File for ${c.id} must still exist`).toBe(true);
    }
    expect(readFileSync(path.join(foundryDir(), "styles.json"), "utf8")).toBe(initialCatalogue);
    expect(readFileSync(path.join(foundryDir(), "ledger.json"), "utf8")).toBe(initialLedger);
  } finally {
    cleanupRun(runId);
  }
});

test("Case 10: the token changes when a model's keep becomes a human's, because the promotions do", () => {
  const cand = (scene: string): Candidate => ({ id: `${scene}/haze--text--s1`, scene, style: "haze", mechanism: "text", seed: 1, file: `${scene}.png`, sidecar: `${scene}.json`, status: "graded", grade: null, error: null });
  const run = { id: "probe-token-by", status: "done", candidates: [cand("sc1")] } as unknown as RunManifest;
  // One human keep of `haze` on another run's scene already: a second human-kept scene proves it.
  const haze: StyleDef = { ...styleDef("haze"), evidence: [{ run: "older", scene: "sc0", mechanism: "text", verdict: "keep", at: "t0" }] };
  const plan = (by?: "human" | "model") => planForgeCommit(run, { "sc1/haze--text--s1": { verdict: "keep", at: "t1", ...(by ? { by } : {}) } }, { styles: [haze], ledger: [] }, "leave");

  const model = plan("model");
  const human = plan("human");
  const legacy = plan();
  console.log(`[token] model promotions=${model.promotions.join(",") || "none"} human promotions=${human.promotions.join(",") || "none"} same token=${model.token === human.token}`);
  expect(model.promotions).toEqual([]);
  expect(human.promotions).toEqual(["haze"]);
  expect(human.token, "a by-only change that moves the promotions must move the token").not.toBe(model.token);
  expect(legacy.token, "no `by` reads as a human's: one token, as before").toBe(human.token);
});

test("Case 11: commitRun writes the rows the plan projected (minus the stamp) and holds none of the plan's rules itself", async () => {
  writeFileSync(path.join(foundryDir(), "styles.json"), JSON.stringify({ styles: [styleDef("haze")] }), "utf8");
  writeFileSync(path.join(foundryDir(), "ledger.json"), JSON.stringify({ rows: [] }), "utf8");
  const runId = `probe-case11-${Date.now().toString(36)}`;
  forgeRun(runId, [
    { scene: "sc0", style: "haze", verdict: "keep" },
    { scene: "sc1", style: "haze", verdict: "reject" },
    { scene: "sc2", style: "haze" }, // undecided -> auto-rejected
  ]);
  try {
    const plan = await previewCommit(runId, "reject");
    expect(plan.ledgerRows.length).toBe(3);
    // The projection takes the commit's stamp: the same rows, one `at`.
    const run = JSON.parse(readFileSync(path.join(OUT_ROOT, runId, "run.json"), "utf8")) as RunManifest;
    const stamped = deriveForgeCommit(run, { "sc0/haze--ref--s0": { verdict: "keep", at: "v" } }, { styles: [styleDef("haze")], ledger: [] }, "reject", "T");
    expect(stamped.plan.ledgerRows.map((r) => r.at)).toEqual(["T", "T", "T"]);
    expect(stamped.autoRejected.length).toBe(2);
    const res = await commitRun(runId, "reject");
    const written = (JSON.parse(readFileSync(path.join(foundryDir(), "ledger.json"), "utf8")) as { rows: LedgerRow[] }).rows.filter((r) => r.run === runId);
    const bare = (rows: LedgerRow[]) => rows.map(({ at: _at, ...r }) => r);
    expect(bare(written)).toEqual(bare(plan.ledgerRows));
    const committedAt = (JSON.parse(readFileSync(path.join(OUT_ROOT, runId, "run.json"), "utf8")) as RunManifest).committed?.at;
    expect(res.deleted).toBe(plan.counts.deleted);
    expect(written.map((r) => r.at), "every committed row carries the commit's time").toEqual(written.map(() => committedAt));
  } finally {
    cleanupRun(runId);
  }

  // One rule site: the plan's three rules are not spelled again in commitRun (comments stripped).
  const src = stripComments(readFileSync(path.join(process.cwd(), "lib", "foundry", "store.ts"), "utf8"));
  const body = src.slice(src.indexOf("export async function commitRun"));
  expect(body, "the withFile filter").not.toMatch(/status !== "pending"/);
  expect(body, "the auto-reject").not.toMatch(/verdict: "reject", at/);
  expect(body, "the ledger row builder").not.toMatch(/ledger\.rows\.push\(\s*{/);
});
