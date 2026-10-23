// LANE — RUNS SHOWS EVERY LIVE JOB THE v1 UIs SHOW (Phase 2 exit, plan §6).
//
// Over the fixture universe, generated fresh into a temp directory, this takes the live read
// the operator's CLI prints (`node pipeline/ledger-sync.mts live`, which is `liveJobs` over
// lib/ledger/v1/sources.ts - the same call the Runs page makes), runs it through Runs' OWN
// model and view (app/(studio)/projects/runs/_runs/model.ts, view.ts - what the page draws),
// and compares the bars it would draw, source by source, with what each v1 UI's own live
// predicate selects from the same files on disk. Two readings that share no code: the
// adapters' zod doors and projections on one side; the raw files and v1's exported state sets
// (lib/foundry/plant LIVE, EXTRACT_LIVE, cycleKind; lib/articles WORKING, frozen below; lib/sound
// isLiveJob; lib/turns LIVE; ...) on the other. A job the adapter drops, or one Runs' model or
// view filters out, is a missing id named by its source.
//
// THE SOURCE LIST IS THE REGISTRY'S, not this file's: the sources come from the CLI's own
// per-source report, which walks V1_SOURCES. A source registered there with no predicate here
// is a RED probe ("no v1 predicate for <source>"), so a new source cannot ride along unchecked.
// The other direction holds too: every predicate here must find live work in the fixtures, or
// the comparison would be 0 = 0.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import * as mv from "@/lib/sound/mv/store";
import * as suno from "@/lib/sound/suno/store";
import { LIVE as TURN_LIVE } from "@/lib/turns/ledger";

// THE v1 UIs' LIVE SETS, FROZEN HERE (Phase 6 L67). They were imported from the pages that drew
// them (app/foundry/parts.tsx, app/articles/runModel.ts), which wave C deletes. Each page only
// re-exported lib's set (lib/foundry/plant.ts, lib/articles/types.ts) - the same sets the
// adapters read - so importing lib would make the two readings above share code. Spelled out,
// they stay the second reading: what v1 drew as live, against what the adapters now say.
/** lib/foundry/plant.ts LIVE. */
const FORGE_LIVE = ["created", "annotating", "generating", "grading"];
/** lib/foundry/plant.ts EXTRACT_LIVE. */
const EXTRACT_LIVE = ["created", "reading", "grouping", "replicating", "transferring"];
/** lib/foundry/plant.ts cycleKind(s) === "live": every cycle status but the gate and the two ends. */
const CYCLE_LIVE = ["planning", "generating", "judging"];
/** lib/articles/types.ts WORKING. */
const ARTICLE_WORKING = ["queued", "researching", "drafting", "critiquing", "checking", "approved", "landing"];

const ROOT = process.cwd();
const CLI = join(ROOT, "pipeline", "ledger-sync.mts");
const dir = mkdtempSync(join(tmpdir(), "gt-runs-live-"));
const OUT = join(dir, "fixtures-out");

test.afterAll(() => rmSync(dir, { recursive: true, force: true }));
test.describe.configure({ mode: "serial" });

type Json = Record<string, unknown>;

function cli(...args: string[]): { status: number | null; doc: Json; stderr: string } {
  const env: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_GRAVITONE_DATA: "fixtures" };
  // The node lane points these at its own temp stores (playwright.config.ts); this probe's
  // universe is the temp directory's fixtures-out/, for the CLI and the predicates alike.
  for (const k of ["GRAVITONE_STORE_PATH", "GPU_LEASE_DIR", "SPEND_STORE"]) delete env[k];
  const r = spawnSync(process.execPath, [CLI, ...args, "--json"], { cwd: dir, env, encoding: "utf8", timeout: 90_000 });
  const doc = r.stdout.trim() === "" ? {} : (JSON.parse(r.stdout) as Json);
  return { status: r.status, doc, stderr: r.stderr };
}

const readJson = (p: string): Json => JSON.parse(readFileSync(p, "utf8")) as Json;
/** Every `<sub>/<id>/<file>` manifest under the fixture universe. */
const manifests = (sub: string, file: string): Json[] => {
  const root = join(OUT, sub);
  return existsSync(root) ? readdirSync(root).flatMap((id) => (existsSync(join(root, id, file)) ? [readJson(join(root, id, file))] : [])) : [];
};
/** Every `<sub>/*.json` record. */
const records = (sub: string): Json[] => {
  const root = join(OUT, sub);
  return existsSync(root) ? readdirSync(root).filter((f) => f.endsWith(".json")).map((f) => readJson(join(root, f))) : [];
};
const str = (v: unknown): string => (typeof v === "string" ? v : String(v));
/** Run a v1 sound reader against the fixture universe's sound store, restoring the env after. */
async function withSoundDir<T>(read: () => Promise<T>): Promise<T> {
  const was = process.env["SOUND_STORE_DIR"];
  process.env["SOUND_STORE_DIR"] = join(OUT, "sound");
  try {
    return await read();
  } finally {
    if (was === undefined) delete process.env["SOUND_STORE_DIR"];
    else process.env["SOUND_STORE_DIR"] = was;
  }
}

/**
 * Each source's live set, by v1's OWN rule over the raw files. Null: the source carries no
 * live jobs by construction (its live work is slots or money, compared below or not at all).
 */
function predicates(): Record<string, (() => string[] | Promise<string[]>) | null> {
  return {
    forge: () => manifests("runs", "run.json").filter((m) => FORGE_LIVE.includes(str(m["status"]))).map((m) => str(m["id"])),
    extract: () => manifests("extract", "run.json").filter((m) => EXTRACT_LIVE.includes(str(m["status"]))).map((m) => str(m["id"])),
    dojo: () => manifests("training", "cycle.json").filter((m) => CYCLE_LIVE.includes(str(m["status"]))).map((m) => str(m["id"])),
    // app/foundry/StripsView.tsx: a strip run is live while `status === "running"`.
    // A scout night is a pile of finished work; its live jobs show on Runs from the job store.
    scout: null,
    strips: () => manifests("strips", "run.json").filter((m) => m["status"] === "running").map((m) => str(m["id"])),
    articles: () => manifests("articles", "run.json").filter((m) => ARTICLE_WORKING.includes(str(m["status"]))).map((m) => str(m["id"])),
    // v1's own readers (SOUND_STORE_DIR is read per call, lib/sound/store.ts) and live rules.
    suno: async () => withSoundDir(async () => (await suno.readSuno()).jobs.filter(suno.isLiveJob).map((j) => j.id)),
    mv: async () => withSoundDir(async () => (await mv.readMv()).jobs.filter(mv.isLiveJob).map((j) => j.id)),
    turns: () => records("turns").filter((r) => [...TURN_LIVE].some((x) => x === r["status"])).map((r) => str(r["id"])),
    // lib/imaging/video: a clip renders while queued or rendering (the clip runner's own two).
    clips: () => records("clips").filter((r) => r["status"] === "queued" || r["status"] === "rendering").map((r) => str(r["clipId"])),
    // The card's holder is the kernel lease now (Phase 4 L27): it is not a v1 store.
    gpu: null,
    publish: null,
    spend: null,
    // The sound shelf (Phase 3): a take is made whole by one call, so nothing runs.
    sound: null,
  };
}

let sources: string[] = [];

test("seeds the fixture universe and lists the registry's sources", () => {
  const seeded = cli("seed-fixtures");
  expect(seeded.status, seeded.stderr).toBe(0);
  const synced = cli("sync", "--fixtures", "--store", join(dir, "runs.sqlite"));
  expect(synced.status, synced.stderr).toBe(0);
  sources = (synced.doc["sources"] as { source: string }[]).map((r) => r.source);
  expect(sources.length, "the registry walked no source").toBeGreaterThanOrEqual(3);
});

test("every live job each v1 UI calls live is a bar Runs draws, and nothing else is", async () => {
  const r = cli("live", "--fixtures");
  expect(r.status, r.stderr).toBe(0);
  const live = r.doc as import("@/app/(studio)/projects/runs/_runs/model").LiveReadInput;
  // Imported here, not at the top: @gt/* are ES modules (ledger-reconcile.probe.spec.ts says why).
  const { buildRuns, liveKeys } = await import("@/app/(studio)/projects/runs/_runs/model");
  const { barsOf, blockedOf, depsOf } = await import("@/app/(studio)/projects/runs/_runs/view");
  const model = buildRuns({ now: Date.now(), live, kernel: [], ledger: [] });
  const drawn = new Set(barsOf(model, blockedOf(model, depsOf(model))).map((b) => b.id));
  const shown = liveKeys(model).filter((k) => drawn.has(k));

  const table = predicates();
  for (const source of sources) {
    expect(source in table, `no v1 predicate for source "${source}" - add its v1 UI's live rule to this probe`).toBe(true);
    const pred = table[source];
    const got = shown.filter((k) => k.startsWith(`${source}:`)).map((k) => k.slice(source.length + 1)).sort();
    if (pred === null || pred === undefined) {
      expect(got, `${source} carries no live jobs`).toEqual([]);
      continue;
    }
    const want = (await pred()).sort();
    expect(want.length, `${source}: the fixtures must hold live work for this to prove anything`).toBeGreaterThan(0);
    expect(got, `${source}: Runs' bars vs v1's own live set`).toEqual(want);
  }
});

test("every unsettled Calendar slot is a pin on the Calendar row", async () => {
  test.skip(!sources.includes("publish"), "the publish source is not registered yet");
  const r = cli("live", "--fixtures");
  const live = r.doc as import("@/app/(studio)/projects/runs/_runs/model").LiveReadInput;
  const { buildRuns } = await import("@/app/(studio)/projects/runs/_runs/model");
  const { pinsOf } = await import("@/app/(studio)/projects/runs/_runs/view");
  const pins = pinsOf(buildRuns({ now: Date.now(), live, kernel: [], ledger: [] })).map((p) => p.id.replace(/^publish:/, "")).sort();
  const file = join(OUT, "publish", "schedule.json");
  const slots = existsSync(file) ? ((readJson(file)["slots"] ?? []) as Json[]) : [];
  // v1's calendar settles a slot at published or cancelled; everything else still needs the operator or the clock.
  const want = slots.filter((s) => s["status"] !== "published" && s["status"] !== "cancelled").map((s) => str(s["id"])).sort();
  expect(want.length, "the fixtures must hold unsettled slots").toBeGreaterThan(0);
  expect(pins).toEqual(want);
});
