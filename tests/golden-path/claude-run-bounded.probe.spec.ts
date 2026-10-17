// LANE — EVERY CLAUDE RUN BOUNDS WHAT IT IS SENT (pure + source).
//
// v1's /api/frames, /api/recalibrate and /api/script each refused an oversized run
// with a 413 before anything was spawned: without the bound one caller could send
// megabytes of notebook down stdin and buy a proportionally enormous run, once per
// rate-limit slot. Those routes retired in Phase 6 wave C (L70); the runs are the
// kernel producers' now (lib/producers/script.ts, lib/producers/frames.ts), which
// ask the SAME refusal doors the routes asked (lib/turns/assemble/{recalibrate,
// frames}.ts). So the bound is pinned where it lives: the predicate and its door.
//
// DROPPED with the route: /api/script's own `tooLarge` (notebook, conclusions,
// scope, engines). Compose now reads its notebook from the store, not from a
// request body, so no outside caller can hand it megabytes.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

import { framesRefusal, tooLarge as framesTooLarge } from "@/lib/turns/assemble/frames";
import { MAX_RUN_CHARS, recalibrateRefusal, tooLarge as recalibrateTooLarge } from "@/lib/turns/assemble/recalibrate";

const FIVE_MB = "x".repeat(5_000_000);
const NOTES = [{ kind: "custom", text: "make the hook shorter" }];

test("recalibrate: a 5MB notebook is refused 413 too-large, naming the notebook, before anything is assembled", () => {
  const started = Date.now();
  const r = recalibrateRefusal({ notebook: { filler: FIVE_MB }, renders: [], notes: NOTES });
  expect(r?.status).toBe(413);
  expect(r?.code).toBe("too-large");
  expect(r?.detail).toMatch(/notebook/);
  expect(r?.detail).toMatch(/Nothing was dispatched/);
  expect(Date.now() - started).toBeLessThan(2_000);
});

test("recalibrate: oversized renders are refused too, naming the renders", () => {
  const r = recalibrateRefusal({ notebook: {}, renders: [{ id: "r1", beats: [FIVE_MB] }], notes: NOTES });
  expect(r?.status).toBe(413);
  expect(r?.detail).toMatch(/renders/);
});

test("the size is asked BEFORE the notes: an oversized run with no notes is still a 413", () => {
  const r = recalibrateRefusal({ notebook: { filler: FIVE_MB }, renders: [], notes: [] });
  expect(r?.status).toBe(413);
});

test("frames: an oversized beat list is refused 413 before assembly", () => {
  const r = framesRefusal({ beats: [{ id: "b1", text: FIVE_MB }], style: { id: "s" } });
  expect(r?.status).toBe(413);
  expect(r?.code).toBe("too-large");
});

test("an ordinary run is NOT refused, and the ceiling is pinned from both sides", () => {
  const ordinary = { notebook: { facts: Array.from({ length: 200 }, (_, i) => ({ id: `f-${i}`, claim: "a sentence about the world" })) }, renders: [], scope: {}, notes: NOTES };
  expect(recalibrateTooLarge(ordinary)).toBeNull();
  expect(recalibrateRefusal(ordinary)).toBeNull();
  expect(MAX_RUN_CHARS).toBe(1_000_000);
  expect(recalibrateTooLarge({ notebook: "x".repeat(990_000) })).toBeNull();
  expect(recalibrateTooLarge({ notebook: "x".repeat(1_010_000) })).toMatch(/notebook/);
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  expect(recalibrateTooLarge({ notebook: circular })).toMatch(/unserialisable/);
  expect(framesTooLarge({ beats: [{ id: "b1", text: "a beat" }] })).toBeNull();
});

test("no route under app/api reaches the text router without a size bound", () => {
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
  expect(routes.length, "the walk read no routes").toBeGreaterThan(0);
  // Since wave C no route spends a run (plan §3.4: CLIs, agents and file bytes only);
  // a route that comes to reach the engine again must carry its bound.
  const spawners = routes.filter((f) => /lib\/(text\/router|claudeCli)|\bstartTurn\b/.test(stripComments(readFileSync(f, "utf8"))));
  const unbounded = spawners.filter(
    (f) => !/\b413\b|MAX_[A-Z_]*(CHARS|RUN)\b|\btooLarge\b|\b(recalibrate|frames)Refusal\b|\bTurnInputError\b/.test(stripComments(readFileSync(f, "utf8"))),
  );
  expect(unbounded.map((f) => path.relative(root, f)), "routes that spend a run with no size bound").toEqual([]);
});

test("the producers that spend a run ask the refusal doors", () => {
  const src = (rel: string) => stripComments(readFileSync(path.join(process.cwd(), rel), "utf8"));
  expect(src("lib/producers/script.ts")).toMatch(/\brecalibrateRefusal\(/);
  expect(src("lib/turns/kinds/recalibrate.ts")).toMatch(/\brecalibrateRefusal\b/);
  expect(src("lib/turns/kinds/frames.ts")).toMatch(/\bframesRefusal\(/);
});
