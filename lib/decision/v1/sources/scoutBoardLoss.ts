import type { StoryboardCandidate } from "../../../foundry/scout/types.ts";
import type { Loss } from "../types.ts";

// THE PANEL THAT DREW NOTHING, ON THE BOARD (perfect 2026-11-08, missing-frame-on-board) - pure, beside ./scoutPlan.ts.
//
// A rendered storyboard can be short: an `images` entry that is null is a panel the engine refused, and a cell that
// is not there leaves no trace on the desk. Each such panel is a Loss under its own cell id (`c-13/panel-2`), the
// engine's sentence beside it.
//
// ATTRIBUTION. `settledBoard` keeps every panel's sentence joined with "; " in the candidate's one `error`, and
// lib/producers/scoutStoryboardActs.ts writes each as `panel N: <why>` - and reads them back by exactly this rule
// (`split("; ")`, then `startsWith("panel N: ")`) to replace a retried panel's line. So a segment that opens with
// `panel N: ` is panel N's by the engine's own convention; nothing is guessed. A null panel with no such segment
// carries no sentence of the engine's, and says only that it drew nothing. Whatever is left (a clip's sentence, the
// job's own, the tail of a sentence that itself held "; ") stays one approximate loss on the run, verbatim, so no
// word of the error is shown twice and none is dropped.

export type PanelLosses = { readonly losses: readonly Loss[]; readonly rest: string | undefined };

export function panelLosses(c: Pick<StoryboardCandidate, "id" | "images" | "error">, cellOf: (candidate: string, i: number) => string): PanelLosses {
  const segments = (c.error ?? "").split("; ").filter((s) => s !== "");
  const losses: Loss[] = [];
  (c.images ?? []).forEach((file, i) => {
    if (file !== null) return;
    const at = segments.findIndex((s) => s.startsWith(`panel ${i + 1}: `));
    const said = at < 0 ? undefined : segments.splice(at, 1)[0];
    losses.push({ candidate: cellOf(c.id, i), grade: "dropped", reason: said ?? `frame ${i + 1} drew nothing` });
  });
  return { losses, rest: segments.length === 0 ? undefined : segments.join("; ") };
}
