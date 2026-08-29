// LANE — THE TEXT ENGINE'S LOG LINE (dynamic).
//
// The imaging and music engines each have one of these; the text engine did not,
// which is how its scrubber came to hold a credential list two entries shorter
// than the one the spawn door strips.
//
// WHAT THE LINE IS FOR. lib/text/log.ts prints one line per reasoning turn — the
// only standing record of which engine served, at what rung, after which descent,
// and for how much. It is also the surface most likely to leak, because it is the
// one place a vendor's own error text is spliced into something we print.
//
// The second test is source-coupled and says why: the scrubber's list of
// credential-shaped environment variables must match lib/claudeCli.ts's
// METERED_AUTH_VARS, and no reference search can express that — the constant is
// module-private in the transport and duplicated here deliberately, because the
// log importing the spawn door would be the wrong dependency direction. Same
// shape and same reasoning as harness-gate.probe.spec.ts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { formatTurn, scrub } from "@/lib/text/log";

import { keepEnv } from "./_helpers";

const GOOGLE_KEY = "AIzaSyFAKEfakeFAKEfake0123456789abcd";
const ANTHROPIC_KEY = "sk-ant-api03-FAKEfakeFAKEfake0123456789";

keepEnv([
  "GOOGLE_AI_API_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_CUSTOM_HEADERS",
]);

const base = { turn: "edit-plan" as const, env: "local", ms: 4200, promptChars: 1180 };

/* ── the line ─────────────────────────────────────────────────────────────── */

test("log: a served turn names the engine, the rung and the cost basis", () => {
  const line = formatTurn({ ...base, provider: "claude-cli", model: "claude-opus-5", rung: "preferred" });
  console.log(`[text-log] ok -> ${line}`);
  expect(line).toContain("provider=claude-cli");
  expect(line).toContain("rung=preferred");
  // An unpriced turn is UNPRICED, not free. A missing number must never print
  // as a zero — that is the difference between "we do not know" and "it cost
  // nothing", and only one of them is true.
  expect(line).toContain("cost=unpriced");
  expect(line).not.toContain("cost=$0.0000");
});

test("log: a DESCENT is on the line, with the reason each candidate dropped out", () => {
  const line = formatTurn({
    ...base,
    provider: "google",
    model: "gemini-3.1-pro-preview",
    rung: "alternate",
    tried: [{ provider: "claude-cli", why: "not-logged-in" }],
  });
  console.log(`[text-log] descent -> ${line}`);
  // On a success the trail IS the descent — someone was tried and lost — so it
  // reads `rerouted`, not `tried`. A fleet quietly living on rung 2 is
  // diagnosable from this word alone.
  expect(line).toContain("rerouted=claude-cli:not-logged-in");
  expect(line).toContain("rung=alternate");
});

test("log: a failed turn prints its kind and never a cost", () => {
  const line = formatTurn({ ...base, kind: "no-key", provider: "google", message: "No API key for google." });
  console.log(`[text-log] err -> ${line}`);
  expect(line).toContain("kind=no-key");
  expect(line).not.toContain("cost=");
});

/* ── the scrubber ─────────────────────────────────────────────────────────── */

test("scrub: a live key is removed BY VALUE, wherever it appears", () => {
  process.env.GOOGLE_AI_API_KEY = GOOGLE_KEY;
  // By value rather than by field name: a leak is caught even when the vendor
  // splices it into prose we never shaped.
  const out = scrub(`the upstream said: request to ...?key=${GOOGLE_KEY} was rejected`);
  console.log(`[text-log] scrubbed -> ${out}`);
  expect(out).not.toContain(GOOGLE_KEY);
  expect(out).toContain("[redacted]");
});

test("scrub: Bearer tokens, URL credentials and key=value pairs all go", () => {
  expect(scrub("Authorization: Bearer abc.def-123")).not.toContain("abc.def-123");
  expect(scrub("https://user:hunter2@example.com/x")).not.toContain("hunter2");
  expect(scrub('{"api_key":"zzzzzzzzzzzz"}')).not.toContain("zzzzzzzzzzzz");
  // Order matters: Bearer first, or the key/value rule masks the word "Bearer"
  // and leaves the token standing after it.
  expect(scrub("Bearer sk-live-9999999999")).toContain("Bearer [redacted]");
});

test("scrub: every credential the SPAWN DOOR strips is also removed from a log line", () => {
  // The regression this file exists for. ANTHROPIC_CUSTOM_HEADERS is the one
  // that matters: lib/claudeCli.ts strips it from the child precisely because it
  // can carry an authorization header, so a value this process is careful not to
  // hand a subprocess must not be printed either.
  const values: Record<string, string> = {
    ANTHROPIC_API_KEY: ANTHROPIC_KEY,
    ANTHROPIC_AUTH_TOKEN: "at-FAKEfake0123456789abcdef",
    ANTHROPIC_BASE_URL: "https://proxy.internal.example/v1/FAKEtoken0123456789",
    ANTHROPIC_CUSTOM_HEADERS: "X-Api-Key: FAKEheaderVALUE0123456789",
  };
  for (const [name, value] of Object.entries(values)) process.env[name] = value;

  for (const [name, value] of Object.entries(values)) {
    const out = scrub(`the engine reported: ${value} (from ${name})`);
    expect(out, `${name} survived the scrub`).not.toContain(value);
  }
  console.log(`[text-log] ${Object.keys(values).length} spawn-door credentials scrubbed`);
});

test("scrub: the list here matches lib/claudeCli.ts's METERED_AUTH_VARS", () => {
  // Source-coupled because it must be: METERED_AUTH_VARS is module-private in
  // the transport, and the log importing the spawn door would be the wrong
  // dependency direction. So the coupling is checked rather than referenced —
  // the same trade harness-gate.probe.spec.ts makes for a build-time gate.
  const root = resolve(__dirname, "../..");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const listOf = (rel: string, name: string): string[] => {
    const src = strip(readFileSync(resolve(root, rel), "utf8"));
    const m = new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`).exec(src);
    expect(m, `${name} not found in ${rel} — this check is reading the wrong thing`).not.toBeNull();
    return [...m![1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]).sort();
  };

  const spawnDoor = listOf("lib/claudeCli.ts", "METERED_AUTH_VARS");
  const logDoor = listOf("lib/text/log.ts", "METERED_AUTH_ENV");
  console.log(`[text-log] spawn door strips ${spawnDoor.length}, log scrubs ${logDoor.length}`);

  // Assert the instrument before the result: a regex that matched nothing would
  // report two empty lists as equal.
  expect(spawnDoor.length, "the spawn door's list came back empty").toBeGreaterThan(2);
  expect(logDoor, "the log scrubs a different set of credentials than the spawn door strips").toEqual(spawnDoor);
});
