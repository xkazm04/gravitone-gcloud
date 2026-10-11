// THE `facts[]` PROPERTY of NOTEBOOK_SCHEMA, on its own.
//
// Split out of schema.ts so that file stays under the 200-line limit. This is one
// of three property groups spread back into NOTEBOOK_SCHEMA in their original
// order (see schema.ts); the keys and values below are unchanged.

/** The fact node: the sourced, dated, graded claims a notebook rests on. */
export const FACT_PROPERTIES = {
  facts: {
    type: "array",
    items: {
      type: "object",
      properties: {
        id: { type: "string", description: "f-* — unique across the WHOLE notebook, not just this array" },
        claim: {
          type: "string",
          description: "a HEADLINE: one declarative clause, 90 characters or fewer, no trailing period",
        },
        loadBearing: { type: "boolean", description: "does the argument collapse without it?" },
        kind: { type: "string", enum: ["found", "derived", "absence", "utterance", "plan"] },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        confidenceNote: { type: "string", description: "why the confidence is what it is — stated, never implied" },
        sources: {
          type: "array",
          description: "PLURAL, ALWAYS. Never comma-join publications into one string.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              evidenceClass: {
                type: "string",
                enum: ["primary", "secondary", "aggregator", "vendor", "self-published", "protected"],
              },
              locator: { type: "string", description: "page, line, article, tx hash or timestamp" },
              interested: { type: "boolean" },
            },
            required: ["name", "evidenceClass"],
          },
        },
        asOf: { type: "string", description: "when the RESEARCHER last checked. Not the event." },
        eventDate: { type: "string", description: "when the thing described happened" },
        period: { type: "string", description: "the window a quantity covers" },
        unit: { type: "string" },
        denominator: { type: "string", description: "what a percentage is a percentage OF" },
        subject: { type: "string" },
        searchScope: { type: "string", description: "kind:absence only — the register searched and the period" },
        derivedFrom: { type: "array", items: { type: "string" } },
        method: { type: "string" },
        contests: { type: "array", items: { type: "string" }, description: "fact ids this one contradicts" },
        qualifies: { type: "array", items: { type: "string" } },
        note: { type: "string", description: "the argument, the numbers and every qualification" },
        dimension: {
          type: "string",
          description:
            "the id of a column in `dimensions[]` this card files under. Required on every fact, mechanism and reversal when `dimensions` is declared.",
        },
      },
      required: ["id", "claim", "loadBearing", "confidence", "asOf", "sources"],
    },
  },
} as const;
