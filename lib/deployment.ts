// CAN THIS PROCESS SPAWN A LOCAL BINARY? — one predicate, one place.
//
// WHY THIS FILE EXISTS AND WHY IT IS NOT INSIDE lib/text/.
//
// This app has two engines for the same job. `lib/text/providers/claudeCli.ts`
// spawns the machine's `claude` binary and bills the operator's logged-in seat;
// `lib/text/providers/google.ts` calls a metered HTTP endpoint. The first one
// CANNOT EXIST on a managed platform — Cloud Run gives you a container with no
// `claude` in it and no interactive login to authorise it — and that single fact
// is what decides the whole local-first / SaaS split this app is being shaped
// for.
//
// The question "is the local transport usable here?" therefore gets asked from
// more than one place: the router asks it to build a chain, a diagnostics
// surface asks it to explain itself, and a future feature will ask it again. The
// registry's agent-cli-transport/fallback-ladder technique names exactly this
// failure — "one copy in the scoring path, another in a side feature added
// later. The copies then drift" — and prescribes the fix: write the predicate
// once, import it everywhere, and let inner seams re-use it as defence in depth
// rather than re-deriving it. So it lives ABOVE lib/text/, in lib/, because the
// answer is a property of the DEPLOYMENT, not of the text engine. When the video
// seam promotes the local ComfyUI rig to a provider (docs/video-generation-plan.md,
// decision 1) it asks this same function, not a second copy of it.
//
// WHAT IT DOES NOT DO. It does not probe for the binary. "Is a local binary
// possible here" and "is `claude` installed and logged in" are different
// questions with different answers and different remedies, and collapsing them
// is how an offline policy flag gets deleted by someone fixing a "binary
// missing" report. The probe lives in the adapter; the posture lives here.
//
// SERVER ONLY. It reads process.env and is meaningless in a browser.

/** Why the local transport is or is not available. Carried into the router's
 *  descent record so a fleet that quietly lives on the cloud rung is
 *  diagnosable from its reasons rather than from a hunch. */
export type LocalPosture =
  /** A normal machine. Spawning is allowed; whether the binary is there is the
   *  adapter's probe to answer. */
  | "available"
  /** An operator or a deployment config said no, on a machine that could have.
   *  Distinct from `managed-platform` on purpose: the remedy is a flag, not a
   *  migration, and reporting this as "binary missing" sends someone to install
   *  a binary that was never the problem. */
  | "policy-forbidden"
  /** A managed serverless platform. There is no binary and no login, and no
   *  amount of configuration changes that. */
  | "managed-platform";

/**
 * Environment fingerprints of platforms that run this app as a container and
 * cannot host an interactive CLI login.
 *
 * Each is the platform's own documented, always-present marker — not a guess:
 *   · K_SERVICE / K_REVISION      Cloud Run services (the SaaS target)
 *   · CLOUD_RUN_JOB               Cloud Run jobs
 *   · GAE_ENV                     App Engine standard/flex
 *   · FUNCTION_TARGET             Cloud Functions gen2
 *   · VERCEL                      Vercel (the other plausible host for a Next app)
 *   · AWS_LAMBDA_FUNCTION_NAME    Lambda, incl. Amplify/SST wrappers
 *
 * A false POSITIVE here costs a working local engine on a machine that had one,
 * so the list is deliberately narrow and made of variables nobody sets by hand.
 * A false NEGATIVE costs nothing: the adapter's probe fails to find `claude` and
 * the ladder descends one rung with an honest reason.
 */
const MANAGED_MARKERS = [
  "K_SERVICE",
  "K_REVISION",
  "CLOUD_RUN_JOB",
  "GAE_ENV",
  "FUNCTION_TARGET",
  "VERCEL",
  "AWS_LAMBDA_FUNCTION_NAME",
] as const;

/**
 * The posture, computed per call rather than captured at module load.
 *
 * Per call for the same reason lib/imaging/env.ts reads keys lazily: a module
 * that booted before the environment was complete would otherwise hold a stale
 * answer for the life of the process. The computation is a handful of string
 * lookups; there is nothing to cache that would be worth the staleness.
 *
 * `LOCAL_BINARIES` is the operator's override and it is honoured in BOTH
 * directions:
 *   · `off` — forbid spawning on a machine that could. The knob a local-first
 *     install uses to rehearse the SaaS posture before deploying it, and the one
 *     an operator uses to stop the app spending their Claude seat.
 *   · `on`  — allow it despite a managed marker. The escape hatch for a
 *     self-managed container that genuinely does carry the binary and a
 *     credential (a long-running VM image, a dev box behind a marker set for an
 *     unrelated reason). It is an override of a HEURISTIC, so it is allowed to
 *     win — but it cannot conjure a binary, and the probe still has to pass.
 */
export function localPosture(): LocalPosture {
  const override = process.env.LOCAL_BINARIES?.trim().toLowerCase();
  if (override === "off") return "policy-forbidden";
  if (override === "on") return "available";
  return MANAGED_MARKERS.some((m) => process.env[m]) ? "managed-platform" : "available";
}

/** The predicate itself. Import this; never re-derive it. */
export function canSpawnLocalBinaries(): boolean {
  return localPosture() === "available";
}

/** A sentence for a log line, a descent record, or an error message — written
 *  once so two surfaces cannot describe the same posture differently. */
export function describePosture(p: LocalPosture = localPosture()): string {
  switch (p) {
    case "available":
      return "this machine may spawn local binaries";
    case "policy-forbidden":
      return "LOCAL_BINARIES=off forbids spawning a local binary on this machine";
    case "managed-platform":
      return "this is a managed serverless platform, which has no local binary and no interactive login";
  }
}
