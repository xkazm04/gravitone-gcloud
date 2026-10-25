// "WHAT YOU SEE STOPPED BEING CONFIRMED" - a live view's edge, drawn only when it is not live
// (v1 components/ui/signal/StaleBadge.tsx; INVENTORY.md listed it as not built until a page
// had a live edge, which the Ledger is).
//
// Kept from v1: amber, never rose - a feed that went quiet is a limit to know about, not a
// thing that broke, and a warning dressed as an error teaches people to ignore both; and
// one or two words, never a paragraph. Upgraded: v1's badge took its words from the caller
// and so said whatever each caller thought stale meant. Here it reads @gt/ui/freshness's
// `view` - `stale` (quiet past the silence bound, the held rows still actionable) or `down`
// (nothing actionable held) - and the age is freshness's own coarse `formatAge`. Live draws
// nothing: the normal state is not a badge.
//
// THE REGION IS MOUNTED WHILE LIVE, EMPTY (2026-10-25). Assistive technology announces a change
// inside a live region it already observes; a region rendered with its text already in it
// announces nowhere (lib/announcer.tsx, tests/golden-path/announcement.probe.spec.ts "MOUNT
// EMPTY"). Returning null while live meant the status region arrived WITH `stale` in it, so the
// feed going quiet was never spoken. While live the empty region takes the sr-only box: out of
// flow, so a toolbar's gap does not open around nothing.
import { formatAge, type Edge } from "../../freshness/core.ts";
import sr from "../a11y/SrOnly.module.css";
import { Chip } from "../chip/Chip.tsx";

export type StaleBadgeProps = {
  readonly edge: Edge;
  /** Age of what is shown, from the freshness view; absent before the first value. */
  readonly ageMs?: number;
  /** What went quiet, for the accessible name: `ledger feed`. */
  readonly feed: string;
};

export function StaleBadge({ edge, ageMs, feed }: StaleBadgeProps) {
  if (edge === "live") return <span role="status" className={sr.sr} />;
  const age = ageMs === undefined ? undefined : formatAge(ageMs);
  const word = edge === "stale" ? "stale" : "offline";
  return (
    <span role="status">
      <Chip label={word} tone="amber" dot casing="lower" {...(age === undefined ? {} : { value: age })} name={`${feed} ${word}${age === undefined ? "" : `, ${age} old`}`} />
    </span>
  );
}
