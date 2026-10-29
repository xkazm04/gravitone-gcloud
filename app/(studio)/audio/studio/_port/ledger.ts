import "server-only";

// THE STUDIO'S TURN PORT, LEDGER SIDE (spark audio-agent-studio, stage S2): the live conversation.
// The dock's message is an `audio.say` event (../_live/say.ts) and the outside agent's answer an
// `audio.turn` event (the MCP op `audio_turn`); both carry `{session, turn}`. This side reads them
// back, oldest first, through the ONE studio event door (@gt/domain/audio.studio.events
// `parseStudioEvent`, which holds the turn to the same door a page renders through) and folds them
// into conversations. Agent turns carry real take hrefs: nothing is substituted here.
//
// Absence is said, not hidden: an event the door refuses becomes a `refused` line in its
// conversation (or, when even its session cannot be read, a line in the page's note), never a
// silently skipped turn. A ledger with more studio events than the read bound says so too.
import { parseStudioEvent, STUDIO_EVENTS, type StudioEventType } from "@gt/domain/audio.studio.events";
import type { ParsedTurn } from "@gt/domain/audio.studio.door";
import { ok, type Result } from "@gt/domain/errors";
import { queryEvents } from "@gt/kernel/events-query";
import type { Store } from "@gt/kernel/store";

import { kernel } from "../../../../../lib/kernelStore.ts";
import type { RefusedTurn, StudioPort, StudioPortSession, StudioRead } from "./port.ts";

/** What the fold needs of a ledger row. */
export type StudioLedgerEvent = { readonly seq: number; readonly at: string; readonly type: string; readonly data: unknown };

/** The most studio events one page read folds (newest kept): bounded-enumeration. */
export const STUDIO_READ_MAX = 5000;
const PAGE = 1000;
const TITLE_MAX = 60;

/** A conversation's title: its first message in plain words, trimmed to a short line. */
export function titleOf(text: string): string {
  const flat = text.trim().replace(/\s+/g, " ");
  if (flat.length <= TITLE_MAX) return flat;
  const cut = flat.slice(0, TITLE_MAX);
  const space = cut.lastIndexOf(" ");
  return `${(space > TITLE_MAX / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, "")}...`;
}

const UNTITLED = "A song with no readable first message";

type Acc = { id: string; turns: ParsedTurn[]; refused: RefusedTurn[]; title: string | null; lastSeq: number; lastFrom: "user" | "agent" };

const sessionOfRaw = (data: unknown): string | null => {
  const s = typeof data === "object" && data !== null ? (data as { session?: unknown }).session : undefined;
  return typeof s === "string" && /^[a-z0-9][a-z0-9-]{2,47}$/.test(s) ? s : null;
};

/** Folds studio events (any order) into conversations, newest activity first. A refused event with
 *  a readable session lands in that conversation's `refused`; one without lands in `lost`. */
export function foldStudioEvents(events: readonly StudioLedgerEvent[]): { readonly sessions: readonly StudioPortSession[]; readonly lost: readonly string[] } {
  const by = new Map<string, Acc>();
  const lost: string[] = [];
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  for (const e of sorted) {
    if (e.type !== STUDIO_EVENTS.say && e.type !== STUDIO_EVENTS.turn) continue;
    const type = e.type as StudioEventType;
    const from = type === STUDIO_EVENTS.say ? "user" : "agent";
    const r = parseStudioEvent(type, e.data);
    const id = r.ok ? r.value.session : sessionOfRaw(e.data);
    if (id === null) {
      lost.push(`event ${e.seq} (${type}): ${r.ok ? "no session" : r.error.message}`);
      continue;
    }
    const acc = by.get(id) ?? { id, turns: [], refused: [], title: null, lastSeq: 0, lastFrom: from };
    by.set(id, acc);
    acc.lastSeq = e.seq;
    acc.lastFrom = from;
    if (!r.ok) {
      acc.refused.push({ seq: e.seq, at: e.at, from, reason: r.error.message });
      continue;
    }
    acc.turns.push(r.value.parsed);
    if (acc.title === null && r.value.parsed.turn.from === "user") acc.title = titleOf(r.value.parsed.turn.text);
  }
  const sessions = [...by.values()]
    .sort((a, b) => b.lastSeq - a.lastSeq)
    .map((a): StudioPortSession => ({ id: a.id, title: a.title ?? UNTITLED, turns: a.turns, ...(a.refused.length > 0 ? { refused: a.refused } : {}), lastFrom: a.lastFrom }));
  return { sessions, lost };
}

/** The newest studio events, up to STUDIO_READ_MAX, and the ledger's head. */
function readStudioEvents(store: Store): Result<{ events: StudioLedgerEvent[]; head: number; capped: boolean }> {
  const events: StudioLedgerEvent[] = [];
  let before: number | undefined;
  let head = 0;
  for (;;) {
    const page = queryEvents(store, { type: [STUDIO_EVENTS.say, STUDIO_EVENTS.turn], by: "seq", order: "desc", limit: PAGE, ...(before === undefined ? {} : { before }) });
    if (!page.ok) return page;
    head = Math.max(head, page.value.head);
    for (const e of page.value.events) events.push({ seq: e.seq, at: e.at, type: e.type, data: e.data });
    if (!page.value.capped || page.value.next === undefined) return ok({ events, head, capped: false });
    if (events.length >= STUDIO_READ_MAX) return ok({ events, head, capped: true });
    before = page.value.next;
  }
}

/** The live read over one store: exported for the port's test. */
export function readLedger(store: Store): StudioRead {
  const read = readStudioEvents(store);
  if (!read.ok) return { source: "live", renders: "ready", note: `The studio's conversations could not be read: ${read.error.message}`, sessions: [] };
  const { sessions, lost } = foldStudioEvents(read.value.events);
  const notes: string[] = [];
  if (read.value.capped) notes.push(`Only the newest ${STUDIO_READ_MAX} studio messages are shown; older ones are in the ledger.`);
  if (lost.length > 0) notes.push(`${lost.length === 1 ? "1 studio message names" : `${lost.length} studio messages name`} no readable conversation: ${lost.join("; ")}`);
  return { source: "live", renders: "ready", sessions, head: read.value.head, ...(notes.length > 0 ? { note: notes.join(" ") } : {}) };
}

export const ledgerPort: StudioPort = {
  read: async () => {
    const k = kernel();
    if (!k.ok) return { source: "live", renders: "ready", note: `The studio's conversations could not be read: ${k.error.message}`, sessions: [] };
    return readLedger(k.value.store);
  },
};
