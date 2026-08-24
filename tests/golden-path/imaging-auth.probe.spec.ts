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
import { test, expect } from "@playwright/test";
import {
  checkAccess,
  guardRequest,
  rateLimit,
  __resetRateLimit,
  ACCESS_SECRET_VAR,
} from "@/lib/apiAuth";
import { POST as generatePOST } from "@/app/api/imaging/generate/route";
import { POST as editPOST } from "@/app/api/imaging/edit/route";
import { POST as recognizePOST } from "@/app/api/imaging/recognize/route";
import { POST as framesPOST } from "@/app/api/frames/route";

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
];

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
