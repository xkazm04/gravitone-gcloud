// LANE — THE TEST SEAMS' OFF-STATE (dynamic, source-coupled).
//
// Registry: test-harness / live-app-harness ("the production build provably
// does not contain it"), quality-gates / gate-sees-target.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS GUARDS. Three seams exist in this repository so the gated product
// can be driven at all:
//
//   · lib/devAuth.ts — signs a fixture account in without Google.
//   · components/ui/HarnessBridge.tsx — installs the live harness's control
//     surface on `window`.
//   · lib/apiAuth.ts `devOpen()` — lets a request with NO secret through the
//     money routes' guard, so test automation can drive /api/imaging/* and
//     /api/frames without a configured secret.
//
// All three are gated on the SAME two conditions, and none may ever be reachable
// in a shipped build. The third was not in this file until 2026-09-06: the header
// said "two seams", the truth table below evaluated two, and the one that opens
// the routes that SPEND was a third copy of the rule nobody was evaluating. The half of that which can be proved from the emitted
// bundle is proved there (pipeline/check-bundle.mjs, after `npm run build`,
// which is where absence is a fact rather than a reading). This probe holds the
// half that a bundle cannot show: that the two seams still state the same gate,
// and that the harness states it in the form the bundler can actually fold.
//
// WHY IT READS SOURCE. The gate is a BUILD-TIME switch: `process.env.NODE_ENV`
// is inlined by webpack, so from inside a running Node process there is no way
// to exercise the production branch — importing the module under a mutated
// NODE_ENV tests Node's semantics, not the bundler's. What CAN be checked
// exactly is the expression itself, and this probe evaluates the real one, read
// out of the real file, against a full truth table. That is the same shape as
// the DAL probe's string-coupling assertion (dal-real-engine.probe.spec.ts): the
// coupling is real, invisible to any reference search, and silent when broken.
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { stripComments } from "./_helpers";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const DEV_AUTH_TS = "lib/devAuth.ts";
const BRIDGE_TSX = "components/ui/HarnessBridge.tsx";
const PROTOCOL_TS = "lib/harness/protocol.ts";
const API_AUTH_TS = "lib/apiAuth.ts";

/** The env shapes a gate can meet. `undefined` is a variable that is simply not
 *  set, which is the ordinary `next dev` case and must be OFF. */
type Env = { NODE_ENV?: string; NEXT_PUBLIC_DEV_AUTH?: string };

const TRUTH_TABLE: Array<[Env, boolean, string]> = [
  [{ NODE_ENV: "production", NEXT_PUBLIC_DEV_AUTH: "1" }, false, "the flag set on a PRODUCTION build"],
  [{ NODE_ENV: "production" }, false, "a production build with no flag"],
  [{ NODE_ENV: "development" }, false, "an ordinary `next dev` with no flag"],
  [{ NODE_ENV: "development", NEXT_PUBLIC_DEV_AUTH: "0" }, false, "the flag set to something other than 1"],
  [{ NODE_ENV: "development", NEXT_PUBLIC_DEV_AUTH: "1" }, true, "the one combination that opens it"],
  [{ NODE_ENV: "test", NEXT_PUBLIC_DEV_AUTH: "1" }, true, "a non-production build with the flag"],
];

/** The REAL expression, read out of the real file and evaluated against a
 *  supplied environment. Not a copy of it — a copy is what the defect would
 *  look like. */
function gateFrom(file: string, pattern: RegExp, what: string): (env: Env) => unknown {
  const m = read(file).match(pattern);
  expect(
    m,
    `could not find the ${what} expression in ${file}. If it was renamed or ` +
      "reshaped, this probe is no longer reading the gate and its pass is manufactured.",
  ).not.toBeNull();
  const expr = m![1];
  return (env: Env): unknown => new Function("process", `return (${expr});`)({ env }) as unknown;
}

test("the auth bypass is off in every environment but the one", () => {
  // `\r?` — this repo is maintained from Windows (see gates.yml's install
  // footgun), where core.autocrlf checks the tree out CRLF. The gate expression
  // is the same bytes either way; a probe that can only read it on an LF
  // checkout fails the local `npm run verify` while CI stays green.
  const gate = gateFrom(DEV_AUTH_TS, /export const DEV_AUTH\s*=\s*([\s\S]*?);\r?\n/, "DEV_AUTH");
  for (const [env, want, why] of TRUTH_TABLE) {
    expect(Boolean(gate(env)), `${why}: DEV_AUTH should be ${want}`).toBe(want);
  }
});

test("the API guard's no-secret door states the same gate, and folds shut in every environment but the one", () => {
  // `devOpen()` is the door `guardRequest` opens when NO secret is presented —
  // the one that lets `npm run test:live` drive /api/imaging/* and /api/frames
  // without a configured secret. It is a THIRD copy of the two-condition rule,
  // in a file the two seams above never mention, and a third copy is exactly
  // the shape a fix reaches two of. Same truth table, same real expression.
  const gate = gateFrom(API_AUTH_TS, /function devOpen\(\)[^{]*\{\s*return\s+([\s\S]*?);\r?\n/, "devOpen");
  for (const [env, want, why] of TRUTH_TABLE) {
    expect(Boolean(gate(env)), `${why}: devOpen() should be ${want}`).toBe(want);
  }
});

test("the harness control surface states the same gate, in the form the bundler folds", () => {
  const bridge = read(BRIDGE_TSX);

  // 1. THE GUARDS ARE WRITTEN INLINE, not through the imported DEV_AUTH const.
  //    This is the whole reason the surface can be dropped from a production
  //    bundle: webpack inlines `process.env.NODE_ENV` and the minifier then
  //    removes an unreachable function body, which it does NOT reliably do for
  //    a constant imported from another module. NOTES.md measured exactly that
  //    on devAuth's own exported fixture, which still ships as dead data.
  const prodGuard = bridge.indexOf('process.env.NODE_ENV === "production"');
  const flagGuard = bridge.indexOf('process.env.NEXT_PUBLIC_DEV_AUTH !== "1"');
  expect(prodGuard, "HarnessBridge lost its inline production guard").toBeGreaterThan(-1);
  expect(flagGuard, "HarnessBridge lost its inline opt-in guard").toBeGreaterThan(-1);
  expect(
    /import\s*\{[^}]*\bDEV_AUTH\b[^}]*\}\s*from/.test(bridge),
    "HarnessBridge must NOT gate on the imported DEV_AUTH constant — a cross-module " +
      "constant is not something the minifier reliably folds, and the control surface " +
      "would then ship as reachable code.",
  ).toBe(false);

  // 2. BOTH GUARDS COME BEFORE THE INSTALL. A guard after the assignment is a
  //    guard that has already lost.
  const install = bridge.indexOf("window.__gravitoneHarness =");
  expect(install, "HarnessBridge no longer installs a control surface").toBeGreaterThan(-1);
  expect(prodGuard, "the production guard must precede the install").toBeLessThan(install);
  expect(flagGuard, "the opt-in guard must precede the install").toBeLessThan(install);

  // 3. ONE INSTALL SITE. Two would mean one of them is unguarded sooner or later.
  expect(bridge.split("window.__gravitoneHarness =").length - 1).toBe(1);
});

test("the harness protocol module emits nothing into any bundle", () => {
  const protocol = read(PROTOCOL_TS);

  // The bundle gate in pipeline/check-bundle.mjs hunts the control surface's
  // fingerprints in production browser output and expects zero hits. That only
  // means something while the vocabulary itself is types-only: a `const` here
  // would be an exported constant, and NOTES.md (2026-08-12) measured that the
  // minifier keeps those — the key would then ship as dead data and the gate's
  // clean verdict would be about a string the product no longer uses.
  // `\w+` alone matched `const`, `function`, `enum`, `default` - and let two
  // shapes through that ship runtime code just as surely: `export { x } from`
  // and `export * from`, either of which re-exports whatever the far module
  // holds. Both are matched now; `export type { X }` stays allowed.
  const runtimeExports = stripComments(protocol).match(/^export\s+(?!type\b|interface\b)(?:\w+|\{|\*)/gm) ?? [];
  expect(
    runtimeExports,
    `${PROTOCOL_TS} must stay types-only; a runtime export here ships the harness ` +
      "vocabulary into the production bundle and blunts pipeline/check-bundle.mjs.",
  ).toEqual([]);
});
