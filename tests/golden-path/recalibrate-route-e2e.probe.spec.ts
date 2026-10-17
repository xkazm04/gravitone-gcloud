// LANE — THE RECALIBRATE TURN END TO END, THROUGH THE REAL SPAWN DOOR (dynamic, CIP-A).
//
// The dearest route in the app had never run in `npm test`. Its two refusals —
// a plan that edits a render the run did not send ("stray"), and a plan whose
// beats rest on a conclusion whose text was withheld ("blind") — are the guards
// that keep an engine from editing what it never read, and a grep of tests/ for
// either detail string found nothing. Neither did the `PromptUnavailable` door.
//
// Nothing here is mocked inside the app. `withFakeEngine` puts a stand-in
// `claude` first on PATH (tests/_engine/fake-claude.mjs), the route builds its
// real prompt, lib/text/router.ts walks its real ladder, lib/claudeCli.ts spawns
// "claude" through its real shell setting, and the stand-in answers with a
// hand-written cassette's envelope. No vendor, no spend, no production seam.
//
// The note below reaches ONE render: `f-macro-cause` is attributed only in
// `adjudication` (impact.ts ATTRIBUTION), so `reversal-chain` and
// `derived-short` go out as RENDERS NOT SENT, and with an empty scope every
// conclusion is out and unnamed — so each one is held back by name.
//
// THE TURN, NOT THE ROUTE (Phase 6 L70). Since AIO-A stage 2 the route ran the
// `recalibrate` turn kind on the server's ledger; the route retired with the v1
// pages and the script producer runs the kind in process. So the probe starts
// the REAL kind on the REAL runner, one project per run (the ledger's slot is per
// project), over a temp ledger directory of its own, and reads the settled
// record: the same plan, receipt and refusal sentences the route's synchronous
// body carried. The route's statuses (500/502) became the record's `failed` and
// the prepare step's typed throw.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { RENDERS } from "@/lib/script/renders";
import { CONCLUSIONS } from "@/lib/notebook/conclusions";
import { rendersInScope } from "@/lib/script/chainBase";
import { EDIT_PLAN_SCHEMA } from "@/lib/script/editPlan";
import { PromptUnavailable } from "@/lib/turns/assemble/recalibrate";
import { RECALIBRATE_SPEC } from "@/lib/turns/kinds/recalibrate";
import type { TurnRecord } from "@/lib/turns/ledger";
import { startTurn, whenIdle, type TurnSpec } from "@/lib/turns/runner";

import { FAKE_ENGINE_ENV, keepEnv, loadCassette, schemaSha256, withFakeEngine } from "./_helpers";

keepEnv([...FAKE_ENGINE_ENV, "TEXT_TURN_DIR", "TEXT_ENV", "LOCAL_BINARIES", "GOOGLE_AI_API_KEY", "LIGHTTRACK_DISABLE"]);

let turnDir = "";
test.beforeAll(() => {
  turnDir = mkdtempSync(join(tmpdir(), "gravitone-recal-e2e-turns-"));
});
test.afterAll(() => {
  if (turnDir) rmSync(turnDir, { recursive: true, force: true });
});

test.beforeEach(() => {
  process.env.TEXT_TURN_DIR = turnDir;
  process.env.TEXT_ENV = "local";
  process.env.LOCAL_BINARIES = "on";
  // No cloud key: if the local rung failed, the ladder has nowhere metered to go.
  delete process.env.GOOGLE_AI_API_KEY;
  process.env.LIGHTTRACK_DISABLE = "1";
});

const NOTE = { kind: "less-focus", cardId: "f-macro-cause" };
const HELD = "c-one-time-rerating";

/** One recalibrate turn to its end on the real runner; the settled record. */
let project = 0;
async function recalibrate(): Promise<TurnRecord> {
  const out = await startTurn(RECALIBRATE_SPEC as TurnSpec, `p-recal-e2e-${++project}`, { notebook: {}, conclusions: CONCLUSIONS, renders: RENDERS, scope: {}, notes: [NOTE] });
  if (!out.ok) throw new Error(`slot held by ${out.holder.id}`);
  const rec = await out.done;
  await whenIdle();
  return rec;
}

// FIRST IN THE FILE ON PURPOSE. The kind caches the prompt file in a module
// variable once read, and every probe file before this one stops at a refusal
// before reading it — so this is the one moment in the process when "missing"
// is observable. If an earlier probe ever loads it, this goes red with a
// served turn, and the message below says why.
test("recalibrate e2e: a missing prompt file refuses before the engine is started", async () => {
  const cwd = process.cwd();
  const empty = mkdtempSync(join(tmpdir(), "gravitone-noprompt-"));
  try {
    await withFakeEngine("recalibrate-ok", async (engine) => {
      process.chdir(empty);
      let thrown: unknown;
      try {
        thrown = await recalibrate().then(
          () => null,
          (e: unknown) => e,
        );
      } finally {
        process.chdir(cwd);
      }
      expect(thrown, "no throw means RECALIBRATE-PROMPT.md was already cached by an earlier probe").toBeInstanceOf(PromptUnavailable);
      expect(engine.turns(), "the engine was reached although the prompt could not be built").toHaveLength(0);
    });
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("recalibrate e2e: the fixture note reaches one render and holds the conclusion the cassettes cite", () => {
  // The two refusal cases below are only meaningful if this is true; if a
  // fixture edit moves the attribution, this says so instead of them passing
  // for a different reason.
  expect([...rendersInScope(RENDERS, [NOTE])]).toEqual(["adjudication"]);
  expect(CONCLUSIONS.some((c) => c.id === HELD)).toBe(true);
  expect(JSON.stringify(RENDERS)).not.toContain(HELD);
  // The cassettes are keyed to the schema the route hands the router. A schema
  // edit makes the stand-in refuse ("re-record"); this names the cause first.
  for (const name of ["recalibrate-ok", "recalibrate-stray", "recalibrate-blind"])
    expect(loadCassette(name).turns[0]!.match?.schemaSha256, `${name} was keyed to an older EDIT_PLAN_SCHEMA - re-record`).toBe(
      schemaSha256(EDIT_PLAN_SCHEMA),
    );
});

test("recalibrate e2e: a served plan is done with the receipt the envelope paid for", async () => {
  const cassette = loadCassette("recalibrate-ok");
  const paid = cassette.turns[0]!.envelope!.total_cost_usd;
  await withFakeEngine(cassette, async (engine) => {
    const rec = await recalibrate();
    expect(rec.status, JSON.stringify(rec.error)).toBe("done");
    const json = rec.result as { plan: { edits: unknown[] }; engine: Record<string, unknown> };
    const e = json.engine;
    console.log(`[recal] ok -> rung=${e?.rung} transport=${e?.transport} cost=${e?.costUsd}`);
    expect(e.rung).toBe("preferred");
    expect(e.transport).toBe("local-subprocess");
    expect(e.kind).toBe("local-claude-code");
    expect(e.costUsd).toBe(paid);
    expect(e.costBasis).toBe("vendor-reported");
    expect(e.schemaEnforcement).toBe("prompted");
    expect(e.reroutedFrom).toBeUndefined();
    expect(e.sessionId).toBe(cassette.turns[0]!.envelope!.session_id);
    expect(json.plan.edits).toHaveLength(1);

    const turns = engine.turns();
    expect(turns, "one prompt reached the engine").toHaveLength(1);
    expect(turns[0]!.turn, "the cassette turn was selected by its marker").toBe(0);
    expect(turns[0]!.promptChars).toBe(e.promptChars);
  });
});

test("recalibrate e2e: a plan editing a render that was not sent fails the turn naming it, and nothing is staged", async () => {
  await withFakeEngine("recalibrate-stray", async (engine) => {
    const rec = await recalibrate();
    const detail = String(rec.error?.message);
    console.log(`[recal] stray -> ${rec.status} ${detail.slice(0, 140)}`);
    expect(rec.status).toBe("failed");
    expect(rec.error?.kind).toBe("bad-response");
    expect(detail).toContain("reversal-chain");
    expect(detail).toMatch(/renders it was not given/);
    expect(detail).not.toContain("adjudication");
    expect(rec.result, "a refused plan must not travel back to be staged").toBeUndefined();
    expect(engine.turns()).toHaveLength(1);
  });
});

test("recalibrate e2e: a plan resting on a withheld conclusion fails the turn naming it, and nothing is staged", async () => {
  await withFakeEngine("recalibrate-blind", async (engine) => {
    const rec = await recalibrate();
    const detail = String(rec.error?.message);
    console.log(`[recal] blind -> ${rec.status} ${detail.slice(0, 140)}`);
    expect(rec.status).toBe("failed");
    expect(detail).toContain(HELD);
    expect(detail).toMatch(/whose text it was not sent/);
    // The other card on that edit was sent; naming it would blur which one broke the rule.
    expect(detail).not.toContain("f-macro-cause");
    expect(rec.result).toBeUndefined();

    expect(engine.turns()).toHaveLength(1);
  });
});
