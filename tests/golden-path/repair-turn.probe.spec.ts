// LANE — REPAIR, DON'T DISCARD (dynamic).
//
// A research answer that fails the validator used to be dropped and the run
// started again. The validator now names the PATH it refused (NotebookFinding),
// and lib/text/repair.ts hands the object back for a bounded repair turn.
//
// WHAT IS DRIVEN. The real validator (`parseNotebook`, over the research-ok
// cassette's answer, a notebook that passes it), the real guards and the real
// loop. The only stand-in is the provider: `repairTurn` takes the router's
// `reason` as an injected dependency, so no vendor, no spawn, no spend.
import { test, expect } from "@playwright/test";

import { NotebookError, parseNotebook, type NotebookFinding } from "@/lib/notebook/validate";
import { changedPaths, guardRepair, MAX_REPAIR_ATTEMPTS, pathTokens, repairTurn } from "@/lib/text/repair";
import { planFor } from "@/lib/text/router";
import type { TextProvenance, TextRequest, TextResult } from "@/lib/text/types";

import { loadCassette } from "./_helpers";

type Obj = Record<string, unknown>;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const TOPIC = "harbour dredging costs";

/** A notebook the validator accepts: the hand-written research-ok answer. */
function valid(): Obj {
  const turn = loadCassette("research-ok").turns[0] as unknown as { resultJson: Obj };
  return clone(turn.resultJson);
}

/** The same notebook with one required field removed. */
function missingStrength(): Obj {
  const nb = valid();
  delete (nb.tension as Obj).strength;
  return nb;
}

function findingsOf(raw: unknown): NotebookFinding[] {
  try {
    parseNotebook(raw, TOPIC);
  } catch (e) {
    expect(e).toBeInstanceOf(NotebookError);
    return (e as NotebookError).findings;
  }
  return [];
}

const prov = (costUsd?: number): TextProvenance => ({
  provider: "claude-cli",
  model: "stub",
  transport: "local-subprocess",
  rung: "preferred",
  turn: "repair",
  schemaEnforcement: "prompted",
  durationMs: 1,
  costUsd,
  costBasis: costUsd === undefined ? "unpriced" : "vendor-reported",
  promptChars: 1,
});

/** A provider that answers each call from `answers` in turn (the last repeats). */
function stub(answers: unknown[], costUsd?: number) {
  const calls: TextRequest[] = [];
  const reason = async (req: TextRequest): Promise<TextResult> => {
    calls.push(req);
    const json = answers[Math.min(calls.length - 1, answers.length - 1)];
    return { text: JSON.stringify(json), json, provenance: prov(costUsd) };
  };
  return { reason, calls };
}

const SCHEMA = { type: "object", required: ["topic"] };

/* ── 1. the validator says WHERE ──────────────────────────────────────────── */

test("a notebook missing tension.strength is refused at the path tension.strength", () => {
  const found = findingsOf(missingStrength());
  console.log(`[repair] findings: ${JSON.stringify(found)}`);
  expect(found[0]?.path).toBe("tension.strength");
  expect(found[0]?.rule).toContain("tension.strength");
  // The derived sentence is still there for a caller that only prints.
  expect(() => parseNotebook(missingStrength(), TOPIC)).toThrow(/tension\.strength/);
});

test("the fixture answer itself passes, so the cases below start from a notebook that is only broken where they break it", () => {
  expect(findingsOf(valid())).toEqual([]);
});

test("the refusal carries the draft it refused", () => {
  const bad = missingStrength();
  try {
    parseNotebook(bad, TOPIC);
    throw new Error("accepted a notebook with no tension.strength");
  } catch (e) {
    expect((e as NotebookError).draft).toBe(bad);
  }
});

/* ── 2. a stub that fixes it ──────────────────────────────────────────────── */

test("repairTurn with a stub returning a fixed object passes parseNotebook; the provider is called once, as a repair turn", async () => {
  const draft = missingStrength();
  const fixed = valid();
  const provider = stub([fixed], 0.05);

  const out = await repairTurn({ draft, findings: findingsOf(draft), schema: SCHEMA }, { reason: provider.reason });

  expect(out.outcome).toBe("repaired");
  if (out.outcome !== "repaired") return;
  expect(() => parseNotebook(out.value, TOPIC)).not.toThrow();
  expect(provider.calls).toHaveLength(1);
  expect(provider.calls[0]!.turn).toBe("repair");
  expect(provider.calls[0]!.prompt).toContain("tension.strength");
  expect(out.provenance.turn).toBe("repair");
  expect(out.attempts).toBe(1);
  expect(out.costUsd).toBe(0.05);
});

/* ── 3. a stub that never fixes it ────────────────────────────────────────── */

test("a stub that stays invalid is exhausted after 2 attempts: a value, not a generic error", async () => {
  const draft = missingStrength();
  const provider = stub([draft]); // hands back exactly what it was given

  const out = await repairTurn({ draft, findings: findingsOf(draft), schema: SCHEMA }, { reason: provider.reason });

  expect(MAX_REPAIR_ATTEMPTS).toBe(2);
  expect(provider.calls).toHaveLength(2);
  expect(out.outcome).toBe("exhausted");
  if (out.outcome !== "exhausted") return;
  expect(out.findings[0]?.path).toBe("tension.strength");
  expect(out.draft).toEqual(draft);
  // Unpriced turns stay unpriced: no total is invented.
  expect(out.costUsd).toBeUndefined();
});

/* ── 4. no-shrink ─────────────────────────────────────────────────────────── */

test("a repair that drops facts below the draft's count is refused with 'repair removed N facts'", async () => {
  const draft = missingStrength();
  const facts = draft.facts as unknown[];
  expect(facts.length).toBeGreaterThan(1);

  // Fixes the tension and ALSO deletes a fact.
  const shrunk = valid();
  (shrunk.facts as unknown[]).pop();

  const provider = stub([shrunk]);
  const out = await repairTurn({ draft, findings: findingsOf(draft), schema: SCHEMA }, { reason: provider.reason });

  expect(out.outcome).toBe("exhausted");
  if (out.outcome !== "exhausted") return;
  expect(out.findings.map((f) => f.rule)).toContain("repair removed 1 fact");
});

/* ── 5. unchanged-elsewhere ───────────────────────────────────────────────── */

test("a repair that changes a field outside the listed paths is refused", async () => {
  const draft = missingStrength();
  const meddled = valid();
  meddled.question = "A different question entirely?";

  const provider = stub([meddled]);
  const out = await repairTurn({ draft, findings: findingsOf(draft), schema: SCHEMA }, { reason: provider.reason });

  expect(out.outcome).toBe("exhausted");
  if (out.outcome !== "exhausted") return;
  const refusal = out.findings.find((f) => f.path === "question");
  expect(refusal?.rule).toContain("not one of the listed paths");
});

test("a refused repair is not built on: the next attempt starts from the draft, and a clean second attempt repairs", async () => {
  const draft = missingStrength();
  const meddled = valid();
  meddled.question = "A different question entirely?";
  const provider = stub([meddled, valid()]);

  const out = await repairTurn({ draft, findings: findingsOf(draft), schema: SCHEMA }, { reason: provider.reason });

  expect(out.outcome).toBe("repaired");
  if (out.outcome !== "repaired") return;
  expect(out.attempts).toBe(2);
  // Both prompts carry the ORIGINAL object, not the meddled one.
  for (const c of provider.calls) expect(c.prompt).not.toContain("A different question entirely?");
});

/* ── the guards on their own ──────────────────────────────────────────────── */

test("changedPaths addresses additions and removals at their own element", () => {
  expect(changedPaths({ a: [1, 2, 3] }, { a: [1, 2] })).toEqual([["a", "2"]]);
  expect(changedPaths({ t: {} }, { t: { s: "x" } })).toEqual([["t", "s"]]);
  expect(changedPaths({ a: 1 }, { a: 1 })).toEqual([]);
});

test("a listed path licenses its descendants and nothing beside it", () => {
  const f: NotebookFinding[] = [{ path: "facts[1]", rule: "r", observed: "o" }];
  const base = { facts: [{ claim: "a" }, { claim: "b" }] };
  expect(guardRepair(base, { facts: [{ claim: "a" }, { claim: "B" }] }, f)).toEqual([]);
  expect(guardRepair(base, { facts: [{ claim: "A" }, { claim: "b" }] }, f).map((g) => g.path)).toEqual(["facts[0].claim"]);
  expect(pathTokens("facts[1].sources[0].name")).toEqual(["facts", "1", "sources", "0", "name"]);
});

/* ── the router row ───────────────────────────────────────────────────────── */

test("repair is a turn class of its own with a plan in both postures", () => {
  expect(planFor("repair", "local")).toEqual(["claude-cli", "google"]);
  expect(planFor("repair", "cloud")).toEqual(["google"]);
});
