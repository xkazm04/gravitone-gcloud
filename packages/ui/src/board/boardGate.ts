// THE BOARD'S SIDE OF THE GATE - the BoardPort seen through ./gate.ts's GatePort, so the
// desks get the gate's ticketed loads, optimistic map, write window, pagehide flush and
// ticketed commit plan unchanged (v1 app/foundry/gate/cull.ts was this file for the Cull).
//
// What it adds over v1's Cull adapter:
//   · THE REVISION. Every write carries the revision this tab last saw. A stale one is
//     answered `conflict`; the write re-reads the packet and sends the SAME keys again, once.
//     Only the keys this tab touched are named, so another tab's or an agent's decisions on
//     other keys are never overwritten - v1's read-fresh-merge, now enforced by the kernel.
//   · THE HISTORY. Undo is the kernel's (an appended inverse, decision/core.ts planUndo), so
//     the gate runs in its one-act-per-decide mode and a reload can still take an act back.
//   · THE TICKET. A commit carries an idempotency ticket minted once per preview token, so a
//     retried commit whose first attempt landed gets the first answer back, never a second
//     commit (kernel decision/driver.ts `commit`).
//   · THE BEACON. A Server Action cannot outlive its page; the pagehide flush goes out
//     through `beacon` (navigator.sendBeacon to the board's keepalive route).

import type { Consequence, EditPlan, PickOutcome } from "@gt/domain/board";
import { AppError, type ErrorEnvelope } from "@gt/domain/errors";

import type { GatePort } from "./gate.ts";
import { candidateOfKey, type BoardPacket, type BoardPort, type CommitReceipt, type PortResult, type VerdictChange } from "./port.ts";

/** A decided candidate, as the gate holds it. Undecided is absent. */
export type BoardVerdict = { readonly verdict: "keep" | "reject"; readonly reasons: readonly string[]; readonly note?: string };

export type Beacon = (id: string, rev: number, changes: readonly VerdictChange[]) => void;

export type BoardGate = {
  readonly gatePort: GatePort<BoardPacket, BoardVerdict, Consequence, CommitReceipt>;
  /** A blind pair's answer: one act, one revision. */
  readonly pick: (id: string, pair: string, outcome: PickOutcome) => Promise<void>;
  /** Send a review back with its edit plan. */
  readonly returnPacket: (id: string, plan: EditPlan) => Promise<void>;
};

export function fromEnvelope(e: ErrorEnvelope): AppError {
  return new AppError(e.code, e.error, e.detail === undefined ? undefined : { detail: e.detail });
}

function value<T>(r: PortResult<T>): T {
  if (!r.ok) throw fromEnvelope(r.error);
  return r.value;
}

/** The decided candidates of a view, keyed by candidate id. */
export function verdictsOfView(p: BoardPacket): Record<string, BoardVerdict> {
  const out: Record<string, BoardVerdict> = {};
  for (const d of p.view.decisions) {
    if (d.verdict === null) continue;
    out[candidateOfKey(d.key)] = d.note === undefined ? { verdict: d.verdict, reasons: d.reasons } : { verdict: d.verdict, reasons: d.reasons, note: d.note };
  }
  return out;
}

export function toChange(candidate: string, v: BoardVerdict | null): VerdictChange {
  if (v === null) return { candidate, verdict: null, reasons: [] };
  return v.note === undefined ? { candidate, verdict: v.verdict, reasons: v.reasons } : { candidate, verdict: v.verdict, reasons: v.reasons, note: v.note };
}

export function createBoardGate(port: BoardPort, beacon: Beacon, mintTicket: () => string = () => crypto.randomUUID()): BoardGate {
  const revs = new Map<string, number>();
  const previews = new Map<string, Consequence>();
  const tickets = new Map<string, string>();

  const load = async (id: string): Promise<BoardPacket> => {
    const p = value(await port.loadPacket({ id }));
    revs.set(id, p.view.rev);
    return p;
  };
  const revOf = async (id: string): Promise<number> => revs.get(id) ?? (await load(id)).view.rev;

  /** A write on the revision this tab saw; on `conflict`, re-read once and send it again. */
  async function revised(id: string, send: (baseRev: number) => Promise<PortResult<{ readonly rev: number }>>): Promise<number> {
    let r = await send(await revOf(id));
    if (!r.ok && r.error.code === "conflict") r = await send((await load(id)).view.rev);
    const rev = value(r).rev;
    revs.set(id, rev);
    return rev;
  }

  const gatePort: GatePort<BoardPacket, BoardVerdict, Consequence, CommitReceipt> = {
    loadDetail: load,
    verdictsOf: verdictsOfView,
    readOnlyOf: (p) => p.view.state !== "open",
    async write(id, changes) {
      const list = [...changes].map(([k, v]) => toChange(k, v));
      await revised(id, (baseRev) => port.patch({ id, baseRev, changes: list }));
    },
    keepalive(id, changes) {
      beacon(id, revs.get(id) ?? 0, [...changes].map(([k, v]) => toChange(k, v)));
    },
    stateOf: (v) => ({ verdict: v?.verdict ?? null, reasons: v?.reasons ?? [], note: v?.note ?? null }),
    async previewCommit(id) {
      const c = value(await port.preview({ id }));
      previews.set(id, c);
      return c;
    },
    async commit(id, token) {
      const seen = previews.get(id);
      if (token === undefined || seen === undefined || seen.token !== token) throw new AppError("refused", "commit: preview the consequence first");
      const ticket = tickets.get(token) ?? mintTicket();
      tickets.set(token, ticket);
      return value(await port.commit({ id, rev: seen.rev, token, ticket }));
    },
    history: {
      async undo(id) {
        await revised(id, (baseRev) => port.undo({ id, baseRev }));
        return load(id);
      },
      undoable: (p) => p.view.canUndo,
    },
  };

  return {
    gatePort,
    async pick(id, pair, outcome) {
      await revised(id, (baseRev) => port.pick({ id, baseRev, pair, outcome }));
    },
    async returnPacket(id, plan) {
      await revised(id, (rev) => port.returnPacket({ id, rev, plan }));
    },
  };
}
