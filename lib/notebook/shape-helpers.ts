// THE SHAPE HALF'S PREDICATES AND CONSTANTS: the type guards, the claim budget, the
// allowed enumerations and the link-word test that the shape checks are written in.
//
// Split out of the shape half so shape.ts and shape-columns.ts can both import them
// without importing each other. These are plain helpers with no state.

export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

export const arr = (v: unknown): v is unknown[] => Array.isArray(v);

/** NOTEBOOK-SCHEMA § `claim`: "one declarative clause, ≤ 90 characters, no
 *  trailing period". Run 1 shipped three-sentence claims and every reading
 *  surface has had to truncate them since, so this is a budget with a scar. */
export const CLAIM_MAX = 90;

export const LEAPS: readonly string[] = ["near", "moderate", "far", "unhinged"];
export const USES: readonly string[] = ["thesis", "reversal", "reframe", "steel-man", "colour", "boundary"];

/** The link words a mechanism chain may use.
 *
 *  BUT and THEREFORE are RESEARCH-PROMPT § Phase 3's whole rule ("if the only
 *  honest connector is AND THEN, you have a sequence, not a mechanism").
 *  TRANSFER is notebook vocabulary only (types.ts::ChainConnector) — a
 *  deduction, a hand-off, a recognition event — and is NOT a render licence. */
const CHAIN_WORDS = ["BUT", "THEREFORE", "TRANSFER"] as const;

/** Does this prose link open with a sanctioned connector? The first link of a
 *  chain has nothing to connect to and is exempt — the fixture's own chains open
 *  with a bare statement (`facts.ts` / `notebook.ts`), so requiring one here
 *  would fail the control this app validates every edit against. */
export const linked = (s: string) => CHAIN_WORDS.some((w) => s.trim().toUpperCase().startsWith(w));

/** The part of a JSON Schema node the walk below reads. */
export interface SchemaNode {
  type?: string;
  properties?: Readonly<Record<string, SchemaNode>>;
  items?: SchemaNode;
  anyOf?: readonly SchemaNode[];
  required?: readonly string[];
  enum?: readonly string[];
}

const KIND: Readonly<Record<string, (v: unknown) => boolean>> = {
  object: isObj,
  array: arr,
  string: (v) => typeof v === "string",
  boolean: (v) => typeof v === "boolean",
};

const kindOf = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

/**
 * THE ANSWER WALKED AGAINST NOTEBOOK_SCHEMA ITSELF, so the shape half cannot fall
 * behind the schema the engine is asked to satisfy. The hand rules in shape.ts are
 * the schema document's judgements; this is the schema object's TYPES, read off
 * the one definition rather than restated.
 *
 * It exists because the graph pass that runs after a clean shape reaches into
 * every optional array and id list unguarded (`nb.scaleConversions.forEach`,
 * `for (const r of f.contests)`): an answer whose `contests` was a number threw a
 * TypeError out of the validator, which is no NotebookError, so the turn lost its
 * paid-for draft and the repair loop died mid-attempt. Measured over every
 * schema node mutated to a wrong type: 16 such throws.
 *
 * Its `required` and `enum` are read too, because on the prompted rung (the local
 * CLI has no output_config.format) nothing else enforces them: an answer with no
 * `steelMan.evidence` passed this door and then crashed `scopeSummary`, and a
 * `confidence: "High"` passes as a string while every `=== "high"` reader skips it.
 * Only present keys are walked; an absent optional key is not a finding here.
 */
export function schemaFindings(
  value: unknown,
  node: SchemaNode,
  path: string,
  say: (path: string, rule: string, observed?: string) => void,
): void {
  if (node.anyOf) {
    const fits = node.anyOf.some((branch) => {
      let bad = 0;
      schemaFindings(value, branch, path, () => void bad++);
      return bad === 0;
    });
    if (!fits) say(path, `\`${path}\` matches none of the forms NOTEBOOK_SCHEMA allows here.`, kindOf(value));
    return;
  }
  const is = node.type ? KIND[node.type] : undefined;
  if (is && !is(value)) return say(path, `\`${path}\` must be ${/^[aeiou]/.test(node.type ?? "") ? "an" : "a"} ${node.type} (NOTEBOOK_SCHEMA).`, kindOf(value));
  if (node.enum && !node.enum.includes(value as string))
    return say(path, `\`${path}\` must be one of ${node.enum.join(", ")} (NOTEBOOK_SCHEMA).`, String(value));
  if (node.type === "object" && isObj(value) && node.properties) {
    for (const k of node.required ?? [])
      if (value[k] === undefined) say(path ? `${path}.${k}` : k, `\`${path ? `${path}.${k}` : k}\` is required (NOTEBOOK_SCHEMA).`, "missing");
    for (const [k, child] of Object.entries(node.properties))
      if (value[k] !== undefined) schemaFindings(value[k], child, path ? `${path}.${k}` : k, say);
  }
  if (node.type === "array" && arr(value) && node.items)
    value.forEach((item, i) => schemaFindings(item, node.items as SchemaNode, `${path}[${i}]`, say));
}
