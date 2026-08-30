// LANE — THE SETTLE LINE IS ASSERTED (dynamic).
//
// log.ts split the line-building out of the writing for one stated reason:
// "Separate from writing it so it can be asserted on." Nothing asserted on it.
// The whole server-side trace of the imaging engine — the only artefact that
// answers "it stopped working" — was a function with a comment promising
// testability and no test taking it up, so every rule the file's audit header
// commits to (a missing cost is never a zero; a credential never reaches a log;
// one line means one line) was enforced by nothing but the next reader's care.
//
// This probe drives the ACTUAL `formatCall` and `scrub` and pins the four
// promises the header makes:
//
//   · SHAPE — an `ok` line and an `err` line are distinguishable, and the error
//     line carries no `cost=` at all (a failed call has no priced outcome to
//     report, and printing $0.0000 for one would be the exact lie below);
//   · A MISSING NUMBER IS NEVER A ZERO — an unpriced success prints
//     `cost=unpriced`, never `cost=$0.0000`. An unpriced call is unpriced, not
//     free, and money read as zero is how a ceiling stops seeing spend;
//   · THE TRAIL IS NAMED FOR WHAT IT MEANS — the same list of eliminated vendors
//     prints as `rerouted=` on a success (someone was tried and lost) and
//     `tried=` on a failure (everyone was tried and nobody served);
//   · NO CREDENTIAL, NO SECOND LINE — a live key value, a Bearer token and URL
//     userinfo are masked wherever they appear in the message, and a message
//     with newlines or 5,000 characters still yields exactly one bounded line.
import { test, expect } from "@playwright/test";

import { keepEnv } from "./_helpers";
import { formatCall, scrub, type CallLog } from "@/lib/imaging/log";
import { KEY_VAR } from "@/lib/imaging/env";

/** A long-enough fake to clear log.ts's 8-character placeholder floor, so the
 *  scrubber treats it as a live secret rather than ignoring it. */
const FAKE_GOOGLE_KEY = "AIzaSyFAKEfakeFAKEfake0123456789abcd";

const base: CallLog = { cap: "generate", env: "prod", ms: 4210 };

keepEnv([KEY_VAR.google, KEY_VAR.leonardo, KEY_VAR.qwen]);

test.beforeEach(() => {
  delete process.env[KEY_VAR.google];
  delete process.env[KEY_VAR.leonardo];
  delete process.env[KEY_VAR.qwen];
});

test("log: a served call prints ok, its vendor, its model and its cost", () => {
  const line = formatCall({
    ...base,
    provider: "google",
    model: "gemini-3.1-flash-image",
    costUsd: 0.045,
  });
  console.log(`[log] ok line -> ${line}`);
  expect(line.startsWith("[imaging] generate ok ")).toBe(true);
  expect(line).toContain("provider=google");
  expect(line).toContain("model=gemini-3.1-flash-image");
  expect(line).toContain("ms=4210");
  expect(line).toContain("cost=$0.0450");
  expect(line).not.toContain("kind=");
});

test("log: an UNPRICED success says `unpriced` — a missing number is never a zero", () => {
  const line = formatCall({ ...base, provider: "leonardo", model: "lucid-origin" });
  console.log(`[log] unpriced line -> ${line}`);
  expect(line).toContain("cost=unpriced");
  // The defect this pins: a formatter that coalesced `costUsd ?? 0` would print
  // a call that MAY have cost real money as free, and the cheapest place for a
  // spend surface to start undercounting is a log line nobody checked.
  expect(line).not.toContain("$0.0000");
});

test("log: a failed call prints its kind and NO cost field at all", () => {
  const line = formatCall({
    ...base,
    ms: 2,
    kind: "no-key",
    provider: "google",
    message: "No API key for google.",
  });
  console.log(`[log] err line -> ${line}`);
  expect(line.startsWith("[imaging] generate err ")).toBe(true);
  expect(line).toContain("kind=no-key");
  expect(line).toContain("provider=google");
  // Not `cost=unpriced` and not `cost=$0.0000` — no cost claim is made at all,
  // because the call never produced a priced outcome to claim anything about.
  expect(line).not.toContain("cost=");
});

test("log: a success with no provider still prints a placeholder, never `undefined`", () => {
  const line = formatCall({ ...base, costUsd: 0 });
  console.log(`[log] provider-less ok -> ${line}`);
  expect(line).toContain("provider=-");
  expect(line).not.toContain("undefined");
  // A genuinely zero-cost call is a real zero and prints as one; only an ABSENT
  // figure is `unpriced`. The two are different claims and stay different.
  expect(line).toContain("cost=$0.0000");
});

test("log: the same trail is `rerouted=` on a success and `tried=` on a failure", () => {
  const tried = [
    { provider: "qwen", why: "rate-limited" },
    { provider: "leonardo", why: "no-key" },
  ] as const;

  const ok = formatCall({ ...base, provider: "google", model: "m", costUsd: 0.045, tried });
  const err = formatCall({ ...base, kind: "no-key", tried });
  console.log(`[log] trail ok -> ${ok}`);
  console.log(`[log] trail err -> ${err}`);

  expect(ok).toContain("rerouted=qwen:rate-limited,leonardo:no-key");
  expect(ok).not.toContain("tried=");
  expect(err).toContain("tried=qwen:rate-limited,leonardo:no-key");
  expect(err).not.toContain("rerouted=");
});

test("log: the caller's steer is carried onto the line", () => {
  const line = formatCall({
    ...base,
    provider: "google",
    costUsd: 0.045,
    steer: { prefer: "google", avoid: "qwen" },
  });
  console.log(`[log] steer line -> ${line}`);
  expect(line).toContain("prefer=google");
  expect(line).toContain("avoid=qwen");
});

test("log: a LIVE key value is masked wherever the vendor echoed it back", () => {
  process.env[KEY_VAR.google] = FAKE_GOOGLE_KEY;
  const line = formatCall({
    ...base,
    kind: "failed",
    // The shape providers/google.ts:130 actually produces: the vendor's own
    // sentence, spliced in verbatim, carrying whatever the vendor chose to quote.
    message: `google rejected the request for key ${FAKE_GOOGLE_KEY} at line 3`,
  });
  console.log(`[log] masked line -> ${line}`);
  expect(line).not.toContain(FAKE_GOOGLE_KEY);
  expect(line).toContain("[redacted]");
});

test("log: a bare Bearer token is masked and the word `Bearer` survives (the ORDER rule)", () => {
  // Nothing is in env here, so this is the pattern pass rather than the value
  // pass — the backstop that catches a credential arriving by a route
  // `liveSecrets()` cannot enumerate.
  //
  // scrub()'s comment states the invariant this pins: the `Bearer …` rule must
  // run BEFORE the key/value rule, "or the key/value rule masks the word
  // 'Bearer' and leaves the token standing after it". With the correct order a
  // bare header keeps its scheme and loses only its credential.
  const masked = scrub("Bearer sk-live-abc123DEF456");
  console.log(`[log] scrub bare-bearer -> ${masked}`);
  expect(masked).toBe("Bearer [redacted]");
});

test("log: `authorization: Bearer …` loses the token to whichever rule reaches it", () => {
  // The full header form matches BOTH rules, and the token is destroyed twice
  // over. Which mask lands where is not the contract; that no credential
  // survives is. Asserting the exact rendering here would pin an accident.
  const masked = scrub("authorization: Bearer sk-live-abc123DEF456 and https://u:p@qwen.example/v1");
  console.log(`[log] scrub full-header -> ${masked}`);
  expect(masked).not.toContain("sk-live-abc123DEF456");
  expect(masked).toContain("[redacted]");
  // URL userinfo is the QWEN_BASE_URL case: an operator-supplied base URL is
  // the one URL this engine does not build itself.
  expect(masked).toContain("//[redacted]@");
  expect(masked).toContain("qwen.example/v1");
});

test("log: one line means one line — newlines collapse and length is bounded", () => {
  const line = formatCall({
    ...base,
    kind: "bad-response",
    message: `first\nsecond\r\n\tthird ${"x".repeat(5000)}`,
  });
  console.log(`[log] bounded line length=${line.length}`);
  expect(line.includes("\n")).toBe(false);
  expect(line.includes("\r")).toBe(false);
  // oneLine's 240-char cap on the message, plus the fixed fields ahead of it.
  expect(line.length).toBeLessThan(400);
  expect(line).toContain("…");
});
