// PHASE 4 EXIT - SPEND RECONCILES TO THE METER (plan §6, decision 7), across producers.
//
// One faked-LIVE run in ONE kernel store, four producers with four pricing shapes, each launched
// through its own receipt -> confirm door with mode live and driven by the kernel:
//   music video   a reported text turn priced; a studio still (credits) and a silent seat unpriced
//   Suno          every create credit-priced: unpriced with Suno's reason, $0
//   research      a part act: three follow-up turns, each a vendor-reported price
//   article       every claude turn a reported seat cost; codex/agy turns unpriced
// Every vendor is a fake behind the producer's own engine seam (the mv fakes, the fake Suno driver,
// a fake text engine, the article stub agent); nothing leaves the machine. This is the ONE test
// lane allowed live mode: GRAVITONE_DRY_ONLY is deleted here and nowhere else.
//
// Then, over the whole store:
//   per job     Job.spend is a projection of the meter (reconcileJobSpend: no drift);
//   per group   the events' cost, summed by type group, equals the meter - `spend.*` (the meter's
//               own bookings) to every usd row, `job.*` (the job steps' projection) to the rows
//               a job owns - so neither group drops or double counts, and no third group carries
//               money the meter never saw;
//   unpriced    every unpriced row names WHY (never the ledger's generic fallback).
// The last case breaks the meter on purpose and watches every check say so.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-exit-spend-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  delete process.env["GRAVITONE_DRY_ONLY"];
  delete process.env["NEXT_PUBLIC_DEV_AUTH"];
  delete process.env["LEONARDO_STUDIO_CDP"];
  delete process.env["SUNO_DRIVER"];
  return dir;
});

import { rmSync } from "node:fs";

import { ok } from "@gt/domain/errors";
import type { Job } from "@gt/domain/job";
import { list } from "@gt/kernel/job";
import { runJob } from "@gt/kernel/job-run";
import { writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import { reconcileJobSpend } from "@gt/kernel/spend/projection";
import type { Store } from "@gt/kernel/store";

import { defaultDeps } from "../../lib/articles/engine.ts";
import { fixtureSource } from "../../lib/notebook/source.ts";
import { articleKernel, articleProducer, launchArticle, type ArticleBinding } from "../../lib/producers/article.ts";
import { driveMv, launchMv } from "../../lib/producers/mv.ts";
import { effectsOf, launchPartAct, partActReceipt, researchProducer, researchUnits, withRecords } from "../../lib/producers/research.ts";
import { OPERATOR, soundKernel } from "../../lib/producers/sound.ts";
import { driveSuno, launchSuno } from "../../lib/producers/suno.ts";
import { importFolder } from "../../lib/sound/mv/importFolder.ts";
import { enqueueMv } from "../../lib/sound/mv/queue.ts";
import { resetFakeSuno } from "../../lib/sound/suno/fakeDriver.ts";
import { enqueueProposals, FAKE_SUNO_DRIVER } from "../../lib/sound/suno/queue.ts";
import { addProposals } from "../../lib/sound/suno/store.ts";
import type { TextRequest, TextResult } from "../../lib/text/types.ts";
import { articleSandbox, type ArticleSandbox } from "../golden-path/_articles.ts";
import { audioDir, mvFakes, TREAT_USD } from "./producer-mv-fakes.ts";

const must = <T>(r: { ok: true; value: T } | { ok: false; error: { code?: string; message: string } }): T => {
  if (!r.ok) throw new Error(`${r.error.code ?? ""}: ${r.error.message}`);
  return r.value;
};
const usd6 = (x: number): number => Math.round(x * 1e6) / 1e6;
const NOW = Date.parse("2026-10-16T09:00:00Z");
const ARTICLE_TURN_USD = 0.25;
const FOLLOW_UP_USD = 0.02;

let box: ArticleSandbox;
let store: Store;
const jobs: Record<"mv" | "suno" | "research" | "article", string> = { mv: "", suno: "", research: "", article: "" };

/* ── the four launches, each through its own door, each live ──────────────── */

async function liveMv(): Promise<string> {
  const { takeIds } = await importFolder(audioDir(ROOT, ["01_Meter Reading.mp3"]));
  const [job] = await enqueueMv([{ kind: "take", id: takeIds[0]!, title: "01_Meter Reading" }]);
  const r = await launchMv([job!.id], { mode: "live", actor: OPERATOR, dryOnly: false });
  if (r.kind !== "receipt") throw new Error("mv: expected a receipt");
  const c = await launchMv([job!.id], { mode: "live", actor: OPERATOR, dryOnly: false, token: r.receipt.token });
  if (c.kind !== "launched") throw new Error(`mv: expected a launch, got ${c.kind}`);
  const kid = c.jobIds[0]!;
  const d = await driveMv([kid], { engines: mvFakes().engines, dryOnly: false });
  expect(d.reports[0]?.report.ok && d.reports[0].report.value.outcome).toBe("done");
  return kid;
}

async function liveSuno(): Promise<string> {
  resetFakeSuno();
  const [p] = await addProposals([{ fields: { title: "Exit meter", style: "warm synthwave, analog pads" }, lane: { axis: "group", value: "ungrouped" }, origin: "llm" }]);
  const [job] = await enqueueProposals([p!.id]);
  const r = await launchSuno([job!.id], { mode: "live", actor: OPERATOR, dryOnly: false });
  if (r.kind !== "receipt") throw new Error("suno: expected a receipt");
  const c = await launchSuno([job!.id], { mode: "live", actor: OPERATOR, dryOnly: false, token: r.receipt.token });
  if (c.kind !== "launched") throw new Error(`suno: expected a launch, got ${c.kind}`);
  const kid = c.jobIds[0]!;
  const d = await driveSuno([kid], { driver: FAKE_SUNO_DRIVER, dryOnly: false });
  expect(d.reports[0]?.report.ok && d.reports[0].report.value.outcome).toBe("done");
  return kid;
}

/** A fake text vendor: every follow-up answered with a confirmation, at a vendor-reported price. */
const fakeReason = async (req: TextRequest): Promise<TextResult> => {
  const q = /"prompt":"([^"]+)"/.exec(req.prompt)?.[1] ?? "?";
  const fact = fixtureSource().notebook.facts[0]?.id ?? "f-1";
  const json = { summary: `on ${q}`, effects: [{ kind: "confirms", targetId: fact, note: q }], sources: ["fake"], verdict: "strengthened" };
  return { text: JSON.stringify(json), json, provenance: { provider: "claude-cli", model: "fake", transport: "local-subprocess", rung: "preferred", turn: req.turn, schemaEnforcement: "native", durationMs: 5, costUsd: FOLLOW_UP_USD, costBasis: "vendor-reported", promptChars: req.prompt.length } };
};

async function liveResearch(): Promise<string> {
  const project = "exit-meter";
  const partId = `${project}/research`;
  must(compose(store, { recipe: "film/short-educational-video" }, OPERATOR, { id: project }));
  const src = fixtureSource();
  const followUps = ["whale holders?", "mining cost?", "etf flows?"].map((prompt, i) => ({ id: `fu-${i + 1}`, kind: "question", prompt, status: "queued" }));
  const nb = { topic: "why bitcoin", notebook: src.notebook, engine: null, followUps, revisions: [], source: { kind: src.kind, conclusions: src.conclusions, dimensions: src.dimensions, tags: src.tags, digest: src.digest } };
  must(writePart(store, { projectId: project, partId, baseRev: "current", act: "land", op: { seed: true }, label: "seed", by: { kind: "machine", id: "seed" }, next: () => ok({ "research-notebook": nb }) }));
  const ref = { projectId: project, partId, act: "follow-up" };
  const units = withRecords(researchUnits);
  const receipt = must(partActReceipt(store, ref, units, { mode: "live", now: NOW }));
  const launched = must(launchPartAct(store, ref, units, { mode: "live", now: NOW, token: receipt.token, actor: OPERATOR, dryOnly: false }));
  if (launched.kind !== "launched") throw new Error("research: stale receipt");
  const r = must(await runJob(effectsOf(store), researchProducer("seat.text", { reason: fakeReason }), launched.jobId, { dryOnly: false }));
  expect(r.outcome, r.job?.error?.message).toBe("done");
  return launched.jobId;
}

async function liveArticle(): Promise<string> {
  process.env["STUB_AGENT_COST"] = String(ARTICLE_TURN_USD);
  try {
    const k = must(articleKernel());
    const b: ArticleBinding = { kernel: k, engine: () => defaultDeps({ render: false }) };
    const l = must(await launchArticle({ topic: { kind: "free", text: "the reconciled tax" } }, { actor: OPERATOR, mode: "live", ceilingUsd: 500, binding: b, env: {} }));
    const rep = must(await runJob(k.fx, articleProducer(b), l.jobId!, { dryOnly: false, sleep: async () => undefined }));
    expect(rep.outcome, rep.job?.error?.message).toBe("done");
    return l.jobId!;
  } finally {
    delete process.env["STUB_AGENT_COST"];
  }
}

beforeAll(async () => {
  // The sandbox points GRAVITONE_STORE_PATH at its own directory and closes any process kernel: from
  // here on every producer - sound, part, article - opens the SAME store, as one worker would.
  box = articleSandbox();
  store = soundKernel().store;
  expect(must(articleKernel()).store).toBe(store);
  jobs.mv = await liveMv();
  jobs.suno = await liveSuno();
  jobs.research = await liveResearch();
  jobs.article = await liveArticle();
}, 300_000);

afterAll(() => {
  box?.cleanup();
  rmSync(ROOT, { recursive: true, force: true });
});

/* ── the checks, as functions that return findings, so the broken meter can be read by the same code ── */

const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const scalar = (sql: string, ...p: string[]): number => num(must(store.read((r) => r.get(sql, ...p)?.["v"])));

/** Per job: the record's spend against its meter rows. */
function drifts(): string[] {
  return must(list(store)).flatMap((j) => {
    const rec = must(store.read((r) => reconcileJobSpend(r, j.id)));
    return rec.drift === undefined ? [] : [`${j.id}: record ${JSON.stringify(rec.job)} vs meter ${JSON.stringify(rec.meter)}`];
  });
}

type Groups = { readonly meterUsd: number; readonly jobMeterUsd: number; readonly recordsUsd: number; readonly byGroup: Readonly<Record<string, number>> };

function groups(): Groups {
  const rows = must(store.read((r) => r.all("SELECT substr(type, 1, instr(type, '.') - 1) AS g, total(cost_usd) AS v FROM events WHERE cost_usd IS NOT NULL GROUP BY g")));
  const byGroup: Record<string, number> = {};
  for (const row of rows) byGroup[String(row["g"])] = usd6(num(row["v"]));
  return {
    meterUsd: usd6(scalar("SELECT total(usd) AS v FROM spend_rows")),
    jobMeterUsd: usd6(scalar("SELECT total(usd) AS v FROM spend_rows WHERE job_id IS NOT NULL")),
    recordsUsd: usd6(must(list(store)).reduce((a, j: Job) => a + j.spend.usd, 0)),
    byGroup,
  };
}

/** The type-group sums against the meter: empty when every group agrees. */
function groupFindings(g: Groups): string[] {
  const f: string[] = [];
  if ((g.byGroup["spend"] ?? 0) !== g.meterUsd) f.push(`spend.* events carry $${g.byGroup["spend"] ?? 0}, the meter's rows $${g.meterUsd}`);
  if ((g.byGroup["job"] ?? 0) !== g.jobMeterUsd) f.push(`job.* events carry $${g.byGroup["job"] ?? 0}, the meter's job rows $${g.jobMeterUsd}`);
  if (g.recordsUsd !== g.jobMeterUsd) f.push(`job records sum to $${g.recordsUsd}, the meter's job rows $${g.jobMeterUsd}`);
  for (const [k, v] of Object.entries(g.byGroup)) if (k !== "spend" && k !== "job" && v !== 0) f.push(`${k}.* events carry $${v} the meter never booked`);
  return f;
}

/* ── the evidence ─────────────────────────────────────────────────────────── */

describe("a faked-live run across four producers, one store", () => {
  it("each launch was armed live, ran to done, and spent in its own shape", () => {
    const all = new Map<string, Job>(must(list(store)).map((j) => [j.id, j]));
    for (const [name, id] of Object.entries(jobs)) expect(all.get(id), name).toMatchObject({ state: "done", mode: { kind: "live" } });
    expect(all.get(jobs.mv)?.spend).toEqual({ usd: TREAT_USD, unpriced: 2, basis: "estimate" });
    expect(all.get(jobs.suno)?.spend).toEqual({ usd: 0, unpriced: 2, basis: "estimate" });
    expect(all.get(jobs.research)?.spend).toEqual({ usd: usd6(3 * FOLLOW_UP_USD), unpriced: 0, basis: "reported" });
    const article = all.get(jobs.article)?.spend;
    expect(article?.usd).toBeGreaterThan(0);
    expect(article?.unpriced).toBeGreaterThanOrEqual(2);
    // The store holds these four jobs and nothing else: the checks below read the whole run.
    expect([...all.keys()].sort()).toEqual(Object.values(jobs).sort());
  });

  it("every job's spend equals its meter rows (reconcileJobSpend: no drift)", () => {
    expect(drifts()).toEqual([]);
  });

  it("the events' cost by type group equals the meter: spend.* to every usd row, job.* to the job rows, no third group", () => {
    const g = groups();
    expect(g.meterUsd).toBeGreaterThan(0);
    expect(groupFindings(g)).toEqual([]);
  });

  it("every unpriced row carries its reason - the credit, the silent seat - never the ledger's fallback", () => {
    const reasons = must(store.read((r) => r.all("SELECT job_id, reason FROM spend_unpriced").map((x) => ({ job: String(x["job_id"]), reason: String(x["reason"]) }))));
    expect(reasons.length).toBe(scalar("SELECT count(*) AS v FROM spend_unpriced"));
    expect(reasons.length).toBeGreaterThanOrEqual(6);
    for (const { job, reason } of reasons) {
      expect(reason.trim(), `an unpriced row of ${job}`).not.toBe("");
      expect(reason, `an unpriced row of ${job} names no reason of its own`).not.toMatch(/^unpriced \(/);
    }
    const of = (id: string) => reasons.filter((r) => r.job === id).map((r) => r.reason);
    expect(of(jobs.mv).some((x) => x.includes("Leonardo studio credits"))).toBe(true);
    expect(of(jobs.suno)).toHaveLength(2);
    // A usd row with no dollar figure would be an unpriced call hiding in the priced table.
    expect(scalar("SELECT count(*) AS v FROM spend_rows WHERE job_id IS NOT NULL AND usd IS NULL")).toBe(0);
    // And every job's unpriced count is exactly its reasoned rows.
    for (const j of must(list(store))) expect(j.spend.unpriced, j.id).toBe(of(j.id).length);
  });

  it("the checks are not vacuous: a meter row the record never heard of is drift, per job and per group", () => {
    must(
      store.tx((t) => {
        t.run(
          "INSERT INTO spend_rows (class, at_ms, amount, outcome, basis, axes, reservation_id, job_id, step, usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          "job-usd", NOW, 0.5, "served", "vendor", "{}", null, jobs.research, "unit:fu:ghost", 0.5,
        );
        return undefined;
      }),
    );
    expect(drifts()).toEqual([expect.stringContaining(jobs.research)]);
    const f = groupFindings(groups());
    expect(f.some((x) => x.startsWith("spend.* events"))).toBe(true);
    expect(f.some((x) => x.startsWith("job.* events"))).toBe(true);
    expect(f.some((x) => x.startsWith("job records"))).toBe(true);
  });
});
