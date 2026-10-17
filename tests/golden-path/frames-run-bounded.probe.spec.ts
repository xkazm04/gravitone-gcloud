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
// The probe drives the REAL `frames` turn kind on the real runner (the route's
// refusals moved into it, AIO-A stage 3; /api/frames itself retired in Phase 6 L70,
// and with it the case that the bounds sit behind the access gate) and asserts the
// thing that matters most: an oversized run is refused WITHOUT the CLI being
// spawned. A 413 that still paid for the run would be worse than no check.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { FAKE_ENGINE_ENV, keepEnv } from "./_helpers";
import { withVendor } from "./_vendor";

import { tooLarge } from "@/lib/turns/assemble/frames";
import { FRAMES_SPEC } from "@/lib/turns/kinds/frames";
import { startTurn, TurnInputError, whenIdle, type TurnSpec } from "@/lib/turns/runner";

keepEnv(["LOCAL_BINARIES", "TEXT_TURN_DIR", ...FAKE_ENGINE_ENV]);

let dir = "";
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gravitone-frames-bounded-"));
  process.env.TEXT_TURN_DIR = dir;
});
test.afterEach(async () => {
  await whenIdle();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

/** The kind's refusal for `body` (status, code, sentence), or null when it started a turn. */
async function refusal(body: unknown, project: string): Promise<{ status: number; code: string; detail: string } | null> {
  try {
    await startTurn(FRAMES_SPEC as TurnSpec, project, body);
    return null;
  } catch (e) {
    if (e instanceof TurnInputError) return { status: e.status, code: e.code, detail: e.message };
    throw e;
  }
}

const beat = (i: number) => ({ at: `0:${String(i).padStart(2, "0")}`, text: `beat ${i}` });
const STYLE = { technique: "flat vector", palette: [] };

test("a run with too many beats is refused, and never reaches the engine", async () => {
  // Counted at the vendor boundary (_vendor.ts), with local binaries ON so a
  // `claude` spawn is possible and would be recorded. This used to assert that
  // the refusal came back in under 2 s - a stopwatch standing in for "nothing
  // was run", which a slow machine fails and a fast dispatch passes.
  await withVendor(
    async (v) => {
      const r = await refusal({ beats: Array.from({ length: 5_000 }, (_, i) => beat(i)), style: STYLE }, "p-bounded-1");
      console.log(`[frames] 5000 beats -> ${r?.status} ${r?.code}, ${v.dispatches().length} dispatch(es)`);
      expect(r?.status).toBe(413);
      expect(r?.code).toBe("too-large");
      expect(v.dispatches(), "the run appears to have been dispatched").toEqual([]);
    },
    { localBinaries: "on" },
  );
});

test("a run whose MATERIAL is oversized is refused even when the counts are fine", async () => {
  // Twelve beats, one of which carries a megabyte. Counting rows alone would
  // have waved this through, which is why the ceiling is on size as well.
  const beats = Array.from({ length: 12 }, (_, i) => beat(i));
  (beats[0] as Record<string, unknown>).text = "x".repeat(1_100_000);
  const r = await refusal({ beats, style: STYLE }, "p-bounded-2");
  expect(r?.status).toBe(413);
  expect(r?.code).toBe("too-large");
  expect(r?.detail, "the refusal should say nothing was dispatched").toMatch(/nothing was dispatched/i);
});

test("too many facts is refused, and the message names the facts rather than the beats", async () => {
  const r = await refusal({ beats: [beat(0)], style: STYLE, facts: Array.from({ length: 5_000 }, (_, i) => ({ id: `f-${i}` })) }, "p-bounded-3");
  expect(r?.status).toBe(413);
  expect(r?.detail).toMatch(/facts/i);
});

test("an ordinary run is NOT refused by the bounds", () => {
  // The GUARD, not the turn: getting past the bounds through the kind means
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
