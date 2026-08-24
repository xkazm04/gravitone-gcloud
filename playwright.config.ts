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

  reporter: [["list"]],
  projects: [{ name: "node", use: {} }],
});
