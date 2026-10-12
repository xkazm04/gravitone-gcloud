// HOW LONG IT HAS SAT — the one figure a pipeline always has and no adapter
// reports, in the largest unit that is still exact enough to act on.
//
// ONE HOME, because there were four. Three skins each grew their own copy
// (ledger, bench, transit) and round 1 moved the figure off the ledger's card
// into `ItemDetail`, which would have made a fourth. Four copies of a rounding
// rule is four answers to "how old is this card", and the board shows two of
// them at once the moment a skin and the detail disagree.

/** `12m` · `5h` · `3d`, or "" when the stamp is unreadable or in the future.
 *  Empty is the honest answer: a caller draws its own em dash rather than a
 *  computed "0m" that claims a measurement nobody made. */
export function dwell(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}
