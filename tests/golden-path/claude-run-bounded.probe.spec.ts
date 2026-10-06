// LANE — EVERY ROUTE THAT SPENDS A CLAUDE RUN BOUNDS WHAT IT IS SENT (dynamic + source).
//
// /api/frames refuses an oversized run with a 413 before anything is spawned
// (frames-run-bounded.probe.spec.ts). Its two siblings that reach the same
// engine through lib/text/router - /api/recalibrate (an 800s Opus run) and
// /api/script (an 800s compose run) - checked only that their fields were
// present, so one caller could send megabytes of notebook down stdin and buy a
// proportionally enormous run, once per rate-limit slot.
//
// The PATH is emptied for the dynamic cases: if a bound is missing the run
// reaches the engine and fails as an engine error, not as a 413, and no real
// CLI can be spawned in the meantime.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

import { keepEnv, stripComments } from "./_helpers";

import { POST as recalibrate, tooLarge as recalibrateTooLarge } from "@/app/api/recalibrate/route";
import { POST as script, tooLarge as scriptTooLarge } from "@/app/api/script/route";
import { __resetRateLimit, ACCESS_SECRET_VAR } from "@/lib/apiAuth";

const SECRET = "probe-secret-value";

keepEnv([ACCESS_SECRET_VAR, "NEXT_PUBLIC_DEV_AUTH", "PATH", "Path", "GEMINI_API_KEY", "GOOGLE_API_KEY"]);

test.beforeEach(() => {
  __resetRateLimit();
  process.env[ACCESS_SECRET_VAR] = SECRET;
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  process.env.PATH = "";
  process.env.Path = "";
});

function req(url: string, body: unknown, ip: string, authed = true): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authed ? { authorization: `Bearer ${SECRET}` } : {}),
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

const FIVE_MB = "x".repeat(5_000_000);
const NOTES = [{ kind: "custom", text: "make the hook shorter" }];

type Refusal = { code?: string; detail?: string };

test("/api/recalibrate: a 5MB notebook is refused 413 before any engine is reached", async () => {
  const started = Date.now();
  const res = await recalibrate(req("/api/recalibrate", { notebook: { filler: FIVE_MB }, renders: [], notes: NOTES }, "10.8.0.1"));
  const body = (await res.json()) as Refusal;
  console.log(`[recalibrate] 5MB notebook -> ${res.status} ${body.code} in ${Date.now() - started}ms`);
  expect(res.status).toBe(413);
  expect(body.code).toBe("too-large");
  expect(body.detail).toMatch(/notebook/);
  expect(body.detail).toMatch(/Nothing was dispatched/);
  expect(Date.now() - started).toBeLessThan(2_000);
});

test("/api/recalibrate: oversized renders are refused too, naming the renders", async () => {
  const res = await recalibrate(req("/api/recalibrate", { notebook: {}, renders: [{ id: "r1", beats: [FIVE_MB] }], notes: NOTES }, "10.8.0.2"));
  const body = (await res.json()) as Refusal;
  expect(res.status).toBe(413);
  expect(body.detail).toMatch(/renders/);
});

test("/api/script: a 5MB notebook is refused 413 before any engine is reached", async () => {
  const started = Date.now();
  const res = await script(req("/api/script", { notebook: { filler: FIVE_MB }, template: "explainer", targetS: 90 }, "10.8.0.3"));
  const body = (await res.json()) as Refusal;
  console.log(`[script] 5MB notebook -> ${res.status} ${body.code} in ${Date.now() - started}ms`);
  expect(res.status).toBe(413);
  expect(body.code).toBe("too-large");
  expect(body.detail).toMatch(/notebook/);
  expect(Date.now() - started).toBeLessThan(2_000);
});

test("the bounds sit BEHIND the access gate - an anonymous caller is still 401", async () => {
  for (const [name, post, url] of [
    ["recalibrate", recalibrate, "/api/recalibrate"],
    ["script", script, "/api/script"],
  ] as const) {
    const res = await post(req(url, { notebook: { filler: FIVE_MB }, renders: [], notes: NOTES }, "10.8.0.4", false));
    expect(res.status, name).toBe(401);
  }
});

test("an ordinary run is NOT refused, and the ceiling is pinned from both sides", () => {
  const ordinary = { notebook: { facts: Array.from({ length: 200 }, (_, i) => ({ id: `f-${i}`, claim: "a sentence about the world" })) }, renders: [], scope: {}, notes: NOTES };
  expect(recalibrateTooLarge(ordinary)).toBeNull();
  expect(scriptTooLarge(ordinary)).toBeNull();
  expect(recalibrateTooLarge({ notebook: "x".repeat(990_000) })).toBeNull();
  expect(recalibrateTooLarge({ notebook: "x".repeat(1_010_000) })).toMatch(/notebook/);
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  expect(scriptTooLarge({ notebook: circular })).toMatch(/unserialisable/);
});

test("every route under app/api that reaches the text router carries a size bound", () => {
  const root = path.join(process.cwd(), "app", "api");
  const routes: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") routes.push(p);
    }
  };
  walk(root);
  expect(routes.length, "the walk read no routes").toBeGreaterThan(10);

  const spawners = routes.filter((f) => /@\/lib\/(text\/router|claudeCli)/.test(stripComments(readFileSync(f, "utf8"))));
  expect(spawners.length, "no route was found that reaches the engine").toBeGreaterThanOrEqual(4);
  const unbounded = spawners.filter((f) => !/\b413\b|MAX_[A-Z_]*(CHARS|RUN)\b|\btooLarge\b/.test(stripComments(readFileSync(f, "utf8"))));
  expect(unbounded.map((f) => path.relative(root, f)), "routes that spend a run with no size bound").toEqual([]);
});
