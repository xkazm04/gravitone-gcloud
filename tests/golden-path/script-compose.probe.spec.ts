// LANE — COMPOSE: THE CREATOR'S OWN NOTEBOOK IN, GATED CANDIDATE RENDERS OUT (dynamic, CIP-A lane).
//
// Card `script-phase-B` (docs/concepts/moonshots-2026-10-05/02-research-script.md),
// stages 1-2. Nothing in the app wrote a script: the three renders were
// transcribed from a 2026-08-11 terminal run, and the model's only verbs were
// edits over them. `/api/script` composes renders from the notebook it is sent,
// `lib/script/validate.ts::parseDraft` holds the answer to the notebook, the
// scope, the clock and the engine catalogue, and the gate runs server-side on
// every candidate before anything is returned.
//
// Every model answer here is HAND-RECORDED (tests/_engine/cassettes/compose-*.json)
// and nothing is mocked inside the app: the route cases put the stand-in
// `claude` first on PATH, so the real prompt, the real ladder and the real spawn
// door run, and no vendor is reached.
//
// The acceptance cases, by number:
//   1 · an attributed id the creator descoped is refused, naming render, mark and card
//   2 · an AND THEN between two movement beats is a finding from the gate's own law
//   3 · no engine at "good" or better is a 200 `{refused:"no-engine-fits"}`, no turn, no draft
//   4 · a valid answer gives two renders inside the template band, and no runtime mismatch
//   5 · each candidate comes back with a GateReport and an `enforced` figure
//   6 · the composed draft names its renders to editPlanSchema/parseEditPlan
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { POST } from "@/app/api/script/route";
import { NOTEBOOK } from "@/app/_phases/_shared/notebook/notebook";
import { fixtureSource, sourceOf } from "@/app/_phases/_shared/notebook/source";
import type { Notebook } from "@/app/_phases/_shared/notebook/types";
import { checkConnectors, runGate, type GateReport } from "@/app/_phases/script/gate";
import { draftOf, type DraftRender } from "@/app/_phases/script/draft";
import { editPlanSchema, parseEditPlan, PlanError } from "@/app/_phases/script/editPlan";
import { TEMPLATES } from "@/lib/projects";
import {
  COMPOSE_TEMPLATE_RANGES,
  composeSchema,
  DraftError,
  parseDraft,
  qualifyingEngines,
  runtimeMismatch,
  templateBand,
  type ComposeContext,
} from "@/lib/script/validate";

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

const TEMPLATE = "mid-educational-video";
const TARGET_S = 300;

/** The recorded model answer a cassette carries, as the raw text the engine returned. */
const answerOf = (cassette: string): string => JSON.stringify(loadCassette(cassette).turns[0]!.resultJson);

const ctx = (over: Partial<ComposeContext> = {}): ComposeContext => ({
  source: fixtureSource(),
  scope: {},
  template: TEMPLATE,
  targetS: TARGET_S,
  ...over,
});

/** A notebook whose every engine fits `poor` — nothing to compose with. */
const noFitNotebook = (): Notebook => ({
  ...NOTEBOOK,
  engineFit: NOTEBOOK.engineFit.map((e) => ({ ...e, fit: "poor" as const })),
});

let ip = 0;
async function compose(body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await POST(
    new Request("http://localhost/api/script", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.78.0.${++ip}` },
      body: JSON.stringify({ notebook: NOTEBOOK, scope: {}, template: TEMPLATE, targetS: TARGET_S, projectId: "p-compose", ...body }),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

// FIRST IN THE FILE ON PURPOSE, as in recalibrate-route-e2e: the route caches
// its prompt once read, so this is the one moment "missing" is observable.
test("compose e2e: a missing prompt file is a 500 that says the engine never started", async () => {
  const cwd = process.cwd();
  const empty = mkdtempSync(join(tmpdir(), "gravitone-noprompt-"));
  try {
    await withFakeEngine("compose-ok", async (engine) => {
      process.chdir(empty);
      let out: Awaited<ReturnType<typeof compose>>;
      try {
        out = await compose({});
      } finally {
        process.chdir(cwd);
      }
      console.log(`[compose] no prompt -> ${out.status} ${String(out.json.detail).slice(0, 120)}`);
      expect(out.status, "200 means SCRIPT-PROMPT.md was already cached by an earlier probe").toBe(500);
      expect(String(out.json.detail)).toMatch(/never started/);
      expect(engine.turns(), "the engine was reached although the prompt could not be built").toHaveLength(0);
    });
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

/* ───────────────────────── the contract the cassettes are keyed to ───────── */

test("compose: the cassettes are keyed to the schema the route hands the router", () => {
  const schema = composeSchema(qualifyingEngines(NOTEBOOK).map((e) => e.engine));
  for (const name of ["compose-ok", "compose-and-then", "compose-refused"])
    expect(loadCassette(name).turns[0]!.match?.schemaSha256, `${name} was keyed to an older compose schema - re-record`).toBe(
      schemaSha256(schema),
    );
});

test("compose: the explainer template ranges mirror the project catalogue", () => {
  // lib/projects.ts is "use client" and cannot be imported by a route, so the
  // ranges are restated in lib/script/validate.ts. Two copies drift; this is
  // the copy being held to the owner.
  const ids = Object.keys(COMPOSE_TEMPLATE_RANGES);
  expect(ids.length, "the compose range table is empty").toBeGreaterThan(0);
  for (const id of ids) {
    const owner = TEMPLATES.find((t) => t.id === id);
    expect(owner, `${id} is not a template in lib/projects.ts`).toBeTruthy();
    expect([...COMPOSE_TEMPLATE_RANGES[id]!]).toEqual([...owner!.range]);
  }
});

/* ───────────────────────────── 1 · descoped attribution ─────────────────── */

test("case 1: a beat resting on a card the creator descoped is refused, naming render, mark and card", () => {
  const scope = { "f-mstr-sold": { descoped: true } };
  let err: unknown;
  try {
    parseDraft(answerOf("compose-ok"), ctx({ scope }));
  } catch (e) {
    err = e;
  }
  expect(err, "a descoped card reached a beat and parseDraft passed it").toBeInstanceOf(DraftError);
  const findings = (err as DraftError).findings.filter((f) => f.rule === "attribution");
  console.log(`[compose] descoped -> ${findings.map((f) => `${f.renderId}@${f.at}:${f.card}`).join(", ")}`);
  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatchObject({ renderId: "rc-own-clock", at: "2:50", card: "f-mstr-sold", verdict: "violation" });
  expect((err as Error).message).toContain("rc-own-clock");
  expect((err as Error).message).toContain("2:50");
  expect((err as Error).message).toContain("f-mstr-sold");

  // The same answer under an untouched scope is accepted: the refusal is the
  // scope's doing, not the answer's shape.
  expect(parseDraft(answerOf("compose-ok"), ctx()).kind).toBe("draft");
});

test("case 1b: a conclusion the creator never took is out by default, and an unknown id is no card at all", () => {
  const raw = JSON.parse(answerOf("compose-ok")) as { renders: { beats: { cards: string[] }[] }[] };
  raw.renders[0]!.beats[0]!.cards = ["c-one-time-rerating", "f-nowhere"];
  let err: unknown;
  try {
    parseDraft(JSON.stringify(raw), ctx());
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(DraftError);
  const cards = (err as DraftError).findings.filter((f) => f.rule === "attribution").map((f) => f.card);
  expect(cards.sort()).toEqual(["c-one-time-rerating", "f-nowhere"]);
});

/* ───────────────────────────── 2 · the connector law ────────────────────── */

test("case 2: AND THEN between two movement beats is a finding from the gate's own connector law", () => {
  let err: unknown;
  try {
    parseDraft(answerOf("compose-and-then"), ctx());
  } catch (e) {
    err = e;
  }
  expect(err, "an AND THEN chain passed parseDraft silently").toBeInstanceOf(DraftError);
  const found = (err as DraftError).findings.filter((f) => f.rule === "connector" && f.verdict === "violation");
  console.log(`[compose] and-then -> ${found.map((f) => `${f.renderId}@${f.at}`).join(", ")}`);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ renderId: "rc-own-clock", at: "1:40" });

  // SHARED, not restated: the gate reports the same beat with the same verdict,
  // and runGate carries it when asked to.
  const beats = [
    { at: "0:00", kind: "movement" as const, connector: null, label: "a", text: "One." },
    { at: "0:10", kind: "movement" as const, connector: "AND THEN" as const, label: "b", text: "Two." },
  ];
  const law = checkConnectors({ id: "x", beats });
  expect(law.filter((f) => f.verdict === "violation").map((f) => f.at)).toEqual(["0:10"]);
  const gated = runGate({ id: "x", beats }, { connectors: true, unknowns: [], probes: {} });
  expect(gated.findings.some((f) => f.rule === "connector" && f.verdict === "violation")).toBe(true);
  expect(gated.blocked).toBe(true);
});

/* ───────────────────────────── 3 · no engine fits ───────────────────────── */

test("case 3: a notebook with no engine at good or better is a 200 refusal, no turn, no draft", async () => {
  expect(qualifyingEngines(noFitNotebook())).toEqual([]);
  await withFakeEngine("compose-ok", async (engine) => {
    const { status, json } = await compose({ notebook: noFitNotebook() });
    console.log(`[compose] no fit -> ${status} ${JSON.stringify(json).slice(0, 140)}`);
    expect(status).toBe(200);
    expect(json.refused).toBe("no-engine-fits");
    expect(json.draft, "a refusal must not carry a draft to be written").toBeUndefined();
    expect(engine.turns(), "the engine was paid to say what the notebook already said").toHaveLength(0);
  });
});

test("case 3b: the engine's own no-engine-fits answer is a valid refusal, not a parse failure", async () => {
  const out = parseDraft(answerOf("compose-refused"), ctx());
  expect(out.kind).toBe("refused");
  await withFakeEngine("compose-refused", async (engine) => {
    const { status, json } = await compose({});
    expect(status, String(json.detail)).toBe(200);
    expect(json.refused).toBe("no-engine-fits");
    expect(String(json.why).length).toBeGreaterThan(0);
    expect(json.draft).toBeUndefined();
    expect(engine.turns()).toHaveLength(1);
  });
});

test("case 3c: a render on an engine the notebook rates poor is refused", () => {
  const raw = JSON.parse(answerOf("compose-ok")) as { renders: { engine: string }[] };
  raw.renders[1]!.engine = "briefing";
  let err: unknown;
  try {
    parseDraft(JSON.stringify(raw), ctx());
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(DraftError);
  expect((err as DraftError).findings.filter((f) => f.rule === "engine").map((f) => f.renderId)).toEqual(["adj-own-clock"]);
});

/* ───────────────────────────── 4 · the project's clock ──────────────────── */

test("case 4: a valid answer gives two renders inside the template band, and no runtime mismatch", () => {
  const band = templateBand(TEMPLATE, TARGET_S);
  expect(band).toEqual({ min: 285, max: 315 });
  const out = parseDraft(answerOf("compose-ok"), ctx());
  expect(out.kind).toBe("draft");
  if (out.kind !== "draft") return;
  const renders = out.renders;
  console.log(`[compose] ok -> ${renders.map((r) => `${r.id}:${r.engine}:${r.durationS}s`).join(", ")}`);
  expect(renders).toHaveLength(2);
  for (const r of renders) {
    expect(r.durationS).toBeGreaterThanOrEqual(band!.min);
    expect(r.durationS).toBeLessThanOrEqual(band!.max);
    expect(r.template).toBe(TEMPLATE);
    expect(r.form).toBe("explainer");
    // Marks are derived from the beats' seconds, never asserted by the model.
    expect(r.beats[0]!.at).toBe("0:00");
    // A self-check is not a verdict (gate.ts): nothing the model said about
    // its own render arrives as `pass`.
    expect(r.checks.every((c) => c.state === "unmeasured")).toBe(true);
    // The attribution travels with the render, keyed by derived mark.
    expect(Object.keys(r.attribution).every((m) => r.beats.some((b) => b.at === m))).toBe(true);
  }
  // ScriptStep's own expression today (ScriptStep.tsx:301), and the band-aware
  // predicate stage 3 swaps in: both say the project's clock is met.
  expect(!renders.some((r) => r.durationS === TARGET_S)).toBe(false);
  expect(runtimeMismatch(renders, TEMPLATE, TARGET_S)).toBe(false);

  // And a render off the clock is refused, not shipped with a mismatch line.
  const raw = JSON.parse(answerOf("compose-ok")) as { renders: { beats: { seconds: number }[] }[] };
  raw.renders[1]!.beats[0]!.seconds += 60;
  let err: unknown;
  try {
    parseDraft(JSON.stringify(raw), ctx());
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(DraftError);
  expect((err as DraftError).findings.filter((f) => f.rule === "duration").map((f) => f.renderId)).toEqual(["adj-own-clock"]);
});

test("case 4b: a target outside the template's range is a 400 before any engine is reached", async () => {
  expect(templateBand(TEMPLATE, 30)).toBeNull();
  await withFakeEngine("compose-ok", async (engine) => {
    const { status } = await compose({ targetS: 30 });
    expect(status).toBe(400);
    const trailer = await compose({ template: "trailer", targetS: 120 });
    expect(trailer.status, "compose writes explainers; a trailer is a TrailerCut").toBe(400);
    expect(engine.turns()).toHaveLength(0);
  });
});

/* ───────────────────────────── 5 · gated server-side ────────────────────── */

test("case 5: each returned render carries a GateReport with an enforced figure", async () => {
  const cassette = loadCassette("compose-ok");
  await withFakeEngine(cassette, async (engine) => {
    const { status, json } = await compose({});
    expect(status, String(json.detail)).toBe(200);
    const draft = json.draft as { renders: DraftRender[]; notebookDigest: string; projectId: string };
    const gate = json.gate as { byRender: Record<string, GateReport>; enforced: number };
    console.log(
      `[compose] gate -> ${Object.values(gate.byRender).map((g) => `${g.renderId} enforced=${g.enforced}% blocked=${g.blocked}`).join(", ")}`,
    );
    expect(draft.renders.map((r) => r.id)).toEqual(["rc-own-clock", "adj-own-clock"]);
    expect(draft.projectId).toBe("p-compose");
    expect(draft.notebookDigest).toBe(sourceOf(NOTEBOOK).digest);
    for (const r of draft.renders) {
      const g = gate.byRender[r.id];
      expect(g, `${r.id} came back ungated`).toBeTruthy();
      expect(typeof g!.enforced).toBe("number");
      expect(g!.enforced).toBeGreaterThan(0);
      // The connector law ran server-side as part of the gate.
      expect(g!.findings.some((f) => f.rule === "connector")).toBe(true);
    }
    const e = json.engine as Record<string, unknown>;
    expect(e.rung).toBe("preferred");
    expect(e.costUsd).toBe(cassette.turns[0]!.envelope!.total_cost_usd);
    expect(engine.turns()).toHaveLength(1);
    expect(engine.turns()[0]!.turn).toBe(0);
  });
});

test("case 5b: a descoped card in the answer is a 502 naming it, and no draft travels back", async () => {
  await withFakeEngine("compose-ok", async (engine) => {
    const { status, json } = await compose({ scope: { "f-mstr-sold": { descoped: true } } });
    console.log(`[compose] descoped e2e -> ${status} ${String(json.detail).slice(0, 160)}`);
    expect(status).toBe(502);
    expect(String(json.detail)).toContain("f-mstr-sold");
    expect(String(json.detail)).toContain("rc-own-clock");
    expect(json.draft).toBeUndefined();
    expect(engine.turns()).toHaveLength(1);
  });
});

/* ───────────────────────────── 6 · recalibrate reaches them ─────────────── */

test("case 6: the composed draft names its renders to the edit-plan schema and parser", () => {
  const out = parseDraft(answerOf("compose-ok"), ctx());
  if (out.kind !== "draft") throw new Error("compose-ok did not parse as a draft");
  const draft = draftOf(out.renders, { projectId: "p-compose", source: sourceOf(NOTEBOOK) });
  const schema = editPlanSchema(draft);
  expect([...schema.properties.edits.items.properties.renderId.enum]).toEqual(["rc-own-clock", "adj-own-clock"]);

  const mark = draft.renders[0]!.beats[2]!.at;
  const plan = parseEditPlan(
    JSON.stringify({
      edits: [{ renderId: "rc-own-clock", op: "retime", beatAt: mark, seconds: 12, why: "hold the complication" }],
      refusals: [],
      unchanged: ["adj-own-clock"],
      summary: "One retime.",
    }),
    { draft },
  );
  expect(plan.edits).toHaveLength(1);
  // And a fixture render is no longer a render this project has.
  expect(() =>
    parseEditPlan(
      JSON.stringify({ edits: [{ renderId: "reversal-chain", op: "cut", beatAt: "0:00", why: "x" }], refusals: [], unchanged: [], summary: "x" }),
      { draft },
    ),
  ).toThrow(PlanError);
});
