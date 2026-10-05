// LANE — THE SPAWN DOOR AND THE LADDER, WITH SOMETHING ON THE OTHER SIDE (dynamic, CIP-A).
//
// cli-transport-resilience drives lib/claudeCli.ts with nothing on PATH, and
// text-ladder drives lib/text/router.ts with spawning forbidden. Neither could
// see a turn SUCCEED, so three things were asserted only in prose:
//   · the seat-only strip — four metered variables removed at the door — had
//     never been observed from a real child;
//   · the envelope contract (is_error / subtype / result / total_cost_usd /
//     session_id) had never been parsed from anything the CLI's shape produces;
//   · the ladder's success labelling — rung, `schemaEnforcement: "prompted"`,
//     `reroutedFrom` — had no case at all ("closing that needs an injection
//     point in production code"). A binary on PATH needs none.
//
// `withFakeEngine` (./_helpers.ts) puts tests/_engine/fake-claude.mjs first on
// PATH and refuses to run anything unless `claude --version` answers as the
// stand-in, so no case here can reach a real, spending engine. Google is a
// stubbed `fetch` that counts its calls.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { CliError, runClaude } from "@/lib/claudeCli";
import { TextError } from "@/lib/text/errors";
import { reason } from "@/lib/text/router";

import {
  CASSETTE_DIR,
  FAKE_ENGINE_ENV,
  cassetteStaleness,
  keepEnv,
  loadCassette,
  withFakeEngine,
} from "./_helpers";

const METERED = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_CUSTOM_HEADERS"];

keepEnv([...FAKE_ENGINE_ENV, ...METERED, "TEXT_ENV", "LOCAL_BINARIES", "GOOGLE_AI_API_KEY", "LIGHTTRACK_DISABLE"]);

test.beforeEach(() => {
  process.env.TEXT_ENV = "local";
  process.env.LOCAL_BINARIES = "on";
  process.env.LIGHTTRACK_DISABLE = "1";
  delete process.env.GOOGLE_AI_API_KEY;
});

const OK_SCHEMA = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
} as const;

/** A `fetch` that answers like Google's generateContent and counts the calls,
 *  restored by the caller's `finally`. */
function stubGoogle(): { calls: () => number; restore: () => void } {
  const real = globalThis.fetch;
  let n = 0;
  globalThis.fetch = (async () => {
    n++;
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  return { calls: () => n, restore: () => void (globalThis.fetch = real) };
}

/* ── the door ─────────────────────────────────────────────────────────────── */

test("door: the envelope is parsed into text, cost and session", async () => {
  const c = loadCassette("engine-door");
  await withFakeEngine(c, async (engine) => {
    const run = await runClaude("# DOOR ok\n\nanswer\n");
    expect(JSON.parse(run.text)).toEqual({ ok: true });
    expect(run.costUsd).toBe(c.turns[0]!.envelope!.total_cost_usd);
    expect(run.sessionId).toBe(c.turns[0]!.envelope!.session_id);
    expect(run.durationMs).toBe(c.turns[0]!.envelope!.duration_ms);
    expect(engine.turns()).toHaveLength(1);
  });
});

test("door: a metered key in the parent never reaches the child", async () => {
  for (const v of METERED) process.env[v] = `probe-${v.toLowerCase()}-0123456789`;
  await withFakeEngine("engine-door", async (engine) => {
    await runClaude("# DOOR ok\n");
    const [turn] = engine.turns();
    console.log(`[door] child saw ${turn!.envKeys.length} variable name(s)`);
    // A positive control first: the list is real and carries what the parent set.
    expect(turn!.envKeys).toContain("FAKE_CLAUDE_LOG");
    for (const v of METERED) expect(turn!.envKeys, `${v} crossed the spawn door`).not.toContain(v);
    // The probe's own spawn goes through the same strip.
    for (const call of engine.calls().filter((x) => x.kind === "version"))
      for (const v of METERED) expect(call.envKeys, `${v} reached --version`).not.toContain(v);
  });
});

test("door: each failure mode lands on its own CliError kind", async () => {
  const cases: [string, CliError["kind"], RegExp][] = [
    ["# DOOR is_error", "failed", /stopped before it produced an answer/],
    ["# DOOR not-json", "failed", /not JSON/],
    ["# DOOR login", "not-logged-in", /not logged in/],
    ["# DOOR exit", "failed", /exited 2\..*unknown option '--effort'/],
  ];
  await withFakeEngine("engine-door", async () => {
    for (const [heading, kind, message] of cases) {
      const err = await runClaude(`${heading}\n`).then(
        () => null,
        (e: unknown) => e,
      );
      console.log(`[door] ${heading} -> ${err instanceof CliError ? `${err.kind}: ${err.message}` : String(err)}`);
      expect(err instanceof CliError, `${heading} resolved`).toBe(true);
      expect((err as CliError).kind, heading).toBe(kind);
      expect((err as CliError).message, heading).toMatch(message);
    }
  });
});

test("door: a prompt no cassette turn answers is a loud 're-record', never a pass", async () => {
  await withFakeEngine("engine-door", async (engine) => {
    const err = await runClaude("# NOT A TURN THE CASSETTE KNOWS\n").then(
      () => null,
      (e: unknown) => e,
    );
    expect((err as CliError)?.kind).toBe("failed");
    expect((err as CliError).message).toMatch(/re-record/);
    expect(engine.turns()[0]!.turn).toBeNull();
  });
});

/* ── the ladder ───────────────────────────────────────────────────────────── */

test("ladder: a served local turn is labelled preferred, prompted, and not rerouted", async () => {
  await withFakeEngine("engine-door", async () => {
    const out = await reason({ prompt: "# DOOR ok\n", turn: "edit-plan", schema: OK_SCHEMA });
    const p = out.provenance;
    console.log(`[ladder] served ${p.provider} rung=${p.rung} schema=${p.schemaEnforcement} cost=${p.costUsd}`);
    expect(p.provider).toBe("claude-cli");
    expect(p.rung).toBe("preferred");
    expect(p.transport).toBe("local-subprocess");
    expect(p.schemaEnforcement).toBe("prompted");
    expect(p.reroutedFrom).toBeUndefined();
    expect(p.costUsd).toBe(0.0021);
    expect(out.json).toEqual({ ok: true });
  });
});

test("ladder: an engine that answered badly is NOT descended from, even with a cloud key", async () => {
  process.env.GOOGLE_AI_API_KEY = "probe-google-key-0123456789";
  const google = stubGoogle();
  try {
    await withFakeEngine("engine-door", async () => {
      for (const [heading, kind] of [
        ["# DOOR is_error", "failed"],
        ["# DOOR prose", "bad-response"],
      ] as const) {
        const err = await reason({ prompt: `${heading}\n`, turn: "edit-plan", schema: OK_SCHEMA }).then(
          () => null,
          (e: unknown) => e,
        );
        console.log(`[ladder] ${heading} -> ${err instanceof TextError ? err.kind : String(err)}`);
        expect(err instanceof TextError, heading).toBe(true);
        expect((err as TextError).kind, heading).toBe(kind);
        expect((err as TextError).provider, heading).toBe("claude-cli");
      }
    });
    expect(google.calls(), "a dispatched-and-failed turn was re-sent to the metered rung").toBe(0);
  } finally {
    google.restore();
  }
});

test("ladder: with no `claude` on PATH the cloud serves, and the receipt names the rung it skipped", async () => {
  process.env.GOOGLE_AI_API_KEY = "probe-google-key-0123456789";
  const google = stubGoogle();
  const saved = process.env.PATH;
  try {
    // Nothing on PATH, the same shape cli-transport-resilience uses: the shell
    // starts and `claude` resolves to nothing.
    process.env.PATH = "";
    const out = await reason({ prompt: "# DOOR ok\n", turn: "edit-plan", schema: OK_SCHEMA });
    const p = out.provenance;
    console.log(`[ladder] no claude -> ${p.provider} rung=${p.rung} reroutedFrom=${JSON.stringify(p.reroutedFrom)}`);
    expect(p.provider).toBe("google");
    expect(p.rung).toBe("alternate");
    expect(p.reroutedFrom).toEqual([{ provider: "claude-cli", why: "not-installed" }]);
    expect(google.calls()).toBe(1);
  } finally {
    process.env.PATH = saved;
    google.restore();
  }
});

/* ── the cassettes themselves ─────────────────────────────────────────────── */

test("cassettes: a fingerprint that no longer matches cliArgs(), or an old recording, refuses with 're-record'", async () => {
  const base = loadCassette("engine-door");
  let ran = 0;
  for (const stale of [
    { ...base, cliArgsFingerprint: "0000000000000000" },
    { ...base, recordedAt: "2020-01-01" },
  ]) {
    const err = await withFakeEngine(stale, async () => {
      ran++;
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(String(err)).toMatch(/re-record/);
  }
  expect(ran, "a stale cassette was played").toBe(0);
});

test("cassettes: every committed cassette is fresh and carries no prompt text", () => {
  const files = readdirSync(CASSETTE_DIR).filter((f) => f.endsWith(".json"));
  expect(files.length, "the cassette walk found nothing - it is reading the wrong tree").toBeGreaterThanOrEqual(3);

  // What a leaked prompt would contain: the run's own scaffold, and the opening
  // of every prompt document the routes read.
  const promptDir = join(process.cwd(), "pipeline");
  const docs = readdirSync(promptDir).filter((f) => /-PROMPT\.md$/.test(f));
  expect(docs.length).toBeGreaterThan(0);
  const needles = ["# THE RUN", "## NOTEBOOK", "## CURRENT RENDERS", "## NOTES"];
  for (const d of docs) {
    const body = readFileSync(join(promptDir, d), "utf8");
    const line = body.split(/\r?\n/).find((l) => l.trim().length > 40);
    if (line) needles.push(line.trim());
  }

  for (const f of files) {
    const raw = readFileSync(join(CASSETTE_DIR, f), "utf8");
    const c = loadCassette(f.replace(/\.json$/, ""));
    expect(cassetteStaleness(c), f).toBeNull();
    for (const n of needles) expect(raw.includes(n), `${f} holds prompt text: ${n.slice(0, 60)}`).toBe(false);
    for (const [i, t] of c.turns.entries()) {
      // Only a hash and a length, or nothing (a hand-written turn has no prompt).
      if (t.prompt === null) continue;
      expect(Object.keys(t.prompt).sort(), `${f} turn ${i}`).toEqual(["chars", "sha256"]);
      expect(t.prompt.sha256, `${f} turn ${i}`).toMatch(/^[0-9a-f]{64}$/);
    }
  }
});
