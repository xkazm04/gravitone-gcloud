// LANE 2b — LLM STRUCTURED-OUTPUT: reject-not-repair (dynamic).
//
// The static scan DEFERRED the LLM territory. This probe feeds crafted model
// responses through the ACTUAL parsers and asserts the reject-don't-repair
// contract: tolerate a ```json fence, reject unknown ops / missing required
// fields / prose, and NEVER silently patch a malformed plan into a valid-looking
// one. Also exercises the imaging json extractor (brace-balanced, string-aware).
import { test, expect } from "@playwright/test";
import { parseEditPlan, PlanError } from "@/app/_phases/script/editPlan";
import { extractJsonObject, parseAgainstSchema } from "@/lib/imaging/json";
import { ImagingError } from "@/lib/imaging/errors";

const RID = "reversal-chain"; // a real RENDERS id
const okEdit = { renderId: RID, op: "retime", beatAt: "0:04", seconds: 6, why: "tighten the turn" };
const okPlan = () => ({ edits: [okEdit], refusals: [], unchanged: [], summary: "one retime" });

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
  const bad = { ...okPlan(), edits: [{ renderId: RID, op: "delete", beatAt: "0:04", why: "x" }] };
  let msg = "";
  try { parseEditPlan(JSON.stringify(bad)); } catch (e) { msg = (e as Error).message; }
  console.log(`[Lane2b] unknown-op rejection: ${msg}`);
  expect(msg).toMatch(/unknown op/i);
});

test("Lane2b/editPlan: a renderId that does not exist is REJECTED", () => {
  const bad = { ...okPlan(), edits: [{ renderId: "made-up-render", op: "retime", beatAt: "0:04", why: "x" }] };
  expect(() => parseEditPlan(JSON.stringify(bad))).toThrow(/does not exist/i);
});

test("Lane2b/editPlan: rewrite/insert WITHOUT cards is REJECTED (matrix would otherwise lie)", () => {
  const bad = { ...okPlan(), edits: [{ renderId: RID, op: "rewrite", beatAt: "0:04", text: "new line", why: "x" }] };
  let msg = "";
  try { parseEditPlan(JSON.stringify(bad)); } catch (e) { msg = (e as Error).message; }
  console.log(`[Lane2b] missing-cards rejection: ${msg}`);
  expect(msg).toMatch(/cards/i);
});

test("Lane2b/editPlan: a missing `why` is REJECTED", () => {
  const bad = { ...okPlan(), edits: [{ renderId: RID, op: "cut", beatAt: "0:04" }] };
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
    edits: [{ renderId: RID, op: "retime", beatAt: "0:04", seconds: 6, why: "x", bogusField: "smuggled" }],
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
