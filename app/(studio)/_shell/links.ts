// WHERE A RECORD LIVES TODAY - one pure function from an event's subject to a label and a
// route that renders (Phase 2, lot 16). The Ledger draws every subject as a link through it,
// and Runs, the Floor and the Weir will link the same records the same way.
//
// The prototype stored `{label, href}` on every event (ledger-data.js `href.*`), so a route
// that moved left thousands of rows pointing at it. Here the ledger stores only
// `{kind, id}` and the link is derived at render: when a record's own page is built, this
// table changes and every past event follows.
//
// THE RULE: never a link to a route that does not render. v1's foundry had no per-record URL
// (lib/ledger/v1 WAVE-A: "hrefs are /foundry"), and since Phase 6 wave C it has no page at all
// (/foundry redirects to the Floor), so a forge run, an extract style, a strips pair, a Dojo
// improvement and an article step open their RUN's history in the Ledger - every act about the
// run, its items included. Not the run's Board packet: a v1 run committed before the Board existed refuses to
// open as one, and a link that lands on a refusal is the defect this rule exists for. A subject
// this table does not know opens its own history in the Ledger - which always renders, and says
// everything the studio knows about that id - rather than a guessed path. Client-safe: types
// only from @gt/domain.

import type { Event } from "@gt/domain/event";

export type SubjectLink = { readonly label: string; readonly href: string };

/** The projection's source: the first segment of the natural key (the kernel's `source` column). */
export function sourceOf(e: Pick<Event, "key">): string | null {
  const k = e.key;
  if (k === undefined) return null;
  const i = k.indexOf(":");
  return i > 0 ? k.slice(0, i) : null;
}

/** The Ledger, filtered to everything recorded about `id` (a run, a job, a candidate). */
export function ledgerFor(id: string): string {
  return `/ledger?q=${encodeURIComponent(id)}`;
}

/** The last segment of a `<runId>/<item>` id: the item's own name inside its run. */
const item = (id: string): string => id.slice(id.lastIndexOf("/") + 1) || id;

/** v1 sources whose records v1's retired /foundry page showed. */
const FOUNDRY_SOURCES: ReadonlySet<string> = new Set(["forge", "extract", "dojo", "strips"]);

/** `data.runId` when the act carries one (every v1 projection's acts do). */
const runOf = (e: Pick<Event, "data">): string | null => (typeof e.data["runId"] === "string" ? e.data["runId"] : null);

/** The Calendar, or one slot's record over it (the Floor's slot level, Phase 6). */
export function calendarFor(slotId: string | null): string {
  return slotId === null ? "/floor?cal=1" : `/floor?cal=1&slot=${encodeURIComponent(slotId)}`;
}

export function subjectLink(e: Pick<Event, "subject" | "key" | "data">): SubjectLink {
  const { kind, id } = e.subject;
  const source = sourceOf(e);
  // An article run's v1 page is gone too (/articles/<runId> redirects by the run's state: its Board
  // packet only while the run waits at the gate - a run still drafting, or one landed before the
  // Board, would be refused there), so every act about the run opens the run's history.
  if (source === "articles") return { label: kind === "run" ? id : item(id), href: ledgerFor(runOf(e) ?? id) };
  // Slots, publications and metrics are the calendar's.
  if (source === "publish") return { label: id, href: calendarFor(kind === "slot" ? id : typeof e.data["slotId"] === "string" ? e.data["slotId"] : null) };
  if (source !== null && FOUNDRY_SOURCES.has(source)) {
    // A run is named by its id; an item inside a run (candidate, style, pair, improvement)
    // by its own name. Both open the run's history.
    return { label: kind === "run" ? id : item(id), href: ledgerFor(runOf(e) ?? id) };
  }
  switch (kind) {
    // The sync's own records about a v1 store: the store's events are the useful page.
    case "source":
      return { label: id, href: `/ledger?src=${encodeURIComponent(id)}` };
    case "slot":
      return { label: id, href: calendarFor(id) };
    // A decision packet (Phase 3) is its Board, open or decided.
    case "packet":
      return { label: id, href: boardFor(id) };
    // A kernel job (Phase 4 writes them) is a bar in Runs.
    case "job":
      return { label: id, href: `/projects/runs?job=${encodeURIComponent(id)}` };
    default:
      return { label: id, href: ledgerFor(id) };
  }
}

/* ── The packet id (Phase 3, COMMON decision 3) ───────────────────────────── */
//
// A v1 Weir pile is opened as a kernel packet whose id is derived, never minted. The rule
// lives once, in lib/ledger/v1/packet.ts, because the projection and the decision adapters
// (lib/) spell it too and lib/ may not import app/; this module re-exports it (wave B
// ruling 10) so the Floor and the Board keep their one import. Both are client-safe.

export { packetIdOf, parsePacketId } from "../../../lib/ledger/v1/packet.ts";

/** The Board's page for a packet: the id is one path segment, so it is encoded as one. */
export function boardFor(packetId: string): string {
  return `/board/${encodeURIComponent(packetId)}`;
}
