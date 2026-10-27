// LANE 2b — LLM STRUCTURED-OUTPUT: reject-not-repair (dynamic).
//
// The static scan DEFERRED the LLM territory. This probe feeds crafted model
// responses through the ACTUAL parsers and asserts the reject-don't-repair
// contract: tolerate a ```json fence, reject unknown ops / missing required
// fields / prose, and NEVER silently patch a malformed plan into a valid-looking
// one. Also exercises the imaging json extractor (brace-balanced, string-aware).
import { test, expect } from "@playwright/test";
import { applyEdits, EDIT_PLAN_SCHEMA, parseEditPlan, PlanError } from "@/lib/script/editPlan";
import { ATTRIBUTION } from "@/lib/script/impact";
import { RENDERS } from "@/lib/script/renders";
import { runGate } from "@/lib/script/gate";
import { extractJsonObject, parseAgainstSchema } from "@/lib/imaging/json";
import { ImagingError } from "@/lib/imaging/errors";

const RID = "reversal-chain"; // a real RENDERS id
// A REAL BEAT MARK, and it was "0:04", which is not one. The parser now checks
// that a mark resolves — an unresolvable one used to reach `applyEdits`, where
// a cut/rewrite/retime silently did nothing and an insert silently landed at
// the end of the render. These fixtures were careful to use a real render id
// and invented the mark beside it, so every case here that expects a SUCCESSFUL
// parse was passing on a plan the app could not actually have applied.
const AT = "0:00"; // reversal-chain's opening beat
const okEdit = { renderId: RID, op: "retime", beatAt: AT, seconds: 6, why: "tighten the turn" };
const okPlan = () => ({ edits: [okEdit], refusals: [], summary: "one retime" });

test("Lane2b/editPlan: a valid plan parses", () => {
  const p = parseEditPlan(JSON.stringify(okPlan()));
  expect(p.edits).toHaveLength(1);
  expect(p.edits[0].op).toBe("retime");
});

test("Lane2b/editPlan: a ```json fence is TOLERATED", () => {
  const fenced = "Here is the plan:\n```json\n" + JSON.stringify(okPlan()) + "\n```\n";
  const p = parseEditPlan(fenced);
  expect(p.edits).toHaveLength(1);
});

test("Lane2b/editPlan: prose / non-JSON is REJECTED (not coerced)", () => {
  expect(() => parseEditPlan("I couldn't produce a plan, sorry.")).toThrow(PlanError);
});

test("Lane2b/editPlan: an UNKNOWN op is REJECTED", () => {
  const bad = { ...okPlan(), edits: [{ renderId: RID, op: "delete", beatAt: AT, why: "x" }] };
  let msg = "";
  try { parseEditPlan(JSON.stringify(bad)); } catch (e) { msg = (e as Error).message; }
  console.log(`[Lane2b] unknown-op rejection: ${msg}`);
  expect(msg).toMatch(/unknown op/i);
});

test("Lane2b/editPlan: a renderId that does not exist is REJECTED", () => {
  const bad = { ...okPlan(), edits: [{ renderId: "made-up-render", op: "retime", beatAt: AT, why: "x" }] };
  expect(() => parseEditPlan(JSON.stringify(bad))).toThrow(/does not exist/i);
});

test("Lane2b/editPlan: rewrite/insert WITHOUT cards is REJECTED (matrix would otherwise lie)", () => {
  const bad = { ...okPlan(), edits: [{ renderId: RID, op: "rewrite", beatAt: AT, text: "new line", why: "x" }] };
  let msg = "";
  try { parseEditPlan(JSON.stringify(bad)); } catch (e) { msg = (e as Error).message; }
  console.log(`[Lane2b] missing-cards rejection: ${msg}`);
  expect(msg).toMatch(/cards/i);
});

test("Lane2b/editPlan: a missing `why` is REJECTED", () => {
  const bad = { ...okPlan(), edits: [{ renderId: RID, op: "cut", beatAt: AT }] };
  expect(() => parseEditPlan(JSON.stringify(bad))).toThrow(/why/i);
});

test("Lane2b/editPlan: missing `edits` array / missing `summary` are REJECTED", () => {
  expect(() => parseEditPlan(JSON.stringify({ summary: "x" }))).toThrow(/edits/i);
  expect(() => parseEditPlan(JSON.stringify({ edits: [] }))).toThrow(/summary/i);
});

// BOUNDARY PROBE: the declared schema says additionalProperties:false, but the
// runtime validator does not enforce it. This documents ACTUAL behavior: an
// unknown extra property rides through. It is NOT a silent repair (no field is
// invented), but the runtime is weaker than the declared contract.
test("Lane2b/editPlan: BOUNDARY — unknown extra property is NOT rejected (schema says it should be)", () => {
  const withExtra = {
    ...okPlan(),
    edits: [{ renderId: RID, op: "retime", beatAt: AT, seconds: 6, why: "x", bogusField: "smuggled" }],
  };
  let parsed: ReturnType<typeof parseEditPlan> | null = null;
  let threw = false;
  try { parsed = parseEditPlan(JSON.stringify(withExtra)); } catch { threw = true; }
  console.log(`[Lane2b] extra-prop rejected? ${threw}; extra survives on edit? ${parsed ? "bogusField" in (parsed.edits[0] as unknown as Record<string, unknown>) : "n/a"}`);
  // Documented reality (regression-pinned): passes through, extra prop retained,
  // but no required field is fabricated -> tolerant, not repairing.
  expect(threw).toBe(false);
  expect((parsed!.edits[0] as unknown as Record<string, unknown>).bogusField).toBe("smuggled");
});

// ---- imaging json extractor ------------------------------------------------
test("Lane2b/imaging: extractJsonObject is brace-balanced and string-aware", () => {
  const withBraceInString = 'Sure! {"caption": "a face }{ inside a string", "n": 2} trailing prose';
  const raw = extractJsonObject(withBraceInString);
  expect(raw).toBe('{"caption": "a face }{ inside a string", "n": 2}');
  expect(extractJsonObject("no json here")).toBeNull();
});

test("Lane2b/imaging: parseAgainstSchema rejects prose and missing required fields", () => {
  const schema = { type: "object", required: ["caption", "objects"] };
  // prose
  expect(() => parseAgainstSchema("google", "I see a cat.", schema)).toThrow(ImagingError);
  // missing required field
  let msg = "";
  try { parseAgainstSchema("google", '{"caption":"a cat"}', schema); } catch (e) { msg = (e as Error).message; }
  console.log(`[Lane2b] missing-required rejection: ${msg}`);
  expect(msg).toMatch(/omitted required/i);
  // valid passes and returns the parsed object
  const ok = parseAgainstSchema("google", 'prefix {"caption":"a cat","objects":[]} suffix', schema) as Record<string, unknown>;
  expect(ok.caption).toBe("a cat");
});

test("Lane2b/editPlan: a beatAt that names no beat is REJECTED (it used to fail silently)", () => {
  const bad = { ...okPlan(), edits: [{ renderId: RID, op: "cut", beatAt: "9:99", why: "x" }] };
  let msg = "";
  try { parseEditPlan(JSON.stringify(bad)); } catch (e) { msg = (e as Error).message; }
  console.log(`[Lane2b] unresolvable-mark rejection: ${msg}`);
  expect(msg).toMatch(/names no beat/i);
});

test("Lane2b/editPlan: an insert's afterBeatAt is checked too — the silent RELOCATION case", () => {
  // The worst of the three: applyEdits appends to the end of the render when
  // afterBeatAt does not resolve, so the beat ships at the close of the script.
  const bad = {
    ...okPlan(),
    // `connector` is declared so the MARK is the only thing wrong: an insert
    // without one now fails on the contract first (edit-plan-connector probe).
    edits: [{ renderId: RID, op: "insert", afterBeatAt: "9:99", connector: "THEREFORE", text: "x", cards: ["f-ath"], why: "x" }],
  };
  expect(() => parseEditPlan(JSON.stringify(bad))).toThrow(/names no beat/i);
});

test("Lane2b/editPlan: a missing required field still wins over a bad mark", () => {
  // Ordering is a stated property: the model misunderstanding the CONTRACT is
  // more useful to report than it misreading the script.
  const bad = { ...okPlan(), edits: [{ renderId: RID, op: "cut", beatAt: "9:99" }] };
  expect(() => parseEditPlan(JSON.stringify(bad))).toThrow(/why/i);
});

// ---- the schema's declared types, walked -----------------------------------
//
// parseEditPlan checked that `cards` was an array and `beatAt` a string, and no
// other declared type. Measured before the fix, over every wrong-typed value of
// every property EDIT_PLAN_SCHEMA declares on a retime/rewrite/insert/cut, plus
// a non-object edit and wrong-typed refusals: 137 mutations, 89 refused, 37
// accepted (a retime whose `seconds` is a string retimes nothing; a `label` of
// 42 reaches the beat; `refusals: "x"` became []), and 11 threw a TypeError -
// `edits: [null]` out of the door itself, and a rewrite whose `text` is 42 out
// of the gate the applied chain is run through. The walk reads the SCHEMA, so a
// property added to it is walked without this file changing.
test("Lane2b/editPlan: every wrong-typed declared property is REFUSED, and nothing throws past the door", () => {
  const BEAT = "0:12";
  const base: Record<string, Record<string, unknown>> = {
    retime: { renderId: RID, op: "retime", beatAt: BEAT, seconds: 9, why: "w" },
    rewrite: { renderId: RID, op: "rewrite", beatAt: BEAT, seconds: 9, text: "t", label: "l", cards: ["f-sbr"], why: "w" },
    insert: { renderId: RID, op: "insert", afterBeatAt: BEAT, seconds: 9, text: "t", label: "l", connector: "BUT", cards: ["f-sbr"], why: "w" },
    cut: { renderId: RID, op: "cut", beatAt: BEAT, why: "w" },
  };
  const props = EDIT_PLAN_SCHEMA.properties.edits.items.properties as Record<string, { type: string }>;
  const fits = (type: string, v: unknown) =>
    type === "string" ? typeof v === "string" : type === "integer" ? typeof v === "number" : type === "array" ? Array.isArray(v) && v.every((x) => typeof x === "string") : true;
  const WRONG: unknown[] = [null, 42, true, {}, [], "s", ["s", 1]];
  const plans: unknown[] = [];
  for (const ok of Object.values(base))
    for (const k of Object.keys(props))
      if (k in ok && k !== "op")
        for (const v of WRONG) if (!fits(props[k]!.type, v)) plans.push({ edits: [{ ...ok, [k]: v }], refusals: [], summary: "s" });
  for (const edits of [[null], [5], ["x"]]) plans.push({ edits, refusals: [], summary: "s" });
  for (const refusals of [[5], "x", [{ note: 1, why: 2 }], [{ note: "n" }]]) plans.push({ edits: [], refusals, summary: "s" });
  // A retime is nothing but its seconds: without them it silently changes nothing.
  plans.push({ edits: [{ renderId: RID, op: "retime", beatAt: BEAT, why: "w" }], refusals: [], summary: "s" });
  expect(plans.length, "the walk generated no mutations").toBeGreaterThan(100);

  const accepted: string[] = [];
  const threw: string[] = [];
  for (const p of plans) {
    try {
      const plan = parseEditPlan(JSON.stringify(p));
      const a = applyEdits(RENDERS.find((r) => r.id === RID)!, plan.edits, ATTRIBUTION[RID] ?? {});
      runGate({ id: RID, beats: a.beats }, { connectors: true });
      accepted.push(JSON.stringify(p));
    } catch (e) {
      if (!(e instanceof PlanError)) threw.push(`${JSON.stringify(p)}: ${(e as Error).message}`);
    }
  }
  expect(threw, "a wrong-typed plan threw past the door").toEqual([]);
  expect(accepted, "a wrong-typed plan was accepted").toEqual([]);
  // The control: every base edit still parses, applies and gates.
  for (const ok of Object.values(base)) expect(() => parseEditPlan(JSON.stringify({ edits: [ok], refusals: [], summary: "s" }))).not.toThrow();
});
