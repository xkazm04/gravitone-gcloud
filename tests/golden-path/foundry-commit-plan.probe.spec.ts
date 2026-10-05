// LANE — SERVER COMMIT PLAN AND PREVIEW-APPLY LOCK (dynamic probe).
//
// Acceptance cases for Card 5:
// 1. previewCommit then commitRun on the same run -> commitRun's {kept, deleted, undecided} equal plan.counts, and the set of files missing afterwards equals plan.delete exactly.
// 2. with FOUNDRY_DIR=<tmp> and <tmp>/styles.json pre-created as a DIRECTORY, commitRun(<run with 1 rejected candidate>) rejects -> the rejected candidate's .png still exists (indices written before file deletions, making the banner "The commit failed and nothing was deleted" true).
// 3. previewExtractCommit(<done extract run keeping style 'haze'>) against a FOUNDRY_DIR catalogue already holding id 'haze' -> plan.written deep-equals [{from:'haze', to:'haze-2'}] and styles.json is byte-identical after the preview call.
// 4. previewExtractCommit where the kept style's observables equal an existing catalogue style 'old-haze' on every field -> plan.similar['haze'] contains 'old-haze' (uses nearDuplicates from lib/foundry/extract/vocabulary.ts).
// 5. commitExtractRun succeeds; run.json's status is reset to 'done' (crash after catalogue write) and commitExtractRun is called again -> styles.json holds exactly one entry with origin.source === <run id>, not 'haze' plus 'haze-2' (replace by origin on retry).
// 6. GET handler of app/api/foundry/runs/[id]/commit/route.ts with a valid access header -> 200 and a JSON body carrying promotions, delete, counts, and token; POST behaviour unchanged.
// 7. GET handler of app/api/foundry/extract/[id]/commit/route.ts with a valid access header -> 200 and a JSON body carrying written, similar, and token.
// 8. GUARD (declared, green before): commitRun(id, 'leave') still leaves undecided candidates' files on disk and out of ledger.json.
// 9. (Critic revision): Bind confirm to preview via token: token = (await previewCommit(run)).token (or previewExtractCommit); if verdicts/manifest change before commit, e.g. putVerdicts flips one keep to reject, calling commitRun(run, 'reject', token) rejects with FoundryError 409 and candidate files, ledger.json and styles.json remain byte-identical.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR } from "@/lib/apiAuth";
import { EXTRACT_ROOT, commitExtractRun, previewExtractCommit } from "@/lib/foundry/extract/store";
import { OBSERVABLE_FIELDS } from "@/lib/foundry/extract/types";
import type { ExtractManifest, ExtractedStyle, Observables } from "@/lib/foundry/extract/types";
import { OUT_ROOT, resolveInRun, FoundryError, commitRun, previewCommit, putVerdicts } from "@/lib/foundry/store";
import type { Candidate, RunManifest, StyleDef, Verdicts } from "@/lib/foundry/types";
import { GET as runCommitGET, POST as runCommitPOST } from "@/app/api/foundry/runs/[id]/commit/route";
import { GET as extractCommitGET } from "@/app/api/foundry/extract/[id]/commit/route";

import { keepEnv, probeFoundryDir } from "./_helpers";

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

test("Case 6: GET handler of app/api/foundry/runs/[id]/commit/route.ts with a valid access header -> 200 and a JSON body carrying promotions, delete, counts, and token; POST behaviour unchanged", async () => {
  process.env[ACCESS_SECRET_VAR] = "test-secret";

  writeFileSync(path.join(foundryDir(), "styles.json"), JSON.stringify({ styles: [styleDef("haze")] }), "utf8");
  writeFileSync(path.join(foundryDir(), "ledger.json"), JSON.stringify({ rows: [] }), "utf8");

  const runId = `probe-case6-${Date.now().toString(36)}`;
  forgeRun(runId, [
    { scene: "sc0", style: "haze", verdict: "keep" },
    { scene: "sc1", style: "haze", verdict: "reject" },
  ]);

  try {
    expect(typeof runCommitGET, "GET handler must be exported in runs/[id]/commit/route.ts").toBe("function");

    const req = new Request(`http://studio.local/api/foundry/runs/${runId}/commit`, {
      method: "GET",
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await runCommitGET(req, { params: Promise.resolve({ id: runId }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("promotions");
    expect(body).toHaveProperty("delete");
    expect(body).toHaveProperty("counts");
    expect(body).toHaveProperty("token");
    expect(Array.isArray(body.promotions)).toBe(true);
    expect(Array.isArray(body.delete)).toBe(true);
    expect(typeof body.counts).toBe("object");
    expect(typeof body.token).toBe("string");

    // POST behaviour unchanged (no token provided)
    const postReq = new Request(`http://studio.local/api/foundry/runs/${runId}/commit`, {
      method: "POST",
      headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
      body: JSON.stringify({ undecidedAs: "reject" }),
    });
    const postRes = await runCommitPOST(postReq, { params: Promise.resolve({ id: runId }) });
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    expect(postBody).toHaveProperty("kept");
    expect(postBody).toHaveProperty("deleted");
  } finally {
    cleanupRun(runId);
  }
});

test("Case 7: GET handler of app/api/foundry/extract/[id]/commit/route.ts with a valid access header -> 200 and a JSON body carrying written, similar, and token", async () => {
  process.env[ACCESS_SECRET_VAR] = "test-secret";

  writeFileSync(path.join(foundryDir(), "styles.json"), JSON.stringify({ styles: [] }), "utf8");

  const exRunId = `probe-case7-${Date.now().toString(36)}`;
  extractRun(exRunId, "haze");
  writeFileSync(
    path.join(EXTRACT_ROOT, exRunId, "verdicts.json"),
    JSON.stringify({ haze: { verdict: "keep", at: new Date().toISOString() } }),
    "utf8",
  );

  try {
    expect(typeof extractCommitGET, "GET handler must be exported in extract/[id]/commit/route.ts").toBe("function");

    const req = new Request(`http://studio.local/api/foundry/extract/${exRunId}/commit`, {
      method: "GET",
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await extractCommitGET(req, { params: Promise.resolve({ id: exRunId }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("written");
    expect(body).toHaveProperty("similar");
    expect(body).toHaveProperty("token");
    expect(Array.isArray(body.written)).toBe(true);
    expect(typeof body.similar).toBe("object");
    expect(typeof body.token).toBe("string");
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
