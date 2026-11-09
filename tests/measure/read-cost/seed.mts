// THE READ-COST WORLD - a studio built in a temp root for tests/measure/read-cost.mts to read.
//
//   v1 stores   the fixture universe's own generators (pipeline/fixtures/*.ts: sound, publish,
//               foundry, work, scout), written under <root>/fixtures-out because the process's
//               cwd IS the root; then the forge, extract and Dojo run directories are cloned up
//               to the stated counts (each clone's JSON has the source id rewritten to its own),
//               because the listing walks are what the brief suspects and six runs hide them.
//   ledger      the v1 world projected once by the real sync (syncV1), then `events` synthetic
//               events spread over `days` days to now - a mix of actor kinds, types and lanes,
//               several per run id, so the Ledger's strip, facets and Runs' window have rows.
//   jobs        `jobs` imported terminal jobs through the kernel's own door (recordImportedJobIn),
//               plus every 10th left queued, across the resource lanes.
//
// After the seed the sync claim is held for a day by this script, so a loader's freshLedger()
// takes its real claim check and never starts a background sync mid-measurement: what is timed
// is the read a refresh makes while a sync is not running (the common case - SYNC_INTERVAL_MS).

import { cpSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Store } from "@gt/kernel/store";

export type Sizes = {
  readonly events: number;
  readonly days: number;
  readonly jobs: number;
  readonly forge: number;
  readonly extract: number;
  readonly training: number;
};

const GENERATORS = ["sound", "publish", "foundry", "work", "scout"] as const;

/** Rewrite `from` to `to` in every .json file under `dir` (a cloned run's own id). */
function renameIn(dir: string, from: string, to: string): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) renameIn(p, from, to);
    else if (e.name.endsWith(".json")) {
      const text = readFileSync(p, "utf8");
      if (text.includes(from)) writeFileSync(p, text.split(from).join(to), "utf8");
    }
  }
}

function backdate(dir: string, when: Date): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) backdate(p, when);
    else utimesSync(p, when, when);
  }
}

/** Clone the run directories under `dir` round-robin until it holds `want`. Returns the count. */
function cloneUp(dir: string, want: number): number {
  const seeds = readdirSync(dir).filter((n) => statSync(path.join(dir, n)).isDirectory());
  if (seeds.length === 0) return 0;
  let have = seeds.length;
  for (let i = 0; have < want; i++) {
    const src = seeds[i % seeds.length] ?? "";
    const id = `${src}-c${String(i).padStart(4, "0")}`;
    cpSync(path.join(dir, src), path.join(dir, id), { recursive: true });
    renameIn(path.join(dir, id), src, id);
    have++;
  }
  return have;
}

const TYPES = ["run.start", "run.end", "commit", "verdict.keep", "verdict.cut", "job.enqueued", "job.done", "publish.scheduled", "publish.done", "spend.booked", "strip.rendered", "article.gate"] as const;
const LANES = ["image.forge", "image.extract", "video.clip", "audio.suno", "publish.youtube", "text.article", null] as const;
const KINDS = ["machine", "machine", "machine", "agent", "operator"] as const;

export async function seedWorld(root: string, sizes: Sizes, now: number): Promise<{ store: Store; counts: Record<string, number>; ms: number }> {
  const t0 = Date.now();
  for (const name of GENERATORS) {
    const mod = (await import(`../../../pipeline/fixtures/${name}.ts`)) as { generate: () => string };
    mod.generate();
  }
  const out = path.join(root, "fixtures-out");
  const counts: Record<string, number> = {
    forge: cloneUp(path.join(out, "runs"), sizes.forge),
    extract: cloneUp(path.join(out, "extract"), sizes.extract),
    training: cloneUp(path.join(out, "training"), sizes.training),
  };
  // Every v1 file an hour old, as a studio's settled runs are: a file written moments ago is one
  // a reader may not trust from cache yet (lib/foundry/runStore.ts RACY_MS), and a world written
  // in the seconds before the timing would measure only that edge.
  backdate(out, new Date(now - 3_600_000));

  const { kernel } = await import("../../../lib/kernelProcess.ts");
  const { V1_SOURCES } = await import("../../../lib/ledger/v1/sources.ts");
  const { SYNC_CLAIM, syncV1, v1Ctx } = await import("../../../lib/ledger/v1/sync.ts");
  const { finishClaim, takeClaim } = await import("@gt/kernel/ingest");
  const { append } = await import("@gt/kernel/events");
  const { enqueueIn, recordImportedJobIn } = await import("@gt/kernel/job");
  const { RESOURCE_LANES } = await import("@gt/domain/lane.capacity");

  const k = kernel();
  if (!k.ok) throw new Error(`read-cost: the temp store would not open: ${k.error.message}`);
  const store = k.value.store;

  const owner = "read-cost/seed";
  const DAY = 86_400_000;
  const claim = takeClaim(store, SYNC_CLAIM, owner, DAY);
  if (!claim.ok || !claim.value.won) throw new Error("read-cost: could not take the sync claim on a fresh store");
  const synced = await syncV1(store, V1_SOURCES, v1Ctx(new Date(now)));
  if (!synced.ok) throw new Error(`read-cost: the seed sync failed: ${synced.error.message}`);
  // Held for a day: freshLedger() checks it (its real cost) and never wins it while we measure.
  const held = finishClaim(store, SYNC_CLAIM, owner, DAY, { seed: true });
  if (!held.ok) throw new Error(`read-cost: ${held.error.message}`);

  const span = sizes.days * DAY;
  const BATCH = 2000;
  for (let i = 0; i < sizes.events; i += BATCH) {
    const r = store.tx((t) => {
      for (let j = i; j < Math.min(i + BATCH, sizes.events); j++) {
        // Deterministic spread, newest last; every 97th lands exactly on a UTC midnight so the
        // strip's day edges are exercised by the same world the timing reads.
        const back = j % 97 === 0 ? Math.floor(((sizes.events - j) / sizes.events) * sizes.days) * DAY + (now % DAY) : Math.floor(((sizes.events - j) / sizes.events) * span);
        const at = new Date(now - back).toISOString();
        const lane = LANES[j % LANES.length];
        append(t, {
          actor: { kind: KINDS[j % KINDS.length] ?? "machine", id: `bench-${j % 7}` },
          type: TYPES[j % TYPES.length] ?? "commit",
          subject: { kind: "run", id: `r-${j % 900}` },
          ...(lane === null || lane === undefined ? {} : { lane }),
          data: { runId: `r-${j % 900}`, projectId: `p-${j % 40}` },
          occurredAt: at,
          atSrc: "recorded",
          key: `bench:${j}:x`,
        });
      }
      return true;
    });
    if (!r.ok) throw new Error(`read-cost: event seed failed: ${r.error.message}`);
  }

  const actor = { kind: "machine" as const, id: "read-cost" };
  const jobs = store.tx((t) => {
    for (let i = 0; i < sizes.jobs; i++) {
      const lane = RESOURCE_LANES[i % RESOURCE_LANES.length] ?? "gpu.local";
      const base = { id: `job-bench-${i}`, of: { kind: "run" as const, id: `r-${i % 900}` }, producer: "bench", lane };
      if (i % 10 === 0) enqueueIn(t, base, actor);
      else recordImportedJobIn(t, { ...base, units: 4 }, actor);
    }
    return sizes.jobs;
  });
  if (!jobs.ok) throw new Error(`read-cost: job seed failed: ${jobs.error.message}`);
  const total = store.read((r) => r.get("SELECT count(*) AS n FROM events"));
  counts["events"] = total.ok ? Number(total.value?.["n"] ?? 0) : -1;
  counts["jobs"] = sizes.jobs;
  return { store, counts, ms: Date.now() - t0 };
}
