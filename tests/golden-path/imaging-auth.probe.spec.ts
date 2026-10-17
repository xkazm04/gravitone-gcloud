// LANE — UNAUTHENTICATED-SPENDING-ROUTE (dynamic).
//
// Every route under app/api either gates or is named public with its reason —
// DERIVED below from the filesystem, because the hand-kept count went stale
// twice. Before this gate, no route checked WHO was calling — a request at the
// origin billed the operator's keys. This probe pins:
//
//   · every route on disk calls a gate door, or is an exemption with a reason;
//   · the doors themselves: the shared secret's compare, the rate limiter, and
//     the CLI token as route()'s guard (app/_server/route.ts guardOf) judges it.
//
// PHASE 6 L70. The v1 money routes this file used to drive one by one (imaging,
// frames, recalibrate, script, research, music, ads, video, sound, suno, mv,
// articles, strips, turns, motion: 41 handlers) were deleted with the v1 pages:
// producers run in-process behind Server Actions now, and no money route is left
// under app/api. Their 401-without-spending cases went with them; the derived
// check below still demands a driven case for any money route that appears. The
// token cases, which drove /api/imaging/generate, now drive the live door every
// remaining route goes through (route()'s guardOf), not v1's guardRequest.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import { test, expect } from "@playwright/test";

import { keepEnv, stripComments } from "./_pure";
import {
  checkAccess,
  resolvePrincipal,
  SHARED_SECRET_CALLERS_VAR,
  rateLimit,
  rateStats,
  __reapNow,
  __resetRateLimit,
  ACCESS_SECRET_VAR,
  RATE_CAPACITY_VAR,
  RATE_KEY_CAP_VAR,
  RATE_WINDOW_SEC_VAR,
} from "@/lib/apiAuth";

const SECRET = "probe-secret-value";

/** A POST Request at one of our routes, with an optional bearer secret and a
 *  distinct forwarded IP so rate-limit buckets never bleed across cases. */
function req(path: string, opts: { bearer?: string; ip: string; body?: unknown }): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": opts.ip,
  };
  if (opts.bearer) headers["authorization"] = `Bearer ${opts.bearer}`;
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? {}),
  });
}

/** The money routes driven for 401-without-spending: none since Phase 6 L70 (see the header).
 *  A route that calls a money door and is not listed here fails the derived check below. */
const ROUTES: [string, string, (r: Request) => Promise<Response>][] = [];

/**
 * Routes that are PUBLIC on purpose, each with the reason it is.
 *
 * The list below the fold is derived from the filesystem; this is the only place
 * a route may be excluded from it, and an entry here is a claim somebody has to
 * defend in review rather than an omission nobody sees.
 */
// Both entries - /api/imaging/pricing and /api/music/pricing, the price tables - retired
// with the v1 pages in Phase 6 L70; the next public route is admitted here with its reason,
// and the transitive no-environment walk below then runs over it again.
const DELIBERATELY_PUBLIC: Record<string, string> = {};

/**
 * Routes that are public because they ARE the door a credential is made at.
 *
 * Kept apart from DELIBERATELY_PUBLIC because the claim differs: those read no
 * environment at all (asserted transitively below), and these cannot - judging
 * a token means reading the project id and the verifier's mode. What each one
 * claims instead is that it guards itself, and the server-seam probe drives
 * that claim (tests/golden-path/server-seam.probe.spec.ts).
 */
const PUBLIC_CREDENTIAL_DOORS: Record<string, string> = {
  "app/api/session/route.ts":
    "the bridge from a Firebase sign-in to the session cookie: nobody holds a session before it, so it cannot require one. It guards itself - writes only from this origin, and a token is verified before any cookie is set",
};
const isPublic = (rel: string): boolean => rel in DELIBERATELY_PUBLIC || rel in PUBLIC_CREDENTIAL_DOORS;

/**
 * THE DOORS A ROUTE MAY GATE THROUGH — v1's three, and the rebuild's one.
 *
 * This check used to look for `guardRequest(` alone. lib/apiAuth.ts has grown two
 * more doors since, and both are in use on committed routes:
 *
 *   · `guardAccessOnly` — access required, rate bucket skipped. The foundry
 *     routes read and write local disk and their page legitimately bursts
 *     (a 4s poll plus a debounced autosave), so sharing the money bucket turned
 *     the Styles tab into a 429 and let an open tab starve a real generation.
 *   · `checkAccess` — the raw verdict, for the one route that cannot use either
 *     wrapper: /api/foundry/file serves images to an <img>, which cannot carry an
 *     Authorization header, so it accepts the same secret as `k=` and calls the
 *     check itself.
 *
 * Nine committed, genuinely-gated routes therefore read as UNGATED and this
 * blocking gate has been red on main — which is the worse failure of the two it
 * can have. A gate that is red for a false reason stops refusing anything: the
 * next actually-ungated route lands inside a failure everyone has learned to
 * step over.
 *
 * The rebuild's door is the one wrapper every new handler goes through,
 * app/_server/route.ts `route({ guard })`. Only a `money` or `access` guard is a
 * gate; `guard: "public"` is a declaration, and a route that makes it must still
 * be named in an exemption above or it reads as ungated - the wrapper does not
 * get to exempt a route by itself.
 *
 * Each door is asserted to EXIST in its module by the test below, so a
 * renamed door reddens this probe instead of silently matching nothing — the
 * failure mode a matcher list has, and the reason the route population itself is
 * derived from the filesystem rather than listed.
 */
const GATE_DOORS = [
  { name: "guardRequest", file: "lib/apiAuth.ts", money: true, matcher: /\bguardRequest\s*\(/ },
  { name: "guardAccessOnly", file: "lib/apiAuth.ts", money: false, matcher: /\bguardAccessOnly\s*\(/ },
  { name: "checkAccess", file: "lib/apiAuth.ts", money: false, matcher: /\bcheckAccess\s*\(/ },
  { name: "route", file: "app/_server/route.ts", money: true, matcher: /\broute\s*\(\s*\{\s*guard:\s*"money"/ },
  { name: "route", file: "app/_server/route.ts", money: false, matcher: /\broute\s*\(\s*\{\s*guard:\s*"access"/ },
] as const;

/** The doors that mark a route as spending a vendor balance or local compute.
 *  What must be DRIVEN below is read off these rather than off a second list. */
const MONEY_DOORS = GATE_DOORS.filter((d) => d.money);

/** Source with `//` and block comments removed.
 *
 *  The files in this repo explain the rule in prose directly above the code that
 *  implements it, so a matcher run over raw text is satisfied by a route that
 *  TALKS about its guard and does not call one. Strip first, then match.
 *
 *  The shared scanner, not a private replace pair. Measured 2026-09-06 with a
 *  seeded route whose first line read "see /api/foundry/ + star" and whose last
 *  line was a block comment: the block-first pair this used to carry opened a
 *  phantom block at the star, swallowed the whole file including its
 *  guardRequest call, and reported a GATED route as ungated — the false red
 *  the header above calls the worse of this gate's two failures. */
function code(src: string): string {
  return stripComments(src);
}

test("the gate doors this probe looks for all still exist where they are looked for", () => {
  for (const door of GATE_DOORS) {
    const src = code(readFileSync(join(process.cwd(), door.file), "utf8"));
    expect(
      new RegExp(`export function ${door.name}\\s*[<(]`).test(src),
      `${door.name} is no longer exported from ${door.file} — the route matcher below is looking for a door that moved, and would report a gated route as ungated`,
    ).toBe(true);
  }
  // route()'s guard is a closed union; a fourth guard these matchers do not know would read as ungated.
  expect(code(readFileSync(join(process.cwd(), "app/_server/route.ts"), "utf8"))).toMatch(/export type Guard = "money" \| "access" \| "public";/);
  console.log(`[auth] ${GATE_DOORS.length} gate door(s) verified: ${GATE_DOORS.map((d) => `${d.name} (${d.file})`).join(", ")}`);
});

/**
 * THE LIST ABOVE IS HAND-WRITTEN, SO SOMETHING HAS TO CHECK IT AGAINST REALITY.
 *
 * It carried four routes when it was written and the repo has ten. In between,
 * four music routes arrived (gated, and untested here) and /api/recalibrate
 * arrived UNGATED - spawning the same headless Claude process /api/frames does,
 * for up to 800 seconds, to anyone who could reach the origin. This probe existed
 * precisely to catch that and could not, because it enumerated the
 * implementation's own list instead of the ground truth.
 *
 * That is coverage theater, and the fix is not to add the missing lines: it is to
 * derive the population from the filesystem, so the next route added is covered
 * by existing. A route may leave the set only through DELIBERATELY_PUBLIC, with a
 * reason.
 */
test("every API route either gates or is deliberately public — derived, not listed", () => {
  const apiDir = join(process.cwd(), "app", "api");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts") found.push(relative(process.cwd(), full).split("\\").join("/"));
    }
  };
  walk(apiDir);

  // A walk that finds nothing reports "all routes gate" in a voice
  // indistinguishable from success. Prove it read the tree first.
  expect(found.length, "the route walk found nothing - it is reading the wrong tree").toBeGreaterThanOrEqual(8);

  const ungated: string[] = [];
  for (const rel of found) {
    if (isPublic(rel)) continue;
    const src = code(readFileSync(join(process.cwd(), rel), "utf8"));
    if (!GATE_DOORS.some((d) => d.matcher.test(src))) ungated.push(rel);
  }
  console.log(`[auth] ${found.length} route(s) on disk, ${Object.keys(DELIBERATELY_PUBLIC).length + Object.keys(PUBLIC_CREDENTIAL_DOORS).length} deliberately public, ${ungated.length} ungated`);
  expect(ungated, "these routes spend money or compute and check nobody").toEqual([]);

  // And the DRIVEN list must not fall behind the tree either, or the cases below
  // stop covering routes that exist.
  //
  // SCOPED TO THE MONEY DOOR, AND DERIVED. The cases below drive a route with a
  // real Request and assert 401-without-spending; what they are protecting is the
  // vendor balance and the local compute. `guardRequest` is exactly the door that
  // marks a route as spending one of those, so the obligation to be driven is
  // read off the route's own choice of door rather than off a second hand list.
  // A new money route is therefore covered by existing, which is the property
  // this whole test was rewritten for.
  const spends = found.filter(
    (f) => !isPublic(f) && MONEY_DOORS.some((d) => d.matcher.test(code(readFileSync(join(process.cwd(), f), "utf8")))),
  );
  const driven = new Set(ROUTES.map(([, path]) => `app${path}/route.ts`));
  const undriven = spends.filter((f) => !driven.has(f));
  expect(undriven, "a money/compute route no case below actually drives").toEqual([]);
});

// A stale exemption is its own defect: it reads as a considered decision and is
// really a path that moved.
test("every deliberately-public exemption still names a route that exists", () => {
  for (const rel of [...Object.keys(DELIBERATELY_PUBLIC), ...Object.keys(PUBLIC_CREDENTIAL_DOORS)])
    expect(existsSync(join(process.cwd(), rel)), `${rel} is exempted and does not exist`).toBe(true);
});

/**
 * Every module `rel` imports AT RUNTIME, resolved the way the bundler resolves
 * them: `@/` to the repo root, `./` and `../` beside the importer, then `.ts`,
 * `.tsx`, `/index.ts` tried in that order. `import type` is not a runtime edge
 * and is skipped; a bare package name is not this repo's code and is skipped.
 * A specifier that resolves to nothing is asserted, not ignored — a walk that
 * silently drops an edge reports a smaller graph than the one that ships.
 */
function runtimeImports(rel: string): string[] {
  const src = code(readFileSync(join(process.cwd(), rel), "utf8"));
  const out: string[] = [];
  for (const m of src.matchAll(/^import\s+(?!type\b)[\s\S]*?from\s+["']([^"']+)["']/gm)) {
    const spec = m[1];
    let base: string;
    if (spec.startsWith("@/")) base = spec.slice(2);
    else if (spec.startsWith(".")) base = join(dirname(rel), spec).split("\\").join("/");
    else continue;
    const hit = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((c) => {
      const full = join(process.cwd(), c);
      return existsSync(full) && statSync(full).isFile();
    });
    expect(hit, `${rel} imports "${spec}", which resolves to no file - the walk cannot follow it`).toBeTruthy();
    out.push(hit!);
  }
  return out;
}

/**
 * THE ADMISSION CLAIM IS CHECKED, NOT QUOTED.
 *
 * Each DELIBERATELY_PUBLIC reason above says, in prose, that the route reads no
 * environment and imports nothing that does — so a caller cannot learn from the
 * response whether this deployment holds a key, nor what ceiling an operator
 * set. Until 2026-09-06 that sentence was the only thing holding it: the music
 * entry even says "verified on admission", and nothing re-verified it on any
 * later commit. A `process.env` read added to lib/music/pricing.ts, or an
 * import of lib/music/budget.ts to "show the ceiling too", would have shipped
 * on a public route with this probe green.
 *
 * So the route's runtime import graph is WALKED, and every module reachable
 * from it is asserted to read no `process.env`. The pricing modules are the
 * whole graph today (two files each); the assertion is what keeps that true.
 */
test("every deliberately-public route reads no environment, transitively", () => {
  test.skip(Object.keys(DELIBERATELY_PUBLIC).length === 0, "no deliberately-public route exists since Phase 6 L70 - the walk has nothing to walk");
  for (const [route, why] of Object.entries(DELIBERATELY_PUBLIC)) {
    const seen = new Set<string>();
    const queue = [route];
    while (queue.length) {
      const f = queue.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      queue.push(...runtimeImports(f));
    }
    // The walk followed at least one edge — a route that "imports nothing"
    // means the import matcher stopped seeing imports, not that the route is
    // self-contained.
    expect(seen.size, `${route}: the import walk followed no edge at all`).toBeGreaterThan(1);

    const envReaders = [...seen].filter((f) => /process\.env/.test(code(readFileSync(join(process.cwd(), f), "utf8"))));
    console.log(`[auth] ${route}: ${seen.size} module(s) reachable (${[...seen].filter((f) => f !== route).join(", ")}), ${envReaders.length} read process.env`);
    expect(
      envReaders,
      `${route} is public because "${why.slice(0, 70)}…" — and these modules it reaches read the environment`,
    ).toEqual([]);
  }
});

keepEnv([ACCESS_SECRET_VAR, "NEXT_PUBLIC_DEV_AUTH", RATE_CAPACITY_VAR, RATE_WINDOW_SEC_VAR, RATE_KEY_CAP_VAR]);

test.beforeEach(() => {
  __resetRateLimit();
  process.env[ACCESS_SECRET_VAR] = SECRET; // gate configured for the run
  delete process.env.NEXT_PUBLIC_DEV_AUTH; // no dev bypass during the probe
});

// ── The guard function, in isolation (valid / missing / wrong / unconfigured) ──

test("guard: valid secret ok; missing and wrong are rejected", () => {
  expect(checkAccess(req("/x", { ip: "1.1.1.1", bearer: SECRET }))).toBe("ok");
  expect(checkAccess(req("/x", { ip: "1.1.1.1" }))).toBe("missing");
  expect(checkAccess(req("/x", { ip: "1.1.1.1", bearer: "nope" }))).toBe("wrong");
});

// ── The constant-time compare, and the one thing a behavioural test cannot see ──
//
// `secretsMatch` had its length check on the LEFT of an `&&`, so a presented
// secret of the wrong length returned before `timingSafeEqual` ran — restoring
// the exact timing oracle the zero-padding beside it was written to remove.
//
// BE HONEST ABOUT WHAT EACH HALF BUYS. The behavioural test below did NOT fail
// against the old ordering and cannot: both orderings return the same verdict
// for every input, and the defect is *how long the wrong answer takes*, which no
// assertion over a return value can reach. It is still worth having — nothing
// pinned the equal-length wrong-secret case at all, which is the only case the
// compare itself decides — but the guard on the ACTUAL fix is the source-shape
// test after it, in the idiom gate-vacuous-pass.probe.spec.ts already uses here.
// Writing the behavioural one and calling it the guard would have been precisely
// the coverage theater this suite exists to refuse.
test("guard: a WRONG secret of the RIGHT length is rejected by the compare itself", () => {
  const swap = (i: number) =>
    SECRET.slice(0, i) + (SECRET[i] === "z" ? "y" : "z") + SECRET.slice(i + 1);
  for (const bearer of [swap(0), swap(SECRET.length - 1), swap(Math.floor(SECRET.length / 2))]) {
    expect(bearer.length).toBe(SECRET.length); // the case is only meaningful at equal length
    expect(checkAccess(req("/x", { ip: "1.1.1.1", bearer }))).toBe("wrong");
  }
  // And a correct PREFIX is not a correct secret: the padded compare must not
  // read a short presented value as equal to the leading bytes of the real one.
  expect(checkAccess(req("/x", { ip: "1.1.1.1", bearer: SECRET.slice(0, -1) }))).toBe("wrong");
});

test("guard: the constant-time compare is not short-circuited by its own length check", () => {
  // Reads the source, because the property is not observable from the outside.
  // The rule: within secretsMatch, `timingSafeEqual(...)` must appear BEFORE any
  // `.length ===` comparison, so the compare is unconditional and the length test
  // is ANDed onto its result. Fails against the pre-2026-08-27 ordering.
  const src = readFileSync(join(process.cwd(), "lib", "apiAuth.ts"), "utf8");
  const body = /function secretsMatch\([\s\S]*?\n}/.exec(src)?.[0];
  expect(body, "secretsMatch not found - this guard is pinned to that function").toBeTruthy();
  // Comments explain the hazard and name the wrong shape, so they must not be
  // what the guard reads: strip them, or this passes on prose alone.
  const code = stripComments(body!);
  const cmp = code.indexOf("timingSafeEqual(");
  const len = code.search(/\.length\s*===/);
  console.log(`[auth] secretsMatch: timingSafeEqual@${cmp}, length-check@${len}`);
  expect(cmp).toBeGreaterThan(-1);
  expect(len).toBeGreaterThan(-1);
  expect(cmp, "the length check precedes timingSafeEqual - the wrong-length branch returns early").toBeLessThan(len);
});

test("guard: FAILS CLOSED when no secret is configured", async () => {
  delete process.env[ACCESS_SECRET_VAR];
  // Even a caller presenting *something* is denied — there is nothing to match.
  expect(checkAccess(req("/x", { ip: "1.1.1.1", bearer: "anything" }))).toBe("no-config");
  // ...and the live door every route goes through says the same.
  const denied = await gate(req("/x", { ip: "9.9.9.9", bearer: "anything" }), "money");
  expect(denied?.status).toBe(401);
});

test("guard: the x-imaging-access-secret header is also accepted", () => {
  const r = new Request("http://localhost/x", {
    method: "POST",
    headers: { "x-imaging-access-secret": SECRET, "x-forwarded-for": "2.2.2.2" },
  });
  expect(checkAccess(r)).toBe("ok");
});

// ── The rate limiter: refuses past capacity, then through route()'s money guard ──

test("rate limit: refuses once the per-IP bucket is drained", () => {
  process.env.IMAGING_RATE_CAPACITY = "5";
  process.env.IMAGING_RATE_WINDOW_SEC = "60";
  const ip = "10.0.0.7";
  const now = 1_000_000;
  let allowed = 0;
  let refused = 0;
  for (let i = 0; i < 8; i++) {
    if (rateLimit(ip, now).allowed) allowed++;
    else refused++;
  }
  console.log(`[auth] capacity=5 over 8 calls -> allowed=${allowed}, refused=${refused}`);
  expect(allowed).toBe(5);
  expect(refused).toBe(3);
  delete process.env.IMAGING_RATE_CAPACITY;
  delete process.env.IMAGING_RATE_WINDOW_SEC;
});

test("rate limit: the money guard refuses a flood past capacity (before it even checks auth)", async () => {
  process.env.IMAGING_RATE_CAPACITY = "3";
  const ip = "10.0.0.9";
  const verdicts: string[] = [];
  for (let i = 0; i < 5; i++) {
    // No bearer at all - proves the limit outranks the 401 for a flood. route() has no 429:
    // the limit is `unavailable` (503) with Retry-After and `detail: rate-limited`.
    const res = await gate(req("/api/x-money", { ip }), "money");
    verdicts.push(res === null ? "admitted" : `${res.status}:${(await bodyOf(res))?.detail ?? ""}`);
  }
  console.log(`[auth] flood verdicts = ${verdicts.join(",")}`);
  expect(verdicts[0]).toMatch(/^401:/);
  expect(verdicts.filter((v) => v === "503:rate-limited").length).toBeGreaterThanOrEqual(1);
  delete process.env.IMAGING_RATE_CAPACITY;
});

// ── A knob below one is misconfiguration, floored like claudeCli's timeout ──

test("rate limit: a fractional CAPACITY does not refuse everything forever — it is floored", () => {
  // 0.5 tokens of capacity: every fresh bucket starts under one token, so
  // before the floor EVERY call was refused with a retry-after nothing could
  // satisfy. A knob cannot be an outage.
  __resetRateLimit();
  process.env.IMAGING_RATE_CAPACITY = "0.5";
  const now = 1_000_000;
  let allowed = 0;
  for (let i = 0; i < 5; i++) if (rateLimit("10.4.0.1", now).allowed) allowed++;
  console.log(`[auth] capacity=0.5 over 5 calls -> allowed=${allowed}`);
  expect(allowed).toBe(5);
  expect(rateStats().capacity).toBe(30);
  delete process.env.IMAGING_RATE_CAPACITY;
  __resetRateLimit();
});

test("rate limit: a fractional KEY CAP does not switch the limiter off — it is floored", () => {
  // 0.5 floored to a cap of 0: the reaper ran on every call and evicted every
  // bucket before the current key was inserted, so each call saw a fresh full
  // bucket and NOTHING was ever refused, with the counters reading healthy.
  __resetRateLimit();
  process.env.IMAGING_RATE_CAPACITY = "3";
  process.env.IMAGING_RATE_KEY_CAP = "0.5";
  const now = 1_000_000;
  let allowed = 0;
  for (let i = 0; i < 6; i++) if (rateLimit("10.4.0.2", now).allowed) allowed++;
  console.log(`[auth] keyCap=0.5 capacity=3 over 6 calls -> allowed=${allowed} keyCap=${rateStats().keyCap}`);
  expect(allowed).toBe(3);
  expect(rateStats().keyCap).toBe(10_000);
  delete process.env.IMAGING_RATE_CAPACITY;
  delete process.env.IMAGING_RATE_KEY_CAP;
  __resetRateLimit();
});

// ── The limiter watches itself, and bounds itself (added 2026-08-24) ────────
//
// Before this, `rateLimit` returned a verdict and kept nothing: no admitted or
// refused series, no near-limit signal, and a `buckets` Map that grew one entry
// per client IP forever with no cap and no staleness rule. A rate limiter whose
// own memory is the unbounded resource is defending the wrong thing.

test("limiter counters: admissions and refusals are both counted", () => {
  process.env[RATE_CAPACITY_VAR] = "5";
  process.env[RATE_WINDOW_SEC_VAR] = "60";
  const now = 2_000_000;
  for (let i = 0; i < 8; i++) rateLimit("10.1.0.1", now);

  const s = rateStats();
  console.log(`[auth] admitted=${s.counters.admitted} refused=${s.counters.refused} keys=${s.keys}`);
  expect(s.counters.admitted).toBe(5);
  expect(s.counters.refused).toBe(3);
  // The configured bounds travel WITH the counts, so a reader cannot disagree
  // with the limiter about what the limit was.
  expect(s.capacity).toBe(5);
  expect(s.windowSec).toBe(60);
  expect(s.keys).toBe(1);
  delete process.env[RATE_CAPACITY_VAR];
  delete process.env[RATE_WINDOW_SEC_VAR];
});

test("limiter counters: pressure is announced ONCE per approach, before refusal", () => {
  process.env[RATE_CAPACITY_VAR] = "10";
  process.env[RATE_WINDOW_SEC_VAR] = "60";
  const now = 2_000_000;
  // 10 tokens; the near-limit share is 20%, so the warning arrives when fewer
  // than 2 remain — i.e. on the 9th call — and NOT again on the 10th.
  for (let i = 0; i < 10; i++) rateLimit("10.1.0.2", now);
  const after = rateStats();
  console.log(`[auth] nearLimit=${after.counters.nearLimit} refused=${after.counters.refused}`);
  expect(after.counters.nearLimit).toBe(1);
  // The point of the warning is that it precedes refusal, not accompanies it.
  expect(after.counters.refused).toBe(0);

  // A full window later the bucket has refilled, and the NEXT descent warns
  // again — the flag is per approach, not once per process.
  for (let i = 0; i < 10; i++) rateLimit("10.1.0.2", now + 60_000);
  expect(rateStats().counters.nearLimit).toBe(2);
  delete process.env[RATE_CAPACITY_VAR];
  delete process.env[RATE_WINDOW_SEC_VAR];
});

test("reaper: a FULL, idle bucket is dropped — and dropping it costs no enforcement", () => {
  process.env[RATE_CAPACITY_VAR] = "5";
  process.env[RATE_WINDOW_SEC_VAR] = "60";
  const t0 = 3_000_000;
  rateLimit("10.2.0.1", t0); // 4 tokens left — NOT full
  rateLimit("10.2.0.2", t0);
  expect(rateStats().keys).toBe(2);

  // Two idle windows later both have refilled to capacity, so both are
  // information-free: recreating either produces exactly the state dropped.
  __reapNow(t0 + 121_000);
  const s = rateStats();
  console.log(`[auth] reaped -> keys=${s.keys} evictedIdle=${s.counters.evictedIdle}`);
  expect(s.keys).toBe(0);
  expect(s.counters.evictedIdle).toBe(2);
  expect(s.counters.evictedPressure).toBe(0);
  expect(s.counters.lastEvictionAt).toBe(t0 + 121_000);

  // The proof that it cost nothing: the recreated bucket admits exactly what a
  // surviving one would have.
  let allowed = 0;
  for (let i = 0; i < 8; i++) if (rateLimit("10.2.0.1", t0 + 121_000).allowed) allowed++;
  expect(allowed).toBe(5);
  delete process.env[RATE_CAPACITY_VAR];
  delete process.env[RATE_WINDOW_SEC_VAR];
});

test("reaper: a bucket still holding someone survives — the hold is not laundered", () => {
  // The failure this forbids: a caller who has been refused waits a moment, the
  // reaper drops their bucket, and their allowance comes back for free. The idle
  // pass drops a bucket only when it is BOTH full at `now` AND untouched for two
  // windows, and this pins the first half of that conjunction.
  //
  // Note the second half cannot be pinned separately, and the reason is
  // arithmetic rather than an oversight: the bucket refills at capacity/window,
  // so after two idle windows EVERY bucket is full by construction. Two windows
  // of silence is exactly when the hold has genuinely expired — which is why
  // "full and idle" is the right predicate and not a coincidence of two.
  process.env[RATE_CAPACITY_VAR] = "3";
  process.env[RATE_WINDOW_SEC_VAR] = "60";
  const t0 = 4_000_000;
  for (let i = 0; i < 4; i++) rateLimit("10.3.0.1", t0); // drained: 3 admitted, 1 refused
  expect(rateStats().counters.refused).toBe(1);

  // Half a window later it has refilled to 1.5 of 3 — not full, so not
  // information-free, so it stays and keeps holding what it holds.
  __reapNow(t0 + 30_000);
  console.log(`[auth] partially-refilled bucket after reap -> keys=${rateStats().keys}`);
  expect(rateStats().keys).toBe(1);
  expect(rateStats().counters.evictedIdle).toBe(0);

  // And the hold is real: only the 1 refilled token is available, not 3.
  let allowed = 0;
  for (let i = 0; i < 3; i++) if (rateLimit("10.3.0.1", t0 + 30_000).allowed) allowed++;
  expect(allowed).toBe(1);
  delete process.env[RATE_CAPACITY_VAR];
  delete process.env[RATE_WINDOW_SEC_VAR];
});

test("reaper: the key population is BOUNDED by the cap, not by the caller", () => {
  // The unbounded-growth defect, driven: `x-forwarded-for` is attacker-controlled,
  // so a spray of forged values used to grow the Map without limit for the life
  // of the process.
  process.env[RATE_KEY_CAP_VAR] = "50";
  process.env[RATE_CAPACITY_VAR] = "1000000"; // every bucket stays non-full
  process.env[RATE_WINDOW_SEC_VAR] = "100000000";
  const t0 = 5_000_000;
  for (let i = 0; i < 500; i++) rateLimit(`10.4.${Math.floor(i / 256)}.${i % 256}`, t0);

  const s = rateStats();
  console.log(
    `[auth] sprayed 500 keys, cap=50 -> keys=${s.keys} peak=${s.counters.peakKeys} ` +
      `evictedPressure=${s.counters.evictedPressure}`,
  );
  expect(s.keys).toBeLessThanOrEqual(50);
  // The pressure pass is counted APART from the idle pass, because unlike the
  // idle pass it can cost enforcement and must never be read as free.
  expect(s.counters.evictedPressure).toBeGreaterThan(0);
  expect(s.counters.evictedIdle).toBe(0);
  expect(s.counters.peakKeys).toBeLessThanOrEqual(50);
  delete process.env[RATE_KEY_CAP_VAR];
  delete process.env[RATE_CAPACITY_VAR];
  delete process.env[RATE_WINDOW_SEC_VAR];
});

test("limiter counters: the meter reads, it does not decide", () => {
  // The regression a counter beside a gate always risks: becoming a condition
  // inside it. A limiter with a long refusal history admits exactly what a fresh
  // one admits.
  process.env[RATE_CAPACITY_VAR] = "2";
  process.env[RATE_WINDOW_SEC_VAR] = "60";
  const t0 = 6_000_000;
  for (let i = 0; i < 10; i++) rateLimit("10.5.0.1", t0);
  expect(rateStats().counters.refused).toBe(8);

  // A different key, same process, same instant: unaffected by the history above.
  let allowed = 0;
  for (let i = 0; i < 5; i++) if (rateLimit("10.5.0.2", t0).allowed) allowed++;
  expect(allowed).toBe(2);
  delete process.env[RATE_CAPACITY_VAR];
  delete process.env[RATE_WINDOW_SEC_VAR];
});

// ── CLI tokens (Phase 2, lot 17): one credential per caller, in place of the secret ──
//
// Judged by route()'s guard (app/_server/route.ts guardOf - v1's resolvePrincipal and
// rateLimit, answered as the one envelope `{error, code, detail}` with v1's refusal name in
// `detail`) against a REAL kernel store in a temp file, opened through the app's own accessor
// (lib/kernelStore.ts), so the token minted here is the token the door reads. The shared secret
// stays configured throughout: a token must be judged as a token even on a server where the
// secret would have passed. (Phase 6 L70: these drove v1's guardRequest/guardAccessOnly and
// /api/imaging/generate; no route calls either door now.)

// LOADED THE WAY THE DOOR LOADS THEM. lib/principal.ts reaches the kernel by a
// dynamic import (only when a token is presented), so this file does too: in
// this lane a `type: module` workspace file required by one path and imported
// by the other is evaluated twice, once in the wrong module system.
type TokenMod = typeof import("@gt/kernel/token");
type KernelMod = typeof import("@/lib/kernelStore");
type GuardOf = (typeof import("../../app/_server/route.ts"))["guardOf"];
let tk: TokenMod;
let km: KernelMod;
let guardOf: GuardOf;
const tokenDir = mkdtempSync(join(tmpdir(), "gt-l17-auth-"));
const OPERATOR = { kind: "operator", id: "probe" } as const;
keepEnv(["GRAVITONE_STORE_PATH", SHARED_SECRET_CALLERS_VAR, RATE_CAPACITY_VAR, "PRINCIPAL_MODE"]);
test.beforeAll(async () => {
  tk = await import("@gt/kernel/token");
  km = await import("../../lib/kernelStore.ts");
  guardOf = (await import("../../app/_server/route.ts")).guardOf;
});
test.afterAll(() => {
  km?.closeKernel();
  rmSync(tokenDir, { recursive: true, force: true });
});

/** route()'s guard as a door: the refusal it would answer, or null when it admits. */
async function gate(r: Request, guard: "money" | "access"): Promise<Response | null> {
  const g = await guardOf(r, guard);
  return "refusal" in g ? g.refusal : null;
}

function store() {
  process.env.GRAVITONE_STORE_PATH = join(tokenDir, "auth.sqlite");
  const k = km.kernel();
  if (!k.ok) throw new Error(k.error.message);
  return k.value.store;
}
function mint(scope: "money" | "read" = "money"): { id: string; token: string } {
  const r = store().tx((t) => tk.mintToken(t, { name: `probe-${scope}`, scope }, OPERATOR));
  if (!r.ok) throw new Error(r.error.message);
  return { id: r.value.record.id, token: r.value.token };
}
const MONEY_PATH = "/api/x-money";
let tokenIp = 0;
const nextIp = () => `172.20.0.${++tokenIp}`;
const bodyOf = async (r: Response | null) => (r === null ? null : ((await r.json()) as { error?: string; code?: string; detail?: string }));

test("token: a minted money token passes the money guard as itself", async () => {
  const { token } = mint("money");
  expect(await gate(req(MONEY_PATH, { ip: nextIp(), bearer: token }), "money")).toBeNull();
  const who = await resolvePrincipal(req(MONEY_PATH, { ip: nextIp(), bearer: token }), { use: "money" });
  expect(who).toMatchObject({ kind: "cli-token", name: "probe-money", scope: "money" });
});

test("token: a read token is 403 on a money route and admitted on a read route", async () => {
  const { token } = mint("read");
  const money = await gate(req(MONEY_PATH, { ip: nextIp(), bearer: token }), "money");
  expect(money?.status).toBe(403);
  expect(await bodyOf(money)).toMatchObject({ code: "refused", detail: "token-scope" });
  expect(await gate(req("/api/ledger", { ip: nextIp(), bearer: token }), "access")).toBeNull();
});

test("token: revoked, expired and unknown are 401, each naming the fix", async () => {
  const { id, token } = mint("money");
  const unknown = token.replace(/_[^_]+$/, `_${"A".repeat(43)}`);
  const u = await gate(req(MONEY_PATH, { ip: nextIp(), bearer: unknown }), "money");
  expect(u?.status).toBe(401);
  expect(await bodyOf(u)).toMatchObject({ detail: "token-unknown", error: expect.stringContaining("pipeline/token.mts mint") });
  const later = Date.now() + 31 * 24 * 3_600_000;
  expect(await resolvePrincipal(req(MONEY_PATH, { ip: nextIp(), bearer: token }), { use: "money", now: later })).toMatchObject({ status: 401, code: "token-expired" });
  const r = store().tx((t) => tk.revokeToken(t, id, OPERATOR));
  expect(r.ok).toBe(true);
  const gone = await gate(req(MONEY_PATH, { ip: nextIp(), bearer: token }), "money");
  expect(gone?.status).toBe(401);
  expect(await bodyOf(gone)).toMatchObject({ detail: "token-revoked" });
});

test("token: judged in verified mode too, and a bad one never falls through to the secret", async () => {
  const { token } = mint("money");
  process.env.PRINCIPAL_MODE = "verified";
  expect(await resolvePrincipal(req(MONEY_PATH, { ip: nextIp(), bearer: token }), { use: "money" })).toMatchObject({ kind: "cli-token" });
  delete process.env.PRINCIPAL_MODE;
  // Legacy, secret configured, and the bad token is still refused for itself.
  const bad = `gt_ffffffffffff_${"B".repeat(43)}`;
  const r = new Request(`http://localhost${MONEY_PATH}`, { method: "POST", headers: { authorization: `Bearer ${bad}`, "x-imaging-access-secret": SECRET, "x-forwarded-for": nextIp() } });
  expect((await gate(r, "money"))?.status).toBe(401);
});

test("token: the money bucket keys on the token id, whatever address it arrives from", async () => {
  const { token } = mint("money");
  process.env[RATE_CAPACITY_VAR] = "2";
  const statuses: number[] = [];
  for (let i = 0; i < 3; i++) statuses.push((await gate(req(MONEY_PATH, { ip: nextIp(), bearer: token }), "money"))?.status ?? 200);
  // route() has no 429: the limit is `unavailable`, a retry.
  expect(statuses).toEqual([200, 200, 503]);
});

test("token: never accepted from a URL", async () => {
  // v1's byte-serves rebuilt `?k=` into an Authorization header; the door still recognises a
  // token that arrives both ways and refuses it, rather than admit a month-long credential that
  // has been through an access log.
  const { token } = mint("money");
  const viaK = new Request(`http://localhost/api/foundry/file?k=${encodeURIComponent(token)}`, { headers: { authorization: `Bearer ${token}` } });
  const res = await gate(viaK, "access");
  expect(res?.status).toBe(401);
  expect(await bodyOf(res)).toMatchObject({ detail: "token-in-url" });
});

test("token: no store, no token - fails closed with 503, never open", async () => {
  const { token } = mint("money");
  const blocker = join(tokenDir, "not-a-dir");
  writeFileSync(blocker, "x");
  process.env.GRAVITONE_STORE_PATH = join(blocker, "store.sqlite");
  const res = await gate(req(MONEY_PATH, { ip: nextIp(), bearer: token }), "money");
  expect(res?.status).toBe(503);
  expect(await bodyOf(res)).toMatchObject({ detail: "token-store-unavailable" });
});

test("shared secret: SHARED_SECRET_CALLERS=browser refuses it on a money route from a CLI, admits a browser's fetch", async () => {
  // Unset: today's gate, unchanged.
  expect(await gate(req(MONEY_PATH, { ip: nextIp(), bearer: SECRET }), "money")).toBeNull();
  process.env[SHARED_SECRET_CALLERS_VAR] = "browser";
  const cli = await gate(req(MONEY_PATH, { ip: nextIp(), bearer: SECRET }), "money");
  expect(cli?.status).toBe(401);
  expect(await bodyOf(cli)).toMatchObject({ detail: "shared-secret-cli", error: expect.stringContaining("GRAVITONE_CLI_TOKEN") });
  const browser = new Request(`http://localhost${MONEY_PATH}`, { method: "POST", headers: { authorization: `Bearer ${SECRET}`, "sec-fetch-site": "same-origin", "x-forwarded-for": nextIp() } });
  expect(await gate(browser, "money")).toBeNull();
  // A read route keeps the secret: it spends nothing.
  expect(await gate(req("/api/ledger", { ip: nextIp(), bearer: SECRET }), "access")).toBeNull();
  // A typo is the closed posture, not the open one.
  process.env[SHARED_SECRET_CALLERS_VAR] = "browsr";
  expect((await gate(req(MONEY_PATH, { ip: nextIp(), bearer: SECRET }), "money"))?.status).toBe(401);
});
