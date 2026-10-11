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
