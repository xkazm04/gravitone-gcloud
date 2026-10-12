// THE REASONING NODES of NOTEBOOK_SCHEMA: `mechanisms[]`, `reversals[]` and
// `steelMan`, on their own.
//
// Split out of schema.ts so that file stays under the 200-line limit. They sit
// together because they are the reasoning half of a notebook, filed beside the
// sourced facts they turn on. Spread back into NOTEBOOK_SCHEMA in their original
// order (see schema.ts); the keys and values below are unchanged.

export const REASONING_PROPERTIES = {
  mechanisms: {
    type: "array",
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        chain: {
          type: "array",
          items: { type: "string" },
          description:
            "the rendered prose form, each link opening with BUT, THEREFORE or TRANSFER. Never AND THEN — that is a sequence, not a mechanism.",
        },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              connector: { type: "string", enum: ["BUT", "THEREFORE", "TRANSFER"] },
              evidence: { type: "array", items: { type: "string" } },
            },
            required: ["text"],
          },
        },
        evidence: { type: "array", items: { type: "string" }, description: "mechanism-level fact ids" },
        explains: { type: "string" },
        needsAnalogy: { type: "boolean" },
        note: { type: "string" },
        dimension: {
          type: "string",
          description:
            "the id of a column in `dimensions[]` this card files under. Required on every fact, mechanism and reversal when `dimensions` is declared.",
        },
      },
      required: ["id", "name", "chain", "explains", "needsAnalogy"],
    },
  },
  reversals: {
    type: "array",
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        obviousReading: {
          type: "string",
          description: "state it GENEROUSLY — a strawman here becomes a strawman on screen",
        },
        whyWrong: { type: "string" },
        mechanismId: { type: "string", description: "the mechanism id this turns on, or omit" },
        evidence: { type: "array", items: { type: "string" } },
        escalation: { type: "string" },
        note: { type: "string" },
        dimension: {
          type: "string",
          description:
            "the id of a column in `dimensions[]` this card files under. Required on every fact, mechanism and reversal when `dimensions` is declared.",
        },
      },
      required: ["id", "obviousReading", "whyWrong", "evidence", "escalation"],
    },
  },
  steelMan: {
    type: "object",
    description: "MANDATORY. The strongest case against your own verdict, in the words its believers would use.",
    properties: {
      claim: { type: "string" },
      evidence: { type: "array", items: { type: "string" } },
      statement: { type: "string" },
      whyInclude: { type: "string" },
      provenance: {
        type: "string",
        enum: ["found", "found-adjacent", "constructed"],
        description: "an unmarked construction is the failure mode this field was written against",
      },
      restsOnAbsence: { type: "string", description: "constructed only — the fact id of the dated absence" },
    },
    required: ["claim", "evidence", "statement", "whyInclude", "provenance"],
  },
} as const;
