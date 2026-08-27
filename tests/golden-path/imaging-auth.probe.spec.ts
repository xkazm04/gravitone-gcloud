// LANE — UNAUTHENTICATED-SPENDING-ROUTE (dynamic).
//
// The four routes app/api/imaging/{generate,edit,recognize} and app/api/frames
// each spend a real vendor balance or local Claude-CLI compute. Before this
// gate, none checked WHO was calling — a request at the origin billed the
// operator's keys. This probe drives the ACTUAL exported route handlers (Node
// context, no server) and the ACTUAL guard, and pins the contract:
//
//   · every route returns 401 to an unauthenticated caller (FAILS against the
//     pre-fix routes — that is the point: it proves they did not block);
//   · a valid secret passes the guard (the route then 4xx's on the bad body,
//     never 401 — proving the guard let it through WITHOUT spending);
//   · the rate limiter refuses past its capacity with 429.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { test, expect } from "@playwright/test";
import {
  checkAccess,
  guardRequest,
  rateLimit,
  rateStats,
  __reapNow,
  __resetRateLimit,
  ACCESS_SECRET_VAR,
  RATE_CAPACITY_VAR,
  RATE_KEY_CAP_VAR,
  RATE_WINDOW_SEC_VAR,
} from "@/lib/apiAuth";
import { POST as generatePOST } from "@/app/api/imaging/generate/route";
import { POST as editPOST } from "@/app/api/imaging/edit/route";
import { POST as recognizePOST } from "@/app/api/imaging/recognize/route";
import { POST as framesPOST } from "@/app/api/frames/route";
import { POST as recalibratePOST } from "@/app/api/recalibrate/route";
import { POST as musicPlanPOST } from "@/app/api/music/plan/route";
import { POST as musicComposePOST } from "@/app/api/music/compose/route";
import { POST as musicGeneratePOST } from "@/app/api/music/generate/route";
import { POST as musicSfxPOST } from "@/app/api/music/sfx/route";

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

const ROUTES: [string, string, (r: Request) => Promise<Response>][] = [
  ["generate", "/api/imaging/generate", generatePOST],
  ["edit", "/api/imaging/edit", editPOST],
  ["recognize", "/api/imaging/recognize", recognizePOST],
  ["frames", "/api/frames", framesPOST],
  ["recalibrate", "/api/recalibrate", recalibratePOST],
  ["music/plan", "/api/music/plan", musicPlanPOST],
  ["music/compose", "/api/music/compose", musicComposePOST],
  ["music/generate", "/api/music/generate", musicGeneratePOST],
  ["music/sfx", "/api/music/sfx", musicSfxPOST],
];

/**
 * Routes that are PUBLIC on purpose, each with the reason it is.
 *
 * The list below the fold is derived from the filesystem; this is the only place
 * a route may be excluded from it, and an entry here is a claim somebody has to
 * defend in review rather than an omission nobody sees.
 */
const DELIBERATELY_PUBLIC: Record<string, string> = {
  "app/api/imaging/pricing/route.ts":
    "the price table, audited line by line in its own header: module constants only, no key, no environment, no key state, nothing per-request",
};

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
    if (DELIBERATELY_PUBLIC[rel]) continue;
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    if (!/\bguardRequest\s*\(/.test(src)) ungated.push(rel);
  }
  console.log(`[auth] ${found.length} route(s) on disk, ${Object.keys(DELIBERATELY_PUBLIC).length} deliberately public, ${ungated.length} ungated`);
  expect(ungated, "these routes spend money or compute and check nobody").toEqual([]);

  // And the DRIVEN list must not fall behind the tree either, or the cases below
  // stop covering routes that exist.
  const driven = new Set(ROUTES.map(([, path]) => `app${path}/route.ts`));
  const undriven = found.filter((f) => !DELIBERATELY_PUBLIC[f] && !driven.has(f));
  expect(undriven, "a gated route no case below actually drives").toEqual([]);
});

// A stale exemption is its own defect: it reads as a considered decision and is
// really a path that moved.
test("every deliberately-public exemption still names a route that exists", () => {
  for (const rel of Object.keys(DELIBERATELY_PUBLIC))
    expect(existsSync(join(process.cwd(), rel)), `${rel} is exempted and does not exist`).toBe(true);
});

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
  const code = body!.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const cmp = code.indexOf("timingSafeEqual(");
  const len = code.search(/\.length\s*===/);
  console.log(`[auth] secretsMatch: timingSafeEqual@${cmp}, length-check@${len}`);
  expect(cmp).toBeGreaterThan(-1);
  expect(len).toBeGreaterThan(-1);
  expect(cmp, "the length check precedes timingSafeEqual - the wrong-length branch returns early").toBeLessThan(len);
});

test("guard: FAILS CLOSED when no secret is configured", () => {
  delete process.env[ACCESS_SECRET_VAR];
  // Even a caller presenting *something* is denied — there is nothing to match.
  expect(checkAccess(req("/x", { ip: "1.1.1.1", bearer: "anything" }))).toBe("no-config");
  const denied = guardRequest(req("/x", { ip: "9.9.9.9", bearer: "anything" }));
  expect(denied?.status).toBe(401);
});

test("guard: the x-imaging-access-secret header is also accepted", () => {
  const r = new Request("http://localhost/x", {
    method: "POST",
    headers: { "x-imaging-access-secret": SECRET, "x-forwarded-for": "2.2.2.2" },
  });
  expect(checkAccess(r)).toBe("ok");
});

// ── The rate limiter: refuses past capacity, then 429 through guardRequest ──

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

test("rate limit: guardRequest answers 429 past capacity (before it even checks auth)", () => {
  process.env.IMAGING_RATE_CAPACITY = "3";
  const ip = "10.0.0.9";
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) {
    // no bearer at all — proves 429 outranks the 401 for a flood
    const res = guardRequest(req("/api/imaging/generate", { ip }));
    statuses.push(res ? res.status : 200);
  }
  console.log(`[auth] flood statuses = ${statuses.join(",")}`);
  expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
  delete process.env.IMAGING_RATE_CAPACITY;
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

// ── The real routes: 401 without auth (the fail-before), pass with it ──

for (const [name, path, handler] of ROUTES) {
  test(`route ${name}: 401 without auth, and NO vendor call is made`, async () => {
    const res = await handler(req(path, { ip: `172.16.0.${ROUTES.findIndex((x) => x[0] === name) + 1}` }));
    console.log(`[auth] ${name} unauthenticated -> ${res.status}`);
    expect(res.status).toBe(401);
  });

  test(`route ${name}: a valid secret PASSES the guard (4xx on bad body, never 401)`, async () => {
    // Valid auth + deliberately invalid body: the guard must let it through, and
    // the route rejects the body BEFORE spending. So: not 401, and not a 5xx
    // vendor error either — a clean client 4xx.
    const res = await handler(req(path, { ip: `172.16.1.${ROUTES.findIndex((x) => x[0] === name) + 1}`, bearer: SECRET, body: {} }));
    console.log(`[auth] ${name} authed+bad-body -> ${res.status}`);
    expect(res.status).not.toBe(401);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
}
