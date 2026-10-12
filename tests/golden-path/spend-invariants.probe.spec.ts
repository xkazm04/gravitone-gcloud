// LANE - THE SPEND INVARIANTS HOLD UNDER GENERATED TRAFFIC (dynamic).
//
// Every spend probe in this lane asserts one example per route: imaging-auth
// drives each money route once, music-budget stubs its own fetch, frames-run-
// bounded times a 413. Each proves its example and none can say whether the
// FOUR properties this context exists for hold for traffic nobody wrote down:
//
//   I1  no dispatch without authority - every 401 / 413 / 402 / limiter-429 is
//       answered with ZERO vendor dispatches;
//   I2  booked spend within the ceiling - the window ledger total is at most the
//       ceiling plus one maximum estimate;
//   I3  ledger/log parity - every dispatch the vendor BILLS has exactly one
//       ledger row (served on 200, failed otherwise); a 429 is the vendor
//       declining, so it books nothing;
//   I4  one settle line per request that reached the router;
//   I5  no line (log or response body) contains a configured secret.
//
// The traffic is a seeded sequence over the DERIVED set of money routes
// (_routes.ts - a new route that calls guardRequest joins it by existing), with
// auth variants, body sizes, concurrent bursts and vendor outcomes. Everything
// that could spend is counted at ONE boundary (_vendor.ts). A failing seed
// prints `SPEND_SEED=<n>`; `SPEND_SEED=<n> npx playwright test spend-invariants`
// replays that exact sequence.
//
// NARROWED FROM THE TICKET, honestly:
//   · a mid-body stall is not generated: the adapters wait 180 s on one, and a
//     probe that sleeps three minutes per case is not a lane anyone runs;
//   · the vendor-outcome table is driven through imaging/generate only. It is the
//     one route whose whole chain (guard -> router -> hold -> adapter -> ledger
//     -> settle line) is observable end to end; the other money routes are
//     driven with auth and size variants, where I1 is the claim;
//   · "music hold has not landed" no longer holds: lib/music/budget.ts reserves
//     on the shared kernel (music-budget-holds), so acceptance 3 is a plain
//     passing case, not a test.fail.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { FAKE_ENGINE_ENV, keepEnv } from "./_helpers";
import { concretePath, loadMoneyRoutes, moneyRouteFiles, routeContext, type MoneyRoute } from "./_routes";
import { withVendor, type Vendor } from "./_vendor";
import {
  ACCESS_SECRET_VAR,
  RATE_CAPACITY_VAR,
  RATE_KEY_CAP_VAR,
  RATE_WINDOW_SEC_VAR,
  __resetRateLimit,
} from "@/lib/apiAuth";
import { BUDGET_VAR, WINDOW_VAR, __resetBudget, estimatePendingUsd, spendRows } from "@/lib/imaging/budget";
import { KEY_VAR } from "@/lib/imaging/env";
import { MUSIC_BUDGET_VAR, MUSIC_WINDOW_VAR, __resetMusicBudget, musicSpendRows } from "@/lib/music/budget";
import { MusicError } from "@/lib/music/errors";
import { MUSIC_KEY_VAR, composeMusic } from "@/lib/music/elevenlabs";
import type { MusicPlan } from "@/lib/music/types";

const SECRET = "probe-access-secret-7f3a9c1e";
const GOOGLE_KEY = "AIzaSyFAKEspendInvariantsKey0123456789";
const CEILING_USD = 0.3;

keepEnv([
  ACCESS_SECRET_VAR,
  "NEXT_PUBLIC_DEV_AUTH",
  "NEXT_PUBLIC_LOCAL_MODE",
  "PRINCIPAL_MODE",
  "IMAGING_ENV",
  "OLLAMA_HOST",
  KEY_VAR.google,
  KEY_VAR.leonardo,
  KEY_VAR.qwen,
  BUDGET_VAR,
  WINDOW_VAR,
  RATE_CAPACITY_VAR,
  RATE_WINDOW_SEC_VAR,
  RATE_KEY_CAP_VAR,
  MUSIC_BUDGET_VAR,
  MUSIC_WINDOW_VAR,
  MUSIC_KEY_VAR,
  "LOCAL_BINARIES",
  ...FAKE_ENGINE_ENV,
]);

test.beforeEach(() => {
  __resetRateLimit();
  __resetBudget();
  __resetMusicBudget();
  process.env[ACCESS_SECRET_VAR] = SECRET;
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  delete process.env.NEXT_PUBLIC_LOCAL_MODE;
  delete process.env.PRINCIPAL_MODE;
  process.env.IMAGING_ENV = "prod"; // google only: the chain the invariants are stated over
  delete process.env.OLLAMA_HOST;
  delete process.env[KEY_VAR.leonardo];
  delete process.env[KEY_VAR.qwen];
  delete process.env[MUSIC_KEY_VAR];
  process.env[KEY_VAR.google] = GOOGLE_KEY;
  process.env[BUDGET_VAR] = String(CEILING_USD);
  delete process.env[WINDOW_VAR];
  delete process.env[RATE_WINDOW_SEC_VAR];
  delete process.env[RATE_KEY_CAP_VAR];
  delete process.env[MUSIC_BUDGET_VAR];
  delete process.env[MUSIC_WINDOW_VAR];
});

/* -- a seeded generator ------------------------------------------------------ */

/** mulberry32: 32 bits of state, good enough to vary traffic, tiny enough to read. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Outcome = 200 | 429 | 451 | 500;
type Step =
  | { t: "unauth"; route: number; method: number; ip: string; wrong: boolean }
  | { t: "authed-empty"; route: number; method: number; ip: string }
  | { t: "generate"; ip: string; outcome: Outcome; pad: number }
  | { t: "burst"; ip: string; outcomes: Outcome[] }
  | { t: "frames-oversize"; ip: string; mode: "beats" | "bytes" };

interface Plan {
  seed: number;
  /** The limiter's capacity for this sequence. */
  capacity: number;
  steps: Step[];
}

// 429 is rare on purpose: the adapter retries it twice with a back-off, so each
// one costs this probe about 1.2 s of wall clock.
const OUTCOMES: Outcome[] = [200, 200, 200, 200, 500, 500, 451, 429];

/** Pure in (seed, routeCount, methodCounts): the same seed is the same traffic. */
function makePlan(seed: number, routes: readonly MoneyRoute[], length: number): Plan {
  const rnd = prng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const ips = ["10.20.0.1", "10.20.0.2", "10.20.0.3"];
  const steps: Step[] = [];
  for (let i = 0; i < length; i++) {
    const r = rnd();
    const ip = pick(ips);
    if (r < 0.34) steps.push({ t: "unauth", route: Math.floor(rnd() * routes.length), method: rnd(), ip, wrong: rnd() < 0.5 });
    else if (r < 0.5) steps.push({ t: "authed-empty", route: Math.floor(rnd() * routes.length), method: rnd(), ip });
    else if (r < 0.78) steps.push({ t: "generate", ip, outcome: pick(OUTCOMES), pad: Math.floor(rnd() * 1500) });
    else if (r < 0.92)
      steps.push({ t: "burst", ip, outcomes: Array.from({ length: 3 + Math.floor(rnd() * 3) }, () => pick(OUTCOMES)) });
    else steps.push({ t: "frames-oversize", ip, mode: rnd() < 0.5 ? "beats" : "bytes" });
  }
  return { seed, capacity: 4 + Math.floor(rnd() * 26), steps };
}

/* -- the world one sequence runs in ---------------------------------------- */

const IMAGE_BODY = { status: "completed", steps: [{ content: [{ type: "image", data: "AAAA", mime_type: "image/jpeg" }] }] };

/** The vendor answers a generate by the outcome marker the request carries, not
 *  by arrival order, so concurrency cannot change which request got which fate. */
function scriptGoogle(v: Vendor): void {
  v.script("google", ({ body }) => {
    const code = Number(/outcome:(\d{3})/.exec(body)?.[1] ?? 200);
    return code === 200 ? { status: 200, body: IMAGE_BODY, delayMs: 5 } : { status: code, body: { error: { message: `scripted ${code}` } }, delayMs: 5 };
  });
}

/** Every console line a sequence wrote, captured so I4 and I5 read what an
 *  operator would have read. */
function captureConsole(): { lines: () => string[]; restore: () => void } {
  const lines: string[] = [];
  const saved = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  const grab =
    () =>
    (...args: unknown[]) => {
      lines.push(args.map((a) => (typeof a === "string" ? a : a instanceof Error ? `${a.message}\n${a.stack ?? ""}` : JSON.stringify(a))).join(" "));
    };
  console.log = grab();
  console.error = grab();
  console.warn = grab();
  console.info = grab();
  return {
    lines: () => [...lines],
    restore: () => Object.assign(console, saved),
  };
}

function post(path: string, ip: string, opts: { bearer?: string; body?: string; method?: string } = {}): Request {
  const method = opts.method ?? "POST";
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": ip };
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  return new Request(`http://localhost${path}`, { method, headers, body: method === "GET" ? undefined : (opts.body ?? "{}") });
}

const generateReq = (ip: string, outcome: Outcome, pad = 0): Request =>
  post("/api/imaging/generate", ip, {
    bearer: SECRET,
    body: JSON.stringify({ prompt: `a harbour at dusk outcome:${outcome} ${"x".repeat(pad)}`, aspect: "16:9" }),
  });

/** A limiter refusal: the guard's own 429 carries Retry-After, and a vendor 429
 *  relayed by the router does not. */
const isLimiter429 = (res: Response): boolean => res.status === 429 && res.headers.get("retry-after") !== null;
const isRefusal = (res: Response): boolean => res.status === 401 || res.status === 413 || res.status === 402 || isLimiter429(res);

interface Verdict {
  seed: number;
  violations: string[];
  /** What the sequence did, in numbers - for the log line and the replay check. */
  tally: Record<string, number>;
}

async function runSequence(plan: Plan, routes: readonly MoneyRoute[], v: Vendor): Promise<Verdict> {
  __resetRateLimit();
  __resetBudget();
  v.clear();
  scriptGoogle(v);
  process.env[RATE_CAPACITY_VAR] = String(plan.capacity);

  const cap = captureConsole();
  const bodies: string[] = [];
  const violations: string[] = [];
  const tally = { requests: 0, refused: 0, generates: 0, admittedGenerates: 0 };
  const note = (s: string) => violations.push(s);

  const invoke = async (route: MoneyRoute, method: string, req: Request): Promise<Response> => {
    const res = await route.handlers[method](req, routeContext(route));
    bodies.push(await res.clone().text());
    tally.requests++;
    return res;
  };
  const generate = routes.find((r) => r.path === "/api/imaging/generate")!;
  const frames = routes.find((r) => r.path === "/api/frames")!;

  /** I1 on one serial request. */
  const refusedMeansZero = (what: string, res: Response, before: number): void => {
    if (!isRefusal(res)) return;
    tally.refused++;
    const spent = v.dispatches().length - before;
    if (spent) note(`I1: ${what} answered ${res.status} but ${spent} vendor dispatch(es) happened`);
  };

  try {
    for (const [i, s] of plan.steps.entries()) {
      const before = v.dispatches().length;
      if (s.t === "unauth") {
        const route = routes[s.route];
        const methods = Object.keys(route.handlers);
        const method = methods[Math.floor(s.method * methods.length)];
        const res = await invoke(route, method, post(concretePath(route), s.ip, { method, bearer: s.wrong ? "not-the-secret" : undefined }));
        // An unauthenticated caller is NEVER admitted: 401, or the limiter's 429 ahead of it.
        if (res.status !== 401 && !isLimiter429(res)) note(`I1: step ${i} unauthenticated ${method} ${route.path} answered ${res.status}, not 401/429`);
        refusedMeansZero(`step ${i} unauthenticated ${method} ${route.path}`, res, before);
      } else if (s.t === "authed-empty") {
        const route = routes[s.route];
        const methods = Object.keys(route.handlers).filter((m) => m !== "GET");
        if (!methods.length) continue;
        const method = methods[Math.floor(s.method * methods.length)];
        const res = await invoke(route, method, post(concretePath(route), s.ip, { method, bearer: SECRET }));
        if (res.status === 401) note(`I1/auth: step ${i} a VALID secret was refused 401 at ${method} ${route.path}`);
        refusedMeansZero(`step ${i} authed-empty ${method} ${route.path}`, res, before);
      } else if (s.t === "generate") {
        tally.generates++;
        const res = await invoke(generate, "POST", generateReq(s.ip, s.outcome, s.pad));
        if (!isLimiter429(res)) tally.admittedGenerates++;
        refusedMeansZero(`step ${i} generate`, res, before);
      } else if (s.t === "burst") {
        tally.generates += s.outcomes.length;
        const results = await Promise.all(s.outcomes.map((o) => invoke(generate, "POST", generateReq(s.ip, o))));
        tally.admittedGenerates += results.filter((r) => !isLimiter429(r)).length;
        tally.refused += results.filter(isRefusal).length;
        // Attribution inside a burst is not per request; the weaker claim that
        // still binds: a burst answered ENTIRELY by refusals dispatched nothing.
        if (results.every(isRefusal) && v.dispatches().length - before)
          note(`I1: step ${i} burst of ${results.length} was refused outright yet dispatched ${v.dispatches().length - before}`);
      } else {
        const beats =
          s.mode === "beats"
            ? Array.from({ length: 5_000 }, (_, k) => ({ at: `0:${k % 60}`, text: `beat ${k}` }))
            : [{ at: "0:00", text: "x".repeat(1_100_000) }];
        const res = await invoke(frames, "POST", post("/api/frames", s.ip, { bearer: SECRET, body: JSON.stringify({ beats, style: { technique: "flat vector", palette: [] } }) }));
        // An oversized run is a 413 - or the limiter's 429 ahead of it - and either way nothing ran.
        if (res.status !== 413 && !isLimiter429(res)) note(`I1: step ${i} oversized frames run answered ${res.status}, not 413/429`);
        refusedMeansZero(`step ${i} frames-oversize(${s.mode})`, res, before);
      }
    }
  } finally {
    cap.restore();
  }

  const lines = cap.lines();
  const dispatches = v.dispatches();
  const status = v.statuses();
  const google = dispatches.map((d, k) => ({ d, status: status[k] })).filter((x) => x.d.host === "google");
  if (dispatches.some((d) => d.host !== "google")) note(`I1: a dispatch left for ${[...new Set(dispatches.map((d) => d.host).filter((h) => h !== "google"))].join(", ")}`);

  // I2 - booked spend within the ceiling plus one maximum estimate.
  const rows = await spendRows();
  const booked = rows.reduce((sum, r) => sum + r.usd, 0);
  const slack = estimatePendingUsd(1);
  if (booked > CEILING_USD + slack + 1e-9) note(`I2: window total $${booked.toFixed(4)} exceeds ceiling $${CEILING_USD} + one estimate $${slack.toFixed(4)}`);

  // I3 - the vendor billed (answered 200, or failed after it ran) exactly what the ledger booked.
  // 401/403/429 are the vendor declining before work: no row, by design.
  const billedDispatches = google.filter((x) => ![401, 403, 429].includes(x.status));
  const served = google.filter((x) => x.status === 200).length;
  if (rows.length !== billedDispatches.length)
    note(`I3: ${billedDispatches.length} billed dispatch(es) but ${rows.length} ledger row(s)`);
  if (rows.filter((r) => r.outcome === "served").length !== served)
    note(`I3: ${served} served dispatch(es) but ${rows.filter((r) => r.outcome === "served").length} served row(s)`);

  // I4 - one settle line per request that reached the router (the limiter's refusals never did).
  const settle = lines.filter((l) => /^\[imaging\] generate (ok|err)\b/.test(l));
  if (settle.length !== tally.admittedGenerates)
    note(`I4: ${tally.admittedGenerates} generate request(s) reached the router but ${settle.length} settle line(s) were written`);

  // I5 - no secret in any line the process wrote or any body it answered.
  for (const secret of [SECRET, GOOGLE_KEY]) {
    const where = lines.findIndex((l) => l.includes(secret));
    if (where >= 0) note(`I5: a configured secret appears in log line ${where}: ${lines[where].slice(0, 120)}`);
    if (bodies.some((b) => b.includes(secret))) note("I5: a configured secret appears in a response body");
  }

  return {
    seed: plan.seed,
    violations,
    tally: { ...tally, dispatches: dispatches.length, rows: rows.length, settleLines: settle.length },
  };
}

/* -- the population ---------------------------------------------------------- */

let ROUTES: MoneyRoute[] = [];
test.beforeAll(async () => {
  ROUTES = await loadMoneyRoutes();
});

test("the money population is derived: every guardRequest route, and no list to edit", () => {
  const paths = ROUTES.map((r) => r.path);
  console.log(`[spend] ${ROUTES.length} money route(s): ${paths.join(" ")}`);
  // Anchors, so a walk that quietly found a different tree cannot pass as "derived".
  for (const known of ["/api/imaging/generate", "/api/frames", "/api/music/generate"]) expect(paths).toContain(known);
  expect(ROUTES.length).toBeGreaterThanOrEqual(11);
});

test("a new route that calls guardRequest joins the population with no list edit", () => {
  const root = mkdtempSync(join(tmpdir(), "spend-routes-"));
  try {
    const put = (rel: string, src: string) => {
      const dir = join(root, "app", "api", rel);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "route.ts"), src);
    };
    for (let i = 0; i < 8; i++) put(`filler${i}`, "export async function GET() { return new Response(); }\n");
    put("x", 'import { guardRequest } from "@/lib/apiAuth";\nexport async function POST(req: Request) { const d = await guardRequest(req); if (d) return d; return new Response(); }\n');
    // A route that only TALKS about the door is not a money route.
    put("chatty", "// we should call guardRequest( here some day\nexport async function POST() { return new Response(); }\n");
    const found = moneyRouteFiles(root);
    expect(found).toEqual(["app/api/x/route.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* -- the boundary counts what it claims to -------------------------------- */

test("control: the boundary sees a real admitted dispatch, and an unlisted host is a dispatch too", async () => {
  await withVendor(async (v) => {
    scriptGoogle(v);
    const generate = ROUTES.find((r) => r.path === "/api/imaging/generate")!;
    const res = await generate.handlers.POST(generateReq("10.30.0.1", 200));
    expect(res.status).toBe(200);
    // The control sequence: if this reads 0, "0 dispatches" below means nothing.
    expect(v.dispatches().map((d) => d.host)).toEqual(["google"]);

    await fetch("https://not-a-listed-vendor.example/v1/anything");
    expect(v.dispatches().at(-1)?.host).toBe("unknown:not-a-listed-vendor.example");
  });
});

/* -- acceptance 1: I1 over every derived route ------------------------------- */

test("I1: 20 unauthenticated POSTs spread over every derived money route dispatch nothing", async () => {
  await withVendor(async (v) => {
    scriptGoogle(v);
    // Capacity high enough that the 401 is what answers, not the limiter in front of it.
    process.env[RATE_CAPACITY_VAR] = "1000";
    const posters = ROUTES.filter((r) => r.handlers.POST);
    const n = Math.max(20, posters.length);
    const statuses: number[] = [];
    for (let i = 0; i < n; i++) {
      const route = posters[i % posters.length];
      const res = await route.handlers.POST(post(concretePath(route), `10.31.${i % 250}.1`), routeContext(route));
      statuses.push(res.status);
    }
    console.log(`[spend] ${n} unauthenticated POSTs over ${posters.length} route(s): ${[...new Set(statuses)].join(",")}`);
    expect(statuses.every((s) => s === 401)).toBe(true);
    expect(v.dispatches(), "an unauthenticated request reached a vendor").toEqual([]);
  });
});

/* -- acceptance 2: the frames 413 is a dispatch count, not a stopwatch -------- */

test("I1: an oversized frames run is a 413 with zero dispatches - fetch and claude alike", async () => {
  await withVendor(
    async (v) => {
      const frames = ROUTES.find((r) => r.path === "/api/frames")!;
      const beats = Array.from({ length: 5_000 }, (_, i) => ({ at: `0:${i % 60}`, text: `beat ${i}` }));
      const res = await frames.handlers.POST(
        post("/api/frames", "10.32.0.1", { bearer: SECRET, body: JSON.stringify({ beats, style: { technique: "flat vector", palette: [] } }) }),
      );
      expect(res.status).toBe(413);
      expect(v.dispatches()).toEqual([]);
    },
    // Binaries ON so a `claude` spawn would be possible - and counted - rather than
    // impossible by posture. The 413 must be what stops it.
    { localBinaries: "on" },
  );
});

/* -- acceptance 3: concurrent music renders against one ceiling --------------- */

test("I2: two concurrent music renders at 60% of the ceiling cannot book past it", async () => {
  const PLAN: MusicPlan = {
    positiveGlobalStyles: ["warm"],
    negativeGlobalStyles: ["harsh"],
    sections: [{ name: "bed", durationMs: 12_000, positiveStyles: ["warm"], negativeStyles: ["harsh"] }],
  };
  // Ceiling 30 s of audio, 18 s (60%) already booked: each 12 s render fits on
  // its own (30 <= 30) and the two together do not (42). Only a hold taken
  // BEFORE the vendor is touched refuses the second.
  process.env[MUSIC_BUDGET_VAR] = "30";
  process.env[MUSIC_KEY_VAR] = "probe-music-key-not-real";
  const { recordMusicSpend } = await import("@/lib/music/budget");
  await recordMusicSpend({ seconds: 18, op: "generate", model: "music_v2", outcome: "served" });

  await withVendor(async (v) => {
    // Held open long enough that the second render's check runs while the first is in flight.
    v.script("elevenlabs", () => ({ status: 200, body: new Uint8Array(2_048), contentType: "audio/mpeg", delayMs: 60 }));
    {
      const results = await Promise.allSettled([composeMusic(PLAN), composeMusic(PLAN)]);
      const refused = results.filter((r) => r.status === "rejected" && r.reason instanceof MusicError && r.reason.kind === "over-budget").length;
      const rows = await musicSpendRows();
      const total = rows.reduce((s, r) => s + (r.seconds ?? 0), 0);
      console.log(`[spend] music: ${results.map((r) => r.status).join("+")}, refused=${refused}, booked=${total}s, dispatches=${v.dispatches().length}`);
      expect(total, "the window ended above the ceiling").toBeLessThanOrEqual(30 + 12);
      expect(total).toBeLessThanOrEqual(30);
      expect(refused).toBe(1);
      expect(v.dispatches().filter((d) => d.host === "elevenlabs"), "the refused render still reached the vendor").toHaveLength(1);
    }
  });
});

/* -- acceptance 4: a vendor 500 is one billed failed row and one settle line --- */

test("I3/I4: an imaging generate answered 500 books exactly one failed row and writes one settle line", async () => {
  await withVendor(async (v) => {
    scriptGoogle(v);
    const generate = ROUTES.find((r) => r.path === "/api/imaging/generate")!;
    const cap = captureConsole();
    let res: Response;
    try {
      res = await generate.handlers.POST(generateReq("10.33.0.1", 500));
    } finally {
      cap.restore();
    }
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(v.dispatches()).toHaveLength(1); // a billable 5xx is never re-sent
    const rows = await spendRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe("failed");
    expect(rows[0].usd).toBeGreaterThan(0);
    expect(cap.lines().filter((l) => /^\[imaging\] generate err\b/.test(l))).toHaveLength(1);
  });
});

/* -- the generated sequences, and their replay ------------------------------- */

const SEEDS = process.env.SPEND_SEED ? [Number(process.env.SPEND_SEED)] : [11, 23, 47];
const LENGTH = Number(process.env.SPEND_STEPS ?? 14);

for (const seed of SEEDS) {
  test(`I1-I5 hold for seed ${seed}`, async () => {
    expect(Number.isInteger(seed), `SPEND_SEED must be an integer, got ${process.env.SPEND_SEED}`).toBe(true);
    await withVendor(async (v) => {
      const plan = makePlan(seed, ROUTES, LENGTH);
      const verdict = await runSequence(plan, ROUTES, v);
      console.log(`[spend] SPEND_SEED=${seed} capacity=${plan.capacity} ${JSON.stringify(verdict.tally)} violations=${verdict.violations.length}`);
      if (verdict.violations.length) console.log(`[spend] FAILED SPEND_SEED=${seed}\n  ${verdict.violations.join("\n  ")}`);
      expect(verdict.violations, `replay with SPEND_SEED=${seed}`).toEqual([]);
      // A sequence that dispatched nothing proved nothing about I3/I4.
      expect(verdict.tally.generates, "the sequence never drove a generate").toBeGreaterThan(0);
    });
  });
}

test("the same SPEND_SEED reproduces the same sequence and the same verdict", async () => {
  const a = makePlan(31, ROUTES, LENGTH);
  const b = makePlan(31, ROUTES, LENGTH);
  expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  expect(JSON.stringify(makePlan(32, ROUTES, LENGTH)), "two seeds made the same traffic").not.toBe(JSON.stringify(a));

  await withVendor(async (v) => {
    const first = await runSequence(a, ROUTES, v);
    const second = await runSequence(b, ROUTES, v);
    expect(second.violations).toEqual(first.violations);
    expect(second.tally.generates).toBe(first.tally.generates);
    expect(second.tally.requests).toBe(first.tally.requests);
  });
});
