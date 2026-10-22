import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { PROFILER, type EngineProfile, type ResourceCost } from "@gt/domain/resource";
import { append } from "../events.ts";
import type { ModuleMigrations } from "../migrate.ts";
import type { Reader, Store, Tx } from "../store.ts";

// THE ENGINE PROFILES - what each engine on this box was MEASURED to cost (spark game-3d-assets,
// WP1), the numbers admission charges a job by (@gt/domain/resource `admit`).
//
// One row per engine, replaced whole by the next profile run: a profile is the engine's footprint
// as of its latest measurement, not a history - the history is the `engine.profiled` events, one
// per run, each carrying the figures it replaced. Hand-declared costs were the alternative (the
// Lynx bench's numbers, typed in) and were refused: a bench run on another day with other weights
// is a guess with a citation, and the 4090 box's numbers already failed to transfer here.

export const resourcesMigrations: ModuleMigrations = {
  module: "resources",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE engine_profiles (
  engine TEXT PRIMARY KEY,
  vram_gb REAL NOT NULL,
  commit_gb REAL NOT NULL,
  cpu_cores REAL NOT NULL,
  samples INTEGER NOT NULL,
  measured_at TEXT NOT NULL,
  sample TEXT NOT NULL
) WITHOUT ROWID;
CREATE TABLE profile_requests (
  run_id TEXT PRIMARY KEY,
  engine TEXT NOT NULL,
  argv TEXT NOT NULL,
  cwd TEXT,
  label TEXT NOT NULL,
  at TEXT NOT NULL
) WITHOUT ROWID;`,
    },
  ],
};

const ENGINE_RE = /^[a-z][a-z0-9-]*$/;

const rowSchema = z.object({
  engine: z.string(),
  vram_gb: z.number(),
  commit_gb: z.number(),
  cpu_cores: z.number(),
  samples: z.number().int(),
  measured_at: z.string(),
  sample: z.string(),
});

/** Every profiled engine, by name. An engine absent here has no profile and runs alone. */
export function readProfiles(r: Reader): Map<string, EngineProfile> {
  const out = new Map<string, EngineProfile>();
  for (const raw of r.all("SELECT engine, vram_gb, commit_gb, cpu_cores, samples, measured_at, sample FROM engine_profiles ORDER BY engine")) {
    const p = parseAt("engine profile", rowSchema, raw);
    if (!p.ok) throw p.error;
    const v = p.value;
    out.set(v.engine, { engine: v.engine, cost: { vramGb: v.vram_gb, commitGb: v.commit_gb, cpuCores: v.cpu_cores }, samples: v.samples, measuredAt: v.measured_at, sample: v.sample });
  }
  return out;
}

/** The costs alone, which is all admission reads. */
export function costsOf(profiles: ReadonlyMap<string, EngineProfile>): Map<string, ResourceCost> {
  return new Map([...profiles].map(([k, p]) => [k, p.cost]));
}

function checkEngine(engine: string): void {
  if (!ENGINE_RE.test(engine)) throw new AppError("invalid", `engine "${engine}" is not a lowercase name`);
  // Profiled, the profiler would share the box with what it measures (@gt/domain/resource PROFILER).
  if (engine === PROFILER) throw new AppError("invalid", `"${PROFILER}" names the profiler itself, which always runs alone and is never profiled`);
}

const finite = (x: number): boolean => Number.isFinite(x) && x >= 0;

/** Record (or replace) an engine's profile, and the event that says so, in one transaction. */
export function recordProfileIn(t: Tx, p: EngineProfile, actor: Actor): void {
  checkEngine(p.engine);
  const c = p.cost;
  if (!finite(c.vramGb) || !finite(c.commitGb) || !finite(c.cpuCores)) throw new AppError("invalid", `engine ${p.engine}: a cost is a finite, non-negative figure (${JSON.stringify(c)})`);
  if (!Number.isInteger(p.samples) || p.samples < 1) throw new AppError("invalid", `engine ${p.engine}: a profile is measured over at least one sample, not ${p.samples}`);
  const prior = readProfiles(t).get(p.engine);
  t.run(
    `INSERT INTO engine_profiles (engine, vram_gb, commit_gb, cpu_cores, samples, measured_at, sample) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(engine) DO UPDATE SET vram_gb = excluded.vram_gb, commit_gb = excluded.commit_gb, cpu_cores = excluded.cpu_cores,
       samples = excluded.samples, measured_at = excluded.measured_at, sample = excluded.sample`,
    p.engine, c.vramGb, c.commitGb, c.cpuCores, p.samples, p.measuredAt, p.sample,
  );
  append(t, {
    actor,
    type: "engine.profiled",
    subject: { kind: "engine", id: p.engine },
    data: { ...c, samples: p.samples, sample: p.sample, measuredAt: p.measuredAt, ...(prior === undefined ? {} : { replaced: { ...prior.cost, measuredAt: prior.measuredAt } }) },
  });
}

export function recordProfile(store: Store, p: EngineProfile, actor: Actor): Result<void> {
  return store.tx((t) => recordProfileIn(t, p, actor));
}

// WHAT A PROFILE JOB RUNS. A job record carries no input of its own (the run it serves is named
// by `of`, and the run's terms live with the run), so a profile run's command is a row here,
// written in the SAME transaction as its job: the job is a durable record first, and a job whose
// command was lost would be a job that can only fail.

/** One profiling run's terms: the engine it measures and the command that exercises it. */
export type ProfileRequest = { readonly runId: string; readonly engine: string; readonly argv: readonly string[]; readonly cwd?: string; readonly label: string };

const requestRow = z.object({ run_id: z.string(), engine: z.string(), argv: z.string(), cwd: z.string().nullable(), label: z.string() });

export function requestProfileIn(t: Tx, req: ProfileRequest): void {
  checkEngine(req.engine);
  if (req.argv.length === 0 || req.argv.some((a) => typeof a !== "string")) throw new AppError("invalid", "a profile runs a command: argv names at least the program");
  if (t.get("SELECT 1 AS x FROM profile_requests WHERE run_id = ?", req.runId) !== undefined) throw new AppError("conflict", `profile run ${req.runId} already exists`);
  t.run("INSERT INTO profile_requests (run_id, engine, argv, cwd, label, at) VALUES (?, ?, ?, ?, ?, ?)", req.runId, req.engine, JSON.stringify(req.argv), req.cwd ?? null, req.label, t.at);
}

export function readProfileRequest(r: Reader, runId: string): ProfileRequest {
  const raw = r.get("SELECT run_id, engine, argv, cwd, label FROM profile_requests WHERE run_id = ?", runId);
  if (raw === undefined) throw new AppError("not-found", `no profile run ${runId}`);
  const p = parseAt("profile request", requestRow, raw);
  if (!p.ok) throw p.error;
  const argv = parseJsonAt("profile argv", z.array(z.string()).min(1), p.value.argv);
  if (!argv.ok) throw argv.error;
  return { runId: p.value.run_id, engine: p.value.engine, argv: argv.value, ...(p.value.cwd === null ? {} : { cwd: p.value.cwd }), label: p.value.label };
}
