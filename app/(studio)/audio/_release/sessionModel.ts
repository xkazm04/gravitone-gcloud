// THE RELEASE SESSION'S MODEL (spark studio-to-release): what ./Session.tsx holds, as a pure reducer, so the queue
// and its re-basing are tested without React (tests/next-server/release-session.test.ts).
//
// Two copies of each release: the record as the STORE last answered it (`records`), and the operator's acts not yet
// answered (`queues`, oldest first; the head is the one in flight). What the page shows is always derived - the stored
// record with the queue replayed on top - so an answer re-bases every later optimistic act on the store's version
// instead of discarding it (registry schema-driven-ui / emitter-registry-sync: two writers, one spec, CAS). A stale
// answer or a refusal empties that release's queue: the page shows the store's record, and the acts made on top of the
// refused one are not replayed on a version their author never saw.
//
// On the fixture (`local`), the acts are applied to `records` at once and nothing is queued.
import type { ShelfTake } from "@gt/domain/release";
import type { ReleaseProposal, ReleaseRecord } from "@gt/domain/release.record";

import type { ReleaseAct, ReleaseActs, ReleaseAnswer } from "./act.ts";
import { applyLocal } from "./applyLocal.ts";
import { applyEdit, releaseOf, type ReleaseEdit } from "./draft.ts";

export interface QueuedAct {
  readonly seq: number;
  readonly act: ReleaseAct;
}

export interface SessionModel {
  /** Each release as the store last answered it (the fixture: as the page holds it), newest first. */
  readonly records: readonly ReleaseRecord[];
  readonly openId: string | null;
  /** Per release, the acts the store has not answered yet; the head is in flight once `sent` names its seq. */
  readonly queues: Readonly<Record<string, readonly QueuedAct[]>>;
  readonly sent: Readonly<Record<string, number>>;
  /** Releases made on this page whose create the store has not answered (their id is the page's, not the store's). */
  readonly creating: readonly string[];
  readonly notice: string | null;
  readonly seq: number;
}

export type SessionEvent =
  | { readonly type: "open"; readonly id: string | null }
  /** The fixture: the act lands on the record at once. */
  | { readonly type: "local"; readonly id: string; readonly act: ReleaseAct }
  | { readonly type: "enqueue"; readonly id: string; readonly act: ReleaseAct }
  | { readonly type: "sent"; readonly id: string; readonly seq: number }
  | { readonly type: "answer"; readonly id: string; readonly seq: number; readonly answer: ReleaseAnswer }
  /** A release made on this page; `stored` false while the store's create is on its way. */
  | { readonly type: "create"; readonly id: string; readonly artist: string; readonly takes: readonly ShelfTake[]; readonly at: string; readonly stored: boolean }
  | { readonly type: "created"; readonly localId: string; readonly answer: ReleaseAnswer };

export const initialSession = (records: readonly ReleaseRecord[], openId: string | null): SessionModel => ({
  records,
  openId: openId !== null && records.some((r) => r.release.id === openId) ? openId : null,
  queues: {},
  sent: {},
  creating: [],
  notice: null,
  seq: 0,
});

/** The notice a stale answer leaves: nothing was written, the stored version is shown. */
export const staleNotice = (version: number): string => `version ${version} was written elsewhere first; this change was not saved`;

/** An edit addressed to the record it lands on (a release made on this page changes id when the store answers). */
export const addressed = (act: ReleaseAct, id: string): ReleaseAct => (act.kind === "edit" ? { kind: "edit", edit: { ...act.edit, id } } : act);

/** One act on one record, zod-free: the page's optimistic copy of what the store will do. */
export function applyAct(r: ReleaseRecord, act: ReleaseAct): ReleaseRecord {
  if (act.kind === "edit") return { ...r, release: applyEdit(r.release, { ...act.edit, id: r.release.id }) };
  const ids = new Set(act.proposalIds);
  const pending = r.pending.filter((p) => !ids.has(p.id));
  if (act.kind === "dismiss") return { ...r, pending };
  const release = r.pending.filter((p) => ids.has(p.id)).reduce((rel, p) => applyLocal(rel, p.path, p.value) ?? rel, r.release);
  return { ...r, release, pending };
}

/** The records as the page shows them: each stored record with its unanswered acts replayed on top. */
export const viewOf = (m: SessionModel): ReleaseRecord[] => m.records.map((r) => (m.queues[r.release.id] ?? []).reduce((x, q) => applyAct(x, q.act), r));

/** Two edits that may travel as one: consecutive patches of the same fields' owner (a field typed letter by letter). */
function merged(a: ReleaseAct, b: ReleaseAct): ReleaseAct | null {
  if (a.kind !== "edit" || b.kind !== "edit") return null;
  const x: ReleaseEdit = a.edit;
  const y: ReleaseEdit = b.edit;
  if (x.type === "patch" && y.type === "patch") return { kind: "edit", edit: { ...y, fields: { ...x.fields, ...y.fields } } };
  if (x.type === "patchTrack" && y.type === "patchTrack" && x.index === y.index) return { kind: "edit", edit: { ...y, fields: { ...x.fields, ...y.fields } } };
  return null;
}

const without = <T>(o: Readonly<Record<string, T>>, k: string): Record<string, T> => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k));

const replace = (records: readonly ReleaseRecord[], id: string, next: ReleaseRecord): ReleaseRecord[] => records.map((r) => (r.release.id === id ? next : r));

function enqueue(m: SessionModel, id: string, act: ReleaseAct): SessionModel {
  const q = m.queues[id] ?? [];
  const last = q[q.length - 1];
  // The tail is folded into only while it has not left: what is in flight is what the store will answer for.
  const fold = last !== undefined && m.sent[id] !== last.seq ? merged(last.act, act) : null;
  const seq = m.seq + 1;
  const next = fold !== null && last !== undefined ? [...q.slice(0, -1), { seq: last.seq, act: fold }] : [...q, { seq, act }];
  return { ...m, seq, queues: { ...m.queues, [id]: next } };
}

function answer(m: SessionModel, id: string, seq: number, a: ReleaseAnswer): SessionModel {
  const q = m.queues[id] ?? [];
  if (q[0]?.seq !== seq) return m;
  const sent = without(m.sent, id);
  if (!a.ok) return { ...m, sent, queues: without(m.queues, id), notice: a.error.error };
  const records = replace(m.records, id, a.value.record);
  if (a.value.stale) return { ...m, records, sent, queues: without(m.queues, id), notice: staleNotice(a.value.record.version) };
  const rest = q.slice(1);
  return { ...m, records, sent, queues: rest.length === 0 ? without(m.queues, id) : { ...m.queues, [id]: rest }, notice: null };
}

function created(m: SessionModel, localId: string, a: ReleaseAnswer): SessionModel {
  const creating = m.creating.filter((x) => x !== localId);
  if (!a.ok) {
    return { ...m, creating, records: m.records.filter((r) => r.release.id !== localId), queues: without(m.queues, localId), openId: m.openId === localId ? null : m.openId, notice: a.error.error };
  }
  const stored = a.value.record;
  const id = stored.release.id;
  const q = m.queues[localId];
  const queues = q === undefined ? without(m.queues, localId) : { ...without(m.queues, localId), [id]: q };
  return { ...m, creating, records: replace(m.records, localId, stored), queues, openId: m.openId === localId ? id : m.openId };
}

export function reduceSession(m: SessionModel, e: SessionEvent): SessionModel {
  switch (e.type) {
    case "open":
      return { ...m, openId: e.id, notice: e.id === m.openId ? m.notice : null };
    case "local": {
      const r = m.records.find((x) => x.release.id === e.id);
      return r === undefined ? m : { ...m, records: replace(m.records, e.id, applyAct(r, e.act)) };
    }
    case "enqueue":
      return m.records.some((x) => x.release.id === e.id) ? enqueue(m, e.id, e.act) : m;
    case "sent":
      return { ...m, sent: { ...m.sent, [e.id]: e.seq } };
    case "answer":
      return answer(m, e.id, e.seq, e.answer);
    case "create": {
      const record: ReleaseRecord = { release: releaseOf(e.id, e.artist, e.takes), version: 1, sessionId: null, createdAt: e.at, updatedAt: e.at, pending: [] };
      return { ...m, records: [record, ...m.records], openId: e.id, creating: e.stored ? m.creating : [...m.creating, e.id] };
    }
    case "created":
      return created(m, e.localId, e.answer);
  }
}

/** The acts ready to leave: per release, the queue's head when nothing of that release is in flight. */
export function ready(m: SessionModel): { readonly id: string; readonly version: number; readonly seq: number; readonly act: ReleaseAct }[] {
  return m.records.flatMap((r) => {
    const id = r.release.id;
    const head = (m.queues[id] ?? [])[0];
    if (head === undefined || m.sent[id] !== undefined || m.creating.includes(id)) return [];
    return [{ id, version: r.version, seq: head.seq, act: addressed(head.act, id) }];
  });
}

const unanswered = (e: unknown): ReleaseAnswer => ({ ok: false, error: { error: e instanceof Error && e.message !== "" ? e.message : "the store did not answer", code: "unavailable" } });

/**
 * Hand every ready act to the store: `sent` first, the answer when it lands. `leaving` holds `<id>:<seq>` already
 * handed over, so a second call on the same model (Strict Mode's re-run effect, a re-render) never sends twice.
 * A door that throws instead of answering is a refusal, so its release's queue cannot stall.
 */
export function pump(m: SessionModel, doors: Pick<ReleaseActs, "apply">, send: (e: SessionEvent) => void, leaving: Set<string>): void {
  for (const out of ready(m)) {
    const key = `${out.id}:${out.seq}`;
    if (leaving.has(key)) continue;
    leaving.add(key);
    send({ type: "sent", id: out.id, seq: out.seq });
    void doors
      .apply({ id: out.id, version: out.version, act: out.act })
      .catch(unanswered)
      .then((answer) => send({ type: "answer", id: out.id, seq: out.seq, answer }));
  }
}

/** Ask the store for a release made on this page; its answer re-keys the page's copy (or removes it, refused). */
export function createIn(doors: Pick<ReleaseActs, "create">, localId: string, takes: readonly ShelfTake[], send: (e: SessionEvent) => void): void {
  void doors
    .create({ takeIds: takes.map((t) => t.takeId) })
    .catch(unanswered)
    .then((answer) => send({ type: "created", localId, answer }));
}

/** A write is on its way: an act unanswered or a create the store has not confirmed. */
export const savingOf = (m: SessionModel): boolean => m.creating.length > 0 || Object.values(m.queues).some((q) => q.length > 0);

/** The open release's pending proposals as the page shows them. */
export const pendingOf = (view: readonly ReleaseRecord[], openId: string | null): readonly ReleaseProposal[] => view.find((r) => r.release.id === openId)?.pending ?? [];
