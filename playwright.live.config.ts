import { defineConfig, devices } from "@playwright/test";

// ==============================================================================
// THE LIVE LANE — the assembled product, in a real browser.
//
// `playwright.config.ts` is the fast Node lane; this is the slow one. It starts
// Next's own dev server, drives a real Chromium against it, and reads Chrome's
// own IndexedDB. It exists because a handful of this repo's promises are only
// visible in the running product, and it stays small because everything else is
// cheaper one rung down. The population rule it holds itself to is written at
// the top of tests/live/golden-path.live.spec.ts.
//
// It replaces nine `pipeline/drive-*.mjs` scripts that each opened with a comment
// telling a human to start a server first, invented their own pass/fail
// vocabulary, and reported nothing when the human had not.
// ==============================================================================

/**
 * THE LANE'S PORT — deliberately NOT 3000, and not any port already spoken for.
 *
 * 3000 is where a developer's own `npm run dev` lives. A harness that binds it
 * either fails to start or, far worse, attaches to whatever was already
 * listening and reports on a build nobody chose. 3182/3183/3184 belong to the
 * drive scripts, the /uat overlay and the gauntlet.
 *
 * Overridable for a local debugging session; the only thing that must stay true
 * is that it is not the default one.
 */
const PORT = Number(process.env.LIVE_PORT ?? 3187);
/**
 * `localhost`, NOT `127.0.0.1`, and this is load-bearing.
 *
 * MEASURED 2026-08-24, on this lane's first run. Next 16's dev server refuses
 * cross-origin dev requests: driven at `http://127.0.0.1:3187` it serves the
 * document with HTTP 200 and then answers every `_next/` chunk with 403, so the
 * page renders its server-side shell, never hydrates, and sits on
 * "checking session…" for ever. The failure looks exactly like a broken auth
 * bypass — the harness reported "no control surface on window" — and nothing in
 * it points at the host name. Only the two spellings differ.
 */
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Its own build directory, so it has its own lock.
 *
 * A second `next dev` in one project refuses to start while the first holds the
 * lock inside the build directory — see next.config.ts, which reads
 * NEXT_DIST_DIR for exactly this. Without it, running this lane would mean
 * closing your own dev server first, and a gate you have to make room for is a
 * gate that stops being run.
 */
const DIST = ".next-live";

export default defineConfig({
  testDir: "./tests/live",
  reporter: [["list"]],

  // ── THE SERIAL LAW ────────────────────────────────────────────────────────
  // A stated property with its reason, not a default: the product under test is
  // a SINGLETON. One dev server on one port means one browser origin, which
  // means ONE IndexedDB database shared by every test in the lane. Two workers
  // would be two tabs racing the same four object stores, and the account reset
  // each test opens with would empty the database out from under the other
  // worker mid-journey.
  //
  // The corollary: independence comes from STATE RESET BETWEEN TESTS, not from
  // parallel isolation, because there is no parallel. That reset is
  // `freshShelf()` in the spec, which empties the account through the product's
  // own eviction owner rather than through a teardown that could drift from it.
  fullyParallel: false,
  workers: 1,

  // No retries. A lane whose green depends on a second attempt is a lane whose
  // verdict nobody can read; a flaky journey here is a finding about the product
  // or about this harness, and it is meant to be looked at rather than absorbed.
  retries: 0,

  timeout: 120_000,
  expect: { timeout: 20_000 },

  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
    // Kept for failures, discarded for passes: a lane this slow must be
    // diagnosable without re-running it, and must not fill a disk when green.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  // ── THE LAUNCHER ──────────────────────────────────────────────────────────
  // Playwright owns the child it spawns here: it records THAT process's id,
  // waits for the URL to answer, and on exit tears down that process tree and
  // nothing else. No `taskkill /IM node.exe` and no port sweep — a harness that
  // kills by process NAME takes the developer's own editor server with it.
  //
  // `next dev`, not `next start`, ON PURPOSE. The auth bypass and the harness
  // control surface are both compiled out of a production build (lib/devAuth.ts,
  // components/ui/HarnessBridge.tsx). A production server is therefore a server
  // this lane cannot drive — the guarantee working, not a limitation to route
  // around.
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: BASE_URL,
    // Never attach to something already listening: see the port note above. A
    // stale process must not be able to green a run.
    reuseExistingServer: false,
    // A cold `.next-live` compiles from nothing on the first run.
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      // THE INHERITED ENVIRONMENT IS SPREAD IN EXPLICITLY, and that is not
      // belt-and-braces. MEASURED 2026-08-24: with only the two variables below,
      // `next dev` starts, prints "Ready", answers every request — and answers
      // ALL of them 404, including `/`, which resolves perfectly from the same
      // directory a second later by hand. A Windows child process without
      // SystemRoot / TEMP / APPDATA is not a process that fails loudly; it is
      // one that half-works. The whole readiness poll timed out against a server
      // that was up.
      ...(process.env as Record<string, string>),
      // THE BYPASS, explicitly. Both of lib/devAuth.ts's gates must hold: this
      // is the opt-in half, and `next dev` is the non-production half.
      NEXT_PUBLIC_DEV_AUTH: "1",
      NEXT_DIST_DIR: DIST,
    },
  },
});
