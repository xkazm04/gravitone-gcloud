// THE REAL PRODUCE PORT (app/(studio)/projects/_port/real.ts) over a REAL kernel in a temp file,
// a temp catalogue, Library and strips store, and a throwaway registry - the repo's own strips
// approach cards are read, never written. What the port adds to the records module and the
// kernel verbs is pinned here (their own behaviour is packages/kernel/test/records*.test.ts's):
//   · choices come from the stores: styles by status, registry subjects as bundle/slug, strip
//     cases from the approach cards, kept music takes only;
//   · a Floor launch is a receipt, then a confirm: a stale token launches nothing; an article
//     launch is one Run row and one DRY job under the article producer; a strips launch names
//     its run in the receipt and launches under that same name, its manifest naming the job;
//     an audio launch from a sentence is a dry Suno job drafted on the confirm (L52), an sfx one is
//     one dry sfx Run of the receipt's clips (L72); an image launch
//     (L45) is a forge sweep - priced statically, run.json prepared by forge.py on the confirm, one
//     dry gpu.local job the Python worker claims;
//   · a live receipt is refused where only dry may run (GRAVITONE_DRY_ONLY=1);
//   · a plan whose revision moved under its receipt answers the fresh receipt at the new revision;
//   · the Runs acts are the kernel's, and a lane a crash holds refuses the retry of its job until
//     an operator acknowledges it;
//   · a re-route to another lane relaunches in ONE transaction (old job cancelled, `~2` on the new
//     lane, the part row moved with its option), a re-route on the same lane is the kernel's
//     steer on the same job, and a receipt the queue moved under is stale.
// Nothing here spends: every job is dry, no worker runs, and the one drive is a fake that crashes.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-l35-produce-"));
  process.env["STRIPS_STORE_DIR"] = path.join(dir, "strips");
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["FOUNDRY_RUNS_DIR"] = path.join(dir, "runs");
  // THE STOCK FRAME IS THE TEST'S OWN. The forge reads a plan's bare `frame` from
  // FOUNDRY_FRAMES_DIR (lib/producers/forge.ts `framesDir`, forge.py `frames_dir`), else from the
  // checkout's pipeline/vlm-probe/frames - which is gitignored, so a clone without the frames
  // refused the sweep ("no stock scene's frame is on this machine") and this case passed or failed
  // on the machine. Every frame the stock plan names is written here as a 1x1 JPEG: the dry job
  // copies it whole and never decodes it, and the receipt only asks that it exists.
  const frames = path.join(dir, "frames");
  fs.mkdirSync(frames, { recursive: true });
  process.env["FOUNDRY_FRAMES_DIR"] = frames;
  const plan: unknown = JSON.parse(fs.readFileSync(path.join(process.cwd(), "pipeline", "foundry", "plans", "dry-run.json"), "utf8"));
  const scenes = typeof plan === "object" && plan !== null && "scenes" in plan && Array.isArray(plan.scenes) ? (plan.scenes as unknown[]) : [];
  const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
  for (const sc of scenes) {
    const frame = typeof sc === "object" && sc !== null && "frame" in sc ? sc.frame : undefined;
    if (typeof frame === "string" && !/^(frame|lane):/.test(frame)) fs.writeFileSync(path.join(frames, frame), jpeg);
  }
  return dir;
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ok, type Result } from "@gt/domain/errors";
import type { Holder, Job } from "@gt/domain/job";
import type { ComposerInput, Receipt } from "@gt/domain/produce";
import { blobStore } from "@gt/kernel/blob";
import { liveEffects } from "@gt/kernel/effects";
import type { Producer } from "@gt/kernel/job-core";
import { list } from "@gt/kernel/job";
import { recover, runJob } from "@gt/kernel/job-run";
import { openKernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";

import { makeRealProduce } from "../../app/(studio)/projects/_port/real.ts";

const REPO = process.cwd();
const T0 = Date.parse("2026-10-16T09:00:00.000Z");
const clock = { ms: T0 };

// The stores the choices read: two styles, three takes (one kept sfx, one rejected), one registry subject.
mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
writeFileSync(
  path.join(ROOT, "catalogue", "styles.json"),
  JSON.stringify({ styles: [{ id: "ink-graphic-novel", name: "Ink graphic novel", status: "proven" }, { id: "risograph-signal", name: "Risograph signal", status: "candidate" }] }),
);
mkdirSync(path.join(ROOT, "sound"), { recursive: true });
writeFileSync(
  path.join(ROOT, "sound", "takes.json"),
  JSON.stringify({
    version: 1,
    takes: [
      { id: "st-salt", kind: "music", title: "Salt lines", verdict: "kept", durationS: 154 },
      { id: "st-bin", kind: "music", title: "Binned", verdict: "rejected", durationS: 90 },
      { id: "st-whoosh", kind: "sfx", title: "Whoosh", verdict: "kept", durationS: 2 },
    ],
  }),
);
const REG = path.join(ROOT, "reg");
mkdirSync(path.join(REG, "recipes"), { recursive: true });
writeFileSync(path.join(REG, "recipes", "index.json"), "{}");
mkdirSync(path.join(REG, "knowledge", "media-generation"), { recursive: true });
writeFileSync(path.join(REG, "knowledge", "media-generation", "index.json"), JSON.stringify({ subjects: { "visual-style-locking": { file: "x.md" } } }));

const env: Record<string, string | undefined> = { GRAVITONE_DRY_ONLY: "1", AI_REGISTRY_DIR: REG };

const k = openKernel(path.join(ROOT, "store.sqlite"), { clock: () => new Date(clock.ms) });
if (!k.ok) throw k.error;
const store: Store = k.value.store;
const fx = liveEffects(store, blobStore(path.join(ROOT, "blobs")));
afterAll(() => {
  k.value.close();
  rmSync(ROOT, { recursive: true, force: true });
});

let n = 0;
const port = makeRealProduce({ store: () => ok(store), strips: () => ok({ store, fx }), env: () => env, now: () => clock.ms, cwd: () => REPO, mint: () => `t${++n}` });
const who = { who: "op-test" };

async function v<T>(r: Result<T> | Promise<Result<T>>): Promise<T> {
  const x = await r;
  if (!x.ok) throw new Error(`expected ok, got ${x.error.code}: ${x.error.message}`);
  return x.value;
}
async function refusal<T>(r: Result<T> | Promise<Result<T>>): Promise<{ code: string; message: string }> {
  const x = await r;
  if (x.ok) throw new Error(`expected a refusal, got ${JSON.stringify(x.value).slice(0, 200)}`);
  return { code: x.error.code, message: x.error.message };
}
const jobs = (): Job[] => {
  const r = list(store);
  if (!r.ok) throw r.error;
  return r.value;
};
const row = <T>(sql: string, ...args: string[]): T | undefined => {
  const r = store.read((x) => x.get(sql, ...args));
  if (!r.ok) throw r.error;
  return r.value as T | undefined;
};
const runRows = (): number => row<{ c: number }>("SELECT count(*) AS c FROM runs")?.c ?? 0;

const article: ComposerInput = { lane: "article", text: "The budget is a clock, not a pool. It runs out.", topic: "media-generation/visual-style-locking" };

describe("the real produce port", () => {
  it("offers what the stores hold", async () => {
    const c = await v(port.composerChoices());
    expect(c.image.proven.map((s) => s.value)).toEqual(["ink-graphic-novel"]);
    expect(c.image.candidates.map((s) => s.value)).toEqual(["risograph-signal"]);
    expect(c.article.topics).toEqual([{ value: "media-generation/visual-style-locking", label: "Visual style locking", bundle: "media-generation" }]);
    expect(c.video.subjects.map((s) => s.value)).toContain("edu-radar");
    const cc = await v(port.composeChoices());
    expect(cc.takes.map((t) => t.value)).toEqual(["st-salt"]);
    expect(cc.freshTake).toBe("st-salt");
    expect(cc.styles.map((s) => s.value)).toEqual(["ink-graphic-novel"]);
  });

  it("launches a Floor article as one Run and one dry job, and a stale token launches nothing", async () => {
    // The Estimate is read before a word is typed: an empty first sentence still prices.
    expect((await v(port.composerReceipt({ input: { ...article, text: "" } }, who))).lines[0]?.lane).toBe("seat.text");
    const receipt = await v(port.composerReceipt({ input: article }, who));
    expect(receipt.mode).toBe("dry");
    expect(receipt.lines[0]?.lane).toBe("seat.text");
    const stale = await v(port.launchRun({ input: article, token: `${receipt.token.slice(0, -4)}beef` }, who));
    expect(stale.kind).toBe("stale");
    expect(runRows()).toBe(0);
    expect(jobs()).toHaveLength(0);
    const l = await v(port.launchRun({ input: article, token: receipt.token }, who));
    if (l.kind !== "launched") throw new Error(`expected launched, got ${l.kind}`);
    expect(l.runId).toMatch(/^floor-visual-style-locking-t\d+$/);
    expect(row<{ job_id: string }>("SELECT job_id FROM runs WHERE id = ?", l.runId)?.job_id).toBe(l.jobId);
    const j = jobs().find((x) => x.id === l.jobId);
    expect(j).toMatchObject({ producer: "article", lane: "seat.text", state: "queued", mode: { kind: "dry" } });
    const view = (await v(port.listJobs())).find((x) => x.id === l.jobId);
    expect(view).toMatchObject({ media: "article", title: "The budget is a clock, not a pool.", mode: "dry", state: "queued" });
  });

  it("refuses a live receipt where only dry may run, and reads one where live is allowed", async () => {
    expect((await refusal(port.composerReceipt({ input: article, mode: "live" }, who))).code).toBe("refused");
    env["GRAVITONE_DRY_ONLY"] = "0";
    try {
      const live = await v(port.composerReceipt({ input: article, mode: "live" }, who));
      const dry = await v(port.composerReceipt({ input: article }, who));
      expect(live.mode).toBe("live");
      // The token binds the mode: a dry receipt's token can never confirm a live launch.
      expect(live.token).not.toBe(dry.token);
    } finally {
      env["GRAVITONE_DRY_ONLY"] = "1";
    }
  });

  it("names a strips run in its receipt and launches under that name", async () => {
    const input: ComposerInput = { lane: "video", text: "Radar sweeps; one blip stays.", subject: "edu-radar" };
    const receipt = await v(port.composerReceipt({ input }, who));
    const runId = receipt.token.slice(0, receipt.token.lastIndexOf(":"));
    expect(runId).toMatch(/^floor-edu-radar-t\d+$/);
    expect(receipt.lines[0]?.lane).toBe("seat.text");
    const l = await v(port.launchRun({ input, token: receipt.token }, who));
    if (l.kind !== "launched") throw new Error(`expected launched, got ${l.kind}`);
    expect(l.runId).toBe(runId);
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "strips", runId, "run.json"), "utf8")) as { job: string; dry: boolean };
    expect(manifest).toMatchObject({ job: l.jobId, dry: true });
    expect(jobs().find((x) => x.id === l.jobId)).toMatchObject({ producer: "strips", lane: "seat.text", mode: { kind: "dry" } });
    // The same receipt twice is one run: its manifest exists, so the second confirm is refused.
    expect((await refusal(port.launchRun({ input, token: receipt.token }, who))).code).toBe("conflict");
  });

  it("launches a Floor sentence as a Suno take (L52): priced under a minted job, drafted on the confirm, one dry box.chrome job", async () => {
    const before = jobs().length;
    const input: ComposerInput = { lane: "audio", text: "A bed that holds a full minute under the narrator.", kind: "music" };
    const r: Receipt = await v(port.composerReceipt({ input }, who));
    // The receipt names its job in the token and writes nothing: no proposal, no record, no job.
    const jobId = r.token.slice(0, r.token.lastIndexOf(":"));
    expect(jobId).toMatch(/^sj-floor-t\d+$/);
    expect(r.lines.map((l) => [l.lane, l.label])).toEqual([["box.chrome", "A bed that holds a full minute under the narrator."]]);
    const suno = (): { proposals: { id: string; origin: string; note?: string; fields: { style: string; lyrics?: string } }[]; jobs: { id: string; proposalId: string; state: string; job?: string }[] } =>
      JSON.parse(readFileSync(path.join(ROOT, "sound", "suno.json"), "utf8"));
    expect(existsSync(path.join(ROOT, "sound", "suno.json")) ? suno().jobs : []).toEqual([]);
    expect(jobs()).toHaveLength(before);

    const l = await v(port.launchRun({ input, token: r.token }, who));
    if (l.kind !== "launched") throw new Error(`expected launched, got ${l.kind}`);
    expect(l).toMatchObject({ runId: `suno.${jobId}`, jobId: `job:run:suno.${jobId}` });
    expect(jobs().find((x) => x.id === l.jobId)).toMatchObject({ producer: "suno", lane: "box.chrome", mode: { kind: "dry" } });
    // Dry: the sentence stands in for the drafted prompt - no text turn was paid.
    const f = suno();
    expect(f.proposals.find((p) => p.id === `sp-${jobId.slice(3)}`)).toMatchObject({ origin: "custom", note: "dry: the sentence as written, no text turn", fields: { style: "A bed that holds a full minute under the narrator", lyrics: "[Instrumental]" } });
    expect(f.jobs.find((j) => j.id === jobId)).toMatchObject({ proposalId: `sp-${jobId.slice(3)}`, state: "queued", job: l.jobId });

    // The same receipt again launches nothing new: the job exists, the confirm is stale or adopts it.
    const again = await v(port.launchRun({ input, token: r.token }, who));
    expect(jobs().filter((x) => x.id === l.jobId)).toHaveLength(1);
    expect(suno().jobs.filter((j) => j.id === jobId)).toHaveLength(1);
    expect(["launched", "stale"]).toContain(again.kind);
  });

  it("a Suno confirm the queue moved under answers the fresh receipt and leaves no record behind", async () => {
    const input: ComposerInput = { lane: "audio", text: "Low brass bed.", kind: "music" };
    const r: Receipt = await v(port.composerReceipt({ input }, who));
    const jobId = r.token.slice(0, r.token.lastIndexOf(":"));
    // Another launch lands on box.chrome between the read and the confirm.
    const other: ComposerInput = { lane: "audio", text: "A second take, launched first.", kind: "music" };
    const o = await v(port.composerReceipt({ input: other }, who));
    expect((await v(port.launchRun({ input: other, token: o.token }, who))).kind).toBe("launched");
    const stale = await v(port.launchRun({ input, token: r.token }, who));
    if (stale.kind !== "stale") throw new Error(`expected stale, got ${stale.kind}`);
    expect(stale.fresh.token.startsWith(`${jobId}:`)).toBe(true);
    const f = JSON.parse(readFileSync(path.join(ROOT, "sound", "suno.json"), "utf8")) as { proposals: { id: string }[]; jobs: { id: string }[] };
    expect(f.jobs.some((j) => j.id === jobId)).toBe(false);
    expect(f.proposals.some((p) => p.id === `sp-${jobId.slice(3)}`)).toBe(false);
    // The fresh receipt confirms.
    expect((await v(port.launchRun({ input, token: stale.fresh.token }, who))).kind).toBe("launched");
  });

  it("launches an sfx sentence as ONE dry sfx Run of the receipt's clips; a stale token launches nothing (L72)", async () => {
    const before = jobs().length;
    const input: ComposerInput = { lane: "audio", text: "Whoosh.", kind: "sfx" };
    const r: Receipt = await v(port.composerReceipt({ input }, who));
    const stale = await v(port.launchRun({ input, token: "0".repeat(16) }, who));
    expect(stale.kind).toBe("stale");
    expect(jobs()).toHaveLength(before);
    const l = await v(port.launchRun({ input, token: r.token }, who));
    if (l.kind !== "launched") throw new Error(`expected launched, got ${l.kind}`);
    // The run id carries the receipt's clip count (the catalog's track/sfx default, 2): the
    // producer's plan reads the job alone (lib/sound/sfxJob.ts clipsOf).
    expect(l.runId).toMatch(/^sfx\.floor-t\d+\.2$/);
    const job = jobs().find((x) => x.id === l.jobId);
    expect(job).toMatchObject({ producer: "sfx", lane: "cloud.elevenlabs", state: "queued", mode: { kind: "dry" } });
    expect(jobs()).toHaveLength(before + 1);
  });

  it("launches an image sweep as a forge run: priced without writing, prepared on the confirm, one dry gpu.local job", async () => {
    // The style and the stock scene plan are the checkout's (pipeline/foundry/styles.json, plans/dry-run.json);
    // the plan's frame is the temp one the hoisted block wrote (FOUNDRY_FRAMES_DIR).
    const input: ComposerInput = { lane: "image", text: "A harbor at night.", mechanisms: ["text", "ref-early"], styleId: "ink-graphic-novel" };
    const receipt = await v(port.composerReceipt({ input }, who));
    const runId = receipt.token.slice(0, receipt.token.lastIndexOf(":"));
    expect(runId).toMatch(/^floor-ink-graphic-novel-t\d+$/);
    expect(receipt.lines[0]).toMatchObject({ lane: "gpu.local", usd: 0 });
    expect(existsSync(path.join(ROOT, "runs", runId)), "a receipt writes nothing").toBe(false);
    const before = jobs().length;
    const stale = await v(port.launchRun({ input, token: `${runId}:${"0".repeat(16)}` }, who));
    expect(stale.kind).toBe("stale");
    expect(jobs()).toHaveLength(before);
    const l = await v(port.launchRun({ input, token: receipt.token }, who));
    if (l.kind !== "launched") throw new Error(`expected launched, got ${l.kind}`);
    expect(l.runId).toBe(`forge:${runId}`);
    const run = JSON.parse(readFileSync(path.join(ROOT, "runs", runId, "run.json"), "utf8")) as { candidates: unknown[]; plan: { id: string } };
    // One stock scene x one style x two mechanisms x one seed: what the receipt priced.
    expect([run.plan.id, run.candidates.length]).toEqual([runId, 2]);
    expect(jobs().find((x) => x.id === l.jobId)).toMatchObject({ producer: "forge", lane: "gpu.local", state: "queued", mode: { kind: "dry" } });
  });
});

describe("a plan, launched, and the Runs acts", () => {
  let film = "";
  it("answers a plan that moved under its receipt with the fresh receipt at the new revision", async () => {
    // Compose preselects a take whatever the recipe: a film keeps its style and drops the take.
    film = (await v(port.compose({ recipe: "film/short-educational-video", takeId: "st-salt", styleId: "ink-graphic-novel" }, who))).id;
    expect(film).toMatch(/^untitled-film-t\d+$/);
    const p = await v(port.loadPlan({ id: film }));
    expect(p.project.title).toBe("Untitled film");
    expect(p.project.styleId).toBe("ink-graphic-novel");
    expect(p.project.takeId).toBeUndefined();
    const receipt = await v(port.planReceipt({ id: film }, who));
    const frames = p.parts.find((x) => x.id === `${film}/frames`);
    expect(frames?.kind).toBe("frames");
    await v(port.setPart({ id: film, rev: p.project.rev, partId: `${film}/frames`, patch: { units: 12 } }, who));
    expect((await refusal(port.setPart({ id: film, rev: p.project.rev, partId: `${film}/frames`, patch: { units: 13 } }, who))).code).toBe("conflict");
    const stale = await v(port.launchPlan({ id: film, rev: p.project.rev, token: receipt.token }, who));
    if (stale.kind !== "stale") throw new Error("expected the fresh receipt");
    expect(stale.fresh.subject).toEqual({ kind: "project", id: film, rev: p.project.rev + 1 });
    expect(jobs().filter((j) => j.correlation?.projectId === film)).toHaveLength(0);
    const l = await v(port.launchPlan({ id: film, rev: p.project.rev + 1, token: stale.fresh.token }, who));
    if (l.kind !== "launched") throw new Error("expected a launch");
    const mine = jobs().filter((j) => j.correlation?.projectId === film);
    expect(mine.map((j) => j.state).sort()).toEqual(["planned", "planned", "planned", "planned", "planned", "queued"]);
    const view = (await v(port.listJobs())).filter((j) => j.projectId === film);
    const motion = view.find((j) => j.partId === `${film}/motion`);
    expect(motion?.after).toEqual([`job:part:${film}/frames`]);
    expect(view.every((j) => j.mode === "dry" && j.projectTitle === "Untitled film")).toBe(true);
  });

  it("pauses, resumes and moves through the kernel's verbs, in the words the toast says", async () => {
    const research = `job:part:${film}/research`;
    expect((await v(port.pauseJob({ jobId: research }, who))).note).toBe("paused · held at queued");
    expect(jobs().find((j) => j.id === research)?.state).toBe("paused");
    expect((await v(port.resumeJob({ jobId: research }, who))).note).toBe("resumed · back to queued");
    // The Floor article from above waits on seat.text too: research moves past it and back.
    const later = await v(port.moveJob({ jobId: research, dir: "later" }, who));
    const earlier = await v(port.moveJob({ jobId: research, dir: "earlier" }, who));
    expect([later.note, earlier.note].join(" | ")).toMatch(/^behind .+ \| ahead of .+$/);
    expect((await refusal(port.retryJob({ jobId: research }, who))).code).toBe("refused");
    expect((await refusal(port.ackLane({ lane: "seat.text" }, who))).code).toBe("refused");
  });

  it("holds a paid lane a crash left, refusing the retry of its job until an operator acknowledges it", async () => {
    const research = `job:part:${film}/research`;
    // A drive that dies mid-step on the text seat (a throw that is not an Error is the crash
    // harness: the driver lets it pass and the job stays running under its lease) ...
    const host = "l35-box";
    const dead: Holder = { bootId: "boot-dead", pid: 999_999, host };
    const crash: Producer = {
      lane: "seat.text",
      plan: (_j, outputs) => (outputs.has("a") ? [] : [{ name: "a", estimate: { seconds: 1, usd: 0 } }]),
      perform: () => Promise.reject("crash"),
    };
    await expect(runJob(fx, crash, research, { holder: dead, alive: () => true, heartbeatMs: 60_000 })).rejects.toBe("crash");
    // ... is found by the recovery sweep: interrupted, and the paid lane holds.
    const swept = recover(fx, { holder: { bootId: "boot-sweep", pid: 1, host }, alive: () => false });
    expect(swept.ok && swept.value.map((j) => j.id)).toEqual([research]);
    const holds = await v(port.listHolds());
    expect(holds).toEqual([expect.objectContaining({ lane: "seat.text", jobId: research, title: "Untitled film · research", stage: "a" })]);
    expect((await v(port.listJobs())).find((j) => j.id === `job:run:${jobs().find((x) => x.producer === "article")?.of.id}`)?.held).toBe(true);
    const no = await refusal(port.retryJob({ jobId: research }, who));
    expect(no.message).toMatch(/acknowledge the hold first/);
    expect((await v(port.ackLane({ lane: "seat.text" }, who))).note).toBe("seat.text hold acknowledged");
    expect((await v(port.retryJob({ jobId: research, ceilingUsd: 5 }, who))).note).toBe("retry · attempt 2 · same route · ceiling $5");
  });

  it("re-routes a part to another lane in one transaction: cancelled, its successor on the new lane, the part moved", async () => {
    const frames = `job:part:${film}/frames`;
    const options = await v(port.rerouteOptions({ jobId: frames }));
    const google = options.find((o) => o.option.provider === "google");
    if (google === undefined) throw new Error("no Nano Banana option for frames");
    const r = await v(port.reroute({ jobId: frames, option: google.option.key }, who));
    if (r.kind !== "receipt") throw new Error("expected a receipt first");
    expect(r.receipt.lines[0]).toMatchObject({ lane: "cloud.google", provider: "google", units: 12 });
    const rev = (await v(port.loadPlan({ id: film }))).project.rev;
    const done = await v(port.reroute({ jobId: frames, option: google.option.key, token: r.receipt.token }, who));
    if (done.kind !== "done") throw new Error(`expected done, got ${done.kind}`);
    expect(done.act.jobId).toBe(`${frames}~2`);
    const all = jobs();
    expect(all.find((j) => j.id === frames)?.state).toBe("cancelled");
    expect(all.find((j) => j.id === `${frames}~2`)).toMatchObject({ lane: "cloud.google", state: "planned", producer: "frames", steer: { pin: "google" }, mode: { kind: "dry" } });
    expect(row<{ job_id: string }>("SELECT job_id FROM parts WHERE part_id = ?", `${film}/frames`)?.job_id).toBe(`${frames}~2`);
    const after = await v(port.loadPlan({ id: film }));
    expect(after.project.rev).toBe(rev + 1);
    expect(after.parts.find((p) => p.id === `${film}/frames`)).toMatchObject({ chosen: google.option.key, jobState: "planned" });
    // The successor is what the plan's dependants wait for now.
    expect((await v(port.listJobs())).find((j) => j.partId === `${film}/motion`)?.after).toEqual([`${frames}~2`]);
  });

  it("answers a re-route whose queue moved under its receipt with the fresh receipt, and moves nothing", async () => {
    const research = `job:part:${film}/research`;
    const options = await v(port.rerouteOptions({ jobId: research }));
    const google = options.find((o) => o.option.provider === "google");
    if (google === undefined) throw new Error("no Gemini option for research");
    const r = await v(port.reroute({ jobId: research, option: google.option.key }, who));
    if (r.kind !== "receipt") throw new Error("expected a receipt first");
    // Another launch lands on the queue between the read and the confirm.
    const other = await v(port.composerReceipt({ input: { ...article, text: "Another one." } }, who));
    await v(port.launchRun({ input: { ...article, text: "Another one." }, token: other.token }, who));
    const stale = await v(port.reroute({ jobId: research, option: google.option.key, token: r.receipt.token }, who));
    expect(stale.kind).toBe("stale");
    expect(jobs().find((j) => j.id === research)?.lane).toBe("seat.text");
    expect(jobs().some((j) => j.id === `${research}~2`)).toBe(false);
  });

  it("re-routes on the same lane and producer through the kernel's steer, keeping the job", async () => {
    const album = (await v(port.compose({ recipe: "album-video", takeId: "st-salt" }, who))).id;
    const p = await v(port.loadPlan({ id: album }));
    expect(p.project.title).toBe("Salt lines — music video");
    const receipt = await v(port.planReceipt({ id: album }, who));
    await v(port.launchPlan({ id: album, rev: p.project.rev, token: receipt.token }, who));
    const render = `job:part:${album}/render`;
    const draft = (await v(port.rerouteOptions({ jobId: render }))).find((o) => o.option.model === "libx264-draft");
    if (draft === undefined) throw new Error("no draft encode option");
    const r = await v(port.reroute({ jobId: render, option: draft.option.key }, who));
    if (r.kind !== "receipt") throw new Error("expected a receipt first");
    const done = await v(port.reroute({ jobId: render, option: draft.option.key, token: r.receipt.token }, who));
    if (done.kind !== "done") throw new Error(`expected done, got ${done.kind}`);
    expect(done.act.jobId).toBe(render);
    expect(jobs().find((j) => j.id === render)).toMatchObject({ lane: "box.render", state: "planned", steer: {} });
    expect(jobs().some((j) => j.id === `${render}~2`)).toBe(false);
    expect((await v(port.loadPlan({ id: album }))).parts.find((x) => x.id === `${album}/render`)).toMatchObject({ chosen: draft.option.key });
    expect(existsSync(path.join(ROOT, "store.sqlite"))).toBe(true);
  });
});
