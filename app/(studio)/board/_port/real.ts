import "server-only";

import { createHash } from "node:crypto";

import type { PacketSummary } from "@gt/domain/board";
import type { LoadSummary } from "@gt/domain/load";
import { canonical } from "@gt/kernel/canonical";
import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import { packetIdSchema, runIdSchema, type PacketId } from "@gt/domain/ids";
import { PACKET_SOURCES, SOURCES, type PacketSource } from "@gt/domain/source";
import { applyStatus } from "@gt/kernel/decision/apply";
import { commit as kernelCommit, returnPacket as kernelReturn } from "@gt/kernel/decision/commit";
import { openPacket, patchMany, pick as kernelPick, undo as kernelUndo, type Author, type PatchOutcome } from "@gt/kernel/decision/driver";
import { currentDecisions, head } from "@gt/kernel/decision/read";
import { listPacketSummaries, readPacketView } from "@gt/kernel/decision/view";
import type { Store } from "@gt/kernel/store";
import type { BoardPacket, Presentation } from "@gt/ui/board/port";

import { adapterFor } from "../../../../lib/decision/v1/registry.ts";
import { reworkNote } from "../../../../lib/decision/v1/sources/article.ts";
import { nightLoadOf } from "../../../../lib/foundry/scout/load.ts";
import type { DecisionAdapter, OpenPlan } from "../../../../lib/decision/v1/types.ts";
import { parsePacketId } from "../../../../lib/ledger/v1/packet.ts";
import type { WeirItem } from "../../../../lib/ledger/v1/types.ts";
import type { Principal } from "../../../../lib/principal.ts";
import type { ServerBoard } from "./port.ts";

// THE REAL BOARD - the BoardPort over the kernel's decision driver and each source's v1
// adapter (Phase 3 wave C). Every write is ONE kernel transaction (decision + event); v1 is
// read, never written, until a commit's apply delivers the outcome through v1's own writers
// (lib/decision/v1/applier.ts, kicked here right after the commit, swept on every render).
//
// THE PACKET IS OPENED ON FIRST SIGHT. A Weir pile names its packet (`pkt:<source>:<run>`,
// lib/ledger/v1/packet.ts); the first load of that id reads the v1 record through the
// adapter, plans the packet, and opens it with v1's verdicts as its first decisions
// (decision 3). Every later load reads the STORED packet and does not re-open it: a v1 that
// moved while the packet was open would otherwise be the kernel's "already open with other
// content" conflict on every render (wave B ruling 6). The adapter is still asked for its
// Presentation each load - the kernel holds candidates by blob, the adapter knows what a
// human calls them - and when v1 no longer plans the packet (a committed run refuses), the
// view falls back to the candidate ids, which is all a decided desk draws.
//
// AN AGGREGATE PILE IS NAMED BARE (`pkt:audio:audio/triage`, the Floor's link) and resolved
// by its adapter to the pile it is now (`.../audio/triage/<cutoff>`, ruling 4); the answer
// carries the resolved id and the page redirects to it.
//
// THE COMMIT RE-READS v1. The preview's token folds in the digest of the v1 state it was
// planned from; the commit recomputes that digest from a fresh read and hands it to the
// kernel, which refuses with `conflict` / "stale-preview" when either side moved (decision 6).
//
// A COMMIT IN PARTS (spark scout-storyboards): a source whose adapter is `partial` is drawn with `present.partial`,
// and its commit may carry `undecidedAs: "leave"` - the kernel commits the decided cells and records the rest as
// undecided; the adapter opens them as the remainder packet. Any other source's commit with a sweep is refused here,
// before the kernel sees it.

export type Deps = {
  readonly store: () => Result<Store>;
  /** v1's Weir piles now (lib/ledger/v1/sync.ts liveNow): the rail lists the unopened ones. */
  readonly weir: () => Promise<readonly WeirItem[]>;
  /** Start delivering a just-committed (or returned) packet's apply; never awaited. */
  readonly kick: (store: Store, packetId: PacketId) => void;
  /** Tests substitute an adapter; the app reads the registry. */
  readonly adapter?: (source: PacketSource) => Result<DecisionAdapter<unknown>>;
};

/** Who wrote it, as the ledger names the actor. A principal without a uid (the shared secret) is the operator. */
export type Who = { readonly who?: string };

/** The ledger's actor for a principal: its uid; the shared secret (and a public door's null) names nobody. */
export const actorOf = (p: Principal | null): Who => (p !== null && "uid" in p ? { who: p.uid } : {});

const SURFACE = "board";
const author = (w: Who | undefined): Author => ({ by: "operator", surface: SURFACE, ...(w?.who === undefined ? {} : { who: w.who }) });

const isSource = (x: string): x is PacketSource => PACKET_SOURCES.some((s) => s === x);

/** The source a packet id names, or not-found in the Board's words. */
function sourceOf(id: string): Result<{ readonly source: PacketSource; readonly runId: string }> {
  const p = parsePacketId(id);
  if (p === null || !isSource(p.source)) return err("not-found", `board: ${id} is not a packet id (pkt:<source>:<run>)`);
  return ok({ source: p.source, runId: p.runId });
}

const exists = (store: Store, id: string): Result<boolean> => store.read((r) => r.get("SELECT 1 AS hit FROM packets WHERE id = ?", id) !== undefined);

/** A patch, pick or undo's answer as the port's: the new revision, or the refusal (its 409 body stays server-side). */
function revised(r: Result<PatchOutcome>): Result<{ readonly rev: number }> {
  if (!r.ok) return r;
  const o = r.value;
  return o.ok ? ok({ rev: o.value.rev }) : { ok: false, error: o.error };
}

/** What the desks draw when v1 no longer plans the packet: the candidate ids, which is all a decided desk needs. */
const bare = (): Presentation => ({ items: {}, rows: [] });

/**
 * What a decided desk still draws beside the ids, read without the adapter's plan: a /scout night's load
 * (spark night-load-band). A committed night is refused by the adapter's `packet` - it is decided - but its
 * load is a measurement of the night, not a judgement in it, and the committed desk shows it as the open one did.
 */
async function decidedExtras(store: Store, id: string): Promise<{ readonly load?: LoadSummary }> {
  const s = sourceOf(id);
  if (!s.ok || s.value.source !== "scout") return {};
  const load = await nightLoadOf(store, s.value.runId);
  return load === undefined ? {} : { load };
}

export function makeRealBoard(deps: Deps): ServerBoard {
  const adapterOf = deps.adapter ?? adapterFor;

  /** The adapter, the v1 record and the plan for a packet id; `id` may be a bare aggregate. */
  async function plan(id: string): Promise<Result<{ readonly adapter: DecisionAdapter<unknown>; readonly v1: unknown; readonly plan: OpenPlan }>> {
    const s = sourceOf(id);
    if (!s.ok) return s;
    const a = adapterOf(s.value.source);
    if (!a.ok) return a;
    const v1 = await a.value.read({ runId: s.value.runId });
    if (!v1.ok) return v1;
    const p = a.value.packet(v1.value);
    return p.ok ? ok({ adapter: a.value, v1: v1.value, plan: p.value }) : p;
  }

  /** Whether the source a packet id names commits in parts (its adapter's `partial`). */
  const partialOf = (id: string): boolean => {
    const s = sourceOf(id);
    if (!s.ok) return false;
    const a = adapterOf(s.value.source);
    return a.ok && a.value.partial === true;
  };

  /** The stored packet's view, with the adapter's words where it still has them. */
  function view(store: Store, id: string, planned: OpenPlan | undefined, extras: { readonly load?: LoadSummary } = {}): Result<BoardPacket> {
    const urls = planned?.urls ?? {};
    const v = store.read((r) => readPacketView(r, id, { mediaUrl: (_blob, c) => urls[c] ?? "" }));
    if (!v.ok) return v;
    const drawn: Presentation = planned === undefined ? { ...bare(), ...extras } : { ...planned.present, ...(planned.losses.length === 0 ? {} : { losses: planned.losses }) };
    const present: Presentation = partialOf(id) ? { ...drawn, partial: true } : drawn;
    if (v.value.mode !== "blind-pair") return ok({ view: v.value, present });
    // A blind arm's words are the machine's tell as much as its pick is: withheld until the
    // operator has judged that pair (ruling 9; L21's fixture does the same).
    const hidden = new Set(v.value.pairs.filter((p) => p.outcome === null).flatMap((p): string[] => [p.a, p.b]));
    return ok({ view: v.value, present: { ...present, items: Object.fromEntries(Object.entries(present.items).filter(([k]) => !hidden.has(k))) } });
  }

  async function loadPacket({ id }: { readonly id: string }, who?: Who): Promise<Result<BoardPacket>> {
    const k = deps.store();
    if (!k.ok) return k;
    const store = k.value;
    const held = exists(store, id);
    if (!held.ok) return held;
    const planned = await plan(id);
    if (held.value) {
      if (planned.ok) return view(store, id, planned.value.plan);
      const v = view(store, id, undefined, await decidedExtras(store, id));
      // A decided packet v1 refuses to plan is the expected case; an OPEN one draws bare ids and
      // empty media on a desk still taking verdicts, and v1's reason must survive somewhere.
      if (v.ok && v.value.view.state === "open") console.error(`[board] ${id}: open, and v1 does not plan it: ${planned.error.message}`);
      return v;
    }
    // Not in the kernel: open it from v1 - or say, in v1's words, why it cannot be.
    if (!planned.ok) return planned.error.code === "not-found" ? planned : err(planned.error.code, `board: ${id}: ${planned.error.message}`, { cause: planned.error });
    const p = planned.value.plan;
    const resolved = p.packet.id;
    // A bare aggregate resolves to a pile that may already be open (ruling 4 + 6).
    const already = resolved === id ? ok(false) : exists(store, resolved);
    if (!already.ok) return already;
    if (!already.value) {
      const opened = store.tx((t) => openPacket(t, { packet: p.packet, initial: p.initial, ...(p.machinePicks === undefined ? {} : { machinePicks: p.machinePicks }) }, author(who)));
      if (!opened.ok) return opened;
    }
    return view(store, resolved, p);
  }

  async function listPackets(): Promise<Result<{ readonly packets: readonly PacketSummary[]; readonly truncated: boolean }>> {
    const k = deps.store();
    if (!k.ok) return k;
    const listed = k.value.read((r) => listPacketSummaries(r, { limit: 100 }));
    if (!listed.ok) return listed;
    const held = new Set<string>(listed.value.packets.map((p) => p.id));
    const openIds = listed.value.packets.filter((p) => p.state === "open").map((p) => p.id);
    // v1's piles not opened yet, opened lazily when the operator opens one. A bare aggregate
    // is shown only while no pile of its base is open: the open one is that pile.
    const weir = await deps.weir();
    // The page is cut at 100 rows: a decided packet past it whose pile v1 still lists (a stuck apply)
    // is held all the same, so the Weir's ids are asked of the kernel directly.
    if (listed.value.truncated) {
      for (const w of weir) {
        if (w.packetId === undefined || held.has(w.packetId)) continue;
        const there = exists(k.value, w.packetId);
        if (there.ok && there.value) held.add(w.packetId);
      }
    }
    const unopened: PacketSummary[] = [];
    for (const w of weir) {
      if (w.packetId === undefined || held.has(w.packetId) || openIds.some((o) => o.startsWith(`${w.packetId}/`))) continue;
      const s = sourceOf(w.packetId);
      const id = parseAt("weir packet id", packetIdSchema, w.packetId);
      const run = parseAt("weir run id", runIdSchema, w.id);
      if (!s.ok || !id.ok || !run.ok) continue;
      const mode = SOURCES[s.value.source].modes[0];
      if (mode === undefined) continue;
      unopened.push({ id: id.value, lane: w.media, source: s.value.source, mode, state: "open", title: w.title, runId: run.value, rev: 0, items: w.decided + w.pending, decided: w.decided, openedAt: w.since ?? new Date(0).toISOString() });
    }
    return ok({ packets: [...listed.value.packets.filter((p) => p.state === "open"), ...unopened, ...listed.value.packets.filter((p) => p.state !== "open")], truncated: listed.value.truncated });
  }

  /** A write's packet id, minted at the door; the kernel's own head read refuses an unknown one. */
  const pid = (id: string): Result<PacketId> => parseAt("packet id", packetIdSchema, id);

  async function preview({ id }: { readonly id: string }) {
    const k = deps.store();
    if (!k.ok) return k;
    const store = k.value;
    const at = store.read((r) => ({ head: head(r, id), decisions: currentDecisions(r, id).decisions }));
    if (!at.ok) return at;
    if (at.value.head.state !== "open") return err("refused", `board: packet ${id} is ${at.value.head.state}; there is nothing left to preview`);
    const packetId = pid(id);
    if (!packetId.ok) return packetId;
    const planned = await plan(id);
    if (!planned.ok) return planned;
    const c = planned.value.adapter.consequence(planned.value.v1, { packetId: packetId.value, rev: at.value.head.rev, decisions: at.value.decisions });
    return c.ok ? ok(c.value.consequence) : c;
  }

  async function commit({ id, token, ticket, undecidedAs }: { readonly id: string; readonly rev: number; readonly token: string; readonly ticket: string; readonly undecidedAs?: "leave" }, who?: Who) {
    const k = deps.store();
    if (!k.ok) return k;
    const store = k.value;
    const packetId = pid(id);
    if (!packetId.ok) return packetId;
    if (undecidedAs !== undefined && !partialOf(id)) return err("refused", `board: packet ${id} commits only whole; its source does not commit in parts`);
    const at = store.read((r) => ({ head: head(r, id), decisions: currentDecisions(r, id).decisions }));
    if (!at.ok) return at;
    // A decided packet is not re-read from v1 (it may refuse now that the outcome landed):
    // the kernel answers a retried ticket with the first result and refuses any other.
    let v1Digest = "";
    if (at.value.head.state === "open") {
      const planned = await plan(id);
      if (!planned.ok) return planned;
      const fresh = planned.value.adapter.consequence(planned.value.v1, { packetId: packetId.value, rev: at.value.head.rev, decisions: at.value.decisions });
      if (!fresh.ok) return fresh;
      v1Digest = fresh.value.v1Digest;
    }
    const done = store.tx((t) => kernelCommit(t, { ...author(who), packetId: packetId.value, ticket, token, v1Digest, ...(undecidedAs === undefined ? {} : { undecidedAs }) }));
    if (!done.ok) return done;
    const r = done.value;
    if (!r.ok) return r;
    deps.kick(store, packetId.value);
    const apply = store.read((rd) => applyStatus(rd, id));
    const later = r.value.undecided.length;
    return ok({ packetId: id, rev: r.value.rev, kept: r.value.kept.length, rejected: r.value.rejected.length, ...(later === 0 ? {} : { undecided: later }), at: r.value.at, ...(apply.ok && apply.value !== undefined ? { apply: apply.value } : {}) });
  }

  async function returnPacket({ id, rev, plan: editPlan }: { readonly id: string; readonly rev: number; readonly plan: Parameters<ServerBoard["returnPacket"]>[0]["plan"] }, who?: Who) {
    const k = deps.store();
    if (!k.ok) return k;
    const store = k.value;
    const packetId = pid(id);
    if (!packetId.ok) return packetId;
    const s = sourceOf(id);
    if (!s.ok) return s;
    // v1 takes an article's rework as ONE note under its bound: refuse here, before the kernel
    // records a return v1 would then refuse for ever (ruling 7).
    if (s.value.source === "article") {
      const note = reworkNote(editPlan);
      if (!note.ok) return note;
    }
    // The port carries no ticket; one derived from what is being sent makes a retried send the
    // same act (the kernel answers it with the first result) and a different plan a conflict.
    const ticket = `return:${createHash("sha256").update(canonical({ id, rev, plan: editPlan.map((n) => ({ ...n })) })).digest("hex").slice(0, 32)}`;
    const done = store.tx((t) => kernelReturn(t, { ...author(who), packetId: packetId.value, baseRev: rev, ticket, plan: editPlan }));
    if (!done.ok) return done;
    if (!done.value.ok) return done.value;
    deps.kick(store, packetId.value);
    return ok({ rev: done.value.value.rev });
  }

  return {
    loadPacket,
    listPackets,
    patch: async ({ id, baseRev, changes }, who?: Who) => {
      const k = deps.store();
      if (!k.ok) return k;
      const packetId = pid(id);
      if (!packetId.ok) return packetId;
      const cs = changes.map((c) => ({ key: `${id}::${c.candidate}`, verdict: c.verdict, reasons: c.reasons, ...(c.note === undefined ? {} : { note: c.note }) }));
      return revised(k.value.tx((t) => patchMany(t, { ...author(who), packetId: packetId.value, baseRev, changes: cs })));
    },
    undo: async ({ id, baseRev }, who?: Who) => {
      const k = deps.store();
      if (!k.ok) return k;
      const packetId = pid(id);
      if (!packetId.ok) return packetId;
      return revised(k.value.tx((t) => kernelUndo(t, { ...author(who), packetId: packetId.value, baseRev })));
    },
    pick: async ({ id, baseRev, pair, outcome }, who?: Who) => {
      const k = deps.store();
      if (!k.ok) return k;
      const packetId = pid(id);
      if (!packetId.ok) return packetId;
      return revised(k.value.tx((t) => kernelPick(t, { ...author(who), packetId: packetId.value, baseRev, pair, outcome })));
    },
    preview,
    commit,
    returnPacket,
  };
}
