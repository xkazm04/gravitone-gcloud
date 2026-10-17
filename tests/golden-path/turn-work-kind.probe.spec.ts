// LANE — A WORK KIND SITS BESIDE THE TEXT KIND IN THE TURN KERNEL (dynamic, AIO-A tail).
//
// WHAT WAS WRONG. The kernel had one spec shape, TurnSpec, and it is a text turn
// end to end: `reason()` dispatches it, `settle` validates it, and the record's
// receipt is a TextProvenance with one row booked on the text meter. A poster is
// an imaging call, so putting it on a turn meant forging a text receipt.
//
// WHAT THIS PROBE DRIVES. A test-only LOCAL work kind started and cancelled on the
// real runner (startTurn / cancelTurn). It went through POST /api/turns and the
// cancel route until those retired with the v1 pages (Phase 6 L70); the 202/409/400
// they answered went with them, the runner's outcomes are what is kept. No engine
// and no vendor: the work is a held promise.
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { __resetTextSpend, textSpendRows } from "@/lib/text/spend";
import { readTurn, type TurnRecord } from "@/lib/turns/ledger";
import { cancelTurn, startTurn, TurnInputError, whenIdle, type WorkSpec } from "@/lib/turns/runner";

import { keepEnv } from "./_helpers";

keepEnv(["TEXT_TURN_DIR", "SPEND_STORE"]);

let dir = "";
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gravitone-turn-work-"));
  process.env.TEXT_TURN_DIR = dir;
  process.env.SPEND_STORE = "memory";
  __resetTextSpend();
});
test.afterEach(async () => {
  await whenIdle();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

const KIND = "probe-work";
let gate: { entered: () => void; release: Promise<void> } | null = null;
let boom: string | null = null;

const SPEC: WorkSpec<{ n: number }, { doubled: number }> = {
  kind: KIND,
  lane: "local",
  serialised: true,
  cancellable: false,
  async prepare(raw) {
    const n = (raw as { n?: unknown } | null)?.n;
    if (typeof n !== "number") throw new TurnInputError("input.n is required.");
    return { input: { n }, digestOf: `n=${n}`, chars: 3 };
  },
  async work({ input }) {
    if (gate) {
      gate.entered();
      await gate.release;
    }
    if (boom) throw new Error(boom);
    return { result: { doubled: input.n * 2 }, receipt: { lane: "local", wallMs: 7 } };
  },
};

/** The runner's answer to a start, or the kind's refusal (thrown before any record). */
async function start(projectId: string, input: unknown = { n: 21 }) {
  try {
    return await startTurn(SPEC as WorkSpec, projectId, input);
  } catch (e) {
    if (e instanceof TurnInputError) return { ok: false as const, refused: e };
    throw e;
  }
}
async function started(projectId: string): Promise<string> {
  const out = await start(projectId);
  if (!out.ok || !("turnId" in out)) throw new Error(`the turn did not start: ${JSON.stringify(out)}`);
  return out.turnId;
}
async function settled(id: string): Promise<TurnRecord> {
  await whenIdle();
  return (await readTurn(id))!;
}
function hold() {
  let entered!: () => void;
  let release!: () => void;
  const inside = new Promise<void>((r) => (entered = r));
  gate = { entered: () => entered(), release: new Promise<void>((r) => (release = r)) };
  return { inside, release: () => release() };
}

test("a: a done record carries the WorkReceipt and the result, and no text spend row is booked", async () => {
  gate = null;
  boom = null;
  const rec = await settled(await started("p-wk-a"));
  console.log(`[turn-work-kind] done record: ${JSON.stringify({ turn: rec.turn, receipt: rec.receipt, result: rec.result, uncancellable: rec.uncancellable })}`);
  expect(rec.status).toBe("done");
  expect(rec.turn).toBe("local-render");
  expect(rec.receipt).toEqual({ lane: "local", wallMs: 7 });
  expect(rec.result).toEqual({ doubled: 42 });
  expect(rec.uncancellable).toBe(true);
  expect(rec.promptChars).toBe(3);
  expect(await textSpendRows(), "a work kind books no text spend row").toEqual([]);
});

test("b: a cancel of a running uncancellable kind answers not-cancellable; the record stays running and then settles done", async () => {
  boom = null;
  const g = hold();
  const id = await started("p-wk-b");
  await g.inside;

  const c = await cancelTurn(id);
  expect(c.ok).toBe(false);
  expect(!c.ok && c.why).toBe("not-cancellable");
  expect((await readTurn(id))!.status, "a cancel wrote over a run that is still billing").toBe("running");

  g.release();
  const rec = await settled(id);
  expect(rec.status).toBe("done");
  expect(rec.result).toEqual({ doubled: 42 });
  gate = null;
});

test("c: a work that throws fails the record with its message", async () => {
  gate = null;
  boom = "the vendor said no";
  const rec = await settled(await started("p-wk-c"));
  boom = null;
  expect(rec.status).toBe("failed");
  expect(rec.error?.message).toBe("the vendor said no");
  expect(rec.result).toBeUndefined();
});

test("d: a second start on a serialised slot is refused naming the holder; a bad input is refused with no record", async () => {
  boom = null;
  const g = hold();
  const first = await started("p-wk-d");
  await g.inside;
  const second = await start("p-wk-d");
  expect(second.ok).toBe(false);
  expect("holder" in second ? second.holder.id : null).toBe(first);
  expect((await start("p-wk-d-other")).ok, "another project is its own slot").toBe(true);

  const records = readdirSync(dir).length;
  const bad = await start("p-wk-d-bad", {});
  expect("refused" in bad ? bad.refused.status : null).toBe(400);
  expect(readdirSync(dir).length, "a refused start wrote a record").toBe(records);
  g.release();
  await settled(first);
  gate = null;
});
