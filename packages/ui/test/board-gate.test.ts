// The gate over the BoardPort (src/board/boardGate.ts + the gate's history mode): one decide is
// one act on the server, an unsent act is taken back without the network, a stale revision is
// re-read and only the touched keys are sent again, a commit carries the preview's token and a
// ticket that a retry reuses, and a closing tab's beacon names only what this tab touched.
// Against an in-memory BoardPort that enforces the revision the way the kernel does.
import { describe, expect, test } from "vitest";

import type { Consequence } from "@gt/domain/board";
import type { Decision } from "@gt/domain/decision";
import { parseAt } from "@gt/domain/door";
import { candidateIdSchema, packetIdSchema } from "@gt/domain/ids";
import type { Result } from "@gt/domain/errors";

import { createBoardGate, type BoardVerdict } from "../src/board/boardGate.ts";
import { createGate } from "../src/board/gate.ts";
import type { BoardPacket, BoardPort, PortResult, VerdictChange } from "../src/board/port.ts";

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw r.error;
  return r.value;
};
const PID = "pkt:forge:r1";
const IDS = ["a", "b", "c"];
const keep: BoardVerdict = { verdict: "keep", reasons: [] };
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

type V = BoardVerdict | null;

function fakePort() {
  const state = { rev: 0, map: new Map<string, V>(), acts: [] as { rev: number; before: Map<string, V>; undone: boolean }[] };
  const calls = { patch: [] as { baseRev: number; changes: readonly VerdictChange[] }[], undo: 0, commit: [] as { rev: number; token: string; ticket: string }[], loads: 0 };
  const no = <T>(code: "conflict" | "refused", error: string): PortResult<T> => ({ ok: false, error: { code, error } });
  const view = (): BoardPacket => {
    const decisions: Decision[] = [...state.map].flatMap(([c, v]) => (v === null ? [] : [{ key: `${PID}::${c}`, verdict: v.verdict, reasons: [...v.reasons], rev: state.rev, by: "operator" as const, surface: "board", at: "2026-10-15T10:00:00.000Z" }]));
    return {
      view: {
        id: must(parseAt("test", packetIdSchema, PID)),
        lane: "image",
        source: "forge",
        mode: "matrix-cull",
        state: "open",
        rev: state.rev,
        items: IDS.map((id) => ({ id: must(parseAt("test", candidateIdSchema, id)), url: `/${id}.png`, media: { sha256: "0".repeat(64), bytes: 1, mime: "image/png" }, grades: [] })),
        decisions,
        undecided: IDS.length - decisions.length,
        canUndo: state.acts.some((a) => !a.undone),
        reasons: { list: ["style"], max: 1, noteMax: 0 },
        pairs: [],
      },
      present: { items: {}, rows: [] },
    };
  };
  const preview: Consequence = { packetId: must(parseAt("test", packetIdSchema, PID)), rev: 0, counts: { kept: 0, rejected: 0, undecided: 0 }, deletes: [], writes: [], promotions: [], renames: [], nearDuplicates: [], outward: [], v1Digest: "d", token: "tok-1" };
  const port: BoardPort = {
    loadPacket: async () => {
      calls.loads++;
      return { ok: true, value: view() };
    },
    listPackets: async () => ({ ok: true, value: { packets: [], truncated: false } }),
    patch: async ({ baseRev, changes }) => {
      calls.patch.push({ baseRev, changes });
      if (baseRev !== state.rev) return no("conflict", "moved");
      const before = new Map(changes.map((c) => [c.candidate, state.map.get(c.candidate) ?? null]));
      for (const c of changes) state.map.set(c.candidate, c.verdict === null ? null : { verdict: c.verdict, reasons: c.reasons });
      state.rev++;
      state.acts.push({ rev: state.rev, before, undone: false });
      return { ok: true, value: { rev: state.rev } };
    },
    undo: async ({ baseRev }) => {
      calls.undo++;
      if (baseRev !== state.rev) return no("conflict", "moved");
      const act = [...state.acts].reverse().find((a) => !a.undone);
      if (act === undefined) return no("refused", "nothing to undo");
      act.undone = true;
      for (const [c, v] of act.before) state.map.set(c, v);
      state.rev++;
      return { ok: true, value: { rev: state.rev } };
    },
    pick: async () => no("refused", "not a pair"),
    preview: async () => ({ ok: true, value: { ...preview, rev: state.rev } }),
    commit: async (c) => {
      calls.commit.push(c);
      return { ok: true, value: { packetId: PID, rev: c.rev, kept: 1, rejected: 0, at: "t" } };
    },
    returnPacket: async () => no("refused", "not a review"),
  };
  /** Another tab or an agent writes behind this one's back. */
  const elsewhere = (c: string, v: V) => {
    state.map.set(c, v);
    state.rev++;
  };
  return { port, state, calls, elsewhere };
}

const beacons: { id: string; rev: number; changes: readonly VerdictChange[] }[] = [];
const setup = () => {
  const f = fakePort();
  let n = 0;
  const b = createBoardGate(f.port, (id, rev, changes) => beacons.push({ id, rev, changes }), () => `ticket-${++n}`);
  const gate = createGate(b.gatePort, { windowMs: 30 });
  return { ...f, gate };
};

describe("one decide is one act", () => {
  test("two decides inside the window go out as two writes, each naming only its key", async () => {
    const { gate, calls, state } = setup();
    await gate.select(PID);
    gate.decide("a", keep);
    gate.decide("b", keep);
    await tick(60);
    await gate.flush();
    expect(calls.patch.map((p) => p.changes.map((c) => c.candidate))).toEqual([["a"], ["b"]]);
    expect(state.rev).toBe(2);
  });

  test("an act still in the window is taken back here: no write, no undo call", async () => {
    const { gate, calls } = setup();
    await gate.select(PID);
    gate.decide("a", keep);
    expect(gate.getSnapshot().canUndo).toBe(true);
    expect(gate.undo()).toBe(true);
    await tick(60);
    await gate.flush();
    expect(calls.patch).toHaveLength(0);
    expect(calls.undo).toBe(0);
    expect(gate.getSnapshot().verdicts).toEqual({});
    expect(gate.getSnapshot().canUndo).toBe(false);
  });

  test("an act that landed is the server's to undo, and the map follows the server", async () => {
    const { gate, calls, state } = setup();
    await gate.select(PID);
    gate.decide("a", keep);
    await gate.flush();
    expect(gate.getSnapshot().canUndo).toBe(true);
    expect(gate.undo()).toBe(true);
    await gate.flush();
    await tick(5);
    expect(calls.undo).toBe(1);
    expect(state.map.get("a")).toBe(null);
    expect(gate.getSnapshot().verdicts).toEqual({});
    expect(gate.getSnapshot().canUndo).toBe(false);
  });

  test("a reload still knows there is an act to take back (the history is the server's)", async () => {
    const first = setup();
    await first.gate.select(PID);
    first.gate.decide("a", keep);
    await first.gate.flush();
    const again = createGate(createBoardGate(first.port, () => undefined).gatePort, { windowMs: 30 });
    await again.select(PID);
    expect(again.getSnapshot().canUndo).toBe(true);
  });
});

describe("the revision", () => {
  test("a stale base is re-read once and the SAME keys sent again; the other writer's key survives", async () => {
    const { gate, calls, state, elsewhere } = setup();
    await gate.select(PID);
    elsewhere("c", { verdict: "reject", reasons: [] });
    gate.decide("a", keep);
    await gate.flush();
    expect(calls.patch.map((p) => [p.baseRev, p.changes.map((c) => c.candidate)])).toEqual([
      [0, ["a"]],
      [1, ["a"]],
    ]);
    expect(state.map.get("c")).toEqual({ verdict: "reject", reasons: [] });
    expect(gate.getSnapshot().save).toBe("saved");
  });
});

describe("the commit", () => {
  test("no preview, no commit", async () => {
    const { gate, calls } = setup();
    await gate.select(PID);
    await expect(gate.commit()).rejects.toThrow(/preview the consequence first/);
    expect(calls.commit).toHaveLength(0);
  });

  test("it carries the preview's revision and token, and a retry reuses its ticket", async () => {
    const { gate, calls } = setup();
    await gate.select(PID);
    gate.decide("a", keep);
    await gate.prepareCommit();
    await gate.commit();
    await gate.commit();
    expect(calls.commit).toEqual([
      { id: PID, rev: 1, token: "tok-1", ticket: "ticket-1" },
      { id: PID, rev: 1, token: "tok-1", ticket: "ticket-1" },
    ]);
  });
});

describe("a closing tab", () => {
  test("the beacon carries every queued act's keys, merged, and nothing goes out twice", async () => {
    beacons.length = 0;
    const { gate, calls } = setup();
    await gate.select(PID);
    gate.decide("a", keep);
    gate.decide("b", null);
    gate.flushOnHide();
    await tick(60);
    expect(calls.patch).toHaveLength(0);
    expect(beacons).toEqual([
      {
        id: PID,
        rev: 0,
        changes: [
          { candidate: "a", verdict: "keep", reasons: [] },
          { candidate: "b", verdict: null, reasons: [] },
        ],
      },
    ]);
  });
});
