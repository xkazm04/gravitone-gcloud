// LANE — A WORK KIND SITS BESIDE THE TEXT KIND IN THE TURN KERNEL (dynamic, AIO-A tail).
//
// WHAT WAS WRONG. The kernel had one spec shape, TurnSpec, and it is a text turn
// end to end: `reason()` dispatches it, `settle` validates it, and the record's
// receipt is a TextProvenance with one row booked on the text meter. A poster is
// an imaging call, so putting it on a turn meant forging a text receipt.
//
// WHAT THIS PROBE DRIVES. A test-only LOCAL work kind registered on the real
// runner and started through the real POST /api/turns, cancelled through the real
// cancel route. No engine and no vendor: the work is a held promise.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { POST as startPOST } from "@/app/api/turns/route";
import { POST as cancelPOST } from "@/app/api/turns/[id]/cancel/route";
import { GET as turnGET } from "@/app/api/turns/[id]/route";
import { __resetTextSpend, textSpendRows } from "@/lib/text/spend";
import { readTurn, type TurnRecord } from "@/lib/turns/ledger";
import { registerTurnKind, TurnInputError, whenIdle, type WorkSpec } from "@/lib/turns/runner";

import { keepEnv } from "./_helpers";

keepEnv(["TEXT_TURN_DIR", "NEXT_PUBLIC_DEV_AUTH", "SPEND_STORE"]);

let dir = "";
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gravitone-turn-work-"));
  process.env.TEXT_TURN_DIR = dir;
  process.env.NEXT_PUBLIC_DEV_AUTH = "1";
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

let unregister: (() => void) | null = null;
test.beforeAll(() => {
  unregister = registerTurnKind(SPEC as WorkSpec);
});
test.afterAll(() => unregister?.());

let ip = 0;
async function start(projectId: string, n: number | undefined = 21) {
  const res = await startPOST(
    new Request("http://localhost/api/turns", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.95.0.${(++ip % 250) + 1}` },
      body: JSON.stringify({ kind: KIND, projectId, input: { n } }),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
async function cancel(id: string) {
  const res = await cancelPOST(new Request(`http://localhost/api/turns/${id}/cancel`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
async function settled(id: string): Promise<TurnRecord> {
  await whenIdle();
  const res = await turnGET(new Request(`http://localhost/api/turns/${id}`), { params: Promise.resolve({ id }) });
  return ((await res.json()) as { turn: TurnRecord }).turn;
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
  const out = await start("p-wk-a");
  expect(out.status).toBe(202);
  const rec = await settled(out.json.turnId as string);
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
  const out = await start("p-wk-b");
  const id = out.json.turnId as string;
  await g.inside;

  const c = await cancel(id);
  console.log(`[turn-work-kind] cancel -> ${c.status} ${JSON.stringify({ code: c.json.code })}`);
  expect(c.status).toBe(409);
  expect(c.json.code).toBe("not-cancellable");
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
  const out = await start("p-wk-c");
  const rec = await settled(out.json.turnId as string);
  boom = null;
  expect(rec.status).toBe("failed");
  expect(rec.error?.message).toBe("the vendor said no");
  expect(rec.result).toBeUndefined();
});

test("d: a second start on a serialised slot answers 409 naming the holder; a bad input is 400 with no record", async () => {
  boom = null;
  const g = hold();
  const first = await start("p-wk-d");
  await g.inside;
  const second = await start("p-wk-d");
  expect(second.status).toBe(409);
  expect(second.json.holder).toBe(first.json.turnId);
  expect((await start("p-wk-d-other")).status, "another project is its own slot").toBe(202);

  const bad = await startPOST(
    new Request("http://localhost/api/turns", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.95.1.1" },
      body: JSON.stringify({ kind: KIND, projectId: "p-wk-d-bad", input: {} }),
    }),
  );
  expect(bad.status).toBe(400);
  g.release();
  await settled(first.json.turnId as string);
  gate = null;
});
