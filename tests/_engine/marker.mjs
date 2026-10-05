// THE TWO DERIVATIONS A CASSETTE IS KEYED BY, written once (CIP-A).
//
// The stand-in (fake-claude.mjs) selects a turn by them, the probe helper
// (tests/golden-path/_helpers.ts) checks freshness by one of them, and the
// recorder (pipeline/record-engine-cassette.mts) writes both into a new
// cassette. Three copies of "how is the marker computed" would be three rules,
// and a recorder that keyed a cassette differently from the stand-in would
// produce recordings that never play.

import { createHash } from "node:crypto";

/** The line lib/imaging/json.ts::schemaInstruction writes immediately before
 *  the one-line JSON Schema the router appends for an engine that cannot
 *  enforce a schema itself. */
export const SCHEMA_LEAD = "It must satisfy this JSON Schema:";

/** @param {string} s */
export const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * The turn marker: the prompt's first `# ` heading, and the sha256 of the
 * schema line after the LAST schema lead (the router's, which follows any the
 * route wrote itself).
 * @param {string} prompt
 * @returns {{ heading: string | null, schemaSha256: string | null }}
 */
export function markerOf(prompt) {
  const lines = prompt.split(/\r?\n/);
  const heading = lines.find((l) => /^# \S/.test(l))?.trim() ?? null;
  const at = lines.lastIndexOf(SCHEMA_LEAD);
  const schemaSha256 = at >= 0 && at + 1 < lines.length ? sha256(lines[at + 1]) : null;
  return { heading, schemaSha256 };
}

/**
 * The door's argv, fingerprinted. Pass `cliArgs(false)` — the off-shell form —
 * so a cassette recorded on one platform plays on the other.
 * @param {readonly string[]} args
 */
export const fingerprintOf = (args) => sha256(JSON.stringify(args)).slice(0, 16);
