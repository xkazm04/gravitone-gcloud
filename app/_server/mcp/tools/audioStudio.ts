import { randomBytes } from "node:crypto";

import { z } from "zod";

import type { ParsedTurn } from "@gt/domain/audio.studio.door";
import { parseStudioEvent, STUDIO_EVENTS, studioEventKey, studioSessionSchema } from "@gt/domain/audio.studio.events";
import { err, ok, type Result } from "@gt/domain/errors";
import { queryEvents } from "@gt/kernel/events-query";
import { appendOnce } from "@gt/kernel/ingest";
import type { Store } from "@gt/kernel/store";

import { readTakeFacts, readTaste, tasteNote } from "../../../../lib/sound/suno/facts.ts";
import { foldStudioEvents, uploadedTakeIds, type StudioLedgerEvent } from "../../../(studio)/audio/studio/_port/ledger.ts";
import type { StudioPortSession } from "../../../(studio)/audio/studio/_port/port.ts";
import { STUDIO_LANE, STUDIO_SUBJECT_KIND } from "../../../(studio)/audio/studio/_live/say.ts";
import { studioHref } from "../../../(studio)/audio/studio/url.ts";
import { defineOp, READS, WRITES, type McpToolSpec, type Obj } from "../op.ts";
import { studioGuide } from "./audioGuide.ts";
import { readLocalTake, stemsOf } from "./audioTake.ts";

// THE STUDIO'S CONVERSATION ON THE AGENT DOOR (spark audio-agent-studio S2). The dock's message is an
// `audio.say` ledger event (app/(studio)/audio/studio/_live/say.ts); an outside agent (Claude Code's
// `/studio-agent`) reads them here and answers with an `audio.turn` event the page renders:
//
//   audio_inbox  LONG-POLL (read): holds up to waitS seconds until a message newer than `after` is in
//                the ledger, polling the store every POLL_MS, then answers the messages, the
//                conversations and one conversation's state (its newest answer, take, score, stems).
//                It writes nothing: presence is the token's lastUsedAt, which every call stamps.
//   audio_guide  (read) the vocabulary a turn may use, derived from the registry (./audioGuide.ts).
//   audio_turn   (launch, write) one agent turn, held to the one studio event door and appended once
//                under its id; the answer says what the door dropped, so the agent sees its defects.

export const POLL_MS = 500;
export const INBOX_WAIT_MAX_S = 25;
const MESSAGES_MAX = 50;
/** The newest studio events one answer folds into conversations (bounded-enumeration). */
const SCAN = 1000;
const SESSIONS_MAX = 20;

const sessionOf = (data: unknown): string | null => {
  const s = typeof data === "object" && data !== null ? (data as { session?: unknown }).session : undefined;
  return typeof s === "string" ? s : null;
};

type Page = { readonly events: readonly StudioLedgerEvent[]; readonly head: number };

function studioEvents(store: Store, q: { readonly types: readonly string[]; readonly session?: string; readonly after?: number; readonly order: "asc" | "desc"; readonly limit: number }): Result<Page> {
  const page = queryEvents(store, {
    type: [...q.types],
    subject: { kind: STUDIO_SUBJECT_KIND, ...(q.session === undefined ? {} : { id: q.session }) },
    by: "seq",
    order: q.order,
    limit: q.limit,
    ...(q.after === undefined ? {} : { after: q.after }),
  });
  if (!page.ok) return page;
  return ok({ events: page.value.events.map((e) => ({ seq: e.seq, at: e.at, type: e.type, data: e.data })), head: page.value.head });
}

const BOTH = [STUDIO_EVENTS.say, STUDIO_EVENTS.turn];

/** Says in the window that no answer of their conversation follows: what waits for the agent. */
function unanswered(events: readonly StudioLedgerEvent[]): StudioLedgerEvent[] {
  const answered = new Map<string, number>();
  for (const e of events) {
    const s = sessionOf(e.data);
    if (e.type === STUDIO_EVENTS.turn && s !== null) answered.set(s, Math.max(answered.get(s) ?? 0, e.seq));
  }
  return events.filter((e) => e.type === STUDIO_EVENTS.say && e.seq > (answered.get(sessionOf(e.data) ?? "") ?? 0)).sort((a, b) => a.seq - b.seq);
}

/** The agent action a pressed proposal names, from the conversation's answers before it. */
function pressedOf(turns: readonly ParsedTurn[], actionId: string | undefined): Obj | undefined {
  if (actionId === undefined) return undefined;
  for (let i = turns.length - 1; i >= 0; i--) {
    const hit = turns[i]?.turn.from === "agent" ? turns[i]?.turn.actions.find((a) => a.id === actionId) : undefined;
    if (hit !== undefined) return hit as unknown as Obj;
  }
  return undefined;
}

/** The take an answer shows (a track or stems piece's takeId), newest answer first. */
function takeOf(turns: readonly ParsedTurn[]): string | undefined {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]?.turn;
    if (t?.from !== "agent") continue;
    for (const n of t.show) if ((n.kind === "track" || n.kind === "stems") && n.takeId !== undefined) return n.takeId;
  }
  return undefined;
}

/** The suno advisor's half of a conversation's state (spark suno-advisor), through the page's reader
 *  (lib/sound/suno/facts.ts): the facts of every take its user turns uploaded, and the taste profile.
 *  What could not be read is said beside it (`takesNote`, `tasteNote`), never left as a silent gap. */
async function sunoStateOf(store: Store, conv: StudioPortSession | undefined): Promise<Obj> {
  const ids = conv === undefined ? [] : uploadedTakeIds([conv]);
  const facts = await readTakeFacts(ids);
  const gone = facts.ok ? ids.filter((id) => facts.value[id] === undefined) : [];
  const taste = readTaste(store);
  const tasteSaid = taste.ok ? tasteNote(taste.value) : `the taste profile could not be read: ${taste.error.message}`;
  const takesSaid = !facts.ok ? `the uploaded takes could not be read: ${facts.error.message}` : gone.length > 0 ? `not on this server: ${gone.join(", ")}` : undefined;
  return {
    ...(facts.ok ? { takes: facts.value } : {}),
    ...(takesSaid === undefined ? {} : { takesNote: takesSaid }),
    ...(taste.ok ? { taste: taste.value.lines } : {}),
    ...(tasteSaid === undefined ? {} : { tasteNote: tasteSaid }),
  };
}

/** One conversation's state: the newest answer, the take it shows, that take's score and stems,
 *  and the facts of the takes its person uploaded with the confirmed taste. */
async function stateOf(store: Store, session: string): Promise<Result<Obj>> {
  const read = studioEvents(store, { types: BOTH, session, order: "desc", limit: SCAN });
  if (!read.ok) return read;
  const conv = foldStudioEvents(read.value.events).sessions[0];
  const turns = conv?.turns ?? [];
  const latest = [...turns].reverse().find((t) => t.turn.from === "agent");
  const takeId = takeOf(turns);
  const base: Obj = {
    session,
    ...(conv === undefined ? {} : { title: conv.title, waiting: conv.lastFrom === "user" }),
    nextSeq: turns.length,
    ...(latest === undefined ? {} : { latestAgentTurn: latest.turn }),
    ...(conv?.refused === undefined ? {} : { refused: conv.refused }),
    view: studioHref({ session, offline: false, source: "live" }),
    ...(await sunoStateOf(store, conv)),
  };
  if (takeId === undefined) return ok(base);
  const take = await readLocalTake(takeId);
  if (!take.ok) return ok({ ...base, takeId, takeNote: `the take this conversation shows could not be read: ${take.error.message}` });
  const { plan } = take.value;
  return ok({ ...base, takeId, score: plan.spec, stems: stemsOf(plan), mixHref: `/api/sound/takes/${encodeURIComponent(takeId)}/file` });
}

/** Every conversation in the scan window, newest activity first. */
function sessionsOf(events: readonly StudioLedgerEvent[]): Obj[] {
  const last = new Map<string, number>();
  for (const e of events) {
    const s = sessionOf(e.data);
    if (s !== null) last.set(s, Math.max(last.get(s) ?? 0, e.seq));
  }
  return foldStudioEvents(events)
    .sessions.slice(0, SESSIONS_MAX)
    .map((s) => ({ id: s.id, title: s.title, lastSeq: last.get(s.id) ?? 0, waiting: s.lastFrom === "user" }));
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type InboxArgs = { readonly session?: string | undefined; readonly after?: number | undefined; readonly waitS?: number | undefined };

/** The long-poll: what is new (or, with no `after`, what waits), then the conversations and one's state. */
export async function readInbox(store: Store, a: InboxArgs, pollMs = POLL_MS): Promise<Result<Obj>> {
  const started = Date.now();
  const deadline = started + (a.waitS ?? 0) * 1000;
  let after = a.after;
  let found: StudioLedgerEvent[] = [];
  let head = 0;
  for (;;) {
    if (after === undefined) {
      const r = studioEvents(store, { types: BOTH, ...(a.session === undefined ? {} : { session: a.session }), order: "desc", limit: SCAN });
      if (!r.ok) return r;
      found = unanswered(r.value.events).slice(0, MESSAGES_MAX);
      head = r.value.head;
      // Nothing waits: from here on, only what is newer than the ledger's head now.
      if (found.length === 0) after = head;
    } else {
      const r = studioEvents(store, { types: [STUDIO_EVENTS.say], ...(a.session === undefined ? {} : { session: a.session }), after, order: "asc", limit: MESSAGES_MAX });
      if (!r.ok) return r;
      found = [...r.value.events];
      head = r.value.head;
    }
    const left = deadline - Date.now();
    if (found.length > 0 || left <= 0) break;
    await sleep(Math.min(pollMs, left));
  }

  const scan = studioEvents(store, { types: BOTH, order: "desc", limit: SCAN });
  if (!scan.ok) return scan;
  const folded = foldStudioEvents(scan.value.events).sessions;
  const turnsOf = (s: string): readonly ParsedTurn[] => folded.find((x) => x.id === s)?.turns ?? [];
  const messages: Obj[] = [];
  const refused: Obj[] = [];
  for (const e of found) {
    const p = parseStudioEvent(STUDIO_EVENTS.say, e.data);
    if (!p.ok) {
      refused.push({ seq: e.seq, reason: p.error.message });
      continue;
    }
    const pressed = pressedOf(turnsOf(p.value.session), p.value.parsed.turn.action);
    messages.push({ session: p.value.session, seq: e.seq, at: e.at, turn: p.value.parsed.turn, ...(pressed === undefined ? {} : { pressed }) });
  }
  const sessions = sessionsOf(scan.value.events);
  const focus = a.session ?? (messages.at(-1)?.["session"] as string | undefined) ?? (sessions[0]?.["id"] as string | undefined);
  const state = focus === undefined ? undefined : await stateOf(store, focus);
  if (state !== undefined && !state.ok) return state;
  const lastSeen = found.at(-1)?.seq;
  return ok({
    messages,
    ...(refused.length > 0 ? { refused } : {}),
    sessions,
    ...(state === undefined ? {} : { state: state.value }),
    // The `after` for the next call: past every message answered here, or the head when none came.
    next: lastSeen ?? Math.max(after ?? 0, head),
    ...(found.length >= MESSAGES_MAX ? { truncated: true } : {}),
    waitedMs: Date.now() - started,
  });
}

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";
const agentTurnId = (nowMs: number): string => `a-${nowMs.toString(36)}-${[...randomBytes(4)].map((b) => BASE36[b % 36] ?? "0").join("")}`;

/** The bookkeeping of an answer already filed under `id` in this conversation (a retry's). */
function heldTurn(events: readonly StudioLedgerEvent[], id: string): { readonly at?: unknown; readonly seq?: unknown } | undefined {
  for (const e of events) {
    if (e.type !== STUDIO_EVENTS.turn) continue;
    const t = (e.data as { turn?: { id?: unknown; at?: unknown; seq?: unknown } } | null)?.turn;
    if (t?.id === id) return { at: t.at, seq: t.seq };
  }
  return undefined;
}

type TurnArgs = { readonly session: string; readonly turn: Readonly<Record<string, unknown>>; readonly check?: boolean | undefined };

/** Hold one agent turn to the studio event door and append it once under its id. */
export function appendAgentTurn(store: Store, a: TurnArgs, actor: Parameters<typeof appendOnce>[1]["actor"], nowMs = Date.now()): Result<Obj> {
  const conv = studioEvents(store, { types: BOTH, session: a.session, order: "desc", limit: SCAN });
  if (!conv.ok) return conv;
  if (!conv.value.events.some((e) => e.type === STUDIO_EVENTS.say)) return err("not-found", `no conversation ${a.session} has a message yet: answer a session audio_inbox returned`);
  const turnCount = foldStudioEvents(conv.value.events).sessions[0]?.turns.length ?? 0;
  // The bookkeeping fields, filled only when the agent left them out; anything given is the door's to judge.
  // A retried answer (an id already held) is filled from the held one, so the retry appends nothing twice.
  const held = typeof a.turn["id"] === "string" ? heldTurn(conv.value.events, a.turn["id"]) : undefined;
  const turn = { v: 1, from: "agent", at: held?.at ?? new Date(nowMs).toISOString(), seq: held?.seq ?? turnCount, id: agentTurnId(nowMs), ...a.turn };
  const p = parseStudioEvent(STUDIO_EVENTS.turn, { session: a.session, turn });
  if (!p.ok) return p;
  const { parsed } = p.value;
  const said = { session: a.session, turnId: parsed.turn.id, dropped: parsed.dropped, shown: parsed.turn.show.length, proposed: parsed.turn.actions.length, view: studioHref({ session: a.session, offline: false, source: "live" }) };
  if (a.check === true) return ok({ ...said, checked: true, appended: false });
  const appended = store.tx((t) =>
    appendOnce(t, { actor, type: STUDIO_EVENTS.turn, lane: STUDIO_LANE, key: studioEventKey(STUDIO_EVENTS.turn, parsed.turn.id), subject: { kind: STUDIO_SUBJECT_KIND, id: a.session }, data: { session: a.session, turn } }),
  );
  if (!appended.ok) return appended;
  if (!appended.value.same) return err("conflict", `audio_turn: turn ${parsed.turn.id} is already in the ledger with other content; a new answer needs a new id`);
  return ok({ ...said, seq: appended.value.event.seq, appended: appended.value.appended });
}

export const AUDIO_STUDIO_READ_OPS: readonly McpToolSpec[] = [
  defineOp({
    family: "read",
    op: "audio_inbox",
    title: "Studio inbox (long-poll)",
    description: "Wait up to waitS (0..25) s for a studio message newer than after (none given: the unanswered ones), then answer messages, conversations and one conversation's state: newest answer, take, score, stems, uploaded takes, taste. Pass next back.",
    input: z.object({ session: studioSessionSchema.optional(), after: z.number().int().min(0).optional(), waitS: z.number().int().min(0).max(INBOX_WAIT_MAX_S).optional() }).strict(),
    annotations: READS,
    writes: false,
    run: async (a, { deps }) => {
      const s = deps.store();
      return s.ok ? readInbox(s.value, a) : s;
    },
  }),
  defineOp({
    family: "read",
    op: "audio_guide",
    title: "Studio vocabulary",
    description: "What a studio turn may hold, read from the door's own registry: piece and action kinds with JSON schemas, roles, caps, the turn rules, the ScoreSpec schema and rules, and the instrument catalog with the roles each fits.",
    input: z.object({}).strict(),
    annotations: READS,
    writes: false,
    run: () => ok(studioGuide()),
  }),
];

export const AUDIO_STUDIO_LAUNCH_OPS: readonly McpToolSpec[] = [
  defineOp({
    family: "launch",
    op: "audio_turn",
    title: "Answer in the studio",
    description: "Answer a studio conversation with one agent turn (shape: audio_guide): reply text, pieces to show, 2-5 next steps. Appended once under its id; the answer lists pieces the door dropped. check:true appends nothing.",
    input: z.object({ session: studioSessionSchema, turn: z.record(z.string(), z.unknown()), check: z.boolean().optional() }).strict(),
    annotations: WRITES,
    writes: true,
    run: (a, { deps, agent }) => {
      const s = deps.store();
      return s.ok ? appendAgentTurn(s.value, a, agent.actor) : s;
    },
  }),
];
