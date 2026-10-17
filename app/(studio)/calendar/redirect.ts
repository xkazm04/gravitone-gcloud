// WHERE A v1 CALENDAR ADDRESS GOES NOW (Phase 6 COMMON decision 5; plan §5.7: deep links become
// redirects). v1's /calendar was a page of its own with its tab in the query (`?tab=schedule|
// channels|metrics`, app/calendar/CalendarView.tsx); the calendar is the Floor's month now, and a
// slot's record is the level over it. A bookmark, the v1 Board's publish source and a ledger row
// from before the cutover hold `/calendar`, some with `?slot=<id>`: the month opens, with that
// slot's record over it. The tab is not carried - channels are toggles on the month itself.
// The slot id goes through the Floor's own URL rules (parseFloorUrl), so an id the Floor would
// refuse is dropped here as it would be there, never spliced raw.
//
// Pure, so the table is asserted without a server (tests/next-server/calendar-redirect.test.ts).

import { floorSearch, parseFloorUrl } from "../floor/_floor/model.ts";

export function v1CalendarTarget(params: { readonly slot?: string | undefined }): string {
  const url = parseFloorUrl(params.slot === undefined ? { cal: "1" } : { cal: "1", slot: params.slot });
  return `/floor${floorSearch(url)}`;
}
