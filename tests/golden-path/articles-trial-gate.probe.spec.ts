// LANE — A TRIAL RUN'S REGISTRY OUTCOME AND ITS GATE, offline (lib/articles/trial/registryRecord.ts,
// lib/articles/ingestDraft.ts, lib/articles/humanActs.ts, lib/articles/landing.ts,
// lib/articles/registryWrite.ts).
//
// A trial run's registry outcome is its measurement, recorded the registry's own way: an
// application of the technique under test (`applied: experiment`, `ab_verdict`, `proof:
// ab-paired`), patch `t1`, `required`, landed with the post that cites it as source 1. What is
// pinned:
//
//   · the record's frontmatter and body: the verdict mapping (upheld -> better, challenged and
//     null -> not-better), pilots left out, no machine path in a command, an existing record
//     appended to and never rewritten, once per trial
//   · ingest: a model proposal outside the subject, of another kind, or aimed at the golden
//     path is refused with its reason; a technique amendment inside the subject is kept beside
//     t1; t1's diff is code's, against the registry's file (new, or appended); classic runs keep
//     today's rules and get no t1
//   · approve WITHOUT t1 still lands t1: the application on the origin branch, SOURCES.md's
//     `## Experiments`, the PR body's Trial block with the converge line; a challenged landing
//     files exactly one technique lead, an upheld one none
//   · reject of a trial run files one application lead; of a classic run, none
//
// The registry is the throwaway fixture (./_articles.ts), `gh` a stub, every lead goes to a
// temp file (ARTICLES_LEADS_FILE), and the trial runs are seeded by
// tests/fixtures/articles/trialSeeds.ts on a run the stub engine drove to the gate. The REAL
// registry's knowledge gate over this record is the package's acceptance run by hand on a
// scratch clone (the spark's build record), never from a probe.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { approveRun, createRun, defaultDeps, driveRun, getRunDetail, rejectRun } from "@/lib/articles/engine";
import { ingestDraft, TRIAL_PATCH_ID } from "@/lib/articles/ingestDraft";
import { MAX_PATCHES } from "@/lib/articles/prompt";
import { readRun, runDir } from "@/lib/articles/store";
import { abVerdictOf, appendTrialSection, applicationMarkdown, experimentsMarkdown, trialLead } from "@/lib/articles/trial/registryRecord";
import { readTrialDetail } from "@/lib/articles/trial/store";
import type { ArticleRun, RegistryPatch, TrialExecRecord } from "@/lib/articles/types";

import { seedTrialStates, writeSeedExperiment } from "../fixtures/articles/trialSeeds";
import { keepEnv } from "./_helpers";
import { ARTICLE_ENV, articleSandbox, type ArticleSandbox } from "./_articles";

keepEnv([...ARTICLE_ENV, "ARTICLES_LEADS_FILE", "ARTICLES_TRIALS_DIR", "ARTICLES_REGISTRY_REMOTE"]);
test.describe.configure({ timeout: 180_000 });

let box: ArticleSandbox;
let leads: string;
test.beforeEach(() => {
  box = articleSandbox();
  leads = path.join(box.dir, "leads.jsonl");
  process.env.ARTICLES_LEADS_FILE = leads;
});
test.afterEach(() => box.cleanup());

const deps = () => defaultDeps({ render: false });
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
const leadRows = () => (existsSync(leads) ? readFileSync(leads, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : []);

async function toGate(): Promise<ArticleRun> {
  const run = await createRun({ topic: { kind: "free", text: "the token tax" } }, deps());
  return driveRun(run.id, deps());
}

const SUBJECT = "knowledge/software-engineering/llm-agent/token-budgeting";
const TECHNIQUE_FILE = `${SUBJECT}/techniques/count-before-send.md`;

/* ── the record, pure ─────────────────────────────────────────────────── */

// Home-directory paths the record must scrub, built at runtime so that this file itself holds no
// literal machine home path (no-machine-paths.probe.spec.ts reads every tracked file).
const HOME_WIN = (rest: string) => ["C:", "Users", "someone", rest].join("\\");
const HOME_NIX = (rest: string) => ["", "home", "someone", rest].join("/");

test("record: an application in the registry's experiment convention, with no machine path and no pilot", async () => {
  const dir = path.join(box.dir, "exp-run");
  mkdirSync(dir, { recursive: true });
  const seeded = writeSeedExperiment(dir, "trial-challenged", "r");
  const t = (await readTrialDetail(path.join(dir, "experiment")))!;
  const execs: TrialExecRecord[] = [
    ...t.execs,
    { at: "2026-10-16T15:20:00.000Z", cmd: [HOME_WIN("nodejs\\node.exe"), "replay.mjs", `--out=${HOME_WIN("t\\x.json")}`, `--log=${HOME_NIX("t/log.txt")}`, "--url=https://example.org/a/b"], pilot: false, exitCode: 0, durationMs: 900, timedOut: false },
  ];
  const input = { prereg: t.prereg, verdict: t.verdict, results: t.results, execs, trialId: seeded.ref.id };
  const md = applicationMarkdown(input);
  const fm = md.slice(4, md.indexOf("\n---\n"));
  expect(fm.split("\n")).toEqual([
    "layer: application",
    "type: application",
    "subject: cost-metering",
    "technique: preflight-estimation",
    "stack: node",
    "verified_on: 2026-10-16",
    "verified_against: node@22.11.0",
    "applied: experiment",
    "ab_verdict: not-better",
    "proof: ab-paired",
  ]);
  expect(md).toMatch(/^# Preflight estimate against Reserve and settle: budget overrun per 1,000 calls$/m);
  expect(md).toContain("> Estimate a call's cost before sending it");
  expect(md).toContain("[Reserve, then settle: metering LLM spend](https://example.org/billing/reserve-and-settle), 2026-06-21");
  expect(md).toContain("## The measurement");
  expect(md).toMatch(/\| `golden`: Preflight estimate \| 10 \| 0\.438 \| [\d.]+ \| 9\.4 \| no \|/);
  expect(md).toMatch(/\| `alternative`: Reserve and settle \| 10 \| 0\.21 \| [\d.]+ \| 1\.2 \| yes \|/);
  expect(md).toContain("Reported, not decisive");
  // pilots are not the measurement; machine prefixes never reach the registry
  expect(md).not.toContain("--days 1`");
  expect(md).toContain("1 pilot command ran before the seal");
  expect(md).toContain("`node.exe replay.mjs --out=x.json --log=log.txt --url=https://example.org/a/b`");
  expect(md).not.toMatch(/[A-Za-z]:[\\/]Users|\/home\//);
  // the verdict mapping
  expect([abVerdictOf("upheld"), abVerdictOf("challenged"), abVerdictOf("null")]).toEqual(["better", "not-better", "not-better"]);
  // process has no runtime version; a version the registry cannot parse is left out, not written
  expect(applicationMarkdown({ ...input, prereg: { ...t.prereg, stack: "process" } })).not.toContain("verified_against");
  expect(applicationMarkdown({ ...input, prereg: { ...t.prereg, environment: "node@22.11.0-rc1" } })).not.toContain("verified_against");

  // appended over an existing record: the old text is a prefix, byte for byte, and once is enough
  const existing = readFileSync(path.join(box.registry, ...`${SUBJECT}/applications/node--count-before-send.md`.split("/")), "utf8");
  const appended = appendTrialSection(existing, input);
  expect(appended.startsWith(existing)).toBe(true);
  expect(appended.slice(existing.length)).toMatch(/^\n## Trial cost-metering-2026-10-16 \(2026-10-16\): challenged\n\n/);
  expect(appended.slice(existing.length)).toContain("### The measurement");
  expect(appendTrialSection(appended, input)).toBe(appended);

  const sources = experimentsMarkdown({ ...input, applicationPath: seeded.ref.applicationPath });
  expect(sources).toMatch(/^## Experiments\n/);
  expect(sources).toContain(seeded.ref.applicationPath);
  expect(sources).toContain("**Verdict: challenged**");

  const lead = trialLead({ kind: "technique", prereg: t.prereg, verdict: t.verdict, trialId: seeded.ref.id, applicationPath: seeded.ref.applicationPath, now: new Date("2026-10-18T08:00:00Z") });
  expect(lead).toMatchObject({ bundle: "software-engineering", nearest: "cost-metering", kind: "technique", confidence: "medium", from: "article-trial@2026-10-18" });
  expect(lead.claim).toMatch(/^When preflight-estimation is applied on node@22\.11\.0, prefer Reserve and settle to the rule as written, because /);
});

/* ── ingest ───────────────────────────────────────────────────────────── */

/** A draft workspace whose patches.json proposes `proposals` (each with its proposed file). */
function draftWorkspace(name: string, proposals: { id: string; target: string; kind: string; text: string }[]): string {
  const ws = path.join(box.dir, name);
  const w = (rel: string, text: string) => {
    const f = path.join(ws, ...rel.split("/"));
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, text);
  };
  w("out/post/index.html", "<h1>t</h1>");
  w("out/post/post.md", "# t\n");
  w("out/post/meta.json", JSON.stringify({ title: "t", subtitle: "s", tags: [] }));
  w("out/patches.json", JSON.stringify(proposals.map(({ id, target, kind }) => ({ id, target, kind, rationale: `why ${id}`, sources: [1] }))));
  for (const p of proposals) {
    w(`out/proposals/${p.id}/${p.target}`, p.text);
    const original = path.join(box.registry, ...p.target.split("/"));
    if (existsSync(original)) w(`inputs/registry/${p.target}`, readFileSync(original, "utf8"));
  }
  return ws;
}

/** A run directory holding run.json and sources.json, and, for a trial run, its experiment/. */
function runDirFor(id: string, trial: boolean, stack?: string): { dir: string; run: ArticleRun } {
  const dir = path.join(box.store, id);
  mkdirSync(dir, { recursive: true });
  const run = { id, status: "drafting", topic: { kind: "subject", bundle: "software-engineering", subject: "token-budgeting", text: "Token budgeting" }, steps: [] } as unknown as ArticleRun;
  if (trial) run.trial = writeSeedExperiment(dir, "trial-upheld", id, stack ? { stack } : {}).ref;
  writeFileSync(path.join(dir, "run.json"), JSON.stringify(run));
  writeFileSync(path.join(dir, "sources.json"), JSON.stringify([1, 2].map((n) => ({ n, url: `https://example.org/${n}`, title: `s${n}`, publisher: "p", date: "2026", primary: true, counter: false, took: "t" }))));
  return { dir, run };
}

test("ingest: a trial run keeps a technique amendment inside its subject and refuses the rest; t1 is code's, required", async () => {
  const amended = `${readFileSync(path.join(box.registry, ...TECHNIQUE_FILE.split("/")), "utf8")}- When requests mix scripts, count; never estimate.\n`;
  const proposals = [
    { id: "p1", target: TECHNIQUE_FILE, kind: "technique", text: amended },
    { id: "p2", target: "knowledge/technical-writing/craft/article-structure/article-structure.md", kind: "technique", text: "# Article structure\n\nchanged\n" },
    { id: "p3", target: `${SUBJECT}/token-budgeting.md`, kind: "subject", text: "# Token budgeting\n\nchanged\n" },
    { id: "p4", target: `${SUBJECT}/token-budgeting.md`, kind: "technique", text: "# Token budgeting\n\nchanged again\n" },
    { id: "p5", target: `${SUBJECT}/applications/python--count-before-send.md`, kind: "application", text: "---\nlayer: application\n---\n" },
  ];
  const registry = { dir: box.registry, via: "env" as const };

  // trial run, record a NEW file (stack python)
  const trial = runDirFor("2026-10-18-trial-ingest", true);
  await ingestDraft(draftWorkspace("ws-trial", proposals), trial.dir, registry);
  const patches = JSON.parse(readFileSync(path.join(trial.dir, "patches.json"), "utf8")) as RegistryPatch[];
  expect(patches.map((p) => p.id)).toEqual(["p1", TRIAL_PATCH_ID]);
  expect(patches[1]).toEqual({
    id: "t1",
    target: `${SUBJECT}/applications/python--count-before-send.md`,
    kind: "application",
    rationale: "The trial's measurement record; the post cites it as source 1.",
    sources: [1],
    patchFile: "patches/t1.patch",
    required: true,
  });
  expect(patches[0].required, "a model's patch is never required").toBeUndefined();
  const refused = JSON.parse(readFileSync(path.join(trial.dir, "patches.rejected.json"), "utf8")) as { entry: { id: string }; reason: string }[];
  expect(Object.fromEntries(refused.map((r) => [r.entry.id, r.reason]))).toEqual({
    p2: `a trial run's patch must sit under the subject's directory ${SUBJECT}/`,
    p3: "a trial run proposes technique amendments only; subject is not one",
    p4: `a technique amendment targets a file under ${SUBJECT}/techniques/`,
    p5: "a trial run proposes technique amendments only; application is not one",
  });
  const t1 = readFileSync(path.join(trial.dir, "patches", "t1.patch"), "utf8");
  expect(t1).toMatch(/^new file mode/m);
  expect(t1).toContain("+applied: experiment");
  expect(t1).toContain("+ab_verdict: better");
  // the diff applies to the registry as it stands
  const patchFile = path.join(trial.dir, "patches", "t1.patch");
  git(box.registry, "apply", "--check", patchFile);

  // trial run, record APPENDED to the application the registry already holds (stack node)
  const appendRun = runDirFor("2026-10-18-trial-append", true, "node");
  await ingestDraft(draftWorkspace("ws-append", []), appendRun.dir, registry);
  const appendPatch = readFileSync(path.join(appendRun.dir, "patches", "t1.patch"), "utf8");
  expect(appendPatch).not.toMatch(/^new file mode/m);
  expect(appendPatch).not.toMatch(/^-[^-]/m);
  expect(appendPatch).toContain("+## Trial token-budgeting-2026-10-17 (2026-10-17): upheld");
  git(box.registry, "apply", "--check", path.join(appendRun.dir, "patches", "t1.patch"));

  // classic run: today's rules (the writing standard's patch is kept; the cap is the only
  // refusal), no t1
  const classic = runDirFor("2026-10-18-classic-ingest", false);
  await ingestDraft(draftWorkspace("ws-classic", proposals), classic.dir, registry);
  const classicPatches = JSON.parse(readFileSync(path.join(classic.dir, "patches.json"), "utf8")) as RegistryPatch[];
  expect(classicPatches.map((p) => p.id)).toEqual(proposals.slice(0, MAX_PATCHES).map((p) => p.id));
  expect(classicPatches.map((p) => p.id)).toContain("p2");
  expect(classicPatches.some((p) => p.required || p.id === TRIAL_PATCH_ID)).toBe(false);
  const classicRefused = existsSync(path.join(classic.dir, "patches.rejected.json")) ? (JSON.parse(readFileSync(path.join(classic.dir, "patches.rejected.json"), "utf8")) as { reason: string }[]) : [];
  expect(classicRefused.every((r) => r.reason === `more than ${MAX_PATCHES} proposals`)).toBe(true);
});

test("ingest: a trial run whose experiment holds no verdict fails the draft by the file's name", async () => {
  const { dir } = runDirFor("2026-10-18-trial-noverdict", true);
  rmSync(path.join(dir, "experiment", "verdict.json"));
  await expect(ingestDraft(draftWorkspace("ws-nov", []), dir, { dir: box.registry, via: "env" })).rejects.toThrow(/experiment\/verdict\.json is missing/);
});

/* ── approve, land, reject ────────────────────────────────────────────── */

test("approve without t1 still lands t1: the record, SOURCES.md's Experiments, the PR's Trial block; upheld files no lead", async () => {
  test.slow();
  process.env.STUB_GH_LOG = path.join(box.dir, "gh.log");
  const gate = await toGate();
  expect(gate.status, gate.error).toBe("awaiting-approval");
  const ids = await seedTrialStates(box.store, gate.id, { registry: box.registry });
  const id = ids["trial-upheld"];

  const detail = await getRunDetail(id);
  expect(detail.patches.map((p) => `${p.id}:${p.required ?? false}`)).toEqual(["p1:false", "t1:true"]);

  const approved = await approveRun(id, ["p1"]);
  expect(approved.approval?.patches, "the required record joins whatever the caller named").toEqual(["p1", "t1"]);
  const landed = await driveRun(id, deps());
  expect(landed.status, landed.error).toBe("landed");
  expect(landed.landing?.gates.map((g) => `${g.lane}:${g.mode}:${g.ok}`)).toEqual(["publications:write:true", "publications:check:true", "knowledge:write:true", "knowledge:check:true"]);

  const ref = `refs/heads/${landed.landing!.branch}`;
  const app = git(box.origin, "show", `${ref}:${landed.trial!.applicationPath}`);
  expect(app).toMatch(/^---\nlayer: application\ntype: application\nsubject: token-budgeting\ntechnique: count-before-send\nstack: python\nverified_on: 2026-10-17\nverified_against: python@3\.13\.1\napplied: experiment\nab_verdict: better\nproof: ab-paired\n---\n/);
  expect(git(box.origin, "show", `${ref}:${TECHNIQUE_FILE}`), "the approved amendment landed beside it").toContain("- When requests mix scripts, never trust a character estimate");
  const sources = git(box.origin, "show", `${ref}:publications/${landed.landing!.slug}/SOURCES.md`);
  expect(sources).toMatch(/^# Sources: /);
  expect(sources).toContain("\n## Experiments\n");
  expect(sources).toContain(landed.trial!.applicationPath);
  expect(sources).toContain("**Verdict: upheld**");

  const gh = JSON.parse(readFileSync(path.join(box.dir, "gh.log"), "utf8").trim()) as string[];
  const body = gh[gh.indexOf("--body") + 1];
  expect(body).toContain("### Trial `token-budgeting-2026-10-17`: upheld");
  expect(body).toContain(`- Application record: \`${landed.trial!.applicationPath}\``);
  expect(body).toContain("- Governs in the consuming project: ");
  expect(body).toContain("run `node scripts/converge.mjs --pending --write` in the registry");
  expect(body).toContain("- t1 (application)");
  const message = git(box.origin, "log", "-1", "--format=%B", ref);
  expect(message).toContain("Trial token-budgeting-2026-10-17: upheld");

  expect(leadRows(), "an upheld landing leaves the golden path alone").toEqual([]);
});

test("end to end: createRun({trial}) -> the stub drive -> t1 at the gate -> approve with nothing named -> t1 on the origin", async () => {
  test.slow();
  const trials = path.join(box.dir, "trials");
  process.env.ARTICLES_TRIALS_DIR = trials;
  process.env.ARTICLES_REGISTRY_REMOTE = "github:fixture/ai-registry";
  // a closed, unclaimed trial in the trial store, laid out as the trial verbs leave one
  const seeded = writeSeedExperiment(path.join(box.dir, "seed"), "trial-upheld");
  mkdirSync(trials, { recursive: true });
  renameSync(path.join(box.dir, "seed", "experiment"), path.join(trials, seeded.ref.id));

  const created = await createRun({ topic: { kind: "subject", bundle: "software-engineering", subject: "token-budgeting", text: "" }, trial: seeded.ref.id }, deps());
  expect(created.trial?.applicationPath).toBe(`${SUBJECT}/applications/python--count-before-send.md`);
  const atGate = await driveRun(created.id, deps());
  expect(atGate.status, atGate.error).toBe("awaiting-approval");
  const detail = await getRunDetail(created.id);
  expect(detail.trial?.verdict.verdict).toBe("upheld");
  const t1 = detail.patches.find((p) => p.id === TRIAL_PATCH_ID);
  expect(t1).toMatchObject({ kind: "application", target: created.trial!.applicationPath, required: true, sources: [1] });
  expect(t1?.diff).toMatch(/^\+applied: experiment$/m);
  expect(detail.patches.every((p) => p.id === TRIAL_PATCH_ID || p.target.startsWith(`${SUBJECT}/techniques/`))).toBe(true);

  expect((await approveRun(created.id, [])).approval?.patches).toEqual([TRIAL_PATCH_ID]);
  const landed = await driveRun(created.id, deps());
  expect(landed.status, landed.error).toBe("landed");
  expect(git(box.origin, "show", `refs/heads/${landed.landing!.branch}:${created.trial!.applicationPath}`)).toContain("ab_verdict: better");
});

test("a challenged landing approved with no patch at all lands t1 and files exactly one technique lead", async () => {
  test.slow();
  const gate = await toGate();
  const ids = await seedTrialStates(box.store, gate.id, { registry: box.registry });
  const id = ids["trial-challenged"];
  const approved = await approveRun(id, []);
  expect(approved.approval?.patches).toEqual(["t1"]);
  const landed = await driveRun(id, deps());
  expect(landed.status, landed.error).toBe("landed");
  expect(git(box.origin, "show", `refs/heads/${landed.landing!.branch}:${landed.trial!.applicationPath}`)).toContain("ab_verdict: not-better");
  const rows = leadRows();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ bundle: "software-engineering", nearest: "cost-metering", kind: "technique" });
  expect(String(rows[0].claim)).toMatch(/^When preflight-estimation is applied on node@22\.11\.0, .+, because .+/);
  expect(String(rows[0].from)).toMatch(/^article-trial@\d{4}-\d{2}-\d{2}$/);
});

test("reject: a trial run files one application lead so the measurement survives the post; a classic run files none", async () => {
  const gate = await toGate();
  const ids = await seedTrialStates(box.store, gate.id);
  await rejectRun(gate.id, "classic: the counter-source is a news piece");
  expect(leadRows(), "a classic reject is not a registry event").toEqual([]);

  const rejected = await rejectRun(ids["trial-challenged"], "The prose buries the number.");
  expect(rejected.status).toBe("rejected");
  const rows = leadRows();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ kind: "application", nearest: "cost-metering", bundle: "software-engineering" });
  expect(String(rows[0].because)).toContain("was rejected at the gate: The prose buries the number.");
  expect(String(rows[0].because)).toContain("node--preflight-estimation.md");
  expect((await readRun(ids["trial-challenged"])).rejection?.note).toBe("The prose buries the number.");
});

test("landing refuses a trial run whose experiment lost its verdict, before the registry is touched", async () => {
  const gate = await toGate();
  const ids = await seedTrialStates(box.store, gate.id, { registry: box.registry });
  const id = ids["trial-upheld"];
  await approveRun(id, []);
  rmSync(path.join(runDir(id), "experiment", "verdict.json"));
  const failed = await driveRun(id, deps());
  expect(failed.status).toBe("failed");
  expect(failed.error).toMatch(/^landing: trial token-budgeting-2026-10-17: experiment\/verdict\.json is missing/);
  expect(git(box.origin, "branch", "--list", "article/*").trim(), "nothing reached the origin").toBe("");
});
