// LANE — A COMPUTE RUN'S INPUT IS BOUNDED (dynamic).
//
// /api/frames spends the operator's own Claude subscription. It checked that
// `beats` was a non-empty array and `style` was truthy, and nothing else — so a
// caller could send fifty megabytes of beats down stdin and buy a proportionally
// enormous run, once per rate-limit slot. The limiter bounds calls per minute; it
// has never bounded what one call costs.
//
// The sibling compute route already does this: app/api/music/generate/route.ts
// caps every field it accepts, because it spends a vendor balance. This one
// spends a subscription, which is not free either.
//
// The probe drives the REAL exported handler and asserts the thing that matters
// most: an oversized run is refused WITHOUT the CLI being spawned. A 413 that
// still paid for the run would be worse than no check.
import { test, expect } from "@playwright/test";

import { POST, tooLarge } from "@/app/api/frames/route";
import { __resetRateLimit, ACCESS_SECRET_VAR } from "@/lib/apiAuth";

const SECRET = "probe-secret-value";

test.beforeEach(() => {
  __resetRateLimit();
  process.env[ACCESS_SECRET_VAR] = SECRET;
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
});

/** An authenticated POST at the route, with a distinct IP so the limiter's
 *  buckets never bleed between cases. */
function req(body: unknown, ip: string): Request {
  return new Request("http://localhost/api/frames", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SECRET}`,
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

const beat = (i: number) => ({ at: `0:${String(i).padStart(2, "0")}`, text: `beat ${i}` });
const STYLE = { technique: "flat vector", palette: [] };

test("a run with too many beats is refused, and never reaches the engine", async () => {
  const started = Date.now();
  const res = await POST(req({ beats: Array.from({ length: 5_000 }, (_, i) => beat(i)), style: STYLE }, "10.9.0.1"));
  const body = (await res.json()) as { code?: string; detail?: string };
  console.log(`[frames] 5000 beats -> ${res.status} ${body.code} in ${Date.now() - started}ms`);
  expect(res.status).toBe(413);
  expect(body.code).toBe("too-large");
  // A real dispatch spawns `claude` and takes seconds at minimum. Returning in
  // well under a second is the evidence that nothing was run.
  expect(Date.now() - started, "the run appears to have been dispatched").toBeLessThan(2_000);
});

test("a run whose MATERIAL is oversized is refused even when the counts are fine", async () => {
  // Twelve beats, one of which carries a megabyte. Counting rows alone would
  // have waved this through, which is why the ceiling is on size as well.
  const beats = Array.from({ length: 12 }, (_, i) => beat(i));
  (beats[0] as Record<string, unknown>).text = "x".repeat(1_100_000);
  const res = await POST(req({ beats, style: STYLE }, "10.9.0.2"));
  const body = (await res.json()) as { code?: string; detail?: string };
  console.log(`[frames] one 1.1MB beat -> ${res.status} ${body.code}`);
  expect(res.status).toBe(413);
  expect(body.code).toBe("too-large");
  expect(body.detail, "the refusal should say nothing was dispatched").toMatch(/nothing was dispatched/i);
});

test("too many facts is refused, and the message names the facts rather than the beats", async () => {
  const res = await POST(
    req({ beats: [beat(0)], style: STYLE, facts: Array.from({ length: 5_000 }, (_, i) => ({ id: `f-${i}` })) }, "10.9.0.3"),
  );
  const body = (await res.json()) as { detail?: string };
  expect(res.status).toBe(413);
  expect(body.detail).toMatch(/facts/i);
});

test("an ordinary run is NOT refused by the bounds", () => {
  // The GUARD, not the route: getting past the bounds through POST means
  // dispatching a real Claude run, and a probe that spends the operator's
  // subscription to prove a limit is not a probe.
  const ordinary = {
    beats: Array.from({ length: 40 }, (_, i) => beat(i)),
    style: STYLE,
    facts: Array.from({ length: 60 }, (_, i) => ({ id: `f-${i}`, claim: "a sentence about the world" })),
    schema: { type: "object" },
  };
  expect(tooLarge(ordinary), "a normal script was refused as too large").toBeNull();
});

test("the ceiling sits far above real work and far below a bill nobody authorised", () => {
  // Both directions, so the bound is pinned rather than merely present.
  expect(tooLarge({ beats: Array.from({ length: 400 }, (_, i) => beat(i)), style: STYLE })).toBeNull();
  expect(tooLarge({ beats: Array.from({ length: 401 }, (_, i) => beat(i)), style: STYLE })).toMatch(/beats/);
});

test("an unserialisable body is refused rather than crashing the handler", () => {
  const circular: Record<string, unknown> = { at: "0:00" };
  circular.self = circular;
  expect(tooLarge({ beats: [circular], style: STYLE })).toMatch(/characters/);
});

test("the bounds sit BEHIND the access gate — an unauthenticated caller is still 401", async () => {
  // Order matters: a route that reported 413 to an anonymous caller would be
  // telling them about its limits before it told them to go away.
  const res = await POST(
    new Request("http://localhost/api/frames", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.9.0.5" },
      body: JSON.stringify({ beats: Array.from({ length: 5_000 }, (_, i) => beat(i)), style: STYLE }),
    }),
  );
  expect(res.status).toBe(401);
});
