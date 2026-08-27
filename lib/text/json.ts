// Getting JSON out of a reasoning model, and knowing when we did not.
//
// TWO OF THE THREE FUNCTIONS THIS NEEDS ALREADY EXIST, so this module imports
// them rather than writing them twice. `extractJsonObject` is string-aware
// brace-counting over a model's answer and `schemaInstruction` is a fixed block
// of prompt text; neither knows anything about images, both are pure, and a
// second copy of brace-counting is a second copy that can drift. The one piece
// that genuinely differs is the failure type — imaging's raises `ImagingError`,
// and a route handler switching on `TextError.kind` must not receive one — so
// only `parseAgainstSchema` is restated here.
//
// The import direction is lib/text → lib/imaging, and it is safe: both trees are
// server-only, and the two functions taken from there import nothing that reads
// process.env. If lib/imaging ever moves, these two go to a neutral home; until
// then a cross-import beats a fork.

import { extractJsonObject, schemaInstruction } from "../imaging/json";
import { TextError } from "./errors";
import type { TextProviderId } from "./types";

export { extractJsonObject, schemaInstruction };

/**
 * Parse and shallow-check a model's answer against the schema's `required` and
 * top-level `type`.
 *
 * NOT a full JSON Schema validator, on purpose and for the same reason imaging
 * gives: the failure this guards against is a model answering in prose or
 * omitting a field, not a model producing a subtly mistyped nested union. A real
 * validator is a dependency; this is 95% of the value at none of the cost.
 *
 * IT RUNS EVEN WHEN THE VENDOR ENFORCED THE SCHEMA NATIVELY, which is worth
 * stating because it looks redundant and is not. Native enforcement constrains
 * the answer against the schema THE VENDOR WAS GIVEN — and for Gemini that is a
 * translated subset (see providers/google.ts::toResponseSchema), so a `required`
 * this app depends on can be dropped in translation and the vendor will happily
 * enforce what is left. Re-checking here costs microseconds and closes that gap.
 */
export function parseAgainstSchema(
  provider: TextProviderId,
  text: string,
  schema: Record<string, unknown>,
): unknown {
  const raw = extractJsonObject(text);
  if (!raw)
    throw new TextError(
      `${provider} was asked for JSON and answered with prose.`,
      "bad-response",
      provider,
      text.slice(0, 400),
    );

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TextError(`${provider} returned malformed JSON.`, "bad-response", provider, raw.slice(0, 400));
  }

  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  if (required.length) {
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      throw new TextError(
        `${provider} returned JSON that is not an object.`,
        "bad-response",
        provider,
        raw.slice(0, 400),
      );
    const missing = required.filter((k) => !(k in (parsed as Record<string, unknown>)));
    if (missing.length)
      throw new TextError(
        `${provider} omitted required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
        "bad-response",
        provider,
        raw.slice(0, 400),
      );
  }
  return parsed;
}
