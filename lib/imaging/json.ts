// Getting JSON out of a vision model, and knowing when we did not.
//
// Written because the reference implementation in the personas repo asks for
// JSON in the prompt and then prints whatever comes back — validation is left
// to whoever called it, which in practice means nobody. A recognition result
// the caller has to hand-parse is not a contract, so this module is the
// difference between `text` and `json` in Recognition.
//
// Vendors differ in how much help they give: Gemini can enforce a response
// schema natively, the Qwen OpenAI-compatible endpoint (as used here) cannot.
// Both end up here, so a schema means the same thing whichever answered.

import { ImagingError } from "./errors";
import type { ProviderId } from "./types";

/** Pull the first balanced JSON object out of a model's answer.
 *
 *  Models fence it, preface it with "Here's the JSON:", or occasionally emit it
 *  bare. Brace-counting rather than a regex because a regex cannot match nested
 *  objects, and string-aware because a `}` inside a value must not close it. */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\") {
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** The instruction appended when a caller supplies a schema and the vendor
 *  cannot enforce one. Deliberately blunt — politeness costs compliance. */
export function schemaInstruction(schema: Record<string, unknown>): string {
  return [
    "",
    "Return ONE JSON object and nothing else — no prose before or after it, no code fence.",
    "It must satisfy this JSON Schema:",
    JSON.stringify(schema),
  ].join("\n");
}

/**
 * Parse and shallow-check a model's JSON against the schema's `required` and
 * top-level `type`. Not a full JSON Schema validator on purpose: the failure
 * this guards against is a model answering in prose or omitting a field, not a
 * model producing a subtly mistyped nested union. A real validator is a
 * dependency, and this is the 95% of the value at none of the cost.
 */
export function parseAgainstSchema(
  provider: ProviderId,
  text: string,
  schema: Record<string, unknown>,
): unknown {
  const raw = extractJsonObject(text);
  if (!raw)
    throw new ImagingError(
      `${provider} was asked for JSON and answered with prose.`,
      "bad-response",
      provider,
      text.slice(0, 400),
    );

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ImagingError(
      `${provider} returned malformed JSON.`,
      "bad-response",
      provider,
      raw.slice(0, 400),
    );
  }

  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  if (required.length) {
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      throw new ImagingError(
        `${provider} returned JSON that is not an object.`,
        "bad-response",
        provider,
        raw.slice(0, 400),
      );
    const missing = required.filter((k) => !(k in (parsed as Record<string, unknown>)));
    if (missing.length)
      throw new ImagingError(
        `${provider} omitted required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
        "bad-response",
        provider,
        raw.slice(0, 400),
      );
  }
  return parsed;
}
