// LANE - THE FOUNDRY GATE KERNEL (dynamic).
//
// The three /foundry tabs each carried their own copy of one verdict state
// machine. (Vitest lane since Phase 3: the gate is a pure ESM package now, and the Playwright
// node lane loads @gt/* twice - once through its CommonJS transform, once natively - so a
// probe there sees whichever copy its worker loaded first.) packages/ui/src/board/gate.ts is the one copy (moved from
// app/foundry/gate/useGate.ts in Phase 3, which re-exports it); this file holds it to
// the behaviours the copies existed to provide, in the Node lane, against a
// fake adapter (and, for the cross-writer case, the REAL Cull adapter over a
// replaced `fetch`):
//
//   1. a verdict the Board wrote after this tab loaded survives this tab's write
//   2. two verdicts inside the merge window are ONE write, carrying both
//   3. Z puts the key back, and the server agrees
//   4. `pagehide` inside the window issues a keepalive write
//   5. run A's slow response never lands on run B (latest-wins, tested once)
//   6. a committed run is read-only: decide is refused with no network call
import { expect, test } from "vitest";

import { cullGate } from "@/app/foundry/gate/cull";
import { createGate, type GatePort as GateAdapter } from "@gt/ui/board/gate";
import { fromKeep } from "@/lib/board/verdicts";


type Rec = { verdict: "keep" | "reject"; at: string };
interface Detail {
  id: string;
  committed: boolean;
  verdicts: Record<string, Rec>;
}

const keep = (): Rec => ({ verdict: "keep", at: "t" });
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A fake source: a server map per id, a call log, and controllable load latency. */
function fakeAdapter(seed: Record<string, Detail>) {
  const server = new Map<string, Detail>(Object.entries(seed));
  const log = { writes: [] as { id: string; changes: Record<string, Rec | null> }[], keepalives: [] as { id: string; changes: Record<string, Rec | null> }[], loads: [] as string[] };
  const gates = new Map<string, (d: Detail) => void>();
  const adapter: GateAdapter<Detail, Rec> = {
    loadDetail(id) {
      log.loads.push(id);
      // A held load resolves when the test says so; otherwise at once.
      return new Promise<Detail>((resolve) => {
        const send = () => resolve(structuredClone(server.get(id)!));
        if (gates.has(`hold:${id}`)) gates.set(id, () => send());
        else send();
      });
    },
    verdictsOf: (d) => d.verdicts,
    readOnlyOf: (d) => d.committed,
    async write(id, changes) {
      log.writes.push({ id, changes: Object.fromEntries(changes) });
      const cur = server.get(id)!;
      for (const [k, v] of changes) {
        if (v === null) delete cur.verdicts[k];
        else cur.verdicts[k] = v;
      }
    },
    keepalive(id, changes) {
      log.keepalives.push({ id, changes: Object.fromEntries(changes) });
    },
    stateOf: (v) => ({ verdict: fromKeep(v), reasons: [], note: null }),
  };
  return { adapter, server, log, hold: (id: string) => gates.set(`hold:${id}`, () => undefined), release: (id: string) => gates.get(id)?.({} as Detail) };
}

const run = (id: string, over: Partial<Detail> = {}): Detail => ({ id, committed: false, verdicts: {}, ...over });

test("gate kernel: a verdict written elsewhere after load survives this tab's write (real Cull adapter)", async () => {
  // The Board kept c2 AFTER /foundry loaded run R; /foundry then keeps c1.
  const disk: Record<string, Rec> = {};
  let rev = 1;
  const patches: { set: Record<string, unknown>; clear: string[] }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      patches.push(body);
      Object.assign(disk, body.set);
      for (const k of body.clear) delete disk[k];
      rev += 1;
      return new Response(JSON.stringify({ rev, verdicts: { ...disk } }));
    }
    if (String(url).endsWith("/api/foundry/runs/R")) return new Response(JSON.stringify({ run: { id: "R", status: "complete", candidates: [] }, verdicts: { ...disk }, rev }));
    return new Response(JSON.stringify({ detail: "no" }), { status: 404 });
  }) as typeof fetch;
  try {
    const gate = createGate(cullGate, { windowMs: 20 });
    await gate.select("R");
    disk.c2 = keep(); // the Board, behind this tab's back
    rev += 1;
    gate.decide("c1", keep());
    await gate.flush();
    expect(Object.keys(disk).sort()).toEqual(["c1", "c2"]);
    // Only the key this tab touched was named.
    expect(Object.keys(patches[0].set)).toEqual(["c1"]);
  } finally {
    globalThis.fetch = real;
  }
});

test("gate kernel: two verdicts inside the window are exactly one write carrying both", async () => {
  const f = fakeAdapter({ R: run("R") });
  const gate = createGate(f.adapter, { windowMs: 40 });
  await gate.select("R");
  gate.decide("c1", keep());
  await tick(10);
  gate.decide("c2", keep());
  await tick(90);
  expect(f.log.writes).toHaveLength(1);
  expect(Object.keys(f.log.writes[0].changes).sort()).toEqual(["c1", "c2"]);
  expect(gate.getSnapshot().save).toBe("saved");
});

test("gate kernel: Z puts the key back to undecided and the server map matches", async () => {
  const f = fakeAdapter({ R: run("R") });
  const gate = createGate(f.adapter, { windowMs: 20 });
  await gate.select("R");
  gate.decide("c1", keep());
  await gate.flush();
  expect(f.server.get("R")!.verdicts).toHaveProperty("c1");
  expect(gate.getSnapshot().canUndo).toBe(true);
  expect(gate.undo()).toBe(true);
  expect(gate.getSnapshot().verdicts).not.toHaveProperty("c1");
  await gate.flush();
  expect(f.server.get("R")!.verdicts).toEqual({});
  expect(gate.getSnapshot().canUndo).toBe(false);
  expect(gate.undo()).toBe(false); // nothing left to undo
});

test("gate kernel: Z restores the PREVIOUS verdict, not just undecided", async () => {
  const f = fakeAdapter({ R: run("R", { verdicts: { c1: { verdict: "reject", at: "t0" } } }) });
  const gate = createGate(f.adapter, { windowMs: 20 });
  await gate.select("R");
  gate.decide("c1", keep());
  await gate.flush();
  gate.undo();
  await gate.flush();
  expect(f.server.get("R")!.verdicts.c1).toEqual({ verdict: "reject", at: "t0" });
});

test("gate kernel: pagehide inside the window issues a keepalive write carrying the key, and nothing is sent twice", async () => {
  const f = fakeAdapter({ R: run("R") });
  const gate = createGate(f.adapter, { windowMs: 400 });
  const target = new EventTarget();
  const detach = gate.attach(target);
  await gate.select("R");
  gate.decide("c1", keep());
  await tick(20);
  target.dispatchEvent(new Event("pagehide"));
  expect(f.log.keepalives).toHaveLength(1);
  expect(Object.keys(f.log.keepalives[0].changes)).toEqual(["c1"]);
  // The window's own timer must not send the same key again.
  await tick(450);
  expect(f.log.writes).toHaveLength(0);
  detach();
  target.dispatchEvent(new Event("pagehide"));
  expect(f.log.keepalives).toHaveLength(1);
});

test("gate kernel: run B never receives run A's verdicts when A's fetch resolves late", async () => {
  const f = fakeAdapter({
    A: run("A", { verdicts: { a1: keep() } }),
    B: run("B", { verdicts: { b1: keep() } }),
  });
  f.hold("A");
  const gate = createGate(f.adapter, { windowMs: 20 });
  const first = gate.select("A"); // A's response is held
  await gate.select("B");
  expect(Object.keys(gate.getSnapshot().verdicts)).toEqual(["b1"]);
  f.release("A");
  await first;
  const s = gate.getSnapshot();
  expect(s.id).toBe("B");
  expect(Object.keys(s.verdicts)).toEqual(["b1"]);
  expect(s.detail?.id).toBe("B");
});

test("gate kernel: a committed run is read-only - decide and undo are refused with no network call", async () => {
  const f = fakeAdapter({ R: run("R", { committed: true }) });
  const gate = createGate(f.adapter, { windowMs: 10 });
  await gate.select("R");
  expect(gate.getSnapshot().readOnly).toBe(true);
  expect(gate.decide("c1", keep())).toBe(false);
  expect(gate.undo()).toBe(false);
  await tick(40);
  await gate.flush();
  expect(f.log.writes).toHaveLength(0);
  expect(f.log.keepalives).toHaveLength(0);
  expect(gate.getSnapshot().verdicts).toEqual({});
});

test("gate kernel: switching runs sends the old run's queue under the OLD id", async () => {
  const f = fakeAdapter({ A: run("A"), B: run("B") });
  const gate = createGate(f.adapter, { windowMs: 400 });
  await gate.select("A");
  gate.decide("a1", keep());
  await gate.select("B");
  await gate.flush();
  expect(f.log.writes).toHaveLength(1);
  expect(f.log.writes[0].id).toBe("A");
  expect(f.server.get("B")!.verdicts).toEqual({});
});

test("gate kernel: the commit plan is ticketed - a plan that lands after clear is dropped", async () => {
  const f = fakeAdapter({ R: run("R") });
  let resolvePlan: (p: { token: string }) => void = () => undefined;
  const adapter: GateAdapter<Detail, Rec, { token: string }, string> = {
    ...f.adapter,
    previewCommit: () => new Promise((r) => (resolvePlan = r)),
    commit: async (_id, token) => `committed:${token}`,
  };
  const gate = createGate(adapter, { windowMs: 20 });
  await gate.select("R");
  const asking = gate.prepareCommit();
  await tick(5);
  expect(gate.getSnapshot().plan.loading).toBe(true);
  gate.clearPlan();
  resolvePlan({ token: "stale" });
  await asking;
  expect(gate.getSnapshot().plan).toEqual({ plan: null, loading: false, error: null });

  const asking2 = gate.prepareCommit();
  await tick(5);
  resolvePlan({ token: "fresh" });
  await asking2;
  expect(gate.getSnapshot().plan.plan).toEqual({ token: "fresh" });
  await expect(gate.commit()).resolves.toBe("committed:fresh");
});
