// LANE — THE DEPLOYMENT-CELL MATRIX (dynamic, CIP-B).
//
// Every API route on disk, plus `capabilities()`, `engineStatus()` and
// `localPosture()`, judged in every declared deployment cell
// (tests/golden-path/_cells.ts). The routes are DERIVED from the filesystem and
// their methods from each module's own exports, so a route that lands tomorrow
// is driven in every cell by existing. The one hand-written part is what each
// route is EXPECTED to answer, and a route with no expectation fails by name.
//
// The invariants:
//   1. a route that answers "not ready" in a cell (no key, local binaries
//      forbidden, no engine) must sit behind a capability that is OFF in that
//      cell — otherwise it is the button lib/capabilities.ts exists to prevent:
//      visible, enabled, and answering 503;
//   2. a managed cell starts NO process, of anything, from any route;
//   3. in a cell with no secret and no dev-auth, every gated route answers 401;
//   4. a route file with no cell expectation fails the lane, naming the file;
//   5. .env.example's hosted block equals HOSTED_CAPS, variable by variable;
//   7. after the lane, `process.env` deep-equals what it was before.
// Number 6 (engineStatus ⇔ /api/recalibrate's no-engine answer) is not here:
// see the note at the bottom of this file.
//
// EACH CELL IS A FRESH DEPLOYMENT. Before a cell runs, every app/ and lib/
// module is dropped from the require cache and the routes are loaded again,
// because several modules answer once per process and cache it — measured on
// the first run of this lane: /api/publish/channels probes for ffmpeg on its
// first call, so whichever cell ran first paid the spawn and every later cell
// read "no spawns" off a warm cache. A per-process fact is judged per cell or
// it is not judged.
//
// NOTHING HERE CAN REACH A VENDOR OR START A PROCESS. Three instruments, for
// the whole of each cell:
//   · `fetch` is a stub that records the host and refuses;
//   · every child-process door is wrapped: ChildProcess.prototype.spawn (which
//     spawn, execFile, exec, fork and a module-load `promisify(execFile)` all
//     reach) and the sync exports. The attempt is recorded, and anything that
//     is not `claude` is refused before a process exists;
//   · `claude` resolves to the CIP-A stand-in (withFakeEngine), which logs its
//     own invocations — the belt under the spy.
// Bodies are `{}` and dynamic ids name nothing — the 4xx-before-dispatch shape
// imaging-auth.probe.spec.ts drives — and every store root the app lets the
// environment move is pointed at a scratch directory.
import childProcess from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR } from "@/lib/apiAuth";
import { capabilities, CAPABILITY_ROUTES, HOSTED_CAPS, type Capabilities } from "@/lib/capabilities";
import { MANAGED_MARKERS } from "@/lib/deployment";

import {
  applyCell,
  callerOf,
  cellAxes,
  CELL_SECRET,
  CELLS,
  credentialVars,
  envOf,
  nearestCell,
  storeRootVars,
  type Cell,
} from "./_cells";
import { cliArgsFingerprint, FAKE_ENGINE_ENV, keepEnv, stripComments, withFakeEngine, type Cassette } from "./_helpers";

const ROOT = process.cwd();
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

keepEnv([...new Set([...cellAxes(), ...storeRootVars(), ...FAKE_ENGINE_ENV])]);

/* ── the population ──────────────────────────────────────────────────────── */

/** Every `route.ts` under app/api, repo-relative with forward slashes. */
function routeFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === "route.ts") found.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  };
  walk(path.join(ROOT, "app", "api"));
  return found.sort();
}

/** The gate a route calls, read from its comment-stripped source: `money`
 *  (guardRequest on any method), `access` (guardAccessOnly / checkAccess
 *  only) or `public` (no door at all). */
type Door = "money" | "access" | "public";
function doorOf(rel: string): Door {
  const src = stripComments(readFileSync(path.join(ROOT, rel), "utf8"));
  if (/\bguardRequest\s*\(/.test(src)) return "money";
  if (/\b(guardAccessOnly|checkAccess)\s*\(/.test(src)) return "access";
  return "public";
}

/** The URL path and route params for a route file, every dynamic segment
 *  filled with a value that names nothing. */
function addressOf(rel: string): { url: string; params: Record<string, string | string[]> } {
  const params: Record<string, string | string[]> = {};
  const parts = rel
    .replace(/^app\//, "")
    .replace(/\/route\.ts$/, "")
    .split("/")
    .map((s) => {
      const catchAll = /^\[\.\.\.(\w+)\]$/.exec(s);
      if (catchAll) {
        params[catchAll[1]] = ["no-such-file"];
        return "no-such-file";
      }
      const dyn = /^\[(\w+)\]$/.exec(s);
      if (!dyn) return s;
      const v = `no-such-${dyn[1].toLowerCase()}`;
      params[dyn[1]] = v;
      return v;
    });
  return { url: `/${parts.join("/")}`, params };
}

/* ── what each route is expected to answer ───────────────────────────────── */

/**
 * THE ONE HAND-WRITTEN PART. The population and the methods are derived; what
 * a route SHOULD answer is a claim somebody has to make, so a route file with
 * no entry fails the lane by name (acceptance 4).
 *
 * `door` is checked against the route's own source. `ok` is the status class
 * an AUTHORISED caller gets, per method, for an empty body and ids that name
 * nothing: "4xx" refuses the body or the id before anything is read or spent,
 * "2xx" is a read that answers. Nothing is ever allowed a 5xx.
 *
 * `local` names the methods that spawn a local binary and therefore refuse
 * with `local-binaries-forbidden` wherever the posture forbids spawning
 * (lib/deployment.ts) — in those cells that refusal is the expected answer,
 * whatever its status, and invariant 1 then asks whether a capability hides it.
 */
type Ok = "2xx" | "4xx";
interface Expectation {
  door: Door;
  ok: Partial<Record<Method, Ok>>;
  local?: Method[];
}

const EXPECT: Record<string, Expectation> = {
  "app/api/ads/ideas/route.ts": { door: "money", ok: { GET: "2xx", POST: "4xx" } },
  "app/api/ads/render/[id]/file/route.ts": { door: "access", ok: { GET: "4xx" } },
  "app/api/ads/render/[id]/route.ts": { door: "access", ok: { GET: "4xx" } },
  "app/api/ads/render/route.ts": { door: "money", ok: { POST: "4xx" }, local: ["POST"] },
  "app/api/ads/scenarios/route.ts": { door: "money", ok: { GET: "2xx", POST: "4xx" } },
  "app/api/articles/[runId]/approve/route.ts": { door: "money", ok: { POST: "4xx" } },
  "app/api/articles/[runId]/file/[...path]/route.ts": { door: "access", ok: { GET: "4xx" } },
  "app/api/articles/[runId]/reject/route.ts": { door: "access", ok: { POST: "4xx" } },
  "app/api/articles/[runId]/resume/route.ts": { door: "money", ok: { POST: "4xx" } },
  "app/api/articles/[runId]/route.ts": { door: "access", ok: { GET: "4xx" } },
  "app/api/articles/route.ts": { door: "money", ok: { GET: "2xx", POST: "4xx" } },
  "app/api/cut/export/file/route.ts": { door: "access", ok: { GET: "4xx" } },
  "app/api/cut/export/route.ts": { door: "money", ok: { POST: "4xx" }, local: ["POST"] },
  "app/api/foundry/extract/[id]/commit/route.ts": { door: "access", ok: { GET: "4xx", POST: "4xx" } },
  "app/api/foundry/extract/[id]/route.ts": { door: "access", ok: { GET: "4xx" } },
  "app/api/foundry/extract/[id]/step/route.ts": { door: "money", ok: { POST: "4xx" } },
  "app/api/foundry/extract/[id]/verdicts/route.ts": { door: "access", ok: { PUT: "4xx" } },
  "app/api/foundry/extract/route.ts": { door: "money", ok: { GET: "2xx", POST: "4xx" } },
  "app/api/foundry/file/route.ts": { door: "access", ok: { GET: "4xx" } },
  "app/api/foundry/runs/[id]/commit/route.ts": { door: "access", ok: { GET: "4xx", POST: "4xx" } },
  "app/api/foundry/runs/[id]/route.ts": { door: "access", ok: { GET: "4xx" } },
  "app/api/foundry/runs/[id]/verdicts/route.ts": { door: "access", ok: { PUT: "4xx" } },
  "app/api/foundry/runs/route.ts": { door: "access", ok: { GET: "2xx" } },
  "app/api/foundry/styles/route.ts": { door: "access", ok: { GET: "2xx" } },
  "app/api/foundry/training/[id]/commit/route.ts": { door: "access", ok: { POST: "4xx" } },
  "app/api/foundry/training/[id]/route.ts": { door: "access", ok: { GET: "4xx" } },
  "app/api/foundry/training/[id]/verdicts/route.ts": { door: "access", ok: { PUT: "4xx" } },
  "app/api/foundry/training/route.ts": { door: "access", ok: { GET: "2xx" } },
  "app/api/frames/route.ts": { door: "money", ok: { POST: "4xx" } },
  "app/api/imaging/budget/route.ts": { door: "access", ok: { GET: "2xx" } },
  "app/api/imaging/edit/route.ts": { door: "money", ok: { POST: "4xx" } },
  "app/api/imaging/generate/route.ts": { door: "money", ok: { POST: "4xx" } },
  "app/api/imaging/pricing/route.ts": { door: "public", ok: { GET: "2xx" } },
  "app/api/imaging/recognize/route.ts": { door: "money", ok: { POST: "4xx" } },
  "app/api/motion/direct/route.ts": { door: "money", ok: { POST: "4xx" } },
  "app/api/music-video/export/file/route.ts": { door: "access", ok: { GET: "4xx" } },
  "app/api/music-video/export/route.ts": { door: "money", ok: { POST: "4xx" }, local: ["POST"] },
  "app/api/music/compose/route.ts": { door: "money", ok: { POST: "4xx" } },
  "app/api/music/generate/route.ts": { door: "money", ok: { POST: "4xx" } },
  "app/api/music/plan/route.ts": { door: "money", ok: { POST: "4xx" } },
  "app/api/music/pricing/route.ts": { door: "public", ok: { GET: "2xx" } },
  "app/api/music/sfx/route.ts": { door: "money", ok: { POST: "4xx" } },
  "app/api/publish/channels/route.ts": { door: "access", ok: { GET: "2xx" } },
  "app/api/publish/exports/route.ts": { door: "access", ok: { GET: "2xx" } },
  "app/api/publish/metrics/refresh/route.ts": { door: "access", ok: { POST: "2xx" } },
  "app/api/publish/metrics/route.ts": { door: "access", ok: { GET: "2xx" } },
  "app/api/publish/schedule/[id]/route.ts": { door: "access", ok: { PATCH: "4xx", DELETE: "4xx" } },
  "app/api/publish/schedule/route.ts": { door: "access", ok: { GET: "2xx", POST: "4xx" } },
  "app/api/recalibrate/route.ts": { door: "money", ok: { POST: "4xx" } },
  "app/api/research/route.ts": { door: "money", ok: { GET: "2xx", POST: "4xx" } },
  "app/api/script/route.ts": { door: "money", ok: { POST: "4xx" } },
  "app/api/sound/generate/route.ts": { door: "money", ok: { POST: "4xx" } },
  "app/api/sound/groups/route.ts": { door: "access", ok: { GET: "2xx", PUT: "4xx" } },
  "app/api/sound/hunts/[id]/lesson/route.ts": { door: "money", ok: { POST: "4xx" } },
  "app/api/sound/hunts/[id]/route.ts": { door: "access", ok: { PATCH: "4xx" } },
  "app/api/sound/hunts/route.ts": { door: "money", ok: { GET: "2xx", POST: "4xx" } },
  "app/api/sound/insights/route.ts": { door: "access", ok: { GET: "2xx" } },
  "app/api/sound/lessons/route.ts": { door: "access", ok: { GET: "2xx", POST: "4xx" } },
  "app/api/sound/takes/[id]/file/route.ts": { door: "access", ok: { GET: "4xx" } },
  "app/api/sound/takes/[id]/route.ts": { door: "access", ok: { PATCH: "4xx" } },
  "app/api/sound/takes/route.ts": { door: "access", ok: { GET: "2xx", POST: "4xx", DELETE: "4xx" } },
  "app/api/turns/[id]/cancel/route.ts": { door: "access", ok: { POST: "4xx" } },
  "app/api/turns/[id]/route.ts": { door: "access", ok: { GET: "4xx" } },
  "app/api/turns/preview/route.ts": { door: "access", ok: { POST: "4xx" } },
  "app/api/turns/route.ts": { door: "money", ok: { GET: "4xx", POST: "4xx" } },
  "app/api/video/clips/[id]/file/route.ts": { door: "access", ok: { GET: "4xx" } },
  "app/api/video/clips/[id]/route.ts": { door: "access", ok: { GET: "4xx" } },
  "app/api/video/clips/route.ts": { door: "money", ok: { GET: "2xx", POST: "4xx" } },
};

/** Answer codes that mean "this deployment cannot do it", as opposed to "your
 *  request was wrong" — the codes invariant 1 is about. */
const NOT_READY = new Set([
  "no-key",
  "not-configured",
  "local-binaries-forbidden",
  "policy-forbidden",
  "managed-platform",
  "not-installed",
  "not-logged-in",
  "no-engine",
]);

/**
 * KNOWN FINDINGS, recorded rather than rediscovered. Each is a real gap this
 * lane found on its first run (2026-10-06) whose fix is outside its write set.
 * An entry is a claim with a reason, not an exemption nobody sees: it is
 * re-checked every run, and an entry that stops being true fails as stale, so
 * the fix cannot land without the record being taken down with it.
 */
const KNOWN_UNHIDDEN_REFUSALS: Record<string, string> = {
  "app/api/cut/export/route.ts":
    "the Cut's animatic export spawns ffmpeg; no capability covers it, so a hosted deployment shows the export and answers 403 local-binaries-forbidden",
  "app/api/music-video/export/route.ts":
    "the music-video export spawns Chromium and ffmpeg; no capability covers it, so a hosted deployment shows it and answers 503 local-binaries-forbidden",
  "app/api/ads/render/route.ts":
    "the ads Finish render spawns ffmpeg and a headless browser; no capability covers it, so a hosted deployment shows it and answers 503 local-binaries-forbidden",
};

/** Spawns a managed cell is known to make, by the route that makes them. */
const KNOWN_MANAGED_SPAWNS: Record<string, { pattern: RegExp; why: string }> = {
  "app/api/publish/channels/route.ts": {
    pattern: /\b(where|which) (ffmpeg|ffprobe)\b/,
    why: "lib/publish/channels.ts probes PATH for ffmpeg/ffprobe through a shell on the first readiness read, whatever the posture - and `publish` is off in every hosted cell, so the probe answers a question the deployment has already ruled out",
  },
};

/** Bodies that get each capability route PAST validation, so a "not ready"
 *  answer is observable (an empty body is refused before the key is read).
 *  The key is a sentinel and `fetch` refuses, so "past validation" is as far
 *  as any of them gets. */
const READY_BODIES: Record<string, unknown> = {
  "app/api/music/generate/route.ts": {
    title: "Cell probe cue",
    intent: "a calm bed under a single scene",
    bpm: 90,
    picture: { projectTitle: "Cell probe", scenes: [{ index: 0, slug: "one", mood: "calm", startS: 0, durS: 5 }] },
  },
  "app/api/music/compose/route.ts": { prompt: "a calm piano bed", lengthMs: 5000 },
  "app/api/music/sfx/route.ts": { text: "a door closes softly", durationSeconds: 2 },
};

/* ── the instruments ─────────────────────────────────────────────────────── */

interface Spawned {
  line: string;
  passed: boolean;
}

/** True when a spawn's command line is the `claude` door — the only binary the
 *  lane lets start, because withFakeEngine has put the stand-in first on PATH. */
const isClaude = (line: string): boolean => /(^|[\\/\s"])claude(\.cmd)?(["\s]|$)/.test(line);

/**
 * Wrap every child-process door for the duration of `fn`. Async spawns all
 * reach ChildProcess.prototype.spawn — including a `promisify(execFile)`
 * captured at module load (lib/adRender.ts, lib/export/headless.ts), which a
 * patch of the export alone would miss. The sync doors are patched on the
 * module, which the compiled route code reads by property at call time, and
 * synced into the ESM namespace for anything that imported it natively.
 */
async function withSpawnSpy<T>(fn: (spawned: Spawned[]) => Promise<T>): Promise<T> {
  const spawned: Spawned[] = [];
  const proto = childProcess.ChildProcess.prototype as unknown as { spawn: (o: { file: string; args?: string[] }) => unknown };
  const mod = childProcess as unknown as Record<string, unknown>;
  const SYNC = ["spawnSync", "execSync", "execFileSync"] as const;
  const realSpawn = proto.spawn;
  const realSync = Object.fromEntries(SYNC.map((n) => [n, mod[n]]));
  const refuse = (what: string) =>
    Object.assign(new Error(`spawn ${what} ENOENT (refused by the deployment-cell lane)`), { code: "ENOENT", syscall: "spawn" });
  proto.spawn = function (this: unknown, o: { file: string; args?: string[] }) {
    const line = [o.file, ...(o.args ?? []).slice(1)].join(" ");
    const passed = isClaude(line);
    spawned.push({ line, passed });
    if (!passed) throw refuse(o.file);
    return realSpawn.call(this, o);
  };
  for (const n of SYNC)
    mod[n] = (file: unknown, args?: unknown) => {
      spawned.push({ line: [String(file), ...(Array.isArray(args) ? args : [])].join(" "), passed: false });
      throw refuse(String(file));
    };
  syncBuiltinESMExports();
  try {
    return await fn(spawned);
  } finally {
    proto.spawn = realSpawn;
    for (const n of SYNC) mod[n] = realSync[n];
    syncBuiltinESMExports();
  }
}

/** Replace `fetch` with a stub that records the host and refuses. */
async function withRefusingFetch<T>(fn: (hosts: string[]) => Promise<T>): Promise<T> {
  const hosts: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let host = url;
    try {
      host = new URL(url).host;
    } catch {
      /* a relative URL is recorded as written */
    }
    hosts.push(host);
    throw new TypeError(`fetch to ${host} refused by the deployment-cell lane`);
  }) as typeof fetch;
  try {
    return await fn(hosts);
  } finally {
    globalThis.fetch = real;
  }
}

/** A cassette with no turns: the stand-in answers `--version`, and no turn
 *  should ever reach it in this lane. */
const silentEngine = (): Cassette => ({
  name: "deployment-cells-silent",
  source: "hand-written",
  recordedAt: new Date().toISOString().slice(0, 10),
  cliVersion: "0.0.0-fake",
  cliArgsFingerprint: cliArgsFingerprint(),
  turns: [],
});

/* ── driving a route ─────────────────────────────────────────────────────── */

type Handler = (req: Request, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>;

const norm = (p: string) => path.resolve(p).toLowerCase();
const APP_ROOTS = [norm(path.join(ROOT, "app")) + path.sep, norm(path.join(ROOT, "lib")) + path.sep];

/** Drop every app/ and lib/ module from the require cache, so the next cell
 *  loads its routes the way a fresh deployment would. Returns how many. */
function freshModules(): number {
  let n = 0;
  for (const k of Object.keys(require.cache))
    if (APP_ROOTS.some((r) => norm(k).startsWith(r))) {
      delete require.cache[k];
      n++;
    }
  return n;
}

/** The module at `rel`, loaded through the runner's hook — after
 *  `freshModules()`, a fresh instance, the same one the routes now share. */
function load<T>(rel: string): T {
  // `require`, not `import()`: the runner's TypeScript hook (and with it the
  // `@/` alias every route uses) is installed on the CommonJS loader, and a
  // runtime `import()` of a path goes around it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(ROOT, rel)) as T;
}

/** The modules a cell reads besides its routes, loaded fresh with them, so
 *  the posture, the engine and the limiter a cell asks are the ones its
 *  routes use. */
function cellLib() {
  return {
    apiAuth: load<typeof import("@/lib/apiAuth")>("lib/apiAuth.ts"),
    capabilities: load<typeof import("@/lib/capabilities")>("lib/capabilities.ts").capabilities,
    localPosture: load<typeof import("@/lib/deployment")>("lib/deployment.ts").localPosture,
    engineStatus: load<typeof import("@/lib/text/router")>("lib/text/router.ts").engineStatus,
    musicBudget: load<typeof import("@/lib/music/budget")>("lib/music/budget.ts"),
  };
}

function handlersOf(rel: string): [Method, Handler][] {
  const mod = load<Record<string, unknown>>(rel);
  return METHODS.filter((m) => typeof mod[m] === "function").map((m) => [m, mod[m] as Handler]);
}

let ipSeq = 0;
const nextIp = () => {
  ipSeq++;
  return `10.${200 + (ipSeq >> 16)}.${(ipSeq >> 8) & 255}.${ipSeq & 255}`;
};

interface Answer {
  status: number;
  code: string;
}

/** The machine-readable reason a route answered with: `code`, else a string
 *  `error` (lib/adRender's shape), else `kind`. */
function codeOf(text: string): string {
  if (!text.startsWith("{")) return "";
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    for (const k of ["code", "error", "kind"]) if (typeof j[k] === "string") return j[k] as string;
  } catch {
    /* not JSON after all */
  }
  return "";
}

async function drive(rel: string, method: Method, handler: Handler, bearer: string | null, body: unknown = {}): Promise<Answer> {
  const { url, params } = addressOf(rel);
  const headers: Record<string, string> = { "x-forwarded-for": nextIp() };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  const init: RequestInit = { method, headers };
  if (method !== "GET") {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hung = new Promise<Answer>((resolve) => {
    timer = setTimeout(() => resolve({ status: 0, code: "hung past 15s" }), 15_000);
  });
  const answered = (async (): Promise<Answer> => {
    try {
      const res = await handler(new Request(`http://localhost${url}`, init), { params: Promise.resolve(params) });
      return { status: res.status, code: codeOf(await res.text().catch(() => "")) };
    } catch (e) {
      return { status: 0, code: `threw: ${(e as Error).message.slice(0, 80)}` };
    }
  })();
  try {
    return await Promise.race([answered, hung]);
  } finally {
    clearTimeout(timer);
  }
}

const classOf = (s: number): "2xx" | "4xx" | "5xx" | "none" =>
  s >= 200 && s < 300 ? "2xx" : s >= 400 && s < 500 ? "4xx" : s >= 500 ? "5xx" : "none";

/** Invariant 1, as a function so the witness below can run it on a seeded cell:
 *  a not-ready answer must sit behind a capability that is off. */
function unhidden(rel: string, a: Answer, caps: Capabilities): boolean {
  if (!NOT_READY.has(a.code)) return false;
  return !(Object.keys(CAPABILITY_ROUTES) as (keyof Capabilities)[]).some((c) => !caps[c] && CAPABILITY_ROUTES[c].includes(rel));
}

/* ── one cell ────────────────────────────────────────────────────────────── */

interface CellRun {
  lines: string[];
  failures: string[];
  summary: string;
}

async function runCell(cell: Cell, opts: { sweep: boolean } = { sweep: true }): Promise<CellRun> {
  const files = routeFiles();
  const scratch = mkdtempSync(path.join(tmpdir(), `cells-${cell.name}-`));
  const restore = applyCell(cell, scratch);
  const lines: string[] = [];
  const failures: string[] = [];
  const unhiddenSeen = new Set<string>();
  let summary = "";
  const reloaded = freshModules();
  const lib = cellLib();
  lib.apiAuth.__resetRateLimit();
  try {
    await withFakeEngine(silentEngine(), async (engine) => {
      const engineBaseline = engine.calls().length;
      await withRefusingFetch(async (hosts) => {
        await withSpawnSpy(async (spawned) => {
          const say = (who: string, m: Method, f: string, a: Answer, verdict: string) => {
            lines.push(`[cells] ${cell.name} ${who} ${m} ${addressOf(f).url} -> ${a.status} ${a.code || "-"} : ${verdict}`);
            if (verdict !== "ok" && !verdict.startsWith("known")) failures.push(`${cell.name}: ${m} ${f}: ${verdict}`);
          };
          const posture = lib.localPosture();
          if (posture !== cell.posture) failures.push(`${cell.name}: localPosture() is ${posture}, the cell declares ${cell.posture}`);
          const status = await lib.engineStatus("edit-plan");
          if (status.serving !== cell.engine)
            failures.push(
              `${cell.name}: engineStatus("edit-plan") serves ${status.serving}, the cell declares ${cell.engine} - ` +
                status.candidates.map((c) => `${c.provider}:${c.ok}`).join(" "),
            );
          const caps = lib.capabilities();
          const caller = callerOf(cell);
          const fetchesBeforeReady = () => hosts.length;
          let sweepFetches = 0;

          if (opts.sweep) {
            // ── invariant 3: the anonymous caller ──
            for (const f of files) {
              const door = doorOf(f);
              for (const [m, h] of handlersOf(f)) {
                const a = await drive(f, m, h, null);
                const verdict =
                  door === "public"
                    ? a.status === 200
                      ? "ok"
                      : `a public route answered ${a.status}`
                    : caller === "dev-auth"
                      ? a.status === 401
                        ? "dev-auth is on and the route still answered 401"
                        : "ok"
                      : a.status === 401
                        ? "ok"
                        : `a gated route answered ${a.status} ${a.code} to an anonymous caller`;
                say("anon", m, f, a, verdict);
              }
            }

            // ── the authorised caller, every method against its expectation ──
            if (caller !== "anonymous") {
              const bearer = caller === "secret" ? CELL_SECRET : null;
              for (const f of files) {
                const want = EXPECT[f];
                for (const [m, h] of handlersOf(f)) {
                  const a = await drive(f, m, h, bearer);
                  const forbidden = posture !== "available" && want?.local?.includes(m);
                  let verdict: string;
                  if (!want?.ok[m]) verdict = `no expectation for ${m} (answered ${a.status})`;
                  else if (a.status === 401) verdict = "an authorised caller got 401";
                  else if (forbidden)
                    verdict = a.code === "local-binaries-forbidden" ? "ok" : `the posture forbids spawning and it answered ${a.status} ${a.code}`;
                  else verdict = classOf(a.status) === want.ok[m] ? "ok" : `expected ${want.ok[m]}, answered ${a.status} ${a.code}`;
                  if (verdict === "ok" && unhidden(f, a, caps)) {
                    unhiddenSeen.add(f);
                    verdict = KNOWN_UNHIDDEN_REFUSALS[f]
                      ? "known: not ready and no capability hides it"
                      : `answered ${a.status} ${a.code} and no capability that is off in this cell covers it`;
                  }
                  say("auth", m, f, a, verdict);
                }
              }
            }
            sweepFetches = fetchesBeforeReady();
          }

          // ── invariant 1: a capability that is on has a route that is ready ──
          if (caller !== "anonymous") {
            const bearer = caller === "secret" ? CELL_SECRET : null;
            for (const [cap, routes] of Object.entries(CAPABILITY_ROUTES) as [keyof Capabilities, readonly string[]][])
              for (const f of routes) {
                if (!(f in READY_BODIES)) continue;
                const a = await drive(f, "POST", handlersOf(f).find(([m]) => m === "POST")![1], bearer, READY_BODIES[f]);
                const verdict = !unhidden(f, a, caps)
                  ? "ok"
                  : `capabilities().${cap} is ${caps[cap]} and the route answers ${a.status} ${a.code}`;
                say("ready", "POST", f, a, verdict);
              }
            lib.musicBudget.__resetMusicBudget();
          }

          // ── invariant 2: a managed cell starts no process ──
          const engineCalls = engine.calls().slice(engineBaseline);
          if (posture === "managed-platform") {
            const knownSeen = new Set<string>();
            for (const s of spawned) {
              const known = Object.entries(KNOWN_MANAGED_SPAWNS).find(([, k]) => k.pattern.test(s.line));
              if (known) knownSeen.add(known[0]);
              else failures.push(`${cell.name}: a managed cell spawned \`${s.line.slice(0, 100)}\``);
            }
            for (const c of engineCalls)
              failures.push(`${cell.name}: the claude stand-in was invoked in a managed cell (${c.kind} ${c.argv.join(" ").slice(0, 60)})`);
            if (opts.sweep)
              for (const k of Object.keys(KNOWN_MANAGED_SPAWNS))
                if (!knownSeen.has(k)) failures.push(`${cell.name}: KNOWN_MANAGED_SPAWNS["${k}"] no longer spawns here - remove the entry`);
          }
          if (opts.sweep && posture !== "available")
            for (const k of Object.keys(KNOWN_UNHIDDEN_REFUSALS))
              if (!unhiddenSeen.has(k)) failures.push(`${cell.name}: KNOWN_UNHIDDEN_REFUSALS["${k}"] is hidden or ready now - remove the entry`);

          // No empty body in any cell reaches a vendor: each is refused first.
          for (const h of hosts.slice(0, sweepFetches)) failures.push(`${cell.name}: an empty-body request reached for ${h}`);

          const on = (Object.keys(caps) as (keyof Capabilities)[]).filter((k) => caps[k]);
          summary =
            `[cells] ${cell.name}: posture=${posture} engine=${status.serving} caller=${caller} caps-on=${on.length ? on.join(",") : "none"} ` +
            `modules-reloaded=${reloaded} spawns=${spawned.length} (refused ${spawned.filter((s) => !s.passed).length}) ` +
            `stand-in=${engineCalls.length} fetches=${hosts.length} (sweep ${sweepFetches}) verdicts=${lines.length} failures=${failures.length}`;
        });
      });
    });
  } finally {
    restore();
    rmSync(scratch, { recursive: true, force: true });
    lib.apiAuth.__resetRateLimit();
  }
  return { lines, failures, summary };
}

/* ── the lane ────────────────────────────────────────────────────────────── */

let before: Record<string, string | undefined> = {};
test.beforeAll(() => {
  before = { ...process.env };
});

test("cells: the derived axes read something, and every cell is a distinct shape", () => {
  // A derivation that reads nothing scrubs nothing, in a voice
  // indistinguishable from a clean environment.
  expect(credentialVars().length, "no credential variables derived - the source walk read the wrong tree").toBeGreaterThanOrEqual(5);
  expect(credentialVars()).toContain("GOOGLE_AI_API_KEY");
  expect(credentialVars()).toContain(ACCESS_SECRET_VAR);
  expect(storeRootVars().length, "no store roots derived").toBeGreaterThanOrEqual(5);
  expect(MANAGED_MARKERS).toContain("K_SERVICE");
  const shapes = CELLS.map((c) => JSON.stringify(Object.entries(envOf(c)).sort()));
  expect(new Set(shapes).size, "two cells assign the same environment").toBe(CELLS.length);
  for (const c of CELLS) for (const v of Object.keys(envOf(c))) expect(cellAxes(), `${c.name} sets ${v}, which is not an axis`).toContain(v);
  console.log(
    `[cells] ${CELLS.length} cells over ${cellAxes().length} axes (${credentialVars().length} credentials derived, ` +
      `${MANAGED_MARKERS.length} managed markers, ${HOSTED_CAPS.length} hosted flags) + ${storeRootVars().length} store roots redirected`,
  );
});

test("cells: each declared cell is its own nearest cell, exactly — the line pipeline/preflight.mts prints", () => {
  for (const c of CELLS) {
    const { cell, diff } = nearestCell(envOf(c));
    expect(`${cell.name} ${diff.join(" ")}`.trim(), `${c.name}'s own environment reads as another cell`).toBe(c.name);
  }
  // And a near miss names its difference rather than matching silently.
  const { cell, diff } = nearestCell({ ...envOf(CELLS.find((c) => c.name === "cloud-run-saas")!), NEXT_PUBLIC_CAP_PUBLISH: undefined });
  expect(cell.name).toBe("cloud-run-saas");
  expect(diff).toEqual(["-NEXT_PUBLIC_CAP_PUBLISH=0"]);
});

test("routes: every route file on disk has a cell expectation, and every expectation names one (acceptance 4)", () => {
  const files = routeFiles();
  expect(files.length, "the route walk found nothing - it is reading the wrong tree").toBeGreaterThanOrEqual(40);
  const unexpected = files.filter((f) => !EXPECT[f]);
  expect(
    unexpected,
    "these route files have no entry in EXPECT (tests/golden-path/deployment-cells.probe.spec.ts) - declare what an authorised empty request gets, per method",
  ).toEqual([]);
  const stale = Object.keys(EXPECT).filter((f) => !files.includes(f));
  expect(stale, "these EXPECT entries name a route that no longer exists").toEqual([]);
  const wrongDoor = files
    .filter((f) => EXPECT[f] && EXPECT[f].door !== doorOf(f))
    .map((f) => `${f}: declared ${EXPECT[f].door}, its source says ${doorOf(f)}`);
  expect(wrongDoor, "an expectation's door disagrees with the route's own source").toEqual([]);
  console.log(`[cells] ${files.length} route file(s) on disk, all with expectations`);
});

test("routes: every exported method has an expectation, and every expectation names an exported method", () => {
  const off: string[] = [];
  for (const f of routeFiles()) {
    if (!EXPECT[f]) continue;
    const exported = handlersOf(f).map(([m]) => m);
    for (const m of exported) if (!EXPECT[f].ok[m]) off.push(`${f} ${m}: exported, no expectation`);
    for (const m of Object.keys(EXPECT[f].ok)) if (!exported.includes(m as Method)) off.push(`${f} ${m}: expected, not exported`);
    for (const m of EXPECT[f].local ?? []) if (!exported.includes(m)) off.push(`${f} ${m}: declared local, not exported`);
  }
  expect(off).toEqual([]);
});

test("capabilities: CAPABILITY_ROUTES covers every capability and names only routes on disk", () => {
  const files = routeFiles();
  const bad = Object.entries(CAPABILITY_ROUTES).flatMap(([cap, routes]) =>
    routes.filter((r) => !files.includes(r)).map((r) => `${cap} -> ${r}`),
  );
  expect(bad, "CAPABILITY_ROUTES names a route file that is not on disk").toEqual([]);
  expect(Object.keys(CAPABILITY_ROUTES).sort()).toEqual(Object.keys(capabilities()).sort());
  for (const f of Object.keys(READY_BODIES)) expect(Object.values(CAPABILITY_ROUTES).flat(), `${f} has a ready body and no capability`).toContain(f);
  for (const f of [...Object.keys(KNOWN_UNHIDDEN_REFUSALS), ...Object.keys(KNOWN_MANAGED_SPAWNS)])
    expect(files, `a known finding names ${f}, which is not on disk`).toContain(f);
});

/** `.env.example`'s hosted block: the `#   NEXT_PUBLIC_CAP_X=V` lines inside
 *  its capability-flags section, read as data. */
function envExampleHostedBlock(): Map<string, string> {
  const src = readFileSync(path.join(ROOT, ".env.example"), "utf8");
  const start = src.indexOf("Capability flags (lib/capabilities.ts)");
  expect(start, ".env.example has no capability-flags section - the block this check reads moved").toBeGreaterThan(-1);
  const rest = src.slice(start);
  const end = rest.search(/\n# ── /);
  const section = end > 0 ? rest.slice(0, end) : rest;
  const out = new Map<string, string>();
  for (const m of section.matchAll(/^#\s+(NEXT_PUBLIC_CAP_[A-Z_]+)=(\S+)/gm)) out.set(m[1], m[2]);
  return out;
}

test("hosted block: .env.example carries exactly HOSTED_CAPS, variable by variable (acceptance 5)", () => {
  const example = envExampleHostedBlock();
  expect(example.size, ".env.example's hosted block parsed to nothing").toBeGreaterThan(0);
  const diffs: string[] = [];
  for (const h of HOSTED_CAPS) {
    if (!example.has(h.variable)) diffs.push(`${h.variable}: in HOSTED_CAPS, missing from .env.example`);
    else if (example.get(h.variable) !== h.value) diffs.push(`${h.variable}: HOSTED_CAPS says ${h.value}, .env.example says ${example.get(h.variable)}`);
  }
  for (const [v] of example) if (!HOSTED_CAPS.some((h) => h.variable === v)) diffs.push(`${v}: in .env.example's hosted block, missing from HOSTED_CAPS`);
  console.log(`[cells] hosted block: HOSTED_CAPS ${HOSTED_CAPS.length}, .env.example ${example.size}, ${diffs.length} difference(s)`);
  expect(diffs).toEqual([]);
});

test("hosted block: each HOSTED_CAPS variable is the flag capabilities() reads for its capability, and the block turns it off", () => {
  const src = stripComments(readFileSync(path.join(ROOT, "lib", "capabilities.ts"), "utf8"));
  const wrong = HOSTED_CAPS.filter((h) => !new RegExp(`\\b${h.cap}:\\s*on\\(process\\.env\\.${h.variable}\\b`).test(src)).map(
    (h) => `${h.cap} <- ${h.variable}`,
  );
  expect(wrong, "HOSTED_CAPS pairs a capability with a variable capabilities() does not read for it").toEqual([]);
  const restore = applyCell(CELLS.find((c) => c.name === "cloud-run-saas")!, tmpdir());
  try {
    const caps = capabilities();
    for (const h of HOSTED_CAPS) expect(caps[h.cap], `${h.variable}=${h.value} left ${h.cap} on`).toBe(false);
  } finally {
    restore();
  }
});

for (const cell of CELLS) {
  test(`cell ${cell.name}: posture, engine, gate, spawn and readiness hold over every derived route`, async () => {
    test.setTimeout(180_000);
    const run = await runCell(cell);
    console.log(run.summary);
    if (process.env.CELLS_VERBOSE || run.failures.length) for (const l of run.lines) console.log(l);
    expect(run.failures, `${cell.name}: ${run.failures.length} cell x route verdict(s) failed`).toEqual([]);
  });
}

// The positive control for invariant 1. A green lane over the declared cells
// says nothing unless the same check goes red where the disagreement is real:
// a dev-auth laptop with no music key (a fresh clone) shows the Score render —
// `musicGenerate` defaults on — and the route answers 503 no-key. The check
// must name the cell and each music route; if it ever stops doing so, the
// "ok" verdicts above stopped meaning anything.
test("invariant 1 witness: a cell whose music capability is on and whose key is absent is named, with its routes", async () => {
  const fresh: Cell = {
    name: "laptop-fresh-clone",
    who: "a fresh clone with dev-auth on and no keys",
    env: { NEXT_PUBLIC_DEV_AUTH: "1", LIGHTTRACK_DISABLE: "1" },
    present: [],
    posture: "available",
    engine: "claude-cli",
  };
  const run = await runCell(fresh, { sweep: false });
  console.log(run.summary);
  for (const l of run.lines) console.log(l);
  for (const f of Object.keys(READY_BODIES))
    expect(
      run.failures.some((x) => x.startsWith("laptop-fresh-clone:") && x.includes(f) && /answers 503 no-key/.test(x)),
      `invariant 1 did not flag ${f} in a cell where its capability is on and its key is absent`,
    ).toBe(true);
});

test("the lane leaves process.env exactly as it found it (acceptance 7)", () => {
  const now = { ...process.env };
  const changed = [...new Set([...Object.keys(before), ...Object.keys(now)])].filter((k) => before[k] !== now[k]);
  expect(changed, "these variables differ from their value before the lane").toEqual([]);
});

// NOT YET: acceptance 6 — "engineStatus('edit-plan').available === false ⇔
// POST /api/recalibrate with a VALID body answers the no-engine status". A
// valid body makes the route read and cache pipeline/RECALIBRATE-PROMPT.md in a
// module variable, and recalibrate-route-e2e.probe.spec.ts's first case exists
// to observe that file MISSING, which it can only do in a process where no
// earlier probe loaded it. This file sorts before it. The per-cell module reload
// above does not help: that probe holds its own import of the route. It needs
// either the prompt reader the AIO-B assembler extraction exposes, or that
// probe's cache assumption made explicit — not a third probe racing it.
