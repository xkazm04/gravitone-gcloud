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

import { NOTEBOOK_SCHEMA, NotebookError, notebookFindings, parseNotebook, type NotebookFinding } from "@/lib/notebook/validate";
import { TextError } from "@/lib/text/errors";
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

/* ── 1b. every schema node, mutated: a finding, never a TypeError ────────────── */
//
// THE POPULATION IS NOTEBOOK_SCHEMA, walked, not a list: each node at each depth
// (one sample element per array level) is set to a value of the wrong type, and
// the door must answer with a NotebookFinding. A TypeError out of the validator is
// not a refusal: research.ts rethrows it as an outage, the paid-for draft is lost
// and repairTurn dies mid-attempt. Measured before the fix: 16 of 257 mutations
// threw, 81 passed silently.

type Node = { type?: string; properties?: Record<string, Node>; items?: Node; required?: readonly string[]; enum?: readonly string[] };
type Step = string | 0;

function schemaNodes(): { path: Step[]; node: Node; requiredByParent: boolean }[] {
  const out: { path: Step[]; node: Node; requiredByParent: boolean }[] = [];
  const visit = (s: Node, path: Step[]) => {
    if (s.type === "object" && s.properties)
      for (const [k, v] of Object.entries(s.properties)) {
        out.push({ path: [...path, k], node: v, requiredByParent: !!s.required?.includes(k) });
        visit(v, [...path, k]);
      }
    if (s.type === "array" && s.items) {
      out.push({ path: [...path, 0], node: s.items, requiredByParent: false });
      visit(s.items, [...path, 0]);
    }
  };
  visit(NOTEBOOK_SCHEMA as unknown as Node, []);
  return out;
}

/** The smallest value the schema accepts at this node. */
function sampleOf(s: Node): unknown {
  if (s.type === "object") return Object.fromEntries((s.required ?? []).map((k) => [k, sampleOf(s.properties![k])]));
  if (s.type === "array") return s.items ? [sampleOf(s.items)] : [];
  if (s.type === "boolean") return true;
  return s.enum ? s.enum[0] : "x";
}

/** valid(), with `edit` applied to the container that holds the node at `path`
 *  (built from schema samples where the answer has none). */
function mutated(path: Step[], edit: (holder: Obj, key: Step) => void): Obj {
  const nb = valid();
  let holder: Obj = nb;
  let s = NOTEBOOK_SCHEMA as unknown as Node;
  for (let i = 0; i < path.length - 1; i++) {
    s = path[i] === 0 ? s.items! : s.properties![path[i] as string];
    const k = path[i] as never;
    if (typeof holder[k] !== "object" || holder[k] === null) holder[k] = sampleOf(s) as never;
    const next = holder[k] as unknown as Obj & unknown[];
    if (Array.isArray(next) && next.length === 0) next.push(sampleOf(s.items!));
    holder = next;
  }
  edit(holder, path[path.length - 1]);
  return nb;
}

const label = (p: Step[]) => p.map((k) => (k === 0 ? "[0]" : `.${k}`)).join("").replace(/^\./, "");
const WRONG: Record<string, unknown> = { string: 5, boolean: "yes", array: 5, object: 5 };

test("every NOTEBOOK_SCHEMA node set to the wrong type is refused with a finding, never thrown", () => {
  const nodes = schemaNodes().filter((n) => n.node.type && n.node.type in WRONG);
  expect(nodes.length, "the walk read nothing").toBeGreaterThan(100);
  const thrown: string[] = [];
  const silent: string[] = [];
  for (const n of nodes) {
    const nb = mutated(n.path, (h, k) => void (h[k as never] = WRONG[n.node.type!] as never));
    try {
      if (!notebookFindings(nb, TOPIC).length) silent.push(label(n.path));
    } catch (e) {
      thrown.push(`${label(n.path)}: ${(e as Error).message}`);
    }
  }
  console.log(`[repair] wrong-type mutations: ${nodes.length}, thrown ${thrown.length}, silent ${silent.length}`);
  expect(thrown).toEqual([]);
  expect(silent).toEqual([]);
});

test("every key NOTEBOOK_SCHEMA requires, removed, and every enum given a non-member, is refused", () => {
  const nodes = schemaNodes();
  const missing = nodes.filter((n) => n.requiredByParent);
  const enums = nodes.filter((n) => n.node.enum);
  expect(missing.length, "the walk found no required keys").toBeGreaterThan(40);
  expect(enums.length, "the walk found no enums").toBeGreaterThan(8);
  const silent: string[] = [];
  const check = (what: string, nb: Obj) => {
    if (!notebookFindings(nb, TOPIC).length) silent.push(what);
  };
  for (const n of missing) check(`missing ${label(n.path)}`, mutated(n.path, (h, k) => void delete h[k as never]));
  for (const n of enums) check(`off-enum ${label(n.path)}`, mutated(n.path, (h, k) => void (h[k as never] = "not-a-member" as never)));
  console.log(`[repair] required ${missing.length}, enums ${enums.length}, silent ${silent.length}`);
  expect(silent).toEqual([]);
});

test("a notebook the door accepts can be dealt: no steelMan.evidence is a finding, not a crash on the board", () => {
  const nb = valid();
  delete (nb.steelMan as Obj).evidence;
  expect(findingsOf(nb).map((f) => f.path)).toContain("steelMan.evidence");
});

test("a `killed` that is not an array of tombstones is refused, not thrown", () => {
  expect(findingsOf({ ...valid(), killed: "f-1" }).map((f) => f.path)).toContain("killed");
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

test("an attempt the router refused as bad-response is part of the bill: its cost is summed, or the total is unknown", async () => {
  const draft = missingStrength();
  const refusing = (costUsd?: number) => {
    let n = 0;
    return async (): Promise<TextResult> => {
      if (n++ === 0)
        throw new TextError("claude-cli was asked for JSON and answered with prose.", "bad-response", "claude-cli", {
          costUsd,
          costBasis: costUsd === undefined ? "unpriced" : "vendor-reported",
        });
      const json = valid();
      return { text: JSON.stringify(json), json, provenance: prov(0.2) };
    };
  };

  const paid = await repairTurn({ draft, findings: findingsOf(draft), schema: SCHEMA }, { reason: refusing(0.3) });
  expect(paid.outcome).toBe("repaired");
  expect(paid.attempts).toBe(2);
  expect(paid.costUsd, "the refused attempt's 0.3 is missing from the bill").toBeCloseTo(0.5, 10);

  const unknown = await repairTurn({ draft, findings: findingsOf(draft), schema: SCHEMA }, { reason: refusing(undefined) });
  expect(unknown.costUsd, "an unpriced refused attempt was read as free").toBeUndefined();
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
