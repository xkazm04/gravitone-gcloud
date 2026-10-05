// LANE — /api/recalibrate END TO END, THROUGH THE REAL SPAWN DOOR (dynamic, CIP-A).
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
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { POST } from "@/app/api/recalibrate/route";
import { RENDERS } from "@/app/_phases/script/renders";
import { CONCLUSIONS } from "@/app/_phases/_shared/notebook/conclusions";
import { rendersInScope } from "@/app/_phases/script/chainBase";
import { EDIT_PLAN_SCHEMA } from "@/app/_phases/script/editPlan";

import { FAKE_ENGINE_ENV, keepEnv, loadCassette, schemaSha256, withFakeEngine } from "./_helpers";

keepEnv([...FAKE_ENGINE_ENV, "TEXT_ENV", "LOCAL_BINARIES", "GOOGLE_AI_API_KEY", "NEXT_PUBLIC_DEV_AUTH", "LIGHTTRACK_DISABLE"]);

test.beforeEach(() => {
  process.env.NEXT_PUBLIC_DEV_AUTH = "1";
  process.env.TEXT_ENV = "local";
  process.env.LOCAL_BINARIES = "on";
  // No cloud key: if the local rung failed, the ladder has nowhere metered to go.
  delete process.env.GOOGLE_AI_API_KEY;
  process.env.LIGHTTRACK_DISABLE = "1";
});

const NOTE = { kind: "less-focus", cardId: "f-macro-cause" };
const HELD = "c-one-time-rerating";

let ip = 0;
async function recalibrate(): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await POST(
    new Request("http://localhost/api/recalibrate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.77.0.${++ip}` },
      body: JSON.stringify({ notebook: {}, renders: RENDERS, scope: {}, notes: [NOTE] }),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

// FIRST IN THE FILE ON PURPOSE. The route caches the prompt file in a module
// variable once read, and every probe file before this one stops at a 400/401
// before reading it — so this is the one moment in the process when "missing"
// is observable. If an earlier probe ever loads it, this goes red with a 200,
// and the message below says why.
test("recalibrate e2e: a missing prompt file is a 500 that says the engine never started", async () => {
  const cwd = process.cwd();
  const empty = mkdtempSync(join(tmpdir(), "gravitone-noprompt-"));
  try {
    await withFakeEngine("recalibrate-ok", async (engine) => {
      process.chdir(empty);
      let out: Awaited<ReturnType<typeof recalibrate>>;
      try {
        out = await recalibrate();
      } finally {
        process.chdir(cwd);
      }
      console.log(`[recal] no prompt -> ${out.status} ${String(out.json.detail).slice(0, 120)}`);
      expect(out.status, "200 means RECALIBRATE-PROMPT.md was already cached by an earlier probe").toBe(500);
      expect(String(out.json.detail)).toMatch(/never started/);
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

test("recalibrate e2e: a served plan is a 200 with the receipt the envelope paid for", async () => {
  const cassette = loadCassette("recalibrate-ok");
  const paid = cassette.turns[0]!.envelope!.total_cost_usd;
  await withFakeEngine(cassette, async (engine) => {
    const { status, json } = await recalibrate();
    const e = json.engine as Record<string, unknown>;
    console.log(`[recal] ok -> ${status} rung=${e?.rung} transport=${e?.transport} cost=${e?.costUsd}`);
    expect(status, String(json.detail)).toBe(200);
    expect(e.rung).toBe("preferred");
    expect(e.transport).toBe("local-subprocess");
    expect(e.kind).toBe("local-claude-code");
    expect(e.costUsd).toBe(paid);
    expect(e.costBasis).toBe("vendor-reported");
    expect(e.schemaEnforcement).toBe("prompted");
    expect(e.reroutedFrom).toBeUndefined();
    expect(e.sessionId).toBe(cassette.turns[0]!.envelope!.session_id);
    expect((json.plan as { edits: unknown[] }).edits).toHaveLength(1);

    const turns = engine.turns();
    expect(turns, "one prompt reached the engine").toHaveLength(1);
    expect(turns[0]!.turn, "the cassette turn was selected by its marker").toBe(0);
    expect(turns[0]!.promptChars).toBe(e.promptChars);
  });
});

test("recalibrate e2e: a plan editing a render that was not sent is a 502 naming it, and nothing is staged", async () => {
  await withFakeEngine("recalibrate-stray", async (engine) => {
    const { status, json } = await recalibrate();
    console.log(`[recal] stray -> ${status} ${String(json.detail).slice(0, 140)}`);
    expect(status).toBe(502);
    expect(String(json.detail)).toContain("reversal-chain");
    expect(String(json.detail)).toMatch(/renders it was not given/);
    expect(String(json.detail)).not.toContain("adjudication");
    expect(json.plan, "a refused plan must not travel back to be staged").toBeUndefined();
    expect(engine.turns()).toHaveLength(1);
  });
});

test("recalibrate e2e: a plan resting on a withheld conclusion is a 502 naming it, and nothing is staged", async () => {
  await withFakeEngine("recalibrate-blind", async (engine) => {
    const { status, json } = await recalibrate();
    console.log(`[recal] blind -> ${status} ${String(json.detail).slice(0, 140)}`);
    expect(status).toBe(502);
    expect(String(json.detail)).toContain(HELD);
    expect(String(json.detail)).toMatch(/whose text it was not sent/);
    // The other card on that edit was sent; naming it would blur which one broke the rule.
    expect(String(json.detail)).not.toContain("f-macro-cause");
    expect(json.plan).toBeUndefined();
    expect(engine.turns()).toHaveLength(1);
  });
});
