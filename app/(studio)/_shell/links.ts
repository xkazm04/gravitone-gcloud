// WHERE A RECORD LIVES TODAY - one pure function from an event's subject to a label and a
// route that renders (Phase 2, lot 16). The Ledger draws every subject as a link through it,
// and Runs, the Floor and the Weir will link the same records the same way.
//
// The prototype stored `{label, href}` on every event (ledger-data.js `href.*`), so a route
// that moved left thousands of rows pointing at it. Here the ledger stores only
// `{kind, id}` and the link is derived at render: when a record's own page is built, this
// table changes and every past event follows.
//
// THE RULE: never a link to a route that does not render. v1 owns most records until their
// phase replaces them, and v1's foundry has no per-record URL (lib/ledger/v1 WAVE-A: "hrefs
// are /foundry"), so a forge run, an extract style and a Dojo improvement all open /foundry,
// where v1 shows them. A subject this table does not know opens its own history in the
// Ledger - which always renders, and says everything the studio knows about that id -
// rather than a guessed path. Client-safe: types only from @gt/domain.

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

const FOUNDRY = "/foundry";

/** v1 sources whose records are shown on v1's /foundry page today. */
const FOUNDRY_SOURCES: ReadonlySet<string> = new Set(["forge", "extract", "dojo", "strips"]);

/** `data.runId` when the act carries one (every v1 projection's acts do). */
const runOf = (e: Pick<Event, "data">): string | null => (typeof e.data["runId"] === "string" ? e.data["runId"] : null);

export function subjectLink(e: Pick<Event, "subject" | "key" | "data">): SubjectLink {
  const { kind, id } = e.subject;
  const source = sourceOf(e);
  // An article run has its own v1 page (app/articles/[runId]); every act about it opens it.
  if (source === "articles") return { label: kind === "run" ? id : item(id), href: `/articles/${encodeURIComponent(runOf(e) ?? id)}` };
  // Slots, publications and metrics are the calendar's.
  if (source === "publish") return { label: id, href: "/calendar" };
  if (source !== null && FOUNDRY_SOURCES.has(source)) {
    // A run is named by its id; an item inside a run (candidate, style, pair, improvement)
    // by its own name, the run being one click away in the row's run field.
    return { label: kind === "run" ? id : item(id), href: FOUNDRY };
  }
  switch (kind) {
    // The sync's own records about a v1 store: the store's events are the useful page.
    case "source":
      return { label: id, href: `/ledger?src=${encodeURIComponent(id)}` };
    case "slot":
      return { label: id, href: "/calendar" };
    // A kernel job (Phase 4 writes them) is a bar in Runs.
    case "job":
      return { label: id, href: `/projects/runs?job=${encodeURIComponent(id)}` };
    default:
      return { label: id, href: ledgerFor(id) };
  }
}

/* ── The packet id (Phase 3, COMMON decision 3) ───────────────────────────── */
//
// A v1 Weir pile is opened as a kernel packet whose id is derived, never minted: the
// same pile always names the same packet, so opening is idempotent and the Floor, the
// Board and the applier (L24) agree on it without a lookup table. v1's Board did the
// same job at runtime by prefixing keys with their source (lib/board/source.ts
// `cull:...`); here the source is the first segment and the run id is the REST, so a
// run id that itself holds a colon survives the round trip. A source never holds one:
// it is the v1 projection's id (lib/ledger/v1/sources/*), a bare word. Plain strings on
// purpose - this module is client-safe, and the brand is minted at the kernel's door.

const PACKET = "pkt:";

/** `pkt:<source>:<runId>` - the one spelling of a Weir pile's packet id. */
export function packetIdOf(source: string, runId: string): string {
  return `${PACKET}${source}:${runId}`;
}

/** The inverse of {@link packetIdOf}; null for anything it could not have produced. */
export function parsePacketId(id: string): { readonly source: string; readonly runId: string } | null {
  if (!id.startsWith(PACKET)) return null;
  const rest = id.slice(PACKET.length);
  const i = rest.indexOf(":");
  if (i <= 0 || i === rest.length - 1) return null;
  return { source: rest.slice(0, i), runId: rest.slice(i + 1) };
}

/** The Board's page for a packet: the id is one path segment, so it is encoded as one. */
export function boardFor(packetId: string): string {
  return `/board/${encodeURIComponent(packetId)}`;
}
