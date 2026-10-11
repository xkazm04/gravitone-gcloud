// THE REMAINING PROPERTIES of NOTEBOOK_SCHEMA, from `scaleConversions` to
// `researchGaps`.
//
// Split out of schema.ts so that file stays under the 200-line limit. Spread back
// into NOTEBOOK_SCHEMA in their original order (see schema.ts); the keys and
// values below are unchanged.

export const TAIL_PROPERTIES = {
  scaleConversions: {
    type: "array",
    items: {
      type: "object",
      properties: {
        for: { type: "string", description: "the fact id this restates. Without it nothing can check the felt form." },
        raw: { type: "string" },
        felt: { type: "string" },
        kind: { type: "string", enum: ["cash", "non-cash", "count", "ratio"] },
      },
      required: ["for", "raw", "felt"],
    },
  },
  analogyCandidates: {
    type: "array",
    items: {
      type: "object",
      properties: {
        for: { type: "string" },
        analogy: { type: "string" },
        quality: { type: "string", enum: ["strong", "medium", "weak"] },
      },
      required: ["for", "analogy", "quality"],
    },
  },
  candidateQuestions: { type: "array", items: { type: "string" } },
  counterPositions: {
    type: "array",
    items: {
      type: "object",
      properties: {
        position: { type: "string" },
        holder: { type: "string", description: "WHO holds it. Two holders collapsed into one is a right of reply averaged away." },
        evidence: { type: "array", items: { type: "string" } },
        statementVerbatim: { type: "string" },
        locator: { type: "string" },
      },
      required: ["position", "holder", "evidence"],
    },
  },
  unknowns: {
    type: "array",
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        what: { type: "string" },
        why: { type: "string" },
        impact: {
          type: "string",
          description: "what the script may NOT say. An unknown with no consequence is a note, not a constraint.",
        },
        about: { type: "array", items: { type: "string" }, description: "fact ids this constraint is scoped to" },
        resolvedBy: { type: "string" },
      },
      required: ["id", "what", "why", "impact"],
    },
  },
  obligations: {
    type: "array",
    description: "the must-say half. An unknown that implies a range carries a matching obligation.",
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        must: { type: "string" },
        why: { type: "string" },
        about: { type: "array", items: { type: "string" } },
        resolvedBy: { type: "string" },
      },
      required: ["id", "must", "why"],
    },
  },
  engineFit: {
    type: "array",
    items: {
      type: "object",
      properties: {
        engine: { type: "string" },
        label: { type: "string" },
        fit: { type: "string", enum: ["excellent", "good", "poor"] },
        why: { type: "string" },
        recommended: { type: "boolean" },
        hazard: {
          type: "string",
          description: "what a WRONG render through this engine costs; empty string means assessed, none found",
        },
      },
      required: ["engine", "label", "fit", "why", "hazard"],
    },
  },
  currency: {
    type: "object",
    properties: {
      halfLife: { type: "string" },
      why: { type: "string" },
      expiresFirst: { type: "array", items: { type: "string" } },
      durable: { type: "array", items: { type: "string" } },
      advice: { type: "string", description: "a phrasing that trades precision for shelf life" },
    },
    required: ["halfLife", "why", "expiresFirst", "durable", "advice"],
  },
  dimensions: {
    type: "array",
    description:
      "OPTIONAL. The columns this topic's cards are reviewed in, derived from the topic. Omit to use the default market columns; declare them and every fact, mechanism and reversal carries a `dimension`.",
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        purpose: { type: "string", description: "what this column is for, in the reviewer's terms" },
        emptyByOmission: { type: "string", description: "what an empty column means when the run did not look here" },
        notApplicable: { type: "string", description: "what an empty column means when there is nothing here to find" },
      },
      required: ["id", "label", "purpose", "emptyByOmission", "notApplicable"],
    },
  },
  conclusions: {
    type: "array",
    description:
      "OPTIONAL. Reasoned claims that go beyond the sourced facts, filed apart from them. Each rests on fact ids and states what would falsify it. Omit when there are none.",
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        claim: { type: "string" },
        reasoning: { type: "string" },
        leap: { type: "string", enum: ["near", "moderate", "far", "unhinged"] },
        restsOn: { type: "array", items: { type: "string" }, description: "fact or mechanism ids" },
        falsifiableBy: { type: "string", description: "what a reader could go and look at that would settle it" },
        useFor: { type: "string", enum: ["thesis", "reversal", "reframe", "steel-man", "colour", "boundary"] },
      },
      required: ["id", "claim", "reasoning", "leap", "restsOn", "falsifiableBy", "useFor"],
    },
  },
  sources: { type: "array", items: { type: "string" } },
  researchGaps: {
    type: "array",
    description: "what this run did NOT do. A notebook claiming no gaps did not look hard enough.",
    items: { type: "string" },
  },
} as const;
