// LANE — /api/frames END TO END, THROUGH THE REAL SPAWN DOOR (dynamic, CIP-A).
//
// Step 3's direction pass is the second-dearest turn in the app, and until this
// file `npm test` had only ever seen it refuse: frames-run-bounded proves the
// count and material 413s and the 401 in front of them, and nothing else. A
// served direction — the receipt, the cost the envelope reported, the `raw` the
// client parses — had never run outside a live session that spends. Neither had
// three of the route's own refusals (unreadable body, no beats, no style), nor
// the second 413 that measures the ASSEMBLED prompt rather than the caller's
// material, nor the way an engine failure maps to a status.
//
// Nothing is mocked inside the app. `withFakeEngine` puts a stand-in `claude`
// first on PATH (tests/_engine/fake-claude.mjs); the route builds its real
// prompt from pipeline/FRAMES-SCENE-PROMPT.md, lib/text/router.ts walks its
// real ladder, lib/claudeCli.ts spawns "claude" through its real shell setting,
// and the stand-in answers from a hand-written cassette. Google, where a case
// needs it, is a stubbed `fetch` that counts its calls.
//
// Every refusal is asserted with the stand-in ON PATH and a body that would
// otherwise be served, so "nothing was spawned" is a measurement of the side
// log, not an inference from how fast the answer came back.
//
// WHAT THESE CASES PIN IS BEHAVIOUR — status, body fields, spawn or no spawn.
// The route's prompt assembly is due to move into a pure assembler (AIO-B) and
// its dispatch onto a server turn ledger (AIO-A); neither should have to touch
// this file unless the route's answer changes.
//
// The cassettes are keyed by the sha256 of the prompt's first heading, not the
// heading itself: that line is the opening of FRAMES-SCENE-PROMPT.md, and the
// cassette-content probe (engine-door) refuses any cassette that carries a
// prompt document's text. The route hands the router no schema (it owns the
// parse of `raw`), so the turn's schema marker is null, and the cassette says so.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { POST } from "@/app/api/frames/route";
import { SCENE_SCHEMA } from "@/app/_phases/frames/sceneSpec";
import { __resetRateLimit, ACCESS_SECRET_VAR } from "@/lib/apiAuth";

import { markerOf, sha256 } from "../_engine/marker.mjs";

import { FAKE_ENGINE_ENV, keepEnv, loadCassette, withFakeEngine } from "./_helpers";

keepEnv([
  ...FAKE_ENGINE_ENV,
  ACCESS_SECRET_VAR,
  "TEXT_ENV",
  "LOCAL_BINARIES",
  "GOOGLE_AI_API_KEY",
  "NEXT_PUBLIC_DEV_AUTH",
  "LIGHTTRACK_DISABLE",
]);

test.beforeEach(() => {
  __resetRateLimit();
  process.env.NEXT_PUBLIC_DEV_AUTH = "1";
  delete process.env[ACCESS_SECRET_VAR];
  process.env.TEXT_ENV = "local";
  process.env.LOCAL_BINARIES = "on";
  // No cloud key unless a case adds one: a failed local rung has nowhere metered to go.
  delete process.env.GOOGLE_AI_API_KEY;
  process.env.LIGHTTRACK_DISABLE = "1";
});

const BEATS = [
  { at: "0:00", kind: "hook", text: "Bitcoin's four-year cycle broke the week the ETFs opened." },
  { at: "0:12", kind: "movement", text: "Inflows, not halvings, set the price for eighteen months." },
  { at: "0:31", kind: "claim", text: "The next drawdown is a liquidity event, not a miner event." },
];
const FACTS = [
  { id: "f-etf-inflows", claim: "Spot ETF net inflows over the first eighteen months." },
  { id: "f-halving-2024", claim: "The 2024 halving cut issuance to 3.125 BTC per block." },
];
const STYLE = { technique: "layered paper collage", palette: ["#0e1116", "#e8d9b0"], grain: "light" };
const RUN = { title: "The cycle that broke", schema: SCENE_SCHEMA, beats: BEATS, facts: FACTS, style: STYLE };

let ip = 0;
async function frames(
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await POST(
    new Request("http://localhost/api/frames", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.78.0.${++ip}`, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

/** A `fetch` that answers like Google's generateContent and counts the calls,
 *  restored by the caller's `finally`. */
function stubGoogle(text: string): { calls: () => number; restore: () => void } {
  const real = globalThis.fetch;
  let n = 0;
  globalThis.fetch = (async () => {
    n++;
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 4100, candidatesTokenCount: 380 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  return { calls: () => n, restore: () => void (globalThis.fetch = real) };
}

/* ── the cassettes against the route ──────────────────────────────────────── */

test("frames e2e: the cassettes are keyed to the prompt the route reads, by hash, with no schema marker", () => {
  // If the prompt document's heading moves, the stand-in refuses with
  // "re-record"; this names the cause first instead of a 502 below.
  const live = markerOf(readFileSync(join(process.cwd(), "pipeline", "FRAMES-SCENE-PROMPT.md"), "utf8"));
  expect(live.heading, "FRAMES-SCENE-PROMPT.md has no `# ` heading to key a cassette by").not.toBeNull();
  for (const name of ["frames-ok", "frames-is-error"]) {
    const m = loadCassette(name).turns[0]!.match!;
    expect(m.headingSha256, `${name} was keyed to an older FRAMES-SCENE-PROMPT.md heading - re-record`).toBe(
      sha256(live.heading!),
    );
    expect(m.heading, `${name} must not carry the heading text itself`).toBeUndefined();
    expect(m.schemaSha256, `${name}: the route hands the router no schema`).toBeNull();
  }
});

test("frames e2e: a heading hash that does not match is a loud 're-record', never a served turn", async () => {
  // The stand-in's selection by hash is what every success below rests on: a
  // match field it ignored would serve any prompt at all.
  const c = loadCassette("frames-ok");
  const wrong = { ...c, turns: [{ ...c.turns[0]!, match: { headingSha256: sha256("# some other prompt"), schemaSha256: null } }] };
  await withFakeEngine(wrong, async (engine) => {
    const { status, json } = await frames(RUN);
    console.log(`[frames] wrong heading hash -> ${status} ${String(json.detail).slice(0, 120)}`);
    expect(status).toBe(502);
    expect(String(json.detail)).toMatch(/re-record/);
    expect(json.raw).toBeUndefined();
    expect(engine.turns()).toHaveLength(1);
    expect(engine.turns()[0]!.turn, "a turn was served although its marker did not match").toBeNull();
  });
});

/* ── served ───────────────────────────────────────────────────────────────── */

test("frames e2e: a served direction is a 200 with `raw` and the receipt the envelope paid for", async () => {
  const cassette = loadCassette("frames-ok");
  const turn = cassette.turns[0]!;
  await withFakeEngine(cassette, async (engine) => {
    const { status, json } = await frames(RUN);
    const e = json.engine as Record<string, unknown>;
    console.log(`[frames] ok -> ${status} kind=${e?.kind} rung=${e?.rung} cost=${e?.costUsd} raw=${String(json.raw).length}ch`);
    expect(status, String(json.detail)).toBe(200);

    // `raw` is the engine's text, untouched: the client owns the parse.
    expect(typeof json.raw).toBe("string");
    expect(JSON.parse(json.raw as string)).toEqual(turn.resultJson);

    // The receipt. Frames names the transport through `kind`, derived from it.
    expect(e.kind).toBe("local-claude-code");
    expect(e.provider).toBe("claude-cli");
    expect(typeof e.model === "string" && e.model.length > 0, "the receipt names no model").toBe(true);
    expect(e.rung).toBe("preferred");
    expect(e.sessionId).toBe(turn.envelope!.session_id);
    expect(e.costUsd).toBe(turn.envelope!.total_cost_usd);
    expect(e.costBasis).toBe("vendor-reported");
    expect(e.durationMs).toBe(turn.envelope!.duration_ms);
    expect(e.reroutedFrom).toBeUndefined();

    const turns = engine.turns();
    expect(turns, "one prompt reached the engine").toHaveLength(1);
    expect(turns[0]!.turn, "the cassette turn was selected by its marker").toBe(0);
    expect(turns[0]!.schemaSha256, "the router appended a schema the route did not hand it").toBeNull();
    // The whole run went down stdin: the script, the notebook and the style.
    const material = JSON.stringify(BEATS).length + JSON.stringify(FACTS).length + JSON.stringify(STYLE).length;
    expect(turns[0]!.promptChars!).toBeGreaterThan(material);
  });
});

test("frames e2e: with no `claude` on PATH the cloud serves, and the receipt says so", async () => {
  process.env.GOOGLE_AI_API_KEY = "probe-google-key-0123456789";
  const raw = JSON.stringify({ scenes: [] });
  const google = stubGoogle(raw);
  const saved = process.env.PATH;
  try {
    process.env.PATH = "";
    const { status, json } = await frames(RUN);
    const e = json.engine as Record<string, unknown>;
    console.log(`[frames] no claude -> ${status} kind=${e?.kind} rung=${e?.rung} reroutedFrom=${JSON.stringify(e?.reroutedFrom)}`);
    expect(status, String(json.detail)).toBe(200);
    expect(json.raw).toBe(raw);
    // A prompt that crossed the network must never render like a local one.
    expect(e.kind).toBe("cloud-api");
    expect(e.provider).toBe("google");
    expect(e.rung).toBe("alternate");
    expect(e.reroutedFrom).toEqual([{ provider: "claude-cli", why: "not-installed" }]);
    expect(google.calls()).toBe(1);
  } finally {
    process.env.PATH = saved;
    google.restore();
  }
});

/* ── engine failures ──────────────────────────────────────────────────────── */

test("frames e2e: an `is_error` envelope is a 502 with its code, and the cloud rung is not tried", async () => {
  process.env.GOOGLE_AI_API_KEY = "probe-google-key-0123456789";
  const google = stubGoogle(JSON.stringify({ scenes: [] }));
  try {
    await withFakeEngine("frames-is-error", async (engine) => {
      const { status, json } = await frames(RUN);
      console.log(`[frames] is_error -> ${status} ${json.code} ${String(json.detail).slice(0, 120)}`);
      expect(status).toBe(502);
      expect(json.code).toBe("failed");
      expect(String(json.detail)).toMatch(/Nothing was changed\.$/);
      expect(json.raw).toBeUndefined();
      expect(json.engine).toBeUndefined();
      expect(engine.turns(), "the dispatched turn was retried locally").toHaveLength(1);
    });
    expect(google.calls(), "a dispatched-and-failed turn was re-sent to the metered rung").toBe(0);
  } finally {
    google.restore();
  }
});

test("frames e2e: no engine anywhere is a 503 naming the availability kind, and nothing is dispatched", async () => {
  const saved = process.env.PATH;
  try {
    process.env.PATH = "";
    const { status, json } = await frames(RUN);
    console.log(`[frames] no engine -> ${status} ${json.code} ${String(json.detail).slice(0, 120)}`);
    expect(status).toBe(503);
    expect(json.code).toBe("not-installed");
    expect(String(json.detail)).toMatch(/Nothing was changed\.$/);
    expect(json.raw).toBeUndefined();
  } finally {
    process.env.PATH = saved;
  }
});

/* ── refusals before any spawn ────────────────────────────────────────────── */

test("frames e2e: the access gate refuses before anything is spawned", async () => {
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  await withFakeEngine("frames-ok", async (engine) => {
    // Unconfigured: the gate fails closed.
    const closed = await frames(RUN);
    expect(closed.status).toBe(401);
    expect(closed.json.code).toBe("unauthorized");

    // Configured, and nothing presented.
    process.env[ACCESS_SECRET_VAR] = "probe-frames-secret";
    const anonymous = await frames(RUN);
    expect(anonymous.status).toBe(401);
    expect(engine.turns(), "an unauthenticated caller reached the engine").toHaveLength(0);

    // The control: the same body, with the secret, is served — so the two
    // refusals above were the gate's and not the body's.
    const authed = await frames(RUN, { authorization: "Bearer probe-frames-secret" });
    console.log(`[frames] gate -> ${closed.status}/${anonymous.status}, authed ${authed.status}`);
    expect(authed.status, String(authed.json.detail)).toBe(200);
    expect(engine.turns()).toHaveLength(1);
  });
});

test("frames e2e: an oversized run is a 413 and the stand-in's side log stays empty", async () => {
  await withFakeEngine("frames-ok", async (engine) => {
    const beats = Array.from({ length: 401 }, (_, i) => ({ at: `${Math.floor(i / 60)}:${String(i % 60).padStart(2, "0")}`, text: `beat ${i}` }));
    const { status, json } = await frames({ ...RUN, beats });
    console.log(`[frames] 401 beats -> ${status} ${json.code}`);
    expect(status).toBe(413);
    expect(json.code).toBe("too-large");
    expect(engine.turns(), "an oversized run reached the engine").toHaveLength(0);
  });
});

test("frames e2e: a run under the material ceiling whose ASSEMBLED prompt is over it is a 413, unspawned", async () => {
  // The second ceiling. The caller's material is measured compact; the prompt
  // pretty-prints it, and carries the system prompt and the format brief on
  // top. A deeply nested beat is small on the wire and large on stdin.
  const body = { ...RUN, beats: [{ at: "0:00", text: "one", marks: Array.from({ length: 200_000 }, () => 0) }] };
  expect(JSON.stringify(body).length, "the fixture no longer slips under the material ceiling").toBeLessThan(1_000_000);
  await withFakeEngine("frames-ok", async (engine) => {
    const { status, json } = await frames(body);
    console.log(`[frames] assembled -> ${status} ${String(json.detail).slice(0, 120)}`);
    expect(status).toBe(413);
    expect(json.code).toBe("too-large");
    expect(String(json.detail)).toMatch(/assembled run/);
    expect(String(json.detail)).toMatch(/Nothing was dispatched/);
    expect(engine.turns(), "an oversized assembled prompt reached the engine").toHaveLength(0);
  });
});

test("frames e2e: an unreadable body, no beats, or no style is a 400 naming what is missing, unspawned", async () => {
  await withFakeEngine("frames-ok", async (engine) => {
    const cases: [string, unknown, RegExp][] = [
      ["not json", "{beats:", /not valid JSON/],
      ["no beats", { ...RUN, beats: [] }, /No beats were sent/],
      ["beats not a list", { ...RUN, beats: "0:00 hook" }, /No beats were sent/],
      ["no style", { ...RUN, style: undefined }, /No visual style was sent/],
    ];
    for (const [label, body, detail] of cases) {
      const { status, json } = await frames(body);
      console.log(`[frames] ${label} -> ${status} ${String(json.detail).slice(0, 80)}`);
      expect(status, label).toBe(400);
      expect(String(json.detail), label).toMatch(detail);
    }
    expect(engine.turns(), "a malformed run reached the engine").toHaveLength(0);
  });
});
