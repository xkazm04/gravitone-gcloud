import { stat } from "node:fs/promises";
import path from "node:path";

import { draftOf, draftRel } from "./draft";
import { readPlan } from "./plan";
import { nightDir } from "./store";
import type { Night } from "./types";

// `## Drafts from the night` (spark scout-vision S6) - the previous night's drafts in the next taste brief: each
// `draft` plan item the night-fill wrote (./draft.ts), its title and the file's path, so the seat may build on one
// or let it go. A draft is never a candidate and never judged; the brief lists what is on disk and nothing else.
// The previous night is the newest of `nights` (the brief's own list, the night being opened left out). A night
// with no drafts, or a plan that does not read, adds no section.

export const DRAFTS_HEADING = "## Drafts from the night";

export async function draftsSection(nights: readonly Night[]): Promise<string[]> {
  const prev = nights[0];
  if (prev === undefined) return [];
  const items = await readPlan(prev.id).catch(() => []);
  const lines: string[] = [];
  for (const it of items) {
    if (it.kind !== "draft" || it.state !== "launched") continue;
    const file = path.join(nightDir(prev.id), draftRel(it.id));
    if (!(await stat(file).then((s) => s.isFile(), () => false))) continue;
    const d = draftOf(it.payload);
    lines.push(`- ${d.ok ? d.value.title : it.id} - ${file}`);
  }
  return lines.length === 0 ? [] : [DRAFTS_HEADING, "", `night ${prev.id}:`, ...lines, ""];
}
