import "server-only";

import { randomBytes } from "node:crypto";

import { parseAt } from "@gt/domain/door";
import {
  LAB_SAY_EVENT,
  LAB_SESSION_KIND,
  LAB_TURN_EVENT,
  labSayKey,
  labTurnKey,
  type LabProposal,
  type LabSay,
  type LabTurn,
} from "@gt/domain/audio.yue2.lab";
import { labProposalSchema, labTurnEnvelopeSchema, parseLabSay, parseLabTurn } from "@gt/domain/audio.yue2.lab.schema";
import type { Actor } from "@gt/domain/event";
import { err, ok, type Result } from "@gt/domain/errors";
import { queryEvents } from "@gt/kernel/events-query";
import { appendOnce } from "@gt/kernel/ingest";
import type { Store } from "@gt/kernel/store";

// THE SONG LAB'S AGENT RELAY (spark yue2-song-lab S2, WP-B). The compose studio's pattern on
// its OWN event types: the compose page reads `audio.say`/`audio.turn` by type with no subject filter
// (app/(studio)/audio/studio/_port/ledger.ts), so the lab writes `audio.lab.say` / `audio.lab.turn`
// (subject `songlab-session`, lane `audio`) and never appears in the compose thread. The outside agent
// (/studio-agent, song-lab mode) polls `gt_songlab inbox` and answers with `gt_songlab turn`. Presence is
// the studio's (app/(studio)/audio/studio/_live/presence.ts presenceOf). A bad proposal is dropped and
// named; a bad envelope refuses the whole turn.
//
// NOTHING HERE QUERIES `audio.say` OR `audio.turn`: every read names the lab's own types and subject kind.
//
// ANSWERED: a turn whose `answers` names a say answers that say and every earlier say of its session
// (the agent read them together in one inbox). A turn without `answers` is one the agent opened itself
// after background work; it answers nothing.

export const LAB_LANE = "audio";
export const LAB_POLL_MS = 500;
export const LAB_WAIT_MAX_S = 25;
/** The newest lab events one read folds (bounded enumeration); a page is the kernel's largest. */
const PAGE = 1000;
const READ_MAX = 5000;
const SAYS_MAX = 50;

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";
const tail = (): string => [...randomBytes(4)].map((b) => BASE36[b % 36] ?? "0").join("");

/** A new lab session's id: `lab-<4>-<yyyymmdd>` (the studio's mintSessionId pattern). */
export function mintLabSession(now: Date): string {
  return `lab-${tail()}-${now.toISOString().slice(0, 10).replace(/-/g, "")}`;
}

/** A turn id no other turn has: `u-<time36>-<4>` for the owner's, `a-...` for the agent's. */
export const labTurnId = (who: "u" | "a", nowMs: number): string => `${who}-${nowMs.toString(36)}-${tail()}`;

/* ── reads ───────────────────────────────────────────────────────────────── */

export type LabEvent = { readonly seq: number; readonly type: string; readonly data: unknown };

type Window = { readonly types: readonly string[]; readonly session?: string | undefined; readonly after?: number; readonly order: "asc" | "desc"; readonly limit: number };

function labPage(store: Store, q: Window): Result<{ readonly events: readonly LabEvent[]; readonly head: number }> {
  const page = queryEvents(store, {
    type: [...q.types],
    subject: { kind: LAB_SESSION_KIND, ...(q.session === undefined ? {} : { id: q.session }) },
    by: "seq",
    order: q.order,
    limit: q.limit,
    ...(q.after === undefined ? {} : { after: q.after }),
  });
  if (!page.ok) return page;
  return ok({ events: page.value.events.map((e) => ({ seq: e.seq, type: e.type, data: e.data })), head: page.value.head });
}

/** Every lab event of these types (newest READ_MAX), newest first: the read keep/drop and the thread fold. */
export function scanLab(store: Store, types: readonly string[], session?: string): Result<readonly LabEvent[]> {
  const out: LabEvent[] = [];
  let before: number | undefined;
  for (;;) {
    const page = queryEvents(store, {
      type: [...types],
      subject: { kind: LAB_SESSION_KIND, ...(session === undefined ? {} : { id: session }) },
      by: "seq",
      order: "desc",
      limit: PAGE,
      ...(before === undefined ? {} : { before }),
    });
    if (!page.ok) return page;
    for (const e of page.value.events) out.push({ seq: e.seq, type: e.type, data: e.data });
    if (!page.value.capped || page.value.next === undefined || out.length >= READ_MAX) return ok(out);
    before = page.value.next;
  }
}

const sayOf = (e: LabEvent): LabSay | undefined => {
  const p = parseLabSay(e.data);
  return p.ok ? p.value : undefined;
};
const turnOf = (e: LabEvent): LabTurn | undefined => {
  const p = parseLabTurn(e.data);
  return p.ok ? p.value : undefined;
};

/** One filed turn, found by its id. */
export function findLabTurn(store: Store, turnId: string): Result<LabTurn> {
  const all = scanLab(store, [LAB_TURN_EVENT]);
  if (!all.ok) return all;
  for (const e of all.value) {
    const t = turnOf(e);
    if (t?.turnId === turnId) return ok(t);
  }
  return err("not-found", `song lab: no agent turn ${turnId} is in the ledger`);
}

/* ── the owner's direction ───────────────────────────────────────────────── */

/** The owner's direction, filed. */
export function appendLabSay(store: Store, input: { readonly session: string; readonly text: string }, actor: Actor, now?: Date): Result<LabSay> {
  const at = now ?? new Date();
  const session = input.session.trim() === "" ? mintLabSession(at) : input.session;
  const say = parseLabSay({ session, turnId: labTurnId("u", at.getTime()), text: input.text, at: at.toISOString() });
  if (!say.ok) return say;
  const appended = store.tx((t) =>
    appendOnce(t, { actor, type: LAB_SAY_EVENT, lane: LAB_LANE, key: labSayKey(say.value.turnId), subject: { kind: LAB_SESSION_KIND, id: say.value.session }, data: { ...say.value } }),
  );
  if (!appended.ok) return appended;
  if (!appended.value.same) return err("conflict", `audio.lab.say: turn ${say.value.turnId} is already in the ledger with other words; send it again`);
  return ok(say.value);
}

/* ── the agent's turn ────────────────────────────────────────────────────── */

export type LabTurnAnswer = { readonly turn: LabTurn; readonly dropped: readonly string[] };

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The first issue of a proposal the door refused, as one short clause. */
function reasonOf(raw: unknown): string {
  const r = labProposalSchema.safeParse(raw);
  if (r.success) return "";
  const issue = r.error.issues[0];
  if (issue === undefined) return "unreadable";
  return issue.path.length === 0 ? issue.message : `${issue.path.join(".")}: ${issue.message}`;
}

const nameOf = (raw: unknown, i: number): string => (isRecord(raw) && typeof raw["id"] === "string" && raw["id"] !== "" ? raw["id"] : `proposal ${i + 1}`);

/** The agent's turn, read through the door; `check` appends nothing. */
export function appendLabTurn(store: Store, raw: unknown, actor: Actor, check?: boolean): Result<LabTurnAnswer> {
  if (!isRecord(raw)) return err("invalid", "lab-turn: a turn is an object {session, line, ran, learned, proposals}");
  const nowMs = Date.now();
  const turns = scanLab(store, [LAB_TURN_EVENT]);
  if (!turns.ok) return turns;
  const held = new Map<string, LabTurn>();
  for (const e of turns.value) {
    const t = turnOf(e);
    if (t !== undefined) held.set(t.turnId, t);
  }
  // The bookkeeping fields, filled only when the agent left them out; a retry (an id already held) is
  // filled from the held turn, so a retried answer appends nothing twice.
  const given = typeof raw["turnId"] === "string" ? held.get(raw["turnId"]) : undefined;
  const filled = { ran: [], learned: [], proposals: [], ...raw, turnId: raw["turnId"] ?? labTurnId("a", nowMs), at: raw["at"] ?? given?.at ?? new Date(nowMs).toISOString() };
  const env = parseAt("lab-turn", labTurnEnvelopeSchema, filled);
  if (!env.ok) return env;
  const e = env.value;

  const says = scanLab(store, [LAB_SAY_EVENT], e.session);
  if (!says.ok) return says;
  if (says.value.length === 0) return err("not-found", `song lab: session ${e.session} has no direction yet; answer a session gt_songlab inbox returned`);
  if (e.answers !== undefined && !says.value.some((x) => sayOf(x)?.turnId === e.answers)) return err("not-found", `song lab: session ${e.session} has no direction ${e.answers}`);

  const owner = new Map<string, string>();
  for (const t of held.values()) for (const p of t.proposals) owner.set(p.id, t.turnId);
  const proposals: LabProposal[] = [];
  const dropped: string[] = [];
  for (const [i, rawP] of e.proposals.entries()) {
    const name = nameOf(rawP, i);
    const p = labProposalSchema.safeParse(rawP);
    const usedBy = p.success ? owner.get(p.data.id) : undefined;
    if (!p.success) dropped.push(`${name} (${reasonOf(rawP)})`);
    else if (usedBy !== undefined && usedBy !== e.turnId) dropped.push(`${name} (the id is already a proposal of turn ${usedBy}; a new proposal needs a new id)`);
    else if (proposals.some((x) => x.id === p.data.id)) dropped.push(`${name} (the id repeats in this turn)`);
    else proposals.push(p.data as LabProposal);
  }

  const turn = parseLabTurn({ ...e, proposals });
  if (!turn.ok) return turn;
  if (check === true) return ok({ turn: turn.value, dropped });
  const appended = store.tx((t) =>
    appendOnce(t, { actor, type: LAB_TURN_EVENT, lane: LAB_LANE, key: labTurnKey(turn.value.turnId), subject: { kind: LAB_SESSION_KIND, id: turn.value.session }, data: { ...turn.value } }),
  );
  if (!appended.ok) return appended;
  if (!appended.value.same) return err("conflict", `audio.lab.turn: turn ${turn.value.turnId} is already in the ledger with other content; a new answer needs a new turnId`);
  return ok({ turn: turn.value, dropped });
}

/* ── the inbox ───────────────────────────────────────────────────────────── */

export type LabInbox = { readonly says: readonly LabSay[]; readonly next?: string };

const BOTH = [LAB_SAY_EVENT, LAB_TURN_EVENT];

/** Says in the window no turn of their session answers (see ANSWERED above), oldest first. */
function unanswered(events: readonly LabEvent[]): LabEvent[] {
  const sayAt = new Map<string, number>();
  for (const e of events) {
    const s = e.type === LAB_SAY_EVENT ? sayOf(e) : undefined;
    if (s !== undefined) sayAt.set(`${s.session}\u0000${s.turnId}`, e.seq);
  }
  const answeredTo = new Map<string, number>();
  for (const e of events) {
    const t = e.type === LAB_TURN_EVENT ? turnOf(e) : undefined;
    if (t?.answers === undefined) continue;
    const seq = sayAt.get(`${t.session}\u0000${t.answers}`);
    if (seq !== undefined && seq < e.seq) answeredTo.set(t.session, Math.max(answeredTo.get(t.session) ?? 0, seq));
  }
  return events
    .filter((e) => {
      const s = e.type === LAB_SAY_EVENT ? sayOf(e) : undefined;
      return s !== undefined && e.seq > (answeredTo.get(s.session) ?? 0);
    })
    .sort((a, b) => a.seq - b.seq);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Says no later lab turn answers (long-poll up to `waitS`, 25 at most). */
export async function labInbox(store: Store, opts: { readonly session?: string; readonly after?: string; readonly waitS?: number }): Promise<Result<LabInbox>> {
  if (opts.after !== undefined && !/^\d{1,15}$/.test(opts.after)) return err("invalid", "song lab inbox: `after` is the `next` of an earlier answer");
  const started = Date.now();
  const deadline = started + Math.min(Math.max(opts.waitS ?? 0, 0), LAB_WAIT_MAX_S) * 1000;
  let after = opts.after === undefined ? undefined : Number(opts.after);
  let found: LabEvent[] = [];
  let head = 0;
  for (;;) {
    if (after === undefined) {
      const r = labPage(store, { types: BOTH, session: opts.session, order: "desc", limit: PAGE });
      if (!r.ok) return r;
      found = unanswered(r.value.events).slice(0, SAYS_MAX);
      head = r.value.head;
      // Nothing waits: from here on, only what is newer than the ledger's head now.
      if (found.length === 0) after = head;
    } else {
      const r = labPage(store, { types: [LAB_SAY_EVENT], session: opts.session, after, order: "asc", limit: SAYS_MAX });
      if (!r.ok) return r;
      found = [...r.value.events];
      head = r.value.head;
    }
    const left = deadline - Date.now();
    if (found.length > 0 || left <= 0) break;
    await sleep(Math.min(LAB_POLL_MS, left));
  }
  const says = found.map(sayOf).filter((s): s is LabSay => s !== undefined);
  // The `after` for the next call: past every say answered here, or the head when none came.
  return ok({ says, next: String(found.at(-1)?.seq ?? Math.max(after ?? 0, head)) });
}

/* ── the thread ──────────────────────────────────────────────────────────── */

export type LabThread = { readonly session: string; readonly says: readonly LabSay[]; readonly turns: readonly LabTurn[] };

/** The newest lab session's says and turns, oldest first (the desk's read). No session yet is `not-found`. */
export function labThread(store: Store, session?: string): Result<LabThread> {
  let id = session;
  if (id === undefined) {
    const newest = labPage(store, { types: BOTH, order: "desc", limit: 1 });
    if (!newest.ok) return newest;
    const e = newest.value.events[0];
    const s = e === undefined ? undefined : (e.type === LAB_SAY_EVENT ? sayOf(e) : turnOf(e))?.session;
    if (s === undefined) return err("not-found", "song lab: no direction has been given yet");
    id = s;
  }
  const all = scanLab(store, BOTH, id);
  if (!all.ok) return all;
  const says: LabSay[] = [];
  const turns: LabTurn[] = [];
  for (const e of [...all.value].reverse()) {
    if (e.type === LAB_SAY_EVENT) {
      const s = sayOf(e);
      if (s !== undefined) says.push(s);
    } else {
      const t = turnOf(e);
      if (t !== undefined) turns.push(t);
    }
  }
  return ok({ session: id, says, turns });
}
