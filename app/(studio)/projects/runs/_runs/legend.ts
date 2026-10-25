import { jobMachine } from "@gt/domain/job.machine";
import { STATUS, type Look } from "@gt/ui/components/status/status.ts";

// THE DAY-LINE'S KEY - one swatch per look, labelled with EVERY job state the look paints, read
// from STATUS.job so the key cannot name fewer states than the bars show. The weir's own pins draw
// the amber look too (a held lane, a packet at the gate), so amber leads with "at weir".

const ORDER: readonly Look[] = ["running", "idle", "awaiting", "failed", "paused", "done"];

export type LegendEntry = { readonly look: Look; readonly label: string };

export function legendOf(): readonly LegendEntry[] {
  return ORDER.map((look) => {
    const names = jobMachine.states.filter((state) => STATUS.job[state].look === look).map((state) => STATUS.job[state].label);
    const labels = look === "awaiting" ? ["at weir", ...names] : names;
    return { look, label: [...new Set(labels)].join(" · ") };
  });
}
