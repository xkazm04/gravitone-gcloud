import { defineConfig } from "@playwright/test";

// ==============================================================================
// THE NODE LANE — golden-path DYNAMIC verification probes.
//
// These are Node-context probes (no browser, no webServer) that import the
// repo's ACTUAL modules/components and assert BEHAVIOR, not pattern.
//
// ONE REAL CONFIG PER SUITE. The browser lane is `playwright.live.config.ts` and
// it is a separate file rather than a second `project` in this one, because a
// browser lane needs a `webServer` and `webServer` is config-wide: folding the
// two together would start a Next dev server every time somebody ran the fast
// probes. Membership is by LOCATION in both — `tests/golden-path/` here,
// `tests/live/` there — so a file in the wrong directory runs in the wrong lane
// and `git status` shows it.
// ==============================================================================
export default defineConfig({
  testDir: "./tests/golden-path",

  // SERIAL, WITH THE REASON ATTACHED — a stated property, not caution, so nobody
  // "optimises" it into parallel flake. These probes MUTATE `process.env`
  // (imaging-auth deletes NEXT_PUBLIC_DEV_AUTH, imaging-budget sets the ceiling,
  // firebase-absent-env empties the config) and they share one Node process. A
  // parallel run would let one probe's environment decide another probe's
  // verdict, and the loser would be whichever one happened to read first.
  //
  // The corollary: independence here comes from state reset inside each probe,
  // never from worker isolation, because there is no worker isolation.
  fullyParallel: false,

  // ONE `test.only` REDUCES THIS GATE TO ONE TEST, AND IT EXITS 0.
  //
  // Measured 2026-08-29: adding `.only` to a single case in
  // sort-stability.probe.spec.ts took `npm test` from 317 passed to "1 passed",
  // exit 0 — green in gates.yml, green in the pre-push hook, and the 316 probes
  // that guard money, auth, SSRF and the identity wipe did not run. Playwright's
  // default for `forbidOnly` is false, so nothing in the repo objected.
  //
  // That is precisely the failure this lane already has a probe about:
  // gate-vacuous-pass.probe.spec.ts opens with "a check that examined nothing
  // must not count as enforcement". The runner had the same hole as the code it
  // was written to guard.
  //
  // Gated on CI rather than set outright, because `.only` is a legitimate local
  // tool while iterating and CI is where this repo says the refusal lives
  // (gates.yml: "a check that runs only locally is a courtesy, not a gate"). The
  // residual gap is stated rather than hidden: a `.only` committed by mistake
  // still passes the pre-push hook, and is refused by CI before it reaches main.
  forbidOnly: !!process.env.CI,

  reporter: [["list"]],
  projects: [{ name: "node", use: {} }],
});
