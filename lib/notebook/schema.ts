// THE NOTEBOOK JSON SCHEMA, assembled from its property groups.
//
// The object is one literal of about 310 lines, so it is kept here as the
// top-level frame (type, the identity and tension properties, and `required`)
// and its larger property groups live beside it: schema-facts.ts,
// schema-reasoning.ts and schema-tail.ts. They are spread back in at the same
// positions, so the emitted schema has the same keys in the same order.

import { FACT_PROPERTIES } from "./schema-facts";
import { REASONING_PROPERTIES } from "./schema-reasoning";
import { TAIL_PROPERTIES } from "./schema-tail";

/* ─────────────────────────────── the JSON schema ─────────────────────────── */

/**
 * The shape the engine is asked to return, as JSON Schema.
 *
 * Handed to `reason({ schema })`, which means one of two things happens and
 * `provenance.schemaEnforcement` says which: Gemini constrains its own decoding
 * to it, or the local CLI — which has no `output_config.format` — gets it
 * appended to the prompt and the answer is checked on the way back. Either way
 * `parseNotebook` below runs, because a validator that only runs on the weaker
 * rung is a validator nobody tests (/api/recalibrate's own words).
 *
 * NO `additionalProperties`, ANYWHERE, AND THAT IS A DECISION. It is on
 * providers/google.ts::UNSUPPORTED_KEYWORDS, so one occurrence anywhere in this
 * object would demote the whole schema from `native` to `prompted` on the cloud
 * rung — trading real vendor-side enforcement for a stricter rule this app does
 * not need. A notebook carrying an extra key is not a defect; a notebook missing
 * `tension` is, and `required` catches that on both rungs.
 *
 * The field names are the TYPESCRIPT ones (`loadBearing`, `steelMan`,
 * `researchGaps`), not the schema document's snake_case. The document describes
 * the contract; `types.ts` is what the app actually holds, the fixture is
 * written in it, and a route that translated between two spellings would be one
 * more place the two could drift.
 */
export const NOTEBOOK_SCHEMA = {
  type: "object",
  properties: {
    topic: { type: "string", description: "the subject as the creator typed it, echoed back verbatim" },
    question: {
      type: "string",
      description:
        "the topic rewritten as the question the video answers. If this cannot be written, the topic is not yet a video.",
    },
    verdict: { type: "string", description: "the one-sentence answer, written during research" },
    templateIntent: { type: "string" },
    subjectDomain: { type: "array", items: { type: "string" } },
    tension: {
      type: "object",
      description:
        "where what people believe and what is true come apart. A notebook without one is a FAILED notebook — say so rather than inventing one.",
      properties: {
        expectation: { type: "string" },
        reality: { type: "string" },
        whyItIsATension: { type: "string" },
        strength: { type: "string", enum: ["high", "moderate", "weak"] },
      },
      required: ["expectation", "reality", "whyItIsATension", "strength"],
    },
    ...FACT_PROPERTIES,
    ...REASONING_PROPERTIES,
    ...TAIL_PROPERTIES,
  },
  required: [
    "topic",
    "question",
    "verdict",
    "tension",
    "facts",
    "mechanisms",
    "reversals",
    "steelMan",
    "unknowns",
    "engineFit",
    "currency",
    "researchGaps",
  ],
} as const satisfies Record<string, unknown>;
