// LANE — THE MUSIC SETTLE LINE IS ASSERTED (dynamic).
//
// `grep -n "console\.\|log(" lib/music/** app/api/music/**` used to return
// NOTHING. Four routes that spend the operator's balance, a vendor that can
// refuse, throttle, time out or hand back bytes that are not audio, and no
// artefact anywhere that answers "it stopped working". Imaging had one line per
// call and a comment promising it was testable; music had neither.
//
// This probe drives the ACTUAL `formatCall` and `scrub` from lib/music/log.ts
// and pins the promises its audit header makes:
//
//   · SHAPE — an `ok` line and an `err` line are distinguishable, and the error
//     line carries no `cost=` at all (a failed call produced no priced outcome,
//     and printing one for it would be the lie below);
//   · A MISSING NUMBER IS NEVER A ZERO, AND `free` IS NOT `unpriced` — an
//     unmeasured rate prints `cost=unpriced`, a DECLARED zero prints
//     `cost=free`, and neither ever prints `$0.0000`. One is an absence, the
//     other is a fact with a source; collapsing them is how a ceiling stops
//     seeing spend;
//   · THE SECONDS ARE ALWAYS THERE — they are the one exact quantity in
//     pricing.ts's unit chain, so `sec=` is on every line, priced or not;
//   · NO CREDENTIAL, NO SECOND LINE — a live key value, a Bearer token and URL
//     userinfo are masked wherever they appear, and a message with newlines or
//     5,000 characters still yields exactly one bounded line.
import { test, expect } from "@playwright/test";

import { formatCall, scrub, type MusicCallLog } from "@/lib/music/log";
import { MUSIC_KEY_VAR } from "@/lib/music/elevenlabs";

/** Long enough to clear log.ts's 8-character placeholder floor, so the scrubber
 *  treats it as a live secret rather than ignoring it. */
const FAKE_KEY = "sk_elevenlabs_FAKEfake0123456789abcdef";

const base: MusicCallLog = { op: "generate", ms: 41_200, seconds: 13 };

test.beforeEach(() => {
  delete process.env[MUSIC_KEY_VAR];
});
test.afterEach(() => {
  delete process.env[MUSIC_KEY_VAR];
});

test("log: a served call prints ok, its model, its duration and its seconds", () => {
  const line = formatCall({ ...base, model: "music_v2", basis: "unpriced" });
  console.log(`[music-log] ok line -> ${line}`);
  expect(line.startsWith("[music] generate ok ")).toBe(true);
  expect(line).toContain("model=music_v2");
  expect(line).toContain("ms=41200");
  expect(line).toContain("sec=13");
  expect(line).not.toContain("kind=");
});

test("log: an UNPRICED success says `unpriced` — never $0.0000", () => {
  const line = formatCall({ ...base, model: "music_v2", basis: "unpriced" });
  console.log(`[music-log] unpriced -> ${line}`);
  expect(line).toContain("cost=unpriced");
  // This is the whole point of the music table today: ElevenLabs bills in
  // credits, nobody here has measured the rate, and a formatter that coalesced
  // the missing number to zero would report every render in the product as free.
  expect(line).not.toContain("$0.0000");
});

test("log: a DECLARED-free call says `free`, which is a different claim", () => {
  const line = formatCall({ ...base, op: "plan", seconds: 0, model: "music_v2", basis: "free" });
  console.log(`[music-log] free -> ${line}`);
  expect(line).toContain("cost=free");
  // `free` is a fact with a source (the plan endpoint costs no credits);
  // `unpriced` is the absence of one. They must never print the same.
  expect(line).not.toContain("unpriced");
  expect(line).toContain("sec=0");
});

test("log: credits print AS CREDITS — a unit is not silently converted to dollars", () => {
  const line = formatCall({ ...base, model: "music_v2", basis: "estimated", credits: 26 });
  console.log(`[music-log] credits -> ${line}`);
  expect(line).toContain("cost=26cr");
  expect(line).not.toContain("$");
});

test("log: a USD figure prints as money only when one actually exists", () => {
  const line = formatCall({ ...base, model: "music_v2", basis: "estimated", credits: 26, usd: 0.052 });
  console.log(`[music-log] usd -> ${line}`);
  expect(line).toContain("cost=$0.0520");
});

test("log: a failed call prints its kind and NO cost field at all", () => {
  const line = formatCall({
    ...base,
    ms: 820,
    kind: "refused",
    message: "The model declined this brief: blocked by our moderation system.",
  });
  console.log(`[music-log] err -> ${line}`);
  expect(line.startsWith("[music] generate err ")).toBe(true);
  expect(line).toContain("kind=refused");
  // Not cost=unpriced and not cost=$0.0000 — no cost claim is made at all,
  // because the call produced no priced outcome to claim anything about.
  expect(line).not.toContain("cost=");
  // The seconds survive: what was ASKED FOR is known even when nothing came back.
  expect(line).toContain("sec=13");
});

test("log: the budget's own refusal kind is loggable like any other", () => {
  const line = formatCall({ ...base, kind: "over-budget", ms: 0 });
  console.log(`[music-log] over-budget -> ${line}`);
  expect(line).toContain("kind=over-budget");
});

test("log: a LIVE key value is masked wherever the vendor echoed it back", () => {
  process.env[MUSIC_KEY_VAR] = FAKE_KEY;
  const line = formatCall({
    ...base,
    kind: "failed",
    // The shape elevenlabs.ts's vendorFailure actually produces: up to 300
    // characters of the vendor's own body, spliced in verbatim.
    message: `Vendor answered 400: unknown key ${FAKE_KEY} for workspace`,
  });
  console.log(`[music-log] masked -> ${line}`);
  expect(line).not.toContain(FAKE_KEY);
  expect(line).toContain("[redacted]");
  // AND: this is the behavioural check that log.ts's locally-restated
  // MUSIC_KEY_VAR still matches the adapter's exported one. log.ts restates the
  // name to avoid an import cycle with elevenlabs.ts; if the two ever drift,
  // nothing would be scrubbed and this assertion is what notices.
});

test("log: a bare Bearer token is masked and the word `Bearer` survives (the ORDER rule)", () => {
  const masked = scrub("Bearer sk-live-abc123DEF456");
  console.log(`[music-log] scrub bare-bearer -> ${masked}`);
  expect(masked).toBe("Bearer [redacted]");
});

test("log: `xi-api-key: …` — the header this vendor actually uses — loses its value", () => {
  const masked = scrub("request failed with xi-api-key=sk_live_abc123 and https://u:p@eleven.example/v1");
  console.log(`[music-log] scrub xi-api-key -> ${masked}`);
  expect(masked).not.toContain("sk_live_abc123");
  expect(masked).toContain("[redacted]");
  expect(masked).toContain("//[redacted]@");
  expect(masked).toContain("eleven.example/v1");
});

test("log: one line means one line — newlines collapse and length is bounded", () => {
  const line = formatCall({
    ...base,
    kind: "bad-response",
    message: `first\nsecond\r\n\tthird ${"x".repeat(5000)}`,
  });
  console.log(`[music-log] bounded length=${line.length}`);
  expect(line.includes("\n")).toBe(false);
  expect(line.includes("\r")).toBe(false);
  expect(line.length).toBeLessThan(400);
  expect(line).toContain("…");
});
