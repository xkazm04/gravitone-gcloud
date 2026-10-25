// LANE — TEXT SPEND IS COUNTED, NEVER REFUSED (dynamic).
//
// Card IMG-A stage 3b, operator answer 2026-10-07: "Count only, refuse nothing".
// Turns run through the REAL router, against the stand-in `claude` first on PATH
// (CIP-A) or a stubbed Google fetch: no real binary, no live API call.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { SPEND_CLASSES } from "@/lib/spend/classes";
import { createMeter } from "@/lib/spend/meter";
import { TextError } from "@/lib/text/errors";
import { postJson } from "@/lib/text/http";
import { reason } from "@/lib/text/router";
import {
  __resetTextSpend,
  __setTextSpendStore,
  bookServedTurn,
  textSpendByAxis,
  textSpendRows,
  textSpendStats,
} from "@/lib/text/spend";

import { FAKE_ENGINE_ENV, keepEnv, loadCassette, withFakeEngine, type Cassette } from "./_helpers";

keepEnv([...FAKE_ENGINE_ENV, "TEXT_ENV", "LOCAL_BINARIES", "GOOGLE_AI_API_KEY", "LIGHTTRACK_DISABLE", "TEXT_SPEND_WINDOW_MS"]);

test.beforeEach(() => {
  process.env.TEXT_ENV = "local";
  process.env.LOCAL_BINARIES = "on";
  process.env.LIGHTTRACK_DISABLE = "1";
  delete process.env.GOOGLE_AI_API_KEY;
  __setTextSpendStore(null);
  __resetTextSpend();
});
test.afterAll(() => {
  __setTextSpendStore(null);
  __resetTextSpend();
});

const SCHEMA = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } as const;

/** The engine-door cassette with one scripted turn that reports `usd`. */
function costing(usd: number): Cassette {
  const base = loadCassette("engine-door");
  const ok = base.turns.find((t) => t.match?.heading === "# DOOR ok")!;
  return {
    ...base,
    turns: [{ ...ok, match: { heading: "# SPEND" }, envelope: { ...ok.envelope!, total_cost_usd: usd } }],
  };
}

function stubGoogle(): () => void {
  const real = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
  return () => void (globalThis.fetch = real);
}

test("card case 4: a vendor-reported turn books one row; an unpriced google turn books none and is counted", async () => {
  await withFakeEngine(costing(0.31), async () => {
    const out = await reason({ prompt: "# SPEND\n", turn: "edit-plan", schema: SCHEMA });
    expect(out.provenance.provider).toBe("claude-cli");
  });
  const rows = await textSpendRows();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ basis: "vendor", amount: 0.31, outcome: "served" });
  expect(rows[0]!.axes.turn).toBe("edit-plan");
  expect(rows[0]!.axes.provider).toBe("claude-cli");
  expect(rows[0]!.axes.model).toBeTruthy();
  expect((await textSpendByAxis()).byAxis.turn).toEqual({ "edit-plan": 0.31 });
  expect((await textSpendStats()).counters.unpriced).toBe(0);

  process.env.GOOGLE_AI_API_KEY = "probe-google-key-0123456789";
  const restore = stubGoogle();
  try {
    const out = await reason({ prompt: "x", turn: "edit-plan", schema: SCHEMA, avoid: "claude-cli" });
    expect(out.provenance.provider).toBe("google");
    expect(out.provenance.costBasis).toBe("unpriced");
  } finally {
    restore();
  }
  expect(await textSpendRows(), "an unpriced turn wrote a row").toHaveLength(1);
  expect((await textSpendStats()).counters.unpriced).toBe(1);
  expect((await textSpendStats()).counters.booked).toBe(1);
});

test("a served answer the schema check refuses still books the turn's vendor-reported cost", async () => {
  // `# DOOR prose`: the engine ran, reported total_cost_usd 0.0019, and answered
  // in prose where JSON was required. The turn is refused bad-response, and the
  // bill it ran up is a failed row, not a gap in the ledger.
  let refused: unknown;
  await withFakeEngine(loadCassette("engine-door"), async () => {
    refused = await reason({ prompt: "# DOOR prose\n", turn: "edit-plan", schema: SCHEMA }).catch((e: unknown) => e);
  });
  expect((refused as { kind?: string }).kind).toBe("bad-response");
  const rows = await textSpendRows();
  expect(rows, "a paid, refused answer booked no row").toHaveLength(1);
  expect(rows[0]).toMatchObject({ basis: "vendor", amount: 0.0019, outcome: "failed" });
  expect(rows[0]!.axes).toMatchObject({ turn: "edit-plan", provider: "claude-cli" });
  expect(rows[0]!.axes.model).not.toBe("unknown");
});

test("a failed turn that reached its engine with no cost is counted unpriced; one that never left is not", async () => {
  process.env.TEXT_ENV = "cloud";
  // No key: refused at the cheap gate, nothing was sent.
  await reason({ prompt: "x", turn: "edit-plan" }).catch(() => undefined);
  expect((await textSpendStats()).counters.unpriced, "a call that never left the machine was counted").toBe(0);

  process.env.GOOGLE_AI_API_KEY = "probe-google-key-0123456789";
  const real = globalThis.fetch;
  let status = 500;
  globalThis.fetch = (async () => new Response("{}", { status })) as typeof fetch;
  try {
    // A 500: the vendor answered, the turn stops there.
    await reason({ prompt: "x", turn: "edit-plan" }).catch(() => undefined);
    expect((await textSpendStats()).counters.unpriced, "a vendor 500 left no trace in the ledger").toBe(1);
    // A 429 walks to the bottom of a one-entry chain; the refusal there still reached Google.
    status = 429;
    await reason({ prompt: "x", turn: "edit-plan" }).catch(() => undefined);
    expect((await textSpendStats()).counters.unpriced, "a 429 at the ladder's bottom left no trace").toBe(2);
  } finally {
    globalThis.fetch = real;
  }
  expect(await textSpendRows(), "an unpriced failure wrote a $ row").toHaveLength(0);
});

test("a vendor answer whose body breaks mid-read is a dispatched failure, not 'could not be reached'", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('{"candidates":'));
          c.error(new TypeError("terminated"));
        },
      }),
      { status: 200 },
    )) as typeof fetch;
  try {
    const e = (await postJson("google", "https://vendor.invalid/x", { body: {}, timeoutMs: 30_000 }).catch((x: unknown) => x)) as TextError;
    expect(e).toBeInstanceOf(TextError);
    expect(e.message).not.toMatch(/could not be reached/);
    expect(e.dispatched, "an answered call was booked as never sent").toBe(true);
  } finally {
    globalThis.fetch = real;
  }
});

test("no refusal: far past any imaging-sized ceiling, the next text turn is still served", async () => {
  for (let i = 0; i < 500; i++)
    await bookServedTurn({ turn: "edit-plan", provider: "claude-cli", model: "m", costUsd: 1000, costBasis: "vendor-reported" });
  expect((await textSpendStats()).spent).toBe(500_000);
  expect((await textSpendStats()).counters.refusals).toBe(0);

  await withFakeEngine(costing(0.31), async () => {
    const out = await reason({ prompt: "# SPEND\n", turn: "edit-plan", schema: SCHEMA });
    expect(out.provenance.provider).toBe("claude-cli");
  });
  expect(await textSpendRows()).toHaveLength(501);

  // And the code says so: nothing under lib/text calls reserve().
  const dir = path.join(process.cwd(), "lib", "text");
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : [],
    );
  for (const f of walk(dir)) expect(readFileSync(f, "utf8").replace(/\/\/.*$/gm, ""), f).not.toMatch(/\breserve\s*\(/);
});

test("the class is count-only in its shape: no ceiling var, and reserve() is a loud error", async () => {
  const def = SPEND_CLASSES["text-usd"];
  expect(def.countOnly).toBe(true);
  expect(def).not.toHaveProperty("ceilingVar");
  expect(def).not.toHaveProperty("defaultCeiling");
  const m = createMeter(def, { entry: (e: { usd: number }) => ({ amount: e.usd, outcome: "served", basis: "vendor", axes: {} }) });
  expect(() => (m as unknown as { reserve(n: number): unknown }).reserve(0)).toThrow(/count-only/);
  expect(await m.stats()).not.toHaveProperty("ceiling");
});

test("a booking failure does not fail the turn", async () => {
  __setTextSpendStore({
    kind: "memory",
    transact: () => {
      throw new Error("store down");
    },
    reset: () => {},
  });
  await withFakeEngine(costing(0.31), async () => {
    const out = await reason({ prompt: "# SPEND\n", turn: "edit-plan", schema: SCHEMA });
    expect(out.provenance.costUsd).toBe(0.31);
    expect(out.json).toEqual({ ok: true });
  });
});
