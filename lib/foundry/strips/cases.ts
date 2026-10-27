import { existsSync } from "node:fs";
import path from "node:path";

import { loadApproaches } from "./cards.ts";

// THE STRIP CASES a Floor video run can name (pipeline/strips/approaches.json, grouped by case). Read by
// the composer's choices and the video lane's door (lib/produce/laneDoors.ts); moved out of app/ so the
// Board's spend packet can price a strips run too (spark athena-control-mcp).

/** A strips subject is a case: the approach cards written for it, by lane. */
export type StripCase = { readonly id: string; readonly lane: "edu" | "stat"; readonly approaches: readonly string[] };

export function stripCases(cwd: string): readonly StripCase[] {
  if (!existsSync(path.join(cwd, "pipeline", "strips", "approaches.json"))) return [];
  const by = new Map<string, { lane: "edu" | "stat"; approaches: string[] }>();
  for (const a of loadApproaches(cwd)) {
    const c = by.get(a.case) ?? { lane: a.lane, approaches: [] };
    c.approaches.push(a.id);
    by.set(a.case, c);
  }
  return [...by.entries()].map(([id, c]) => ({ id, lane: c.lane, approaches: c.approaches })).sort((a, b) => a.lane.localeCompare(b.lane) || a.id.localeCompare(b.id));
}
