// THE CONTROL SURFACE'S VOCABULARY — one module, imported by BOTH sides.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A DOOR AT ALL. Nine `pipeline/drive-*.mjs` scripts drove this app in a
// real browser with no designed way in: each one re-derived "wait 2500ms and
// hope the shelf seeded", each one reset state by not resetting it, and none of
// them could ask the product what it thought was true. That is the improvised
// door the registry's live-app-harness technique names, and this module is the
// designed one.
//
// WHY IT IS IN THE PAGE RATHER THAN ON A PORT. The technique's canonical form is
// a test-only endpoint listening on a local port. That form does not fit here
// and saying why is part of the design: every piece of state this harness has to
// reset or read — projects, steps, themes, assets, the job tray — lives in the
// BROWSER (IndexedDB and localStorage, see lib/studioDb.ts), scoped to the
// origin. A server-side port cannot see any of it. So the control surface is an
// object installed on `window` by a component inside the auth provider, which is
// the only vantage point that can reach both the stores and the product's own
// idea of who is signed in.
//
// WHY THIS MODULE HAS NO RUNTIME. Everything below is a `type` or an
// `interface`. TypeScript erases the whole file, so it emits NOTHING into any
// bundle — which is what lets `pipeline/check-bundle.mjs` hunt the control
// surface's fingerprints in production browser output and expect zero hits. The
// key is written as a string LITERAL at both call sites rather than exported as
// a const from here, deliberately: NOTES.md (2026-08-12) measured that the
// minifier keeps exported consts, so an exported key would ship as dead data and
// weaken exactly the assertion this design is built to make.
//
// TYPED ON BOTH SIDES. The product implements `HarnessControl`
// (components/ui/HarnessBridge.tsx); the harness client consumes it
// (tests/live/_control.ts). One interface, both directions, so a command that
// changes shape breaks `tsc --noEmit` rather than decaying into stringly
// folklore.
// ─────────────────────────────────────────────────────────────────────────────

import type { PhaseKey, PhaseState } from "@/lib/projects";

/** Bumped when a command changes shape. The client asserts it on connect, so a
 *  harness running against an older build fails with "protocol 1, expected 2"
 *  rather than with a mystery `undefined is not a function`. */
export type HarnessProtocol = 1;

/** One project as the SHELF knows it — the same fields /projects renders from,
 *  so a disagreement between this readback and the DOM is a real finding. */
export interface ProjectRow {
  id: string;
  title: string;
  phase: PhaseKey;
  progress: Record<PhaseKey, PhaseState>;
}

/** The product's own view of the signed-in account. Product-level, not
 *  pixel-level: it answers "what does the app think exists", never "what is on
 *  screen". */
export interface AccountSnapshot {
  protocol: HarnessProtocol;
  /** The uid the auth provider is currently holding — `null` while it resolves
   *  or when nobody is signed in. A harness that reads a snapshot with a null
   *  uid has raced the gate and must wait, not assert. */
  uid: string | null;
  projects: ProjectRow[];
  /** Visual identities on the shelf; the create-a-project gate reads this. */
  themes: number;
  /** THE READ-BACK FOR FIRE-AND-FORGET. Research and follow-up runs dispatch
   *  into the job store and land asynchronously (lib/jobs.tsx). The harness
   *  polls this rather than treating "no error" as success. */
  jobs: { running: number; total: number };
}

/** What one project has actually PERSISTED — the claim only a real browser can
 *  witness, since the Node probes run against fake-indexeddb. */
export interface ProjectReadback {
  id: string;
  found: boolean;
  /** Step records in the steps store for this project. */
  steps: number;
  /** Which phases wrote one. */
  phases: string[];
}

/** What `reset` removed. Counts, so a reset that silently did nothing is
 *  distinguishable from one that emptied a full account. */
export interface ResetOutcome {
  uid: string;
  projects: number;
  steps: number;
  themes: number;
  assets: number;
  local: number;
  failed: boolean;
}

/**
 * The command vocabulary. THREE commands, all product-level.
 *
 * The population is small on purpose: every command is a piece of product
 * surface the harness can drift against, so the door stays narrow and the
 * journeys do their work through the UI like a user does.
 */
export interface HarnessControl {
  readonly protocol: HarnessProtocol;
  /** "What does the app think this account holds?" */
  snapshot(): Promise<AccountSnapshot>;
  /** "What did this project actually write to disk?" */
  project(projectId: string): Promise<ProjectReadback>;
  /**
   * "Start this account from nothing."
   *
   * Delegates to `evictIdentity` — the product's OWN one-owner wipe across the
   * four stores plus the seeded flags and the job tray (lib/identityEviction.ts)
   * — rather than reimplementing a teardown that would drift from it. State
   * reset between tests is how independence is bought in a serial lane; see the
   * isolation-lanes technique.
   */
  reset(): Promise<ResetOutcome>;
}

declare global {
  interface Window {
    /** Present ONLY in a non-production build with NEXT_PUBLIC_DEV_AUTH=1.
     *  See components/ui/HarnessBridge.tsx for the two guards and
     *  pipeline/check-bundle.mjs for the gate that holds them. */
    __gravitoneHarness?: HarnessControl;
  }
}
